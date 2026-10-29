/**
 * A AMPLITUDE DA VOZ DA NUVEM: um `AnalyserNode` no `HTMLAudioElement` compartilhado da voz natural (`voz/elementoDaVoz.ts`, o de `vozDaNuvem.ts`).
 *
 * CUIDADOS (leia antes de mexer):
 *  · `createMediaElementSource` só pode ser chamado UMA vez por elemento (a segunda lança `InvalidStateError`) e,
 *    depois dele, o som do elemento passa a sair PELO grafo de áudio. Se o `AudioContext` estiver suspenso, o
 *    áudio fica MUDO. Por isso: (1) o grafo é guardado por elemento num `WeakMap`; (2) o contexto só é ligado
 *    ao elemento depois de `resume()` confirmar `running`; (3) a fonte vai direto ao `destination` E ao analisador
 *    (o analisador não fica no caminho do som); (4) se o contexto voltar a suspender (iOS "interrupted"), tenta
 *    `resume()` de novo.
 *  · O guarda de eco do microfone (`isTtsActive`/`marcarFalaExterna` em `tts.ts`) NÃO é tocado: continua sendo
 *    do `vozDaNuvem`, que marca a fala quando o áudio começa.
 *  · Áudio de outra origem sem CORS (`crossorigin`) faz o analisador devolver silêncio exato. O `blob:` da voz da
 *    nuvem é da mesma origem, mas quem usa isto deve tratar "zero para sempre" como "sem sinal" e cair na
 *    cadência (é o que `fala.ts` faz).
 *
 * Chame `prepararAnalisadorDaVoz()` DENTRO de um gesto (junto de `destravarVozDaNuvem`); sem isso a fonte
 * existe mas `amplitude()` devolve `null` e a boca anda pela cadência do relógio do áudio.
 */
import { rmsDeBytes } from '../../core/avatar/boca';
import { elemento as criarElemento, elementoDeAudioDaVoz } from '../voz/elementoDaVoz';

/** O que `fala.ts` precisa de uma voz em áudio. */
export interface FonteDeAudio {
  /** RMS 0..1 agora, ou `null` quando não há analisador (a cadência assume). */
  amplitude(): number | null;
  /** Duração do áudio em ms, quando o navegador já a conhece. */
  duracaoMs(): number | undefined;
  /** Posição de reprodução em ms (relógio do próprio áudio: segue pausa, buffering e fim). */
  tempoMs(): number | undefined;
}

interface Grafo {
  analisador: AnalyserNode;
  buffer: Uint8Array<ArrayBuffer>;
  ctx: AudioContext;
}

/** Eventos de gesto que valem para o navegador retomar o áudio (iOS/Safari só retomam dentro de um). */
const EVENTOS_DE_GESTO = ['pointerdown', 'touchend', 'keydown', 'click'] as const;

const grafos = new WeakMap<object, Grafo>();
const tentativas = new WeakMap<object, Promise<boolean>>();

type FabricaDeContexto = () => AudioContext | null;

/**
 * iPhone/iPad (qualquer navegador: todos usam WebKit): o sistema INTERROMPE o `AudioContext` (ligação, Siri, app em
 * segundo plano) e, com o elemento já preso ao grafo, a voz some até um gesto retomar. O som da tradução vale mais que
 * a boca sincronizada, então ali o analisador NÃO é ligado e a boca anda pela cadência.
 */
export function ehWebKitDeToque(nav: Pick<Navigator, 'userAgent' | 'maxTouchPoints'> | undefined = globalThis.navigator): boolean {
  if (!nav) return false;
  if (/iPhone|iPad|iPod/.test(nav.userAgent)) return true;
  // iPadOS se apresenta como Mac, mas tem toque.
  return /Macintosh/.test(nav.userAgent) && (nav.maxTouchPoints ?? 0) > 1;
}

/**
 * Contexto que saiu de `running` (`suspended` ou `interrupted` no Safari) com a voz tocando: tenta retomar na hora e,
 * se o navegador exigir um gesto, na PRÓXIMA interação ou quando a aba voltar a ficar visível. Nunca lança.
 */
function retomarQuandoPuder(ctx: AudioContext, alvo: EventTarget = document): () => void {
  let solto = false;
  const tentar = () => {
    if ((ctx.state as string) === 'running') return desligar();
    void ctx
      .resume()
      .then(() => {
        if ((ctx.state as string) === 'running') desligar();
      })
      .catch(() => undefined);
  };
  const aoVoltar = () => {
    if (!document.hidden) tentar();
  };
  function desligar() {
    if (solto) return;
    solto = true;
    for (const e of EVENTOS_DE_GESTO) alvo.removeEventListener(e, tentar, true);
    document.removeEventListener('visibilitychange', aoVoltar);
  }
  for (const e of EVENTOS_DE_GESTO) alvo.addEventListener(e, tentar, { capture: true, passive: true });
  document.addEventListener('visibilitychange', aoVoltar);
  tentar();
  return desligar;
}

const contextoPadrao: FabricaDeContexto = () => {
  const C =
    typeof window === 'undefined'
      ? undefined
      : (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
  return C ? new C() : null;
};

/**
 * Liga o analisador ao elemento (uma vez). Devolve `true` se há analisador ativo. Nunca lança; em qualquer dúvida
 * (sem Web Audio, contexto que não roda, fonte já criada por outro código) NÃO mexe no som e devolve `false`.
 */
export function prepararAnalisadorDaVoz(
  elemento: HTMLMediaElement | null = criarElemento(),
  fabrica: FabricaDeContexto = contextoPadrao,
  ios: boolean = ehWebKitDeToque(),
): Promise<boolean> {
  if (!elemento || ios) return Promise.resolve(false);
  if (grafos.has(elemento)) return Promise.resolve(true);
  const em = tentativas.get(elemento);
  if (em) return em;
  const p = (async () => {
    try {
      const ctx = fabrica();
      if (!ctx) return false;
      if (ctx.state !== 'running') await ctx.resume();
      // Contexto que não roda ligaria o elemento a um grafo mudo: melhor ficar sem analisador.
      if ((ctx.state as string) !== 'running') {
        void ctx.close?.();
        return false;
      }
      const fonte = ctx.createMediaElementSource(elemento);
      const analisador = ctx.createAnalyser();
      analisador.fftSize = 256;
      analisador.smoothingTimeConstant = 0;
      fonte.connect(ctx.destination);
      fonte.connect(analisador);
      let soltarRetomada: (() => void) | null = null;
      ctx.addEventListener?.('statechange', () => {
        if ((ctx.state as string) === 'running') {
          soltarRetomada?.();
          soltarRetomada = null;
        } else if (!soltarRetomada) soltarRetomada = retomarQuandoPuder(ctx);
      });
      grafos.set(elemento, { analisador, buffer: new Uint8Array(analisador.fftSize), ctx });
      return true;
    } catch {
      return false;
    }
  })();
  tentativas.set(elemento, p);
  // Falha não fica guardada para sempre: a próxima chamada (outro gesto) tenta de novo.
  void p.then((ok) => {
    if (!ok) tentativas.delete(elemento);
  });
  return p;
}

/** A fonte de áudio do elemento (`null` sem elemento). Funciona sem analisador: só a amplitude vira `null`. */
export function fonteDeAudioDaVoz(elemento: HTMLMediaElement | null = elementoDeAudioDaVoz()): FonteDeAudio | null {
  if (!elemento) return null;
  return {
    amplitude() {
      const g = grafos.get(elemento);
      // Contexto parado (suspenso/interrompido): não há medida confiável, a boca cai na cadência.
      if (!g || (g.ctx.state as string) !== 'running') return null;
      g.analisador.getByteTimeDomainData(g.buffer);
      return rmsDeBytes(g.buffer);
    },
    duracaoMs() {
      const d = elemento.duration;
      return Number.isFinite(d) && d > 0 ? d * 1000 : undefined;
    },
    tempoMs() {
      const t = elemento.currentTime;
      return Number.isFinite(t) ? t * 1000 : undefined;
    },
  };
}

/** A voz da nuvem está tocando AGORA no elemento compartilhado? (A reserva do aparelho não usa o elemento.) */
export function audioDaVozTocando(elemento: HTMLMediaElement | null = elementoDeAudioDaVoz()): boolean {
  return !!elemento && !elemento.paused && !elemento.ended && !!elemento.src && !elemento.src.startsWith('data:');
}
