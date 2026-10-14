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
  uploadEstablishmentLogo,
  removeEstablishmentLogo,
} from '../controllers/establishment.controller';
import { uploadEstablishmentLogo as uploadEstablishmentLogoMiddleware } from '../middlewares/upload.middleware';
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
// Logo envoyé depuis le poste (png/jpg, 1 Mo max), affiché sur les tickets
router.post(
  '/:id/logo',
  authorize('OWNER', 'ADMIN'),
  uploadEstablishmentLogoMiddleware,
  asyncHandler(uploadEstablishmentLogo)
);
router.delete('/:id/logo', authorize('OWNER', 'ADMIN'), asyncHandler(removeEstablishmentLogo));

export default router;
