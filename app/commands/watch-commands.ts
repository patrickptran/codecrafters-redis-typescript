import * as net from "net";

/**
 * WatchCommands manages Redis WATCH functionality for optimistic locking.
 * It tracks which keys are being watched by each connection and marks
 * connections as "dirty" when their watched keys are modified by other clients.
 */
export class WatchCommands {
  /** Map of connectionId -> Set of watched keys */
  private watchedKeys: Map<string, Set<string>>;
  /** Set of connectionIds that have dirty watched keys */
  private dirtyConnections: Set<string>;

  constructor() {
    this.watchedKeys = new Map();
    this.dirtyConnections = new Set();
  }

  /**
   * Get a unique identifier for a connection based on its remote address and port
   * @param webSocket - The socket connection
   * @returns A string identifier unique to this connection
   */
  private getConnectionId(webSocket: net.Socket): string {
    return `${webSocket.remoteAddress}:${webSocket.remotePort}`;
  }

  /**
   * Add keys to the watch list for this connection.
   * Multiple WATCH commands will accumulate keys (not replace them).
   * @param keys - Array of key names to watch
   * @param webSocket - The socket connection making the WATCH request
   */
  public watchKeys(keys: string[], webSocket: net.Socket): void {
    const connectionId = this.getConnectionId(webSocket);

    if (!this.watchedKeys.has(connectionId)) {
      this.watchedKeys.set(connectionId, new Set());
    }

    const watchSet = this.watchedKeys.get(connectionId)!;
    for (const key of keys) {
      watchSet.add(key);
    }
  }

  /**
   * Mark a key as modified, marking all connections watching it as dirty.
   * If a watched key is modified, the connection's transaction will be aborted on EXEC.
   * Note: The modifying connection itself is not marked as dirty (optimistic locking).
   * @param key - The key that was modified
   * @param modifyingConnection - The socket connection that modified the key
   */
  public markKeyAsModified(key: string, modifyingConnection: net.Socket): void {
    const modifyingConnectionId = this.getConnectionId(modifyingConnection);

    // Check all connections to see if they're watching this key
    for (const [connectionId, watchSet] of this.watchedKeys.entries()) {
      // Don't mark the connection that's modifying the key
      if (connectionId === modifyingConnectionId) {
        continue;
      }

      // If this connection is watching the modified key, mark it as dirty
      if (watchSet.has(key)) {
        this.dirtyConnections.add(connectionId);
      }
    }
  }

  /**
   * Check if this connection's watched keys were modified by another client.
   * Used by EXEC to determine if the transaction should be aborted.
   * @param webSocket - The socket connection to check
   * @returns true if any watched keys were modified, false otherwise
   */
  public isConnectionDirty(webSocket: net.Socket): boolean {
    const connectionId = this.getConnectionId(webSocket);
    return this.dirtyConnections.has(connectionId);
  }

  /**
   * Clear watch state for a connection.
   * This should be called after EXEC or DISCARD to reset the watch state.
   * @param webSocket - The socket connection to clear watch state for
   */
  public clearWatchState(webSocket: net.Socket): void {
    const connectionId = this.getConnectionId(webSocket);
    this.watchedKeys.delete(connectionId);
    this.dirtyConnections.delete(connectionId);
  }

  /**
   * Get the set of watched keys for a connection.
   * Primarily used for debugging purposes.
   * @param webSocket - The socket connection
   * @returns A Set of key names being watched by this connection
   */
  public getWatchedKeys(webSocket: net.Socket): Set<string> {
    const connectionId = this.getConnectionId(webSocket);
    return this.watchedKeys.get(connectionId) || new Set();
  }
}
