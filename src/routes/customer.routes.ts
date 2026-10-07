import { Router } from 'express';
import { protect, authorize } from '../middlewares/auth.middleware';
import { scopeTenant } from '../middlewares/tenant.middleware';
import { validate } from '../middlewares/validate.middleware';
import {
  createCustomerSchema,
  updateCustomerSchema,
  recordCustomerPaymentSchema,
} from '../validators/customer.validator';
import {
  listCustomers,
  getCustomer,
  createCustomer,
  updateCustomer,
  recordCustomerPayment,
} from '../controllers/customer.controller';
import { asyncHandler } from '../utils/jwt';

const router = Router();

router.use(protect, scopeTenant);

router.get('/', asyncHandler(listCustomers));
router.get('/:id', asyncHandler(getCustomer));
router.post(
  '/',
  authorize('OWNER', 'ADMIN', 'CASHIER'),
  validate(createCustomerSchema),
  asyncHandler(createCustomer)
);
router.patch(
  '/:id',
  authorize('OWNER', 'ADMIN', 'CASHIER'),
  validate(updateCustomerSchema),
  asyncHandler(updateCustomer)
);
router.post(
  '/:id/payments',
  authorize('OWNER', 'ADMIN', 'CASHIER'),
  validate(recordCustomerPaymentSchema),
  asyncHandler(recordCustomerPayment)
);

export default router;
