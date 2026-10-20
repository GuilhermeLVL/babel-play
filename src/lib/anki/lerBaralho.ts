/**
 * PORTA DE ENTRADA da leitura de um baralho no navegador. Texto (`.txt/.csv/.tsv`) é lido aqui mesmo,
 * na thread principal (é barato); `.apkg` vai para um Web Worker (`leitorDeApkg.worker.ts`), que é
 * encerrado ao terminar ou falhar — o WASM do SQLite e a coleção aberta não ficam ocupando memória.
 */
import { type LeituraAnki, lerTextoAnki } from '../../core/anki';
import type { MensagemDoLeitor, MensagemParaOLeitor } from './leitorDeApkg.worker';
import type { ProgressoDaLeitura } from './lerApkg';

const EH_TEXTO = /\.(txt|csv|tsv)$/i;

export async function lerBaralhoNoNavegador(
  arquivo: File,
  aoProgredir?: (p: ProgressoDaLeitura) => void,
): Promise<LeituraAnki> {
  if (EH_TEXTO.test(arquivo.name)) return lerTextoAnki(await arquivo.text());

  const worker = new Worker(new URL('./leitorDeApkg.worker.ts', import.meta.url), { type: 'module' });
  try {
    return await new Promise<LeituraAnki>((resolve, reject) => {
      worker.onmessage = (evento: MessageEvent<MensagemDoLeitor>) => {
        const m = evento.data;
        if (m.tipo === 'progresso') aoProgredir?.(m.progresso);
        else if (m.tipo === 'ok') resolve(m.leitura);
        else reject(new Error(m.mensagem));
      };
      worker.onerror = (evento) => {
        evento.preventDefault();
        reject(new Error(evento.message || 'o leitor de .apkg parou de responder'));
      };
      worker.postMessage({ arquivo } satisfies MensagemParaOLeitor);
    });
  } finally {
    worker.terminate();
  }
}
