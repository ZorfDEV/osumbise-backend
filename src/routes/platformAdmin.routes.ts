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
  listPlanRequests,
  reviewPlanRequest,
} from '../controllers/platformAdmin.controller';
import {
  updateSubscriptionAdminSchema,
  updateOwnerStatusSchema,
  reviewPaymentSchema,
  reviewPlanRequestSchema,
} from '../validators/platformAdmin.validator';
import { asyncHandler } from '../utils/jwt';

const router = Router();

router.use(protect, requirePlatformAdmin);

router.get('/revenue', asyncHandler(getRevenueSummary));
router.get('/payments/pending', asyncHandler(listPendingPayments));
router.post('/payments/:id/review', validate(reviewPaymentSchema), asyncHandler(reviewPayment));
router.get('/plan-requests', asyncHandler(listPlanRequests));
router.post('/plan-requests/:id/review', validate(reviewPlanRequestSchema), asyncHandler(reviewPlanRequest));
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
