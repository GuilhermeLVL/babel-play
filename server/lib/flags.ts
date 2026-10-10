/**
 * FEATURE FLAGS NO SERVIDOR (Fase 6b) — cache, validação, contexto do request e as travas.
 *
 * A AVALIAÇÃO é pura e mora em `src/core/flags.ts`. Aqui fica o que depende do processo:
 *
 * CACHE EM MEMÓRIA, TTL de 30 s, invalidado na escrita. A topologia é processo único (ADR 0006),
 * então a invalidação local basta: quem escreve (rota admin) é o mesmo processo que lê. A CLI de
 * operação escreve de OUTRO processo — aí vale o TTL, e a mudança aparece em até 30 s. Leituras
 * simultâneas com o cache vencido fazem UMA consulta só (a promessa em voo é compartilhada).
 *
 * VALIDAÇÃO NAS DUAS PONTAS. A escrita recusa regra ou payload fora da forma (400 com a lista). A
 * leitura desconfia do banco mesmo assim — uma linha editada à mão com SQL não pode derrubar
 * `/api/flags` para todo mundo: regra ilegível DESLIGA a flag, payload ilegível é descartado (o
 * cliente usa o padrão embutido). As duas deixam um `warn` no log.
 *
 * AS TRAVAS: portas de emergência VENCEM flags. `vender_planos` não duplica a lógica de
 * `abertura.ts` — ela consulta `estadoDaAbertura()` e, com `CHECKOUT_ENABLED=0`, sai desligada
 * para todo mundo, qualquer que seja a regra no banco. A porta é do operador de plantão (variável
 * de ambiente, sem banco no caminho); a flag é do produto (quem vê a venda, em que idioma, para
 * que porcentagem). Ver `docs/flags.md`.
 *
 * NUNCA É SEGURANÇA NEM COTA. `flagLigada` serve para rota nova nascer desligada, não para decidir
 * quem pode gastar — isso é `entitlements.ts`/`usageQuota.ts`.
 */
import type { Request } from 'express'
import { z } from 'zod'

import {
  avaliarFlag,
  avaliarFlags,
  type ContextoDaFlag,
  type DefinicaoDeFlag,
  type FlagsAvaliadas,
  FORMATO_DA_CHAVE,
  partesDaVersao,
  type PlanoDaFlag,
  planoDaFlag,
  PLANOS_DA_FLAG,
  type RegrasDaFlag,
} from '../../src/core/flags'
import { flagsRepo, type LinhaDeFlag } from '../db/repositories/flags'
import { estadoDaAbertura } from './abertura'
import { authRequired } from './auth'
import { asUserId, LOCAL_OWNER } from './authContext'
import { getPlanForUser } from './entitlements'
import { log } from './logger'
import { FORMATO_DE_IDIOMA, ofertasSchema } from './ofertas'
import { versaoDoApp } from './versao'

export const TTL_DO_CACHE_MS = 30_000
/** O payload vai para todo cliente em toda leitura: teto de 32 KB serializado. */
export const TETO_DO_PAYLOAD = 32 * 1024

export const CABECALHO_DA_INSTALACAO = 'x-babel-instalacao'
export const CABECALHO_DO_IDIOMA = 'x-babel-idioma'
/** O cliente manda a versão DO BUNDLE no mesmo nome em que o servidor manda a dele. */
export const CABECALHO_DA_VERSAO_DO_CLIENTE = 'x-babel-versao'

// ───────────────────────────── schemas ─────────────────────────────

/**
 * A lista de planos de uma regra, lida com TOLERÂNCIA ao nome antigo (matriz v2, ADR 0011):
 * `pro` vira `premium` e a repetição some ANTES do teto de tamanho — sem isso,
 * `["free","pro","premium"]` viraria `["free","premium","premium"]` e uma regra que só envelheceu
 * seria recusada como inválida, desligando a flag inteira. Nome desconhecido continua recusado.
 */
const planosDaRegra = z.preprocess(
  (v) => (Array.isArray(v) ? [...new Set(v.map((p) => planoDaFlag(p) ?? p))] : v),
  z.array(z.enum(PLANOS_DA_FLAG)).max(PLANOS_DA_FLAG.length),
)

export const regrasSchema = z
  .object({
    planos: planosDaRegra.optional(),
    percentual: z.number().int().min(0).max(100).optional(),
    ids: z.array(z.string().trim().min(1).max(128)).max(1000).optional(),
    idiomas: z.array(z.string().regex(FORMATO_DE_IDIOMA)).max(60).optional(),
    versaoMinima: z
      .string()
      .refine((v) => partesDaVersao(v) !== null, 'versão no formato 1.2.3')
      .optional(),
  })
  .strict()

/**
 * Chaves com payload de forma conhecida. Chave fora daqui aceita qualquer JSON (dentro do teto) —
 * uma flag nova de configuração nasce livre e ganha schema quando a tela que a lê existir.
 */
export const SCHEMAS_DE_PAYLOAD: Record<string, z.ZodType> = {
  oferta_planos: ofertasSchema,
}

/** Travas: `false` força a flag desligada para todos. Leitura em tempo de chamada. */
const TRAVAS: Record<string, () => boolean> = {
  vender_planos: () => estadoDaAbertura().checkout,
}

// ───────────────────────────── linha → definição ─────────────────────────────

function lerJson(texto: string | null): unknown {
  if (texto === null || texto === undefined) return null
  try {
    return JSON.parse(texto)
  } catch {
    return undefined // ilegível (≠ ausente)
  }
}

/** Interpreta uma linha do banco desconfiando dela. Nunca lança. */
export function definicaoDaLinha(l: LinhaDeFlag): DefinicaoDeFlag {
  const regras = regrasSchema.safeParse(lerJson(l.regras))
  let habilitada = l.habilitada
  if (!regras.success) {
    habilitada = false
    log('warn', { event: 'flag_regra_invalida', flag: l.chave })
  }
  let payload = lerJson(l.payload)
  if (payload === undefined) {
    payload = null
    log('warn', { event: 'flag_payload_invalido', flag: l.chave })
  } else if (payload !== null && SCHEMAS_DE_PAYLOAD[l.chave]) {
    const p = SCHEMAS_DE_PAYLOAD[l.chave].safeParse(payload)
    if (!p.success) {
      payload = null
      log('warn', { event: 'flag_payload_invalido', flag: l.chave })
    } else payload = p.data
  }
  return {
    chave: l.chave,
    descricao: l.descricao,
    habilitada,
    regras: regras.success ? (regras.data as RegrasDaFlag) : {},
    payload,
  }
}

// ───────────────────────────── cache ─────────────────────────────

let cache: { em: number; defs: DefinicaoDeFlag[] } | null = null
let emVoo: Promise<DefinicaoDeFlag[]> | null = null

/** As definições, do cache (30 s) ou do banco. */
export async function definicoesDasFlags(agora = Date.now()): Promise<DefinicaoDeFlag[]> {
  if (cache && agora - cache.em < TTL_DO_CACHE_MS) return cache.defs
  if (emVoo) return emVoo
  emVoo = flagsRepo
    .listar()
    .then((linhas) => {
      const defs = linhas.map(definicaoDaLinha)
      cache = { em: Date.now(), defs }
      return defs
    })
    .finally(() => {
      emVoo = null
    })
  return emVoo
}

/** Esquece o cache — a próxima leitura vai ao banco. Chamado em toda escrita. */
export function invalidarCacheDeFlags(): void {
  cache = null
}

// ───────────────────────────── contexto e avaliação ─────────────────────────────

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** O plano no vocabulário das flags. Sem conta = `convidado`. */
async function planoDoContexto(userId: string | undefined): Promise<PlanoDaFlag> {
  if (!authRequired()) return 'selfhost'
  if (!userId) return 'convidado'
  try {
    return await getPlanForUser(asUserId(userId))
  } catch {
    return 'free' // o banco falhou: o plano mais comum, nunca um pago
  }
}

/**
 * O contexto de avaliação de um request. `userId` explícito vence o do request (a rota pública
 * resolve o token por conta própria, porque roda antes do `authMiddleware`).
 */
export async function contextoDoRequest(req: Request, userId?: string | null): Promise<ContextoDaFlag> {
  const quem = userId ?? req.userId ?? (authRequired() ? undefined : LOCAL_OWNER)
  const instalacao = req.header(CABECALHO_DA_INSTALACAO)?.trim()
  const idioma = req.header(CABECALHO_DO_IDIOMA)?.trim()
  const versao = req.header(CABECALHO_DA_VERSAO_DO_CLIENTE)?.trim()
  return {
    plano: await planoDoContexto(quem ?? undefined),
    userId: quem ?? null,
    instalacao: instalacao && UUID.test(instalacao) ? instalacao.toLowerCase() : null,
    idioma: idioma && FORMATO_DE_IDIOMA.test(idioma) ? idioma : null,
    // Sem cabeçalho, a do servidor: o cliente sem versão é o bundle que este servidor serviu.
    versao: versao && partesDaVersao(versao) ? versao.slice(0, 64) : versaoDoApp(),
  }
}

function aplicarTravas(avaliadas: FlagsAvaliadas): FlagsAvaliadas {
  for (const [chave, aberta] of Object.entries(TRAVAS)) {
    if (avaliadas[chave]?.ligada && !aberta()) avaliadas[chave] = { ligada: false }
  }
  return avaliadas
}

/** Todas as flags avaliadas para um contexto — o corpo de `GET /api/flags`. */
export async function avaliarParaContexto(ctx: ContextoDaFlag): Promise<FlagsAvaliadas> {
  return aplicarTravas(avaliarFlags(await definicoesDasFlags(), ctx))
}

/**
 * Para usar DENTRO de rotas: `if (!(await flagLigada(req, 'modo_convidado'))) return 404`.
 * Flag inexistente = desligada. Falha ao ler o banco = desligada (o lado seguro de um interruptor
 * de produto é "como antes da feature").
 */
export async function flagLigada(req: Request, chave: string): Promise<boolean> {
  try {
    const def = (await definicoesDasFlags()).find((d) => d.chave === chave)
    if (!def) return false
    if (!avaliarFlag(def, await contextoDoRequest(req))) return false
    const trava = TRAVAS[chave]
    return trava ? trava() : true
  } catch {
    return false
  }
}

// ───────────────────────────── escrita (admin / CLI) ─────────────────────────────

export class ErroDeFlag extends Error {
  constructor(
    message: string,
    readonly detalhes?: string[],
  ) {
    super(message)
  }
}

export interface AlteracaoDeFlag {
  descricao?: string
  habilitada?: boolean
  regras?: unknown
  /** `null` apaga o payload. */
  payload?: unknown
}

const detalhesDoZod = (e: z.ZodError) => e.issues.map((i) => `${i.path.join('.') || '(raiz)'}: ${i.message}`)

/** A flag como o ADMIN a vê: regras e payload interpretados, sem nada escondido. */
export interface FlagCrua extends DefinicaoDeFlag {
  atualizadoEm: number
  atualizadoPor: string | null
}

function crua(l: LinhaDeFlag): FlagCrua {
  return {
    ...definicaoDaLinha(l),
    habilitada: l.habilitada,
    atualizadoEm: l.atualizadoEm,
    atualizadoPor: l.atualizadoPor,
  }
}

export async function listarFlagsCruas(): Promise<FlagCrua[]> {
  return (await flagsRepo.listar()).map(crua)
}

/**
 * Cria ou altera uma flag (merge com a anterior). Valida chave, regras e payload; grava; invalida o
 * cache; e deixa rastro — `atualizado_por` no banco e um evento `flag_alterada` no log.
 */
export async function definirFlag(chave: string, alt: AlteracaoDeFlag, ator: string): Promise<FlagCrua> {
  if (!FORMATO_DA_CHAVE.test(chave)) {
    throw new ErroDeFlag('chave inválida: minúsculas, dígitos e _, começando por letra (2–63)')
  }
  const anterior = await flagsRepo.ler(chave)
  if (!anterior && !alt.descricao?.trim()) throw new ErroDeFlag('flag nova precisa de descrição')

  let regras = anterior?.regras ?? '{}'
  if (alt.regras !== undefined) {
    const r = regrasSchema.safeParse(alt.regras)
    if (!r.success) throw new ErroDeFlag('regras inválidas', detalhesDoZod(r.error))
    regras = JSON.stringify(r.data)
  }

  let payload = anterior?.payload ?? null
  if (alt.payload !== undefined) {
    if (alt.payload === null) payload = null
    else {
      const schema = SCHEMAS_DE_PAYLOAD[chave]
      let valor: unknown = alt.payload
      if (schema) {
        const p = schema.safeParse(alt.payload)
        if (!p.success) throw new ErroDeFlag(`payload inválido para ${chave}`, detalhesDoZod(p.error))
        valor = p.data
      }
      payload = JSON.stringify(valor)
      if (payload.length > TETO_DO_PAYLOAD) throw new ErroDeFlag(`payload acima de ${TETO_DO_PAYLOAD} bytes`)
    }
  }

  const descricao = alt.descricao?.trim().slice(0, 300) ?? anterior?.descricao ?? ''
  const gravada = await flagsRepo.gravar({
    chave,
    descricao,
    habilitada: alt.habilitada ?? anterior?.habilitada ?? false,
    regras,
    payload,
    atualizadoEm: Date.now(),
    atualizadoPor: ator.slice(0, 128),
  })
  invalidarCacheDeFlags()
  log('info', { event: anterior ? 'flag_alterada' : 'flag_criada', flag: chave, habilitada: gravada.habilitada })
  return crua(gravada)
}
