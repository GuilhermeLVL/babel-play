/**
 * O ÁUDIO REAL DE CADA FALA, para "Ouvir" onde não há voz de leitura.
 *
 * O navegador do Meta Quest não tem `speechSynthesis` (medido em 01/10/2026): o botão "Ouvir" sumia
 * lá. A decisão do dono foi repetir a voz ORIGINAL: o trecho que o detector de fala recortou fica
 * guardado por id da fala, e tocar de novo não custa nada nem depende de idioma. Não pronuncia
 * palavra solta nem a tradução; isso seria voz sintetizada.
 *
 * Só guarda quando ligado (`ligarAudioDasFalas`, que a captura liga no Quest): computador e celular têm
 * voz de leitura e não gastam memória com isto. Em 16 bits, com teto: as falas mais antigas saem.
 *
 * ECO: o som tocado volta pelo "som do headset" e seria transcrito de novo. Enquanto toca, vale o
 * mesmo guarda da voz de leitura (`marcarFalaExterna` em `lib/tts.ts`), que o pipeline já respeita.
 */
import { encodeWav } from '../../gateway/audio/wav';
import { marcarFalaExterna } from '../tts';

/** No máximo estas falas guardadas… */
export const MAXIMO_DE_FALAS = 60;
/** …e no máximo estes bytes (16 kHz em 16 bits: ~32 KB por segundo de fala). */
export const MAXIMO_DE_BYTES = 20 * 1024 * 1024;

interface AudioGuardado {
  pcm: Int16Array;
  sr: number;
}

const guardados = new Map<string, AudioGuardado>();
let bytes = 0;
let ligado = false;
let tocando: { audio: HTMLAudioElement; url: string; fimDoEco: () => void } | null = null;

export function ligarAudioDasFalas(sim: boolean): void {
  ligado = sim;
  if (!sim) limparAudioDasFalas();
}

export function guardarAudioDaFala(id: string, pcm: Float32Array, sr: number): void {
  if (!ligado || !id || !pcm.length) return;
  const anterior = guardados.get(id);
  if (anterior) {
    bytes -= anterior.pcm.byteLength;
    guardados.delete(id);
  }
  const curto = new Int16Array(pcm.length);
  for (let i = 0; i < pcm.length; i++) {
    const v = Math.max(-1, Math.min(1, pcm[i]));
    curto[i] = v < 0 ? v * 0x8000 : v * 0x7fff;
  }
  guardados.set(id, { pcm: curto, sr });
  bytes += curto.byteLength;
  // O `Map` guarda a ordem de entrada: a primeira chave é a fala mais antiga.
  while (guardados.size > 1 && (guardados.size > MAXIMO_DE_FALAS || bytes > MAXIMO_DE_BYTES)) {
    const maisAntiga = guardados.keys().next().value as string;
    bytes -= guardados.get(maisAntiga)!.pcm.byteLength;
    guardados.delete(maisAntiga);
  }
}

export const temAudioDaFala = (id: string): boolean => guardados.has(id);

/** Quantas falas e quantos bytes estão guardados (para os testes e o diagnóstico). */
export const estadoDoAudioDasFalas = (): { falas: number; bytes: number } => ({ falas: guardados.size, bytes });

export function pararAudioDasFalas(): void {
  if (!tocando) return;
  const { audio, url, fimDoEco } = tocando;
  tocando = null;
  try {
    audio.pause();
  } catch {
    /* já parado */
  }
  URL.revokeObjectURL(url);
  fimDoEco();
}

/**
 * Toca de novo a fala. `lenta` = 70% do ritmo (o elemento de áudio preserva o tom). Devolve `false`
 * quando não há áudio guardado dela (fala antiga já descartada, ou vinda do reconhecimento do navegador).
 */
export function tocarAudioDaFala(id: string, opcoes: { lenta?: boolean } = {}): boolean {
  const guardado = guardados.get(id);
  if (!guardado || typeof Audio === 'undefined') return false;
  pararAudioDasFalas();
  const flutuante = new Float32Array(guardado.pcm.length);
  for (let i = 0; i < flutuante.length; i++) flutuante[i] = guardado.pcm[i] / 0x8000;
  const url = URL.createObjectURL(encodeWav(flutuante, guardado.sr));
  const audio = new Audio(url);
  audio.playbackRate = opcoes.lenta ? 0.7 : 1;
  const esta = { audio, url, fimDoEco: marcarFalaExterna() };
  tocando = esta;
  const terminar = () => {
    if (tocando === esta) pararAudioDasFalas();
  };
  audio.onended = terminar;
  audio.onerror = terminar;
  void audio.play().catch(terminar);
  return true;
}

export function limparAudioDasFalas(): void {
  pararAudioDasFalas();
  guardados.clear();
  bytes = 0;
}
