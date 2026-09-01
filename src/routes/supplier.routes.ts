import { Router } from 'express';
import { protect, authorize } from '../middlewares/auth.middleware';
import { scopeTenant } from '../middlewares/tenant.middleware';
import { validate } from '../middlewares/validate.middleware';
import { createSupplierSchema, updateSupplierSchema } from '../validators/supplier.validator';
import {
  listSuppliers,
  getSupplier,
  createSupplier,
  updateSupplier,
  deleteSupplier,
} from '../controllers/supplier.controller';
import { asyncHandler } from '../utils/jwt';

const router = Router();

router.use(protect, scopeTenant);

router.get('/', asyncHandler(listSuppliers));
router.get('/:id', asyncHandler(getSupplier));
router.post(
  '/',
  authorize('OWNER', 'ADMIN', 'STOCK_KEEPER'),
  validate(createSupplierSchema),
  asyncHandler(createSupplier)
);
router.patch(
  '/:id',
  authorize('OWNER', 'ADMIN', 'STOCK_KEEPER'),
  validate(updateSupplierSchema),
  asyncHandler(updateSupplier)
);
router.delete('/:id', authorize('OWNER', 'ADMIN'), asyncHandler(deleteSupplier));

export default router;
