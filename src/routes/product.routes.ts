import { Router } from 'express';
import { protect, authorize } from '../middlewares/auth.middleware';
import { scopeTenant } from '../middlewares/tenant.middleware';
import { validate } from '../middlewares/validate.middleware';
import { createProductSchema, updateProductSchema } from '../validators/product.validator';
import {
  listProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
} from '../controllers/product.controller';
import { asyncHandler } from '../utils/jwt';
import recipeItemRoutes from './recipeItem.routes';

const router = Router();

router.use(protect, scopeTenant);

router.get('/', asyncHandler(listProducts));
router.get('/:id', asyncHandler(getProduct));
router.post(
  '/',
  authorize('OWNER', 'ADMIN', 'STOCK_KEEPER'),
  validate(createProductSchema),
  asyncHandler(createProduct)
);
router.patch(
  '/:id',
  authorize('OWNER', 'ADMIN', 'STOCK_KEEPER'),
  validate(updateProductSchema),
  asyncHandler(updateProduct)
);
router.delete('/:id', authorize('OWNER', 'ADMIN'), asyncHandler(deleteProduct));

router.use('/:productId/recipe-items', recipeItemRoutes);

export default router;
