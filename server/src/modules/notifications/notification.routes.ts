import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.middleware';
import { notificationController } from './notification.controller';

const router = Router();

// All notification routes require authentication
router.use(requireAuth);

router.get('/', (req, res, next) => notificationController.list(req, res, next));
router.get('/unread-count', (req, res, next) => notificationController.getUnreadCount(req, res, next));
router.patch('/:id/read', (req, res, next) => notificationController.markAsRead(req, res, next));
router.patch('/read-all', (req, res, next) => notificationController.markAllAsRead(req, res, next));

export default router;
