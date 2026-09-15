import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-reset-password',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './reset-password.html',
})
export class ResetPassword implements OnInit {
  token = '';
  newPassword = '';
  confirmPassword = '';
  loading = signal(false);
  error = signal<string | null>(null);
  success = signal(false);

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly auth: AuthService,
  ) {}

  ngOnInit(): void {
    this.token = this.route.snapshot.queryParamMap.get('token') ?? '';
  }

  get passwordsMismatch(): boolean {
    return this.confirmPassword.length > 0 && this.newPassword !== this.confirmPassword;
  }

  async submit(): Promise<void> {
    this.error.set(null);

    if (this.newPassword !== this.confirmPassword) {
      this.error.set('As senhas não coincidem.');
      return;
    }

    this.loading.set(true);
    try {
      await this.auth.resetPassword(this.token, this.newPassword);
      this.success.set(true);
      setTimeout(() => this.router.navigateByUrl('/login'), 1500);
    } catch (err: unknown) {
      const message =
        (err as { error?: { error?: string } })?.error?.error ?? 'Não foi possível redefinir a senha.';
      this.error.set(message);
    } finally {
      this.loading.set(false);
    }
  }
}
