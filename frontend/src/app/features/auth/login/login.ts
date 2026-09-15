import { Component, isDevMode, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './login.html',
})
export class Login {
  email = '';
  password = '';
  loading = signal(false);
  error = signal<string | null>(null);
  readonly isDev = isDevMode();

  constructor(
    private readonly auth: AuthService,
    private readonly router: Router,
  ) {}

  async login(): Promise<void> {
    this.error.set(null);
    this.loading.set(true);
    try {
      await this.auth.login(this.email, this.password);
      await this.router.navigateByUrl('/');
    } catch {
      this.error.set('E-mail ou senha inválidos.');
    } finally {
      this.loading.set(false);
    }
  }

  async loginAsAdmin(): Promise<void> {
    this.error.set(null);
    this.loading.set(true);
    try {
      await this.auth.devAdminLogin();
      await this.router.navigateByUrl('/');
    } catch {
      this.error.set('Não há administrador cadastrado (rode o seed do backend).');
    } finally {
      this.loading.set(false);
    }
  }

  async loginAsCustomer(): Promise<void> {
    this.error.set(null);
    this.loading.set(true);
    try {
      await this.auth.devCustomerLogin();
      await this.router.navigateByUrl('/');
    } catch {
      this.error.set('Não há cliente cadastrado (rode o seed do backend).');
    } finally {
      this.loading.set(false);
    }
  }
}
