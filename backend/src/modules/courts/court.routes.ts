import { Router } from 'express';
import { z } from 'zod';
import { courtService } from '@/container';
import { asyncHandler } from '@/middlewares/errorHandler';
import { authenticate, requireAdmin } from '@/middlewares/auth';

export const courtRouter = Router();

courtRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const sport = typeof req.query.sport === 'string' ? req.query.sport : undefined;
    const courts = await courtService.listAvailable(sport);
    res.json(courts);
  }),
);

courtRouter.get(
  '/admin',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const sport = typeof req.query.sport === 'string' ? req.query.sport : undefined;
    const courts = sport ? await courtService.listBySport(sport) : await courtService.list();
    res.json(courts);
  }),
);

courtRouter.get(
  '/:id/availability',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const dateParam = typeof req.query.date === 'string' ? req.query.date : undefined;
    // Parsed without a timezone suffix so it resolves to local midnight, matching the
    // local-time getDay()/setHours() arithmetic in CourtService and the occupancy lookup.
    // Parsing a bare "YYYY-MM-DD" string instead resolves to UTC midnight and silently
    // shifts the whole day by the server's UTC offset.
    const date = dateParam ? new Date(`${dateParam}T00:00:00`) : new Date();
    const slots = await courtService.listAvailableSlots(id, date);
    const [year, month, day] = [date.getFullYear(), date.getMonth() + 1, date.getDate()];
    res.json({ date: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`, slots });
  }),
);

const timeOfDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use o formato HH:mm');

const createCourtSchema = z.object({
  name: z.string().min(2),
  surfaceType: z.string(),
  covered: z.boolean(),
  capacity: z.number().int().positive(),
  hourlyRate: z.number().positive(),
  sportsCenterId: z.number().int().positive(),
  sports: z.array(z.string()).optional(),
  openingTime: timeOfDay.optional(),
  closingTime: timeOfDay.optional(),
});

courtRouter.post(
  '/',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const data = createCourtSchema.parse(req.body);
    const court = await courtService.create(data);
    res.status(201).json(court);
  }),
);

const updateCourtSchema = z.object({
  name: z.string().min(2).optional(),
  surfaceType: z.string().optional(),
  covered: z.boolean().optional(),
  capacity: z.number().int().positive().optional(),
  hourlyRate: z.number().positive().optional(),
  status: z.enum(['AVAILABLE', 'UNDER_MAINTENANCE', 'INACTIVE']).optional(),
  sports: z.array(z.string()).optional(),
  openingTime: timeOfDay.optional(),
  closingTime: timeOfDay.optional(),
});

courtRouter.put(
  '/:id',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const data = updateCourtSchema.parse(req.body);
    const court = await courtService.update(Number(req.params.id), data);
    res.json(court);
  }),
);

courtRouter.delete(
  '/:id',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    await courtService.delete(Number(req.params.id));
    res.status(204).send();
  }),
);

courtRouter.get(
  '/:id/blocks',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    res.json(await courtService.listBlocks(Number(req.params.id)));
  }),
);

const createBlockSchema = z.object({
  start: z.string().datetime(),
  end: z.string().datetime(),
  reason: z.string().optional(),
});

courtRouter.post(
  '/:id/blocks',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const data = createBlockSchema.parse(req.body);
    const block = await courtService.createBlock(Number(req.params.id), {
      start: new Date(data.start),
      end: new Date(data.end),
      reason: data.reason,
    });
    res.status(201).json(block);
  }),
);

courtRouter.delete(
  '/:id/blocks/:blockId',
  authenticate,
  requireAdmin,
  asyncHandler(async (req, res) => {
    await courtService.deleteBlock(Number(req.params.id), Number(req.params.blockId));
    res.status(204).send();
  }),
);
