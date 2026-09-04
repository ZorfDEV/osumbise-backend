import { Router } from 'express';
import { protect, authorize } from '../middlewares/auth.middleware';
import { scopeTenant } from '../middlewares/tenant.middleware';
import { validate } from '../middlewares/validate.middleware';
import {
  createUserSchema,
  updateUserSchema,
  resetPasswordSchema,
} from '../validators/user.validator';
import {
  listUsers,
  createUser,
  updateUser,
  resetUserPassword,
} from '../controllers/user.controller';
import { asyncHandler } from '../utils/jwt';

const router = Router();

router.use(protect, scopeTenant, authorize('OWNER', 'ADMIN'));

router.get('/', asyncHandler(listUsers));
router.post('/', validate(createUserSchema), asyncHandler(createUser));
router.patch('/:id', validate(updateUserSchema), asyncHandler(updateUser));
router.post(
  '/:id/reset-password',
  validate(resetPasswordSchema),
  asyncHandler(resetUserPassword)
);

export default router;
