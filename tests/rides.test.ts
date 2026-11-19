import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  startApi, stopApi, api, signup, requestRide, confirmedRide, setStatus, driverStats, RIDE_BODY, slot, Account,
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

test('motorista cria corrida manual: nasce confirmada e o lucro calculado no servidor entra no lucroTotal', async () => {
  const antes = await driverStats(motorista);
  const r = await api('POST', '/api/rides', {
    token: motorista.token,
    body: {
      driverId: motorista.driverId, passageiroNome: 'Cliente Avulso', ...RIDE_BODY, ...slot(),
      valor: 100, pedagio: 5, idaVolta: true, taxaEspera: 10, consumoMedio: 10, combustivelPreco: 6,
      // valores do app para custo/lucro são ignorados:
      lucroLiquido: 999, custoTotal: 1, custoCombustivel: 1,
    },
  });
  assert.equal(r.status, 201);
  assert.equal(r.body.status, 'confirmada');
  // combustível = 10 km × 2 (ida e volta) ÷ 10 km/l × R$ 6 = 12; custo = 12 + 5 de pedágio
  assert.equal(r.body.custoCombustivel, 12);
  assert.equal(r.body.custoTotal, 17);
  assert.equal(r.body.lucroLiquido, 83);
  assert.equal(r.body.pedagio, 5);
  assert.equal(r.body.idaVolta, true);

  assert.equal((await setStatus(r.body._id, motorista, 'em_andamento')).status, 200);
  assert.equal((await setStatus(r.body._id, motorista, 'concluida')).status, 200);
  const depois = await driverStats(motorista);
  assert.equal(depois.lucroTotal, antes.lucroTotal + 83);
});

test('corrida manual sem consumo informado usa o consumo do veículo; sem preço do combustível, custo é só o pedágio', async () => {
  const m = await signup('motorista', 'Consumo');
  await api('POST', '/api/vehicles', { token: m.token, body: { driverId: m.driverId, modelo: 'Gol', placa: 'CNS1A11', consumoMedio: 8 } });
  const base = { driverId: m.driverId, passageiroNome: 'Cliente', ...RIDE_BODY, distanciaKm: 40 };

  const comPreco = await api('POST', '/api/rides', { token: m.token, body: { ...base, ...slot(), valor: 100, combustivelPreco: 5 } });
  assert.equal(comPreco.status, 201);
  assert.equal(comPreco.body.consumoMedio, 8);           // veio do veículo
  assert.equal(comPreco.body.custoCombustivel, 25);      // 40 ÷ 8 × 5
  assert.equal(comPreco.body.lucroLiquido, 75);

  const semPreco = await api('POST', '/api/rides', { token: m.token, body: { ...base, ...slot(), valor: 100, pedagio: 7.5 } });
  assert.equal(semPreco.body.custoCombustivel, 0);
  assert.equal(semPreco.body.lucroLiquido, 92.5);
});

test('orçamento define o lucro da corrida pedida pelo passageiro (= valor, sem custos informados)', async () => {
  const ride = await requestRide(passageiro, motorista);
  const q = await api('PUT', `/api/rides/${ride._id}/quote`, { token: motorista.token, body: { valor: 55.9 } });
  assert.equal(q.body.lucroLiquido, 55.9);
  assert.equal(q.body.custoTotal, 0);
});

// ---------------------------------------------------------------- Conflito de agenda

test('pedido no mesmo dia e hora de outra corrida ativa do motorista -> 409; cancelada libera o horário', async () => {
  const m = await signup('motorista', 'AgendaCheia');
  const horario = { data: '2027-11-20', hora: '14:00' };
  const primeira = await requestRide(passageiro, m, horario);

  const conflito = await api('POST', '/api/rides/request', { token: estranho.token, body: { driverId: m.driverId, ...RIDE_BODY, ...horario } });
  assert.equal(conflito.status, 409);

  // outro horário no mesmo dia e o mesmo horário com OUTRO motorista: ok
  assert.equal((await api('POST', '/api/rides/request', { token: estranho.token, body: { driverId: m.driverId, ...RIDE_BODY, ...horario, hora: '15:00' } })).status, 201);
  assert.equal((await api('POST', '/api/rides/request', { token: estranho.token, body: { driverId: outroMotorista.driverId, ...RIDE_BODY, ...horario } })).status, 201);

  // corrida manual do próprio motorista também respeita a agenda
  const manual = { driverId: m.driverId, passageiroNome: 'Cliente', ...RIDE_BODY, ...horario, valor: 50 };
  assert.equal((await api('POST', '/api/rides', { token: m.token, body: manual })).status, 409);

  await setStatus(primeira._id, passageiro, 'cancelada');
  assert.equal((await api('POST', '/api/rides/request', { token: estranho.token, body: { driverId: m.driverId, ...RIDE_BODY, ...horario } })).status, 201);
});

test('pedidos simultâneos para o mesmo horário: só um passa', async () => {
  const m = await signup('motorista', 'Disputado');
  const body = { driverId: m.driverId, ...RIDE_BODY, data: '2027-12-01', hora: '09:30' };
  const results = await Promise.all(
    [passageiro, estranho, passageiro, estranho].map(p => api('POST', '/api/rides/request', { token: p.token, body })),
  );
  const codes = results.map(r => r.status).sort();
  assert.deepEqual(codes, [201, 409, 409, 409]);
});

test('pedido numa data de folga do motorista -> 409', async () => {
  const m = await signup('motorista', 'DeFolga');
  await api('POST', '/api/unavailable-periods', {
    token: m.token, body: { driverId: m.driverId, dataInicio: '2027-10-10', dataFim: '2027-10-12', motivo: 'descanso' },
  });
  for (const data of ['2027-10-10', '2027-10-11', '2027-10-12']) {
    const r = await api('POST', '/api/rides/request', { token: passageiro.token, body: { driverId: m.driverId, ...RIDE_BODY, data } });
    assert.equal(r.status, 409, data);
  }
  assert.equal((await requestRide(passageiro, m, { data: '2027-10-13' })).status, 'aguardando_orcamento');
});

// ---------------------------------------------------------------- Avisos ao passageiro

test('passageiro é avisado quando o motorista inicia e conclui a corrida', async () => {
  const p = await signup('passageiro', 'Avisado');
  const ride = await confirmedRide(p, motorista);
  await setStatus(ride._id, motorista, 'em_andamento');
  await setStatus(ride._id, motorista, 'concluida');
  const tipos = (await notificacoes(p)).filter(n => n.rideId === ride._id).map(n => n.tipo).sort();
  assert.deepEqual(tipos, ['corrida_aceita', 'corrida_concluida', 'orcamento_recebido']);
});

test('cancelamento avisa só a outra parte', async () => {
  const p = await signup('passageiro', 'Cancelado');
  const m = await signup('motorista', 'Cancelador');

  const peloMotorista = await confirmedRide(p, m);
  await setStatus(peloMotorista._id, m, 'cancelada');
  assert.ok((await notificacoes(p)).some(n => n.tipo === 'corrida_cancelada' && n.rideId === peloMotorista._id));
  assert.ok(!(await notificacoes(m)).some(n => n.tipo === 'corrida_cancelada' && n.rideId === peloMotorista._id));

  const peloPassageiro = await requestRide(p, m);
  await setStatus(peloPassageiro._id, p, 'cancelada');
  assert.ok((await notificacoes(m)).some(n => n.tipo === 'corrida_cancelada' && n.rideId === peloPassageiro._id));
  assert.ok(!(await notificacoes(p)).some(n => n.tipo === 'corrida_cancelada' && n.rideId === peloPassageiro._id));
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
  assert.equal((await setStatus(ride._id, motorista, 'pendente')).status, 422);      // status que não existe mais

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
