import { io, Socket } from 'socket.io-client';
import {
  TaskStatusChangedPayload,
  ActivityNewPayload,
  PresenceUpdatePayload,
  RoomAckResponse,
  ActivityCatchupPayload,
  ActivityCatchupResponse,
  ActivityCatchupData,
  NotificationNewPayload,
  NotificationUnreadCountPayload,
} from '../types/realtime.types';

export class SocketService {
  private socket: Socket | null = null;
  private backendUrl: string;
  private lastSeenActivityId: string | null = null;

  constructor() {
    this.backendUrl = import.meta.env.VITE_API_URL || 'http://localhost:4000';
  }

  /**
   * Connects to the Socket.IO server using the provided short-lived access JWT.
   */
  connect(accessToken: string): Socket {
    if (this.socket?.connected) {
      return this.socket;
    }

    if (this.socket) {
      this.socket.disconnect();
    }

    this.socket = io(this.backendUrl, {
      auth: {
        token: accessToken,
      },
      transports: ['websocket'], // Strict WebSocket transport; zero polling
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    // Automatically update cursor when live events arrive
    this.socket.on('activity:new', (payload: ActivityNewPayload) => {
      this.lastSeenActivityId = payload.id;
    });

    return this.socket;
  }

  /**
   * Disconnects the current socket session.
   */
  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  /**
   * Returns whether the socket is currently connected.
   */
  isConnected(): boolean {
    return !!this.socket?.connected;
  }

  /**
   * Returns current socket instance.
   */
  getSocket(): Socket | null {
    return this.socket;
  }

  /**
   * Returns the latest processed activity ID cursor.
   */
  getLastSeenActivityId(): string | null {
    return this.lastSeenActivityId;
  }

  /**
   * Explicitly sets the latest processed activity ID cursor.
   */
  setLastSeenActivityId(id: string | null): void {
    this.lastSeenActivityId = id;
  }

  /**
   * Subscribes to a project room: project:<projectId>.
   */
  joinProject(projectId: string): Promise<RoomAckResponse> {
    return new Promise((resolve) => {
      if (!this.socket) {
        return resolve({ success: false, error: 'Socket not connected' });
      }

      this.socket.emit('project:join', { projectId }, (response: RoomAckResponse) => {
        resolve(response);
      });
    });
  }

  /**
   * Unsubscribes from a project room.
   */
  leaveProject(projectId: string): Promise<RoomAckResponse> {
    return new Promise((resolve) => {
      if (!this.socket) {
        return resolve({ success: false, error: 'Socket not connected' });
      }

      this.socket.emit('project:leave', { projectId }, (response: RoomAckResponse) => {
        resolve(response);
      });
    });
  }

  /**
   * Subscribes to the global activity room (Admin only).
   */
  joinGlobalActivity(): Promise<RoomAckResponse> {
    return new Promise((resolve) => {
      if (!this.socket) {
        return resolve({ success: false, error: 'Socket not connected' });
      }

      this.socket.emit('global:join', (response: RoomAckResponse) => {
        resolve(response);
      });
    });
  }

  /**
   * Requests missed activity events from PostgreSQL.
   * If lastSeenActivityId is omitted in payload, uses the tracked cursor.
   */
  catchup(payload?: ActivityCatchupPayload): Promise<ActivityCatchupResponse> {
    return new Promise((resolve) => {
      if (!this.socket) {
        return resolve({
          success: false,
          error: { code: 'NOT_CONNECTED', message: 'Socket is not connected' },
        });
      }

      const requestPayload: ActivityCatchupPayload = {
        lastSeenActivityId: payload?.lastSeenActivityId ?? this.lastSeenActivityId ?? undefined,
        projectId: payload?.projectId,
      };

      this.socket.emit('activity:catchup', requestPayload, (response: ActivityCatchupResponse) => {
        if (response.success && response.data.events.length > 0) {
          // Update cursor to the newest event in the chronological batch
          const newest = response.data.events[response.data.events.length - 1];
          this.lastSeenActivityId = newest.id;
        }
        resolve(response);
      });
    });
  }

  /**
   * Merges incoming events with existing events, safely deduplicating by ActivityLog ID.
   */
  deduplicateEvents(
    existingEvents: ActivityNewPayload[],
    incomingEvents: ActivityNewPayload[]
  ): ActivityNewPayload[] {
    const seenIds = new Set(existingEvents.map((e) => e.id));
    const uniqueIncoming = incomingEvents.filter((e) => !seenIds.has(e.id));
    return [...existingEvents, ...uniqueIncoming];
  }

  /**
   * Listeners for real-time events.
   */
  onTaskStatusChanged(callback: (payload: TaskStatusChangedPayload) => void): () => void {
    if (!this.socket) return () => {};
    this.socket.on('task:statusChanged', callback);
    return () => {
      this.socket?.off('task:statusChanged', callback);
    };
  }

  onActivityNew(callback: (payload: ActivityNewPayload) => void): () => void {
    if (!this.socket) return () => {};
    this.socket.on('activity:new', callback);
    return () => {
      this.socket?.off('activity:new', callback);
    };
  }

  onActivityCatchupResult(callback: (data: ActivityCatchupData) => void): () => void {
    if (!this.socket) return () => {};
    this.socket.on('activity:catchup:result', callback);
    return () => {
      this.socket?.off('activity:catchup:result', callback);
    };
  }

  onPresenceUpdate(callback: (payload: PresenceUpdatePayload) => void): () => void {
    if (!this.socket) return () => {};
    this.socket.on('presence:update', callback);
    return () => {
      this.socket?.off('presence:update', callback);
    };
  }

  onNotificationNew(callback: (payload: NotificationNewPayload) => void): () => void {
    if (!this.socket) return () => {};
    this.socket.on('notification:new', callback);
    return () => {
      this.socket?.off('notification:new', callback);
    };
  }

  onNotificationUnreadCount(callback: (payload: NotificationUnreadCountPayload) => void): () => void {
    if (!this.socket) return () => {};
    this.socket.on('notification:unreadCount', callback);
    return () => {
      this.socket?.off('notification:unreadCount', callback);
    };
  }
}

export const socketService = new SocketService();
