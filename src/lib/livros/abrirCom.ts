/**
 * "ABRIR COM O FRASY" (File Handling API): melhoria PROGRESSIVA. Com o app instalado como PWA em um navegador
 * Chromium de computador, `.epub` e `.pdf` ganham "Abrir com Frasy" (`file_handlers` em `site.webmanifest`).
 * Onde não há `launchQueue` (Safari, Firefox, aba comum) este módulo não faz nada. O arquivo é lido no
 * aparelho, como em "Trazer o seu": não passa pelo servidor.
 */

interface ArquivoDeLancamento {
  getFile(): Promise<File>;
}
interface ParametrosDeLancamento {
  files?: ArquivoDeLancamento[];
}
interface FilaDeLancamento {
  setConsumer(consumidor: (p: ParametrosDeLancamento) => void): void;
}

/** Liga o consumidor da fila de lançamento. Devolve `false` se o navegador não tem a API. */
export function ligarAbrirCom(abrir: (arquivo: File) => Promise<unknown>): boolean {
  const fila = (globalThis as { launchQueue?: FilaDeLancamento }).launchQueue;
  if (!fila || typeof fila.setConsumer !== 'function') return false;
  fila.setConsumer((p) => {
    const primeiro = p.files?.[0];
    if (!primeiro) return;
    void primeiro
      .getFile()
      .then((arquivo) => abrir(arquivo))
      .catch(() => {
        /* sem alerta: a pessoa ainda pode soltar o arquivo em "Trazer o seu" */
      });
  });
  return true;
}
