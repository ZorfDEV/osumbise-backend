import { Router } from 'express';
import { protect, authorize } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';
import {
  getSubscription,
  selectPlan,
  initiatePayment,
  getPaymentStatus,
} from '../controllers/subscription.controller';
import { selectPlanSchema } from '../validators/subscription.validator';
import { initiatePaymentSchema } from '../validators/subscriptionPayment.validator';
import { asyncHandler } from '../utils/jwt';

const router = Router();

router.get('/', protect, authorize('OWNER'), asyncHandler(getSubscription));
router.post(
  '/',
  protect,
  authorize('OWNER'),
  validate(selectPlanSchema),
  asyncHandler(selectPlan)
);
router.post(
  '/pay',
  protect,
  authorize('OWNER'),
  validate(initiatePaymentSchema),
  asyncHandler(initiatePayment)
);
router.get('/pay/:paymentId', protect, authorize('OWNER'), asyncHandler(getPaymentStatus));

export default router;
