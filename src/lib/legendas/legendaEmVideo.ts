/**
 * A LEGENDA COMO VÍDEO NO PiP — o caminho do Safari no Mac (e de quem não tem Document PiP mas tem o
 * PiP de vídeo). As falas são desenhadas num `<canvas>`, o canvas vira um vídeo (`captureStream`) e o
 * vídeo vai para a janelinha do sistema (`requestPictureInPicture`), que fica por cima de qualquer app.
 *
 * É SÓ LEITURA: dentro do PiP de vídeo não há botões nossos. O que existe são os controles do próprio
 * navegador, verificados em 25/10/2026:
 *  - Chrome: com um vídeo de `MediaStream`, o play/pausa só aparece se a página tratar `play` e
 *    `pause` (Media Session); "anterior" e "próxima" aparecem quando há tratador. Aqui: play/pausa =
 *    pausar a legenda; "próxima" = salvar a última frase;
 *  - Safari: o play/pausa da janelinha pausa o PRÓPRIO vídeo e não chama o tratador da Media Session
 *    (WebKit, bug 230738, "por desenho"). Por isso a pausa também é lida dos eventos `pause`/`play` do
 *    vídeo. "Próxima" não aparece na janelinha do Safari: salvar fica para o app.
 *
 * DESEMPENHO: não há laço. O canvas só é redesenhado quando o quadro MUDA (fala nova, pausa, formato);
 * o `captureStream()` sem taxa fixa só emite quadro quando o canvas é pintado. Fora do PiP nada é
 * desenhado; ao sair da tela da captura (`destruir`), as trilhas param e o vídeo sai do documento.
 */
import { type Formato, quebrarLinhas } from '../../core/legendas/janelaFlutuante';

export interface FalaDoQuadro {
  original: string;
  traducao?: string;
  quem?: string;
}

export interface QuadroDaLegenda {
  falas: FalaDoQuadro[];
  formato: Formato;
  fundo: 'escuro' | 'preto' | 'claro';
  mostrar: 'ambos' | 'original' | 'traducao';
  /** Escala da letra escolhida pela pessoa (1 = 100%). */
  escala: number;
  pausado: boolean;
  /** Os textos da moldura, já traduzidos para a interface (`t()` fica com quem chama). */
  textos: { vazio: string; pausada: string };
}

/** As dimensões do quadro por formato: o PiP do sistema usa a proporção do vídeo. */
export const DIMENSOES_DO_QUADRO: Readonly<Record<Formato, { largura: number; altura: number }>> = {
  faixa: { largura: 1280, altura: 200 },
  legenda: { largura: 1280, altura: 360 },
  conversa: { largura: 720, altura: 960 },
  estudo: { largura: 1280, altura: 360 },
};

const CORES = {
  escuro: { fundo: '#141210', texto: '#ffffff', traducao: '#ffea00', quem: 'rgba(255,255,255,0.62)', selo: '#ffb597' },
  preto: { fundo: '#000000', texto: '#ffffff', traducao: '#ffea00', quem: 'rgba(255,255,255,0.62)', selo: '#ffb597' },
  claro: { fundo: '#f6f1e8', texto: '#1d1915', traducao: '#7a4e00', quem: 'rgba(29,25,21,0.62)', selo: '#9a3412' },
} as const;

const FONTE = '"Inter", system-ui, -apple-system, "Segoe UI", sans-serif';

/** Uma chave do quadro: o mesmo texto não é desenhado duas vezes. */
export function chaveDoQuadro(q: QuadroDaLegenda): string {
  return JSON.stringify(q);
}

/**
 * Desenha o quadro no contexto. A fala mais nova fica embaixo (como numa legenda); o que não cabe em
 * cima é cortado. Exportada para os testes e para a foto do quadro.
 */
export function desenharQuadro(ctx: CanvasRenderingContext2D, q: QuadroDaLegenda): void {
  const { largura: W, altura: H } = DIMENSOES_DO_QUADRO[q.formato];
  const cor = CORES[q.fundo];
  ctx.fillStyle = cor.fundo;
  ctx.fillRect(0, 0, W, H);

  const margem = q.formato === 'conversa' ? 40 : 48;
  const larguraUtil = W - margem * 2;
  const escala = Math.min(2, Math.max(0.5, q.escala));
  const tamO = Math.round((q.formato === 'faixa' ? 54 : q.formato === 'conversa' ? 40 : 52) * escala);
  const tamT = Math.round(tamO * 0.8);
  const tamQ = Math.round(tamO * 0.5);
  const centro = q.formato !== 'conversa';
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = centro ? 'center' : 'left';
  const x = centro ? W / 2 : margem;

  if (!q.falas.length) {
    ctx.font = `600 ${Math.round(tamT * 0.9)}px ${FONTE}`;
    ctx.fillStyle = cor.quem;
    ctx.textAlign = 'center';
    ctx.fillText(q.textos.vazio, W / 2, H / 2 + tamT / 3);
  } else {
    /* Monta as linhas de baixo para cima até acabar a altura. */
    type Linha = { texto: string; fonte: string; cor: string; altura: number };
    const blocos: Linha[][] = q.falas.map((f) => {
      const linhas: Linha[] = [];
      const soTraducao = q.mostrar === 'traducao' && !!f.traducao;
      if (q.formato === 'conversa' && f.quem) {
        linhas.push({
          texto: f.quem.toUpperCase(),
          fonte: `700 ${tamQ}px ${FONTE}`,
          cor: cor.quem,
          altura: tamQ * 1.5,
        });
      }
      const principal = soTraducao ? f.traducao! : f.original;
      ctx.font = `700 ${tamO}px ${FONTE}`;
      const maxO = q.formato === 'faixa' ? 2 : 3;
      for (const l of quebrarLinhas(principal, larguraUtil, (s) => ctx.measureText(s).width, maxO)) {
        linhas.push({
          texto: l,
          fonte: `700 ${tamO}px ${FONTE}`,
          cor: soTraducao ? cor.traducao : cor.texto,
          altura: tamO * 1.22,
        });
      }
      if (q.mostrar === 'ambos' && f.traducao) {
        ctx.font = `500 ${tamT}px ${FONTE}`;
        for (const l of quebrarLinhas(f.traducao, larguraUtil, (s) => ctx.measureText(s).width, 2)) {
          linhas.push({ texto: l, fonte: `500 ${tamT}px ${FONTE}`, cor: cor.traducao, altura: tamT * 1.25 });
        }
      }
      return linhas;
    });
    const espacoEntre = q.formato === 'conversa' ? tamO * 0.7 : tamO * 0.45;
    let y = H - margem * 0.7;
    for (let i = blocos.length - 1; i >= 0; i--) {
      const bloco = blocos[i];
      const alturaDoBloco = bloco.reduce((s, l) => s + l.altura, 0);
      if (y - alturaDoBloco < 0 && i < blocos.length - 1) break;
      const anterior = i < blocos.length - 1;
      ctx.globalAlpha = anterior ? 0.6 : 1;
      let yl = y - alturaDoBloco;
      for (const l of bloco) {
        yl += l.altura;
        ctx.font = l.fonte;
        ctx.fillStyle = l.cor;
        ctx.fillText(l.texto, x, yl - l.altura * 0.22);
      }
      ctx.globalAlpha = 1;
      y -= alturaDoBloco + espacoEntre;
    }
  }

  if (q.pausado) {
    const tam = Math.round(Math.max(22, tamQ));
    ctx.font = `700 ${tam}px ${FONTE}`;
    const txt = `❚❚ ${q.textos.pausada}`;
    const w = ctx.measureText(txt).width + tam;
    ctx.fillStyle = cor.selo;
    ctx.globalAlpha = 0.95;
    ctx.fillRect(W - w - 16, 14, w, tam * 1.6);
    ctx.globalAlpha = 1;
    ctx.fillStyle = q.fundo === 'claro' ? '#ffffff' : '#141210';
    ctx.textAlign = 'center';
    ctx.fillText(txt, W - w / 2 - 16, 14 + tam * 1.15);
  }
}

export interface AcoesDoVideo {
  /** A pessoa pausou (true) ou retomou (false) pelo controle do navegador. */
  /**
   * Pausou (true) ou retomou (false). `pelaJanela` = foi o botão da própria janelinha (Safari), que
   * pausa o VÍDEO: o quadro fica congelado e quem mostra a pausa é o botão nativo, não um selo nosso.
   */
  aoPausar: (pausado: boolean, pelaJanela: boolean) => void;
  /** "Próxima" no PiP (onde o navegador mostra): salvar a última frase. */
  aoSalvar: () => void;
  /** A janelinha fechou (X do sistema, ou voltou para a aba). */
  aoSair: () => void;
}

export interface LegendaEmVideo {
  /**
   * Cria o canvas e o vídeo e deixa o vídeo pronto (com um quadro, logo com metadados) para abrir no
   * clique. Chame enquanto a captura está ativa, não no clique.
   */
  preparar(): void;
  /** Pede o PiP. Chame no gesto: o pedido sai na hora se o vídeo já está pronto. */
  abrir(acoes: AcoesDoVideo): Promise<void>;
  /** Redesenha só se o quadro mudou. */
  desenhar(q: QuadroDaLegenda): void;
  fechar(): Promise<void>;
  aberta(): boolean;
  /** Solta tudo (saiu da tela da captura). */
  destruir(): void;
  /** O canvas (para a foto do quadro nos testes). */
  canvas(): HTMLCanvasElement | null;
}

type MediaSessionMinima = {
  setActionHandler: (acao: string, tratador: (() => void) | null) => void;
  playbackState?: string;
};

function sessaoDeMidia(): MediaSessionMinima | null {
  const ms = (navigator as unknown as { mediaSession?: MediaSessionMinima }).mediaSession;
  return ms && typeof ms.setActionHandler === 'function' ? ms : null;
}

function tratar(ms: MediaSessionMinima | null, acao: string, fn: (() => void) | null) {
  try {
    ms?.setActionHandler(acao, fn);
  } catch {
    /* ação que este navegador não conhece: sem botão, sem erro */
  }
}

export function criarLegendaEmVideo(doc: Document = document): LegendaEmVideo {
  let canvas: HTMLCanvasElement | null = null;
  let video: HTMLVideoElement | null = null;
  let ultimaChave = '';
  let emPiP = false;
  let acoes: AcoesDoVideo | null = null;
  /* Pausa pedida pela Media Session (Chrome): o vídeo segue tocando para o selo "Pausada" aparecer. */
  let pausaPelaSessao = false;

  const aoPausarVideo = () => emPiP && !pausaPelaSessao && acoes?.aoPausar(true, true);
  const aoTocarVideo = () => emPiP && acoes?.aoPausar(false, true);
  const aoSairDoPiP = () => {
    if (!emPiP) return;
    emPiP = false;
    const ms = sessaoDeMidia();
    for (const a of ['play', 'pause', 'nexttrack']) tratar(ms, a, null);
    /* A fonte fica ligada, parada (sem pintura não há quadro novo): reabrir no próximo clique é
       imediato, sem esperar metadados — no Safari, esperar perde o gesto. Quem solta tudo é `destruir`. */
    ultimaChave = '';
    const a = acoes;
    acoes = null;
    a?.aoSair();
  };

  function pararFonte() {
    const fonte = video?.srcObject as MediaStream | null | undefined;
    fonte?.getTracks().forEach((t) => t.stop());
    if (video) video.srcObject = null;
    ultimaChave = '';
  }

  /** Pinta o quadro vazio (o fundo): o primeiro quadro do vídeo, o que dá a ele metadados. */
  function pintarVazio() {
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.fillStyle = '#141210';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  function ligarFonte() {
    if (!canvas || !video || video.srcObject) return;
    /* Sem taxa fixa: um quadro por pintura do canvas. */
    const fonte = canvas.captureStream();
    video.srcObject = fonte;
    /* A trilha só emite quadro quando o canvas é pintado DEPOIS de existir: pinta de novo e, onde há,
       pede o quadro explicitamente. Sem isto o vídeo ficava em `readyState` 0 e o clique esperava. */
    pintarVazio();
    for (const t of fonte.getVideoTracks?.() ?? [])
      (t as MediaStreamTrack & { requestFrame?: () => void }).requestFrame?.();
    ultimaChave = '';
    void video.play().catch(() => {
      /* sem autoplay: o clique em "abrir" toca de novo */
    });
  }

  const api: LegendaEmVideo = {
    preparar() {
      if (canvas && video) {
        ligarFonte();
        return;
      }
      canvas = doc.createElement('canvas');
      const { largura, altura } = DIMENSOES_DO_QUADRO.legenda;
      canvas.width = largura;
      canvas.height = altura;
      video = doc.createElement('video');
      video.muted = true;
      video.playsInline = true;
      video.setAttribute('playsinline', '');
      video.setAttribute('aria-hidden', 'true');
      video.setAttribute('data-legenda-em-video', '');
      /* Presente e "visível" para o navegador, mas sem ocupar a tela: há Safari que recusa o PiP de
         vídeo fora do documento ou com display: none. */
      Object.assign(video.style, {
        position: 'fixed',
        left: '0',
        bottom: '0',
        width: '2px',
        height: '2px',
        opacity: '0.01',
        pointerEvents: 'none',
        zIndex: '-1',
      });
      video.addEventListener('pause', aoPausarVideo);
      video.addEventListener('play', aoTocarVideo);
      video.addEventListener('leavepictureinpicture', aoSairDoPiP);
      doc.body.appendChild(video);
      ligarFonte();
    },

    async abrir(novas) {
      api.preparar();
      const v = video!;
      acoes = novas;
      pausaPelaSessao = false;
      const pedir = () => v.requestPictureInPicture();
      if (v.readyState >= 1) {
        await pedir();
      } else {
        /* Ainda sem metadados: espera um pouco. O gesto pode expirar no meio — aí o erro sobe. */
        await new Promise<void>((ok) => {
          const pronto = () => ok();
          v.addEventListener('loadedmetadata', pronto, { once: true });
          setTimeout(pronto, 800);
        });
        await pedir();
      }
      emPiP = true;
      void v.play().catch(() => {});
      const ms = sessaoDeMidia();
      tratar(ms, 'play', () => {
        pausaPelaSessao = false;
        if (ms) ms.playbackState = 'playing';
        void v.play().catch(() => {});
        acoes?.aoPausar(false, false);
      });
      tratar(ms, 'pause', () => {
        pausaPelaSessao = true;
        if (ms) ms.playbackState = 'paused';
        acoes?.aoPausar(true, false);
      });
      tratar(ms, 'nexttrack', () => acoes?.aoSalvar());
      if (ms) ms.playbackState = 'playing';
    },

    desenhar(q) {
      if (!canvas) return;
      const chave = chaveDoQuadro(q);
      if (chave === ultimaChave) return;
      ultimaChave = chave;
      const { largura, altura } = DIMENSOES_DO_QUADRO[q.formato];
      if (canvas.width !== largura || canvas.height !== altura) {
        canvas.width = largura;
        canvas.height = altura;
      }
      const ctx = canvas.getContext('2d');
      if (ctx) desenharQuadro(ctx, q);
    },

    async fechar() {
      const docPiP = doc as Document & {
        pictureInPictureElement?: Element | null;
        exitPictureInPicture?: () => Promise<void>;
      };
      if (emPiP && docPiP.pictureInPictureElement === video && docPiP.exitPictureInPicture) {
        await docPiP.exitPictureInPicture().catch(() => {});
      }
      aoSairDoPiP();
    },

    aberta: () => emPiP,

    destruir() {
      void api.fechar();
      pararFonte();
      if (video) {
        video.removeEventListener('pause', aoPausarVideo);
        video.removeEventListener('play', aoTocarVideo);
        video.removeEventListener('leavepictureinpicture', aoSairDoPiP);
        video.remove();
      }
      video = null;
      canvas = null;
    },

    canvas: () => canvas,
  };
  return api;
}
