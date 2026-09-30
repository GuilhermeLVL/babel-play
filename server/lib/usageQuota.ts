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
 *
 * O USO JUSTO DO DIA (matriz v2, C4 da change `planos-v2`, ADR 0011): segundos de STT e tokens de LLM
 * têm, além do teto do MÊS, um teto por DIA LOCAL da pessoa (`sttSegundosDia`/`tokensDia` na
 * matriz). A reserva confere o mês e DEPOIS o dia; se o dia recusa, devolve o mês. A recusa diz QUAL
 * teto recusou (`recusa: 'mes' | 'dia'`), porque as respostas são outras: o mês é o 402
 * `quota_exceeded` de sempre; o dia é o 429 `uso_justo_do_dia`, que não vende nada.
 */
import { diaNoFuso } from '../../src/core/learning/economia'
import { definicaoDoPlano, FRANQUIA_DE_ALIVIO, type PlanoEfetivo } from '../../src/core/planos'
import { usageCountersRepo } from '../db/repositories/usageCounters'
import type { UserId } from './authContext'
import { memoDoRequest } from './contextoDeConvidado'
import { getPlanForUser } from './entitlements'
import { fusoGravado } from './fusoDoUsuario'
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
 * Os contadores do USO JUSTO DO DIA, na janela `AAAA-MM-DD` do dia local. Métricas PRÓPRIAS, e não
 * as do mês com outra janela: a poda (`usageCountersRepo.prune`) e quem lê o contador para
 * diagnóstico nunca misturam `AAAA-MM` com `AAAA-MM-DD` numa comparação de texto.
 */
export const METRIC_STT_SEGUNDOS_DIA = 'stt_seconds_dia'
export const METRIC_LLM_TOKENS_DIA = 'llm_tokens_dia'

/** Qual teto recusou: o do MÊS (402 `quota_exceeded`) ou o do DIA (429 `uso_justo_do_dia`). */
export type RecusaDaCota = 'mes' | 'dia'

/**
 * O resultado de uma reserva com o uso justo do dia. `dia` é a JANELA do dia em que a reserva caiu
 * (`null` = o plano não tem teto no dia, nada foi contado ali): o estorno e o acerto voltam para ELA,
 * mesmo que o provedor responda depois da meia-noite.
 */
export type ReservaDaCota = { cabe: true; dia: string | null } | { cabe: false; recusa: RecusaDaCota }

/**
 * A janela do DIA LOCAL da pessoa, `AAAA-MM-DD`: o fuso GRAVADO dela (o mesmo da ofensiva e das
 * missões, `fusoDoUsuario.ts`, que só muda uma vez a cada 24 h — trocar de fuso a cada pedido não
 * inventa um dia novo de nuvem), ou `America/Sao_Paulo` quando não há. Lido UMA vez por requisição.
 */
export async function fusoDaCota(userId: UserId): Promise<string> {
  return memoDoRequest(userId, 'fuso', () => fusoGravado(userId))
}

export async function janelaDoDia(userId: UserId): Promise<string> {
  return diaNoFuso(Date.now(), await fusoDaCota(userId))
}

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

/** Env de quota por plano: `PREMIUM_MONTHLY_MANAGED_CALLS`, `FREE_STORAGE_MB`… (geradas da matriz, `config.ts`). */
const envDoPlano = (plan: PlanoEfetivo, sufixo: string): string => `${plan.toUpperCase()}_${sufixo}`

/**
 * Teto mensal de CHAMADAS gerenciadas. O default vem da matriz (`src/core/planos.ts`: 50.000 no
 * Premium, ∞ no selfhost, 0 no free — que já é barrado antes, pelo entitlement), e
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
 * 144.000 s = 40 h no Premium — o empate de custo na pilha atual, até o B7 —, ∞ no selfhost, 0 no
 * free — barrado antes, pelo entitlement), e `<PLANO>_MONTHLY_STT_SECONDS` sobrepõe. Os segundos
 * contados são os REAIS da fala (`segundosDeAudioDoUsuario`): 40 h no plano são 40 h de áudio transcrito.
 *
 * POR QUE ESTE TETO EXISTE, ao lado do de chamadas. O de chamadas é fair-use; este é o de DINHEIRO.
 * A Groq cobra STT por hora de áudio, então o gasto de um usuário depende de quanto tempo ele fala,
 * não de quantas vezes. Sem um teto nesta unidade, alguém com a captura aberta 24 h/dia custa duas
 * ordens de grandeza mais que o assinante típico — e o contador de chamadas nem pisca.
 *
 * O CUSTO DO DONO é maior que o número da cota, e isso é deliberado: com falas de ~6 s o provedor
 * fatura ~10/6 dos segundos contados aqui (mínimo de 10 s por requisição); com o VAD de 800 ms a
 * bancada mediu 1,08× (`FATOR_FATURADO_DO_STT`), e é esse o número da conta da matriz. O teto
 * que protege a FATURA como um todo é o orçamento global (`orcamentoDeIa.ts`), que conta os
 * segundos faturados.
 */
export function capSegundosParaPlano(plan: PlanoEfetivo): number {
  return tetoComEnv(definicaoDoPlano(plan).quotas.sttSegundosMes, envDoPlano(plan, 'MONTHLY_STT_SECONDS'))
}

/** Teto DIÁRIO de segundos de STT (o uso justo). `<PLANO>_DAILY_STT_SECONDS` sobrepõe; ∞ = sem teto no dia. */
export function capSegundosDoDia(plan: PlanoEfetivo): number {
  return tetoComEnv(definicaoDoPlano(plan).quotas.sttSegundosDia, envDoPlano(plan, 'DAILY_STT_SECONDS'))
}

/** Teto DIÁRIO de tokens de LLM (o uso justo). `<PLANO>_DAILY_LLM_TOKENS` sobrepõe; ∞ = sem teto no dia. */
export function capTokensDoDia(plan: PlanoEfetivo): number {
  return tetoComEnv(definicaoDoPlano(plan).quotas.tokensDia, envDoPlano(plan, 'DAILY_LLM_TOKENS'))
}

/**
 * O MÊS, DEPOIS O DIA — a reserva de uma unidade de dinheiro (segundos ou tokens) nos dois tetos.
 *
 * A ORDEM É DE PROPÓSITO: o mês é o teto que já existia e o que mais recusa perto do fim do ciclo;
 * o dia só é tocado quando o mês coube. Se o DIA recusar, o mês reservado para a mesma fala é
 * DEVOLVIDO na hora — a fala não aconteceu, e ela não pode sair do mês de ninguém. Se o contador do
 * dia CAIR, o mês também é devolvido antes de a falha subir (fechada, como toda reserva).
 *
 * Plano sem teto no dia (`Infinity`: Grátis, self-host, convidado) nem lê o fuso: nada é contado ali.
 */
async function reservarNoMesENoDia(
  userId: UserId,
  metricaMes: string,
  capMes: number,
  metricaDia: string,
  capDia: number,
  quantidade: number,
): Promise<ReservaDaCota> {
  if (!(await usageCountersRepo.reserve(userId, metricaMes, currentWindow(), capMes, quantidade))) {
    return { cabe: false, recusa: 'mes' }
  }
  if (!Number.isFinite(capDia)) return { cabe: true, dia: null }
  const devolverOMes = () =>
    usageCountersRepo.refund(userId, metricaMes, currentWindow(), quantidade).catch((err: unknown) => {
      log('warn', { event: 'quota_mes_devolucao_falhou', error: String(err).slice(0, 120) })
    })
  let dia: string
  let cabeNoDia: boolean
  try {
    dia = await janelaDoDia(userId)
    cabeNoDia = await usageCountersRepo.reserve(userId, metricaDia, dia, capDia, quantidade)
  } catch (err) {
    await devolverOMes()
    throw err
  }
  if (!cabeNoDia) {
    await devolverOMes()
    return { cabe: false, recusa: 'dia' }
  }
  return { cabe: true, dia }
}

/**
 * RESERVA `segundos` de áudio ANTES de mandar ao provedor — mesma disciplina de
 * `reserveManagedCall`: decidir e contabilizar na MESMA instrução, senão o teto não vale sob
 * concorrência. No plano, o mês e depois o dia (`reservarNoMesENoDia`); no alívio, só a franquia
 * do mês dele (o alívio tem o pool do dia próprio, `nuvemDeAlivio.ts`).
 *
 * Falha FECHADA como as outras reservas: erro de infra lança `ContadorIndisponivel`.
 */
export async function reservarSegundosDeStt(
  userId: UserId,
  segundos: number,
  modo: ModoDaCota = 'plano',
): Promise<ReservaDaCota> {
  try {
    if (modo === 'alivio') {
      const cabe = await usageCountersRepo.reserve(
        userId,
        METRICA.segundos.alivio,
        currentWindow(),
        FRANQUIA_DE_ALIVIO.sttSegundosMes,
        segundos,
      )
      return cabe ? { cabe: true, dia: null } : { cabe: false, recusa: 'mes' }
    }
    const plano = await getPlanForUser(userId)
    return await reservarNoMesENoDia(
      userId,
      METRIC_STT_SEGUNDOS,
      capSegundosParaPlano(plano),
      METRIC_STT_SEGUNDOS_DIA,
      capSegundosDoDia(plano),
      segundos,
    )
  } catch (err) {
    falharFechado('quota_seconds_failed_closed', err)
  }
}

/**
 * Estorna segundos reservados que não viraram transcrição (o provedor recusou ou caiu) — do mês e,
 * quando a reserva caiu num dia (`dia` da `ReservaDaCota`), do dia também.
 */
export async function estornarSegundosDeStt(
  userId: UserId,
  segundos: number,
  modo: ModoDaCota = 'plano',
  dia: string | null = null,
): Promise<void> {
  try {
    await usageCountersRepo.refund(userId, METRICA.segundos[modo], currentWindow(), segundos)
    if (dia && modo === 'plano') await usageCountersRepo.refund(userId, METRIC_STT_SEGUNDOS_DIA, dia, segundos)
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
 * reservas: decidir e contabilizar na MESMA instrução. No plano, o mês e depois o dia; a recusa diz
 * qual. Falha de infra → `ContadorIndisponivel`.
 */
export async function reservarTokensDeLlm(
  userId: UserId,
  estimativa: number,
  modo: ModoDaCota = 'plano',
): Promise<ReservaDaCota> {
  const quantidade = Math.max(1, Math.round(estimativa))
  try {
    if (modo === 'alivio') {
      const cabe = await usageCountersRepo.reserve(
        userId,
        METRICA.tokens.alivio,
        currentWindow(),
        FRANQUIA_DE_ALIVIO.tokensMes,
        quantidade,
      )
      return cabe ? { cabe: true, dia: null } : { cabe: false, recusa: 'mes' }
    }
    const plano = await getPlanForUser(userId)
    return await reservarNoMesENoDia(
      userId,
      METRIC_LLM_TOKENS,
      capTokensParaPlano(plano),
      METRIC_LLM_TOKENS_DIA,
      capTokensDoDia(plano),
      quantidade,
    )
  } catch (err) {
    falharFechado('quota_tokens_failed_closed', err)
  }
}

/**
 * ACERTA a reserva pelo número REAL do provedor (`usage`): devolve o que sobrou ou, se o provedor
 * gastou mais do que a estimativa (raro — o `max_tokens` limita a saída), soma a diferença. Com
 * `reais = 0` é o estorno total de uma chamada que não aconteceu. O acerto vale para o mês e, quando
 * a reserva caiu num dia, para o MESMO dia. Best-effort: só loga.
 */
export async function acertarTokensDeLlm(
  userId: UserId,
  reservados: number,
  reais: number,
  modo: ModoDaCota = 'plano',
  dia: string | null = null,
): Promise<void> {
  const diferenca = Math.round(reservados) - Math.round(Number.isFinite(reais) ? Math.max(0, reais) : 0)
  if (diferenca === 0) return
  const janelas: Array<[string, string]> = [[METRICA.tokens[modo], currentWindow()]]
  if (dia && modo === 'plano') janelas.push([METRIC_LLM_TOKENS_DIA, dia])
  try {
    for (const [metrica, janela] of janelas) {
      if (diferenca > 0) await usageCountersRepo.refund(userId, metrica, janela, diferenca)
      else await usageCountersRepo.increment(userId, metrica, janela, -diferenca)
    }
  } catch (err) {
    log('warn', { event: 'llm_tokens_acerto_falhou', error: String(err).slice(0, 120) })
  }
}
