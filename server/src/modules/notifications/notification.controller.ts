import { Request, Response, NextFunction } from 'express';
import { notificationService } from './notification.service';
import { parsePaginationParams, validateUuidParam, getParamString } from './notification.validation';

export class NotificationController {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { page, limit } = parsePaginationParams(req.query);
      const result = await notificationService.listNotifications(req.user!.userId, page, limit);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async getUnreadCount(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const unreadCount = await notificationService.getUnreadCount(req.user!.userId);
      res.status(200).json({
        success: true,
        data: { unreadCount },
      });
    } catch (error) {
      next(error);
    }
  }

  async markAsRead(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const notificationId = getParamString(req.params.id);
      validateUuidParam(notificationId, 'notificationId');
      const notification = await notificationService.markAsRead(req.user!.userId, notificationId);
      res.status(200).json({
        success: true,
        data: { notification },
      });
    } catch (error) {
      next(error);
    }
  }

  async markAllAsRead(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await notificationService.markAllAsRead(req.user!.userId);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const notificationController = new NotificationController();
