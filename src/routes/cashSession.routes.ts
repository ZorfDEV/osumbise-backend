import { Router } from 'express';
import { protect, authorize } from '../middlewares/auth.middleware';
import { scopeTenant } from '../middlewares/tenant.middleware';
import { validate } from '../middlewares/validate.middleware';
import {
  closeCashSessionSchema,
  createCashMovementSchema,
} from '../validators/cashSession.validator';
import {
  getCashSession,
  closeCashSession,
  createCashMovement,
} from '../controllers/cashSession.controller';
import { asyncHandler } from '../utils/jwt';

const router = Router();

router.use(protect, scopeTenant);

router.get('/:id', asyncHandler(getCashSession));
router.post(
  '/:id/close',
  authorize('OWNER', 'ADMIN', 'CASHIER'),
  validate(closeCashSessionSchema),
  asyncHandler(closeCashSession)
);
router.post(
  '/:id/movements',
  authorize('OWNER', 'ADMIN', 'CASHIER'),
  validate(createCashMovementSchema),
  asyncHandler(createCashMovement)
);

export default router;
