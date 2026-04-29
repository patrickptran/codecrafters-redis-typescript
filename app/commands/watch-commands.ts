import * as net from "net";

export class WatchCommands {
  // Map of connectionId -> Set of watched keys
  private watchedKeys: Map<string, Set<string>>;
  // Map of connectionId -> dirty flag (whether any watched key was modified)
  private dirtyConnections: Set<string>;

  constructor() {
    this.watchedKeys = new Map();
    this.dirtyConnections = new Set();
  }

  private getConnectionId(webSocket: net.Socket): string {
    return `${webSocket.remoteAddress}:${webSocket.remotePort}`;
  }

  /**
   * Add keys to the watch list for this connection
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
   * Mark a key as modified, marking all connections watching it as dirty
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
   * Check if this connection's watched keys were modified
   */
  public isConnectionDirty(webSocket: net.Socket): boolean {
    const connectionId = this.getConnectionId(webSocket);
    return this.dirtyConnections.has(connectionId);
  }

  /**
   * Clear watch state for a connection (called after EXEC or DISCARD)
   */
  public clearWatchState(webSocket: net.Socket): void {
    const connectionId = this.getConnectionId(webSocket);
    this.watchedKeys.delete(connectionId);
    this.dirtyConnections.delete(connectionId);
  }

  /**
   * Get watched keys for a connection (for debugging)
   */
  public getWatchedKeys(webSocket: net.Socket): Set<string> {
    const connectionId = this.getConnectionId(webSocket);
    return this.watchedKeys.get(connectionId) || new Set();
  }
}
