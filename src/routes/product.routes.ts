import { Router } from 'express';
import { protect, authorize } from '../middlewares/auth.middleware';
import { scopeTenant } from '../middlewares/tenant.middleware';
import { validate } from '../middlewares/validate.middleware';
import { uploadProductImage as uploadProductImageMiddleware } from '../middlewares/upload.middleware';
import { createProductSchema, updateProductSchema, updateProductSidesSchema } from '../validators/product.validator';
import {
  listProducts,
  getProduct,
  createProduct,
  updateProduct,
  uploadProductImage,
  deleteProduct,
  updateProductSides,
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
router.post(
  '/:id/image',
  authorize('OWNER', 'ADMIN', 'STOCK_KEEPER'),
  uploadProductImageMiddleware,
  asyncHandler(uploadProductImage)
);
// Accompagnements proposés avec un plat (riz, banane…)
router.put(
  '/:id/sides',
  authorize('OWNER', 'ADMIN', 'STOCK_KEEPER'),
  validate(updateProductSidesSchema),
  asyncHandler(updateProductSides)
);
router.delete('/:id', authorize('OWNER', 'ADMIN', 'STOCK_KEEPER'), asyncHandler(deleteProduct));

router.use('/:productId/recipe-items', recipeItemRoutes);

export default router;
