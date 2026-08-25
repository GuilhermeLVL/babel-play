/**
 * Detecção de "modelo já baixado" + rótulo honesto de progresso.
 *
 * O transformers.js guarda os pesos no Cache Storage do navegador com o nome padrão
 * `transformers-cache`, chaveado pela URL de cada arquivo (que contém o id do modelo,
 * ex.: `onnx-community/whisper-tiny`). Antes de mostrar "Baixando…", checamos esse cache:
 * se os arquivos já estão lá, a preparação é só "carregando (em cache)" — o que corrige a
 * impressão de "re-download a cada captura" (a barra reaparecia mesmo em cache-hit).
 */

import { modeloDisponivel } from './modelManifest'

/**
 * Este modelo tem uma cópia COMPLETA no navegador?
 *
 * Antes: `keys.some(u => u.includes(modelId))` — uma entrada qualquer bastava. Medido: 1 de 4
 * pesos presentes devolvia `true` e a UI afirmava "nada é baixado de novo" com ~113 MB faltando
 * (A-P0-4). Agora a resposta vem do manifesto gravado ao fim de uma carga bem-sucedida, validado
 * arquivo a arquivo contra o tamanho real do corpo em cache.
 */
export async function isModelCached(modelId: string): Promise<boolean> {
  return (await modeloDisponivel(modelId)).completo
}

/** Todos os modelos da lista têm cópia completa? (decide "Baixando" vs "Carregando (em cache)") */
export async function areModelsCached(modelIds: string[]): Promise<boolean> {
  for (const id of modelIds) {
    if (!(await modeloDisponivel(id)).completo) return false
  }
  return true
}

/** Quantos bytes ainda faltam para estes modelos ficarem completos — para a UI ser honesta. */
export async function bytesFaltando(modelIds: string[]): Promise<number> {
  let total = 0
  for (const id of modelIds) {
    const e = await modeloDisponivel(id)
    if (!e.completo) total += e.bytesFaltando
  }
  return total
}

/** Id do modelo Whisper EFETIVO — mesma fonte de verdade do worker (override em localStorage). */
function activeWhisperModelId(): string {
  try {
    return localStorage.getItem('babel.whisperModel') || 'onnx-community/whisper-tiny'
  } catch {
    return 'onnx-community/whisper-tiny'
  }
}

/** Ids dos modelos que a preparação da captura vai tocar, dado o par de idiomas.
 *  `whisperModel` explícito (vindo do sttRouter) vence o override/default. */
export function expectedModelIds(src: string, tgt: string, whisperModel?: string): string[] {
  const ids = [whisperModel || activeWhisperModelId()]
  const s = (src || '').toLowerCase().split('-')[0]
  const t = (tgt || '').toLowerCase().split('-')[0]
  const ROMANCE = new Set(['pt', 'es', 'fr', 'it', 'ro', 'ca', 'gl'])
  if (s === 'en' && ROMANCE.has(t)) ids.push('Xenova/opus-mt-en-ROMANCE')
  else if (ROMANCE.has(s) && t === 'en') ids.push('Xenova/opus-mt-ROMANCE-en')
  return ids
}
