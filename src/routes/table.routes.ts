import { Router } from 'express';
import { protect, authorize } from '../middlewares/auth.middleware';
import { scopeTenant } from '../middlewares/tenant.middleware';
import { validate } from '../middlewares/validate.middleware';
import { createTableSchema, updateTableStatusSchema, updateTableSchema } from '../validators/table.validator';
import {
  listTables,
  createTable,
  updateTableStatus,
  updateTable,
  deleteTable,
} from '../controllers/table.controller';
import { asyncHandler } from '../utils/jwt';

const router = Router();

router.use(protect, scopeTenant);

router.get('/', asyncHandler(listTables));
router.post(
  '/',
  authorize('OWNER', 'ADMIN'),
  validate(createTableSchema),
  asyncHandler(createTable)
);
router.patch(
  '/:id/status',
  authorize('OWNER', 'ADMIN', 'SERVER', 'CASHIER'),
  validate(updateTableStatusSchema),
  asyncHandler(updateTableStatus)
);
router.patch(
  '/:id',
  authorize('OWNER', 'ADMIN'),
  validate(updateTableSchema),
  asyncHandler(updateTable)
);
router.delete('/:id', authorize('OWNER', 'ADMIN'), asyncHandler(deleteTable));

export default router;
