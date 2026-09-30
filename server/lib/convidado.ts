/**
 * MODO CONVIDADO NO SERVIDOR (Fase 7) — desenho completo em
 * `openspec/audits/2026-09-25-prontidao/fase7-convidado.md`.
 *
 * O convidado é o usuário ANÔNIMO do Supabase (`signInAnonymously`, JWT com `is_anonymous: true`).
 * O cliente só cria essa identidade quando a flag `nuvem_convidado` está ligada E a pessoa tenta usar
 * a IA de nuvem — até lá o app é 100% local e o servidor nem sabe que ela existe.
 *
 * O QUE O SERVIDOR DEIXA O CONVIDADO FAZER: STT, tradução e tutor de nuvem, dentro de uma cota
 * pequena (`PLANO_CONVIDADO` em `src/core/planos.ts`) e só com a flag ligada. TODO O RESTO que
 * escreve no servidor responde 403 `exige_conta` (`exigirContaParaEscrever`): o convidado guarda
 * localmente, e a conta é onde as coisas passam a morar.
 *
 * AS QUATRO TRAVAS DA NUVEM DO CONVIDADO, em ordem (`abrirPortaGratuita`):
 *
 *   1. FLAG `nuvem_convidado` — desligada, 403 `exige_conta`. Nasce desligada: a Groq ainda está na
 *      camada grátis e o convidado não passa pela aferição de idade (LGPD art. 14).
 *   2. LIMITE DE CRIAÇÃO POR IP — no primeiro uso de nuvem o convidado é registrado com o IP
 *      pseudonimizado do dia; só os N primeiros ids distintos de um IP no dia usam a nuvem (429
 *      `limite_de_convidados`). É o que torna inútil criar anônimos em laço (o captcha do Supabase é a
 *      primeira linha; esta é a do nosso lado).
 *   3. POOL GLOBAL DIÁRIO (US$) de convidado + free, `max(piso, 5% da receita líquida ÷ 30)`, e a
 *      reserva dos pagantes: com o orçamento do mês a 80% a nuvem gratuita fecha (503
 *      `pool_gratuito_esgotado`) — os últimos 20% são de quem paga.
 *   4. TETOS DO CONVIDADO — por id no mês (US$ 0,02, 5 mensagens de tutor; segundos e tokens pelas
 *      cotas normais de `usageQuota.ts`) e POR IP NO DIA (US$ e tutor somando todos os convidados do
 *      IP): limpar cookies e virar outro anônimo não reseta a cota do IP (402 `quota_exceeded`).
 *
 * FALHA FECHADA, como as cotas: sem conseguir ler um contador, 503 `contador_indisponivel` e o
 * cliente cai no motor local.
 *
 * O `free` logado passa só pela trava 3. Sem a oferta de alívio aceita, ele continua sem nuvem (o
 * entitlement recusa depois); com ela (`x-nuvem-alivio: 1`, A10), as travas da NUVEM DE ALÍVIO vêm
 * em seguida (`server/lib/nuvemDeAlivio.ts`) e o custo entregue soma no pool gratuito E no do alívio.
 */
import { createHmac } from 'node:crypto'

import type { NextFunction, Request, Response } from 'express'
import { ipKeyGenerator } from 'express-rate-limit'

import { LIMITES_DO_CONVIDADO, normalizarPlano, PLAN_MATRIX, type PlanoEfetivo } from '../../src/core/planos'
import { convidadosRepo } from '../db/repositories/convidados'
import { gastoDeIaRepo } from '../db/repositories/gastoDeIa'
import { subscriptionsRepo } from '../db/repositories/subscriptions'
import { usageCountersRepo } from '../db/repositories/usageCounters'
import { authRequired } from './auth'
import { asUserId, type UserId } from './authContext'
import { limitesAntiabusoDoConvidado, parametrosDoPoolGratuito } from './config'
import { getPlanForUser } from './entitlements'
import { flagLigada } from './flags'
import { log } from './logger'
import { avaliarAlivio, pedeAlivio, registrarCustoDoAlivio, responderRecusaDoAlivio } from './nuvemDeAlivio'
import { tetoDoMesUsd } from './orcamentoDeIa'
import { responderErro } from './respostaDeErro'

export type RecursoDeNuvem = 'stt' | 'mt' | 'tutor'

/** Contadores em `usage_counters`. Gasto em MICRODÓLARES inteiros (US$ 1 = 1.000.000), como `gasto_de_ia`. */
export const METRIC_GASTO_MICRO_USD = 'gasto_micro_usd'
export const METRIC_TUTOR_MENSAGENS = 'tutor_mensagens'
/** Chave (coluna `user_id`) dos contadores diários por IP pseudonimizado. */
export const PREFIXO_IP = 'convidado-ip:'
/** Chave do pool global diário de IA gratuita. */
export const CHAVE_POOL = 'pool-gratuito'

/** Com o orçamento do mês nesta fração, a nuvem gratuita fecha: o resto é reserva dos pagantes. */
export const RESERVA_DOS_PAGANTES = 0.8

const DIA_MS = 86_400_000
const micro = (usd: number): number => Math.max(0, Math.round(usd * 1_000_000))
const dia = (agora: number): string => new Date(agora).toISOString().slice(0, 10)
const mes = (agora: number): string => new Date(agora).toISOString().slice(0, 7)
const inicioDoDia = (agora: number): number => Math.floor(agora / DIA_MS) * DIA_MS

/** Relógio injetável — os testes de limpeza e de virada de dia usam um relógio falso. */
let relogio: () => number = () => Date.now()
export function _definirRelogio(fn: (() => number) | null): void {
  relogio = fn ?? (() => Date.now())
}

// ───────────────────────────── IP pseudonimizado ─────────────────────────────

let chaveDeHash: string | null = null
async function chave(): Promise<string> {
  // Import tardio, como em `telemetriaDeIa.ts`: carregar este módulo não decide quando a chave é lida.
  chaveDeHash ??= (await import('../crypto')).CHAVE_DE_HASH
  return chaveDeHash
}

/**
 * O IP do request, PSEUDONIMIZADO: HMAC com a chave do servidor e o DIA. Não volta ao IP (LGPD art.
 * 12: dado pseudonimizado), e o mesmo IP em dias diferentes vira hashes diferentes — os contadores
 * são diários, e ligar dias não serve a nada aqui. `ipKeyGenerator` agrupa IPv6 por /56, para
 * trocar de endereço dentro da mesma rede não virar "outro IP".
 */
export async function ipPseudonimo(req: Request, agora = relogio()): Promise<string> {
  const ip = ipKeyGenerator(req.ip ?? '')
  return createHmac('sha256', await chave())
    .update(`babel-play:convidado-ip:v1:${dia(agora)}:${ip}`)
    .digest('hex')
    .slice(0, 32)
}

// ───────────────────────────── pool global diário ─────────────────────────────

/* Líquido por assinatura: preço − Asaas (R$ 1,09) − Simples (~6%), em US$ ao câmbio de planejamento
   (os mesmos números de `src/core/planos.ts`). */
const TAXA_FIXA_BRL = 1.09
const IMPOSTO = 0.06
const CAMBIO_BRL_POR_USD = 5.6
let receitaEmCache: { valor: number; ate: number } | null = null

/** A receita LÍQUIDA do mês em US$, a partir das assinaturas ativas (cache de 10 min). */
async function receitaLiquidaDoMesUsd(agora: number): Promise<number> {
  if (receitaEmCache && receitaEmCache.ate > agora) return receitaEmCache.valor
  const porPlano = await subscriptionsRepo.contarAtivasPorPlano()
  let brl = 0
  for (const { plan, ciclo, n } of porPlano) {
    /* Nome antigo conta como o atual (matriz v2): o Pro antigo que ainda paga R$ 39,90 entra pelo
       preço do Premium — o pool erra para MENOS, que é o lado seguro de um orçamento gratuito. */
    const plano = normalizarPlano(plan)
    if (!plano) continue
    const { precoMensalBrl, precoAnualBrl } = PLAN_MATRIX[plano]
    /* O anual rende por mês a 12ª parte do ano líquido — uma taxa fixa por ano, não por mês. */
    if (ciclo === 'anual' && precoAnualBrl) brl += (n * Math.max(0, precoAnualBrl * (1 - IMPOSTO) - TAXA_FIXA_BRL)) / 12
    else if (precoMensalBrl) brl += n * Math.max(0, precoMensalBrl * (1 - IMPOSTO) - TAXA_FIXA_BRL)
  }
  const valor = brl / CAMBIO_BRL_POR_USD
  receitaEmCache = { valor, ate: agora + 10 * 60_000 }
  return valor
}

/** O pool do dia em US$: `max(piso, fração × receita líquida do mês ÷ 30)`. */
export async function poolDoDiaUsd(agora = relogio()): Promise<number> {
  const { pisoUsdDia, fracaoDaReceita } = parametrosDoPoolGratuito()
  return Math.max(pisoUsdDia, (fracaoDaReceita * (await receitaLiquidaDoMesUsd(agora))) / 30)
}

// ───────────────────────────── respostas ─────────────────────────────

export const MENSAGEM_EXIGE_CONTA =
  'Isto precisa de uma conta. Como convidado, o que você faz fica guardado neste aparelho; crie uma conta para guardar no servidor.'

function exigeConta(res: Response): void {
  responderErro(res, 403, MENSAGEM_EXIGE_CONTA, 'exige_conta')
}

function contadorIndisponivel(res: Response, err: unknown): void {
  log('error', { event: 'convidado_contador_falhou', error: String((err as Error)?.message ?? err).slice(0, 120) })
  responderErro(
    res,
    503,
    'O contador de uso da IA de nuvem está fora do ar agora; o app segue com os modelos locais.',
    'contador_indisponivel',
  )
}

// ───────────────────────────── a porta ─────────────────────────────

export interface PortaGratuita {
  /** O plano resolvido (um só `getPlanForUser` por request). */
  plano: PlanoEfetivo
  /**
   * A conta Grátis aceitou a NUVEM DE ALÍVIO e passou pelas travas dela (A10): a chamada sai da
   * franquia do alívio (modo `alivio` de `usageQuota.ts`) e entra na faixa `alivio` da admissão.
   */
  alivio?: boolean
  /** Soma o custo ESTIMADO (US$) da chamada entregue: pool do dia, convidado no mês, IP no dia. */
  registrarCusto(usd: number): Promise<void>
  /** A chamada não aconteceu: devolve a mensagem de tutor reservada. Best-effort. */
  estornar(): Promise<void>
}

const semNada = async (): Promise<void> => {}

/**
 * As travas da nuvem para convidado e free. Devolve `null` quando JÁ RESPONDEU (403/429/402/503).
 * Para os demais planos devolve uma porta sem efeito — quem chama não precisa distinguir.
 */
export async function abrirPortaGratuita(
  req: Request,
  res: Response,
  recurso: RecursoDeNuvem,
): Promise<PortaGratuita | null> {
  let plano: PlanoEfetivo
  try {
    plano = await getPlanForUser(req.userId)
  } catch (err) {
    contadorIndisponivel(res, err)
    return null
  }
  if (plano !== 'convidado' && plano !== 'free') return { plano, registrarCusto: semNada, estornar: semNada }

  const agora = relogio()
  const hoje = dia(agora)
  const esteMes = mes(agora)

  // 1) A flag — só para o convidado. O free segue a regra de sempre (o entitlement dele decide).
  if (plano === 'convidado' && !(await flagLigada(req, 'nuvem_convidado'))) {
    exigeConta(res)
    return null
  }

  let ipHash = ''
  try {
    if (plano === 'convidado') {
      // 2) Registro + limite de criação por IP/dia.
      ipHash = await ipPseudonimo(req, agora)
      const linha = await convidadosRepo.registrar(req.userId, ipHash, agora)
      const desde = inicioDoDia(agora)
      if (linha.criadoEm >= desde) {
        const { convidadosPorIpDia } = limitesAntiabusoDoConvidado()
        const aceitos = await convidadosRepo.primeirosDoIp(linha.ipHash, desde, Math.max(0, convidadosPorIpDia))
        if (!aceitos.includes(req.userId)) {
          log('warn', { event: 'convidado_limite_por_ip', route: req.path, status: 429 })
          res.setHeader('Retry-After', String(Math.ceil((desde + DIA_MS - agora) / 1000)))
          responderErro(
            res,
            429,
            'Muitos convidados usaram a nuvem a partir desta rede hoje. Crie uma conta para continuar, ou use os modelos locais.',
            'limite_de_convidados',
          )
          return null
        }
      }
    }

    // 3) Pool global do dia + reserva dos pagantes.
    const [gastoDoDia, pool, gastoDoMes] = await Promise.all([
      convidadosRepo.lerContador(CHAVE_POOL, METRIC_GASTO_MICRO_USD, hoje),
      poolDoDiaUsd(agora),
      gastoDeIaRepo.ler(esteMes),
    ])
    const teto = tetoDoMesUsd()
    const reservaAtingida = Number.isFinite(teto) && (gastoDoMes?.microUsd ?? 0) >= micro(teto * RESERVA_DOS_PAGANTES)
    if (gastoDoDia >= micro(pool) || reservaAtingida) {
      log('warn', { event: 'pool_gratuito_esgotado', route: req.path, status: 503 })
      responderErro(
        res,
        503,
        'A IA de nuvem gratuita atingiu o limite de hoje; o app segue com os modelos locais.',
        'pool_gratuito_esgotado',
      )
      return null
    }

    if (plano !== 'convidado') {
      /* O alívio é só transcrição e tradução da captura; o tutor segue a regra do plano. */
      if (!(plano === 'free' && recurso !== 'tutor' && pedeAlivio(req)))
        return { plano, registrarCusto: (usd) => somarGasto(usd, { agora }), estornar: semNada }
      /* A NUVEM DE ALÍVIO (A10): flag, perfil protegido, franquia do mês, pool do dia e reserva. */
      const veredicto = await avaliarAlivio(req, agora)
      if (veredicto.ok === false) {
        responderRecusaDoAlivio(res, veredicto)
        return null
      }
      const conta = req.userId
      return {
        plano,
        alivio: true,
        registrarCusto: async (usd) => {
          await somarGasto(usd, { agora })
          await registrarCustoDoAlivio(conta, usd, agora)
        },
        estornar: semNada,
      }
    }

    // 4) Tetos do convidado: US$ no mês (id) e US$ no dia (IP).
    const { ipUsdDia, ipTutorDia } = limitesAntiabusoDoConvidado()
    const chaveIp = asUserId(PREFIXO_IP + ipHash)
    const [gastoDoConvidado, gastoDoIp] = await Promise.all([
      convidadosRepo.lerContador(req.userId, METRIC_GASTO_MICRO_USD, esteMes),
      convidadosRepo.lerContador(chaveIp, METRIC_GASTO_MICRO_USD, hoje),
    ])
    if (gastoDoConvidado >= micro(LIMITES_DO_CONVIDADO.tetoUsdMes) || gastoDoIp >= micro(ipUsdDia)) {
      cotaEsgotada(res, gastoDoIp >= micro(ipUsdDia) ? 'ip' : 'convidado')
      return null
    }

    // Tutor: mensagens contadas por id (mês) e por IP (dia), reservadas ANTES — decisão e contagem
    // na mesma instrução (`reserve`), como as outras cotas.
    let reservouTutor = false
    if (recurso === 'tutor') {
      if (
        !(await usageCountersRepo.reserve(
          req.userId,
          METRIC_TUTOR_MENSAGENS,
          esteMes,
          LIMITES_DO_CONVIDADO.tutorMensagensMes,
        ))
      ) {
        cotaEsgotada(res, 'convidado')
        return null
      }
      if (!(await usageCountersRepo.reserve(chaveIp, METRIC_TUTOR_MENSAGENS, hoje, ipTutorDia))) {
        await usageCountersRepo.refund(req.userId, METRIC_TUTOR_MENSAGENS, esteMes)
        cotaEsgotada(res, 'ip')
        return null
      }
      reservouTutor = true
    }

    const userId = req.userId
    return {
      plano,
      registrarCusto: (usd) => somarGasto(usd, { agora, userId, chaveIp }),
      estornar: async () => {
        if (!reservouTutor) return
        reservouTutor = false
        try {
          await usageCountersRepo.refund(userId, METRIC_TUTOR_MENSAGENS, esteMes)
          await usageCountersRepo.refund(chaveIp, METRIC_TUTOR_MENSAGENS, hoje)
        } catch (err) {
          log('warn', { event: 'convidado_estorno_falhou', error: String(err).slice(0, 120) })
        }
      },
    }
  } catch (err) {
    contadorIndisponivel(res, err)
    return null
  }
}

function cotaEsgotada(res: Response, escopo: 'convidado' | 'ip'): void {
  responderErro(
    res,
    402,
    escopo === 'ip'
      ? 'A cota de nuvem para convidados desta rede acabou por hoje. Crie uma conta para continuar, ou use os modelos locais.'
      : 'A cota de nuvem do convidado acabou. Crie uma conta para continuar, ou use os modelos locais.',
    'quota_exceeded',
    { plano: 'convidado', escopo },
  )
}

/** Soma o custo nos contadores. Best-effort, como `registrarGastoDeIa`: a chamada já foi paga. */
async function somarGasto(usd: number, o: { agora: number; userId?: UserId; chaveIp?: UserId }): Promise<void> {
  const valor = micro(usd)
  if (!(valor > 0)) return
  try {
    await usageCountersRepo.increment(asUserId(CHAVE_POOL), METRIC_GASTO_MICRO_USD, dia(o.agora), valor)
    if (o.userId) await usageCountersRepo.increment(o.userId, METRIC_GASTO_MICRO_USD, mes(o.agora), valor)
    if (o.chaveIp) await usageCountersRepo.increment(o.chaveIp, METRIC_GASTO_MICRO_USD, dia(o.agora), valor)
  } catch (err) {
    log('error', {
      event: 'convidado_gasto_registro_falhou',
      error: String((err as Error)?.message ?? err).slice(0, 120),
    })
  }
}

// ───────────────────────────── escrita exige conta ─────────────────────────────

/**
 * O que o convidado PODE mandar ao servidor fora de leitura: a nuvem (dentro das travas acima) e os
 * direitos do titular (`DELETE /api/me` — a exclusão nunca trava). A telemetria e o ranking ficam
 * antes do `authMiddleware` e nem passam por aqui.
 */
const ESCRITAS_DO_CONVIDADO: ReadonlyArray<{ metodo: string; caminho: RegExp }> = [
  { metodo: 'POST', caminho: /^\/api\/ai\/stt\/?$/ },
  { metodo: 'POST', caminho: /^\/api\/ai\/mt\/?$/ },
  { metodo: 'POST', caminho: /^\/api\/(tutor|gemini)\/chat\/?$/ },
  { metodo: 'DELETE', caminho: /^\/api\/me\/?$/ },
]

const LEITURA = new Set(['GET', 'HEAD', 'OPTIONS'])

/**
 * Middleware (montado logo depois do `authMiddleware`): convidado que tenta ESCREVER no servidor
 * (salvar sessão, subir áudio, importar, loja, cobrança, ajustes…) recebe 403 `exige_conta`. É uma
 * LISTA DE PERMISSÃO, não de bloqueio: rota nova nasce fechada para o convidado.
 */
export function exigirContaParaEscrever(req: Request, res: Response, next: NextFunction): void {
  if (!authRequired() || !req.convidado || LEITURA.has(req.method)) {
    next()
    return
  }
  const caminho = req.originalUrl.split('?')[0]
  if (ESCRITAS_DO_CONVIDADO.some((e) => e.metodo === req.method && e.caminho.test(caminho))) {
    next()
    return
  }
  exigeConta(res)
}
