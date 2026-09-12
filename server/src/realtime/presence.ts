export class PresenceManager {
  private userSockets: Map<string, Set<string>> = new Map();

  /**
   * Registers a socket connection for an authenticated user.
   * Returns current unique online count and whether this was user's first connection.
   */
  addConnection(userId: string, socketId: string): { onlineCount: number; isFirstConnection: boolean } {
    let sockets = this.userSockets.get(userId);
    const isFirstConnection = !sockets || sockets.size === 0;

    if (!sockets) {
      sockets = new Set<string>();
      this.userSockets.set(userId, sockets);
    }
    sockets.add(socketId);

    return {
      onlineCount: this.getOnlineCount(),
      isFirstConnection,
    };
  }

  /**
   * Removes a socket connection for an authenticated user.
   * Returns current unique online count and whether this was user's final connection (user now offline).
   */
  removeConnection(userId: string, socketId: string): { onlineCount: number; isLastConnection: boolean } {
    const sockets = this.userSockets.get(userId);
    if (!sockets) {
      return {
        onlineCount: this.getOnlineCount(),
        isLastConnection: false,
      };
    }

    sockets.delete(socketId);
    const isLastConnection = sockets.size === 0;
    if (isLastConnection) {
      this.userSockets.delete(userId);
    }

    return {
      onlineCount: this.getOnlineCount(),
      isLastConnection,
    };
  }

  /**
   * Returns the total count of unique online authenticated users.
   */
  getOnlineCount(): number {
    return this.userSockets.size;
  }

  /**
   * Returns whether a specific user has at least one active socket connection.
   */
  isUserOnline(userId: string): boolean {
    const sockets = this.userSockets.get(userId);
    return !!sockets && sockets.size > 0;
  }

  /**
   * Clears all tracked connections (useful in test teardown).
   */
  clear(): void {
    this.userSockets.clear();
  }
}

export const presenceManager = new PresenceManager();
