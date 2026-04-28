import { type MapEntry } from "../command";
import { encodeSimpleString, encodeError, encodeArray } from "../utils/parser";

export class TransactionsCommands {
  private mapping: Map<string, MapEntry>;
  private isMulti: boolean;

  constructor(mapping: Map<string, MapEntry>) {
    this.mapping = mapping;
    this.isMulti = false;
  }
  public handleMulti(args: string[]): string {
    if (args.length !== 0) {
      return encodeError("ERR wrong number of arguments for MULTI command");
    }
    this.isMulti = true;
    return encodeSimpleString("OK");
  }

  public handleExec(args: string[]): string {
    if (args.length !== 0) {
      return encodeError("ERR wrong number of arguments for EXEC command");
    }
    if (!this.isMulti) {
      return encodeError("ERR EXEC without MULTI");
    }

    this.isMulti = false;
    return encodeArray([]);
  }
}
