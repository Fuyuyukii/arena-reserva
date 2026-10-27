// Single entry point for local development: `npm start` at the repo root installs what is
// missing, starts an embedded PostgreSQL (no Docker or local Postgres needed), applies
// migrations + seed, and runs the API and the Angular dev server side by side.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const backendDir = path.join(root, 'backend');
const frontendDir = path.join(root, 'frontend');
const pgDataDir = path.join(root, '.data', 'postgres');
const isWindows = process.platform === 'win32';
const shouldOpenBrowser = !process.argv.includes('--no-open');

const DB = { user: 'arena', password: 'arena', name: 'arena_reserva' };
const children = [];
let pg;

const color = (code, text) => `\x1b[${code}m${text}\x1b[0m`;
const log = (msg) => console.log(`${color('35', '[arena]')} ${msg}`);
const fail = (msg) => {
  console.error(`\n${color('31', '[arena] ERRO:')} ${msg}\n`);
  process.exit(1);
};

function checkNodeVersion() {
  const [major, minor, patch] = process.versions.node.split('.').map(Number);
  const ok = (major === 22 && (minor > 22 || (minor === 22 && patch >= 3)))
    || (major === 24 && minor >= 15)
    || major >= 26;
  if (!ok) {
    fail(`o Angular do frontend exige Node 22.22.3+, 24.15+ ou 26+ (você está no ${process.versions.node}).\n`
      + '  Com nvm:  nvm install 24  &&  nvm use 24');
  }
}

function runNpm(args, cwd) {
  // npm_execpath points at npm-cli.js when launched through `npm start`; fall back to the shell.
  const npmCli = process.env.npm_execpath;
  const result = npmCli && npmCli.endsWith('.js')
    ? spawnSync(process.execPath, [npmCli, ...args], { cwd, stdio: 'inherit' })
    : spawnSync(isWindows ? 'npm.cmd' : 'npm', args, { cwd, stdio: 'inherit', shell: isWindows });
  if (result.status !== 0) fail(`"npm ${args.join(' ')}" falhou em ${path.relative(root, cwd) || '.'}.`);
}

function ensureDependencies() {
  for (const dir of [root, backendDir, frontendDir]) {
    if (!existsSync(path.join(dir, 'node_modules'))) {
      log(`instalando dependências em ${path.relative(root, dir) || 'raiz'} (só na primeira vez)...`);
      runNpm(['install', '--no-audit', '--no-fund'], dir);
    }
  }
}

function canListen(port, host) {
  return new Promise((resolve) => {
    const server = net.createServer()
      .once('error', () => resolve(false))
      .once('listening', () => server.close(() => resolve(true)))
      .listen(port, host);
  });
}

// Windows can reserve a port for IPv4 only (EACCES on 127.0.0.1 while :: is free), so check both.
async function findFreePort(preferred) {
  for (let port = preferred; port < preferred + 50; port++) {
    if (await canListen(port, '127.0.0.1') && await canListen(port)) return port;
  }
  fail(`nenhuma porta livre entre ${preferred} e ${preferred + 49}.`);
}

async function startDatabase(port) {
  const { default: EmbeddedPostgres } = await import('embedded-postgres');
  pg = new EmbeddedPostgres({
    databaseDir: pgDataDir,
    user: DB.user,
    password: DB.password,
    port,
    persistent: true,
    onLog: () => {},
    onError: () => {},
  });

  if (!existsSync(path.join(pgDataDir, 'PG_VERSION'))) {
    log('criando o banco local em .data/postgres (só na primeira vez)...');
    await pg.initialise();
  }
  await pg.start();
  try {
    await pg.createDatabase(DB.name);
  } catch (error) {
    if (!String(error?.message ?? error).includes('already exists')) throw error;
  }
  return `postgresql://${DB.user}:${DB.password}@127.0.0.1:${port}/${DB.name}?schema=public`;
}

function runNode(args, cwd, env) {
  const result = spawnSync(process.execPath, args, { cwd, env, stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`"node ${args.join(' ')}" falhou.`);
}

function startProcess(label, labelColor, args, cwd, env) {
  const child = spawn(process.execPath, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
  const prefix = color(labelColor, `[${label}]`);
  const pipe = (stream, out) => {
    let buffer = '';
    stream.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop();
      for (const line of lines) out.write(`${prefix} ${line}\n`);
    });
  };
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);
  child.on('exit', (code) => {
    if (!shuttingDown) {
      console.error(`${prefix} encerrou (código ${code}). Parando tudo.`);
      shutdown(1);
    }
  });
  children.push(child);
  return child;
}

async function waitForHttp(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await fetch(url);
      return true;
    } catch {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  return false;
}

function openBrowser(url) {
  const [cmd, args] = isWindows ? ['cmd', ['/c', 'start', '', url]]
    : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  spawn(cmd, args, { stdio: 'ignore', detached: true }).unref();
}

let shuttingDown = false;
async function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  log('parando API, frontend e banco...');
  for (const child of children) {
    if (child.exitCode !== null) continue;
    // tsx watch and ng serve spawn their own workers; kill the whole tree.
    if (isWindows) spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    else child.kill('SIGTERM');
  }
  try {
    await pg?.stop();
  } catch {
    // already stopped
  }
  process.exit(code);
}

async function main() {
  checkNodeVersion();
  ensureDependencies();

  const dbPort = await findFreePort(54320);
  const apiPort = await findFreePort(3000);
  const webPort = await findFreePort(4200);
  const apiUrl = `http://localhost:${apiPort}`;
  const webUrl = `http://localhost:${webPort}`;

  log(`subindo o PostgreSQL embutido na porta ${dbPort}...`);
  const databaseUrl = await startDatabase(dbPort);

  // Values set here win over backend/.env (dotenv never overrides existing variables).
  // PORT only goes to the API: ng serve also reads PORT and would take the API's port.
  const backendEnv = {
    ...process.env,
    NODE_ENV: 'development',
    DATABASE_URL: databaseUrl,
    PORT: String(apiPort),
    CORS_ORIGIN: webUrl,
  };
  const frontendEnv = { ...process.env, NG_CLI_ANALYTICS: 'false' };
  delete frontendEnv.PORT;

  log('gerando o Prisma Client, aplicando migrations e seed...');
  runNode(['node_modules/prisma/build/index.js', 'generate'], backendDir, backendEnv);
  runNode(['node_modules/prisma/build/index.js', 'migrate', 'deploy'], backendDir, backendEnv);
  runNode(['node_modules/tsx/dist/cli.mjs', 'prisma/seed.ts'], backendDir, backendEnv);

  startProcess('api', '36', ['node_modules/tsx/dist/cli.mjs', 'watch', 'src/server.ts'], backendDir, backendEnv);
  startProcess('web', '33', [
    'node_modules/@angular/cli/bin/ng.js', 'serve',
    '--port', String(webPort),
    '--define', `ARENA_API_URL="${apiUrl}"`,
  ], frontendDir, frontendEnv);

  const ready = await waitForHttp(webUrl, 180_000) && await waitForHttp(`${apiUrl}/courts`, 30_000);
  if (shuttingDown) return;
  if (!ready) throw new Error('API ou frontend não responderam a tempo; veja o log acima.');

  console.log(`
${color('32', '  ArenaReserva no ar!')}

  Frontend:  ${webUrl}
  API:       ${apiUrl}

  Admin:     admin@arenareserva.com / admin123
  Cliente:   cliente@arenareserva.com / cliente123
  (ou use os botões "Entrar como ... (dev)" na tela de login)

  Ctrl+C para parar tudo.
`);
  if (shouldOpenBrowser) openBrowser(webUrl);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
main().catch((error) => {
  console.error(error);
  shutdown(1);
});
