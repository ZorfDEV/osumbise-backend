import { Router } from 'express';
import { protect, authorize } from '../middlewares/auth.middleware';
import { scopeTenant } from '../middlewares/tenant.middleware';
import { validate } from '../middlewares/validate.middleware';
import { createCashRegisterSchema, lockCashRegisterSchema } from '../validators/cashRegister.validator';
import { openCashSessionSchema } from '../validators/cashSession.validator';
import { listCashRegisters, createCashRegister, lockCashRegister } from '../controllers/cashRegister.controller';
import { openCashSession, listSessionsForRegister } from '../controllers/cashSession.controller';
import { asyncHandler } from '../utils/jwt';

const router = Router();

router.use(protect, scopeTenant);

router.get('/', asyncHandler(listCashRegisters));
// Caissière autorisée : 2 caisses par jour au plus (contrôlé dans le controller)
router.post(
  '/',
  authorize('OWNER', 'ADMIN', 'CASHIER'),
  validate(createCashRegisterSchema),
  asyncHandler(createCashRegister)
);

// Verrouiller / déverrouiller une caisse : propriétaire uniquement
router.patch('/:id/lock', authorize('OWNER'), validate(lockCashRegisterSchema), asyncHandler(lockCashRegister));

router.get('/:registerId/sessions', asyncHandler(listSessionsForRegister));
router.post(
  '/:registerId/sessions',
  authorize('OWNER', 'ADMIN', 'CASHIER'),
  validate(openCashSessionSchema),
  asyncHandler(openCashSession)
);

export default router;
