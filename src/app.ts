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
app.use(express.json());
app.use(cookieParser());

if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
}

app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

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

app.use(notFound);
app.use(errorHandler);

export default app;
