import * as net from "net";
import {
  encodeSimpleString,
  encodeError,
  encodeBulkString,
  encodeInteger,
  encodeArray,
} from "./utils/parser";

import { StringCommands } from "./commands/string-commands";
import { ListCommands } from "./commands/list-commands";
import { StreamCommands } from "./commands/stream-commands";
import { TransactionsCommands } from "./commands/transaction-commands";

export interface MapEntry {
  value: any;
  timeExpired?: number;
  type?: "string" | "list" | "stream";
}

export interface StreamEntry {
  id: string;
  fields: Map<string, string>;
}

export class RedisCommand {
  private mapping: Map<string, MapEntry>;
  private stringCommands: StringCommands;
  private listCommands: ListCommands;
  private streamCommands: StreamCommands;
  private transactionCommands: TransactionsCommands;

  constructor() {
    this.mapping = new Map<string, MapEntry>();
    this.stringCommands = new StringCommands(this.mapping);
    this.listCommands = new ListCommands(this.mapping);
    this.streamCommands = new StreamCommands(this.mapping);
    this.transactionCommands = new TransactionsCommands(this.mapping);
  }

  async executedCommand(
    cmd: string,
    args: string[],
    webSocket: net.Socket,
  ): Promise<void> {
    let res: string;

    switch (cmd.toUpperCase()) {
      case "PING":
        res = this.handlePing();
        break;
      case "ECHO":
        res = this.handleEcho(args);
        break;
      case "SET":
        res = this.stringCommands.handleSet(args);
        break;
      case "GET":
        res = this.stringCommands.handleGet(args);
        break;
      case "INCR":
        res = this.stringCommands.handleIncr(args);
        break;
      case "RPUSH":
        res = this.listCommands.handleRpush(args);
        break;
      case "LRANGE":
        res = this.listCommands.handleLRange(args);
        break;
      case "LPUSH":
        res = this.listCommands.handleLPush(args);
        break;
      case "LLEN":
        res = this.listCommands.handleLLen(args);
        break;
      case "LPOP":
        res = this.listCommands.handleLPop(args);
        break;
      case "BLPOP":
        this.listCommands.handleBLPop(args, webSocket);
        return;
      case "TYPE":
        res = this.handleType(args);
        break;

      case "XADD":
        res = this.streamCommands.handleXAdd(args);
        break;
      case "XRANGE":
        res = this.streamCommands.handleXRange(args);
        break;
      case "XREAD":
        res = await this.streamCommands.handleXRead(args);
        break;

      case "MULTI":
        res = this.transactionCommands.handleMuli(args);
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
}
