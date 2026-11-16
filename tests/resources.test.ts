import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startApi, stopApi, api, signup, requestRide, setStatus, Account } from './helpers';

let motorista: Account, outro: Account, passageiro: Account;

before(async () => {
  await startApi();
  motorista = await signup('motorista', 'Motorista');
  outro = await signup('motorista', 'Outro');
  passageiro = await signup('passageiro', 'Passageiro');
});
after(stopApi);

// ---------------------------------------------------------------- Veículos

test('veículo: CRUD do dono, placa em maiúsculas, um por motorista', async () => {
  const c = await api('POST', '/api/vehicles', {
    token: motorista.token,
    body: { driverId: motorista.driverId, modelo: 'Corolla', placa: 'abc1d23', consumoMedio: 12, lugares: 4, aceitaPets: true, aceitaCadeirinha: true },
  });
  assert.equal(c.status, 201);
  assert.equal(c.body.placa, 'ABC1D23');
  assert.equal(c.body.aceitaPets, true);
  assert.equal(c.body.aceitaVolumes, false);

  // segundo veículo do mesmo motorista
  const dup = await api('POST', '/api/vehicles', {
    token: motorista.token,
    body: { driverId: motorista.driverId, modelo: 'Outro', placa: 'ZZZ9Z99' },
  });
  assert.equal(dup.status, 409);

  const get = await api('GET', `/api/vehicles/driver/${motorista.driverId}`, { token: passageiro.token });
  assert.equal(get.status, 200);
  assert.equal(get.body.modelo, 'Corolla');

  const upd = await api('PUT', `/api/vehicles/${c.body._id}`, { token: motorista.token, body: { modelo: 'Corolla XEi', lugares: 5 } });
  assert.equal(upd.status, 200);
  assert.equal(upd.body.modelo, 'Corolla XEi');
  assert.equal(upd.body.lugares, 5);
  assert.equal(upd.body.placa, 'ABC1D23');

  assert.equal((await api('PUT', `/api/vehicles/${c.body._id}`, { token: outro.token, body: { modelo: 'Hack' } })).status, 403);
  assert.equal((await api('DELETE', `/api/vehicles/${c.body._id}`, { token: outro.token })).status, 403);

  assert.equal((await api('DELETE', `/api/vehicles/${c.body._id}`, { token: motorista.token })).status, 204);
  assert.equal((await api('GET', `/api/vehicles/driver/${motorista.driverId}`, { token: motorista.token })).status, 404);
});

test('veículo: placa única entre motoristas (409), validações (422), só o dono cria (403)', async () => {
  const m1 = await signup('motorista', 'Placa1');
  const m2 = await signup('motorista', 'Placa2');
  const ok = await api('POST', '/api/vehicles', { token: m1.token, body: { driverId: m1.driverId, modelo: 'Gol', placa: 'PLA1A11' } });
  assert.equal(ok.status, 201);

  const mesmaPlaca = await api('POST', '/api/vehicles', { token: m2.token, body: { driverId: m2.driverId, modelo: 'Gol', placa: 'PLA1A11' } });
  assert.equal(mesmaPlaca.status, 409);

  const ruim = await api('POST', '/api/vehicles', { token: m2.token, body: { driverId: m2.driverId, modelo: 'G', placa: '123' } });
  assert.equal(ruim.status, 422);

  const alheio = await api('POST', '/api/vehicles', { token: m2.token, body: { driverId: m1.driverId, modelo: 'Gol', placa: 'PLA2A22' } });
  assert.equal(alheio.status, 403);

  // trocar para a placa de outro veículo -> 409
  const v2 = await api('POST', '/api/vehicles', { token: m2.token, body: { driverId: m2.driverId, modelo: 'Gol', placa: 'PLA3A33' } });
  const clash = await api('PUT', `/api/vehicles/${v2.body._id}`, { token: m2.token, body: { placa: 'PLA1A11' } });
  assert.equal(clash.status, 409);

  assert.equal((await api('PUT', `/api/vehicles/${v2.body._id}`, { token: m2.token, body: {} })).status, 422);
});

// ---------------------------------------------------------------- Períodos indisponíveis

test('períodos indisponíveis: cria, lista ordenado, bloqueia sobreposição, exclui', async () => {
  const m = await signup('motorista', 'Folga');
  const mk = (dataInicio: string, dataFim: string, motivo?: string) =>
    api('POST', '/api/unavailable-periods', { token: m.token, body: { driverId: m.driverId, dataInicio, dataFim, ...(motivo ? { motivo } : {}) } });

  const b = await mk('2027-08-10', '2027-08-12', 'manutencao');
  assert.equal(b.status, 201);
  assert.equal(b.body.motivo, 'manutencao');
  const a = await mk('2027-08-01', '2027-08-03');
  assert.equal(a.status, 201);
  assert.equal(a.body.motivo, 'outros'); // default

  // sobreposição (inclusive tocando na borda)
  assert.equal((await mk('2027-08-12', '2027-08-15')).status, 409);
  assert.equal((await mk('2027-08-02', '2027-08-11')).status, 409);
  // fim antes do início / motivo inválido
  assert.equal((await mk('2027-08-20', '2027-08-19')).status, 422);
  assert.equal((await mk('2027-08-20', '2027-08-21', 'viagem')).status, 422);

  const list = await api('GET', `/api/unavailable-periods/driver/${m.driverId}`, { token: m.token });
  assert.equal(list.status, 200);
  assert.deepEqual(list.body.map((p: any) => p.dataInicio.slice(0, 10)), ['2027-08-01', '2027-08-10']);

  assert.equal((await api('DELETE', `/api/unavailable-periods/${a.body._id}`, { token: outro.token })).status, 403);
  assert.equal((await api('DELETE', `/api/unavailable-periods/${a.body._id}`, { token: m.token })).status, 204);
  assert.equal((await api('DELETE', `/api/unavailable-periods/${a.body._id}`, { token: m.token })).status, 404);

  // liberou o intervalo: agora pode cadastrar
  assert.equal((await mk('2027-08-01', '2027-08-03')).status, 201);
});

test('períodos: só o motorista dono cria (403) e motorista inexistente -> 404', async () => {
  const body = { driverId: motorista.driverId, dataInicio: '2027-09-01', dataFim: '2027-09-02' };
  assert.equal((await api('POST', '/api/unavailable-periods', { token: outro.token, body })).status, 403);
  assert.equal((await api('POST', '/api/unavailable-periods', { token: passageiro.token, body })).status, 403);
  assert.equal((await api('POST', '/api/unavailable-periods', { token: motorista.token, body: { ...body, driverId: '64b000000000000000000000' } })).status, 404);
});

// ---------------------------------------------------------------- Notificações

test('notificações: lista só as do próprio usuário, conta, marca uma e todas como lidas', async () => {
  const m = await signup('motorista', 'Notificado');
  const p = await signup('passageiro', 'Notificador');
  await requestRide(p, m);
  const r2 = await requestRide(p, m);
  await setStatus(r2._id, p, 'cancelada');

  const list = await api('GET', '/api/notifications', { token: m.token });
  assert.equal(list.status, 200);
  assert.equal(list.body.length, 3); // 2 nova_corrida + 1 corrida_cancelada
  assert.ok(list.body.every((n: any) => n.lida === false));
  // mais recentes primeiro
  const datas = list.body.map((n: any) => new Date(n.criadoEm).getTime());
  assert.deepEqual(datas, [...datas].sort((x, y) => y - x));

  assert.deepEqual((await api('GET', '/api/notifications/unread-count', { token: m.token })).body, { count: 3 });
  assert.deepEqual((await api('GET', '/api/notifications/unread-count', { token: p.token })).body, { count: 0 });

  // outro usuário não consegue marcar a notificação alheia
  assert.equal((await api('PUT', `/api/notifications/${list.body[0]._id}/read`, { token: p.token })).status, 404);

  const one = await api('PUT', `/api/notifications/${list.body[0]._id}/read`, { token: m.token });
  assert.equal(one.status, 200);
  assert.equal(one.body.lida, true);
  assert.deepEqual((await api('GET', '/api/notifications/unread-count', { token: m.token })).body, { count: 2 });

  assert.equal((await api('PUT', '/api/notifications/read-all', { token: m.token })).status, 200);
  assert.deepEqual((await api('GET', '/api/notifications/unread-count', { token: m.token })).body, { count: 0 });
});

// ---------------------------------------------------------------- Usuários / perfil

test('GET /users/:id: próprio perfil completo; de outros só nome, tipo e avatar', async () => {
  const own = await api('GET', `/api/users/${passageiro.id}`, { token: passageiro.token });
  assert.equal(own.status, 200);
  assert.equal(own.body.email, passageiro.email);
  assert.equal(own.body.telefone, '11999999999');
  assert.equal(own.body.passwordHash, undefined);

  const other = await api('GET', `/api/users/${passageiro.id}`, { token: motorista.token });
  assert.equal(other.status, 200);
  assert.equal(other.body.nome, 'Passageiro');
  assert.equal(other.body.tipo, 'passageiro');
  assert.equal(other.body.email, undefined);
  assert.equal(other.body.telefone, undefined);

  assert.equal((await api('GET', '/api/users/64b000000000000000000000', { token: motorista.token })).status, 404);
  assert.equal((await api('GET', '/api/users/abc', { token: motorista.token })).status, 400);
});

test('PUT /users/:id: edita o próprio nome/telefone; outros 403; inválido 422', async () => {
  const p = await signup('passageiro', 'Editavel');
  const ok = await api('PUT', `/api/users/${p.id}`, { token: p.token, body: { nome: 'Novo Nome', telefone: '11911112222' } });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.nome, 'Novo Nome');
  assert.equal(ok.body.telefone, '11911112222');

  const parcial = await api('PUT', `/api/users/${p.id}`, { token: p.token, body: { telefone: '11933334444' } });
  assert.equal(parcial.body.nome, 'Novo Nome');

  assert.equal((await api('PUT', `/api/users/${p.id}`, { token: passageiro.token, body: { nome: 'Hack' } })).status, 403);
  assert.equal((await api('PUT', `/api/users/${p.id}`, { token: p.token, body: {} })).status, 422);
  assert.equal((await api('PUT', `/api/users/${p.id}`, { token: p.token, body: { nome: 'X' } })).status, 422);
  // e-mail e tipo não são editáveis por aqui
  const antes = (await api('GET', `/api/users/${p.id}`, { token: p.token })).body;
  await api('PUT', `/api/users/${p.id}`, { token: p.token, body: { nome: 'Outro Nome', email: 'hack@teste.com', tipo: 'motorista' } });
  const depois = (await api('GET', `/api/users/${p.id}`, { token: p.token })).body;
  assert.equal(depois.email, antes.email);
  assert.equal(depois.tipo, 'passageiro');
});

// ---------------------------------------------------------------- Avatar

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);
const form = (bytes: Buffer, type: string, name = 'a.png') => {
  const f = new FormData();
  f.append('avatar', new Blob([new Uint8Array(bytes)], { type }), name);
  return f;
};

test('avatar: upload do próprio, leitura pública, substituição e avatarUrl no perfil', async () => {
  const p = await signup('passageiro', 'Foto');
  assert.equal((await api('GET', `/api/users/${p.id}/avatar`)).status, 404); // ainda sem foto

  const up = await api('POST', `/api/users/${p.id}/avatar`, { token: p.token, form: form(PNG, 'image/png') });
  assert.equal(up.status, 200);
  assert.equal(up.body.avatarUrl, `/api/users/${p.id}/avatar`);

  const get = await api('GET', `/api/users/${p.id}/avatar`); // público: sem token
  assert.equal(get.status, 200);
  assert.equal(get.headers.get('content-type'), 'image/png');
  assert.deepEqual(get.body, PNG);

  const perfil = await api('GET', `/api/users/${p.id}`, { token: p.token });
  assert.equal(perfil.body.avatarUrl, `/api/users/${p.id}/avatar`);

  // substituir por JPEG: continua um único avatar
  const jpg = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBD', 'base64');
  assert.equal((await api('POST', `/api/users/${p.id}/avatar`, { token: p.token, form: form(jpg, 'image/jpeg', 'a.jpg') })).status, 200);
  const novo = await api('GET', `/api/users/${p.id}/avatar`);
  assert.equal(novo.headers.get('content-type'), 'image/jpeg');
  assert.deepEqual(novo.body, jpg);
});

test('avatar: outro usuário 403, tipo inválido 422, acima de 2MB 422, sem arquivo 400', async () => {
  const p = await signup('passageiro', 'Foto2');
  assert.equal((await api('POST', `/api/users/${p.id}/avatar`, { token: passageiro.token, form: form(PNG, 'image/png') })).status, 403);
  assert.equal((await api('POST', `/api/users/${p.id}/avatar`, { token: p.token, form: form(Buffer.from('GIF89a'), 'image/gif', 'a.gif') })).status, 422);
  assert.equal((await api('POST', `/api/users/${p.id}/avatar`, { token: p.token, form: form(Buffer.alloc(2 * 1024 * 1024 + 1), 'image/png') })).status, 422);

  const vazio = new FormData();
  vazio.append('outro', 'x');
  assert.equal((await api('POST', `/api/users/${p.id}/avatar`, { token: p.token, form: vazio })).status, 400);
});
