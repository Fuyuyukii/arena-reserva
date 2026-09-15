import { Routes } from '@angular/router';
import { authGuard, adminGuard, customerOnlyGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./features/courts/list/courts-list').then((m) => m.CourtsList),
  },
  {
    path: 'quadras/:id',
    loadComponent: () => import('./features/courts/detail/court-detail').then((m) => m.CourtDetail),
  },
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login/login').then((m) => m.Login),
  },
  {
    path: 'cadastro',
    loadComponent: () => import('./features/auth/register/register').then((m) => m.Register),
  },
  {
    path: 'recuperar-senha',
    loadComponent: () =>
      import('./features/auth/forgot-password/forgot-password').then((m) => m.ForgotPassword),
  },
  {
    path: 'redefinir-senha',
    loadComponent: () =>
      import('./features/auth/reset-password/reset-password').then((m) => m.ResetPassword),
  },
  {
    path: 'minhas-reservas',
    canActivate: [authGuard, customerOnlyGuard],
    loadComponent: () => import('./features/bookings/my-bookings/my-bookings').then((m) => m.MyBookings),
  },
  {
    path: 'admin/quadras',
    canActivate: [authGuard, adminGuard],
    loadComponent: () => import('./features/admin/courts/admin-courts').then((m) => m.AdminCourts),
  },
  {
    path: 'admin/reservas',
    canActivate: [authGuard, adminGuard],
    loadComponent: () => import('./features/admin/bookings/admin-bookings').then((m) => m.AdminBookings),
  },
  {
    path: 'admin/relatorio',
    canActivate: [authGuard, adminGuard],
    loadComponent: () => import('./features/admin/report/admin-report').then((m) => m.AdminReport),
  },
  { path: '**', redirectTo: '' },
];
