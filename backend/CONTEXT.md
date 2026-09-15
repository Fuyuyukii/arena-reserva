# Contexto de domínio — ArenaReserva backend

O código (identificadores, arquivos, rotas da API) é em inglês. Textos voltados ao usuário final (mensagens de erro, e-mails, conteúdo do seed) continuam em português, a língua dos clientes do produto.

| Módulo | Prisma / diagrama de classes |
|---|---|
| User / Customer / Administrator | User / Customer / Administrator |
| Court | Court |
| Booking | Booking |
| OperatingHours | OperatingHours |
| CourtBlock | CourtBlock |
| Sport | Sport |
| SportsCenter | SportsCenter |

## Decisões de arquitetura (ADR resumido)

- **Banco de dados: PostgreSQL**, não MySQL. O RNF09 do documento original pedia MySQL, mas os diagramas C2/C3 (mais detalhados) especificam Postgres — decisão confirmada com o time em 2026-09-13.
- **PaymentClient e NotificationClient são simulados** (`SimulatedPaymentClient`, `ConsoleNotificationClient`): aprovam toda cobrança e logam no console, respectivamente. Trocar por integrações reais (gateway de pagamento, SMTP) é implementar a mesma interface — é exatamente o ponto de isolamento que a arquitetura em camadas do documento original propõe.
- **Seams testados via injeção de dependência**: cada Service recebe suas dependências (Repository, Clients) pelo construtor como interfaces. Os testes em `tests/` substituem essas interfaces por fakes em memória — nunca mockam métodos internos do próprio Service.
- **Reserva em duas fases (hold → pay) com lock de banco**: `BookingService.holdBooking` cria a reserva com status `PENDING` e `holdExpiresAt` (TTL de 5 min, `HOLD_DURATION_MS`) *antes* de qualquer cobrança — é isso que impede dois clientes de reservarem o mesmo horário simultaneamente, e o que faz o horário aparecer como ocupado para outros clientes enquanto o primeiro está no checkout preenchendo pagamento. A atomicidade é garantida em `PrismaBookingRepository.createHold` via `pg_advisory_xact_lock(courtId)` dentro de uma transação: sem esse lock, duas requisições concorrentes podem ambas checar "sem conflito" antes de qualquer uma commitar (isolamento READ COMMITTED do Postgres não previne isso sozinho). Todo lugar que decide se um horário está livre (`createHold`, `PrismaOccupancyLookup.listByDay`, `PrismaActiveBookingLookup.hasActiveBookings`) usa o mesmo filtro: `status=CONFIRMED` OU (`status=PENDING` E `holdExpiresAt` no futuro) — um hold expirado (abandonado no checkout) deixa de bloquear o horário sozinho, sem precisar de job de limpeza. `BookingService.payHold` cobra e confirma; se a cobrança falhar ou o prazo já tiver expirado, cancela o hold imediatamente. Verificado com requisições HTTP concorrentes de verdade (não só teste unitário — um fake sequencial não prova nada sobre corrida real).
- **`CONFIRMED` → `COMPLETED` é preguiçoso, não agendado**: `PrismaBookingRepository.settlePast` roda a cada leitura (`findById`/`listByCustomer`/`listAll`) e sobe qualquer `CONFIRMED` cujo `end` já passou para `COMPLETED`. `NO_SHOW` é sempre manual (`BookingService.markNoShow`, admin only, só depois do horário passar) — não há como o sistema saber sozinho se o cliente compareceu.
- **`Notification` é gravada pelo Service, não pelo Client**: `NotificationClient.send()` só simula o envio (loga no console). Persistir a notificação é o `BookingService` chamando `BookingRepository.recordNotification` depois — separar "enviar" (infraestrutura, no Client) de "registrar que foi enviada" (domínio, no Service/Repository) evita acoplar o Client, que também é usado pra recuperação de senha (sem `Booking` nenhum), a uma tabela específica de reservas.
- **Rate limit e CORS**: `authRateLimiter` (10 req/15min) em `/users/login`, `/register` e `/forgot-password`. `CORS_ORIGIN` restringe a API a uma origem só (default `http://localhost:4200`); `JWT_SECRET` recusa o fallback de dev se `NODE_ENV=production` sem a variável setada — ver `config/env.ts`.

## Seams confirmados para TDD

- `BookingService.holdBooking` / `.payHold` / `.cancelBooking` / `.markNoShow` — reserva atômica do horário (RF08), TTL do hold, cálculo de valor, notificação de confirmação (RF12), regras de cancelamento e estorno (RF07).
- `CourtService.listAvailableSlots` — geração de slots de 1h dentro do horário de funcionamento, descontando reservas e bloqueios (RF05).
- `CourtService.createBlock` / `.deleteBlock` — bloqueio de horário pelo admin (`Administrator.registerBlock()` do diagrama de classes), rejeitado se já houver reserva ativa no período.
- `UserService.registerCustomer` / `.login` / `.requestPasswordReset` — e-mail único, senha com hash (RNF04), emissão de token (RF01-RF03).

Ao adicionar uma nova regra de negócio, confirme o seam (a interface pública do Service) antes de escrever o teste, e siga red → green em fatias verticais, uma regra por vez — ver a skill `tdd`.
