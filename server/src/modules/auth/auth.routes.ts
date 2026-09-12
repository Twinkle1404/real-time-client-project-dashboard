import { Router } from 'express';
import { authController } from './auth.controller';
import { validateLogin } from './auth.validation';
import { requireAuth } from '../../middleware/auth.middleware';

const router = Router();

router.post('/login', validateLogin, (req, res, next) => authController.login(req, res, next));
router.post('/refresh', (req, res, next) => authController.refresh(req, res, next));
router.post('/logout', (req, res, next) => authController.logout(req, res, next));
router.get('/me', requireAuth, (req, res, next) => authController.me(req, res, next));

export default router;
