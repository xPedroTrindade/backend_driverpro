// =============================================================================
// Helpers dos testes de contrato.
// Os testes só falam HTTP com a API (register/login/rotas): não importam models.
// Por isso valem igual antes e depois da migração Mongo -> Postgres; só o
// bootstrap do banco (startApi) muda.
//
// Banco: cada arquivo de teste (o node --test roda um processo por arquivo)
// sobe o SEU Postgres embutido (embedded-postgres, mesma versão do Supabase),
// aplica as migrations reais com `prisma migrate deploy` e apaga tudo no fim.
// Nunca toca no banco do Supabase.
// =============================================================================
import { spawnSync } from 'child_process';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { createServer } from 'net';
import type { Server } from 'http';
import type { AddressInfo } from 'net';

process.env.JWT_SECRET = 'segredo-de-teste';
process.env.AVATAR_STORAGE = 'memory';

// Silencia o stub de e-mail e logs informativos; erros continuam aparecendo.
console.log = () => {};

let server: Server;
let pg: { stop(): Promise<void> } | undefined;
let disconnect = async () => {};
let base = '';

function freePort(): Promise<number> {
  return new Promise((ok, fail) => {
    const s = createServer().once('error', fail).listen(0, '127.0.0.1', () => {
      const { port } = s.address() as AddressInfo;
      s.close(() => ok(port));
    });
  });
}

export async function startApi(): Promise<void> {
  const port = await freePort();
  const { default: EmbeddedPostgres } = await import('embedded-postgres');
  const db = new EmbeddedPostgres({
    databaseDir: mkdtempSync(join(tmpdir(), 'driverpro-pg-')),
    port,
    user: 'postgres',
    password: 'teste',
    persistent: false, // apaga o diretório no stop()
    onLog: () => {},
    onError: () => {},
  });
  await db.initialise();
  await db.start();
  pg = db;

  // Definidas ANTES de importar o app: o Prisma lê na criação do client.
  const url = `postgresql://postgres:teste@127.0.0.1:${port}/postgres`;
  process.env.DATABASE_URL = url;
  process.env.DIRECT_URL = url;

  const root = resolve(__dirname, '..');
  const migrate = spawnSync(process.execPath, [join(root, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy'], {
    cwd: root, env: process.env, encoding: 'utf8',
  });
  if (migrate.status !== 0) throw new Error(`prisma migrate deploy falhou:\n${migrate.stdout}\n${migrate.stderr}`);

  const { prisma } = await import('../src/lib/prisma');
  disconnect = () => prisma.$disconnect();
  const { default: app } = await import('../src/app');
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

export async function stopApi(): Promise<void> {
  server?.close();
  await disconnect();
  await pg?.stop();
}

export interface ApiResult<T = any> {
  status: number;
  body: T;
  headers: Headers;
}

export async function api(
  method: string,
  path: string,
  opts: { token?: string; body?: unknown; form?: FormData } = {},
): Promise<ApiResult> {
  const headers: Record<string, string> = {};
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  let body: BodyInit | undefined;
  if (opts.form) {
    body = opts.form;
  } else if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }
  const res = await fetch(base + path, { method, headers, body });
  const type = res.headers.get('content-type') ?? '';
  const parsed = type.includes('json') ? await res.json() : Buffer.from(await res.arrayBuffer());
  return { status: res.status, body: parsed, headers: res.headers };
}

export interface Account {
  token: string;
  id: string;        // _id do usuário
  email: string;
  nome: string;
  driverId?: string; // só motoristas
}

let seq = 0;

// Cria uma conta real pelo endpoint de cadastro.
export async function signup(tipo: 'motorista' | 'passageiro', nome: string = tipo): Promise<Account> {
  const email = `${nome.toLowerCase()}${++seq}@teste.com`;
  const r = await api('POST', '/auth/register', {
    body: {
      nome, email, senha: '123456', telefone: '11999999999', tipo,
      ...(tipo === 'motorista' ? { precoKm: 3 } : {}),
    },
  });
  if (r.status !== 201) throw new Error(`signup falhou: ${r.status} ${JSON.stringify(r.body)}`);
  return { token: r.body.token, id: r.body.user._id, email, nome, driverId: r.body.driverId };
}

export const RIDE_BODY = {
  origem: 'Rua A, 100',
  destino: 'Rua B, 200',
  distanciaKm: 10,
  data: '2027-03-10',
  hora: '10:00',
};

// Passageiro pede corrida (fluxo novo: nasce em aguardando_orcamento).
export async function requestRide(passenger: Account, driver: Account, extra: object = {}) {
  const r = await api('POST', '/api/rides/request', {
    token: passenger.token,
    body: { driverId: driver.driverId, ...RIDE_BODY, ...extra },
  });
  if (r.status !== 201) throw new Error(`requestRide falhou: ${r.status} ${JSON.stringify(r.body)}`);
  return r.body;
}

// Leva uma corrida pelo fluxo novo até 'confirmada'.
export async function confirmedRide(passenger: Account, driver: Account, valor = 100) {
  const ride = await requestRide(passenger, driver);
  const q = await api('PUT', `/api/rides/${ride._id}/quote`, { token: driver.token, body: { valor } });
  if (q.status !== 200) throw new Error(`quote falhou: ${q.status}`);
  const c = await api('PUT', `/api/rides/${ride._id}/confirm`, { token: passenger.token });
  if (c.status !== 200) throw new Error(`confirm falhou: ${c.status}`);
  return c.body;
}

export const setStatus = (rideId: string, who: Account, status: string) =>
  api('PUT', `/api/rides/${rideId}/status`, { token: who.token, body: { status } });

export const driverStats = async (driver: Account) => {
  const r = await api('GET', `/api/drivers/${driver.driverId}`, { token: driver.token });
  return { lucroTotal: r.body.lucroTotal as number, totalCorridas: r.body.totalCorridas as number };
};
