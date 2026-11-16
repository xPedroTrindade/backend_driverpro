import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startApi, stopApi, api, signup, requestRide, Account } from './helpers';

let motorista: Account, outro: Account, passageiro: Account;

before(async () => {
  await startApi();
  motorista = await signup('motorista', 'Motorista');
  outro = await signup('motorista', 'Outro');
  passageiro = await signup('passageiro', 'Passageiro');
});
after(stopApi);

// ---------------------------------------------------------------- Listagem pública

test('GET /drivers: lista motoristas com veículo, sem e-mail nem lucroTotal', async () => {
  await api('POST', '/api/vehicles', {
    token: motorista.token,
    body: { driverId: motorista.driverId, modelo: 'Onix', placa: 'LST1A23', aceitaPets: true },
  });

  const r = await api('GET', '/api/drivers', { token: passageiro.token });
  assert.equal(r.status, 200);
  const d = r.body.find((x: any) => x._id === motorista.driverId);
  assert.ok(d);
  assert.equal(d.userId.nome, 'Motorista');
  assert.equal(d.userId.email, undefined);
  assert.equal(d.lucroTotal, undefined);
  assert.equal(d.precoKm, 3);
  assert.equal(d.disponivel, true);
  assert.equal(d.vehicle.modelo, 'Onix');
  assert.equal(d.vehicle.aceitaPets, true);

  const semVeiculo = r.body.find((x: any) => x._id === outro.driverId);
  assert.equal(semVeiculo.vehicle, null);
});

test('GET /drivers exige autenticação', async () => {
  assert.equal((await api('GET', '/api/drivers')).status, 401);
});

// ---------------------------------------------------------------- Rotas do dono

test('GET /drivers/:id: dono vê o perfil completo; outros recebem 403', async () => {
  const own = await api('GET', `/api/drivers/${motorista.driverId}`, { token: motorista.token });
  assert.equal(own.status, 200);
  assert.equal(own.body.lucroTotal, 0);
  assert.equal(own.body.totalCorridas, 0);
  assert.equal(own.body.userId.email, motorista.email);
  assert.equal(own.body.userId.passwordHash, undefined);

  assert.equal((await api('GET', `/api/drivers/${motorista.driverId}`, { token: outro.token })).status, 403);
  assert.equal((await api('GET', `/api/drivers/${motorista.driverId}`, { token: passageiro.token })).status, 403);
});

test('GET /drivers/:id: inexistente -> 404, malformado -> 400', async () => {
  assert.equal((await api('GET', '/api/drivers/00000000-0000-4000-8000-000000000000', { token: motorista.token })).status, 404);
  assert.equal((await api('GET', '/api/drivers/abc', { token: motorista.token })).status, 400);
});

test('PUT pricing: dono altera; limites validados; outros 403', async () => {
  const ok = await api('PUT', `/api/drivers/${motorista.driverId}/pricing`, { token: motorista.token, body: { precoKm: 4.2 } });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.precoKm, 4.2);
  for (const precoKm of [0, -1, 50.01, 'x']) {
    const r = await api('PUT', `/api/drivers/${motorista.driverId}/pricing`, { token: motorista.token, body: { precoKm } });
    assert.equal(r.status, 422, `precoKm ${precoKm}`);
  }
  assert.equal((await api('PUT', `/api/drivers/${motorista.driverId}/pricing`, { token: outro.token, body: { precoKm: 1 } })).status, 403);
});

test('PUT availability alterna disponível/indisponível', async () => {
  const a = await api('PUT', `/api/drivers/${outro.driverId}/availability`, { token: outro.token });
  assert.deepEqual(a.body, { disponivel: false });
  const b = await api('PUT', `/api/drivers/${outro.driverId}/availability`, { token: outro.token });
  assert.deepEqual(b.body, { disponivel: true });
  assert.equal((await api('PUT', `/api/drivers/${outro.driverId}/availability`, { token: motorista.token })).status, 403);
});

test('summary, next-ride e pending-count respondem no formato esperado (motorista sem corridas)', async () => {
  const m = await signup('motorista', 'Vazio');
  const s = await api('GET', `/api/drivers/${m.driverId}/summary`, { token: m.token });
  assert.equal(s.status, 200);
  assert.deepEqual(s.body, { corridas: 0, ganhosEstimados: 0 });

  const n = await api('GET', `/api/drivers/${m.driverId}/next-ride`, { token: m.token });
  assert.equal(n.status, 200);
  assert.equal(n.body, null);

  const p = await api('GET', `/api/drivers/${m.driverId}/pending-count`, { token: m.token });
  assert.equal(p.status, 200);
  assert.equal(typeof p.body.pendentes, 'number');

  for (const rota of ['summary', 'next-ride', 'pending-count', 'schedule']) {
    assert.equal((await api('GET', `/api/drivers/${m.driverId}/${rota}`, { token: outro.token })).status, 403, rota);
  }
});

test('schedule do mês agrupa corridas por dia e traz períodos indisponíveis', async () => {
  const m = await signup('motorista', 'Calendario');
  const p = await signup('passageiro', 'PassCal');
  await requestRide(p, m, { data: '2027-06-10', hora: '08:00' });
  await requestRide(p, m, { data: '2027-06-10', hora: '09:00' });
  await requestRide(p, m, { data: '2027-06-15', hora: '09:00' });
  await requestRide(p, m, { data: '2027-07-01', hora: '09:00' }); // outro mês: não conta

  await api('POST', '/api/unavailable-periods', {
    token: m.token,
    body: { driverId: m.driverId, dataInicio: '2027-06-20', dataFim: '2027-06-22', motivo: 'descanso' },
  });

  const r = await api('GET', `/api/drivers/${m.driverId}/schedule?year=2027&month=6`, { token: m.token });
  assert.equal(r.status, 200);
  const dias = Object.fromEntries(r.body.dias.map((d: any) => [d.dia, d.totalCorridas]));
  assert.deepEqual(dias, { 10: 2, 15: 1 });
  assert.equal(r.body.periodosIndisponiveis.length, 1);
  assert.equal(r.body.periodosIndisponiveis[0].motivo, 'descanso');
});

// ---------------------------------------------------------------- Passageiros do motorista

test('motorista cadastra passageiro (conta real que consegue logar) e o lista', async () => {
  const m = await signup('motorista', 'Cadastrador');
  const r = await api('POST', `/api/drivers/${m.driverId}/passengers`, {
    token: m.token,
    body: { nome: 'Cliente Novo', email: 'cliente.novo@teste.com', telefone: '11988887777', senha: 'abc123' },
  });
  assert.equal(r.status, 201);
  assert.equal(r.body.nome, 'Cliente Novo');
  assert.equal(r.body.passwordHash, undefined);

  const login = await api('POST', '/auth/login', { body: { email: 'cliente.novo@teste.com', senha: 'abc123' } });
  assert.equal(login.status, 200);
  assert.equal(login.body.user.tipo, 'passageiro');

  const list = await api('GET', `/api/drivers/${m.driverId}/passengers`, { token: m.token });
  assert.equal(list.status, 200);
  assert.deepEqual(list.body.map((u: any) => u.email), ['cliente.novo@teste.com']);
  assert.equal(list.body[0].telefone, '11988887777');
});

test('cadastro de passageiro: e-mail duplicado 409, dados inválidos 422, só o dono 403', async () => {
  const m = await signup('motorista', 'Cadastrador2');
  const body = { nome: 'Fulano', email: 'fulano.dup@teste.com', telefone: '11988887777', senha: 'abc123' };
  assert.equal((await api('POST', `/api/drivers/${m.driverId}/passengers`, { token: m.token, body })).status, 201);
  assert.equal((await api('POST', `/api/drivers/${m.driverId}/passengers`, { token: m.token, body })).status, 409);
  assert.equal((await api('POST', `/api/drivers/${m.driverId}/passengers`, { token: m.token, body: { ...body, email: 'x' } })).status, 422);
  assert.equal((await api('POST', `/api/drivers/${m.driverId}/passengers`, { token: outro.token, body })).status, 403);
});

test('lista de passageiros inclui quem já pediu corrida ao motorista (sem duplicar)', async () => {
  const m = await signup('motorista', 'Lista');
  const pedinte = await signup('passageiro', 'Pedinte');
  await signup('passageiro', 'NaoPediu');
  await requestRide(pedinte, m);
  await requestRide(pedinte, m);

  const list = await api('GET', `/api/drivers/${m.driverId}/passengers`, { token: m.token });
  assert.equal(list.body.length, 1);
  assert.equal(list.body[0]._id, pedinte.id);
  assert.equal((await api('GET', `/api/drivers/${m.driverId}/passengers`, { token: outro.token })).status, 403);
});
