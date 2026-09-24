/**
 * ORÇAMENTO GLOBAL DA IA DE NUVEM + CHAVE DE EMERGÊNCIA (Fase 2 do lançamento — OWASP LLM10).
 *
 * As cotas de `usageQuota.ts` limitam UM assinante. Este módulo limita a SOMA — o que chega na
 * fatura do Groq e do OpenRouter no fim do mês. Duas travas, conferidas por `portaoDaNuvem()`
 * ANTES de qualquer chamada gerenciada (tradução, transcrição, tutor):
 *
 *   1. `AI_ENABLED=0` — desliga tudo na hora. Para incidente: fatura estranha, chave vazada,
 *      provedor com problema de privacidade.
 *   2. `AI_BUDGET_USD_MONTH` — o teto em dólares do mês. Cada chamada entregue soma o custo
 *      ESTIMADO (tokens ou segundos × preço do modelo) na tabela `gasto_de_ia`. A 80% sai UM evento
 *      `ia_orcamento_alerta_80` (warn) — é o gancho para um alerta de verdade (Sentry/Axiom) quando
 *      a observabilidade entrar; a 100% sai `ia_orcamento_esgotado` (error) e a nuvem fecha até o
 *      mês virar.
 *
 * FALHA FECHADA, como as cotas: sem conseguir ler o gasto, a nuvem fecha. O custo é o usuário usar
 * os modelos locais por alguns minutos; o contrário seria gasto sem teto justamente quando o banco
 * está com problema.
 *
 * O QUE É ESTIMATIVA. O preço vem de uma tabela (oficial, sobreponível por `AI_PRECOS_MODELOS`), e
 * o gasto é conferido ANTES e somado DEPOIS — com muitas chamadas simultâneas no limiar, o mês pode
 * passar alguns centavos do teto. É por isso que o teto do painel do Groq e o crédito pré-pago sem
 * recarga do OpenRouter continuam valendo como segunda trava (ver `docs/` do lançamento).
 */
import type { Response } from 'express'

import { gastoDeIaRepo } from '../db/repositories/gastoDeIa'
import { iaDeNuvemLigada, orcamentoMensalDeIaUsd, type PrecoDeModelo, precosDeModelosDoEnv } from './config'
import { log } from './logger'

/**
 * Preços OFICIAIS (US$) usados quando o operador não sobrepõe — Groq, consultado em 24/09/2026.
 * LLM: por 1 milhão de tokens de entrada/saída. STT: por hora de áudio (a Groq cobra no mínimo 10 s
 * por requisição; `segundosFaturaveis` já aplica o mínimo, e `custoDeStt` o reaplica por segurança).
 */
const PRECOS_OFICIAIS: Readonly<Record<string, PrecoDeModelo>> = {
  'openai/gpt-oss-120b': { entrada: 0.15, saida: 0.6 },
  'openai/gpt-oss-20b': { entrada: 0.075, saida: 0.3 },
  'whisper-large-v3-turbo': { hora: 0.04 },
  'whisper-large-v3': { hora: 0.111 },
}

/**
 * Modelo sem preço conhecido é cobrado CARO de propósito: errar para mais fecha a nuvem um pouco
 * antes; errar para menos deixaria um modelo novo (trocado por env) gastar sem que o orçamento o
 * enxergasse. O operador corrige declarando o preço em `AI_PRECOS_MODELOS`.
 */
const PRECO_LLM_DESCONHECIDO = { entrada: 1, saida: 3 }
const PRECO_STT_DESCONHECIDO = { hora: 0.111 }
const MINIMO_FATURADO_STT_S = 10

function precoDe(modelo: string): PrecoDeModelo | undefined {
  return precosDeModelosDoEnv()[modelo] ?? PRECOS_OFICIAIS[modelo]
}

/** Custo estimado (US$) de uma chamada de LLM. */
export function custoDeLlm(modelo: string, tokensEntrada: number, tokensSaida: number): number {
  const p = precoDe(modelo)
  const entrada = p?.entrada ?? PRECO_LLM_DESCONHECIDO.entrada
  const saida = p?.saida ?? PRECO_LLM_DESCONHECIDO.saida
  return (Math.max(0, tokensEntrada) * entrada + Math.max(0, tokensSaida) * saida) / 1_000_000
}

/** Custo estimado (US$) de uma transcrição, já com o mínimo faturado por requisição. */
export function custoDeStt(modelo: string, segundos: number): number {
  const hora = precoDe(modelo)?.hora ?? PRECO_STT_DESCONHECIDO.hora
  return (Math.max(MINIMO_FATURADO_STT_S, segundos) * hora) / 3600
}

const mesAtual = (): string => new Date().toISOString().slice(0, 7)

/** O teto do mês em US$ (`Infinity` = sem teto, só no self-host sem a variável). */
export function tetoDoMesUsd(): number {
  return orcamentoMensalDeIaUsd()
}

export type MotivoDoPortao = 'ia_desligada' | 'orcamento_esgotado' | 'orcamento_indisponivel'

export interface Portao {
  ok: boolean
  motivo?: MotivoDoPortao
  /** A frase para o usuário: o que houve e o que o app faz agora. */
  mensagem?: string
}

const MENSAGENS: Record<MotivoDoPortao, string> = {
  ia_desligada: 'A IA de nuvem está desligada temporariamente; o app segue com os modelos locais.',
  orcamento_esgotado:
    'A IA de nuvem atingiu o limite de uso deste mês e volta no dia 1º; o app segue com os modelos locais.',
  orcamento_indisponivel: 'Não consegui conferir o limite da IA de nuvem agora; o app segue com os modelos locais.',
}

const fechado = (motivo: MotivoDoPortao): Portao => ({ ok: false, motivo, mensagem: MENSAGENS[motivo] })

/** A nuvem pode ser usada AGORA? Conferido antes de reservar cota e antes de falar com o provedor. */
export async function portaoDaNuvem(): Promise<Portao> {
  if (!iaDeNuvemLigada()) return fechado('ia_desligada')
  const teto = tetoDoMesUsd()
  if (!Number.isFinite(teto)) return { ok: true }
  try {
    const gasto = await gastoDeIaRepo.ler(mesAtual())
    const tetoMicro = Math.round(teto * 1_000_000)
    if ((gasto?.microUsd ?? 0) >= tetoMicro) return fechado('orcamento_esgotado')
    return { ok: true }
  } catch (err) {
    log('error', { event: 'ia_orcamento_leitura_falhou', error: String((err as Error)?.message ?? err).slice(0, 120) })
    return fechado('orcamento_indisponivel')
  }
}

/** 503 com o motivo. O cliente cai nos modelos locais (os adaptadores de nuvem tratam 5xx assim). */
export function responderPortaoFechado(res: Response, portao: Portao): void {
  res.status(503).json({ error: portao.mensagem, code: portao.motivo })
}

/**
 * Soma o custo de uma chamada ENTREGUE ao gasto do mês e dispara os limiares. Best-effort: uma falha
 * aqui só loga — a chamada já aconteceu e foi paga, e responder erro ao usuário não devolveria nada.
 */
export async function registrarGastoDeIa(custoUsd: number): Promise<void> {
  if (!Number.isFinite(custoUsd) || custoUsd <= 0) return
  const mes = mesAtual()
  try {
    const totalMicro = await gastoDeIaRepo.somar(mes, custoUsd * 1_000_000)
    const teto = tetoDoMesUsd()
    if (!Number.isFinite(teto) || teto <= 0) return
    const fracao = totalMicro / (teto * 1_000_000)
    const campos = {
      gastoUsd: Math.round(totalMicro) / 1_000_000,
      tetoUsd: teto,
      total: Math.round(fracao * 100),
    }
    if (fracao >= 0.8 && (await gastoDeIaRepo.marcarAlerta80(mes))) {
      log('warn', {
        event: 'ia_orcamento_alerta_80',
        ...campos,
        error: `gasto de IA do mês em ${campos.total}% do orçamento (US$ ${campos.gastoUsd.toFixed(2)} de US$ ${teto})`,
      })
    }
    if (fracao >= 1 && (await gastoDeIaRepo.marcarEsgotado(mes))) {
      log('error', {
        event: 'ia_orcamento_esgotado',
        ...campos,
        error: `orçamento de IA do mês esgotado (US$ ${campos.gastoUsd.toFixed(2)} de US$ ${teto}); nuvem desligada até o mês virar`,
      })
    }
  } catch (err) {
    log('error', { event: 'ia_gasto_registro_falhou', error: String((err as Error)?.message ?? err).slice(0, 120) })
  }
}

export interface EstadoDoOrcamento {
  mes: string
  ligada: boolean
  gastoUsd: number
  /** `null` = sem teto (self-host). */
  tetoUsd: number | null
  percentual: number | null
  chamadas: number
  alerta80Em: number | null
  esgotadoEm: number | null
  portao: Portao
}

/** O estado inteiro, para o operador (`GET /api/admin/ia`). */
export async function estadoDoOrcamento(): Promise<EstadoDoOrcamento> {
  const mes = mesAtual()
  const teto = tetoDoMesUsd()
  const [gasto, portao] = await Promise.all([gastoDeIaRepo.ler(mes), portaoDaNuvem()])
  const gastoUsd = (gasto?.microUsd ?? 0) / 1_000_000
  const finito = Number.isFinite(teto)
  return {
    mes,
    ligada: iaDeNuvemLigada(),
    gastoUsd,
    tetoUsd: finito ? teto : null,
    percentual: finito && teto > 0 ? Math.round((gastoUsd / teto) * 1000) / 10 : null,
    chamadas: gasto?.chamadas ?? 0,
    alerta80Em: gasto?.alerta80Em ?? null,
    esgotadoEm: gasto?.esgotadoEm ?? null,
    portao,
  }
}
