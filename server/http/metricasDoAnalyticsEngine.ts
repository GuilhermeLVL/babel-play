/**
 * MÉTRICAS NO WORKER: o Analytics Engine (Fase 4, Task 8, subconjunto R6).
 *
 * O Worker não tem `prom-client`; a cardinalidade que o Prometheus guardava em rótulos vai para pontos de
 * dados do Analytics Engine (binding `METRICAS`, dataset `frasy_metricas`). `writeDataPoint` é síncrono e
 * nunca se espera: o ponto sai do isolate sem promessa solta. Este módulo é o único que toca o binding.
 *
 * Contrato do ponto (esquema e consultas SQL: `docs/runbook.md`, "Analytics Engine"):
 *   blobs[0] é sempre a família; `indexes` tem um elemento (a chave de amostragem); `doubles` é a medida.
 *
 * Nada aqui lê env ou disco ao ser importado, e `gravarPonto` NUNCA lança: telemetria que derruba o
 * request que observa é pior que telemetria nenhuma.
 */
import { log } from '../lib/logger'

/** O ponto que o Analytics Engine aceita (`indexes`: no máximo 1, até 96 bytes). */
export interface PontoDeDados {
  blobs?: string[]
  doubles?: number[]
  indexes?: string[]
}

/** O pedaço do binding `AnalyticsEngineDataset` que interessa. */
export interface BindingDeMetricas {
  writeDataPoint(ponto: PontoDeDados): void
}

export type FamiliaDeMetrica =
  | 'requisicao'
  | 'admissao_recusada'
  | 'custo_por_plano'
  | 'r2'
  | 'provedor'
  | 'job'
  /* Fase B da IA paga (qualidade): o JSON que não serviu, o cache de prompt e o 👍/👎. */
  | 'resposta_invalida'
  | 'tokens_de_entrada'
  | 'feedback_ia'

/** O limite do índice e o que se aplica também aos blobs, para o rótulo ter o mesmo teto em toda parte. */
const LIMITE_EM_BYTES = 96

let binding: BindingDeMetricas | undefined
let avisou = false

/**
 * Liga (ou desliga, com `undefined`) o binding do isolate. Idempotente: o `worker.ts` chama a cada
 * requisição e a cada cron. O binding é opcional (dev local e testes rodam sem ele).
 */
export function ligarAnalyticsEngine(b: BindingDeMetricas | undefined): void {
  binding = b
}

/** Só para os testes: volta ao estado de isolate novo (sem binding, ainda sem ter avisado). */
export function esquecerAnalyticsEngine(): void {
  binding = undefined
  avisou = false
}

/** Corta em `LIMITE_EM_BYTES` de UTF-8 sem partir um caractere ao meio. */
function truncar(texto: string): string {
  const bytes = new TextEncoder().encode(texto)
  if (bytes.length <= LIMITE_EM_BYTES) return texto
  let fim = LIMITE_EM_BYTES
  while (fim > 0 && (bytes[fim]! & 0b1100_0000) === 0b1000_0000) fim--
  return new TextDecoder().decode(bytes.subarray(0, fim))
}

/**
 * Grava um ponto da família. No-op sem binding. Um número que não é finito derruba o ponto inteiro (tirar
 * só ele deslocaria as posições dos outros `doubles`, e a posição é o esquema). Não lança nunca; a falha
 * do binding vira UM aviso por isolate.
 */
export function gravarPonto(
  familia: FamiliaDeMetrica,
  blobs: readonly string[],
  doubles: readonly number[],
  index: string,
): void {
  if (!binding) return
  if (!doubles.every((n) => Number.isFinite(n))) return
  try {
    binding.writeDataPoint({
      blobs: [familia, ...blobs].map(truncar),
      doubles: [...doubles],
      indexes: [truncar(index)],
    })
  } catch (err) {
    if (avisou) return
    avisou = true
    log('warn', { event: 'analytics_engine_falhou', error: String(err).slice(0, 300) })
  }
}
