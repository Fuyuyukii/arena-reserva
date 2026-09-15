import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-forgot-password',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './forgot-password.html',
})
export class ForgotPassword {
  email = '';
  loading = signal(false);
  sent = signal(false);
  resetToken = signal<string | null>(null);

  constructor(private readonly auth: AuthService) {}

  async submit(): Promise<void> {
    this.loading.set(true);
    try {
      const token = await this.auth.requestPasswordReset(this.email);
      this.sent.set(true);
      this.resetToken.set(token ?? null);
    } finally {
      this.loading.set(false);
    }
  }
}
