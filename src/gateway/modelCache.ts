/**
 * Detecção de "modelo já baixado" + rótulo honesto de progresso.
 *
 * O transformers.js guarda os pesos no Cache Storage do navegador com o nome padrão
 * `transformers-cache`, chaveado pela URL de cada arquivo (que contém o id do modelo,
 * ex.: `onnx-community/whisper-tiny`). Antes de mostrar "Baixando…", checamos esse cache:
 * se os arquivos já estão lá, a preparação é só "carregando (em cache)" — o que corrige a
 * impressão de "re-download a cada captura" (a barra reaparecia mesmo em cache-hit).
 */

import { modelosDoParNoAparelho } from '../core/traducao/coberturaNoAparelho';
import { pivoEntreDiretos } from '../core/traducao/viaIngles';
import { bergamotOferecido } from './adapters/bergamotModelo';
import { modeloDisponivel } from './modelManifest';

/**
 * Todos os modelos da lista têm cópia COMPLETA no navegador? (decide "Baixando" vs
 * "Carregando (em cache)")
 *
 * Antes: `keys.some(u => u.includes(modelId))` — uma entrada qualquer bastava. Medido: 1 de 4
 * pesos presentes devolvia `true` e a UI afirmava "nada é baixado de novo" com ~113 MB faltando
 * (A-P0-4). Agora a resposta vem do manifesto gravado ao fim de uma carga bem-sucedida, validado
 * arquivo a arquivo contra o tamanho real do corpo em cache.
 */
export async function areModelsCached(modelIds: string[]): Promise<boolean> {
  for (const id of modelIds) {
    if (!(await modeloDisponivel(id)).completo) return false;
  }
  return true;
}

/** Id do modelo Whisper EFETIVO — mesma fonte de verdade do worker (override em localStorage). */
function activeWhisperModelId(): string {
  try {
    return localStorage.getItem('babel.whisperModel') || 'onnx-community/whisper-tiny';
  } catch {
    return 'onnx-community/whisper-tiny';
  }
}

/** Ids dos modelos que a preparação da captura vai tocar, dado o par de idiomas.
 *  `whisperModel` explícito (vindo do sttRouter) vence o override/default.
 *  A lista do tradutor é a de `modelosDoParNoAparelho` (`core/traducao/coberturaNoAparelho.ts`), a mesma que o tradutor
 *  local carrega: o Bergamot oferecido (`adapters/bergamotModelo.ts`) toma a perna `X→en` (pt→en embutido, os outros do
 *  CDN), e o par sem modelo direto passa pelo inglês (es→pt: es→en e en→pt — o aviso de download soma as duas). */
export function expectedModelIds(
  src: string,
  tgt: string,
  whisperModel?: string,
  opcoes?: { nuvemConsentida?: boolean },
): string[] {
  const stt = whisperModel || activeWhisperModelId();
  /* Com a nuvem consentida, o pivô entre pt/es/fr/it/de não é usado (o gateway o tira da cascata): nada a baixar. */
  if (opcoes?.nuvemConsentida && pivoEntreDiretos(src, tgt)) return [stt];
  const bergamot = (par: string): boolean => {
    const [de, para] = par.split('-');
    return bergamotOferecido(de, para);
  };
  return [stt, ...modelosDoParNoAparelho(src, tgt, { bergamot })];
}
