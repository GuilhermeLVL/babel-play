/**
 * O QUADRO DA TELA (openspec `cartao-com-captura-de-tela`, tarefa 3.1).
 *
 * A faixa de vídeo do compartilhamento já está viva no mínimo (1 quadro/s, 640x360; ver `systemAudio.ts`). Para UM quadro
 * legível sobe-se a resolução com `applyConstraints` (sem reabrir o seletor), espera-se o quadro novo, desenha-se num canvas
 * de até `LARGURA_DO_QUADRO` px e SEMPRE volta ao mínimo, mesmo se o desenho falhar.
 *
 * Só é chamado por gesto explícito da pessoa (botão "Guardar a cena"): nada captura sozinho, nada é gravado aqui.
 */
export const LARGURA_DO_QUADRO = 480;
const SUBIDA_DO_QUADRO = { frameRate: { max: 5 }, width: { max: 960 }, height: { max: 540 } } as const;
const ESPERA_DO_QUADRO_MS = 300;

/** Pede um quadro da faixa e entrega o canvas pronto (até 480 px de largura). Injetável para teste. */
export type CapturaDeQuadro = (trilha: MediaStreamTrack) => Promise<HTMLCanvasElement | null>;

export const capturaPeloVideo: CapturaDeQuadro = (trilha) =>
  new Promise((ok) => {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.srcObject = new MediaStream([trilha]);
    let feito = false;
    let limite = 0;
    const fim = (c: HTMLCanvasElement | null) => {
      if (feito) return;
      feito = true;
      window.clearTimeout(limite);
      video.pause();
      video.srcObject = null;
      ok(c);
    };
    const desenhar = () => {
      if (feito) return;
      const w = video.videoWidth;
      const h = video.videoHeight;
      if (!w || !h) return fim(null);
      const escala = Math.min(1, LARGURA_DO_QUADRO / w);
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(w * escala));
      c.height = Math.max(1, Math.round(h * escala));
      const ctx = c.getContext('2d');
      if (!ctx) return fim(null);
      ctx.drawImage(video, 0, 0, c.width, c.height);
      fim(c);
    };
    limite = window.setTimeout(() => fim(null), 2000);
    video.onerror = () => fim(null);
    video.onloadeddata = () => {
      /* O primeiro quadro pode ser o antigo (640x360): espera um quadro novo, com teto curto. */
      const v = video as HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number };
      if (v.requestVideoFrameCallback) {
        v.requestVideoFrameCallback(desenhar);
        window.setTimeout(desenhar, ESPERA_DO_QUADRO_MS + 200);
      } else window.setTimeout(desenhar, ESPERA_DO_QUADRO_MS);
    };
    void video.play().catch(() => fim(null));
  });

/**
 * Tira um quadro de uma faixa e devolve as constraints a `minimas`, aconteça o que acontecer.
 * `null` sem faixa, faixa encerrada ou sem quadro.
 */
export async function tirarQuadroDaFaixa(
  trilha: MediaStreamTrack | undefined,
  minimas: MediaTrackConstraints,
  capturar: CapturaDeQuadro = capturaPeloVideo,
): Promise<HTMLCanvasElement | null> {
  if (!trilha || trilha.readyState === 'ended') return null;
  try {
    try {
      await trilha.applyConstraints({ ...SUBIDA_DO_QUADRO });
    } catch {
      /* navegador que recusa subir: segue com o quadro de 640x360 */
    }
    return await capturar(trilha);
  } catch {
    return null;
  } finally {
    try {
      await trilha.applyConstraints({ ...minimas });
    } catch {
      /* a faixa pode ter acabado */
    }
  }
}
