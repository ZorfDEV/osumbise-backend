import path from 'path';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import { notFound, errorHandler } from './middlewares/error.middleware';
import authRoutes from './routes/auth.routes';
import establishmentRoutes from './routes/establishment.routes';
import categoryRoutes from './routes/category.routes';
import productRoutes from './routes/product.routes';
import stockRoutes from './routes/stock.routes';
import tableRoutes from './routes/table.routes';
import orderRoutes from './routes/order.routes';
import cashRegisterRoutes from './routes/cashRegister.routes';
import cashSessionRoutes from './routes/cashSession.routes';
import dashboardRoutes from './routes/dashboard.routes';
import reportRoutes from './routes/report.routes';
import userRoutes from './routes/user.routes';
import supplierRoutes from './routes/supplier.routes';
import purchaseOrderRoutes from './routes/purchaseOrder.routes';
import expenseCategoryRoutes from './routes/expenseCategory.routes';
import expenseRoutes from './routes/expense.routes';
import planRoutes from './routes/plan.routes';
import subscriptionRoutes from './routes/subscription.routes';
import webhookRoutes from './routes/webhook.routes';
import platformAdminRoutes from './routes/platformAdmin.routes';
import customerRoutes from './routes/customer.routes';

const app = express();

// credentials: true + origin explicite sont obligatoires pour que le navigateur
// accepte d'envoyer/recevoir le cookie HttpOnly depuis le dashboard web
app.use(
  cors({
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true,
  })
);
app.use(helmet());
app.use(
  express.json({
    verify: (req, _res, buf) => {
      // Nécessaire pour recalculer le hash HMAC des webhooks (Airtel Money) —
      // le recalculer à partir de req.body déjà parsé risquerait de donner un
      // JSON légèrement différent (ordre des clés, espaces) et de faire
      // échouer la comparaison même quand la notification est authentique.
      req.rawBody = buf;
    },
  })
);
app.use(cookieParser());

if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
}

app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.use(
  '/api/uploads',
  express.static(path.join(process.cwd(), 'uploads'), {
    setHeaders: (res) => {
      // Nécessaire pour que le frontend (autre origine en prod) puisse
      // afficher ces images dans une balise <img> malgré helmet()
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    },
  })
);

app.use('/api/auth', authRoutes);
app.use('/api/establishments', establishmentRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/products', productRoutes);
app.use('/api/stock', stockRoutes);
app.use('/api/tables', tableRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/cash-registers', cashRegisterRoutes);
app.use('/api/cash-sessions', cashSessionRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/users', userRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/purchase-orders', purchaseOrderRoutes);
app.use('/api/expense-categories', expenseCategoryRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/plans', planRoutes);
app.use('/api/subscription', subscriptionRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api/platform-admin', platformAdminRoutes);
app.use('/api/customers', customerRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;
