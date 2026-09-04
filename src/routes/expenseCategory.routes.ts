import { Router } from 'express';
import { protect, authorize } from '../middlewares/auth.middleware';
import { scopeTenant } from '../middlewares/tenant.middleware';
import { validate } from '../middlewares/validate.middleware';
import { createExpenseCategorySchema } from '../validators/expense.validator';
import { listExpenseCategories, createExpenseCategory } from '../controllers/expense.controller';
import { asyncHandler } from '../utils/jwt';

const router = Router();

router.use(protect, scopeTenant);

router.get('/', asyncHandler(listExpenseCategories));
router.post(
  '/',
  authorize('OWNER', 'ADMIN', 'CASHIER'),
  validate(createExpenseCategorySchema),
  asyncHandler(createExpenseCategory)
);

export default router;
