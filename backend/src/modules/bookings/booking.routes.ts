import { Router } from 'express';
import { z } from 'zod';
import { bookingService } from '@/container';
import { asyncHandler } from '@/middlewares/errorHandler';
import { authenticate, requireAdmin } from '@/middlewares/auth';
import { PrismaBookingRepository } from './booking.repository';
import { PrismaCustomerLookup } from './customer.lookup';

export const bookingRouter = Router();
const bookingRepository = new PrismaBookingRepository();
const customerLookup = new PrismaCustomerLookup();

const holdBookingSchema = z.object({
  courtId: z.number().int().positive(),
  start: z.string().datetime(),
  end: z.string().datetime(),
  notes: z.string().optional(),
});

bookingRouter.use(authenticate);

bookingRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const data = holdBookingSchema.parse(req.body);
    const customerId = await customerLookup.findIdByUserId(req.user!.id);
    const hold = await bookingService.holdBooking({
      courtId: data.courtId,
      customerId,
      start: new Date(data.start),
      end: new Date(data.end),
      notes: data.notes,
    });
    res.status(201).json(hold);
  }),
);

const payBookingSchema = z.object({ paymentMethod: z.enum(['CREDIT_CARD', 'PIX']) });

bookingRouter.post(
  '/:id/pay',
  asyncHandler(async (req, res) => {
    const { paymentMethod } = payBookingSchema.parse(req.body);
    const customerId = await customerLookup.findIdByUserId(req.user!.id);
    const booking = await bookingService.payHold(Number(req.params.id), customerId, paymentMethod);
    res.json(booking);
  }),
);

bookingRouter.get(
  '/history',
  asyncHandler(async (req, res) => {
    const customerId = await customerLookup.findIdByUserId(req.user!.id);
    const history = await bookingRepository.listByCustomer(customerId);
    res.json(history);
  }),
);

bookingRouter.get(
  '/admin',
  requireAdmin,
  asyncHandler(async (_req, res) => {
    res.json(await bookingService.listAll());
  }),
);

const createManualBookingSchema = z.object({
  courtId: z.number().int().positive(),
  customerEmail: z.string().email(),
  start: z.string().datetime(),
  end: z.string().datetime(),
  notes: z.string().optional(),
});

bookingRouter.post(
  '/admin',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const data = createManualBookingSchema.parse(req.body);
    const customerId = await customerLookup.findIdByEmail(data.customerEmail);
    const booking = await bookingService.createManualBooking({
      courtId: data.courtId,
      customerId,
      start: new Date(data.start),
      end: new Date(data.end),
      notes: data.notes,
    });
    res.status(201).json(booking);
  }),
);

const reportQuerySchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  courtId: z.coerce.number().int().positive().optional(),
  sport: z.string().optional(),
});

bookingRouter.get(
  '/report',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const query = reportQuerySchema.parse(req.query);
    res.json(
      await bookingRepository.usageReport({
        startDate: query.startDate ? new Date(`${query.startDate}T00:00:00`) : undefined,
        endDate: query.endDate ? new Date(`${query.endDate}T23:59:59.999`) : undefined,
        courtId: query.courtId,
        sport: query.sport,
      }),
    );
  }),
);

bookingRouter.patch(
  '/:id/confirm',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const booking = await bookingService.confirmBooking(Number(req.params.id));
    res.json(booking);
  }),
);

bookingRouter.patch(
  '/:id/no-show',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const booking = await bookingService.markNoShow(Number(req.params.id));
    res.json(booking);
  }),
);

bookingRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    if (req.user!.role === 'ADMINISTRATOR') {
      const booking = await bookingService.cancelAsAdmin(Number(req.params.id));
      res.json(booking);
      return;
    }

    const customerId = await customerLookup.findIdByUserId(req.user!.id);
    const booking = await bookingService.cancelBooking(Number(req.params.id), customerId);
    res.json(booking);
  }),
);
