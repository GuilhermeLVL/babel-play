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
 *   3. PRIORIDADE POR PLANO, como LIMIAR sobre o saldo: o Pro alcança o bucket inteiro; o Essencial
 *      para quando sobra a reserva do Pro (20% por padrão); o convidado para na metade. Assim o
 *      pagante do plano de cima nunca encontra o bucket vazio por causa de quem paga menos.
 *   4. O 429 DO PROVEDOR ALIMENTA O BUCKET: zera o saldo e bloqueia até o `Retry-After` dele. O
 *      provedor sabe mais do que o nosso contador (outra réplica, outro app na mesma organização).
 *
 * Tudo é consultado ANTES de reservar a cota do usuário e ANTES de chamar o provedor. Recusa é 429
 * `nuvem_ocupada` com `Retry-After` em segundos.
 *
 * ESTADO POR PROCESSO, e isso tem limite declarado: com mais de uma réplica cada uma teria o seu
 * bucket e a soma passaria do limite da conta. O ADR 0007 registra a troca por estado compartilhado
 * junto com o gatilho do ADR 0006 — até lá a trava de boot mantém uma réplica só.
 */
import type { Response } from 'express'

import { contarAdmissaoRecusada, registrarLeitorDeSaldo } from '../http/metricas'
import { configDeAdmissao, type LimitesDeModelo } from '../lib/config'

export type TipoDeIa = 'stt' | 'llm'
export type PlanoDeAdmissao = 'pro' | 'essencial' | 'convidado'
export type MotivoDeRecusa = 'minuto' | 'dia' | 'tokens_dia' | 'provedor_limitou' | 'em_voo'

export interface Recusa {
  motivo: MotivoDeRecusa
  /** Segundos inteiros até valer a pena tentar de novo (>= 1). */
  retryAfterS: number
}

/**
 * O plano da assinatura vira uma das três faixas de prioridade. `selfhost` é Pro: a chave é do
 * próprio dono. Todo o resto (free hoje, anônimo/convidado amanhã) é `convidado` — o seguro.
 */
export function planoDeAdmissao(plan: string | undefined): PlanoDeAdmissao {
  if (plan === 'pro' || plan === 'selfhost') return 'pro'
  if (plan === 'essencial') return 'essencial'
  return 'convidado'
}

/** A fração do limite que o plano NÃO alcança. */
export function pisoDoPlano(plano: PlanoDeAdmissao, reservaPro: number): number {
  if (plano === 'pro') return 0
  if (plano === 'essencial') return reservaPro
  return Math.max(0.5, reservaPro)
}

interface Balde {
  tipo: TipoDeIa
  provedor: string
  modelo: string
  /** Pedidos disponíveis no minuto (fracionário: o reabastecimento é contínuo). */
  saldo: number
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

function limitesDe(tipo: TipoDeIa): LimitesDeModelo {
  const c = configDeAdmissao()
  return tipo === 'stt' ? c.stt : c.llm
}

/** O balde do par provedor + modelo, já reabastecido até `agora` e com o dia virado. */
function baldeDe(tipo: TipoDeIa, provedor: string, modelo: string, agora: number): Balde {
  const chave = `${tipo}·${provedor}·${modelo}`
  const lim = limitesDe(tipo)
  let b = baldes.get(chave)
  if (!b) {
    b = {
      tipo,
      provedor,
      modelo,
      saldo: lim.rpm,
      atualizadoEm: agora,
      dia: diaUtc(agora),
      pedidosHoje: 0,
      tokensHoje: 0,
      bloqueadoAte: 0,
    }
    baldes.set(chave, b)
    return b
  }
  if (lim.rpm > 0) {
    const decorrido = Math.max(0, agora - b.atualizadoEm)
    b.saldo = Math.min(lim.rpm, b.saldo + (decorrido * lim.rpm) / 60_000)
  }
  b.atualizadoEm = agora
  const hoje = diaUtc(agora)
  if (b.dia !== hoje) {
    b.dia = hoje
    b.pedidosHoje = 0
    b.tokensHoje = 0
  }
  return b
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
    const lim = limitesDe(this.balde.tipo)
    if (lim.rpm > 0) this.balde.saldo = Math.min(lim.rpm, this.balde.saldo + 1)
    this.balde.pedidosHoje = Math.max(0, this.balde.pedidosHoje - 1)
    this.balde.tokensHoje = Math.max(0, this.balde.tokensHoje - this.tokens)
    this.tokens = 0
  }

  /** O provedor respondeu: os tokens do dia passam da estimativa para o uso REAL. */
  acertarTokens(reais: number): void {
    if (this.devolvido || !Number.isFinite(reais) || reais < 0) return
    this.balde.tokensHoje = Math.max(0, this.balde.tokensHoje + reais - this.tokens)
    this.tokens = reais
  }
}

interface PedidoDeAdmissao {
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
  const lim = p.tipo === 'stt' ? cfg.stt : cfg.llm
  const piso = pisoDoPlano(p.plano, cfg.reservaPro)
  const tokens = Math.max(0, Math.round(p.tokens ?? 0))
  const b = baldeDe(p.tipo, p.provedor, p.modelo, agora)

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
  if (lim.rpd > 0 && b.pedidosHoje + 1 > lim.rpd * (1 - piso)) return recusar('dia', segundosAteVirarODia(agora))
  if (lim.tpd > 0 && tokens > 0 && b.tokensHoje + tokens > lim.tpd * (1 - piso)) {
    return recusar('tokens_dia', segundosAteVirarODia(agora))
  }

  if (lim.rpm > 0) b.saldo -= 1
  b.pedidosHoje += 1
  b.tokensHoje += tokens
  return { ok: true, ticket: new TicketDeBalde(b, tokens) }
}

/**
 * Ocupa uma vaga EM VOO do usuário. Devolve a função que a libera (idempotente), ou `null` quando
 * ele já está no teto — 1 STT, 2 LLM por padrão.
 */
export function ocuparVaga(userId: string, tipo: TipoDeIa): (() => void) | null {
  const cfg = configDeAdmissao()
  const teto = tipo === 'stt' ? cfg.emVooStt : cfg.emVooLlm
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
): number {
  const b = baldeDe(tipo, provedor, modelo, agora)
  const lim = limitesDe(tipo)
  const espera = retryAfterS ?? (lim.rpm > 0 ? Math.ceil(60 / lim.rpm) : 5)
  b.saldo = 0
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
    const atual = baldeDe(b.tipo, b.provedor, b.modelo, agora)
    return { provedor: atual.provedor, modelo: atual.modelo, saldo: Math.floor(atual.saldo * 100) / 100 }
  })
}

registrarLeitorDeSaldo(() => saldosDaAdmissao())

/** Só para os testes: esquece baldes e vagas. */
export function esquecerAdmissao(): void {
  baldes.clear()
  emVoo.clear()
}
