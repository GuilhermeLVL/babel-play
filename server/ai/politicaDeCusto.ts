/**
 * A POLÍTICA DE CUSTO — degradação SUAVE pelo orçamento e pela demanda (B4 da Fase B, 29/09/2026).
 *
 * O QUE HAVIA. Só o corte duro: o `portaoDaNuvem` (`server/lib/orcamentoDeIa.ts`) fecha a nuvem a
 * 100% do orçamento do mês ou do dia, e até lá TODA chamada começava no primeiro da cascata — para
 * quem paga, o modelo da nuance, o mais caro. Com o mês em 95%, a nuvem gastava os últimos dólares no
 * ritmo mais caro possível e fechava para todo mundo mais cedo.
 *
 * A REGRA (decisão do dono):
 *
 *   - a 70% do orçamento, QUEM PAGA (nível acima da rápida) desce para o degrau mais barato SÓ quando
 *     o balde do primeiro provedor está abaixo de 20% — é a demanda dizendo que o caro vai recusar
 *     de qualquer jeito, e o barato atende sem 429;
 *   - a 90%, TODOS começam no degrau mais barato (o resto da cascata continua atrás, na ordem dela);
 *   - degradado, o `max_tokens` cai para 75% — só em modelo SEM raciocínio (`ehModeloDeRaciocinio`):
 *     num gpt-oss o pensamento sai do mesmo teto, e cortá-lo devolveria a resposta vazia;
 *   - o corte duro continua no `portaoDaNuvem`: a política só reordena o que o portão deixou passar.
 *
 * O ORÇAMENTO POR PLANO. Os limiares são por NÍVEL (`LIMIARES_POR_NIVEL`): a rápida (Grátis,
 * convidado, alívio) não tem o degrau dos 70% — ela já é o barato —, e a nuance/o polimento têm os
 * dois. As franquias em dólar de quem não paga (o teto do convidado, o pool e a reserva de 80% do
 * alívio, A10) continuam onde estavam e fecham antes; a faixa `alivio` da admissão (os 20% de cima
 * do balde) também. A fração do orçamento é a MAIOR entre a do mês e a do dia: é a que fecha primeiro.
 *
 * O DEGRAU MAIS BARATO é pelo PREÇO de `fornecedor:modelo` (o do registro, ou a tabela do
 * orçamento) para ESTE pedido — tokens de entrada estimados e o `max_tokens` como saída —, e não pela
 * posição: o operador ordena a cascata por preferência, não necessariamente por preço.
 *
 * `decidirCusto` é pura (os testes a exercitam sem estado); `aplicarPoliticaDeCusto` lê o balde do
 * primeiro provedor, decide, conta na métrica e devolve a cascata reordenada.
 */
import type { NivelDaTraducao } from '../../src/core/nivelDeTraducao'
import { contarDegradacaoDeCusto } from '../http/metricas'
import { custoDeLlm } from '../lib/orcamentoDeIa'
import { fracaoDoBalde } from './admissao'
import type { Provedor } from './provedores'
import { nomeDoProvedor } from './telemetriaDeIa'

/** A 70%: o pagante desce se o primeiro balde está baixo. */
export const LIMIAR_DO_PAGANTE = 0.7
/** A 90%: todo mundo começa no degrau mais barato. */
export const LIMIAR_DE_TODOS = 0.9
/** "Balde baixo": abaixo de 20% do que ele comporta. */
export const SALDO_BAIXO_DO_PRIMEIRO = 0.2
/** O `max_tokens` degradado, em modelo sem raciocínio. */
export const FATOR_DE_SAIDA_ECONOMICA = 0.75

/** Os limiares de cada nível: `condicional` é o dos 70% (com o balde baixo); `null` = não tem. */
export const LIMIARES_POR_NIVEL: Readonly<Record<NivelDaTraducao, { condicional: number | null; total: number }>> = {
  rapida: { condicional: null, total: LIMIAR_DE_TODOS },
  nuance: { condicional: LIMIAR_DO_PAGANTE, total: LIMIAR_DE_TODOS },
  polimento: { condicional: LIMIAR_DO_PAGANTE, total: LIMIAR_DE_TODOS },
}

export type Degradacao = 'nenhuma' | 'orcamento_70' | 'orcamento_90'

export interface DecisaoDeCusto {
  /** A cascata na ordem em que será tentada. */
  pernas: Provedor[]
  degradacao: Degradacao
  /** Multiplica o `max_tokens` das pernas SEM raciocínio (1 = inteiro). */
  fatorDeSaida: number
}

export interface PedidoDeCusto {
  pernas: Provedor[]
  nivel: NivelDaTraducao
  /** A maior fração gasta do orçamento (mês ou dia), de 0 a 1+. */
  fracaoDoOrcamento: number
  /** Quanto sobra no balde do primeiro provedor, de 0 a 1 (`fracaoDoBalde`). */
  fracaoDoPrimeiroBalde: number
  tokensEntrada: number
  tokensSaida: number
}

/** O índice da perna mais barata para este pedido; empate fica com a que vem antes. */
function indiceDoMaisBarato(pernas: Provedor[], entrada: number, saida: number): number {
  let melhor = 0
  let menor = Infinity
  pernas.forEach((p, i) => {
    const custo = custoDeLlm(p.model, entrada, saida, { fornecedor: p.fornecedor, preco: p.preco })
    if (custo < menor - 1e-15) {
      menor = custo
      melhor = i
    }
  })
  return melhor
}

/** A decisão, pura: quem vai primeiro e quanto de saída. */
export function decidirCusto(p: PedidoDeCusto): DecisaoDeCusto {
  const limiar = LIMIARES_POR_NIVEL[p.nivel]
  const f = Number.isFinite(p.fracaoDoOrcamento) ? p.fracaoDoOrcamento : 0
  let degradacao: Degradacao = 'nenhuma'
  if (f >= limiar.total) degradacao = 'orcamento_90'
  else if (limiar.condicional !== null && f >= limiar.condicional && p.fracaoDoPrimeiroBalde < SALDO_BAIXO_DO_PRIMEIRO)
    degradacao = 'orcamento_70'
  if (degradacao === 'nenhuma' || p.pernas.length === 0) {
    return { pernas: p.pernas, degradacao, fatorDeSaida: degradacao === 'nenhuma' ? 1 : FATOR_DE_SAIDA_ECONOMICA }
  }
  const i = indiceDoMaisBarato(p.pernas, p.tokensEntrada, p.tokensSaida)
  const pernas = i === 0 ? p.pernas : [p.pernas[i], ...p.pernas.filter((_, j) => j !== i)]
  return { pernas, degradacao, fatorDeSaida: FATOR_DE_SAIDA_ECONOMICA }
}

/**
 * A POLÍTICA APLICADA a uma cascata de LLM: lê o balde do primeiro provedor só quando a regra dos
 * 70% pode depender dele, decide e conta a degradação (`ia_degradacao_de_custo_total`).
 */
export function aplicarPoliticaDeCusto(p: Omit<PedidoDeCusto, 'fracaoDoPrimeiroBalde'>): DecisaoDeCusto {
  const limiar = LIMIARES_POR_NIVEL[p.nivel]
  const primeiro = p.pernas[0]
  const precisaDoBalde =
    primeiro !== undefined &&
    limiar.condicional !== null &&
    p.fracaoDoOrcamento >= limiar.condicional &&
    p.fracaoDoOrcamento < limiar.total
  const fracaoDoPrimeiroBalde = precisaDoBalde
    ? fracaoDoBalde({
        tipo: 'llm',
        provedor: nomeDoProvedor(primeiro.base),
        modelo: primeiro.model,
        limites: primeiro.limites,
        compartilhado: primeiro.limitesDaConta,
      })
    : 1
  const decisao = decidirCusto({ ...p, fracaoDoPrimeiroBalde })
  if (decisao.degradacao !== 'nenhuma') contarDegradacaoDeCusto(decisao.degradacao, p.nivel)
  return decisao
}
