import * as net from "net";
import {
  encodeSimpleString,
  encodeError,
  encodeBulkString,
  encodeInteger,
} from "./parser";

export interface MapType {
  value: any;
  timeExpired?: number;
}

export class RedisCommand {
  private mapping: Map<string, MapType>;

  constructor() {
    this.mapping = new Map<string, MapType>();
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
        res = this.handleSet(args);
        break;
      case "GET":
        res = this.handleGet(args);
        break;
      case "RPUSH":
        res = this.handleRpush(args);
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
  private handleSet(args: string[]): string {
    if (args.length === 2) {
      this.mapping.set(args[0], { value: args[1] });
      return encodeSimpleString("OK");
    }

    if (args.length === 4 && args[2].toUpperCase() === "PX") {
      const timeExpired = parseInt(args[3]);

      if (isNaN(timeExpired) || timeExpired <= 0) {
        return encodeError("ERR invalid expire time in set");
      }

      const date = Date.now() + timeExpired;
      this.mapping.set(args[0], { value: args[1], timeExpired: date });
      return encodeSimpleString("OK");
    }

    return encodeError("ERR wrong syntax for SET command");
  }

  private handleGet(args: string[]): string {
    if (args.length !== 1) {
      return encodeError("ERR wrong number of arguments for GET command");
    }

    const entry = this.mapping.get(args[0]);

    if (!entry) {
      return encodeBulkString(null);
    }

    if (entry.timeExpired && Date.now() > entry.timeExpired) {
      this.mapping.delete(args[0]);
      return encodeBulkString(null);
    }

    return encodeBulkString(entry.value);
  }

  private handleRpush(args: string[]): string {
    if (args.length < 2) {
      return encodeError("ERR wrong number of args for 'rpush' command");
    }

    const key = args[0],
      values = args.slice(1);

    let entry = this.mapping.get(key);
    const isArray = Array.isArray(entry?.value);
    if (entry) {
      if (isArray) {
        this.mapping.set(key, {
          value: [...entry.value, ...values],
          timeExpired: entry.timeExpired,
        });
      } else {
        const newArr = [entry.value as string, ...values];

        this.mapping.set(key, {
          value: newArr,
          timeExpired: entry.timeExpired,
        });
      }
    } else {
      this.mapping.set(key, { value: values });
    }

    const currentEntry = this.mapping.get(key)!;

    const len = Array.isArray(currentEntry.value)
      ? currentEntry.value.length
      : 0;
    return encodeInteger(len);
  }
}
