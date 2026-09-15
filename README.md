# ArenaReserva

Sistema web de reserva de quadras esportivas. Trabalho da disciplina de Engenharia de Software — alunos Djenifer Wacheisk, Guilherme Izidoro da Silva e Vinicius Borges.

A documentação original (contexto, requisitos, modelo C4 e diagrama de classes) está em [docs/documentacao-original](docs/documentacao-original) e os diagramas extraídos em [docs/diagrams](docs/diagrams).

## Arquitetura

Cliente-servidor com arquitetura em camadas no backend (Controller → Service → Repository), conforme o modelo C4 do projeto:

- **frontend/** — SPA em Angular, consome a API via HTTP/JSON.
- **backend/** — API REST em Node.js/Express + TypeScript, Prisma sobre PostgreSQL. O `BookingService` concentra as regras de negócio (conflito de horário, cálculo de valores) e isola integrações externas atrás de `PaymentClient` e `NotificationClient`. Código (identificadores, arquivos, rotas da API) em inglês; mensagens e conteúdo voltados ao usuário final em português.

> Nota: o RNF09 do documento original pede MySQL, mas os diagramas C2/C3 especificam PostgreSQL — este projeto segue os diagramas.

## Funcionalidades por perfil

**Cliente** (`/`, `/quadras/:id`, `/minhas-reservas`): busca quadras disponíveis por esporte, vê horários livres, escolhe um horário e paga (PIX ou cartão, emulado via `PaymentClient`/`SimulatedPaymentClient` — nenhuma integração real, aprova automaticamente) para confirmar a reserva. Em "Minhas reservas" vê as próximas reservas separadas do histórico, e pode cancelar uma reserva futura (o cancelamento estorna o pagamento simulado).

**Administrador** (login com papel `ADMINISTRATOR`, ex.: a conta do seed): além de tudo isso, acessa três telas exclusivas no menu (e não vê "Minhas reservas", que não se aplica a ele):
- **Gerenciar quadras** (`/admin/quadras`) — listagem padrão com botão "Adicionar" e clique na linha, ambos abrindo o mesmo modal de cadastro/edição (RF09): nome, superfície, capacidade, valor/hora, horário de funcionamento (mesmo todos os dias) e esportes. Cada linha também tem um botão de **bloqueios** por período (manutenção etc., sem criar reserva de cliente). A exclusão é bloqueada com erro 409 se a quadra tiver reservas pendentes/confirmadas.
- **Gerenciar reservas** (`/admin/reservas`) — vê a reserva de qualquer cliente com nome e e-mail (RF10), cancela, marca "Não compareceu" numa reserva cujo horário já passou, ou cria uma **reserva de encaixe** (walk-in): informa quadra, e-mail do cliente e horário, e a reserva entra direto como `CONFIRMED`, sem passar pelo fluxo de pagamento do cliente. Não há confirmação manual — toda reserva feita pelo cliente já nasce paga/confirmada.
- **Relatório** (`/admin/relatorio`) — total de reservas e receita acumulada por quadra (RF13), com filtros por período (data inicial/final), quadra e esporte.

### Atalho de login em desenvolvimento

Rodando localmente (`ng serve`), a tela de login mostra dois botões extras — "Entrar como admin (dev)" e "Entrar como cliente (dev)" — que logam direto no primeiro usuário de cada papel cadastrado no banco, sem precisar digitar credenciais. As rotas por trás (`POST /users/dev-admin-login` e `/dev-customer-login`) respondem 404 quando `NODE_ENV=production`, então isso não existe em produção nem nos botões (o frontend usa `isDevMode()` do Angular, que também só é `true` fora de um build de produção).

A listagem pública de quadras (`GET /courts`) só retorna quadras com status `AVAILABLE`, conforme o RF04; quadras em manutenção/inativas só aparecem para o admin em `GET /courts/admin`. Rotas da API: `/users/*`, `/courts/*`, `/bookings/*` (ver `backend/src/modules/*/*.routes.ts`); as URLs do frontend (`/quadras/:id`, `/minhas-reservas`, `/admin/*`) continuam em português.

Uma reserva confirmada cujo horário já passou vira `COMPLETED` automaticamente na próxima vez que é lida (sem job agendado — ver `PrismaBookingRepository.settlePast`); o admin pode sobrepor para `NO_SHOW` manualmente.

### Reserva de horário sem condição de corrida

Clicar num horário cria a reserva com status `PENDING` (e expira em 5 min se não for paga) **antes** de qualquer pagamento — é o que impede duas pessoas de reservarem o mesmo horário ao mesmo tempo e o que faz o horário aparecer como ocupado para outros clientes enquanto o primeiro está pagando. A checagem de conflito e a criação são atômicas via `pg_advisory_xact_lock` (ver `PrismaBookingRepository.createHold`), não apenas "checa depois cria" — sem isso, duas requisições simultâneas poderiam ambas passar pela checagem antes de qualquer uma gravar.

### Recuperação de senha (modo demonstração)

Como o envio de e-mail é simulado (`ConsoleNotificationClient` só loga no console), `POST /users/forgot-password` devolve o token de redefinição na própria resposta e a tela "Esqueci minha senha" mostra um link direto para `/redefinir-senha?token=...`. **Isso nunca deveria acontecer com um provedor de e-mail real** — é só para o fluxo ser demonstrável sem precisar checar o log do servidor.

## Rodando localmente

### Pré-requisitos

- **Node.js 20+** (o projeto foi desenvolvido com Node 22/24) e npm.
- **Docker Desktop** (ou qualquer PostgreSQL 16+ local — só ajuste `DATABASE_URL` no `.env` do backend para apontar pra ele).
- Duas portas livres: `3000` (API) e `4200` (frontend). O Postgres usa `5432`.

Suba o backend e o frontend em dois terminais separados — os dois precisam ficar rodando ao mesmo tempo.

### Backend

```bash
cd backend
cp .env.example .env
npm install
docker compose -f ../docker-compose.yml up -d   # sobe o Postgres local (porta 5432)
npx prisma migrate dev --name init              # cria as tabelas
npm run prisma:seed                             # cria um admin e duas quadras de exemplo
npm run dev                                      # http://localhost:3000
```

Usuário administrador de exemplo criado pelo seed: `admin@arenareserva.com` / `admin123` (ou use o botão "Entrar como admin (dev)" na tela de login, veja abaixo).

Rodar os testes (TDD, red→green a cada regra de negócio):

```bash
npm test
```

### Frontend

Em outro terminal:

```bash
cd frontend
npm install
npm start   # http://localhost:4200 — abra essa URL no navegador
```

Rodar os testes:

```bash
npm test
```

### Testando rapidamente

Com os dois servidores no ar, abra `http://localhost:4200`. Pra explorar como administrador ou como cliente sem digitar credenciais, use os botões de atalho na tela de login (só aparecem em desenvolvimento — veja a seção "Atalho de login em desenvolvimento" acima). Se preferir mexer direto no banco, `npm run prisma:studio` dentro de `backend/` abre uma interface visual.
