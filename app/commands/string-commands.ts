import {
  encodeBulkString,
  encodeError,
  encodeSimpleString,
  encodeInteger,
} from "../utils/parser";
import type { MapEntry } from "../types";

export class StringCommands {
  private mapping: Map<String, MapEntry>;

  constructor(mapping: Map<String, MapEntry>) {
    this.mapping = mapping;
  }

  public handleSet(args: string[]): string {
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

  public handleGet(args: string[]): string {
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

  public handleIncr(args: string[]): string {
    if (args.length !== 1) {
      return encodeError("ERR wrong number of arguments for INCR command");
    }

    const entry = this.mapping.get(args[0]);
    if (!entry) {
      this.mapping.set(args[0], { value: "1" });
      return encodeInteger(1);
    }

    if (entry.timeExpired && Date.now() > entry.timeExpired) {
      this.mapping.delete(args[0]);
      this.mapping.set(args[0], { value: "1" });
      return encodeInteger(1);
    }

    const currentValue = parseInt(entry.value);
    if (isNaN(currentValue)) {
      return encodeError("ERR value is not an integer or out of range");
    }

    this.mapping.set(args[0], { value: (currentValue + 1).toString() });
    return encodeInteger(currentValue + 1);
  }
}
