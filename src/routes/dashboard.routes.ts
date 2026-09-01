import { Router } from 'express';
import { protect, authorize } from '../middlewares/auth.middleware';
import { scopeTenant } from '../middlewares/tenant.middleware';
import {
  getSummary,
  getHourlySales,
  getStaffPerformance,
} from '../controllers/dashboard.controller';
import { asyncHandler } from '../utils/jwt';

const router = Router();

router.use(protect, scopeTenant);

// Réservé à l'encadrement : un serveur n'a pas à voir le CA ou les
// performances de ses collègues
router.get('/summary', authorize('OWNER', 'ADMIN'), asyncHandler(getSummary));
router.get('/hourly-sales', authorize('OWNER', 'ADMIN'), asyncHandler(getHourlySales));
router.get('/staff-performance', authorize('OWNER', 'ADMIN'), asyncHandler(getStaffPerformance));

export default router;
