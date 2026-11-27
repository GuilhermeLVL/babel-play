/**
 * "LER EM VOZ ALTA ESTE TRECHO" (openspec `leitura-assistida`, fatia B): a voz atual do app (`lib/tts`), no idioma do livro.
 * A leitura para ao limpar a seleção (`pararLeitura`). Fica no aparelho: o texto não vai a nenhum servidor por aqui.
 */
import { toBcp47 } from '../languages';
import { cancelSpeech, speak } from '../tts';

let falando = false;

export function lerEmVozAlta(texto: string, idioma: string, aoTerminar?: () => void): void {
  const limpo = texto.trim();
  if (!limpo || !idioma) return;
  falando = true;
  const fim = () => {
    falando = false;
    aoTerminar?.();
  };
  speak(limpo.slice(0, 2000), { lang: toBcp47(idioma), onEnd: fim, onError: fim });
}

/** Para a leitura que ESTE módulo começou (não mexe na fala de outro módulo). */
export function pararLeitura(): void {
  if (!falando) return;
  falando = false;
  cancelSpeech();
}
