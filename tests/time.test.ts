// Teste de unidade (sem API/banco): "hoje" no fuso de Brasília.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hojeBrasil, anoMesBrasil } from '../src/lib/time';

test('hojeBrasil usa o fuso de Brasília, não o UTC do servidor', () => {
  // 02:00 UTC de 1º/jan = 23:00 de 31/dez em Brasília (UTC-3)
  assert.equal(hojeBrasil(new Date('2027-01-01T02:00:00Z')), '2026-12-31');
  assert.deepEqual(anoMesBrasil(new Date('2027-01-01T02:00:00Z')), { ano: 2026, mes: 12 });
  // 03:00 UTC = meia-noite em Brasília: já é o dia novo
  assert.equal(hojeBrasil(new Date('2027-01-01T03:00:00Z')), '2027-01-01');
});
