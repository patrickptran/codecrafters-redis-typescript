import * as net from "net";
import {
  encodeSimpleString,
  encodeError,
  encodeBulkString,
} from "./utils/parser";

import { StringCommands } from "./commands/string-commands";
import { ListCommands } from "./commands/list-commands";
import { StreamCommands } from "./commands/stream-commands";
import { TransactionsCommands } from "./commands/transaction-commands";
import { WatchCommands } from "./commands/watch-commands";
import { ReplicationManager } from "./commands/replication-manager";

import type { MapEntry, ServerConfig } from "./types";
import { DEFAULT_SERVER_CONFIG } from "./config/server-config";

export class RedisCommand {
  private mapping: Map<string, MapEntry>;
  private stringCommands: StringCommands;
  private listCommands: ListCommands;
  private streamCommands: StreamCommands;
  private transactionCommands: TransactionsCommands;
  private watchCommands: WatchCommands;
  private replicationManager: ReplicationManager;

  constructor(config: ServerConfig = DEFAULT_SERVER_CONFIG) {
    this.mapping = new Map<string, MapEntry>();
    this.stringCommands = new StringCommands(this.mapping);
    this.listCommands = new ListCommands(this.mapping);
    this.streamCommands = new StreamCommands(this.mapping);
    this.transactionCommands = new TransactionsCommands(this.mapping);
    this.replicationManager = new ReplicationManager(config);
    this.watchCommands = new WatchCommands();
  }

  async executedCommand(
    cmd: string,
    args: string[],
    webSocket: net.Socket,
  ): Promise<void> {
    let res: string;

    if (this.shouldQueue(cmd, webSocket)) {
      res = this.transactionCommands.enqueueCommand(cmd, args, webSocket);
      webSocket.write(res);
      return;
    }

    switch (cmd.toUpperCase()) {
      // the common command
      case "PING":
        res = this.handlePing();
        break;
      case "ECHO":
        res = this.handleEcho(args);
        break;
      case "TYPE":
        res = this.handleType(args);
        break;

      // the string commands
      case "SET":
        res = this.stringCommands.handleSet(args);
        this.watchCommands.markKeyAsModified(args[0], webSocket);
        break;
      case "GET":
        res = this.stringCommands.handleGet(args);
        break;
      case "INCR":
        res = this.stringCommands.handleIncr(args);
        this.watchCommands.markKeyAsModified(args[0], webSocket);
        break;

      // the list commands
      case "RPUSH":
        res = this.listCommands.handleRpush(args);
        this.watchCommands.markKeyAsModified(args[0], webSocket);
        // this.watchCommands.markKeyAsModified(args[0], webSocket);
        break;
      case "LRANGE":
        res = this.listCommands.handleLRange(args);
        break;
      case "LPUSH":
        res = this.listCommands.handleLPush(args);
        this.watchCommands.markKeyAsModified(args[0], webSocket);
        break;
      case "LLEN":
        res = this.listCommands.handleLLen(args);
        break;
      case "LPOP":
        res = this.listCommands.handleLPop(args);
        this.watchCommands.markKeyAsModified(args[0], webSocket);
        break;
      case "BLPOP":
        this.listCommands.handleBLPop(args, webSocket);
        if (args.length > 0) {
          this.watchCommands.markKeyAsModified(args[0], webSocket);
        }
        return;

      // the stream commands
      case "XADD":
        res = this.streamCommands.handleXAdd(args);
        this.watchCommands.markKeyAsModified(args[0], webSocket);
        break;
      case "XRANGE":
        res = this.streamCommands.handleXRange(args);
        break;
      case "XREAD":
        res = await this.streamCommands.handleXRead(args);
        break;

      // transaction commands
      case "MULTI":
        res = this.transactionCommands.handleMulti(args, webSocket);
        break;
      case "EXEC":
        res = this.transactionCommands.handleExec(
          args,
          webSocket,
          (command: string, cmdArgs: string[]) =>
            this.executeCommand(command, cmdArgs, webSocket),
          this.watchCommands,
        );
        break;
      case "DISCARD":
        res = this.handleDiscard(args, webSocket);
        break;

      // Optimistic Locking
      case "WATCH":
        res = this.handleWatch(args, webSocket);
        break;
      case "UNWATCH":
        res = this.handleUnWatch(webSocket);
        break;

      case "INFO":
        res = this.handleInfo(args);
        break;

      default:
        res = encodeError(`ERR unknow command ${cmd}`);
    }

    webSocket.write(res);
  }

  private handlePing(): string {
    return encodeSimpleString("PONG");
  }
  private handleEcho(args: string[]): string {
    if (args.length !== 1) {
      return encodeError("ERR wrong number of arguments for ECHO command");
    }

    return encodeBulkString(args[0]);
  }

  private handleType(args: string[]): string {
    if (args.length !== 1) {
      return encodeError("ERR wrong number of arguments for 'TYPE' command");
    }
    const entry = this.mapping.get(args[0]);
    if (!entry) {
      return encodeSimpleString("none");
    }

    if (entry.type === "stream") {
      return encodeSimpleString("stream");
    }

    if (Array.isArray(entry.value)) {
      return encodeSimpleString("list");
    }
    return encodeSimpleString("string");
  }

  private handleDiscard(args: string[], webSocket: net.Socket): string {
    if (args.length !== 0) {
      return encodeError("ERR wrong number of arguments for 'DISCARD' command");
    }

    const connectionId = this.transactionCommands.getConnectionId(webSocket);

    const isInTransaction = this.transactionCommands.isInTransaction(webSocket);

    if (!isInTransaction) {
      return encodeError("ERR DISCARD without MULTI");
    }

    this.transactionCommands.clearQueue(connectionId);
    this.watchCommands.clearWatchState(webSocket);
    return encodeSimpleString("OK");
  }

  private handleWatch(args: string[], webSocket: net.Socket): string {
    if (args.length === 0) {
      return encodeError("ERR wrong number of arguments for 'WATCH' command");
    }
    const isInTransaction = this.transactionCommands.isInTransaction(webSocket);
    if (isInTransaction) {
      return encodeError("ERR WATCH inside MULTI is not allowed");
    }

    // Add keys to watch list
    this.watchCommands.watchKeys(args, webSocket);
    return encodeSimpleString("OK");
  }

  private handleUnWatch(webSocket: net.Socket): string {
    // UNWATCH takes no arguments and clears all watched keys and dirty state
    this.watchCommands.clearWatchState(webSocket);
    return encodeSimpleString("OK");
  }

  private handleInfo(args: string[]): string {
    const isReplica =
      args.length === 1 && args[0].toLowerCase() === "replication";

    if (isReplica) {
      return this.buildReplicaionInfo();
    }
    return encodeBulkString("");
  }

  private buildReplicaionInfo(): string {
    const fields: Record<string, any> =
      this.replicationManager.getReplicaionInfo();

    const info = Object.entries(fields)
      .map(([key, value]) => `${key}:${value}`)
      .join("\r\n");

    return encodeBulkString(info);
  }

  // ========================== REPLICATION HANDSHAKE =============================
  public async initiateReplicationHandshake(): Promise<void> {
    return this.replicationManager.initiateHandShake();
  }

  public getReplicationManager(): ReplicationManager {
    return this.replicationManager;
  }

  private executeCommand(
    cmd: string,
    args: string[],
    webSocket: net.Socket,
  ): string {
    let res: string;

    switch (cmd.toUpperCase()) {
      case "PING":
        res = this.handlePing();
        break;
      case "ECHO":
        res = this.handleEcho(args);
        break;
      case "TYPE":
        res = this.handleType(args);
        break;
      case "SET":
        res = this.stringCommands.handleSet(args);
        this.watchCommands.markKeyAsModified(args[0], webSocket);
        break;
      case "GET":
        res = this.stringCommands.handleGet(args);
        break;
      case "INCR":
        res = this.stringCommands.handleIncr(args);
        this.watchCommands.markKeyAsModified(args[0], webSocket);
        break;
      case "RPUSH":
        res = this.listCommands.handleRpush(args);
        this.watchCommands.markKeyAsModified(args[0], webSocket);
        break;
      case "LRANGE":
        res = this.listCommands.handleLRange(args);
        break;
      case "LPUSH":
        res = this.listCommands.handleLPush(args);
        this.watchCommands.markKeyAsModified(args[0], webSocket);
        break;
      case "LLEN":
        res = this.listCommands.handleLLen(args);
        break;
      case "LPOP":
        res = this.listCommands.handleLPop(args);
        this.watchCommands.markKeyAsModified(args[0], webSocket);
        break;
      case "XADD":
        res = this.streamCommands.handleXAdd(args);
        this.watchCommands.markKeyAsModified(args[0], webSocket);
        break;
      case "XRANGE":
        res = this.streamCommands.handleXRange(args);
        break;
      default:
        res = encodeError(`ERR unknow command ${cmd}`);
    }

    return res;
  }

  private shouldQueue(command: string, webSocket: net.Socket): boolean {
    const controlCommands = ["MULTI", "EXEC", "DISCARD", "WATCH", "UNWATCH"];

    return (
      this.transactionCommands.isInTransaction(webSocket) &&
      !controlCommands.includes(command.toUpperCase())
    );
  }
}
