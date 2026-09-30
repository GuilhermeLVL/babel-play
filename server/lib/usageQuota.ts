/**
 * COTA da IA gerenciada — chamadas, segundos de áudio e tokens por plano e por mês. Só a chave do
 * DONO conta; BYOK e local nem chegam aqui.
 *
 * FALHA FECHADA (Fase 2 do lançamento — OWASP LLM10). Até aqui a cota degradava ABERTA: erro ao
 * resolver plano ou contador → libera, "nunca bloquear pagante por falha de contador". O efeito
 * colateral era que uma falha do banco desligava TODOS os tetos de uma vez, e o gasto com a chave do
 * dono ficava sem forma exatamente quando ninguém estava olhando. Agora a falha lança
 * `ContadorIndisponivel`; a rota responde 503 com o motivo e o cliente cai nos modelos locais. O
 * assinante perde qualidade por alguns minutos; o dono não perde dinheiro.
 *
 * O ESTORNO continua best-effort (só loga): ele devolve cota ao usuário, e falhar nele erra a favor
 * do dono, não contra.
 */
import { definicaoDoPlano, FRANQUIA_DE_ALIVIO, type PlanoEfetivo } from '../../src/core/planos'
import { usageCountersRepo } from '../db/repositories/usageCounters'
import type { UserId } from './authContext'
import { getPlanForUser } from './entitlements'
import { log } from './logger'

export const METRIC_MANAGED = 'managed_calls'
/**
 * Segundos de áudio REAIS enviados ao STT de nuvem — a unidade em que o plano promete horas. NÃO é o
 * que o provedor fatura (esse tem mínimo de 10 s por requisição e vai para o orçamento global); ver
 * `server/lib/duracaoDeAudio.ts`.
 */
export const METRIC_STT_SEGUNDOS = 'stt_seconds'
/** Tokens (entrada + saída) gastos no LLM gerenciado. Reservados ANTES, acertados DEPOIS. */
export const METRIC_LLM_TOKENS = 'llm_tokens'

/**
 * DE QUE FRANQUIA sai a chamada: a do PLANO (o de sempre) ou a da NUVEM DE ALÍVIO do Grátis (A10,
 * `server/lib/nuvemDeAlivio.ts`). O alívio tem CONTADORES PRÓPRIOS de propósito: quem assina no meio
 * do mês não começa o plano com os segundos do alívio já descontados, e quem volta ao Grátis depois
 * de um plano pago não chega ao alívio com o contador do plano estourado. A porta da nuvem decide o
 * modo UMA vez por requisição; daqui para baixo ninguém pergunta o plano de novo.
 */
export type ModoDaCota = 'plano' | 'alivio'

/** Os contadores do alívio, em `usage_counters`, na mesma janela mensal dos do plano. */
export const METRIC_ALIVIO_CHAMADAS = 'alivio_calls'
export const METRIC_ALIVIO_STT_SEGUNDOS = 'alivio_stt_seconds'
export const METRIC_ALIVIO_TOKENS = 'alivio_llm_tokens'

const METRICA = {
  chamadas: { plano: METRIC_MANAGED, alivio: METRIC_ALIVIO_CHAMADAS },
  segundos: { plano: METRIC_STT_SEGUNDOS, alivio: METRIC_ALIVIO_STT_SEGUNDOS },
  tokens: { plano: METRIC_LLM_TOKENS, alivio: METRIC_ALIVIO_TOKENS },
} as const

/**
 * O contador de uso não respondeu. Quem chama devolve 503 com `code: 'contador_indisponivel'` — nunca
 * segue para o provedor, porque seguir seria gastar sem teto.
 */
export class ContadorIndisponivel extends Error {
  readonly code = 'contador_indisponivel'
  constructor(causa: unknown) {
    super(`contador de uso indisponível: ${String((causa as Error)?.message ?? causa).slice(0, 120)}`)
    this.name = 'ContadorIndisponivel'
  }
}

/** Loga e lança — a forma única de uma reserva falhar fechada. */
function falharFechado(evento: string, err: unknown): never {
  log('error', { event: evento, error: String((err as Error)?.message || err).slice(0, 120) })
  throw new ContadorIndisponivel(err)
}

/** Janela mensal 'YYYY-MM' (Date é permitido — módulo Node normal). */
export function currentWindow(): string {
  return new Date().toISOString().slice(0, 7)
}

/**
 * Override numérico por env, com o default vindo da MATRIZ. `null` na matriz = sem teto
 * (Infinity). A semântica antiga não muda: env definida e válida vence o default.
 */
function tetoComEnv(padrao: number | null, envNome: string): number {
  const n = Number(process.env[envNome])
  if (Number.isFinite(n) && n > 0) return n
  return padrao === null ? Infinity : padrao
}

/** Env de quota por plano: `PRO_MONTHLY_MANAGED_CALLS`, `ESSENCIAL_MONTHLY_MANAGED_CALLS`… */
const envDoPlano = (plan: PlanoEfetivo, sufixo: string): string => `${plan.toUpperCase()}_${sufixo}`

/**
 * Teto mensal de CHAMADAS gerenciadas. O default vem da matriz (`src/core/planos.ts`: 20.000 no
 * Essencial, 26.000 no Pro, ∞ no selfhost, 0 no free — que já é barrado antes, pelo entitlement), e
 * `<PLANO>_MONTHLY_MANAGED_CALLS` sobrepõe.
 *
 * O DEFAULT ERA 1.000, E ISSO ENTREGAVA ~50 MINUTOS DE CONVERSA POR MÊS. Três rotas dividem este
 * mesmo contador — STT (`sttProxy.ts`), tradução (`mtProxy.ts`) e tutor (`server.ts`) — e cada fala
 * ao microfone consome DUAS: uma para transcrever, outra para traduzir. Mil chamadas eram, na
 * prática, quinhentas falas: pouco demais para sustentar uma assinatura.
 *
 * Os números atuais vêm da conta de custo por plano em `src/core/planos.ts` (Fase 2 do lançamento):
 * as horas do plano divididas por falas de ~6 s, vezes duas chamadas por fala, com folga para o tutor.
 *
 * Este teto é de FAIR-USE, não de dinheiro: uma chamada pode ser de um segundo ou de vinte e cinco
 * megabytes. O teto de gasto real é o de segundos, em `capSegundosParaPlano`.
 */
export function capForPlan(plan: PlanoEfetivo): number {
  return tetoComEnv(definicaoDoPlano(plan).quotas.chamadasMes, envDoPlano(plan, 'MONTHLY_MANAGED_CALLS'))
}

/**
 * RESERVA uma chamada gerenciada — chame ANTES de falar com o provedor.
 *
 * Substitui o par `isWithinQuota()` + `recordManagedCall()`, que era um read-modify-write:
 * entre ler o contador e gravá-lo havia um `await fetch` ao provedor (dezenas a milhares de
 * ms), então N requisições simultâneas liam `used = 0` e TODAS passavam. Medido na auditoria:
 * 20 chamadas aceitas contra um teto de 5, todas cobradas (docs/audit/03-findings.md P0-1).
 *
 * Decidir e contabilizar agora são a MESMA instrução (`usageCountersRepo.reserve`), então o
 * teto vale sob concorrência. Se a chamada ao provedor falhar depois, use `refundManagedCall`.
 *
 * Erro → LANÇA `ContadorIndisponivel` (falha fechada; ver o topo do arquivo).
 */
export async function reserveManagedCall(userId: UserId, modo: ModoDaCota = 'plano'): Promise<boolean> {
  try {
    const cap = modo === 'alivio' ? FRANQUIA_DE_ALIVIO.chamadasMes : capForPlan(await getPlanForUser(userId))
    return await usageCountersRepo.reserve(userId, METRICA.chamadas[modo], currentWindow(), cap)
  } catch (err) {
    falharFechado('quota_reserve_failed_closed', err)
  }
}

/**
 * ESTORNA uma reserva que não virou chamada (o provedor recusou ou caiu). Sem isto, uma
 * indisponibilidade do provedor consumiria a quota do usuário sem entregar nada.
 * Erro só loga — o estorno é best-effort e não deve afetar a resposta.
 */
export async function refundManagedCall(userId: UserId, modo: ModoDaCota = 'plano'): Promise<void> {
  try {
    await usageCountersRepo.refund(userId, METRICA.chamadas[modo], currentWindow())
  } catch (err) {
    /*
     * F5-04: era `console.warn`, ou seja, texto solto que ninguém agrega. E este evento é de
     * DINHEIRO: estorno que falha deixa uma reserva consumida sem a chamada correspondente, e o
     * usuário paga por algo que não aconteceu. Pelo logger ele vira linha JSON com allowlist e
     * chega a qualquer sink externo registrado.
     */
    log('warn', { event: 'quota_refund_failed', error: String(err).slice(0, 120) })
  }
}

/**
 * Teto MENSAL DE SEGUNDOS de áudio no STT gerenciado. O default vem da matriz (`src/core/planos.ts`:
 * 54.000 s = 15 h no Essencial, 72.000 s = 20 h no Pro, ∞ no selfhost, 0 no free — barrado antes,
 * pelo entitlement), e `<PLANO>_MONTHLY_STT_SECONDS` sobrepõe. Os segundos contados são os REAIS da
 * fala (`segundosDeAudioDoUsuario`): 15 h no plano são 15 h de áudio transcrito.
 *
 * POR QUE ESTE TETO EXISTE, ao lado do de chamadas. O de chamadas é fair-use; este é o de DINHEIRO.
 * A Groq cobra STT por hora de áudio, então o gasto de um usuário depende de quanto tempo ele fala,
 * não de quantas vezes. Sem um teto nesta unidade, alguém com a captura aberta 24 h/dia custa duas
 * ordens de grandeza mais que o assinante típico — e o contador de chamadas nem pisca.
 *
 * O CUSTO DO DONO é maior que o número da cota, e isso é deliberado: com falas de ~6 s o provedor
 * fatura ~10/6 dos segundos contados aqui (mínimo de 10 s por requisição). No pior caso as 15 h do
 * Essencial custam ~25 h faturadas (~US$ 1,00/mês a US$ 0,04/h) — dentro da margem do plano. O teto
 * que protege a FATURA como um todo é o orçamento global (`orcamentoDeIa.ts`), que conta os
 * segundos faturados.
 */
export function capSegundosParaPlano(plan: PlanoEfetivo): number {
  return tetoComEnv(definicaoDoPlano(plan).quotas.sttSegundosMes, envDoPlano(plan, 'MONTHLY_STT_SECONDS'))
}

/**
 * RESERVA `segundos` de áudio ANTES de mandar ao provedor — mesma disciplina de
 * `reserveManagedCall`: decidir e contabilizar na MESMA instrução, senão o teto não vale sob
 * concorrência.
 *
 * Falha FECHADA como as outras reservas: erro de infra lança `ContadorIndisponivel`.
 */
export async function reservarSegundosDeStt(
  userId: UserId,
  segundos: number,
  modo: ModoDaCota = 'plano',
): Promise<boolean> {
  try {
    const cap =
      modo === 'alivio' ? FRANQUIA_DE_ALIVIO.sttSegundosMes : capSegundosParaPlano(await getPlanForUser(userId))
    return await usageCountersRepo.reserve(userId, METRICA.segundos[modo], currentWindow(), cap, segundos)
  } catch (err) {
    falharFechado('quota_seconds_failed_closed', err)
  }
}

/** Estorna segundos reservados que não viraram transcrição (o provedor recusou ou caiu). */
export async function estornarSegundosDeStt(
  userId: UserId,
  segundos: number,
  modo: ModoDaCota = 'plano',
): Promise<void> {
  try {
    await usageCountersRepo.refund(userId, METRICA.segundos[modo], currentWindow(), segundos)
  } catch (err) {
    log('warn', { event: 'quota_seconds_refund_failed', error: String(err).slice(0, 120) })
  }
}

/**
 * Teto MENSAL DE TOKENS (entrada + saída) no LLM gerenciado. Até a Fase 2 do lançamento os tokens só
 * eram CONTADOS — e o teto de custo do LLM era o de chamadas, que não vê o tamanho de cada uma. Uma
 * chamada de tutor com 10 mil caracteres de material custa dez vezes uma legenda.
 *
 * Os números e a conta de custo por plano estão em `src/core/planos.ts`.
 */
export function capTokensParaPlano(plan: PlanoEfetivo): number {
  return tetoComEnv(definicaoDoPlano(plan).quotas.tokensMes, envDoPlano(plan, 'MONTHLY_LLM_TOKENS'))
}

/**
 * Estimativa CONSERVADORA de tokens de uma chamada, antes de ela acontecer: metade dos caracteres do
 * prompt inteiro (alfabeto latino fica perto de 1 token a cada 4 caracteres; CJK chega a 1 por
 * caractere — a metade cobre o meio-termo) mais o `max_tokens` inteiro, que é o pior caso da saída.
 * Superestimar só segura cota por alguns segundos: o acerto devolve a diferença.
 */
export function estimarTokens(caracteresDoPrompt: number, maxTokens: number): number {
  return Math.ceil(Math.max(0, caracteresDoPrompt) / 2) + Math.max(0, maxTokens)
}

/**
 * RESERVA a estimativa de tokens ANTES de chamar o provedor — a mesma disciplina das outras
 * reservas: decidir e contabilizar na MESMA instrução. `false` = não cabe no teto do mês.
 * Falha de infra → `ContadorIndisponivel`.
 */
export async function reservarTokensDeLlm(
  userId: UserId,
  estimativa: number,
  modo: ModoDaCota = 'plano',
): Promise<boolean> {
  try {
    const cap = modo === 'alivio' ? FRANQUIA_DE_ALIVIO.tokensMes : capTokensParaPlano(await getPlanForUser(userId))
    return await usageCountersRepo.reserve(
      userId,
      METRICA.tokens[modo],
      currentWindow(),
      cap,
      Math.max(1, Math.round(estimativa)),
    )
  } catch (err) {
    falharFechado('quota_tokens_failed_closed', err)
  }
}

/**
 * ACERTA a reserva pelo número REAL do provedor (`usage`): devolve o que sobrou ou, se o provedor
 * gastou mais do que a estimativa (raro — o `max_tokens` limita a saída), soma a diferença. Com
 * `reais = 0` é o estorno total de uma chamada que não aconteceu. Best-effort: só loga.
 */
export async function acertarTokensDeLlm(
  userId: UserId,
  reservados: number,
  reais: number,
  modo: ModoDaCota = 'plano',
): Promise<void> {
  const diferenca = Math.round(reservados) - Math.round(Number.isFinite(reais) ? Math.max(0, reais) : 0)
  if (diferenca === 0) return
  const metrica = METRICA.tokens[modo]
  try {
    if (diferenca > 0) await usageCountersRepo.refund(userId, metrica, currentWindow(), diferenca)
    else await usageCountersRepo.increment(userId, metrica, currentWindow(), -diferenca)
  } catch (err) {
    log('warn', { event: 'llm_tokens_acerto_falhou', error: String(err).slice(0, 120) })
  }
}
