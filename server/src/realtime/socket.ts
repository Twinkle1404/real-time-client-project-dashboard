import http from 'http';
import { Server } from 'socket.io';
import { Role } from '@prisma/client';
import { env } from '../config/env';
import {
  ServerToClientEvents,
  ClientToServerEvents,
  SocketData,
} from './realtime.types';
import { socketAuthMiddleware } from './socketAuth';
import { presenceManager } from './presence';
import {
  handleJoinProject,
  handleLeaveProject,
  handleJoinGlobalActivity,
  handleLeaveGlobalActivity,
} from './rooms';
import { emitPresenceUpdate, TypedServer } from './events';
import { catchupService } from './catchup';

let ioInstance: TypedServer | null = null;

export const initSocketServer = (
  httpServer: http.Server
): TypedServer => {
  const io: TypedServer = new Server<ClientToServerEvents, ServerToClientEvents, any, SocketData>(
    httpServer,
    {
      cors: {
        origin: env.FRONTEND_URL,
        credentials: true,
      },
    }
  );

  // Authenticate socket connections with JWT
  io.use(socketAuthMiddleware);

  io.on('connection', (socket) => {
    const user = socket.data.user;

    // Automatically join the user-specific room for targeted messages
    socket.join(`user:${user.userId}`);

    // Admins automatically join the global activity room
    if (user.role === Role.ADMIN) {
      socket.join('global:activity');
    }

    // Register presence connection
    presenceManager.addConnection(user.userId, socket.id);
    emitPresenceUpdate(io);

    // Register room event handlers
    socket.on('project:join', (payload, callback) => {
      handleJoinProject(socket, payload, callback);
    });

    socket.on('project:leave', (payload, callback) => {
      handleLeaveProject(socket, payload, callback);
    });

    socket.on('global:join', (callback) => {
      handleJoinGlobalActivity(socket, callback);
    });

    socket.on('global:leave', (callback) => {
      handleLeaveGlobalActivity(socket, callback);
    });

    // Handle missed-event catchup requests
    socket.on('activity:catchup', async (payload, callback) => {
      const result = await catchupService.getCatchupEvents(user.userId, user.role, payload);
      if (callback) {
        callback(result);
      }
      if (result.success) {
        socket.emit('activity:catchup:result', result.data);
      }
    });

    // Handle disconnect
    socket.on('disconnect', () => {
      presenceManager.removeConnection(user.userId, socket.id);
      emitPresenceUpdate(io);
    });
  });

  ioInstance = io;
  return io;
};

/**
 * Returns the current Socket.IO server instance.
 */
export const getIO = (): TypedServer | null => {
  return ioInstance;
};

/**
 * Resets the Socket.IO instance (useful in test teardown).
 */
export const resetIO = (): void => {
  if (ioInstance) {
    ioInstance.close();
    ioInstance = null;
  }
};
