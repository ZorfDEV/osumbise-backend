import { Router } from 'express';
import { protect, authorize } from '../middlewares/auth.middleware';
import { scopeTenant } from '../middlewares/tenant.middleware';
import { validate } from '../middlewares/validate.middleware';
import { entrySchema, lossSchema, adjustmentSchema, transferSchema, correctionSchema } from '../validators/stock.validator';
import {
  createEntry,
  createLoss,
  createAdjustment,
  listMovements,
  listAlerts,
  createTransfer,
  correctMovement,
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

// Déstockage réserve → vente, et correction d'une entrée (motif obligatoire)
router.post('/transfer', authorize('OWNER', 'ADMIN', 'STOCK_KEEPER'), validate(transferSchema), asyncHandler(createTransfer));
router.post('/movements/:id/correct', authorize('OWNER', 'ADMIN', 'STOCK_KEEPER'), validate(correctionSchema), asyncHandler(correctMovement));

export default router;
