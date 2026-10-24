/**
 * A IA DE ESTUDO NO SERVIDOR (planos v4, etapa 2) — QUEM PODE explicar uma frase ou resumir uma sessão, e de que
 * franquia sai: a do PLANO (`explicacoesMes`/`resumosMes` em `src/core/planos.ts`) ou a AMOSTRA do Grátis
 * (`AMOSTRA_DE_IA`: 5 explicações por dia, 1 resumo por semana).
 *
 * A AMOSTRA É FRANQUIA PRÓPRIA, como a nuvem de alívio (`nuvemDeAlivio.ts`): contadores À PARTE em `usage_counters`,
 * e o `free` da matriz continua sem `managedCloudLlm` e com `tokensMes: 0` — nada aqui abre tutor, Nuance ou
 * polimento para o Grátis. Quem assina no meio do dia não começa o plano com a amostra descontada, e vice-versa. A
 * amostra só conta CHAMADAS; o teto de tokens por chamada é o `maxTokens` da função (`funcoesDeIa.ts`), e a chamada
 * passa pela admissão (faixa `gratis`) e pelo orçamento global como qualquer outra (`explicarFrase.ts`).
 *
 * RESERVA ANTES, ESTORNO SE NÃO ENTREGOU — a mesma disciplina das cotas: `reservarUsoDeEstudo` decide e conta na
 * MESMA instrução (`usageCountersRepo.reserve`); quem chama devolve com `estornarUsoDeEstudo` todo caminho que não
 * entregou uma explicação (ou um resumo) utilizável, inclusive a resposta malformada do modelo.
 *
 * FALHA FECHADA: contador que não responde lança `ContadorIndisponivel` (o núcleo responde 503); o estorno é
 * best-effort (só loga), como os outros — falhar nele erra a favor do dono.
 *
 * QUEM NÃO TEM: o convidado (sem conta, sem aferição de idade) e qualquer plano com a cota zerada que não seja o
 * Grátis recebem `sem_plano`. O self-host (`null` na matriz) não conta nada.
 */
import { AMOSTRA_DE_IA, definicaoDoPlano, type PlanoEfetivo } from '../../src/core/planos'
import { usageCountersRepo } from '../db/repositories/usageCounters'
import type { UserId } from './authContext'
import { log } from './logger'
import {
  ContadorIndisponivel,
  currentWindow,
  janelaDaSemana,
  janelaDoDia,
  METRIC_AMOSTRA_EXPLICACOES_DIA,
  METRIC_AMOSTRA_RESUMOS_SEMANA,
  METRIC_EXPLICACOES_MES,
  METRIC_RESUMOS_MES,
} from './usageQuota'

export {
  janelaDaSemana,
  METRIC_AMOSTRA_EXPLICACOES_DIA,
  METRIC_AMOSTRA_RESUMOS_SEMANA,
  METRIC_EXPLICACOES_MES,
  METRIC_RESUMOS_MES,
}

/** O que se pede à IA de estudo. */
export type TipoDeEstudo = 'explicacao' | 'resumo'

/** De que franquia saiu: o plano pago, ou a amostra do Grátis. */
export type OrigemDoEstudo = 'plano' | 'amostra'

/** Por que não: sem a capacidade (convidado), a amostra de hoje/da semana acabou, ou a cota do mês do plano. */
export type MotivoSemEstudo = 'sem_plano' | 'amostra_acabou' | 'cota_do_mes'

/**
 * A reserva feita: a origem, o que sobra na amostra (`null` no plano: a tela não mostra contagem a quem paga) e
 * ONDE ela foi contada (`metrica`/`janela`, `null` quando nada foi contado — o self-host), para o estorno voltar
 * para a mesma janela mesmo que o dia vire no meio do pedido.
 */
export interface ReservaDeEstudo {
  ok: true
  origem: OrigemDoEstudo
  restanteNaAmostra: number | null
  metrica: string | null
  janela: string | null
}

export type ResultadoDaReservaDeEstudo = ReservaDeEstudo | { ok: false; motivo: MotivoSemEstudo }

const QUOTA_DO_TIPO = { explicacao: 'explicacoesMes', resumo: 'resumosMes' } as const
const METRICA_DO_MES = { explicacao: METRIC_EXPLICACOES_MES, resumo: METRIC_RESUMOS_MES } as const

/** O teto e a janela da amostra para o tipo: explicações no dia local, resumos na semana desse dia. */
async function janelaDaAmostra(
  userId: UserId,
  tipo: TipoDeEstudo,
): Promise<{ metrica: string; janela: string; teto: number }> {
  const dia = await janelaDoDia(userId)
  return tipo === 'explicacao'
    ? { metrica: METRIC_AMOSTRA_EXPLICACOES_DIA, janela: dia, teto: AMOSTRA_DE_IA.explicacoesDia }
    : { metrica: METRIC_AMOSTRA_RESUMOS_SEMANA, janela: janelaDaSemana(dia), teto: AMOSTRA_DE_IA.resumosSemana }
}

/**
 * RESERVA uma explicação (ou um resumo) ANTES de chamar o provedor. `plano` é o plano EFETIVO já resolvido (o do
 * teste de 14 dias conta como o plano dele). Falha de infra → `ContadorIndisponivel`.
 */
export async function reservarUsoDeEstudo(
  userId: UserId,
  plano: PlanoEfetivo,
  tipo: TipoDeEstudo,
): Promise<ResultadoDaReservaDeEstudo> {
  try {
    if (plano === 'free') {
      const { metrica, janela, teto } = await janelaDaAmostra(userId, tipo)
      if (!(await usageCountersRepo.reserve(userId, metrica, janela, teto, 1)))
        return { ok: false, motivo: 'amostra_acabou' }
      /* Só exibição (a decisão já foi a do `reserve`): quantas sobram depois desta. */
      const usadas = await usageCountersRepo.get(userId, metrica, janela)
      return { ok: true, origem: 'amostra', restanteNaAmostra: Math.max(0, teto - usadas), metrica, janela }
    }
    const teto = definicaoDoPlano(plano).quotas[QUOTA_DO_TIPO[tipo]]
    if (teto === null) return { ok: true, origem: 'plano', restanteNaAmostra: null, metrica: null, janela: null }
    if (!(teto > 0)) return { ok: false, motivo: 'sem_plano' }
    const metrica = METRICA_DO_MES[tipo]
    const janela = currentWindow()
    if (!(await usageCountersRepo.reserve(userId, metrica, janela, teto, 1)))
      return { ok: false, motivo: 'cota_do_mes' }
    return { ok: true, origem: 'plano', restanteNaAmostra: null, metrica, janela }
  } catch (err) {
    log('error', { event: 'ia_de_estudo_contador_falhou', error: String((err as Error)?.message ?? err).slice(0, 120) })
    throw new ContadorIndisponivel(err)
  }
}

/** DEVOLVE a reserva que não virou explicação (ou resumo) utilizável. Best-effort: só loga. */
export async function estornarUsoDeEstudo(userId: UserId, reserva: ReservaDeEstudo): Promise<void> {
  if (!reserva.metrica || !reserva.janela) return
  try {
    await usageCountersRepo.refund(userId, reserva.metrica, reserva.janela, 1)
  } catch (err) {
    log('warn', { event: 'ia_de_estudo_estorno_falhou', error: String((err as Error)?.message ?? err).slice(0, 120) })
  }
}
