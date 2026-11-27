/**
 * AS COTAS DO "AJUSTAR NÍVEL" (openspec `leitura-assistida`, fatia D): `ajustesDeNivelMes` (palavra, trecho, parágrafo e as
 * ações de 1 toque) e `ajustesDeCapituloMes` (capítulo inteiro) de `src/core/planos.ts`, com contadores PRÓPRIOS em
 * `usage_counters`, no molde de `reservarEscrita` (`iaDeEstudo.ts`).
 *
 * SEM AMOSTRA: o Grátis, o convidado e o teste de 3 dias recebem `sem_plano` (o plano diz 0). Só os pagos têm a ferramenta.
 *
 * O CAPÍTULO é UMA cota por capítulo, não por parágrafo: o cliente marca o primeiro parágrafo com `inicioDeCapitulo` e só ele
 * gasta `ajustesDeCapituloMes`. Os parágrafos seguintes não gastam a cota do capítulo, mas passam por um teto à parte
 * (`PARAGRAFOS_POR_CAPITULO` por capítulo da cota), para um cliente adulterado não pedir "continuação" sem fim: além disso, os
 * tokens de cada chamada saem da `tokensMes` do plano e passam pelo uso justo do dia, como as outras funções.
 *
 * RESERVA ANTES, ESTORNO SÓ SE NINGUÉM RESPONDEU: quem chama devolve com `estornarUsoDeEstudo` (o mesmo de `iaDeEstudo.ts`).
 * FALHA FECHADA: contador que não responde lança `ContadorIndisponivel` (o núcleo responde 503).
 */
import { definicaoDoPlano, type PlanoEfetivo } from '../../src/core/planos'
import { usageCountersRepo } from '../db/repositories/usageCounters'
import type { UserId } from './authContext'
import type { ResultadoDaReservaDeEstudo } from './iaDeEstudo'
import { log } from './logger'
import { ContadorIndisponivel, janelaDaCota } from './usageQuota'

export const METRIC_AJUSTES_NIVEL_MES = 'ajustes_nivel_mes'
export const METRIC_AJUSTES_CAPITULO_MES = 'ajustes_capitulo_mes'
export const METRIC_AJUSTES_CAPITULO_PARAGRAFOS_MES = 'ajustes_capitulo_paragrafos_mes'
/** Quantos parágrafos de continuação cabem por capítulo da cota (um capítulo longo tem algumas centenas de parágrafos). */
export const PARAGRAFOS_POR_CAPITULO = 400

export type TipoDeAjuste = 'nivel' | 'capitulo-inicio' | 'capitulo-continuacao'

const SEM_CONTAGEM = { metrica: null, janela: null, janelaDoPool: null, restanteNaAmostra: null } as const

export async function reservarAjusteDeNivel(
  userId: UserId,
  plano: PlanoEfetivo,
  emTeste: boolean,
  tipo: TipoDeAjuste,
): Promise<ResultadoDaReservaDeEstudo> {
  const quotas = definicaoDoPlano(plano).quotas
  const tetoDoNivel = quotas.ajustesDeNivelMes
  const tetoDoCapitulo = quotas.ajustesDeCapituloMes
  const teto = tipo === 'nivel' ? tetoDoNivel : tetoDoCapitulo
  if (plano === 'free' || emTeste || (teto !== null && !(teto > 0))) return { ok: false, motivo: 'sem_plano' }
  if (teto === null) return { ok: true, origem: 'plano', ...SEM_CONTAGEM }
  const [metrica, limite] =
    tipo === 'nivel'
      ? [METRIC_AJUSTES_NIVEL_MES, teto]
      : tipo === 'capitulo-inicio'
        ? [METRIC_AJUSTES_CAPITULO_MES, teto]
        : [METRIC_AJUSTES_CAPITULO_PARAGRAFOS_MES, teto * PARAGRAFOS_POR_CAPITULO]
  try {
    const janela = await janelaDaCota(userId)
    if (!(await usageCountersRepo.reserve(userId, metrica, janela, limite, 1)))
      return { ok: false, motivo: 'cota_do_mes' }
    return { ok: true, origem: 'plano', restanteNaAmostra: null, metrica, janela, janelaDoPool: null }
  } catch (err) {
    log('error', {
      event: 'ajustar_nivel_contador_falhou',
      error: String((err as Error)?.message ?? err).slice(0, 120),
    })
    throw new ContadorIndisponivel(err)
  }
}
