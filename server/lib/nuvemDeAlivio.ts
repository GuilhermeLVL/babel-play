/**
 * A NUVEM DE ALÍVIO NO SERVIDOR (A10 do plano "Grátis sem travar") — o limite de VERDADE.
 *
 * O Grátis tem 3 h/mês de nuvem para aparelho fraco (`FRANQUIA_DE_ALIVIO` em `src/core/planos.ts`,
 * com a conta de custo). O cliente só OFERECE quando o aparelho não aguenta o modelo local (portão de
 * UX, `src/core/nuvemDeAlivio.ts`); quem PODE é decidido aqui, POR CONTA, a cada pedido que traz o
 * cabeçalho `x-nuvem-alivio: 1` (a oferta aceita). Sem o cabeçalho, a conta Grátis recebe o 402 de
 * sempre: ninguém gasta a franquia sem ter aceitado.
 *
 * AS TRAVAS, em ordem (`avaliarAlivio`), depois das travas comuns da nuvem gratuita (pool gratuito do
 * dia e reserva do mês, em `server/lib/convidado.ts`):
 *
 *   1. FLAG `nuvem_gratuita_alivio` — desligada, 503 `alivio_desligado`. Nasce desligada (migração
 *      0040): ligar é decisão do operador, com o orçamento do dia configurado.
 *   2. PERFIL PROTEGIDO — só com a autorização do responsável (vínculo aceito, conta liberada; a
 *      régua de `alivioAutorizadoPelaIdade`). Sem ela, 403 `alivio_exige_responsavel`. A conta
 *      RESTRITA (menor de 16 sem vínculo) nem chega aqui: `exigirContaLiberada` a recusa antes.
 *   3. FRANQUIA DO MÊS — os segundos (10.800) e o teto em DÓLAR por conta (US$ 0,13, o aceite do
 *      plano). Esgotada, 402 `quota_exceeded` com `escopo: 'alivio'`: o cliente mostra o aviso
 *      FUNCIONAL de fim de cota, nunca uma oferta promocional. Tokens e chamadas são conferidos na
 *      reserva (`usageQuota.ts`, modo `alivio`).
 *   4. POOL DO DIA do alívio (somando todas as contas; no máximo 20% do orçamento diário) e a
 *      RESERVA DOS PAGANTES (o gasto de todo mundo a 80% do teto do dia ou do mês fecha o alívio).
 *      Esgotado, 503 `pool_de_alivio_esgotado`, com `Retry-After` até 00:00 UTC.
 *
 * Nenhuma recusa daqui vende nada: 503/403 pausam a nuvem no cliente (`PausaDaNuvem`) e o aparelho
 * segue. A capacidade tem a mesma reserva de 80%: a faixa `alivio` da admissão (`admissao.ts`).
 *
 * FALHA FECHADA, como as cotas: sem conseguir ler um contador, quem chama responde 503
 * `contador_indisponivel` (as leituras lançam; `abrirPortaGratuita` já trata).
 *
 * SÓ CONTA LOGADA: o convidado tem o pool dele e nunca passa por aqui; o self-host resolve
 * `selfhost` e também não; o pagante usa a cota do plano (o cabeçalho é ignorado).
 */
import type { Request, Response } from 'express'

import {
  alivioAutorizadoPelaIdade,
  CABECALHO_DO_ALIVIO,
  FLAG_NUVEM_GRATUITA_ALIVIO,
  poolDoAlivioUsd,
  RECUSAS_DO_ALIVIO,
  reservaDosPagantesAtingida,
  segundosRestantesDoAlivio,
} from '../../src/core/nuvemDeAlivio'
import { FATOR_FATURADO_DO_STT, FRANQUIA_DE_ALIVIO } from '../../src/core/planos'
import { custoEfetivoDaPerna, ordenarPorCustoEfetivo, pernasDoStt } from '../ai/cascataDeStt'
import { gastoDeIaRepo } from '../db/repositories/gastoDeIa'
import { usageCountersRepo } from '../db/repositories/usageCounters'
import { asUserId, type UserId } from './authContext'
import { modeloDoSttGerenciado, parametrosDoAlivio } from './config'
import { flagLigada } from './flags'
import { estadoDeProtecao } from './idade'
import { log } from './logger'
import { custoDeStt, minimoFaturadoDoStt, tetoDoDiaUsd, tetoDoMesUsd } from './orcamentoDeIa'
import { responderErro } from './respostaDeErro'
import { currentWindow, METRIC_ALIVIO_STT_SEGUNDOS, METRIC_ALIVIO_TOKENS } from './usageQuota'

/** O gasto ESTIMADO da conta no alívio, no mês, em MICRODÓLARES inteiros (US$ 1 = 1.000.000). */
export const METRIC_ALIVIO_GASTO_MICRO_USD = 'alivio_gasto_micro_usd'
/** Chave (coluna `user_id`) do pool diário do alívio — soma de todas as contas. */
export const CHAVE_POOL_DO_ALIVIO = 'pool-alivio'
/** O pool usa o mesmo nome de métrica do pool gratuito (`convidado.ts`): gasto em microdólares por dia. */
const METRIC_GASTO_DO_POOL = 'gasto_micro_usd'

const DIA_MS = 86_400_000
const micro = (usd: number): number => Math.max(0, Math.round(usd * 1_000_000))
const diaDe = (agora: number): string => new Date(agora).toISOString().slice(0, 10)
const mesDe = (agora: number): string => new Date(agora).toISOString().slice(0, 7)

/** O pedido traz a oferta aceita (`x-nuvem-alivio: 1`)? */
export function pedeAlivio(req: Request): boolean {
  /* `header` é do Express; quem monta o `req` à mão (os testes de unidade dos proxies) não o tem — e
     sem cabeçalho não há oferta aceita. */
  const valor = typeof req.header === 'function' ? req.header(CABECALHO_DO_ALIVIO) : req.headers?.[CABECALHO_DO_ALIVIO]
  return valor === '1'
}

/** A duração de uma fala típica (s): é por ela que a cascata do STT escolhe a perna mais barata. */
const SEGUNDOS_DE_UMA_FALA = 6

/**
 * O custo FATURADO de um segundo real de fala no STT gerenciado — converte o dólar que sobra em tempo
 * (o "restam X" da oferta). O preço é o da perna que a cascata do STT (B6) chama PRIMEIRO para uma
 * fala típica (`ordenarPorCustoEfetivo`), e não o do `STT_MODEL` legado: com o registro
 * (`IA_PROVEDORES`) as pernas e os preços são outros. O fator do faturado (o mínimo de 10 s por pedido,
 * medido na bancada) só vale para a perna com mínimo; quem cobra por segundo fatura o que foi falado.
 * Sem perna com chave, o legado de antes.
 */
export function custoPorSegundoDoAlivio(env: NodeJS.ProcessEnv = process.env): number {
  const perna = ordenarPorCustoEfetivo(pernasDoStt(env), SEGUNDOS_DE_UMA_FALA)[0]
  if (!perna) return (custoDeStt(modeloDoSttGerenciado(env), 3600) * FATOR_FATURADO_DO_STT) / 3600
  const quem = { fornecedor: perna.fornecedor, preco: perna.preco }
  const fator = minimoFaturadoDoStt(perna.model, quem) > 0 ? FATOR_FATURADO_DO_STT : 1
  return (custoEfetivoDaPerna(perna, 3600) * fator) / 3600
}

/** O pool do dia agora, com o orçamento do operador. */
export function poolDoAlivioDoDiaUsd(): number {
  return poolDoAlivioUsd({
    tetoDiaUsd: tetoDoDiaUsd(),
    tetoMesUsd: tetoDoMesUsd(),
    poolConfiguradoUsd: parametrosDoAlivio().poolUsdDia,
  })
}

function segundosAteVirarODia(agora: number): number {
  return Math.max(1, Math.ceil((Math.floor(agora / DIA_MS) * DIA_MS + DIA_MS - agora) / 1000))
}

function segundosAteVirarOMes(agora: number): number {
  const d = new Date(agora)
  return Math.max(1, Math.ceil((Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) - agora) / 1000))
}

/** O uso do alívio da conta no mês, para a tela (`GET /api/me/uso`). */
export interface UsoDoAlivio {
  segundosDeAudio: { usado: number; teto: number }
  tokensDeLlm: { usado: number; teto: number }
}

export type VeredictoDoAlivio =
  | { ok: true; restanteSegundos: number; uso: UsoDoAlivio }
  | {
      ok: false
      status: 402 | 403 | 503
      code: string
      mensagem: string
      retryAfterS?: number
      detalhes?: Record<string, unknown>
      restanteSegundos: number
      uso: UsoDoAlivio | null
    }

const MENSAGENS = {
  desligado: 'A nuvem grátis não está disponível agora; o app segue no aparelho.',
  exigeResponsavel:
    'A nuvem grátis deste perfil precisa da autorização do responsável; enquanto isso, tudo roda no aparelho.',
  poolEsgotado: 'A nuvem grátis de hoje acabou; o app segue no aparelho e ela volta amanhã.',
  franquia: 'A nuvem grátis deste mês acabou; o app segue no aparelho e ela volta no dia 1º.',
} as const

/**
 * PODE usar o alívio AGORA? Lê, não reserva: a porta da nuvem (`abrirPortaDoAlivio`), o
 * `GET /api/ai/stt/available` e o `GET /api/me/uso` fazem a MESMA pergunta, e a resposta tem de ser
 * a mesma nos três. Quem chama já sabe que a conta é Grátis. Leitura que falha LANÇA (falha fechada).
 */
export async function avaliarAlivio(req: Request, agora = Date.now()): Promise<VeredictoDoAlivio> {
  if (!(await flagLigada(req, FLAG_NUVEM_GRATUITA_ALIVIO))) {
    return {
      ok: false,
      status: 503,
      code: RECUSAS_DO_ALIVIO.desligado,
      mensagem: MENSAGENS.desligado,
      restanteSegundos: 0,
      uso: null,
    }
  }
  const userId = req.userId
  if (!alivioAutorizadoPelaIdade(await estadoDeProtecao(userId, agora))) {
    return {
      ok: false,
      status: 403,
      code: RECUSAS_DO_ALIVIO.exigeResponsavel,
      mensagem: MENSAGENS.exigeResponsavel,
      restanteSegundos: 0,
      uso: null,
    }
  }

  const janela = currentWindow()
  const [gastoDaConta, sttUsados, tokensUsados, gastoDoPool, gastoGlobalDoDia, gastoGlobalDoMes] = await Promise.all([
    usageCountersRepo.get(userId, METRIC_ALIVIO_GASTO_MICRO_USD, janela),
    usageCountersRepo.get(userId, METRIC_ALIVIO_STT_SEGUNDOS, janela),
    usageCountersRepo.get(userId, METRIC_ALIVIO_TOKENS, janela),
    usageCountersRepo.get(asUserId(CHAVE_POOL_DO_ALIVIO), METRIC_GASTO_DO_POOL, diaDe(agora)),
    gastoDeIaRepo.ler(diaDe(agora)),
    gastoDeIaRepo.ler(mesDe(agora)),
  ])
  const { tetoUsdMes } = parametrosDoAlivio()
  const uso: UsoDoAlivio = {
    segundosDeAudio: { usado: sttUsados, teto: FRANQUIA_DE_ALIVIO.sttSegundosMes },
    tokensDeLlm: { usado: tokensUsados, teto: FRANQUIA_DE_ALIVIO.tokensMes },
  }
  const restanteSegundos = segundosRestantesDoAlivio({
    sttUsados,
    gastoUsd: gastoDaConta / 1_000_000,
    custoPorSegundoUsd: custoPorSegundoDoAlivio(),
    franquia: { sttSegundosMes: FRANQUIA_DE_ALIVIO.sttSegundosMes, tetoUsdMes },
  })

  /* 3) A franquia do mês: o dólar é o aceite do plano (≤ US$ 0,13 por conta); os segundos, a promessa. */
  if (gastoDaConta >= micro(tetoUsdMes) || sttUsados >= FRANQUIA_DE_ALIVIO.sttSegundosMes) {
    return {
      ok: false,
      status: 402,
      code: 'quota_exceeded',
      mensagem: MENSAGENS.franquia,
      detalhes: { escopo: 'alivio' },
      retryAfterS: segundosAteVirarOMes(agora),
      restanteSegundos: 0,
      uso,
    }
  }

  /* 4) O pool do dia (≤ 20% do orçamento diário) e a reserva de 80% dos pagantes. */
  const reserva = reservaDosPagantesAtingida({
    gastoDiaUsd: (gastoGlobalDoDia?.microUsd ?? 0) / 1_000_000,
    tetoDiaUsd: tetoDoDiaUsd(),
    gastoMesUsd: (gastoGlobalDoMes?.microUsd ?? 0) / 1_000_000,
    tetoMesUsd: tetoDoMesUsd(),
  })
  if (reserva || gastoDoPool >= micro(poolDoAlivioDoDiaUsd())) {
    return {
      ok: false,
      status: 503,
      code: RECUSAS_DO_ALIVIO.poolEsgotado,
      mensagem: MENSAGENS.poolEsgotado,
      retryAfterS: segundosAteVirarODia(agora),
      restanteSegundos,
      uso,
    }
  }
  return { ok: true, restanteSegundos, uso }
}

/** Responde a recusa do alívio, com `Retry-After` quando ela tem data para acabar. */
export function responderRecusaDoAlivio(res: Response, v: Extract<VeredictoDoAlivio, { ok: false }>): void {
  if (v.retryAfterS && typeof res.setHeader === 'function') res.setHeader('Retry-After', String(v.retryAfterS))
  log('warn', { event: 'alivio_recusado', route: res.req?.path, status: v.status, error: v.code })
  responderErro(res, v.status, v.mensagem, v.code, v.detalhes)
}

/**
 * Soma o custo ESTIMADO (US$) de uma chamada ENTREGUE no gasto da conta (mês) e no pool do dia.
 * Best-effort, como `registrarGastoDeIa`: a chamada já foi paga, e responder erro não devolveria nada.
 */
export async function registrarCustoDoAlivio(userId: UserId, usd: number, agora = Date.now()): Promise<void> {
  const valor = micro(usd)
  if (!(valor > 0)) return
  try {
    await usageCountersRepo.increment(userId, METRIC_ALIVIO_GASTO_MICRO_USD, currentWindow(), valor)
    await usageCountersRepo.increment(asUserId(CHAVE_POOL_DO_ALIVIO), METRIC_GASTO_DO_POOL, diaDe(agora), valor)
  } catch (err) {
    log('error', { event: 'alivio_gasto_registro_falhou', error: String((err as Error)?.message ?? err).slice(0, 120) })
  }
}

/** O alívio da conta Grátis, para `GET /api/me/uso` — `disponivel` é o mesmo veredicto da porta. */
export async function resumoDoAlivio(req: Request): Promise<{
  disponivel: boolean
  motivo: string | null
  restanteSegundos: number
  segundosDeAudio: { usado: number; teto: number }
  tokensDeLlm: { usado: number; teto: number }
}> {
  const v = await avaliarAlivio(req)
  const uso = v.uso ?? {
    segundosDeAudio: { usado: 0, teto: FRANQUIA_DE_ALIVIO.sttSegundosMes },
    tokensDeLlm: { usado: 0, teto: FRANQUIA_DE_ALIVIO.tokensMes },
  }
  return {
    disponivel: v.ok,
    motivo: v.ok === false ? v.code : null,
    restanteSegundos: v.restanteSegundos,
    ...uso,
  }
}
