import type { MapEntry, StreamEntry } from "../command";
import {
  encodeArray,
  encodeError,
  encodeBulkString,
  encodeRawArray,
  encodeXReadArray,
  encodeNestedArray,
} from "../utils/parser";

export class StreamCommands {
  private mapping: Map<string, MapEntry>;
  constructor(mapping: Map<string, MapEntry>) {
    this.mapping = mapping;
  }
  // ID format : <timeMS> - <sequence>

  private isValidID(entry: MapEntry, currentId: string): string | null {
    const lastEntry = entry.value[entry.value.length - 1];
    const lastId = lastEntry.id;

    const [lastMsTime, lastSequence] = lastId.split("-").map(Number);
    const [currentMsTime, currentSequence] = currentId.split("-").map(Number);

    let error = null;
    if (currentMsTime === 0 && currentSequence === 0) {
      error = encodeError(
        "ERR The ID specified in XADD must be greater than 0-0",
      );
    } else if (
      currentMsTime === lastMsTime &&
      lastSequence >= currentSequence
    ) {
      error = encodeError(
        "ERR The ID specified in XADD is equal or smaller than the target stream top item",
      );
    } else if (
      currentMsTime < lastMsTime ||
      isNaN(currentMsTime) ||
      isNaN(currentSequence)
    ) {
      error = encodeError(
        "ERR The ID specified in XADD is equal or smaller than the target stream top item",
      );
    }
    return error;
  }

  private generateSequenceNumber(entry: MapEntry, msTime: number): number {
    if (entry.value.length === 0) {
      return msTime === 0 ? 1 : 0;
    }

    let maxSequence = -1;
    for (let streamEntry of entry.value) {
      const [entryTime, entrySeq] = streamEntry.id.split("-").map(Number);

      if (entryTime === msTime && entrySeq > maxSequence) {
        maxSequence = entrySeq;
      }
    }

    return maxSequence === -1 ? (msTime === 0 ? 1 : 0) : maxSequence + 1;
  }

  private parseId(id: string, isEnd: boolean): [number, number] {
    if (id === "-") {
      return [-Infinity, -Infinity];
    }

    if (id === "+") {
      return [Infinity, Infinity];
    }

    const idArray = id.split("-");
    if (idArray.length === 1) {
      return [parseInt(idArray[0]), isEnd ? Infinity : 0];
    }

    return [parseInt(idArray[0]), parseInt(idArray[1])];
  }

  public handleXAdd(args: string[]): string {
    if (args.length < 4 || args.length % 2 !== 0) {
      return encodeError("ERR wrong number of arguments for 'XADD' command");
    }

    const [key, id, ...values] = args;

    if (!this.mapping.has(key)) {
      this.mapping.set(key, { value: [], type: "stream" });
    }
    const entry = this.mapping.get(key)!;

    const [time, sequence] = id.split("-");
    const isAutoSequence = time !== "*" && sequence === "*";
    const isFullAuto = time === "*";
    let finalId = id;

    if (isFullAuto) {
      const timeMs = Date.now();
      const sequenceNumber = this.generateSequenceNumber(entry, timeMs);
      finalId = `${timeMs}-${sequenceNumber}`;
    } else if (isAutoSequence) {
      const timeMs = parseInt(time);
      if (isNaN(timeMs)) {
        return encodeError("ERR Invalid streamId specified as argument");
      }

      if (entry.value.length > 0) {
        const lastEntry = entry.value[entry.value.length - 1];
        const [lastMs] = lastEntry.id.split("-").map(Number);

        if (timeMs < lastMs) {
          return encodeError(
            "ERR The ID specified in XADD is equal or smaller than the target stream top item",
          );
        }

        if (timeMs === 0) {
          return encodeError(
            "ERR The ID specified in XADD must be greater than 0-0",
          );
        }
      }

      const sequenceNumber = this.generateSequenceNumber(entry, timeMs);
      finalId = `${timeMs}-${sequenceNumber}`;
    } else {
      if (entry.value.length > 0) {
        const error = this.isValidID(entry, id);
        if (error) return error;
      }
    }

    // add field Map
    const fieldMap = new Map<string, string>();
    for (let i = 0; i < values.length; i += 2) {
      fieldMap.set(values[i], values[i + 1]);
    }

    const streamEntry: StreamEntry = {
      id: finalId,
      fields: fieldMap,
    };
    const currentEntry = this.mapping.get(key)!;
    currentEntry.value.push(streamEntry);

    return encodeBulkString(finalId);
  }

  public handleXRange(args: string[]): string {
    if (args.length !== 3) {
      return encodeError("ERR wrong number of arguments for 'XRANGE' command");
    }

    const [key, startId, endId] = args;

    const entry = this.mapping.get(key);
    if (!entry || entry.type !== "stream") {
      return "*0\r\n";
    }

    const [startMs, startSeq] = this.parseId(startId, false);
    const [endMs, endSeq] = this.parseId(endId, true);
    const res = [];

    for (let streamEntry of entry.value) {
      const [entryMs, entrySeq] = streamEntry.id.split("-").map(Number);

      if (entryMs < startMs || (entryMs === startMs && entrySeq < startSeq))
        continue;

      if (entryMs > endMs || (endMs === entryMs && entrySeq > endSeq)) break;

      const fieldArray: string[] = [];
      for (const [key, value] of streamEntry.fields.entries()) {
        fieldArray.push(key, value);
      }

      res.push([streamEntry.id, fieldArray]);
    }
    return encodeNestedArray(res);
  }

  // XREAD STREAMS <key> <key1> ...  <id> <id1>
  public async handleXRead(args: string[]): Promise<string> {
    let blockTimeout: number | null = null;
    let offset = 0;

    if (args[0].toUpperCase() === "BLOCK") {
      if (args.length < 2) {
        return encodeError("ERR wrong number of arguments for 'XREAD' command");
      }

      blockTimeout = parseInt(args[1]);
      if (isNaN(blockTimeout)) {
        return encodeError("ERR value is not an integer or out of range");
      }
      offset = 2;
    }

    const streamsArgs = args.slice(offset);
    if (streamsArgs.length < 3 || streamsArgs.length % 2 === 0) {
      return encodeError("ERR wrong number of arguments for 'XREAD' command");
    }

    if (streamsArgs[0].toUpperCase() !== "STREAMS") {
      return encodeError("ERR syntax error");
    }

    const numberOfStreams = (streamsArgs.length - 1) / 2;

    const streamKeys = streamsArgs.slice(1, 1 + numberOfStreams);
    const streamIds = streamsArgs.slice(1 + numberOfStreams);

    if (blockTimeout !== null) {
      return this.handleBlockXRead(streamKeys, streamIds, blockTimeout);
    }

    return this.processXRead(streamKeys, streamIds);
  }

  private async handleBlockXRead(
    streamKeys: string[],
    streamIds: string[],
    blockTimeout: number,
  ): Promise<string> {
    const startTime = Date.now();

    while (true) {
      const res = this.processXRead(streamKeys, streamIds);

      if (res !== "*0\r\n") return res;

      const elapsed = Date.now() - startTime;
      if (blockTimeout > 0 && elapsed >= blockTimeout) {
        return "*-1\r\n";
      }

      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  private processXRead(streamKeys: string[], streamIds: string[]): string {
    const totalResult: [string, [string, string[]][]][] = [];

    for (let i = 0; i < streamKeys.length; i++) {
      const key = streamKeys[i],
        id = streamIds[i];

      const entry = this.mapping.get(key)!;
      if (!entry || entry.type !== "stream") {
        continue;
      }
      const [startMs, startSeq] = this.parseId(id, false);

      const res: [string, string[]][] = [];

      for (let streamEntry of entry.value) {
        const [entryMs, entrySeq] = streamEntry.id.split("-").map(Number);

        if (entryMs < startMs || (entryMs === startMs && entrySeq <= startSeq))
          continue;

        const fieldArray: string[] = [];

        for (let [field, value] of streamEntry.fields) {
          fieldArray.push(field, value);
        }
        res.push([streamEntry.id, fieldArray]);
      }
      if (res.length > 0) {
        totalResult.push([key, res]);
      }
    }

    if (totalResult.length === 0) {
      return "*0\r\n";
    }
    return encodeXReadArray(totalResult);
  }
}
