/**
 * O RÓTULO HONESTO DA TRANSCRIÇÃO NA IMPORTAÇÃO DE ÁUDIO.
 *
 * Antes a fila dizia sempre "Transcrevendo com o Whisper local…", mesmo quando a rota levava o
 * áudio à nuvem ou usava outro modelo (moonshine no inglês). Agora o rótulo vem do motor que de fato
 * atende o passo (`OfflineProgress.motor`/`modelo`) e usa a MESMA decisão de "onde" do selo da fala
 * da captura ao vivo (`seloDaFala`): o motor é traduzido pelo registro, nunca por uma lista daqui.
 *
 * PURO: sem DOM, sem estado.
 */
import type { OfflineProgress } from '../../gateway/offlineTranscribe';
import { seloDaFala } from '../captura/seloDaFala';

/** "onnx-community/whisper-tiny" vira "whisper-tiny" (o que a pessoa reconhece). */
function nomeCurtoDoModelo(modelo: string | undefined): string {
  return (modelo ?? '').split('/').pop()?.trim() ?? '';
}

/**
 * Verbo + lugar do passo de transcrição: "Transcrevendo no aparelho (whisper-tiny)…",
 * "Transcrevendo na nuvem do Frasy (whisper-large-v3-turbo)…". Sem motor conhecido, só
 * "Transcrevendo…": melhor calar do que afirmar o que ainda não aconteceu.
 */
export function rotuloDaTranscricao(p: Pick<OfflineProgress, 'motor' | 'modelo'>): string {
  const selo = p.motor ? seloDaFala(null, p.motor) : null;
  if (!selo) return 'Transcrevendo…';
  const lugar =
    selo.onde === 'nuvem' ? 'na nuvem do Frasy' : selo.onde === 'navegador' ? 'pelo navegador' : 'no aparelho';
  const modelo = nomeCurtoDoModelo(p.modelo);
  return `Transcrevendo ${lugar}${modelo ? ` (${modelo})` : ''}…`;
}

/** O rótulo do modelo local carregando: "Carregando o modelo local (moonshine-base)… 40%". */
export function rotuloDoModeloLocal(p: Pick<OfflineProgress, 'progress' | 'modelo'>): string {
  const modelo = nomeCurtoDoModelo(p.modelo);
  return `Carregando o modelo local${modelo ? ` (${modelo})` : ''}… ${Math.round(p.progress * 100)}%`;
}
