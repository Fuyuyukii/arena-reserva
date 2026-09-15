import express from 'express';
import cors from 'cors';
import { userRouter } from '@/modules/users/user.routes';
import { courtRouter } from '@/modules/courts/court.routes';
import { bookingRouter } from '@/modules/bookings/booking.routes';
import { errorHandler } from '@/middlewares/errorHandler';
import { env } from '@/config/env';

export const app = express();

app.use(cors({ origin: env.corsOrigin }));
app.use(express.json());

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.use('/users', userRouter);
app.use('/courts', courtRouter);
app.use('/bookings', bookingRouter);

app.use(errorHandler);
