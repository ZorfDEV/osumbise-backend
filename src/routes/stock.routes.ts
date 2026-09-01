import { Router } from 'express';
import { protect, authorize } from '../middlewares/auth.middleware';
import { scopeTenant } from '../middlewares/tenant.middleware';
import { validate } from '../middlewares/validate.middleware';
import { entrySchema, lossSchema, adjustmentSchema } from '../validators/stock.validator';
import {
  createEntry,
  createLoss,
  createAdjustment,
  listMovements,
  listAlerts,
} from '../controllers/stock.controller';
import { asyncHandler } from '../utils/jwt';

const router = Router();

router.use(protect, scopeTenant);

router.get('/movements', asyncHandler(listMovements));
router.get('/alerts', asyncHandler(listAlerts));

router.post(
  '/entries',
  authorize('OWNER', 'ADMIN', 'STOCK_KEEPER'),
  validate(entrySchema),
  asyncHandler(createEntry)
);
router.post(
  '/losses',
  authorize('OWNER', 'ADMIN', 'STOCK_KEEPER'),
  validate(lossSchema),
  asyncHandler(createLoss)
);
router.post(
  '/adjustments',
  authorize('OWNER', 'ADMIN', 'STOCK_KEEPER'),
  validate(adjustmentSchema),
  asyncHandler(createAdjustment)
);

export default router;
