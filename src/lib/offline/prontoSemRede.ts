/**
 * A SONDA DA PROMESSA OFFLINE (change `modelos-confiaveis-e-offline`, decisão 5).
 *
 * A tela da captura dizia "A legenda roda no aparelho e nada se perde" a quem estava sem internet — e Iniciar
 * falhava com "Worker error" (DISP-02). A promessa só aparece quando ela é verdade NESTE navegador: o service
 * worker controla a página (os chunks da captura estão no cache dele) E algum modelo de transcrição está
 * baixado por inteiro (o manifesto do download, `modelManifest.ts`).
 */
import { ID_DO_PARAKEET } from '../../gateway/adapters/parakeetModelo';
import { temCopiaNoAparelho } from '../../gateway/modelManifest';
import { MOONSHINE_MODELS, WHISPER_MODELS } from '../../gateway/sttRouter';
import { swControlando } from '../registrarSw';

const MODELOS_DE_TRANSCRICAO = [...Object.values(WHISPER_MODELS), ...Object.values(MOONSHINE_MODELS), ID_DO_PARAKEET];

export function prontoParaLegendarSemRede(
  deps: { sw?: () => boolean; temModelo?: (id: string) => boolean } = {},
): boolean {
  try {
    const sw = deps.sw ?? swControlando;
    const temModelo = deps.temModelo ?? ((id: string) => temCopiaNoAparelho(id));
    return sw() && MODELOS_DE_TRANSCRICAO.some(temModelo);
  } catch {
    return false;
  }
}
