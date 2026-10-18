import { Router } from 'express';
import { protect, authorize } from '../middlewares/auth.middleware';
import { scopeTenant } from '../middlewares/tenant.middleware';
import { validate } from '../middlewares/validate.middleware';
import { asyncHandler } from '../utils/jwt';
import {
  addStayPaymentSchema,
  cancelStaySchema,
  hotelServiceSchema,
  updateHotelServiceSchema,
  stayChargeSchema,
  createRoomSchema,
  createStaySchema,
  updateRoomSchema,
  updateRoomStatusSchema,
  updateStaySchema,
  updateTaxRatesSchema,
  createStayGroupSchema,
  groupPaymentSchema,
} from '../validators/hotel.validator';
import {
  addStayGroupPayment,
  checkInStayGroup,
  checkOutStayGroup,
  createStayGroup,
  getStayGroup,
  listStayGroups,
} from '../controllers/stayGroup.controller';
import {
  addStayCharge,
  createHotelService,
  deleteStayCharge,
  listHotelServices,
  updateHotelService,
} from '../controllers/hotelService.controller';
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
router.post('/stays/:id/cancel', authorize(...FRONT_DESK), validate(cancelStaySchema), asyncHandler(cancelStay));
router.post(
  '/stays/:id/payments',
  authorize(...FRONT_DESK),
  validate(addStayPaymentSchema),
  asyncHandler(addStayPayment)
);


// Réservations de groupe (entreprise) : facture unique
router.get('/groups', authorize(...FRONT_DESK), asyncHandler(listStayGroups));
router.post('/groups', authorize(...FRONT_DESK), validate(createStayGroupSchema), asyncHandler(createStayGroup));
router.get('/groups/:id', authorize(...FRONT_DESK), asyncHandler(getStayGroup));
router.post('/groups/:id/check-in', authorize(...FRONT_DESK), asyncHandler(checkInStayGroup));
router.post('/groups/:id/check-out', authorize(...FRONT_DESK), asyncHandler(checkOutStayGroup));
router.post('/groups/:id/payments', authorize(...FRONT_DESK), validate(groupPaymentSchema), asyncHandler(addStayGroupPayment));

// Prestations de l'hôtel : catalogue (responsables) et ajout à un séjour (réception)
router.get('/services', authorize(...FRONT_DESK), asyncHandler(listHotelServices));
router.post('/services', authorize(...MANAGERS), validate(hotelServiceSchema), asyncHandler(createHotelService));
router.patch('/services/:id', authorize(...MANAGERS), validate(updateHotelServiceSchema), asyncHandler(updateHotelService));
router.post('/stays/:id/charges', authorize(...FRONT_DESK), validate(stayChargeSchema), asyncHandler(addStayCharge));
router.delete('/stays/:id/charges/:chargeId', authorize(...FRONT_DESK), asyncHandler(deleteStayCharge));

export default router;
