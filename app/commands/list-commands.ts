import * as net from "net";
import {
  encodeArray,
  encodeBulkString,
  encodeError,
  encodeInteger,
  encodeSimpleString,
} from "../utils/parser";
import type { EntryType } from "../command";

export interface BlockedClient {
  socket: net.Socket;
  keys: string[];
  timeout: number;
  startTime: number;
}

export class ListCommands {
  private mapping: Map<String, EntryType>;
  private blockedClients: BlockedClient[];
  constructor(mapping: Map<String, EntryType>) {
    this.mapping = mapping;
    this.blockedClients = [];
  }

  public handleRpush(args: string[]): string {
    if (args.length < 2) {
      return encodeError("ERR wrong number of args for 'rpush' command");
    }

    const key = args[0],
      values = args.slice(1);
    let entry = this.mapping.get(key);

    let len = 0;

    const isArray = Array.isArray(entry?.value);
    if (entry) {
      if (isArray) {
        const newArr = [...entry.value, ...values];
        this.mapping.set(key, {
          value: newArr,
          timeExpired: entry.timeExpired,
        });

        len = newArr.length;
      } else {
        const newArr = [entry.value as string, ...values];

        this.mapping.set(key, {
          value: newArr,
          timeExpired: entry.timeExpired,
        });
        len = newArr.length;
      }
    } else {
      this.mapping.set(key, { value: values });
      len = values.length;
    }

    this.checkBlockClients(key);
    return encodeInteger(len);
  }

  public handleLRange(args: string[]) {
    if (args.length !== 3) {
      return encodeError("ERR wrong number of arguments for 'lrange' command");
    }

    const key = args[0],
      start = parseInt(args[1]),
      stop = parseInt(args[2]);

    if (isNaN(start) || isNaN(stop)) {
      return encodeError("ERR value is not an integer or out of range");
    }

    const entry = this.mapping.get(key);
    if (!entry || !Array.isArray(entry.value)) {
      return encodeArray([]);
    }

    const list = entry.value as string[];
    const len = list.length;

    //These offsets can also be negative numbers indicating offsets starting at the end of the list.
    // For example, -1 is the last element of the list, -2 the penultimate, and so on.
    let newStart = start < 0 ? len + start : start;
    let newStop = stop < 0 ? len + stop : stop;

    // check valid range of index
    newStart = Math.max(0, Math.min(newStart, len));

    // Out of range indexes will not produce an error. If start is larger than the end of the list, an empty list is returned.
    // If stop is larger than the actual end of the list, Redis will treat it like the last element of the list.
    if (stop < 0) {
      newStop = Math.max(-1, newStop);
    } else {
      newStop = Math.min(newStop, len);
    }

    if (newStart > newStop || len === 0 || start >= len) {
      return encodeArray([]);
    }

    const res = list.slice(newStart, newStop + 1);
    return encodeArray(res);
  }

  public handleLPush(args: string[]): string {
    if (args.length < 2) {
      return encodeError("ERR wrong number of arguments for 'LPUSH' command");
    }
    const key = args[0],
      values = args.slice(1).reverse();
    let entry = this.mapping.get(key);
    let len = 0;

    if (entry) {
      if (Array.isArray(entry.value)) {
        const newArr = [...values, ...entry.value];
        this.mapping.set(key, {
          value: newArr,
          timeExpired: entry.timeExpired,
        });
        len = newArr.length;
      } else {
        const newArr = [...values, entry.value as string];
        this.mapping.set(key, {
          value: newArr,
          timeExpired: entry.timeExpired,
        });
        len = newArr.length;
      }
    } else {
      this.mapping.set(key, { value: values });
      len = values.length;
    }

    this.checkBlockClients(key);
    return encodeInteger(len);
  }

  public handleLLen(args: string[]): string {
    if (args.length !== 1) {
      return encodeError("ERR wrong number of arguments for 'LLEN' command");
    }

    const key = args[0];
    if (
      !this.mapping.has(key) ||
      !Array.isArray(this.mapping.get(key)?.value)
    ) {
      return encodeInteger(0);
    }

    return encodeInteger(this.mapping.get(key)?.value.length);
  }

  public handleLPop(args: string[]): string {
    if (args.length < 1) {
      return encodeError("ERR wrong number of arguments for 'LPOP' command");
    }

    const key = args[0];
    const entry = this.mapping.get(key);
    if (!entry || !Array.isArray(entry.value) || entry.value.length === 0) {
      return encodeBulkString(null);
    }

    const haveToRemoveMulTime = args.length === 2;

    if (haveToRemoveMulTime) {
      const needToRemove = parseInt(args[1]);

      if (isNaN(needToRemove) || needToRemove <= 0) {
        return encodeError("ERR second value is not valid or out of range");
      }
      const popped = [];
      for (let i = 0; i < needToRemove; i++) {
        if (entry.value.length === 0) break;
        popped.push(entry.value.shift()!);
      }

      this.mapping.set(key, {
        value: entry.value,
        timeExpired: entry.timeExpired,
      });

      return encodeArray(popped);
    }

    const popped = entry.value.shift();
    this.mapping.set(key, {
      value: entry.value,
      timeExpired: entry.timeExpired,
    });

    return encodeBulkString(popped);
  }

  public handleBLPop(args: string[], socket: net.Socket): void {
    if (args.length < 2) {
      socket.write(
        encodeError("ERR wrong number of arguments for 'BLPOP' command"),
      );
      return;
    }

    // syntax BLPOP key [keys ... ] timeout
    const keys = args.slice(0, -1),
      timeout = parseFloat(args[args.length - 1]);

    if (isNaN(timeout) || timeout < 0) {
      socket.write(encodeError("ERR invalid timeout for 'BLPOP' command"));
      return;
    }

    // check if any key has an element available
    for (const key of keys) {
      const entry = this.mapping.get(key);
      if (entry && Array.isArray(entry.value) && entry.value.length > 0) {
        const popped = entry.value.shift()!;

        this.mapping.set(key, {
          value: entry.value,
          timeExpired: entry.timeExpired,
        });

        const res = encodeArray([key, popped]);
        socket.write(res);
        return;
      }
    }

    // if no elements available, we need to block
    const needToBlock: BlockedClient = {
      socket,
      keys,
      timeout,
      startTime: Date.now(),
    };

    this.blockedClients.push(needToBlock);

    if (timeout > 0) {
      setTimeout(() => {
        // check if client is still in blocked list
        const index = this.blockedClients.indexOf(needToBlock);

        if (index !== -1) {
          this.blockedClients.splice(index, 1);
          socket.write(encodeArray(null));
        }
      }, timeout * 1000);
    }
  }

  public checkBlockClients(key: string): void {
    // first we need to find the blocked client who is waiting for this current key
    for (let i = 0; i < this.blockedClients.length; i++) {
      const blockedClient = this.blockedClients[i];

      if (blockedClient.keys.includes(key)) {
        // we found that client, then remove him from blocked list
        this.blockedClients.splice(i, 1);

        // get the first element from the list
        const entry = this.mapping.get(key);

        if (entry && Array.isArray(entry.value) && entry.value.length > 0) {
          const popped = entry.value.shift()!;

          this.mapping.set(key, {
            value: entry.value,
            timeExpired: entry.timeExpired,
          });

          const res = encodeArray([key, popped]);

          blockedClient.socket.write(res);
        }

        break;
      }
    }
  }
}
