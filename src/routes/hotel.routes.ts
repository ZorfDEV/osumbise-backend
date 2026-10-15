import { Router } from 'express';
import { protect, authorize } from '../middlewares/auth.middleware';
import { scopeTenant } from '../middlewares/tenant.middleware';
import { validate } from '../middlewares/validate.middleware';
import { asyncHandler } from '../utils/jwt';
import {
  addStayPaymentSchema,
  createRoomSchema,
  createStaySchema,
  updateRoomSchema,
  updateRoomStatusSchema,
  updateStaySchema,
  updateTaxRatesSchema,
} from '../validators/hotel.validator';
import {
  addStayPayment,
  cancelStay,
  checkIn,
  checkOut,
  createRoom,
  createStay,
  getStay,
  listRooms,
  listStays,
  listTaxRates,
  updateRoom,
  updateRoomStatus,
  updateStay,
  updateTaxRates,
} from '../controllers/hotel.controller';

const router = Router();

router.use(protect, scopeTenant);

// Réception : gère les séjours au quotidien
const FRONT_DESK = ['OWNER', 'ADMIN', 'CASHIER'] as const;
// Configuration de l'hôtel (chambres, tarifs, taxe de séjour)
const MANAGERS = ['OWNER', 'ADMIN'] as const;

// --- Chambres ---
router.get('/rooms', authorize(...FRONT_DESK), asyncHandler(listRooms));
router.post('/rooms', authorize(...MANAGERS), validate(createRoomSchema), asyncHandler(createRoom));
router.patch('/rooms/:id', authorize(...MANAGERS), validate(updateRoomSchema), asyncHandler(updateRoom));
// Ménage terminé / hors service : la réception peut le faire
router.patch(
  '/rooms/:id/status',
  authorize(...FRONT_DESK),
  validate(updateRoomStatusSchema),
  asyncHandler(updateRoomStatus)
);

// --- Taxe de séjour ---
router.get('/tax-rates', authorize(...FRONT_DESK), asyncHandler(listTaxRates));
router.put('/tax-rates', authorize(...MANAGERS), validate(updateTaxRatesSchema), asyncHandler(updateTaxRates));

// --- Séjours ---
router.get('/stays', authorize(...FRONT_DESK), asyncHandler(listStays));
router.post('/stays', authorize(...FRONT_DESK), validate(createStaySchema), asyncHandler(createStay));
router.get('/stays/:id', authorize(...FRONT_DESK), asyncHandler(getStay));
router.patch('/stays/:id', authorize(...FRONT_DESK), validate(updateStaySchema), asyncHandler(updateStay));
router.post('/stays/:id/check-in', authorize(...FRONT_DESK), asyncHandler(checkIn));
router.post('/stays/:id/check-out', authorize(...FRONT_DESK), asyncHandler(checkOut));
router.post('/stays/:id/cancel', authorize(...FRONT_DESK), asyncHandler(cancelStay));
router.post(
  '/stays/:id/payments',
  authorize(...FRONT_DESK),
  validate(addStayPaymentSchema),
  asyncHandler(addStayPayment)
);

export default router;
