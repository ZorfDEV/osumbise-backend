import { Router } from 'express';
import { protect, authorize } from '../middlewares/auth.middleware';
import { scopeTenant } from '../middlewares/tenant.middleware';
import { validate } from '../middlewares/validate.middleware';
import { createCategorySchema, updateCategorySchema } from '../validators/category.validator';
import {
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
} from '../controllers/category.controller';
import { asyncHandler } from '../utils/jwt';

const router = Router();

router.use(protect, scopeTenant);

router.get('/', asyncHandler(listCategories));
router.post(
  '/',
  authorize('OWNER', 'ADMIN', 'STOCK_KEEPER'),
  validate(createCategorySchema),
  asyncHandler(createCategory)
);
router.patch(
  '/:id',
  authorize('OWNER', 'ADMIN', 'STOCK_KEEPER'),
  validate(updateCategorySchema),
  asyncHandler(updateCategory)
);
router.delete('/:id', authorize('OWNER', 'ADMIN', 'STOCK_KEEPER'), asyncHandler(deleteCategory));

export default router;
