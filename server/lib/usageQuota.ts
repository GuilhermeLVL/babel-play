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
import { PLAN_MATRIX } from '../../src/core/planos'
import type { Plan } from '../db/repositories/subscriptions'
import { usageCountersRepo } from '../db/repositories/usageCounters'
import type { UserId } from './authContext'
import { getPlanForUser } from './entitlements'
import { log } from './logger'

export const METRIC_MANAGED = 'managed_calls'
/** Segundos de áudio FATURÁVEIS enviados ao STT de nuvem. A unidade em que o provedor cobra. */
export const METRIC_STT_SEGUNDOS = 'stt_seconds'
/** Tokens (entrada + saída) gastos no LLM gerenciado. Reservados ANTES, acertados DEPOIS. */
export const METRIC_LLM_TOKENS = 'llm_tokens'

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
function currentWindow(): string {
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
const envDoPlano = (plan: Plan, sufixo: string): string => `${plan.toUpperCase()}_${sufixo}`

/**
 * Teto mensal de CHAMADAS gerenciadas. selfhost ∞; pro do env; demais 0 (o free já é barrado antes,
 * pelo entitlement).
 *
 * O DEFAULT ERA 1.000, E ISSO ENTREGAVA ~50 MINUTOS DE CONVERSA POR MÊS. Três rotas dividem este
 * mesmo contador — STT (`sttProxy.ts`), tradução (`mtProxy.ts`) e tutor (`server.ts`) — e cada fala
 * ao microfone consome DUAS: uma para transcrever, outra para traduzir. Mil chamadas eram, na
 * prática, quinhentas falas: pouco demais para sustentar uma assinatura.
 *
 * 12.000 vem de orçamento explícito, não de gosto: ~6.000 falas ≈ 10 h de conversa, o perfil do
 * "usuário pesado" de `docs/auditoria/viabilidade-producao-v1.md`. Ao preço medido de US$ 0,107 por
 * mil falas traduzidas, esse teto custa ~US$ 0,64/mês.
 *
 * Este teto é de FAIR-USE, não de dinheiro: uma chamada pode ser de um segundo ou de vinte e cinco
 * megabytes. O teto de gasto real é o de segundos, em `capSegundosParaPlano`.
 */
export function capForPlan(plan: Plan): number {
  return tetoComEnv(PLAN_MATRIX[plan].quotas.chamadasMes, envDoPlano(plan, 'MONTHLY_MANAGED_CALLS'))
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
export async function reserveManagedCall(userId: UserId): Promise<boolean> {
  try {
    const cap = capForPlan(await getPlanForUser(userId))
    return await usageCountersRepo.reserve(userId, METRIC_MANAGED, currentWindow(), cap)
  } catch (err) {
    falharFechado('quota_reserve_failed_closed', err)
  }
}

/**
 * ESTORNA uma reserva que não virou chamada (o provedor recusou ou caiu). Sem isto, uma
 * indisponibilidade do provedor consumiria a quota do usuário sem entregar nada.
 * Erro só loga — o estorno é best-effort e não deve afetar a resposta.
 */
export async function refundManagedCall(userId: UserId): Promise<void> {
  try {
    await usageCountersRepo.refund(userId, METRIC_MANAGED, currentWindow())
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
 * Teto MENSAL DE SEGUNDOS de áudio no STT gerenciado. selfhost ∞; pro do env (default 36.000 s =
 * 10 horas); demais 0 (o free já é barrado antes, pelo entitlement).
 *
 * POR QUE ESTE TETO EXISTE, ao lado do de chamadas. O de chamadas é fair-use; este é o de DINHEIRO.
 * A Groq cobra STT por hora de áudio, então o gasto de um usuário depende de quanto tempo ele fala,
 * não de quantas vezes. Sem um teto nesta unidade, alguém com a captura aberta 24 h/dia custa duas
 * ordens de grandeza mais que o assinante típico — e o contador de chamadas nem pisca.
 *
 * 10 h/mês foi escolhido por medição, não por gosto: é o perfil do "usuário pesado" da conta em
 * docs/auditoria/eval-producao-v1.md, e a US$ 0,04/hora custa ~US$ 0,67/mês com o mínimo faturado.
 */
export function capSegundosParaPlano(plan: Plan): number {
  return tetoComEnv(PLAN_MATRIX[plan].quotas.sttSegundosMes, envDoPlano(plan, 'MONTHLY_STT_SECONDS'))
}

/**
 * RESERVA `segundos` de áudio ANTES de mandar ao provedor — mesma disciplina de
 * `reserveManagedCall`: decidir e contabilizar na MESMA instrução, senão o teto não vale sob
 * concorrência.
 *
 * Falha FECHADA como as outras reservas: erro de infra lança `ContadorIndisponivel`.
 */
export async function reservarSegundosDeStt(userId: UserId, segundos: number): Promise<boolean> {
  try {
    const cap = capSegundosParaPlano(await getPlanForUser(userId))
    return await usageCountersRepo.reserve(userId, METRIC_STT_SEGUNDOS, currentWindow(), cap, segundos)
  } catch (err) {
    falharFechado('quota_seconds_failed_closed', err)
  }
}

/** Estorna segundos reservados que não viraram transcrição (o provedor recusou ou caiu). */
export async function estornarSegundosDeStt(userId: UserId, segundos: number): Promise<void> {
  try {
    await usageCountersRepo.refund(userId, METRIC_STT_SEGUNDOS, currentWindow(), segundos)
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
export function capTokensParaPlano(plan: Plan): number {
  return tetoComEnv(PLAN_MATRIX[plan].quotas.tokensMes, envDoPlano(plan, 'MONTHLY_LLM_TOKENS'))
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
export async function reservarTokensDeLlm(userId: UserId, estimativa: number): Promise<boolean> {
  try {
    const cap = capTokensParaPlano(await getPlanForUser(userId))
    return await usageCountersRepo.reserve(
      userId,
      METRIC_LLM_TOKENS,
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
export async function acertarTokensDeLlm(userId: UserId, reservados: number, reais: number): Promise<void> {
  const diferenca = Math.round(reservados) - Math.round(Number.isFinite(reais) ? Math.max(0, reais) : 0)
  if (diferenca === 0) return
  try {
    if (diferenca > 0) await usageCountersRepo.refund(userId, METRIC_LLM_TOKENS, currentWindow(), diferenca)
    else await usageCountersRepo.increment(userId, METRIC_LLM_TOKENS, currentWindow(), -diferenca)
  } catch (err) {
    log('warn', { event: 'llm_tokens_acerto_falhou', error: String(err).slice(0, 120) })
  }
}
