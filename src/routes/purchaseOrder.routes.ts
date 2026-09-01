import { Router } from 'express';
import { protect, authorize } from '../middlewares/auth.middleware';
import { scopeTenant } from '../middlewares/tenant.middleware';
import { validate } from '../middlewares/validate.middleware';
import {
  createPurchaseOrderSchema,
  addPurchaseItemSchema,
  updatePurchaseItemSchema,
  updatePurchaseOrderStatusSchema,
} from '../validators/purchaseOrder.validator';
import {
  listPurchaseOrders,
  getPurchaseOrder,
  createPurchaseOrder,
  addPurchaseItem,
  updatePurchaseItem,
  removePurchaseItem,
  updatePurchaseOrderStatus,
  receivePurchaseOrderHandler,
} from '../controllers/purchaseOrder.controller';
import { asyncHandler } from '../utils/jwt';

const router = Router();

router.use(protect, scopeTenant);

const PURCHASE_ROLES = ['OWNER', 'ADMIN', 'STOCK_KEEPER'] as const;

router.get('/', asyncHandler(listPurchaseOrders));
router.get('/:id', asyncHandler(getPurchaseOrder));
router.post(
  '/',
  authorize(...PURCHASE_ROLES),
  validate(createPurchaseOrderSchema),
  asyncHandler(createPurchaseOrder)
);

router.post(
  '/:id/items',
  authorize(...PURCHASE_ROLES),
  validate(addPurchaseItemSchema),
  asyncHandler(addPurchaseItem)
);
router.patch(
  '/:id/items/:itemId',
  authorize(...PURCHASE_ROLES),
  validate(updatePurchaseItemSchema),
  asyncHandler(updatePurchaseItem)
);
router.delete(
  '/:id/items/:itemId',
  authorize(...PURCHASE_ROLES),
  asyncHandler(removePurchaseItem)
);

router.patch(
  '/:id/status',
  authorize(...PURCHASE_ROLES),
  validate(updatePurchaseOrderStatusSchema),
  asyncHandler(updatePurchaseOrderStatus)
);
router.post('/:id/receive', authorize(...PURCHASE_ROLES), asyncHandler(receivePurchaseOrderHandler));

export default router;
