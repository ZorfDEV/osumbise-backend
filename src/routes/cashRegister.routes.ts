import { Router } from 'express';
import { protect, authorize } from '../middlewares/auth.middleware';
import { scopeTenant } from '../middlewares/tenant.middleware';
import { validate } from '../middlewares/validate.middleware';
import { createCashRegisterSchema } from '../validators/cashRegister.validator';
import { openCashSessionSchema } from '../validators/cashSession.validator';
import { listCashRegisters, createCashRegister } from '../controllers/cashRegister.controller';
import { openCashSession, listSessionsForRegister } from '../controllers/cashSession.controller';
import { asyncHandler } from '../utils/jwt';

const router = Router();

router.use(protect, scopeTenant);

router.get('/', asyncHandler(listCashRegisters));
router.post(
  '/',
  authorize('OWNER', 'ADMIN'),
  validate(createCashRegisterSchema),
  asyncHandler(createCashRegister)
);

router.get('/:registerId/sessions', asyncHandler(listSessionsForRegister));
router.post(
  '/:registerId/sessions',
  authorize('OWNER', 'ADMIN', 'CASHIER'),
  validate(openCashSessionSchema),
  asyncHandler(openCashSession)
);

export default router;
