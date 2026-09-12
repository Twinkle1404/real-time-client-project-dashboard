import './config/env';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { env } from './config/env';
import authRouter from './modules/auth/auth.routes';
import testRouter from './modules/test/test.routes';
import projectRouter from './modules/projects/project.routes';
import tasksRouter from './modules/tasks/task.routes';
import notificationRouter from './modules/notifications/notification.routes';
import { errorHandler, notFoundHandler } from './middleware/error.middleware';

import http from 'http';
import { initSocketServer, getIO } from './realtime/socket';
import { startBackgroundJobs, stopBackgroundJobs } from './jobs';

const app = express();
const httpServer = http.createServer(app);

// Initialize Socket.IO on the HTTP server
initSocketServer(httpServer);

// Secure CORS configuration with credentials support
app.use(
  cors({
    origin: env.FRONTEND_URL,
    credentials: true,
  })
);

// Standard parsers
app.use(cookieParser());
app.use(express.json());

// Health check endpoint
app.get('/api/health', (_req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Mount module routers
app.use('/api/auth', authRouter);
app.use('/api/test', testRouter);
app.use('/api/projects', projectRouter);
app.use('/api/tasks', tasksRouter);
app.use('/api/notifications', notificationRouter);

// 404 handler for unknown routes
app.use(notFoundHandler);

// Global structured error handling middleware
app.use(errorHandler);

if (require.main === module) {
  httpServer.listen(env.PORT, () => {
    console.log(`Server running on http://localhost:${env.PORT}`);
    startBackgroundJobs();
  });
}

export { app, httpServer, initSocketServer, getIO, startBackgroundJobs, stopBackgroundJobs };
export default app;
