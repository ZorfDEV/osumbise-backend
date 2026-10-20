import { Router } from 'express';
import { protect, authorize } from '../middlewares/auth.middleware';
import { scopeTenant } from '../middlewares/tenant.middleware';
import { validate } from '../middlewares/validate.middleware';
import { createExpenseSchema } from '../validators/expense.validator';
import { listExpenses, createExpense } from '../controllers/expense.controller';
import { asyncHandler } from '../utils/jwt';

const router = Router();

router.use(protect, scopeTenant);

router.get('/', authorize('OWNER', 'ADMIN'), asyncHandler(listExpenses));
router.post(
  '/',
  authorize('OWNER', 'ADMIN'),
  validate(createExpenseSchema),
  asyncHandler(createExpense)
);

export default router;
