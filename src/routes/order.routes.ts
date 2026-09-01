import { Router } from 'express';
import { protect, authorize } from '../middlewares/auth.middleware';
import { scopeTenant } from '../middlewares/tenant.middleware';
import { validate } from '../middlewares/validate.middleware';
import {
  createOrderSchema,
  addOrderItemSchema,
  updateOrderItemSchema,
  updateOrderStatusSchema,
} from '../validators/order.validator';
import { payOrderSchema } from '../validators/payment.validator';
import {
  listOrders,
  getOrder,
  createOrder,
  addOrderItem,
  updateOrderItem,
  removeOrderItem,
  updateOrderStatus,
  payOrderHandler,
} from '../controllers/order.controller';
import { asyncHandler } from '../utils/jwt';

const router = Router();

router.use(protect, scopeTenant);

const FLOOR_STAFF = ['OWNER', 'ADMIN', 'SERVER', 'CASHIER'] as const;

router.get('/', asyncHandler(listOrders));
router.get('/:id', asyncHandler(getOrder));

router.post('/', authorize(...FLOOR_STAFF), validate(createOrderSchema), asyncHandler(createOrder));

router.post(
  '/:id/items',
  authorize(...FLOOR_STAFF),
  validate(addOrderItemSchema),
  asyncHandler(addOrderItem)
);
router.patch(
  '/:id/items/:itemId',
  authorize(...FLOOR_STAFF),
  validate(updateOrderItemSchema),
  asyncHandler(updateOrderItem)
);
router.delete('/:id/items/:itemId', authorize(...FLOOR_STAFF), asyncHandler(removeOrderItem));

// COOK inclus : c'est lui qui fait avancer EN_PREPARATION -> PRETE en cuisine
router.patch(
  '/:id/status',
  authorize('OWNER', 'ADMIN', 'SERVER', 'CASHIER', 'COOK'),
  validate(updateOrderStatusSchema),
  asyncHandler(updateOrderStatus)
);

// Caissier (+ owner/admin) uniquement : c'est un encaissement réel
router.post(
  '/:id/pay',
  authorize('OWNER', 'ADMIN', 'CASHIER'),
  validate(payOrderSchema),
  asyncHandler(payOrderHandler)
);

export default router;
