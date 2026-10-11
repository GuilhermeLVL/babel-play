/**
 * A FALA ORIGINAL NA REVISÃO — faz soar a frase do cartão e avisa quando acabou.
 *
 * Dois caminhos, os mesmos de `lib/falante.ts`: o trecho da gravação da sessão quando a cena tem áudio,
 * ou a voz do aparelho (`lib/tts.falar`, a voz do idioma da frase).
 *
 * O CUSTO: o app baixa o áudio INTEIRO da sessão (não há corte no servidor). Por isso o áudio só é
 * pedido aqui, quando a pessoa toca para ouvir, e nunca ao mostrar um cartão. `urlDeAudio` guarda um
 * download por sessão e o divide com as outras telas; este tocador segura cada sessão que pediu até a
 * revisão fechar (`soltar`), então vinte cartões da mesma reunião baixam o áudio uma vez.
 */
import { liberar, urlDeAudio } from '../audioDaSessao';
import { cancelSpeech, falar } from '../tts';
import { haVozPara } from '../voz/haVoz';
import type { CenaDoCartao } from './cena';

export interface Tocador {
  /** A fala gravada da cena (ou a voz do aparelho, se o áudio falhar). Resolve quando acaba. */
  original(cena: CenaDoCartao, idioma: string, velocidade?: number): Promise<void>;
  /** A voz do aparelho lendo o texto. Resolve quando acaba (ou em silêncio, sem voz para o idioma). */
  voz(texto: string, idioma: string, velocidade?: number): Promise<void>;
  parar(): void;
  /** Devolve os áudios pedidos (ao sair da revisão). */
  soltar(): void;
}

/** O teto de espera de uma fala: um som que não avisa o fim não prende a tela. */
const tetoDaVoz = (texto: string, velocidade: number): number =>
  Math.min(12_000, 1500 + texto.length * 110) / Math.max(0.4, velocidade);

export function criarTocador(): Tocador {
  const pedidos = new Map<string, Promise<string>>();
  let audio: HTMLAudioElement | null = null;
  let vez = 0;
  let pararEm = 0;
  /** Quem espera o fim do trecho: parar no meio também é um fim. */
  let acabar: (() => void) | null = null;

  const parar = () => {
    vez++;
    window.clearTimeout(pararEm);
    acabar?.();
    acabar = null;
    audio?.pause();
    cancelSpeech();
  };

  const voz = (texto: string, idioma: string, velocidade = 1): Promise<void> => {
    parar();
    if (!texto.trim() || !haVozPara(idioma)) return Promise.resolve();
    return new Promise<void>((ok) => {
      const fim = window.setTimeout(ok, tetoDaVoz(texto, velocidade));
      const acabou = () => {
        window.clearTimeout(fim);
        ok();
      };
      if (!falar(texto, idioma, { rate: velocidade * 0.95, onEnd: acabou, onError: acabou })) acabou();
    });
  };

  const original = async (cena: CenaDoCartao, idioma: string, velocidade = 1): Promise<void> => {
    if (!cena.temAudio || cena.inicioMs === null || cena.fimMs === null || cena.fimMs <= cena.inicioMs)
      return voz(cena.frase, idioma, velocidade);
    parar();
    const minha = vez;
    let url: string;
    try {
      let p = pedidos.get(cena.sessionId);
      if (!p) {
        p = urlDeAudio(cena.sessionId);
        pedidos.set(cena.sessionId, p);
        p.catch(() => pedidos.delete(cena.sessionId));
      }
      url = await p;
    } catch {
      return minha === vez ? voz(cena.frase, idioma, velocidade) : undefined;
    }
    if (minha !== vez) return;
    const a = (audio ??= new Audio());
    const inicio = cena.inicioMs / 1000;
    const duracao = Math.max(300, cena.fimMs - cena.inicioMs) / velocidade;
    try {
      if (a.src !== url) {
        a.src = url;
        await new Promise<void>((ok, falha) => {
          a.addEventListener('loadedmetadata', () => ok(), { once: true });
          a.addEventListener('error', () => falha(new Error('áudio')), { once: true });
        });
      }
      if (minha !== vez) return;
      a.currentTime = inicio;
      a.playbackRate = velocidade;
      (a as HTMLAudioElement & { preservesPitch?: boolean }).preservesPitch = true;
      await a.play();
    } catch {
      return minha === vez ? voz(cena.frase, idioma, velocidade) : undefined;
    }
    await new Promise<void>((ok) => {
      acabar = ok;
      pararEm = window.setTimeout(() => {
        if (minha === vez) a.pause();
        acabar = null;
        ok();
      }, duracao + 120);
    });
  };

  return {
    original,
    voz,
    parar,
    soltar() {
      parar();
      for (const [sessao, p] of pedidos) liberar(sessao, p);
      pedidos.clear();
      audio = null;
    },
  };
}
