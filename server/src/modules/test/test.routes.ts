import { Router, Request, Response } from 'express';
import { Role } from '@prisma/client';
import { requireAuth, requireRole } from '../../middleware/auth.middleware';

const router = Router();

// Test route accessible ONLY to ADMIN
router.get('/admin', requireAuth, requireRole(Role.ADMIN), (req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    message: 'Welcome Admin',
    user: req.user,
  });
});

// Test route accessible ONLY to PM
router.get('/pm', requireAuth, requireRole(Role.PM), (req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    message: 'Welcome Project Manager',
    user: req.user,
  });
});

// Test route accessible ONLY to DEVELOPER
router.get('/developer', requireAuth, requireRole(Role.DEVELOPER), (req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    message: 'Welcome Developer',
    user: req.user,
  });
});

// Test route accessible to ADMIN and PM
router.get('/admin-pm', requireAuth, requireRole(Role.ADMIN, Role.PM), (req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    message: 'Welcome Management (Admin/PM)',
    user: req.user,
  });
});

export default router;
