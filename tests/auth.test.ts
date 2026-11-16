import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startApi, stopApi, api, signup } from './helpers';

before(startApi);
after(stopApi);

test('GET /health responde ok', async () => {
  const r = await api('GET', '/health');
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { status: 'ok' });
});

test('cadastro de passageiro devolve token e usuário (sem driverId)', async () => {
  const r = await api('POST', '/auth/register', {
    body: { nome: 'Ana', email: 'ana@teste.com', senha: '123456', telefone: '11999999999', tipo: 'passageiro' },
  });
  assert.equal(r.status, 201);
  assert.ok(r.body.token);
  assert.equal(r.body.user.tipo, 'passageiro');
  assert.equal(r.body.user.email, 'ana@teste.com');
  assert.ok(r.body.user._id);
  assert.equal(r.body.driverId, undefined);
  assert.equal(r.body.user.passwordHash, undefined);
});

test('cadastro de motorista cria o perfil de motorista (driverId + precoKm)', async () => {
  const r = await api('POST', '/auth/register', {
    body: { nome: 'Beto', email: 'beto@teste.com', senha: '123456', telefone: '11999999999', tipo: 'motorista', precoKm: 4.5 },
  });
  assert.equal(r.status, 201);
  assert.ok(r.body.driverId);
  assert.equal(r.body.driver.precoKm, 4.5);
  assert.equal(r.body.driver.disponivel, true);
});

test('precoKm é opcional no cadastro de motorista (default 0)', async () => {
  const r = await api('POST', '/auth/register', {
    body: { nome: 'Caio', email: 'caio@teste.com', senha: '123456', telefone: '11999999999', tipo: 'motorista' },
  });
  assert.equal(r.status, 201);
  assert.equal(r.body.driver.precoKm, 0);
});

test('e-mail duplicado -> 409', async () => {
  const body = { nome: 'Dani', email: 'dani@teste.com', senha: '123456', telefone: '11999999999', tipo: 'passageiro' };
  assert.equal((await api('POST', '/auth/register', { body })).status, 201);
  const again = await api('POST', '/auth/register', { body });
  assert.equal(again.status, 409);
});

test('e-mail é normalizado para minúsculas e o login aceita qualquer caixa', async () => {
  const r = await api('POST', '/auth/register', {
    body: { nome: 'Edu', email: 'EduMix@Teste.com', senha: '123456', telefone: '11999999999', tipo: 'passageiro' },
  });
  assert.equal(r.status, 201);
  assert.equal(r.body.user.email, 'edumix@teste.com');
  const login = await api('POST', '/auth/login', { body: { email: 'EduMix@Teste.com', senha: '123456' } });
  assert.equal(login.status, 200);
});

test('validação do cadastro -> 422 com detalhes por campo', async () => {
  const r = await api('POST', '/auth/register', {
    body: { nome: 'X', email: 'invalido', senha: '123', telefone: '1', tipo: 'admin' },
  });
  assert.equal(r.status, 422);
  assert.ok(Array.isArray(r.body.detalhes));
  const campos = r.body.detalhes.map((d: any) => d.campo);
  for (const c of ['nome', 'email', 'senha', 'telefone', 'tipo']) assert.ok(campos.includes(c), `faltou erro em ${c}`);
});

test('precoKm fora do limite -> 422', async () => {
  const r = await api('POST', '/auth/register', {
    body: { nome: 'Fabio', email: 'fabio@teste.com', senha: '123456', telefone: '11999999999', tipo: 'motorista', precoKm: 51 },
  });
  assert.equal(r.status, 422);
});

test('login correto devolve token, usuário e (motorista) driverId', async () => {
  const m = await signup('motorista', 'Gabi');
  const r = await api('POST', '/auth/login', { body: { email: m.email, senha: '123456' } });
  assert.equal(r.status, 200);
  assert.ok(r.body.token);
  assert.equal(r.body.user._id, m.id);
  assert.equal(r.body.user.tipo, 'motorista');
  assert.equal(r.body.driverId, m.driverId);
  assert.equal(r.body.user.avatarUrl, '');
});

test('login com senha errada ou e-mail inexistente -> 401 (mesma mensagem)', async () => {
  const p = await signup('passageiro', 'Hugo');
  const wrong = await api('POST', '/auth/login', { body: { email: p.email, senha: 'errada' } });
  const unknown = await api('POST', '/auth/login', { body: { email: 'naoexiste@teste.com', senha: '123456' } });
  assert.equal(wrong.status, 401);
  assert.equal(unknown.status, 401);
  assert.equal(wrong.body.error, unknown.body.error);
});

test('login com corpo inválido -> 422', async () => {
  const r = await api('POST', '/auth/login', { body: { email: 'nao-e-email', senha: '' } });
  assert.equal(r.status, 422);
});

test('rota protegida sem token ou com token inválido -> 401', async () => {
  assert.equal((await api('GET', '/api/notifications')).status, 401);
  assert.equal((await api('GET', '/api/notifications', { token: 'lixo' })).status, 401);
});

test('o token do cadastro já funciona nas rotas protegidas', async () => {
  const p = await signup('passageiro', 'Iara');
  const r = await api('GET', '/api/notifications', { token: p.token });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, []);
});
