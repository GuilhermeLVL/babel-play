/**
 * "GUARDAR O ÁUDIO DESTE CARTÃO" (openspec `cartao-com-audio-do-trecho`, tarefa 4.2): para o cartão antigo, que nasceu
 * sem clipe, corta o trecho da fala da gravação da sessão e guarda no aparelho, igual ao clipe da captura.
 *
 * Só quando a pessoa pede (o download da sessão inteira é o custo: `lib/audioDaSessao`, que divide o arquivo com as outras
 * telas e o devolve ao acabar). SÓ LOCAL: o clipe vai para o mesmo armazém por conta de `armazem.ts` (IndexedDB),
 * sem chave de armazenamento nova, e nada sobe ao servidor. Nunca lança.
 */
import { liberar, urlDeAudio } from '../../audioDaSessao';
import { audioDoCartaoAtivo, guardarClipeDoCartao } from './index';

export type ResultadoDoClipeDaSessao =
  /** Guardou. */
  | 'guardou'
  /** A sessão não tem áudio (ou a fala não tem tempo): nada a guardar. */
  | 'sem-audio'
  /** Flag desligada ou "Não guardar" escolhido. */
  | 'desligado'
  /** Não deu (download, decodificação, trecho curto demais, sem IndexedDB). */
  | 'falhou';

/** O que o corte precisa da cena do cartão. */
export interface TrechoDaSessao {
  sessionId: string;
  temAudio: boolean;
  inicioMs: number | null;
  fimMs: number | null;
}

export interface PcmDecodificado {
  pcm: Float32Array;
  sr: number;
}

/** As pontas que tocam o mundo (rede e decodificador): trocáveis nos testes. */
export interface DependenciasDoClipeDaSessao {
  baixar: (sessionId: string) => Promise<ArrayBuffer>;
  decodificar: (bytes: ArrayBuffer) => Promise<PcmDecodificado>;
}

/** O trecho `[inicioMs, fimMs)` do PCM da sessão, ou `null` se o intervalo não cai dentro do áudio. */
export function cortarDaSessao(pcm: Float32Array, sr: number, inicioMs: number, fimMs: number): Float32Array | null {
  if (!(sr > 0) || !(fimMs > inicioMs) || inicioMs < 0) return null;
  const de = Math.round((inicioMs * sr) / 1000);
  const ate = Math.min(pcm.length, Math.round((fimMs * sr) / 1000));
  if (de >= pcm.length || ate <= de) return null;
  return pcm.slice(de, ate);
}

async function baixarDaSessao(sessionId: string): Promise<ArrayBuffer> {
  const pedido = urlDeAudio(sessionId);
  try {
    const res = await fetch(await pedido);
    return await res.arrayBuffer();
  } finally {
    liberar(sessionId, pedido);
  }
}

async function decodificarNoNavegador(bytes: ArrayBuffer): Promise<PcmDecodificado> {
  const Ctx =
    window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) throw new Error('sem AudioContext');
  const ctx = new Ctx();
  try {
    const audio = await ctx.decodeAudioData(bytes);
    const canais = audio.numberOfChannels;
    const mono = new Float32Array(audio.length);
    for (let c = 0; c < canais; c++) {
      const dados = audio.getChannelData(c);
      for (let i = 0; i < mono.length; i++) mono[i] += dados[i] / canais;
    }
    return { pcm: mono, sr: audio.sampleRate };
  } finally {
    void ctx.close().catch(() => undefined);
  }
}

export async function guardarClipeDaSessao(
  cartaoId: string,
  trecho: TrechoDaSessao,
  deps: DependenciasDoClipeDaSessao = { baixar: baixarDaSessao, decodificar: decodificarNoNavegador },
): Promise<ResultadoDoClipeDaSessao> {
  if (!audioDoCartaoAtivo()) return 'desligado';
  if (!cartaoId || !trecho.temAudio || trecho.inicioMs === null || trecho.fimMs === null) return 'sem-audio';
  if (trecho.fimMs <= trecho.inicioMs) return 'sem-audio';
  try {
    const { pcm, sr } = await deps.decodificar(await deps.baixar(trecho.sessionId));
    const corte = cortarDaSessao(pcm, sr, trecho.inicioMs, trecho.fimMs);
    if (!corte) return 'falhou';
    return (await guardarClipeDoCartao(cartaoId, corte, sr)) ? 'guardou' : 'falhou';
  } catch {
    return 'falhou';
  }
}
