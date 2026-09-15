import { HttpClient } from '@angular/common/http';
import { Injectable, computed, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { API_BASE_URL } from '../config';
import { RegisterInput, LoginResponse, AuthenticatedUser } from '../models/user.model';

const STORAGE_KEY = 'arena-reserva.session';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly session = signal<LoginResponse | null>(this.loadStoredSession());

  readonly user = computed<AuthenticatedUser | null>(() => this.session()?.user ?? null);
  readonly loggedIn = computed(() => this.session() !== null);
  readonly isAdmin = computed(() => this.session()?.user.role === 'ADMINISTRATOR');
  readonly token = computed(() => this.session()?.token ?? null);

  constructor(private readonly http: HttpClient) {}

  async login(email: string, password: string): Promise<void> {
    const response = await firstValueFrom(
      this.http.post<LoginResponse>(`${API_BASE_URL}/users/login`, { email, password }),
    );
    this.storeSession(response);
  }

  /** Dev-only shortcut — the backend route itself refuses to run outside development. */
  async devAdminLogin(): Promise<void> {
    const response = await firstValueFrom(this.http.post<LoginResponse>(`${API_BASE_URL}/users/dev-admin-login`, {}));
    this.storeSession(response);
  }

  /** Dev-only shortcut — the backend route itself refuses to run outside development. */
  async devCustomerLogin(): Promise<void> {
    const response = await firstValueFrom(
      this.http.post<LoginResponse>(`${API_BASE_URL}/users/dev-customer-login`, {}),
    );
    this.storeSession(response);
  }

  async register(input: RegisterInput): Promise<void> {
    await firstValueFrom(this.http.post(`${API_BASE_URL}/users/register`, input));
  }

  async requestPasswordReset(email: string): Promise<string | undefined> {
    // resetToken is only present because this project simulates e-mail delivery (see
    // ConsoleNotificationClient) — there's no inbox to check it in otherwise.
    const response = await firstValueFrom(
      this.http.post<{ message: string; resetToken?: string }>(`${API_BASE_URL}/users/forgot-password`, { email }),
    );
    return response.resetToken;
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    await firstValueFrom(this.http.post(`${API_BASE_URL}/users/reset-password`, { token, newPassword }));
  }

  logout(): void {
    this.session.set(null);
    localStorage.removeItem(STORAGE_KEY);
  }

  private storeSession(response: LoginResponse): void {
    this.session.set(response);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(response));
  }

  private loadStoredSession(): LoginResponse | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as LoginResponse) : null;
    } catch {
      return null;
    }
  }
}
