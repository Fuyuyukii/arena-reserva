import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { AuthService } from './auth.service';
import { API_BASE_URL } from '../config';

describe('AuthService', () => {
  let service: AuthService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  it('começa deslogado quando não há sessão salva', () => {
    expect(service.loggedIn()).toBe(false);
    expect(service.user()).toBeNull();
    expect(service.token()).toBeNull();
  });

  it('armazena a sessão e atualiza os signals após login', async () => {
    const loginPromise = service.login('ana@example.com', 'senha123');

    const req = httpMock.expectOne(`${API_BASE_URL}/users/login`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ email: 'ana@example.com', password: 'senha123' });
    req.flush({ token: 'tok123', user: { id: 1, name: 'Ana', email: 'ana@example.com', role: 'CUSTOMER' } });

    await loginPromise;

    expect(service.loggedIn()).toBe(true);
    expect(service.token()).toBe('tok123');
    expect(service.user()?.name).toBe('Ana');
    expect(service.isAdmin()).toBe(false);
  });

  it('identifica um administrador a partir do papel retornado no login', async () => {
    const loginPromise = service.login('admin@example.com', 'senha123');
    httpMock
      .expectOne(`${API_BASE_URL}/users/login`)
      .flush({ token: 'tok', user: { id: 1, name: 'Admin', email: 'admin@example.com', role: 'ADMINISTRATOR' } });
    await loginPromise;

    expect(service.isAdmin()).toBe(true);
  });

  it('faz login como admin pelo atalho de desenvolvimento, sem enviar credenciais', async () => {
    const loginPromise = service.devAdminLogin();

    const req = httpMock.expectOne(`${API_BASE_URL}/users/dev-admin-login`);
    expect(req.request.method).toBe('POST');
    req.flush({ token: 'dev-tok', user: { id: 1, name: 'Admin', email: 'admin@arenareserva.com', role: 'ADMINISTRATOR' } });

    await loginPromise;

    expect(service.loggedIn()).toBe(true);
    expect(service.isAdmin()).toBe(true);
  });

  it('faz login como cliente pelo atalho de desenvolvimento, sem enviar credenciais', async () => {
    const loginPromise = service.devCustomerLogin();

    const req = httpMock.expectOne(`${API_BASE_URL}/users/dev-customer-login`);
    expect(req.request.method).toBe('POST');
    req.flush({ token: 'dev-tok', user: { id: 2, name: 'Ana', email: 'ana@example.com', role: 'CUSTOMER' } });

    await loginPromise;

    expect(service.loggedIn()).toBe(true);
    expect(service.isAdmin()).toBe(false);
  });

  it('limpa a sessão ao fazer logout', async () => {
    const loginPromise = service.login('ana@example.com', 'senha123');
    httpMock
      .expectOne(`${API_BASE_URL}/users/login`)
      .flush({ token: 'tok', user: { id: 1, name: 'Ana', email: 'ana@example.com', role: 'CUSTOMER' } });
    await loginPromise;

    service.logout();

    expect(service.loggedIn()).toBe(false);
    expect(service.token()).toBeNull();
    expect(localStorage.getItem('arena-reserva.session')).toBeNull();
  });
});
