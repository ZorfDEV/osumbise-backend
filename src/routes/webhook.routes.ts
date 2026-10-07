import { Router } from 'express';
import { handleAirtelMoneyWebhook } from '../controllers/webhook.controller';
import { asyncHandler } from '../utils/jwt';

const router = Router();

router.post('/airtel-money', asyncHandler(handleAirtelMoneyWebhook));

export default router;
