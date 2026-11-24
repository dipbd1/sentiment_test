import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import morgan from 'morgan';
import { HttpError } from './lib/httpError.js';
import { errorHandler } from './middleware/errorHandler.js';
import adminRoutes from './routes/admin.js';
import authRoutes from './routes/auth.js';
import postRoutes from './routes/posts.js';
import supportRoutes from './routes/support.js';

const authRequestLimit = process.env.NODE_ENV === 'test' ? 10000 : 10;

const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: authRequestLimit,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      message: 'Too many requests',
      code: 'RATE_LIMITED',
    },
  },
});

export const app = express();

app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true,
}));
app.use(morgan('dev', {
  skip: () => process.env.NODE_ENV === 'test',
}));
app.use(express.json());

app.use('/api/auth', authLimiter);
app.use('/api/auth', authRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/support', supportRoutes);

app.use((req, res, next) => {
  next(new HttpError(404, 'NOT_FOUND', 'Not found'));
});

app.use(errorHandler);
