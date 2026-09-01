import { Router } from 'express';
import { register, login, logout, me } from '../controllers/auth.controller';
import { validate } from '../middlewares/validate.middleware';
import { registerSchema, loginSchema } from '../validators/auth.validator';
import { protect } from '../middlewares/auth.middleware';
import { asyncHandler } from '../utils/jwt';

const router = Router();

router.post('/register', validate(registerSchema), asyncHandler(register));
router.post('/login', validate(loginSchema), asyncHandler(login));
router.post('/logout', logout);
router.get('/me', protect, asyncHandler(me));

export default router;
