import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { formatBrazilianPhone } from '../../../core/utils/phone-mask';
import { formatCpf } from '../../../core/utils/cpf-mask';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './register.html',
})
export class Register {
  name = '';
  email = '';
  password = '';
  confirmPassword = '';
  phone = '';
  taxId = '';
  loading = signal(false);
  error = signal<string | null>(null);
  success = signal(false);

  constructor(
    private readonly auth: AuthService,
    private readonly router: Router,
  ) {}

  onPhoneInput(value: string): void {
    this.phone = formatBrazilianPhone(value);
  }

  onTaxIdInput(value: string): void {
    this.taxId = formatCpf(value);
  }

  get passwordsMismatch(): boolean {
    return this.confirmPassword.length > 0 && this.password !== this.confirmPassword;
  }

  async register(): Promise<void> {
    this.error.set(null);

    if (this.password !== this.confirmPassword) {
      this.error.set('As senhas não coincidem.');
      return;
    }

    this.loading.set(true);
    try {
      await this.auth.register({
        name: this.name,
        email: this.email,
        password: this.password,
        phone: this.phone,
        taxId: this.taxId,
      });
      this.success.set(true);
      setTimeout(() => this.router.navigateByUrl('/login'), 1200);
    } catch (err: unknown) {
      const message = (err as { error?: { error?: string } })?.error?.error ?? 'Não foi possível concluir o cadastro.';
      this.error.set(message);
    } finally {
      this.loading.set(false);
    }
  }
}
