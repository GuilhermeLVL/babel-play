/**
 * ADMISSÃO DE IA AO VIVO (ADR 0007) — quem entra na nuvem, e quando.
 *
 * O PROBLEMA MEDIDO (`openspec/audits/2026-09-25-prontidao/fase2-escala.md` §3 e §4.3). A conta do
 * provedor é UMA para o app inteiro: 20 STT por minuto e 1.000 pedidos de LLM por dia na camada
 * atual da Groq. A partir de ~67 cadastrados o limite por minuto quebra, e cada 429 virava TRÊS
 * pedidos por causa da retentativa do STT. A legenda ao vivo é tempo real: resposta que chega 10 s
 * depois não tem valor, então fila não serve — o certo é recusar RÁPIDO e o cliente cair no motor
 * local na hora.
 *
 * O QUE ESTE MÓDULO FAZ, em ordem de consulta:
 *
 *   1. VAGA EM VOO POR USUÁRIO — 1 STT e 2 LLM (tradução + tutor) ao mesmo tempo. Uma aba que
 *      dispara falas em paralelo não pode esvaziar o bucket de todo mundo sozinha.
 *   2. TOKEN BUCKET POR PROVEDOR E MODELO — capacidade = pedidos por minuto, reabastecido de forma
 *      contínua; ao lado, os tetos DIÁRIOS de pedidos e de tokens (UTC, como a Groq conta).
 *   3. PRIORIDADE POR PLANO, como LIMIAR sobre o saldo: o Premium (e o self-host) alcança o bucket
 *      inteiro; quem não paga — convidado, Grátis sem alívio e, no C6, o TESTE do Premium — para na
 *      metade (ou antes, se a reserva dos pagantes passar disso); a nuvem de alívio do Grátis (A10)
 *      só usa os 20% de cima — os 80% são de quem paga. Assim quem paga nunca encontra o bucket vazio
 *      por causa de quem não paga. (Matriz v2, ADR 0011: com um plano pago só, a faixa do meio que
 *      o Essencial ocupava deixou de existir.)
 *   4. O 429 DO PROVEDOR ALIMENTA O BUCKET: zera o saldo e bloqueia até o `Retry-After` dele. O
 *      provedor sabe mais do que o nosso contador (outra réplica, outro app na mesma organização).
 *   5. OS LIMITES SÃO OS DO REGISTRO (B4 da Fase B, 29/09/2026). As `IA_ADMISSAO_*` são os da camada
 *      da Groq, e valiam para QUALQUER provedor: com a DeepInfra (muito mais que 30 por minuto) o
 *      balde recusaria à toa; com uma conta nova do Workers AI, deixaria passar até o 429. Agora a
 *      perna leva os `limites` que o registro declara (`registroDeProvedores.ts`): os do MODELO valem
 *      para o balde dele; os do PROVEDOR (sem os do modelo) para UM balde de todos os modelos dele
 *      naquela função — o teto é da conta, e dois baldes cheios somariam o dobro; sem nenhum, as
 *      `IA_ADMISSAO_*` de sempre (o legado inteiro). Dimensão declarada ausente é SEM TETO nela: o
 *      operador escreveu o que sabe, e herdar o número da Groq seria inventar. O `tpm` (tokens por
 *      minuto), que a admissão não tinha, é um balde de tokens ao lado do de pedidos.
 *
 * Tudo é consultado ANTES de reservar a cota do usuário e ANTES de chamar o provedor. Recusa é 429
 * `nuvem_ocupada` com `Retry-After` em segundos.
 *
 * ESTADO POR PROCESSO, e isso tem limite declarado: com mais de uma réplica cada uma teria o seu
 * bucket e a soma passaria do limite da conta. O ADR 0007 registra a troca por estado compartilhado
 * junto com o gatilho do ADR 0006 — até lá a trava de boot mantém uma réplica só.
 */
import type { Response } from 'express'

import { normalizarPlano } from '../../src/core/planos'
import { contarAdmissaoRecusada, registrarLeitorDeSaldo } from '../http/metricas'
import { configDeAdmissao } from '../lib/config'
import type { LimitesDeclarados } from './registroDeProvedores'

/** `tts`: a voz natural do modo intérprete (E4 da Fase E) — balde e vaga em voo próprios, sem tokens. */
export type TipoDeIa = 'stt' | 'llm' | 'tts'
export type PlanoDeAdmissao = 'premium' | 'gratis' | 'alivio'
export type MotivoDeRecusa = 'minuto' | 'tokens_minuto' | 'dia' | 'tokens_dia' | 'provedor_limitou' | 'em_voo'

export interface Recusa {
  motivo: MotivoDeRecusa
  /** Segundos inteiros até valer a pena tentar de novo (>= 1). */
  retryAfterS: number
}

/**
 * A RESERVA DOS PAGANTES NA CAPACIDADE (A10): a nuvem de alívio do Grátis nunca alcança os 80% de
 * baixo do balde (pedidos por minuto, por dia e tokens por dia). O dinheiro tem a mesma reserva, no
 * pool do dia (`src/core/nuvemDeAlivio.ts`).
 */
export const PISO_DO_ALIVIO = 0.8

/**
 * O plano da assinatura vira uma das faixas de prioridade. `selfhost` é Premium: a chave é do próprio
 * dono. A requisição da nuvem de alívio (A10: conta Grátis, oferta aceita, franquia conferida na porta)
 * é `alivio`. O TESTE de 14 dias do Premium (C6) tem os entitlements do Premium mas entra como
 * `gratis`: ele ainda não paga, e a capacidade de quem paga não pode encolher por causa de uma
 * campanha de teste. Todo o resto (free sem alívio, anônimo/convidado) é `gratis` — o seguro.
 * O nome antigo (`pro`/`essencial`) é lido como Premium, como em toda fronteira.
 */
export function planoDeAdmissao(plan: string | undefined, alivio = false, teste = false): PlanoDeAdmissao {
  if (alivio) return 'alivio'
  if (teste) return 'gratis'
  const plano = normalizarPlano(plan)
  if (plano === 'premium' || plano === 'selfhost') return 'premium'
  return 'gratis'
}

/**
 * A fração do limite que o plano NÃO alcança. `reservaDosPagantes` é a fração do saldo que só quem
 * paga alcança (`IA_ADMISSAO_RESERVA_PRO`, 0,2 por padrão): ela só pesa quando passa do piso de
 * cada faixa gratuita (metade do balde; 80% no alívio).
 */
export function pisoDoPlano(plano: PlanoDeAdmissao, reservaDosPagantes: number): number {
  if (plano === 'premium') return 0
  if (plano === 'alivio') return Math.max(PISO_DO_ALIVIO, reservaDosPagantes)
  return Math.max(0.5, reservaDosPagantes)
}

/** Os limites efetivos de UM balde. `0` numa dimensão = sem teto nela. */
interface LimitesDoBalde {
  rpm: number
  tpm: number
  rpd: number
  tpd: number
}

/**
 * DE QUEM É O BALDE: provedor, modelo e, desde o B4, os limites que o registro declarou para a perna
 * e se eles são da CONTA no provedor (`compartilhado`: um balde só para todos os modelos dele).
 */
export interface AlvoDoBalde {
  limites?: LimitesDeclarados
  compartilhado?: boolean
}

interface Balde {
  tipo: TipoDeIa
  provedor: string
  modelo: string
  lim: LimitesDoBalde
  /** Os limites vieram do registro? Então quem pergunta sem eles (o gauge, um repique) não os troca pelos do env. */
  declarado: boolean
  /** Pedidos disponíveis no minuto (fracionário: o reabastecimento é contínuo). */
  saldo: number
  /** Tokens disponíveis no minuto (`tpm`); pode ficar negativo depois de um pedido maior que a estimativa. */
  saldoDeTokens: number
  atualizadoEm: number
  /** Dia UTC dos contadores diários. */
  dia: string
  pedidosHoje: number
  tokensHoje: number
  /** O provedor mandou parar até aqui (429 com `Retry-After`). */
  bloqueadoAte: number
}

const baldes = new Map<string, Balde>()
const emVoo = new Map<string, number>()

const diaUtc = (agora: number) => new Date(agora).toISOString().slice(0, 10)

/**
 * Os limites do balde: os DECLARADOS na perna, dimensão a dimensão (ausente = sem teto), ou, sem
 * declaração nenhuma, as `IA_ADMISSAO_*` — o comportamento de sempre, que é o do legado inteiro.
 */
function limitesDe(tipo: TipoDeIa, declarados?: LimitesDeclarados): LimitesDoBalde {
  if (declarados) {
    return {
      rpm: declarados.rpm ?? 0,
      tpm: tipo === 'llm' ? (declarados.tpm ?? 0) : 0,
      rpd: declarados.rpd ?? 0,
      tpd: tipo === 'llm' ? (declarados.tpd ?? 0) : 0,
    }
  }
  const c = configDeAdmissao()
  const l = tipo === 'stt' ? c.stt : tipo === 'tts' ? c.tts : c.llm
  return { rpm: l.rpm, tpm: 0, rpd: l.rpd, tpd: l.tpd }
}

/** A chave do balde: por modelo, ou `*` quando os limites são da conta no provedor. */
const chaveDoBalde = (tipo: TipoDeIa, provedor: string, modelo: string, alvo: AlvoDoBalde) =>
  `${tipo}·${provedor}·${alvo.compartilhado && alvo.limites ? '*' : modelo}`

/** O balde do par provedor + modelo, já reabastecido até `agora` e com o dia virado. */
function baldeDe(tipo: TipoDeIa, provedor: string, modelo: string, agora: number, alvo: AlvoDoBalde = {}): Balde {
  const chave = chaveDoBalde(tipo, provedor, modelo, alvo)
  const lim = limitesDe(tipo, alvo.limites)
  let b = baldes.get(chave)
  if (!b) {
    b = {
      tipo,
      provedor,
      modelo: alvo.compartilhado && alvo.limites ? '*' : modelo,
      lim,
      declarado: Boolean(alvo.limites),
      saldo: lim.rpm,
      saldoDeTokens: lim.tpm,
      atualizadoEm: agora,
      dia: diaUtc(agora),
      pedidosHoje: 0,
      tokensHoje: 0,
      bloqueadoAte: 0,
    }
    baldes.set(chave, b)
    return b
  }
  /* Os limites valem os de AGORA (o registro ou o env podem ter mudado) — menos quando quem pergunta
     não traz os declarados de um balde que os tem: aí os dele continuam. */
  if (alvo.limites || !b.declarado) {
    b.lim = lim
    b.declarado = Boolean(alvo.limites)
  }
  reabastecer(b, agora)
  return b
}

/** Reabastece o minuto até `agora` (contínuo, sem passar do teto) e vira o dia UTC. */
function reabastecer(b: Balde, agora: number): void {
  const { rpm, tpm } = b.lim
  const decorrido = Math.max(0, agora - b.atualizadoEm)
  if (rpm > 0) b.saldo = Math.min(rpm, b.saldo + (decorrido * rpm) / 60_000)
  if (tpm > 0) b.saldoDeTokens = Math.min(tpm, b.saldoDeTokens + (decorrido * tpm) / 60_000)
  b.atualizadoEm = agora
  const hoje = diaUtc(agora)
  if (b.dia !== hoje) {
    b.dia = hoje
    b.pedidosHoje = 0
    b.tokensHoje = 0
  }
}

/** Segundos até a meia-noite UTC — quando os tetos diários da Groq voltam. */
function segundosAteVirarODia(agora: number): number {
  const d = new Date(agora)
  const amanha = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1)
  return Math.max(1, Math.ceil((amanha - agora) / 1000))
}

/**
 * O pedido admitido no BALDE de um modelo. Quem admitiu é dono dele: se o provedor NÃO for chamado
 * (cota do usuário recusou, áudio ilegível), `devolver()` põe o pedido de volta — recusa nossa não
 * pode gastar o limite do provedor.
 */
export class TicketDeBalde {
  private devolvido = false
  constructor(
    private readonly balde: Balde,
    private tokens: number,
  ) {}

  devolver(): void {
    if (this.devolvido) return
    this.devolvido = true
    const lim = this.balde.lim
    if (lim.rpm > 0) this.balde.saldo = Math.min(lim.rpm, this.balde.saldo + 1)
    if (lim.tpm > 0) this.balde.saldoDeTokens = Math.min(lim.tpm, this.balde.saldoDeTokens + this.tokens)
    this.balde.pedidosHoje = Math.max(0, this.balde.pedidosHoje - 1)
    this.balde.tokensHoje = Math.max(0, this.balde.tokensHoje - this.tokens)
    this.tokens = 0
  }

  /** O provedor respondeu: os tokens do dia (e do minuto) passam da estimativa para o uso REAL. */
  acertarTokens(reais: number): void {
    if (this.devolvido || !Number.isFinite(reais) || reais < 0) return
    this.balde.tokensHoje = Math.max(0, this.balde.tokensHoje + reais - this.tokens)
    const lim = this.balde.lim
    if (lim.tpm > 0) this.balde.saldoDeTokens = Math.min(lim.tpm, this.balde.saldoDeTokens + this.tokens - reais)
    this.tokens = reais
  }
}

interface PedidoDeAdmissao extends AlvoDoBalde {
  tipo: TipoDeIa
  provedor: string
  modelo: string
  plano: PlanoDeAdmissao
  /** Tokens estimados (só LLM). */
  tokens?: number
  agora?: number
  /** Não conta a recusa na métrica — quem consulta várias pernas conta UMA vez no fim. */
  silenciosa?: boolean
}

/**
 * Consulta e CONSOME o balde. Não mexe na vaga em voo (quem precisa das duas usa `admitirChamada`):
 * a perna de reserva da cascata é admitida no balde DELA, na hora de ser chamada.
 */
export function admitirNoBalde(
  p: PedidoDeAdmissao,
): { ok: true; ticket: TicketDeBalde } | { ok: false; recusa: Recusa } {
  const agora = p.agora ?? Date.now()
  const cfg = configDeAdmissao()
  const piso = pisoDoPlano(p.plano, cfg.reservaDosPagantes)
  const tokens = Math.max(0, Math.round(p.tokens ?? 0))
  const b = baldeDe(p.tipo, p.provedor, p.modelo, agora, p)
  const lim = b.lim

  const recusar = (motivo: MotivoDeRecusa, retryAfterS: number) => {
    if (!p.silenciosa) contarAdmissaoRecusada(motivo, p.plano)
    return { ok: false as const, recusa: { motivo, retryAfterS: Math.max(1, Math.ceil(retryAfterS)) } }
  }

  if (agora < b.bloqueadoAte) return recusar('provedor_limitou', (b.bloqueadoAte - agora) / 1000)
  if (lim.rpm > 0) {
    /* O LIMIAR DO PLANO: sobra, depois deste pedido, pelo menos a parte que o plano não alcança. */
    const intocavel = lim.rpm * piso
    if (b.saldo - 1 < intocavel - 1e-9) {
      return recusar('minuto', ((intocavel + 1 - b.saldo) / lim.rpm) * 60)
    }
  }
  if (lim.tpm > 0 && tokens > 0) {
    /* O MESMO LIMIAR, em tokens por minuto. Um pedido maior que a parte do plano conta como a parte
       inteira — senão ele nunca passaria, nem com o balde cheio; o excesso fica devendo (saldo
       negativo) e segura os próximos até reabastecer. */
    const intocavel = lim.tpm * piso
    const precisa = Math.min(tokens, lim.tpm - intocavel)
    if (b.saldoDeTokens - precisa < intocavel - 1e-9) {
      return recusar('tokens_minuto', ((intocavel + precisa - b.saldoDeTokens) / lim.tpm) * 60)
    }
  }
  if (lim.rpd > 0 && b.pedidosHoje + 1 > lim.rpd * (1 - piso)) return recusar('dia', segundosAteVirarODia(agora))
  if (lim.tpd > 0 && tokens > 0 && b.tokensHoje + tokens > lim.tpd * (1 - piso)) {
    return recusar('tokens_dia', segundosAteVirarODia(agora))
  }

  if (lim.rpm > 0) b.saldo -= 1
  if (lim.tpm > 0) b.saldoDeTokens -= tokens
  b.pedidosHoje += 1
  b.tokensHoje += tokens
  return { ok: true, ticket: new TicketDeBalde(b, tokens) }
}

/**
 * QUANTO SOBRA NO BALDE, de 0 a 1 — a "demanda" da política de custo (`politicaDeCusto.ts`, B4): a
 * menor das dimensões com teto (pedidos e tokens do minuto, pedidos e tokens do dia). Fechado pelo
 * 429 do provedor, zero; sem teto nenhum, 1. Só LÊ: não consome nem conta recusa.
 */
export function fracaoDoBalde(
  p: AlvoDoBalde & { tipo: TipoDeIa; provedor: string; modelo: string; agora?: number },
): number {
  const agora = p.agora ?? Date.now()
  const b = baldeDe(p.tipo, p.provedor, p.modelo, agora, p)
  if (agora < b.bloqueadoAte) return 0
  const { rpm, tpm, rpd, tpd } = b.lim
  const fracoes = [
    rpm > 0 ? b.saldo / rpm : 1,
    tpm > 0 ? b.saldoDeTokens / tpm : 1,
    rpd > 0 ? 1 - b.pedidosHoje / rpd : 1,
    tpd > 0 ? 1 - b.tokensHoje / tpd : 1,
  ]
  return Math.max(0, Math.min(1, ...fracoes))
}

/**
 * Ocupa uma vaga EM VOO do usuário. Devolve a função que a libera (idempotente), ou `null` quando
 * ele já está no teto — 1 STT, 2 LLM e 1 voz natural por padrão.
 */
export function ocuparVaga(userId: string, tipo: TipoDeIa): (() => void) | null {
  const cfg = configDeAdmissao()
  const teto = tipo === 'stt' ? cfg.emVooStt : tipo === 'tts' ? cfg.emVooTts : cfg.emVooLlm
  const chave = `${tipo}:${userId}`
  const atuais = emVoo.get(chave) ?? 0
  if (atuais >= teto) return null
  emVoo.set(chave, atuais + 1)
  let liberada = false
  return () => {
    if (liberada) return
    liberada = true
    const n = (emVoo.get(chave) ?? 1) - 1
    if (n <= 0) emVoo.delete(chave)
    else emVoo.set(chave, n)
  }
}

/** Uma chamada admitida: a vaga do usuário e o pedido no balde do modelo. */
export interface ChamadaAdmitida {
  ticket: TicketDeBalde
  /** Solta a vaga em voo. Idempotente; chame no `finally`. */
  liberar: () => void
}

/** Vaga em voo + balde, nesta ordem (a vaga é a checagem mais barata e não gasta limite de ninguém). */
export function admitirChamada(
  p: PedidoDeAdmissao & { userId: string },
): { ok: true; chamada: ChamadaAdmitida } | { ok: false; recusa: Recusa } {
  const liberar = ocuparVaga(p.userId, p.tipo)
  if (!liberar) {
    contarAdmissaoRecusada('em_voo', p.plano)
    return { ok: false, recusa: { motivo: 'em_voo', retryAfterS: 1 } }
  }
  const r = admitirNoBalde(p)
  if (r.ok === false) {
    liberar()
    return r
  }
  return { ok: true, chamada: { ticket: r.ticket, liberar } }
}

/**
 * `Retry-After` do provedor em segundos: número ou data HTTP. Ausente ou ilegível → `undefined`.
 */
export function segundosDoRetryAfter(valor: string | null | undefined, agora = Date.now()): number | undefined {
  const t = valor?.trim()
  if (!t) return undefined
  if (/^\d+(\.\d+)?$/.test(t)) return Math.max(1, Math.ceil(Number(t)))
  const data = Date.parse(t)
  if (Number.isFinite(data)) return Math.max(1, Math.ceil((data - agora) / 1000))
  return undefined
}

/**
 * O PROVEDOR RESPONDEU 429: o saldo vai a zero e o balde fica fechado até o `Retry-After` dele.
 * Sem o cabeçalho, fecha pelo tempo de reabastecer UM pedido — o mínimo que faz sentido esperar.
 */
export function registrarLimiteNaAdmissao(
  tipo: TipoDeIa,
  provedor: string,
  modelo: string,
  retryAfterS?: number,
  agora = Date.now(),
  alvo: AlvoDoBalde = {},
): number {
  const b = baldeDe(tipo, provedor, modelo, agora, alvo)
  const lim = b.lim
  const espera = retryAfterS ?? (lim.rpm > 0 ? Math.ceil(60 / lim.rpm) : 5)
  b.saldo = 0
  if (lim.tpm > 0) b.saldoDeTokens = Math.min(b.saldoDeTokens, 0)
  b.bloqueadoAte = Math.max(b.bloqueadoAte, agora + espera * 1000)
  return Math.max(1, espera)
}

/**
 * A resposta da recusa. `Retry-After` no cabeçalho (é o que o cliente e qualquer proxy entendem) e
 * no corpo, com o motivo para o painel e para o log do cliente. O texto é para gente: o app NÃO
 * quebra, ele usa o motor local.
 */
export function responderNuvemOcupada(res: Response, recusa: Recusa): void {
  if (typeof res.setHeader === 'function') res.setHeader('Retry-After', String(recusa.retryAfterS))
  res.status(429).json({
    error: 'A nuvem está cheia agora; o app segue com o motor local e volta à nuvem sozinho.',
    code: 'nuvem_ocupada',
    detalhes: { motivo: recusa.motivo, retryAfter: recusa.retryAfterS },
  })
}

/** O saldo atual de cada balde (reabastecido até agora) — para o gauge de `/metrics`. */
export function saldosDaAdmissao(agora = Date.now()): Array<{ provedor: string; modelo: string; saldo: number }> {
  return [...baldes.values()].map((b) => {
    reabastecer(b, agora)
    return { provedor: b.provedor, modelo: b.modelo, saldo: Math.floor(b.saldo * 100) / 100 }
  })
}

registrarLeitorDeSaldo(() => saldosDaAdmissao())

/** Só para os testes: esquece baldes e vagas. */
export function esquecerAdmissao(): void {
  baldes.clear()
  emVoo.clear()
}
