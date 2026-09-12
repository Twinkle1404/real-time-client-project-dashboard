import bcrypt from 'bcrypt';
import prisma from '../../lib/prisma';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  hashToken,
} from '../../lib/jwt';
import { unauthorized, notFound } from '../../lib/errors';
import { LoginDto, LoginResult, RefreshResult, SafeUser } from './auth.types';
import jwt from 'jsonwebtoken';

const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export class AuthService {
  async login(dto: LoginDto): Promise<LoginResult> {
    const user = await prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user) {
      throw unauthorized('INVALID_CREDENTIALS', 'Invalid email or password');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isPasswordValid) {
      throw unauthorized('INVALID_CREDENTIALS', 'Invalid email or password');
    }

    // Access JWT payload contains ONLY userId and role (no email or sensitive data)
    const accessPayload = {
      userId: user.id,
      role: user.role,
    };
    const accessToken = generateAccessToken(accessPayload);

    // Create server-side refresh session record in PostgreSQL
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);
    const session = await prisma.refreshSession.create({
      data: {
        userId: user.id,
        tokenHash: '', // temporarily placeholder until signed
        expiresAt,
      },
    });

    // Refresh JWT payload contains ONLY userId and sessionId
    const refreshPayload = {
      userId: user.id,
      sessionId: session.id,
    };
    const refreshToken = generateRefreshToken(refreshPayload);

    // Store cryptographic SHA-256 hash of refresh token (never raw token)
    await prisma.refreshSession.update({
      where: { id: session.id },
      data: { tokenHash: hashToken(refreshToken) },
    });

    const safeUser: SafeUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
    };

    return {
      accessToken,
      refreshToken,
      user: safeUser,
    };
  }

  async refresh(token?: string): Promise<RefreshResult> {
    if (!token) {
      throw unauthorized('UNAUTHORIZED', 'Refresh token cookie is missing');
    }

    let payload: { userId: string; sessionId: string };
    try {
      payload = verifyRefreshToken(token);
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw unauthorized('TOKEN_EXPIRED', 'Refresh token has expired. Please log in again.');
      }
      if (error instanceof jwt.JsonWebTokenError) {
        throw unauthorized('INVALID_TOKEN', 'Invalid or tampered refresh token');
      }
      throw error;
    }

    // Look up server-side refresh session
    const session = await prisma.refreshSession.findUnique({
      where: { id: payload.sessionId },
      include: { user: true },
    });

    if (!session) {
      throw unauthorized('UNAUTHORIZED', 'Invalid refresh session');
    }

    // Reject revoked or reused refresh token
    if (session.isRevoked) {
      throw unauthorized('UNAUTHORIZED', 'Refresh token has been revoked or already used');
    }

    // Reject expired session
    if (new Date() > session.expiresAt) {
      throw unauthorized('TOKEN_EXPIRED', 'Refresh session has expired');
    }

    // Validate token hash
    if (hashToken(token) !== session.tokenHash) {
      throw unauthorized('INVALID_TOKEN', 'Invalid refresh token signature');
    }

    // Validate user existence
    if (!session.user) {
      throw unauthorized('USER_NOT_FOUND', 'User account no longer exists');
    }

    // Invalidate/revoke old refresh session immediately to prevent reuse
    await prisma.refreshSession.update({
      where: { id: session.id },
      data: { isRevoked: true },
    });

    // Create new refresh session for rotation
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);
    const newSession = await prisma.refreshSession.create({
      data: {
        userId: session.user.id,
        tokenHash: '',
        expiresAt,
      },
    });

    const newRefreshPayload = {
      userId: session.user.id,
      sessionId: newSession.id,
    };
    const newRefreshToken = generateRefreshToken(newRefreshPayload);

    await prisma.refreshSession.update({
      where: { id: newSession.id },
      data: { tokenHash: hashToken(newRefreshToken) },
    });

    // Issue new access token containing ONLY userId and role
    const newAccessToken = generateAccessToken({
      userId: session.user.id,
      role: session.user.role,
    });

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    };
  }

  async logout(token?: string): Promise<void> {
    if (!token) return;

    try {
      const payload = verifyRefreshToken(token);
      if (payload?.sessionId) {
        // Invalidate the session in PostgreSQL
        await prisma.refreshSession.updateMany({
          where: { id: payload.sessionId, isRevoked: false },
          data: { isRevoked: true },
        });
      }
    } catch {
      // Gracefully handle malformed or expired token during logout
    }
  }

  async getMe(userId: string): Promise<SafeUser> {
    // Retrieve safe user profile directly from PostgreSQL
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw notFound('USER_NOT_FOUND', 'User profile not found');
    }

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
    };
  }
}

export const authService = new AuthService();
