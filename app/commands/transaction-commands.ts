import * as net from "net";
import type { MapEntry, QueuedCommand } from "../types";
import {
  encodeSimpleString,
  encodeError,
  encodeRawArray,
} from "../utils/parser";

export class TransactionsCommands {
  private mapping: Map<string, MapEntry>;
  private transactionState: Map<string, boolean>;
  private queues: Map<string, QueuedCommand[]>;

  constructor(mapping: Map<string, MapEntry>) {
    this.mapping = mapping;
    this.queues = new Map(); // per - connection command queue
    this.transactionState = new Map(); // each connection need its own transaction state
  }

  public getConnectionId(webSocket: net.Socket): string {
    return `${webSocket.remoteAddress}:${webSocket.remotePort}`;
  }

  public isInTransaction(webSocket: net.Socket): boolean {
    const id = this.getConnectionId(webSocket);

    return this.transactionState.get(id) || false;
  }

  public handleMulti(args: string[], webSocket: net.Socket): string {
    if (args.length !== 0) {
      return encodeError("ERR wrong number of arguments for MULTI command");
    }

    const connectionId = this.getConnectionId(webSocket);
    this.transactionState.set(connectionId, true);
    this.queues.set(connectionId, []);

    return encodeSimpleString("OK");
  }

  public handleExec(
    args: string[],
    webSocket: net.Socket,
    executor: (cmd: string, cmdArgs: string[]) => string,
  ): string {
    if (args.length !== 0) {
      return encodeError("ERR wrong number of arguments for EXEC command");
    }

    const connectionId = this.getConnectionId(webSocket);

    if (
      !this.transactionState.has(connectionId) ||
      this.transactionState.get(connectionId) === false
    ) {
      return encodeError("ERR EXEC without MULTI");
    }

    const queuedCommands = this.queues.get(connectionId) || [];
    // clear transaction for this connection
    this.clearQueue(connectionId);

    // Execute all queued commands and collect results
    const results: string[] = queuedCommands.map((queued) =>
      executor(queued.command, queued.args),
    );

    return encodeRawArray(results);
  }

  public enqueueCommand(
    command: string,
    args: string[],
    webSocket: net.Socket,
  ): string {
    const connectionId = this.getConnectionId(webSocket);

    if (
      !this.transactionState.has(connectionId) ||
      this.transactionState.get(connectionId) === false
    ) {
      return encodeError("ERR command not in transaction");
    }

    const queue = this.queues.get(connectionId) || [];

    queue.push({ command, args });
    this.queues.set(connectionId, [...queue]);
    return encodeSimpleString("QUEUED");
  }

  public clearQueue(connectionId: string): void {
    this.transactionState.set(connectionId, false);
    this.queues.set(connectionId, []);
  }
}
