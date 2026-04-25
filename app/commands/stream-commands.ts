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

    if (isNaN(currentMsTime) || isNaN(currentSequence)) {
      error = encodeError(
        "ERR in XADD, invalid integer of 'millisecondsTime' or 'sequenceNumber'",
      );
    } else if (currentMsTime === lastMsTime && lastSequence > currentSequence) {
      error = encodeError(
        "ERR in XADD, the millisecondsTime values are equal, so the sequenceNumber of the new ID must be greater than the last entry's sequenceNumber.",
      );
    } else if (currentMsTime < lastMsTime) {
      error = encodeError(
        "ERR In XADD, The millisecondsTime portion of the new ID must be greater than or equal to the last entry's millisecondsTime",
      );
    } else if (currentMsTime === 0 && currentSequence === 0) {
      error = encodeError(
        "ERR The ID in XADD must be greater than 0-0. The minimum valid ID Redis accepts is 0-1",
      );
    }
    return error;
  }

  public handleXAdd(args: string[]): string {
    if (args.length < 4 || args.length % 2 !== 0) {
      return encodeError("ERR wrong number of arguments for 'XADD' command");
    }

    const [key, id, ...values] = args;
    const entry = this.mapping.get(key);

    if (!entry) {
      this.mapping.set(key, { value: [], type: "stream" });
    }

    if (entry && entry.value.length > 0) {
      const error = this.isValidID(entry, id);
      if (error) return error;
    }

    const fieldMap = new Map<string, string>();
    for (let i = 0; i < values.length; i += 2) {
      fieldMap.set(values[i], values[i + 1]);
    }

    const streamEntry: StreamEntry = {
      id: id,
      fields: fieldMap,
    };

    entry?.value.push(streamEntry);

    return encodeBulkString(id);
  }
}
