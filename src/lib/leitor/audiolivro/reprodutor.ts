/**
 * O REPRODUTOR DE UM CAPÍTULO GRAVADO (F2): um `<audio>` com o `.opus` do capítulo e os tempos `{i, t0, t1}` de cada
 * frase. O DESTAQUE segue o `currentTime`, consultado a cada quadro (o `timeupdate` sozinho vem a cada ~250 ms; o alvo
 * é ≤ 300 ms do `t0`), e o `timeupdate` fica como reserva para a aba em segundo plano (sem quadros).
 *
 * O `MediaOverlay` do foliate NÃO é reaproveitado (exige SMIL no EPUB e ids por trecho; nossos livros não têm): só o
 * padrão dele — o tempo dirige o destaque e o seek acontece dentro de `canplaythrough`, que o WebKit exige.
 *
 * Um "Ouvir" por aparelho: ao tocar, o canal `frasy-audiolivro` avisa as outras abas, e quem ouve pausa.
 */
import { type FraseComTempo, frasePorTempo } from '../../../core/leitura/audiolivro';

export type MotivoDoErro = 'rede' | 'decodificacao';

export interface ReprodutorDeCapitulo {
  carregar(url: string, tempos: readonly FraseComTempo[]): Promise<void>;
  tocarDe(i: number): Promise<void>;
  pausar(): void;
  retomar(): Promise<void>;
  parar(): void;
  definirVelocidade(v: number): void;
  precarregar(url: string): void;
  destruir(): void;
  aoMudarFrase: (i: number) => void;
  aoFimDoCapitulo: () => void;
  aoErro: (motivo: MotivoDoErro) => void;
  /** Outra aba começou a tocar e esta pausou (o narrador acompanha o estado). */
  aoPausarDeFora: () => void;
}

export interface DependenciasDoReprodutor {
  criarAudio?: () => HTMLAudioElement;
  /** Agenda o próximo quadro e devolve como cancelar (padrão: `requestAnimationFrame`). */
  agendar?: (cb: () => void) => () => void;
  /** O canal entre abas (padrão: `BroadcastChannel('frasy-audiolivro')`; `null` = sem canal). */
  canal?: BroadcastChannel | null;
}

const VELOCIDADE = { min: 0.5, max: 2.5 } as const;
/** MEDIA_ERR_DECODE: o arquivo chegou e não decodifica. O resto (rede, 404 = SRC_NOT_SUPPORTED) é "rede". */
const ERRO_DE_DECODIFICACAO = 3;

const agendarPadrao = (cb: () => void): (() => void) => {
  if (typeof requestAnimationFrame === 'function') {
    const id = requestAnimationFrame(cb);
    return () => cancelAnimationFrame(id);
  }
  const id = setTimeout(cb, 50);
  return () => clearTimeout(id);
};

const canalPadrao = (): BroadcastChannel | null => {
  try {
    return typeof BroadcastChannel === 'function' ? new BroadcastChannel('frasy-audiolivro') : null;
  } catch {
    return null;
  }
};

export function criarReprodutor(d: DependenciasDoReprodutor = {}): ReprodutorDeCapitulo {
  const criarAudio = d.criarAudio ?? (() => new Audio());
  const agendar = d.agendar ?? agendarPadrao;
  const canal = d.canal === undefined ? canalPadrao() : d.canal;
  const id = Math.random().toString(36).slice(2);
  let audio: HTMLAudioElement | null = null;
  let proximo: HTMLAudioElement | null = null;
  let tempos: readonly FraseComTempo[] = [];
  let ultima = -1;
  let velocidade = 1;
  let cancelarQuadro: (() => void) | null = null;
  let destruido = false;

  const r: ReprodutorDeCapitulo = {
    aoMudarFrase: () => {},
    aoFimDoCapitulo: () => {},
    aoErro: () => {},
    aoPausarDeFora: () => {},
    carregar,
    tocarDe,
    pausar,
    retomar,
    parar,
    definirVelocidade,
    precarregar,
    destruir,
  };

  const conferir = () => {
    if (!audio || destruido) return;
    const i = frasePorTempo(tempos, audio.currentTime);
    if (i >= 0 && i !== ultima) {
      ultima = i;
      r.aoMudarFrase(i);
    }
  };
  const quadro = () => {
    cancelarQuadro = null;
    conferir();
    if (audio && !audio.paused && !destruido) cancelarQuadro = agendar(quadro);
  };
  const pararQuadros = () => {
    cancelarQuadro?.();
    cancelarQuadro = null;
  };
  const seguirQuadros = () => {
    pararQuadros();
    cancelarQuadro = agendar(quadro);
  };

  const aoAcabar = () => {
    pararQuadros();
    r.aoFimDoCapitulo();
  };
  const aoFalhar = () => {
    pararQuadros();
    r.aoErro(audio?.error?.code === ERRO_DE_DECODIFICACAO ? 'decodificacao' : 'rede');
  };

  const soltar = (a: HTMLAudioElement | null) => {
    if (!a) return;
    a.removeEventListener('ended', aoAcabar);
    a.removeEventListener('error', aoFalhar);
    a.removeEventListener('timeupdate', conferir);
    a.pause();
    a.removeAttribute('src');
    a.load?.();
  };

  if (canal)
    canal.onmessage = (e: MessageEvent) => {
      const m = e.data as { tocando?: boolean; de?: string } | null;
      if (m?.tocando && m.de !== id && audio && !audio.paused) {
        pausar();
        r.aoPausarDeFora();
      }
    };

  function preparar(url: string): HTMLAudioElement {
    if (proximo && proximo.src === url) {
      const a = proximo;
      proximo = null;
      return a;
    }
    const a = criarAudio();
    a.preload = 'auto';
    a.src = url;
    return a;
  }

  async function carregar(url: string, novos: readonly FraseComTempo[]): Promise<void> {
    pararQuadros();
    soltar(audio);
    audio = null;
    ultima = -1;
    tempos = novos;
    if (!novos.length) return; // capítulo sem frases: nenhum <audio>, a fila pula
    audio = preparar(url);
    audio.addEventListener('ended', aoAcabar);
    audio.addEventListener('error', aoFalhar);
    audio.addEventListener('timeupdate', conferir);
    aplicarVelocidade();
  }

  /** O `canplaythrough` (o WebKit ignora o seek antes dele); já pronto, segue na hora. */
  const pronto = (a: HTMLAudioElement) =>
    a.readyState >= 4
      ? Promise.resolve()
      : new Promise<void>((ok) => a.addEventListener('canplaythrough', () => ok(), { once: true }));

  async function tocarDe(i: number): Promise<void> {
    if (!audio || !tempos.length) {
      setTimeout(() => !destruido && r.aoFimDoCapitulo(), 0);
      return;
    }
    const a = audio;
    const t = tempos[Math.max(0, Math.min(i, tempos.length - 1))];
    await pronto(a);
    if (a !== audio || destruido) return;
    a.currentTime = t.t0;
    ultima = -1;
    canal?.postMessage({ tocando: true, de: id });
    try {
      await a.play();
    } catch {
      if (a === audio && !destruido) r.aoErro('rede');
      return;
    }
    conferir();
    seguirQuadros();
  }

  function pausar() {
    pararQuadros();
    audio?.pause();
  }

  async function retomar(): Promise<void> {
    if (!audio) return;
    canal?.postMessage({ tocando: true, de: id });
    try {
      await audio.play();
      seguirQuadros();
    } catch {
      r.aoErro('rede');
    }
  }

  function parar() {
    pausar();
    ultima = -1;
  }

  function aplicarVelocidade() {
    if (!audio) return;
    audio.playbackRate = velocidade;
    audio.preservesPitch = true;
  }

  function definirVelocidade(v: number) {
    velocidade = Math.min(VELOCIDADE.max, Math.max(VELOCIDADE.min, Number.isFinite(v) ? v : 1));
    aplicarVelocidade();
  }

  function precarregar(url: string) {
    if (proximo?.src === url) return;
    soltar(proximo);
    proximo = criarAudio();
    proximo.preload = 'auto';
    proximo.src = url;
  }

  function destruir() {
    destruido = true;
    pararQuadros();
    soltar(audio);
    soltar(proximo);
    audio = null;
    proximo = null;
    if (canal) {
      canal.onmessage = null;
      canal.close();
    }
  }

  return r;
}
