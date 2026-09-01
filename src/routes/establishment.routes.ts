import { Router } from 'express';
import { protect, authorize } from '../middlewares/auth.middleware';
import { scopeTenant } from '../middlewares/tenant.middleware';
import { validate } from '../middlewares/validate.middleware';
import {
  createEstablishmentSchema,
  updateEstablishmentSchema,
} from '../validators/establishment.validator';
import {
  listEstablishments,
  createEstablishment,
  updateEstablishment,
} from '../controllers/establishment.controller';
import { asyncHandler } from '../utils/jwt';

const router = Router();

router.use(protect, scopeTenant);

router.get('/', asyncHandler(listEstablishments));
router.post(
  '/',
  authorize('OWNER', 'ADMIN'),
  validate(createEstablishmentSchema),
  asyncHandler(createEstablishment)
);
router.patch(
  '/:id',
  authorize('OWNER', 'ADMIN'),
  validate(updateEstablishmentSchema),
  asyncHandler(updateEstablishment)
);

export default router;
