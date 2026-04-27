import { type MapEntry } from "../command";
import { encodeSimpleString, encodeError } from "../utils/parser";

export class TransactionsCommands {
  private mapping: Map<string, MapEntry>;

  constructor(mapping: Map<string, MapEntry>) {
    this.mapping = mapping;
  }
  public handleMuli(args: string[]): string {
    if (args.length !== 0) {
      return encodeError("ERR wrong number of arguments for MULTI command");
    }
    return encodeSimpleString("OK");
  }
}
