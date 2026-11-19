// =============================================================================
// Custo e lucro da corrida — calculados SEMPRE no servidor.
// -----------------------------------------------------------------------------
//   combustível = distância (×2 se ida e volta) ÷ consumo (km/l) × preço do litro
//   custo total = combustível + pedágio
//   lucro       = valor − custo total
//
// "valor" é o que o passageiro paga. Pedágio é custo do motorista. Sem consumo
// ou sem preço do combustível, o custo de combustível é 0. Valores enviados
// pelo app para custo/lucro são ignorados.
// =============================================================================
import type { Prisma } from '@prisma/client';

type Num = number | Prisma.Decimal | null | undefined;

const n = (v: Num) => (v == null ? 0 : Number(v));
const centavos = (v: number) => Math.round(v * 100) / 100;

export interface DadosCorrida {
  valor: Num;
  distanciaKm: Num;
  idaVolta?: boolean | null;
  consumoMedio?: Num;     // km por litro
  combustivelPreco?: Num; // R$ por litro
  pedagio?: Num;
}

export function calcularFinanceiro(d: DadosCorrida) {
  const km = n(d.distanciaKm) * (d.idaVolta ? 2 : 1);
  const consumo = n(d.consumoMedio);
  const preco = n(d.combustivelPreco);

  const custoCombustivel = consumo > 0 && preco > 0 ? centavos((km / consumo) * preco) : 0;
  const custoTotal = centavos(custoCombustivel + n(d.pedagio));
  const lucroLiquido = centavos(n(d.valor) - custoTotal);

  return { custoCombustivel, custoTotal, lucroLiquido };
}
