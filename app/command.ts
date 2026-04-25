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

export interface EntryType {
  value: any;
  timeExpired?: number;
}

export interface BlockedClient {
  socket: net.Socket;
  keys: string[];
  timeout: number;
  startTime: number;
}

export class RedisCommand {
  private mapping: Map<string, EntryType>;
  private blockedClients: BlockedClient[];
  private stringCommands: StringCommands;
  private listCommands: ListCommands;

  constructor() {
    this.mapping = new Map<string, EntryType>();
    this.blockedClients = [];
    this.stringCommands = new StringCommands(this.mapping);
    this.listCommands = new ListCommands(this.mapping);
  }

  executedCommand(cmd: string, args: string[], webSocket: net.Socket): void {
    let res: string;

    switch (cmd.toUpperCase()) {
      case "PING":
        res = this.handlePing(args);
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
      default:
        res = encodeError(`ERR unknow command ${cmd}`);
    }

    webSocket.write(res);
  }

  private handlePing(args: string[]): string {
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

    if (Array.isArray(entry.value)) {
      return encodeSimpleString("list");
    }
    return encodeSimpleString("string");
  }
}
