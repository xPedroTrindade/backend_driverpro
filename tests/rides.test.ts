import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  startApi, stopApi, api, signup, requestRide, confirmedRide, setStatus, driverStats, RIDE_BODY, Account,
} from './helpers';

let motorista: Account, outroMotorista: Account, passageiro: Account, estranho: Account;

before(async () => {
  await startApi();
  motorista = await signup('motorista', 'Motorista');
  outroMotorista = await signup('motorista', 'Outro');
  passageiro = await signup('passageiro', 'Passageiro');
  estranho = await signup('passageiro', 'Estranho');
});
after(stopApi);

const notificacoes = async (u: Account) => (await api('GET', '/api/notifications', { token: u.token })).body as any[];

// ---------------------------------------------------------------- Fluxo de orçamento

test('fluxo completo: solicitar -> orçar -> confirmar -> iniciar -> concluir', async () => {
  const antes = await driverStats(motorista);

  const ride = await requestRide(passageiro, motorista);
  assert.equal(ride.status, 'aguardando_orcamento');
  assert.equal(ride.valor, 0);
  assert.equal(ride.passageiroNome, 'Passageiro');
  assert.equal(ride.passageiroId, passageiro.id);

  // motorista é avisado do pedido
  assert.ok((await notificacoes(motorista)).some(n => n.tipo === 'nova_corrida' && n.rideId === ride._id));

  // só o motorista dono orça
  assert.equal((await api('PUT', `/api/rides/${ride._id}/quote`, { token: passageiro.token, body: { valor: 100 } })).status, 403);
  assert.equal((await api('PUT', `/api/rides/${ride._id}/quote`, { token: outroMotorista.token, body: { valor: 100 } })).status, 403);

  const quoted = await api('PUT', `/api/rides/${ride._id}/quote`, { token: motorista.token, body: { valor: 100 } });
  assert.equal(quoted.status, 200);
  assert.equal(quoted.body.status, 'aguardando_confirmacao');
  assert.equal(quoted.body.valor, 100);

  // passageiro é avisado do orçamento
  assert.ok((await notificacoes(passageiro)).some(n => n.tipo === 'orcamento_recebido' && n.rideId === ride._id));

  // orçar de novo -> 409
  assert.equal((await api('PUT', `/api/rides/${ride._id}/quote`, { token: motorista.token, body: { valor: 90 } })).status, 409);

  // só o passageiro da corrida confirma
  assert.equal((await api('PUT', `/api/rides/${ride._id}/confirm`, { token: estranho.token })).status, 403);
  assert.equal((await api('PUT', `/api/rides/${ride._id}/confirm`, { token: motorista.token })).status, 403);
  const confirmed = await api('PUT', `/api/rides/${ride._id}/confirm`, { token: passageiro.token });
  assert.equal(confirmed.status, 200);
  assert.equal(confirmed.body.status, 'confirmada');
  assert.equal((await api('PUT', `/api/rides/${ride._id}/confirm`, { token: passageiro.token })).status, 409);

  // motorista é avisado da confirmação
  assert.ok((await notificacoes(motorista)).some(n => n.tipo === 'corrida_confirmada' && n.rideId === ride._id));

  assert.equal((await setStatus(ride._id, motorista, 'em_andamento')).status, 200);
  assert.equal((await setStatus(ride._id, motorista, 'concluida')).status, 200);

  const depois = await driverStats(motorista);
  assert.equal(depois.totalCorridas, antes.totalCorridas + 1);
  assert.equal(depois.lucroTotal, antes.lucroTotal + 100); // sem lucroLiquido, soma o valor
  assert.ok((await notificacoes(motorista)).some(n => n.tipo === 'corrida_concluida' && n.rideId === ride._id));
});

test('quote valida o valor (zero, negativo, absurdo -> 422)', async () => {
  const ride = await requestRide(passageiro, motorista);
  for (const valor of [0, -5, 100001, 'abc']) {
    const r = await api('PUT', `/api/rides/${ride._id}/quote`, { token: motorista.token, body: { valor } });
    assert.equal(r.status, 422, `valor ${valor}`);
  }
});

test('quote e confirm em corrida inexistente -> 404', async () => {
  const fake = '00000000-0000-4000-8000-000000000000';
  assert.equal((await api('PUT', `/api/rides/${fake}/quote`, { token: motorista.token, body: { valor: 10 } })).status, 404);
  assert.equal((await api('PUT', `/api/rides/${fake}/confirm`, { token: passageiro.token })).status, 404);
});

test('confirm antes do orçamento -> 409', async () => {
  const ride = await requestRide(passageiro, motorista);
  assert.equal((await api('PUT', `/api/rides/${ride._id}/confirm`, { token: passageiro.token })).status, 409);
});

// ---------------------------------------------------------------- Solicitação

test('solicitação valida os campos (422) e o motorista (404)', async () => {
  const ruim = await api('POST', '/api/rides/request', {
    token: passageiro.token,
    body: { driverId: motorista.driverId, ...RIDE_BODY, data: '10/03/2027', hora: '9h', distanciaKm: -1 },
  });
  assert.equal(ruim.status, 422);

  const semMotorista = await api('POST', '/api/rides/request', {
    token: passageiro.token,
    body: { driverId: '00000000-0000-4000-8000-000000000000', ...RIDE_BODY },
  });
  assert.equal(semMotorista.status, 404);
});

// ---------------------------------------------------------------- Corrida manual (motorista)

test('motorista cria corrida manual: nasce pendente e o lucroLiquido entra no lucroTotal', async () => {
  const antes = await driverStats(motorista);
  const r = await api('POST', '/api/rides', {
    token: motorista.token,
    body: {
      driverId: motorista.driverId, passageiroNome: 'Cliente Avulso', ...RIDE_BODY,
      valor: 100, lucroLiquido: 70, pedagio: 5, idaVolta: true, taxaEspera: 10, custoTotal: 30,
    },
  });
  assert.equal(r.status, 201);
  assert.equal(r.body.status, 'pendente');
  assert.equal(r.body.lucroLiquido, 70);
  assert.equal(r.body.pedagio, 5);
  assert.equal(r.body.idaVolta, true);

  assert.equal((await setStatus(r.body._id, motorista, 'em_andamento')).status, 200);
  assert.equal((await setStatus(r.body._id, motorista, 'concluida')).status, 200);
  const depois = await driverStats(motorista);
  assert.equal(depois.lucroTotal, antes.lucroTotal + 70);
});

test('corrida manual: só o motorista dono cria (403) e valida o corpo (422)', async () => {
  const corpo = { driverId: motorista.driverId, passageiroNome: 'Cliente', ...RIDE_BODY, valor: 50 };
  assert.equal((await api('POST', '/api/rides', { token: outroMotorista.token, body: corpo })).status, 403);
  assert.equal((await api('POST', '/api/rides', { token: passageiro.token, body: corpo })).status, 403);
  assert.equal((await api('POST', '/api/rides', { token: motorista.token, body: { ...corpo, valor: 0 } })).status, 422);
  assert.equal(
    (await api('POST', '/api/rides', { token: motorista.token, body: { ...corpo, driverId: '00000000-0000-4000-8000-000000000000' } })).status,
    404,
  );
});

// ---------------------------------------------------------------- Status: dono + transições

test('status: só participantes da corrida mudam (403 para estranhos)', async () => {
  const ride = await confirmedRide(passageiro, motorista);
  assert.equal((await setStatus(ride._id, estranho, 'cancelada')).status, 403);
  assert.equal((await setStatus(ride._id, outroMotorista, 'em_andamento')).status, 403);
});

test('status: transições inválidas -> 409; papel errado -> 403; body inválido -> 422', async () => {
  const ride = await confirmedRide(passageiro, motorista);
  assert.equal((await setStatus(ride._id, passageiro, 'em_andamento')).status, 403); // só o motorista inicia
  assert.equal((await setStatus(ride._id, motorista, 'concluida')).status, 409);     // confirmada -> concluida
  assert.equal((await setStatus(ride._id, motorista, 'pendente')).status, 422);      // status fora do enum

  assert.equal((await setStatus(ride._id, motorista, 'em_andamento')).status, 200);
  assert.equal((await setStatus(ride._id, passageiro, 'concluida')).status, 403);    // só o motorista conclui
  assert.equal((await setStatus(ride._id, motorista, 'concluida')).status, 200);
});

test('status: concluída e cancelada são finais', async () => {
  const done = await confirmedRide(passageiro, motorista);
  await setStatus(done._id, motorista, 'em_andamento');
  await setStatus(done._id, motorista, 'concluida');
  for (const s of ['em_andamento', 'concluida', 'cancelada']) {
    assert.equal((await setStatus(done._id, motorista, s)).status, 409, `concluida -> ${s}`);
  }

  const canceled = await requestRide(passageiro, motorista);
  assert.equal((await setStatus(canceled._id, passageiro, 'cancelada')).status, 200);
  for (const s of ['em_andamento', 'concluida', 'cancelada']) {
    assert.equal((await setStatus(canceled._id, motorista, s)).status, 409, `cancelada -> ${s}`);
  }
});

test('passageiro e motorista podem cancelar antes e durante a corrida', async () => {
  const a = await requestRide(passageiro, motorista);            // aguardando_orcamento
  assert.equal((await setStatus(a._id, passageiro, 'cancelada')).status, 200);

  const b = await confirmedRide(passageiro, motorista);          // confirmada
  assert.equal((await setStatus(b._id, motorista, 'cancelada')).status, 200);

  const c = await confirmedRide(passageiro, motorista);          // em_andamento
  await setStatus(c._id, motorista, 'em_andamento');
  assert.equal((await setStatus(c._id, passageiro, 'cancelada')).status, 200);
});

test('status: id malformado -> 400, inexistente -> 404', async () => {
  assert.equal((await setStatus('abc', motorista, 'cancelada')).status, 400);
  assert.equal((await setStatus('00000000-0000-4000-8000-000000000000', motorista, 'cancelada')).status, 404);
});

test('concluir repetido ou simultâneo soma o lucro uma única vez', async () => {
  const ride = await confirmedRide(passageiro, motorista, 80);
  await setStatus(ride._id, motorista, 'em_andamento');
  const antes = await driverStats(motorista);

  const results = await Promise.all(Array.from({ length: 5 }, () => setStatus(ride._id, motorista, 'concluida')));
  const codes = results.map(r => r.status);
  assert.equal(codes.filter(c => c === 200).length, 1, `códigos: ${codes}`);
  assert.equal(codes.filter(c => c === 409).length, 4, `códigos: ${codes}`);

  await setStatus(ride._id, motorista, 'concluida'); // e mais uma depois
  const depois = await driverStats(motorista);
  assert.equal(depois.lucroTotal, antes.lucroTotal + 80);
  assert.equal(depois.totalCorridas, antes.totalCorridas + 1);
});

test('cancelar notifica o motorista', async () => {
  const ride = await requestRide(passageiro, motorista);
  await setStatus(ride._id, passageiro, 'cancelada');
  assert.ok((await notificacoes(motorista)).some(n => n.tipo === 'corrida_cancelada' && n.rideId === ride._id));
});

// ---------------------------------------------------------------- Leituras

test('GET /rides/driver/:id: só o motorista dono; filtra por data; ordena por data/hora', async () => {
  const m = await signup('motorista', 'Agenda');
  const p = await signup('passageiro', 'PassAgenda');
  await requestRide(p, m, { data: '2027-05-02', hora: '15:00' });
  await requestRide(p, m, { data: '2027-05-01', hora: '09:00' });
  await requestRide(p, m, { data: '2027-05-01', hora: '08:00' });

  assert.equal((await api('GET', `/api/rides/driver/${m.driverId}`, { token: outroMotorista.token })).status, 403);
  assert.equal((await api('GET', `/api/rides/driver/${m.driverId}`, { token: p.token })).status, 403);

  const all = await api('GET', `/api/rides/driver/${m.driverId}`, { token: m.token });
  assert.equal(all.status, 200);
  assert.deepEqual(all.body.map((r: any) => `${r.data} ${r.hora}`), ['2027-05-01 08:00', '2027-05-01 09:00', '2027-05-02 15:00']);

  const day = await api('GET', `/api/rides/driver/${m.driverId}?date=2027-05-01`, { token: m.token });
  assert.equal(day.body.length, 2);
});

test('GET /rides/passenger/:id: só o próprio; traz nome do motorista sem dados sensíveis', async () => {
  const m = await signup('motorista', 'Visivel');
  const p = await signup('passageiro', 'Solicitante');
  await requestRide(p, m);

  assert.equal((await api('GET', `/api/rides/passenger/${p.id}`, { token: estranho.token })).status, 403);
  assert.equal((await api('GET', `/api/rides/passenger/${p.id}`, { token: m.token })).status, 403);

  const r = await api('GET', `/api/rides/passenger/${p.id}`, { token: p.token });
  assert.equal(r.status, 200);
  assert.equal(r.body.length, 1);
  const drv = r.body[0].driverId;
  assert.equal(drv.userId.nome, 'Visivel');
  assert.equal(drv.lucroTotal, undefined);
  assert.equal(drv.userId.email, undefined);

  const filtered = await api('GET', `/api/rides/passenger/${p.id}?status=confirmada`, { token: p.token });
  assert.equal(filtered.body.length, 0);
});
