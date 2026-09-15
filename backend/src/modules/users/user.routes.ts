import { Router } from 'express';
import { z } from 'zod';
import { userService } from '@/container';
import { asyncHandler } from '@/middlewares/errorHandler';
import { authenticate } from '@/middlewares/auth';
import { authRateLimiter } from '@/middlewares/rateLimit';
import { env } from '@/config/env';

export const userRouter = Router();

// Dev-only shortcut so nobody has to remember the seeded admin's credentials while testing
// locally. Returns 404 (not 403) outside development so the route doesn't even reveal it
// exists in a production deployment.
userRouter.post(
  '/dev-admin-login',
  asyncHandler(async (req, res) => {
    if (env.nodeEnv === 'production') {
      res.status(404).end();
      return;
    }
    res.json(await userService.devAdminLogin());
  }),
);

userRouter.post(
  '/dev-customer-login',
  asyncHandler(async (req, res) => {
    if (env.nodeEnv === 'production') {
      res.status(404).end();
      return;
    }
    res.json(await userService.devCustomerLogin());
  }),
);

const registerSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  phone: z.string().optional(),
  taxId: z.string().optional(),
});

userRouter.post(
  '/register',
  authRateLimiter,
  asyncHandler(async (req, res) => {
    const data = registerSchema.parse(req.body);
    const user = await userService.registerCustomer(data);
    res.status(201).json({ id: user.id, name: user.name, email: user.email });
  }),
);

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

userRouter.post(
  '/login',
  authRateLimiter,
  asyncHandler(async (req, res) => {
    const data = loginSchema.parse(req.body);
    const result = await userService.login(data);
    res.json(result);
  }),
);

const forgotPasswordSchema = z.object({ email: z.string().email() });

userRouter.post(
  '/forgot-password',
  authRateLimiter,
  asyncHandler(async (req, res) => {
    const { email } = forgotPasswordSchema.parse(req.body);
    // The reset token is only echoed back here because notification delivery is simulated
    // (ConsoleNotificationClient just logs) — there's no real inbox to check it in. A real
    // deployment with actual email delivery must never return this in the API response.
    const resetToken = await userService.requestPasswordReset(email);
    res.status(202).json({
      message: 'Se o e-mail existir, enviaremos instruções de recuperação.',
      resetToken: resetToken ?? undefined,
    });
  }),
);

const resetPasswordSchema = z.object({ token: z.string(), newPassword: z.string().min(6) });

userRouter.post(
  '/reset-password',
  asyncHandler(async (req, res) => {
    const { token, newPassword } = resetPasswordSchema.parse(req.body);
    await userService.resetPassword(token, newPassword);
    res.status(204).send();
  }),
);

userRouter.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    res.json({ id: req.user!.id, role: req.user!.role });
  }),
);
