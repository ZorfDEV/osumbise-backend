import { Router } from 'express';
import { protect, authorize } from '../middlewares/auth.middleware';
import { scopeTenant } from '../middlewares/tenant.middleware';
import { getReport, exportReportCsv, exportReportPdf } from '../controllers/report.controller';
import { asyncHandler } from '../utils/jwt';

const router = Router();

router.use(protect, scopeTenant, authorize('OWNER', 'ADMIN'));

// Tous acceptent : ?date=YYYY-MM-DD (jour, défaut aujourd'hui)
//              ou : ?period=month&date=YYYY-MM (mois)
//              ou : ?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD (plage libre)
router.get('/', asyncHandler(getReport));
router.get('/csv', asyncHandler(exportReportCsv));
router.get('/pdf', asyncHandler(exportReportPdf));

export default router;
