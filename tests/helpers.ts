// =============================================================================
// Helpers dos testes de contrato.
// Os testes só falam HTTP com a API (register/login/rotas): não importam models.
// Por isso valem igual antes e depois da migração Mongo -> Postgres; só o
// bootstrap do banco (startApi) muda.
// =============================================================================
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { Server } from 'http';
import type { AddressInfo } from 'net';

process.env.JWT_SECRET = 'segredo-de-teste';

// Silencia o stub de e-mail e logs informativos; erros continuam aparecendo.
console.log = () => {};

let server: Server;
let mongo: MongoMemoryServer;
let base = '';

export async function startApi(): Promise<void> {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  const { default: app } = await import('../src/app');
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

export async function stopApi(): Promise<void> {
  server?.close();
  await mongoose.disconnect();
  await mongo?.stop();
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
