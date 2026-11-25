/**
 * O QUE A PESSOA RECEBE NO DIÁRIO (openspec `diario-com-correcao-que-vira-cartao`, "Para menores"):
 *  · `retorno`: plano pago com conta e adulto declarado (a IA, `POST /api/ai/diario`);
 *  · `conferir`: Grátis adulto, ou o teste de 3 dias, com a linha neutra sobre os planos;
 *  · `restrito`: perfil protegido (menor ou idade não declarada), conta restrita ou sem conta. SÓ "Conferir sozinho",
 *    sem falar de plano (menor não vê "Ver planos"). O servidor recusa o retorno de IA para estes com 403, de qualquer jeito.
 *
 * A mesma régua de `acessoDaEscrita` da Leitura ativa, com uma diferença: o perfil protegido NUNCA tem a IA do diário
 * na v1 (a Leitura ativa tem), até `filtro-tutor-menores` 4.3/4.4 e a rodada de risco (decisão do dono).
 */
import { definicaoDoPlano } from '../../core/planos';
import { getEntitlements } from '../entitlements';
import { estadoDeIdentidade } from '../identidade';
import { estadoDaProtecao } from '../protecaoDoMenor';

export type AcessoDoDiario = 'retorno' | 'conferir' | 'restrito';

export function acessoDoDiario(protegido: boolean): AcessoDoDiario {
  if (protegido) return 'restrito';
  const e = getEntitlements();
  const identidade = estadoDeIdentidade();
  const temConta = identidade === 'conta' || identidade === 'selfhost';
  if (!temConta || estadoDaProtecao()?.restrita === true) return 'restrito';
  if (e.teste) return 'conferir';
  const escritas = definicaoDoPlano(e.plan === 'anonimo' ? 'convidado' : e.plan).quotas.escritasMes;
  return escritas === null || escritas > 0 ? 'retorno' : 'conferir';
}
