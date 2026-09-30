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
 * TETO DIÁRIO (Fase 5 de prontidão, 25/09/2026): `AI_BUDGET_USD_DAY` repete a regra no dia UTC —
 * `ia_orcamento_diario_alerta_80` (warn) e `ia_orcamento_diario_esgotado` (error, a nuvem fecha até
 * 00:00 UTC). Existe porque o mensal sozinho deixa um laço de cliente queimar o mês numa tarde.
 * Cada custo registrado também alimenta o custo POR PLANO (`ia_custo_usd_total{plano}`) e o vigia
 * de gasto anômalo POR USUÁRIO (`gastoAnomalo.ts`).
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
import { contarCustoPorPlano, contarGastoAnomalo, registrarLeitorDeGasto } from '../http/metricas'
import {
  iaDeNuvemLigada,
  limiaresDeGastoPorUsuario,
  orcamentoDiarioDeIaUsd,
  orcamentoMensalDeIaUsd,
  type PrecoDeModelo,
  precosDeModelosDoEnv,
} from './config'
import { criarVigiaDeGasto } from './gastoAnomalo'
import { log } from './logger'
import { pseudonimoDoUsuario } from './pseudonimoDeUsuario'

/**
 * Preços OFICIAIS (US$) usados quando nem o registro de provedores nem o operador declaram um. LLM:
 * por 1 milhão de tokens de entrada / entrada em cache / saída. STT: por hora de áudio, com o mínimo
 * faturado por pedido.
 *
 * POR PROVEDOR:MODELO desde o B2 da Fase B (29/09/2026). A tabela era só por modelo — o preço da
 * Groq —, e o mesmo `gpt-oss-120b` custa US$ 0,037/0,17 na DeepInfra (deepinfra.com, consultada em
 * 29/09/2026, retenção zero): com a cascata barata, o orçamento superestimaria o gasto ~4× e fecharia
 * a nuvem antes da hora. Fontes: Groq — groq.com/pricing (24/09/2026) e o desconto de 50% nos tokens
 * do cache de prompt dos gpt-oss (console.groq.com/docs/prompt-caching, 29/09/2026); o mínimo de 10 s
 * por pedido do Whisper é da Groq. As linhas SÓ-MODELO são o preço de antes, e valem para fornecedor
 * sem preço próprio — inclusive o OpenRouter, cujo preço depende do provedor que ele escolhe (declare
 * no `IA_PROVEDORES` ou em `AI_PRECOS_MODELOS` como `openrouter:<modelo>`). Elas não têm preço de
 * cache: sem saber o desconto, o cache custa a entrada inteira (o erro para mais).
 *
 * É A TABELA ÚNICA: o orçamento global, a métrica `ia_provedor_custo_usd_total`
 * (`server/http/metricas.ts`) e o Langfuse usam o custo calculado AQUI, uma vez, sobre a perna que de
 * fato respondeu (`server/ai/cascata.ts`) — para o painel e o teto nunca discordarem.
 */
const PRECOS_OFICIAIS: Readonly<Record<string, PrecoDeModelo>> = {
  'groq:openai/gpt-oss-120b': { entrada: 0.15, entradaEmCache: 0.075, saida: 0.6 },
  'groq:openai/gpt-oss-20b': { entrada: 0.075, entradaEmCache: 0.0375, saida: 0.3 },
  'groq:whisper-large-v3-turbo': { hora: 0.04, minimoFaturadoS: 10 },
  'groq:whisper-large-v3': { hora: 0.111, minimoFaturadoS: 10 },
  'deepinfra:openai/gpt-oss-120b': { entrada: 0.037, saida: 0.17 },
  'deepinfra:openai/gpt-oss-20b': { entrada: 0.03, saida: 0.14 },
  'openai/gpt-oss-120b': { entrada: 0.15, saida: 0.6 },
  'openai/gpt-oss-20b': { entrada: 0.075, saida: 0.3 },
  'whisper-large-v3-turbo': { hora: 0.04 },
  'whisper-large-v3': { hora: 0.111 },
}

/**
 * Modelo sem preço conhecido é cobrado CARO de propósito: errar para mais fecha a nuvem um pouco
 * antes; errar para menos deixaria um modelo novo (trocado por env) gastar sem que o orçamento o
 * enxergasse. O operador corrige declarando o preço no `IA_PROVEDORES` ou em `AI_PRECOS_MODELOS`.
 * O mínimo do STT não declarado é o da Groq (10 s), pelo mesmo motivo.
 */
const PRECO_LLM_DESCONHECIDO = { entrada: 1, saida: 3 }
const PRECO_STT_DESCONHECIDO = { hora: 0.111 }
const MINIMO_FATURADO_STT_S = 10

/** Quem cobrou: o fornecedor que respondeu e o preço que o registro declarou para ele. */
export interface QuemCobra {
  /** O id neutro do fornecedor (`groq`, `deepinfra`…) — a chave `fornecedor:modelo` das tabelas. */
  fornecedor?: string
  /** O preço declarado no registro para esta perna (`IA_PROVEDORES`). Vence as tabelas. */
  preco?: PrecoDeModelo
}

/**
 * O preço de um modelo, do mais específico ao mais geral: o declarado no registro; o
 * `AI_PRECOS_MODELOS` por `fornecedor:modelo` e por modelo; a tabela oficial nas mesmas duas chaves.
 */
function precoDe(modelo: string, quem: QuemCobra = {}): PrecoDeModelo | undefined {
  if (quem.preco) return quem.preco
  const doEnv = precosDeModelosDoEnv()
  const f = quem.fornecedor
  return (
    (f ? doEnv[`${f}:${modelo}`] : undefined) ??
    doEnv[modelo] ??
    (f ? PRECOS_OFICIAIS[`${f}:${modelo}`] : undefined) ??
    PRECOS_OFICIAIS[modelo]
  )
}

/**
 * Custo estimado (US$) de uma chamada de LLM. `emCache` são os tokens de entrada servidos do cache
 * de prompt do provedor — já DENTRO de `tokensEntrada` (é assim que o formato OpenAI os devolve) —,
 * cobrados pelo preço de cache; sem ele declarado, pelo da entrada.
 */
export function custoDeLlm(
  modelo: string,
  tokensEntrada: number,
  tokensSaida: number,
  quem: QuemCobra & { emCache?: number } = {},
): number {
  const p = precoDe(modelo, quem)
  const entrada = p?.entrada ?? PRECO_LLM_DESCONHECIDO.entrada
  const emCache = p?.entradaEmCache ?? entrada
  const saida = p?.saida ?? PRECO_LLM_DESCONHECIDO.saida
  const total = Math.max(0, tokensEntrada)
  /* O cache nunca passa da entrada: um provedor que conte errado não produz custo negativo. */
  const doCache = Math.min(total, Math.max(0, quem.emCache ?? 0))
  return ((total - doCache) * entrada + doCache * emCache + Math.max(0, tokensSaida) * saida) / 1_000_000
}

/** O mínimo de segundos que o provedor fatura POR PEDIDO de STT (Groq: 10; não declarado: 10). */
export function minimoFaturadoDoStt(modelo: string, quem: QuemCobra = {}): number {
  return precoDe(modelo, quem)?.minimoFaturadoS ?? MINIMO_FATURADO_STT_S
}

/** Custo estimado (US$) de uma transcrição — por segundo, com o mínimo faturado DO PROVEDOR. */
export function custoDeStt(modelo: string, segundos: number, quem: QuemCobra = {}): number {
  const hora = precoDe(modelo, quem)?.hora ?? PRECO_STT_DESCONHECIDO.hora
  return (Math.max(minimoFaturadoDoStt(modelo, quem), segundos) * hora) / 3600
}

const mesAtual = (): string => new Date().toISOString().slice(0, 7)
/**
 * O DIA (UTC) mora na MESMA tabela, com a chave `AAAA-MM-DD` ao lado das `AAAA-MM` do mês (Fase 5 de
 * prontidão). A tabela é "gasto por período": a aritmética atômica, o marcador de 80% e o de 100%
 * são idênticos — uma tabela nova duplicaria o repositório inteiro para mudar o formato da chave.
 */
const diaAtual = (): string => new Date().toISOString().slice(0, 10)

/** O teto do mês em US$ (`Infinity` = sem teto, só no self-host sem a variável). */
export function tetoDoMesUsd(): number {
  return orcamentoMensalDeIaUsd()
}

/** O teto do dia (UTC) em US$ (`Infinity` = sem teto diário; ver `AI_BUDGET_USD_DAY`). */
export function tetoDoDiaUsd(): number {
  return orcamentoDiarioDeIaUsd()
}

export type MotivoDoPortao =
  | 'ia_desligada'
  | 'orcamento_esgotado'
  | 'orcamento_diario_esgotado'
  | 'orcamento_indisponivel'

export interface Portao {
  ok: boolean
  motivo?: MotivoDoPortao
  /** A frase para o usuário: o que houve e o que o app faz agora. */
  mensagem?: string
  /**
   * Aberto: a maior fração já gasta do orçamento (mês ou dia), de 0 a 1 — a entrada da degradação
   * suave (B4, `server/ai/politicaDeCusto.ts`). Ausente = sem teto finito (nada a degradar).
   */
  fracaoDoOrcamento?: number
}

const MENSAGENS: Record<MotivoDoPortao, string> = {
  ia_desligada: 'A IA de nuvem está desligada temporariamente; o app segue com os modelos locais.',
  orcamento_esgotado:
    'A IA de nuvem atingiu o limite de uso deste mês e volta no dia 1º; o app segue com os modelos locais.',
  orcamento_diario_esgotado:
    'A IA de nuvem atingiu o limite de uso de hoje e volta amanhã (00:00 UTC); o app segue com os modelos locais.',
  orcamento_indisponivel: 'Não consegui conferir o limite da IA de nuvem agora; o app segue com os modelos locais.',
}

const fechado = (motivo: MotivoDoPortao): Portao => ({ ok: false, motivo, mensagem: MENSAGENS[motivo] })

/** A nuvem pode ser usada AGORA? Conferido antes de reservar cota e antes de falar com o provedor. */
export async function portaoDaNuvem(): Promise<Portao> {
  if (!iaDeNuvemLigada()) return fechado('ia_desligada')
  const teto = tetoDoMesUsd()
  const tetoDia = tetoDoDiaUsd()
  if (!Number.isFinite(teto) && !Number.isFinite(tetoDia)) return { ok: true }
  try {
    /* O mensal primeiro na MENSAGEM ("volta no dia 1º" é o que vale quando os dois estouraram), e as
       duas leituras juntas: uma ida ao banco a mais só quando o teto diário está configurado. */
    const [gasto, gastoDia] = await Promise.all([
      Number.isFinite(teto) ? gastoDeIaRepo.ler(mesAtual()) : null,
      Number.isFinite(tetoDia) ? gastoDeIaRepo.ler(diaAtual()) : null,
    ])
    if (Number.isFinite(teto) && (gasto?.microUsd ?? 0) >= Math.round(teto * 1_000_000))
      return fechado('orcamento_esgotado')
    if (Number.isFinite(tetoDia) && (gastoDia?.microUsd ?? 0) >= Math.round(tetoDia * 1_000_000))
      return fechado('orcamento_diario_esgotado')
    /* A FRAÇÃO GASTA, para a degradação suave (B4, `server/ai/politicaDeCusto.ts`): a maior entre o
       mês e o dia — é a que fecha primeiro. Sai das MESMAS leituras do portão: a política não custa
       uma ida ao banco a mais. Teto zero já fechou acima; aqui só entra teto positivo. */
    const fracao = (g: { microUsd: number } | null, t: number) =>
      Number.isFinite(t) && t > 0 ? (g?.microUsd ?? 0) / (t * 1_000_000) : 0
    return { ok: true, fracaoDoOrcamento: Math.max(fracao(gasto, teto), fracao(gastoDia, tetoDia)) }
  } catch (err) {
    log('error', { event: 'ia_orcamento_leitura_falhou', error: String((err as Error)?.message ?? err).slice(0, 120) })
    return fechado('orcamento_indisponivel')
  }
}

/** 503 com o motivo. O cliente cai nos modelos locais (os adaptadores de nuvem tratam 5xx assim). */
export function responderPortaoFechado(res: Response, portao: Portao): void {
  res.status(503).json({ error: portao.mensagem, code: portao.motivo })
}

/** Os eventos de cada período — o mensal mantém os nomes que o Sentry e o runbook já conhecem. */
const EVENTOS = {
  mes: {
    alerta: 'ia_orcamento_alerta_80',
    esgotado: 'ia_orcamento_esgotado',
    nome: 'do mês',
    volta: 'até o mês virar',
  },
  dia: {
    alerta: 'ia_orcamento_diario_alerta_80',
    esgotado: 'ia_orcamento_diario_esgotado',
    nome: 'do dia',
    volta: 'até 00:00 UTC',
  },
} as const

/**
 * Soma no período e dispara os limiares — a MESMA regra para o mês e para o dia: 80% avisa uma vez
 * (warn), 100% fecha a nuvem (error, uma vez). O marcador devolve `true` só para quem marcou primeiro.
 */
async function somarNoPeriodo(tipo: 'mes' | 'dia', periodo: string, custoUsd: number, teto: number): Promise<void> {
  const totalMicro = await gastoDeIaRepo.somar(periodo, custoUsd * 1_000_000)
  if (!Number.isFinite(teto) || teto <= 0) return
  const ev = EVENTOS[tipo]
  const fracao = totalMicro / (teto * 1_000_000)
  const campos = {
    gastoUsd: Math.round(totalMicro) / 1_000_000,
    tetoUsd: teto,
    total: Math.round(fracao * 100),
  }
  if (fracao >= 0.8 && (await gastoDeIaRepo.marcarAlerta80(periodo))) {
    log('warn', {
      event: ev.alerta,
      ...campos,
      error: `gasto de IA ${ev.nome} em ${campos.total}% do orçamento (US$ ${campos.gastoUsd.toFixed(2)} de US$ ${teto})`,
    })
  }
  if (fracao >= 1 && (await gastoDeIaRepo.marcarEsgotado(periodo))) {
    log('error', {
      event: ev.esgotado,
      ...campos,
      error: `orçamento de IA ${ev.nome} esgotado (US$ ${campos.gastoUsd.toFixed(2)} de US$ ${teto}); nuvem desligada ${ev.volta}`,
    })
  }
}

/** O vigia de gasto por usuário do processo (ver `gastoAnomalo.ts`). */
const vigiaDeGasto = criarVigiaDeGasto({ limiares: () => limiaresDeGastoPorUsuario() })

/** Quem pagou a chamada — para o custo por plano e o gasto anômalo por usuário. */
export interface ContextoDoGasto {
  userId?: string
  /** O plano da assinatura (`free|essencial|pro|selfhost`). */
  plano?: string
}

/**
 * Soma o custo de uma chamada ENTREGUE ao gasto do mês E do dia, e dispara os limiares. Best-effort:
 * uma falha aqui só loga — a chamada já aconteceu e foi paga, e responder erro ao usuário não
 * devolveria nada.
 */
export async function registrarGastoDeIa(custoUsd: number, contexto: ContextoDoGasto = {}): Promise<void> {
  if (!Number.isFinite(custoUsd) || custoUsd <= 0) return
  contarCustoPorPlano(contexto.plano, custoUsd)
  if (contexto.userId) await vigiarUsuario(contexto.userId, custoUsd)
  try {
    await somarNoPeriodo('mes', mesAtual(), custoUsd, tetoDoMesUsd())
    /* O dia é somado SEMPRE, com ou sem teto: é ele que alimenta `ia_gasto_usd{periodo="dia"}` e o
       painel de custo diário — e ligar o teto depois não pode começar de um dia "vazio". */
    await somarNoPeriodo('dia', diaAtual(), custoUsd, tetoDoDiaUsd())
  } catch (err) {
    log('error', { event: 'ia_gasto_registro_falhou', error: String((err as Error)?.message ?? err).slice(0, 120) })
  }
}

/**
 * Gasto anômalo de UM usuário: `warn` `ia_gasto_anomalo_usuario` com o id PSEUDONIMIZADO (o mesmo
 * `u_…` do Langfuse — ver `pseudonimoDeUsuario.ts`) e a métrica. O id real nunca vai para o log: o
 * warn chega ao Sentry, que é um terceiro.
 */
async function vigiarUsuario(userId: string, custoUsd: number): Promise<void> {
  const anomalo = vigiaDeGasto.registrar(userId, custoUsd)
  if (!anomalo) return
  contarGastoAnomalo(anomalo.motivo)
  let usuario = 'indisponivel'
  try {
    usuario = await pseudonimoDoUsuario(userId)
  } catch {
    /* sem o sal (SECRET_KEY ilegível) o alerta sai assim mesmo, só sem dizer quem */
  }
  const gasto = anomalo.gastoUsd.toFixed(4)
  log('warn', {
    event: 'ia_gasto_anomalo_usuario',
    usuario,
    gastoUsd: Math.round(anomalo.gastoUsd * 1_000_000) / 1_000_000,
    tetoUsd: anomalo.tetoUsd,
    medianaUsd: anomalo.medianaUsd ?? undefined,
    error:
      anomalo.motivo === 'teto'
        ? `usuário ${usuario} gastou US$ ${gasto} de IA hoje (limiar US$ ${anomalo.tetoUsd})`
        : `usuário ${usuario} gastou US$ ${gasto} de IA hoje, acima de ${limiaresDeGastoPorUsuario().fatorDaMediana}× a mediana (US$ ${(anomalo.medianaUsd ?? 0).toFixed(4)})`,
  })
}

/* As métricas `ia_gasto_usd` e `ia_orcamento_teto_usd` são lidas daqui, na hora do scrape. */
registrarLeitorDeGasto(async () => {
  const [mes, dia] = await Promise.all([gastoDeIaRepo.ler(mesAtual()), gastoDeIaRepo.ler(diaAtual())])
  return {
    mesUsd: (mes?.microUsd ?? 0) / 1_000_000,
    diaUsd: (dia?.microUsd ?? 0) / 1_000_000,
    tetoMesUsd: tetoDoMesUsd(),
    tetoDiaUsd: tetoDoDiaUsd(),
  }
})

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
  /** O dia corrente (UTC): mesmo formato, com o teto de `AI_BUDGET_USD_DAY`. */
  dia: {
    dia: string
    gastoUsd: number
    tetoUsd: number | null
    percentual: number | null
    chamadas: number
    alerta80Em: number | null
    esgotadoEm: number | null
  }
  portao: Portao
}

/** O estado inteiro, para o operador (`GET /api/admin/ia`). */
export async function estadoDoOrcamento(): Promise<EstadoDoOrcamento> {
  const mes = mesAtual()
  const dia = diaAtual()
  const teto = tetoDoMesUsd()
  const tetoDia = tetoDoDiaUsd()
  const [gasto, gastoDia, portao] = await Promise.all([gastoDeIaRepo.ler(mes), gastoDeIaRepo.ler(dia), portaoDaNuvem()])
  const gastoUsd = (gasto?.microUsd ?? 0) / 1_000_000
  const gastoDiaUsd = (gastoDia?.microUsd ?? 0) / 1_000_000
  const finito = Number.isFinite(teto)
  const finitoDia = Number.isFinite(tetoDia)
  return {
    mes,
    ligada: iaDeNuvemLigada(),
    gastoUsd,
    tetoUsd: finito ? teto : null,
    percentual: finito && teto > 0 ? Math.round((gastoUsd / teto) * 1000) / 10 : null,
    chamadas: gasto?.chamadas ?? 0,
    alerta80Em: gasto?.alerta80Em ?? null,
    esgotadoEm: gasto?.esgotadoEm ?? null,
    dia: {
      dia,
      gastoUsd: gastoDiaUsd,
      tetoUsd: finitoDia ? tetoDia : null,
      percentual: finitoDia && tetoDia > 0 ? Math.round((gastoDiaUsd / tetoDia) * 1000) / 10 : null,
      chamadas: gastoDia?.chamadas ?? 0,
      alerta80Em: gastoDia?.alerta80Em ?? null,
      esgotadoEm: gastoDia?.esgotadoEm ?? null,
    },
    portao,
  }
}
