import { Router } from 'express';
import { protect, authorize } from '../middlewares/auth.middleware';
import { scopeTenant } from '../middlewares/tenant.middleware';
import { validate } from '../middlewares/validate.middleware';
import {
  createRecipeItemSchema,
  updateRecipeItemSchema,
} from '../validators/recipeItem.validator';
import {
  addRecipeItem,
  updateRecipeItem,
  removeRecipeItem,
} from '../controllers/recipeItem.controller';
import { asyncHandler } from '../utils/jwt';

// mergeParams: true — nécessaire pour lire :productId depuis la route parente
// (product.routes.ts monte ce routeur sur /:productId/recipe-items)
const router = Router({ mergeParams: true });

router.use(protect, scopeTenant);

router.post(
  '/',
  authorize('OWNER', 'ADMIN', 'STOCK_KEEPER'),
  validate(createRecipeItemSchema),
  asyncHandler(addRecipeItem)
);
router.patch(
  '/:recipeItemId',
  authorize('OWNER', 'ADMIN', 'STOCK_KEEPER'),
  validate(updateRecipeItemSchema),
  asyncHandler(updateRecipeItem)
);
router.delete(
  '/:recipeItemId',
  authorize('OWNER', 'ADMIN', 'STOCK_KEEPER'),
  asyncHandler(removeRecipeItem)
);

export default router;
