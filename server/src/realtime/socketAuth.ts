import { Socket } from 'socket.io';
import { verifyAccessToken } from '../lib/jwt';
import { SocketData } from './realtime.types';

export const socketAuthMiddleware = (
  socket: Socket<any, any, any, SocketData>,
  next: (err?: Error) => void
): void => {
  try {
    // Extract token from auth payload or Authorization header
    let token: string | undefined = socket.handshake.auth?.token;

    if (!token && socket.handshake.headers.authorization) {
      const authHeader = socket.handshake.headers.authorization;
      if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7).trim();
      } else if (typeof authHeader === 'string') {
        token = authHeader.trim();
      }
    }

    if (!token) {
      return next(new Error('Authentication error: No access token provided'));
    }

    // Cryptographically verify access token using Phase 2 secret
    const payload = verifyAccessToken(token);

    if (!payload || !payload.userId || !payload.role) {
      return next(new Error('Authentication error: Invalid token claims'));
    }

    // Attach authenticated identity to socket data (never trusting unverified client input)
    socket.data.user = {
      userId: payload.userId,
      role: payload.role,
    };

    next();
  } catch (error) {
    next(new Error('Authentication error: Invalid or expired access token'));
  }
};
