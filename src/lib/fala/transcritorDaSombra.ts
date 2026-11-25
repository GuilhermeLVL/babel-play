/**
 * O MODELO DA SOMBRA LOCAL (openspec `sombra-sem-web-speech`): uma instância de `WhisperLocalStt` por aba, criada só
 * quando a pessoa aceita o download. O mesmo worker serve Moonshine (inglês) e Whisper. Carregado por `import()` de
 * `ouvirFraseNoAparelho.ts`: quem não usa a sombra local não paga o peso.
 */
import type { MotorDaSombra } from '../../core/fala/motorDaSombra';
import { WhisperLocalStt } from '../../gateway/adapters/whisperLocal';
import { MOONSHINE_MODELS, WHISPER_MODELS } from '../../gateway/sttRouter';

const MODELO_DO_MOTOR: Record<string, string> = {
  'local-moonshine-tiny': MOONSHINE_MODELS.tiny,
  'local-moonshine-base': MOONSHINE_MODELS.base,
  'local-whisper-base': WHISPER_MODELS.base,
};

let stt: WhisperLocalStt | null = null;
let motorPreparado: MotorDaSombra | null = null;

/** Baixa (ou acha no cache) e carrega o modelo do motor. Chamar só depois do consentimento. */
export async function prepararSombraLocal(
  motor: MotorDaSombra,
  aoProgredir?: (fracao: number, rotulo?: string) => void,
): Promise<void> {
  const modelo = MODELO_DO_MOTOR[motor];
  if (!modelo) throw new Error(`motor sem modelo local: ${motor}`);
  if (!stt) stt = new WhisperLocalStt();
  if (motorPreparado !== motor) {
    stt.setModel(modelo);
    motorPreparado = motor;
  }
  await stt.preload(aoProgredir);
}

export async function transcreverFrase(pcm: Float32Array, lang: string): Promise<string> {
  if (!stt || !motorPreparado) throw new Error('modelo da sombra local não preparado');
  const r = await stt.transcribePcm(pcm, 16000, { languageHint: lang.split('-')[0] });
  return (r.text || '').trim();
}

/** Solta o worker e o modelo (ao sair da tela de prática). A próxima `prepararSombraLocal` recria do cache. */
export function liberarSombraLocal(): void {
  stt?.liberar();
  stt = null;
  motorPreparado = null;
}
