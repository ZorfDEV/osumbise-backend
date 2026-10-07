import { Router } from 'express';
import { listPlans } from '../controllers/plan.controller';
import { asyncHandler } from '../utils/jwt';

const router = Router();

router.get('/', asyncHandler(listPlans));

export default router;
