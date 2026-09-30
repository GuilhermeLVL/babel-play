/**
 * SINTETIZAR A VOZ NATURAL — o núcleo do modo intérprete (`POST /api/ai/tts`), sem Express (E4 da Fase
 * E; núcleo desde a Fase F).
 *
 * O intérprete lê em voz alta a tradução de cada fala. No Grátis, com a voz do aparelho
 * (`speechSynthesis`, no cliente — nem chega aqui); no Premium, com a voz natural da nuvem, que é esta
 * função. O cliente (`src/lib/voz/vozDaNuvem.ts`) cai na voz do aparelho, NO MESMO ITEM da fila, a
 * qualquer recusa daqui — por isso cada recusa diz o porquê, mas nenhuma vende nada.
 *
 * O MESMO CAMINHO DAS OUTRAS FUNÇÕES DE IA, na ordem (a mais barata primeiro, nada gasto antes da hora):
 *   1. pedido (400, `lerPedidoDeVoz`): `texto` até 600 caracteres, `idioma`, a `voz` pronta e a
 *      `velocidade` — e só isso. Campo de áudio de referência ou de voz criada é 400
 *      `clonagem_de_voz_recusada`: NÃO HÁ CLONAGEM;
 *   2. ENTITLEMENT `vozNatural` (402 `exige_voz_natural`), nunca o nome do plano;
 *   3. FLAG `voz_natural` (503 `voz_natural_desligada`): nasce desligada (migração 0046), e só liga com
 *      a retenção do provedor registrada em `docs/lgpd/operadores.md` e `docs/lgpd/ropa.csv`;
 *   4. CONFIGURAÇÃO (501 `voz_nao_configurada`): nenhuma perna `tts` com a chave no ambiente; nenhuma
 *      que fale o idioma: 422;
 *   5. CACHE L1 (em memória, curto, por bytes): a mesma fala no mesmo idioma e na mesma voz não vai ao
 *      provedor de novo — nem gasta cota, porque não custa nada a ninguém;
 *   6. PORTÃO da nuvem (503: chave de emergência e orçamento do mês/dia);
 *   7. ADMISSÃO `tts` (429 `nuvem_ocupada`): uma voz em voo por pessoa e o balde de cada perna;
 *   8. COTA de caracteres no mês e no dia local (402 `quota_exceeded` / 429 `uso_justo_do_dia` — o uso
 *      justo do C4; nada de oferta: quem chega aqui já é assinante);
 *   9. CASCATA das pernas na ordem do registro: 429 e 5xx passam para a próxima; o 429 fecha o balde
 *      até o `Retry-After`; o disjuntor é por perna;
 *  10. CUSTO da perna que respondeu (por caractere, `custoDeTts`) no gasto do mês e no painel.
 *
 * O MENOR segue as regras de sempre: no app, a conta restrita nem chega aqui (`exigirContaLiberada` no
 * mount de `/api/ai`); a liberada, com o Premium, tem a voz como qualquer assinante — o texto que vai ao
 * provedor é a tradução que a conversa já mandou à nuvem de tradução, com retenção zero. Fora do app, só
 * adulto (`recusaDeQuemPede`).
 *
 * O RESULTADO é o próprio áudio, com um tipo da lista fechada de `audio/*`; o adaptador HTTP o envia com
 * `Cache-Control: no-store` e `nosniff`.
 */
import { createHash } from 'node:crypto'

import { z } from 'zod'

import {
  CODIGOS_DA_VOZ_NATURAL,
  FLAG_VOZ_NATURAL,
  TETO_DE_CARACTERES_DA_VOZ,
  VELOCIDADE_DA_VOZ,
} from '../../../src/core/vozNatural'
import { contarAdmissaoRecusada, observarChamadaDeProvedor } from '../../http/metricas'
import { erroDeRota } from '../../lib/erroDeRota'
import { log } from '../../lib/logger'
import { custoDeTts, portaoDaNuvem, registrarGastoDeIa } from '../../lib/orcamentoDeIa'
import { ContadorIndisponivel, estornarCaracteresDeVoz, reservarCaracteresDeVoz } from '../../lib/usageQuota'
import {
  admitirNoBalde,
  ocuparVaga,
  type PlanoDeAdmissao,
  planoDeAdmissao,
  type Recusa,
  registrarLimiteNaAdmissao,
  segundosDoRetryAfter,
  type TicketDeBalde,
} from '../admissao'
import { alvoDaPerna } from '../cascata'
import { chaveDoProvedor, disjuntorPermite, registrarFalha, registrarSucesso } from '../disjuntor'
import {
  bcp47DaVoz,
  CAMPOS_DE_CLONAGEM,
  falaOIdioma,
  lerAudioDaVoz,
  montarPedidoDeVoz,
  type PedidoDeVoz,
  pernasDeVoz,
  vozDoModelo,
} from '../provedoresDeVoz'
import type { Provedor } from '../registroDeProvedores'
import { recusaContadorIndisponivel, recusaUsoJustoDoDia } from '../reservaDeNuvem'
import {
  codigoDeIdioma,
  nomeDoProvedor,
  type RastroDeIa,
  registrarLimiteDoProvedor,
  statusDaTentativa,
} from '../telemetriaDeIa'
import { type ContextoDeIa, recusaDeQuemPede } from './contexto'
import { decisor, type GanchosDoNucleo } from './ganchos'
import { recusaDeErro, type RecusaDeIa, recusaNuvemOcupada, recusaPortaoFechado, recusar } from './recusa'

/** O rótulo de log e de métrica é o da rota do app; a `/v1` terá o dela (change `api-e-mcp`). */
const ROTA = '/api/ai/tts'

const esquemaDoPedido = z
  .object({
    texto: z.string().trim().min(1).max(TETO_DE_CARACTERES_DA_VOZ),
    /** BCP-47 ou a base: `pt-BR`, `pt`, `en-US`. */
    idioma: z.string().regex(/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/),
    /** Uma voz PRONTA do modelo (nome do catálogo); fora da lista, a padrão dele. */
    voz: z
      .string()
      .regex(/^[A-Za-z_]{1,32}$/)
      .optional(),
    velocidade: z.number().min(VELOCIDADE_DA_VOZ.minima).max(VELOCIDADE_DA_VOZ.maxima).optional(),
  })
  .strict()

/** O pedido de voz validado — sai de `lerPedidoDeVoz`. `idioma` é o que veio (BCP-47 ou a base). */
export type PedidoDeSintese = z.infer<typeof esquemaDoPedido>

/** O pedido traz um campo de áudio de referência ou de voz criada (em qualquer nível)? */
function pedeClonagem(corpo: unknown): boolean {
  if (!corpo || typeof corpo !== 'object') return false
  return Object.entries(corpo as Record<string, unknown>).some(
    ([k, v]) => CAMPOS_DE_CLONAGEM.includes(k) || (typeof v === 'object' && pedeClonagem(v)),
  )
}

/**
 * Lê o corpo cru: o pedido validado (e o idioma no rastro), ou o 400 — a clonagem ANTES do esquema,
 * para o pedido de imitar uma voz ouvir o porquê, e não um "payload inválido".
 */
export function lerPedidoDeVoz(
  corpo: unknown,
  rastro?: RastroDeIa,
): { ok: true; pedido: PedidoDeSintese } | RecusaDeIa {
  if (pedeClonagem(corpo))
    return recusaDeErro(
      400,
      'a voz natural não imita vozes: o pedido não aceita áudio de referência nem voz criada',
      CODIGOS_DA_VOZ_NATURAL.clonagem,
    )
  const parsed = esquemaDoPedido.safeParse(corpo ?? {})
  if (!parsed.success)
    return recusaDeErro(400, 'payload inválido: texto (até 600 caracteres) e idioma obrigatórios', 'payload_invalido')
  rastro?.anotar({ parDeIdiomas: `tts-${codigoDeIdioma(parsed.data.idioma)}` })
  return { ok: true, pedido: parsed.data }
}

/** A voz entregue: os bytes, o tipo (da lista fechada de `audio/*`) e o modelo que falou. */
export interface VozEntregue {
  ok: true
  bytes: Buffer
  tipo: string
  modelo: string
  /** Veio do cache L1: não foi ao provedor nem gastou cota. */
  doCache: boolean
}

export type ResultadoDaVoz = VozEntregue | RecusaDeIa

/* ─────────────────────────── cache L1: em memória, curto, por bytes ─────────────────────────── */

/**
 * O CACHE DA VOZ. "Repetir" e a frase que volta ("obrigado", "pode repetir?") não pagam de novo. Só em
 * MEMÓRIA e CURTO, de propósito: o áudio é a fala de alguém lida em voz alta (revela a frase) — nada
 * vai a disco, nada guarda quem pediu, e a chave é o hash (provedor, modelo, idioma, voz, velocidade,
 * texto). O teto é em BYTES, não em entradas: um áudio longo ocupa o lugar de muitos curtos.
 */
export const TETO_DO_CACHE_DE_VOZ_BYTES = 8 * 1024 * 1024
export const TTL_DO_CACHE_DE_VOZ_MS = 10 * 60_000
/** Maior item que entra no cache (um áudio acima disto é raro e tomaria o espaço de dezenas). */
const MAIOR_ITEM_DO_CACHE = 1024 * 1024

interface VozGuardada {
  bytes: Buffer
  tipo: string
  modelo: string
  expira: number
}
const cacheDeVoz = new Map<string, VozGuardada>()
let bytesNoCache = 0

function chaveDaVoz(perna: Provedor, pedido: PedidoDeVoz): string {
  const partes = [
    perna.fornecedor ?? nomeDoProvedor(perna.base),
    perna.model,
    pedido.idioma,
    vozDoModelo(perna.model, pedido.voz) ?? '',
    String(pedido.velocidade ?? 1),
    pedido.texto,
  ]
  return createHash('sha256').update(JSON.stringify(partes)).digest('hex')
}

function lerDoCache(chave: string, agora = Date.now()): VozGuardada | null {
  const v = cacheDeVoz.get(chave)
  if (!v) return null
  cacheDeVoz.delete(chave)
  if (v.expira <= agora) {
    bytesNoCache -= v.bytes.length
    return null
  }
  cacheDeVoz.set(chave, v) // LRU: o acerto vai para o fim
  return v
}

function guardarNoCache(chave: string, v: Omit<VozGuardada, 'expira'>, agora = Date.now()): void {
  if (v.bytes.length > MAIOR_ITEM_DO_CACHE) return
  const antiga = cacheDeVoz.get(chave)
  if (antiga) {
    cacheDeVoz.delete(chave)
    bytesNoCache -= antiga.bytes.length
  }
  cacheDeVoz.set(chave, { ...v, expira: agora + TTL_DO_CACHE_DE_VOZ_MS })
  bytesNoCache += v.bytes.length
  for (const [k, velha] of cacheDeVoz) {
    if (bytesNoCache <= TETO_DO_CACHE_DE_VOZ_BYTES) break
    cacheDeVoz.delete(k)
    bytesNoCache -= velha.bytes.length
  }
}

/** Só para os testes. */
export function esvaziarCacheDeVoz(): void {
  cacheDeVoz.clear()
  bytesNoCache = 0
}

/* ─────────────────────────── o tipo do áudio ─────────────────────────── */

/** Os tipos de áudio que saem daqui; qualquer outro vira `audio/mpeg` (o formato que pedimos). */
const TIPOS_DE_AUDIO = new Set([
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/ogg',
  'audio/opus',
  'audio/flac',
  'audio/aac',
  'audio/webm',
])

/**
 * Os bytes do PROVEDOR saem como ÁUDIO e nunca como outra coisa: o tipo sai de uma lista fechada de
 * `audio/*` (o adaptador HTTP ainda manda `nosniff`, para o navegador não adivinhar HTML num corpo
 * forjado).
 */
const tipoDoAudio = (tipo: string): string => (TIPOS_DE_AUDIO.has(tipo) ? tipo : 'audio/mpeg')

/* ─────────────────────────── admissão da voz ─────────────────────────── */

interface AdmissaoDaVoz {
  plano: PlanoDeAdmissao
  perna: Provedor
  ticket: TicketDeBalde
  liberar: () => void
  chamada: boolean
}

/** Vaga em voo + o balde da primeira perna (na ordem do registro) com saldo — como o STT. */
function admitirVoz(
  pernas: Provedor[],
  p: { userId: string; plano: PlanoDeAdmissao },
): { ok: true; admissao: AdmissaoDaVoz } | { ok: false; recusa: Recusa } {
  const liberar = ocuparVaga(p.userId, 'tts')
  if (!liberar) {
    contarAdmissaoRecusada('em_voo', p.plano)
    return { ok: false, recusa: { motivo: 'em_voo', retryAfterS: 1 } }
  }
  let recusa: Recusa | null = null
  for (const perna of pernas) {
    const r = admitirNoBalde({ tipo: 'tts', ...alvoDaPerna(perna), plano: p.plano, silenciosa: true })
    if (r.ok === true)
      return { ok: true, admissao: { plano: p.plano, perna, ticket: r.ticket, liberar, chamada: false } }
    if (!recusa || r.recusa.retryAfterS < recusa.retryAfterS) recusa = r.recusa
  }
  liberar()
  const final = recusa ?? { motivo: 'minuto' as const, retryAfterS: 1 }
  contarAdmissaoRecusada(final.motivo, p.plano)
  return { ok: false, recusa: final }
}

/* ─────────────────────────── a síntese ─────────────────────────── */

export async function sintetizarVoz(
  ctx: ContextoDeIa,
  pedido: PedidoDeSintese,
  ganchos?: GanchosDoNucleo<ResultadoDaVoz>,
): Promise<ResultadoDaVoz> {
  const decidir = decisor(ganchos)
  return decidir(await sintetizar(ctx, pedido, decidir))
}

async function sintetizar(
  ctx: ContextoDeIa,
  lido: PedidoDeSintese,
  decidir: (r: ResultadoDaVoz) => ResultadoDaVoz,
): Promise<ResultadoDaVoz> {
  const quem = recusaDeQuemPede(ctx)
  if (quem) return decidir(quem)
  const { texto, voz, velocidade } = lido
  const { rastro } = ctx
  const plano = ctx.entitlements
  /* A base (`pt`) escolhe a perna e vai ao Chatterbox; o BCP-47 (`pt-BR`), ao Google. */
  const idioma = lido.idioma.split('-')[0].toLowerCase()
  const bcp47 = bcp47DaVoz(lido.idioma)

  /* 2) A CAPACIDADE. */
  if (plano.vozNatural !== true)
    return decidir(
      recusar(402, {
        error: 'a voz natural do intérprete é do Premium; a voz do aparelho segue lendo a tradução',
        code: CODIGOS_DA_VOZ_NATURAL.exige,
        entitlement: 'vozNatural',
      }),
    )

  /* 3) A FLAG de produto — sem quem a responda, desligada. */
  if (!(await ctx.flagLigada?.(FLAG_VOZ_NATURAL)))
    return decidir(
      recusaDeErro(
        503,
        'a voz natural está desligada agora; a voz do aparelho segue lendo',
        CODIGOS_DA_VOZ_NATURAL.desligada,
      ),
    )

  /* 4) A CONFIGURAÇÃO. */
  const todas = pernasDeVoz()
  if (todas.length === 0)
    return decidir(
      recusaDeErro(
        501,
        'voz natural não configurada no servidor (declare uma perna "tts" no IA_PROVEDORES, com a chave no ambiente)',
        CODIGOS_DA_VOZ_NATURAL.naoConfigurada,
      ),
    )
  const pernas = todas.filter((p) => falaOIdioma(p, idioma))
  if (pernas.length === 0)
    return decidir(
      recusaDeErro(
        422,
        'nenhuma voz natural fala este idioma; a voz do aparelho segue',
        CODIGOS_DA_VOZ_NATURAL.semIdioma,
      ),
    )
  const pedido: PedidoDeVoz = {
    texto,
    idioma,
    bcp47,
    ...(voz ? { voz } : {}),
    ...(velocidade !== undefined ? { velocidade } : {}),
  }

  /* 5) O CACHE, pela perna PLANEJADA (a primeira da cascata). */
  const chave = chaveDaVoz(pernas[0], pedido)
  const guardada = lerDoCache(chave)
  if (guardada) {
    rastro.anotar({ cacheHit: true })
    log('info', { event: 'tts_cache_hit', route: ROTA, status: 200, requestId: ctx.requestId })
    return decidir({
      ok: true,
      bytes: guardada.bytes,
      tipo: tipoDoAudio(guardada.tipo),
      modelo: guardada.modelo,
      doCache: true,
    })
  }

  /* 6) O PORTÃO. */
  const portao = await portaoDaNuvem()
  if (!portao.ok) return decidir(recusaPortaoFechado(portao))

  /* 7) A ADMISSÃO — o teste de 14 dias do Premium entra como grátis (C6). */
  const admitida = admitirVoz(pernas, {
    userId: ctx.userId,
    plano: planoDeAdmissao(plano.plan, ctx.modo === 'alivio', ctx.emTeste),
  })
  if (admitida.ok === false) return decidir(recusaNuvemOcupada(admitida.recusa))
  const adm = admitida.admissao
  let reservaDoDia: string | null = null
  let reservou = false
  let entregou = false
  const caracteres = texto.length
  try {
    /* 8) A COTA, depois da admissão (recusa da admissão não toca o contador) e antes do provedor. */
    try {
      const cota = await reservarCaracteresDeVoz(ctx.userId, caracteres)
      if (cota.cabe === false) {
        if (cota.recusa === 'dia') return decidir(await recusaUsoJustoDoDia(ctx.userId))
        return decidir(
          recusaDeErro(402, 'a voz natural deste mês acabou; a voz do aparelho segue lendo', 'quota_exceeded', {
            escopo: 'voz',
          }),
        )
      }
      reservou = true
      reservaDoDia = cota.dia
    } catch (err) {
      if (err instanceof ContadorIndisponivel) return decidir(recusaContadorIndisponivel())
      throw err
    }

    /* 9) A CASCATA. */
    const r = await percorrerPernasDaVoz(pernas, pedido, adm, rastro, ctx.requestId)
    if (r.ok === false) {
      if (r.falha === 'limitado')
        return decidir(recusaNuvemOcupada({ motivo: 'provedor_limitou', retryAfterS: r.retryAfterS }))
      if (r.falha === 'sem_saldo') return decidir(recusaNuvemOcupada(r.recusa))
      if (r.falha === 'disjuntor')
        return decidir(
          recusaDeErro(503, 'a voz natural está fora do ar agora; a voz do aparelho segue', 'provedor_em_disjuntor'),
        )
      return decidir(recusaDeErro(502, 'a voz natural não respondeu; a voz do aparelho segue', 'provedor_indisponivel'))
    }

    /* 10) O CUSTO da perna que respondeu. */
    const { perna, audio, inicio } = r
    const fornecedor = perna.fornecedor ?? nomeDoProvedor(perna.base)
    const custoUsd = custoDeTts(perna.model, caracteres, { fornecedor, preco: perna.preco })
    entregou = true
    await registrarGastoDeIa(custoUsd, { userId: ctx.userId, plano: plano.plan })
    await ctx.registrarCusto?.(custoUsd)
    observarChamadaDeProvedor({
      provedor: perna.rotulo,
      funcao: 'tts',
      ms: Date.now() - inicio,
      custoUsd,
      fornecedor,
      modelo: perna.model,
    })
    rastro.tentativa({
      inicio,
      fim: Date.now(),
      provedor: fornecedor,
      modelo: perna.model,
      status: 'ok',
      uso: { caracteres },
      custoUsd,
    })
    guardarNoCache(chave, { bytes: audio.bytes, tipo: audio.tipo, modelo: perna.model })
    log('info', {
      event: 'tts',
      route: ROTA,
      provider: perna.rotulo,
      status: 200,
      latencyMs: Date.now() - inicio,
      requestId: ctx.requestId,
    })
    return decidir({ ok: true, bytes: audio.bytes, tipo: tipoDoAudio(audio.tipo), modelo: perna.model, doCache: false })
  } catch (err) {
    return decidir(recusar(502, { error: `falha na voz natural: ${erroDeRota(err, { event: 'tts_erro' })}` }))
  } finally {
    if (!adm.chamada) adm.ticket.devolver()
    adm.liberar()
    /* Todo caminho que não entregou devolve os caracteres — a pessoa não paga pela voz que não ouviu. */
    if (reservou && !entregou) await estornarCaracteresDeVoz(ctx.userId, caracteres, reservaDoDia)
  }
}

type CascataDaVoz =
  | { ok: true; perna: Provedor; audio: { bytes: Buffer; tipo: string }; inicio: number }
  | { ok: false; falha: 'limitado'; retryAfterS: number }
  | { ok: false; falha: 'sem_saldo'; recusa: Recusa }
  | { ok: false; falha: 'disjuntor' | 'indisponivel' }

/**
 * As pernas NA ORDEM DO REGISTRO. A da admissão já tem o pedido no balde; as outras pedem ao balde
 * delas na hora. Sem retentativa: a fila do cliente espera pouco, e a voz do aparelho é a reserva.
 */
async function percorrerPernasDaVoz(
  pernas: Provedor[],
  pedido: PedidoDeVoz,
  adm: AdmissaoDaVoz,
  rastro: RastroDeIa,
  requestId?: string,
): Promise<CascataDaVoz> {
  let chamadas = 0
  let limitadas = 0
  let menorEspera = Infinity
  let semSaldo: Recusa | null = null
  let pulouPorDisjuntor = false
  for (const perna of pernas) {
    let ticket: TicketDeBalde | null = null
    if (perna !== adm.perna) {
      const r = admitirNoBalde({ tipo: 'tts', ...alvoDaPerna(perna), plano: adm.plano })
      if (r.ok === false) {
        if (!semSaldo || r.recusa.retryAfterS < semSaldo.retryAfterS) semSaldo = r.recusa
        continue
      }
      ticket = r.ticket
    }
    const disjuntor = chaveDoProvedor(perna)
    if (!disjuntorPermite(disjuntor)) {
      ticket?.devolver()
      pulouPorDisjuntor = true
      log('warn', { event: 'tts_provedor_em_disjuntor', route: ROTA, provider: perna.rotulo, requestId })
      continue
    }
    if (perna === adm.perna) adm.chamada = true
    chamadas += 1
    const provedor = nomeDoProvedor(perna.base)
    const inicio = Date.now()
    let resposta: globalThis.Response
    try {
      const { url, init } = montarPedidoDeVoz(perna, pedido)
      resposta = await fetch(url, init)
    } catch (erro) {
      registrarFalha(disjuntor, 0)
      rastro.tentativa({
        inicio,
        fim: Date.now(),
        provedor,
        modelo: perna.model,
        status: statusDaTentativa(0, String((erro as Error)?.name ?? '') + String((erro as Error)?.message ?? erro)),
      })
      log('warn', { event: 'tts_provedor_falhou', route: ROTA, provider: perna.rotulo, status: 0, requestId })
      continue
    }
    if (resposta.ok) {
      const audio = await lerAudioDaVoz(perna, resposta).catch(() => null)
      if (audio) {
        registrarSucesso(disjuntor)
        return { ok: true, perna, audio, inicio }
      }
      rastro.tentativa({ inicio, fim: Date.now(), provedor, modelo: perna.model, status: 'vazio' })
      log('warn', { event: 'tts_resposta_invalida', route: ROTA, provider: perna.rotulo, status: 200, requestId })
      continue
    }
    rastro.tentativa({
      inicio,
      fim: Date.now(),
      provedor,
      modelo: perna.model,
      status: statusDaTentativa(resposta.status),
      metadados: { statusHttp: resposta.status },
    })
    const corpo = await resposta.text().catch(() => '')
    if (resposta.status === 429) {
      registrarLimiteDoProvedor(provedor, perna.model)
      const espera = registrarLimiteNaAdmissao(
        'tts',
        provedor,
        perna.model,
        segundosDoRetryAfter(resposta.headers?.get?.('retry-after')),
        Date.now(),
        alvoDaPerna(perna),
      )
      limitadas += 1
      menorEspera = Math.min(menorEspera, espera)
      continue
    }
    if (resposta.status >= 500) registrarFalha(disjuntor, resposta.status)
    log('warn', {
      event: 'tts_provedor_falhou',
      route: ROTA,
      provider: perna.rotulo,
      status: resposta.status,
      error: corpo.slice(0, 120),
      requestId,
    })
  }
  if (chamadas === 0) {
    if (semSaldo && !pulouPorDisjuntor) return { ok: false, falha: 'sem_saldo', recusa: semSaldo }
    return { ok: false, falha: 'disjuntor' }
  }
  if (limitadas === chamadas) return { ok: false, falha: 'limitado', retryAfterS: menorEspera }
  return { ok: false, falha: 'indisponivel' }
}
