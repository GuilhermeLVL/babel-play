/**
 * PARAR O GRAVADOR, COM PRAZO (relato do dono, 2026-09-28: "encerrar demora e trava").
 *
 * `MediaRecorder.stop()` entrega o último pedaço e dispara `onstop`; o encerramento da captura
 * esperava por esse evento sem prazo. Quando ele não vem (faixa que morreu, aba em segundo plano,
 * navegador que o engole), o fim da captura ficava pendurado para sempre. Com prazo, o que já
 * chegou vira o áudio: o gravador entrega pedaços a cada segundo (`recorder.start(1000)`), então
 * no pior caso perde-se o último segundo, não a sessão.
 */
export const PRAZO_PARA_PARAR_O_GRAVADOR_MS = 5000;

export function pararGravador(
  recorder: MediaRecorder,
  pedacos: Blob[],
  tipo: string,
  prazoMs = PRAZO_PARA_PARAR_O_GRAVADOR_MS,
): Promise<Blob | null> {
  const juntar = () => (pedacos.length ? new Blob(pedacos, { type: tipo || 'audio/webm' }) : null);
  return new Promise<Blob | null>((resolve) => {
    let feito = false;
    const fim = () => {
      if (feito) return;
      feito = true;
      clearTimeout(relogio);
      resolve(juntar());
    };
    const relogio = setTimeout(fim, prazoMs);
    recorder.onstop = fim;
    try {
      recorder.stop();
    } catch {
      // Gravador que recusa parar: os pedaços já entregues ainda são o áudio da sessão.
      fim();
    }
  });
}
