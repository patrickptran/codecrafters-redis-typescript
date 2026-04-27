import type { MapEntry, StreamEntry } from "../command";
import { encodeArray, encodeError, encodeBulkString } from "../utils/parser";

export class StreamCommands {
  private mapping: Map<string, MapEntry>;
  constructor(mapping: Map<string, MapEntry>) {
    this.mapping = mapping;
  }

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
}
