import { Router } from 'express';
import { protect, requirePlatformAdmin } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';
import {
  listOrganizations,
  getOrganization,
  updateSubscriptionAdmin,
  updateOwnerStatus,
  getRevenueSummary,
  listPendingPayments,
  reviewPayment,
} from '../controllers/platformAdmin.controller';
import {
  updateSubscriptionAdminSchema,
  updateOwnerStatusSchema,
  reviewPaymentSchema,
} from '../validators/platformAdmin.validator';
import { asyncHandler } from '../utils/jwt';

const router = Router();

router.use(protect, requirePlatformAdmin);

router.get('/revenue', asyncHandler(getRevenueSummary));
router.get('/payments/pending', asyncHandler(listPendingPayments));
router.post('/payments/:id/review', validate(reviewPaymentSchema), asyncHandler(reviewPayment));
router.get('/organizations', asyncHandler(listOrganizations));
router.get('/organizations/:id', asyncHandler(getOrganization));
router.patch(
  '/organizations/:id/subscription',
  validate(updateSubscriptionAdminSchema),
  asyncHandler(updateSubscriptionAdmin)
);
router.patch(
  '/organizations/:id/owner-status',
  validate(updateOwnerStatusSchema),
  asyncHandler(updateOwnerStatus)
);

export default router;
