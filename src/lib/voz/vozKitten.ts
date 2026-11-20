/**
 * A VOZ NATURAL NO APARELHO (Kitten TTS 2, openspec `voz-natural-no-aparelho-kitten`) — o lado LEVE, estático: o portão,
 * a variante (mini no computador, pico no celular), o estado do download por idioma, a escolha da voz e QUEM LÊ em voz
 * alta. O motor (worker, `onnxruntime-web`, tocador) só chega por `import()`, com a flag `voz_kitten` ligada e o endereço
 * dos pesos configurado (`VITE_VOZ_KITTEN_URL`).
 *
 *  · A ESCOLHA é a preferência de voz do idioma: `@kitten` (explícita) ou a "Automática" com o modelo do idioma pronto.
 *    Uma voz do sistema escolhida pela pessoa, a nuvem ou a Supertonic escolhida vencem.
 *  · O MODELO de cada idioma fica no OPFS (o worker confere o sha256); aqui só a marca de que terminou, por variante.
 *  · Com a flag ligada, sem a voz natural e sem voz do sistema ACEITA (nem efeito nem robótica), o texto fica na tela.
 */
import {
  confirmarDownloadDoKitten,
  type DecisaoDoKitten,
  type EntradaDoKitten,
  type EscolhaDeQuemLe,
  FLAG_VOZ_KITTEN,
  mbDoDownload,
  ofertaDoKitten,
  type QuemLe,
  quemLeEmVozAlta,
} from '../../core/harness/vozKitten';
import type { IdiomaDeVoz } from '../../core/leitura/prepararTextoParaVoz';
import { idiomaDoKitten, REVISAO_DO_KITTEN, type VarianteDoKitten, vozDoKitten } from '../../core/voz/kitten';
import { haVozAceita } from '../../core/voz/vozesUteis';
import { FLAG_VOZ_NATURAL } from '../../core/vozNatural';
import { registrarMotorDeVoz } from '../../gateway/registroDeMotoresDeVoz';
import { perfilDoDispositivo } from '../dispositivo/perfil';
import { getEntitlements } from '../entitlements';
import { flagLigada } from '../flagsCache';
import { getVoicePrefs, getVoices, type TtsEngine, vozesCarregadas } from '../tts';
import { opfsConhecido, opfsUtilizavel } from './opfsUtilizavel';
import { VOZ_NO_APARELHO, vozNoAparelhoLe } from './vozNoAparelho';

/** A escolha "Voz natural (no aparelho)" na preferência de voz. O `@` não existe em voz do sistema. */
export const VOZ_KITTEN = '@kitten';

const CHAVE_DO_MODELO = (v: VarianteDoKitten, idioma: IdiomaDeVoz) => `frasy.vozKitten.${v}.${idioma}`;
const CHAVE_DA_VOZ = (idioma: IdiomaDeVoz) => `frasy.vozKitten.voz.${idioma}`;
/** Ao parar: soltar o worker na hora em pouca memória, 20 s depois no resto (como a Supertonic). */
const SOLTAR_APOS_MS = 20_000;

const ler = (k: string): string | null => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const gravar = (k: string, v: string | null) => {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {
    /* sem armazenamento: vale até recarregar */
  }
};

/** A raiz pública dos pesos (`VITE_VOZ_KITTEN_URL`), só http(s), sem barra final; `null` sem ela. */
export function raizDoKitten(): string | null {
  const v = (import.meta.env?.VITE_VOZ_KITTEN_URL as string | undefined)?.trim();
  if (!v) return null;
  try {
    const u = new URL(v);
    return u.protocol === 'https:' || u.protocol === 'http:' ? v.replace(/\/+$/, '') : null;
  } catch {
    return null;
  }
}

const ehIos = (ua: string, toques: number) => /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && toques > 1);

function entrada(): EntradaDoKitten {
  const p = perfilDoDispositivo();
  const nav = typeof navigator !== 'undefined' ? navigator : undefined;
  return {
    flagLigada: flagLigada(FLAG_VOZ_KITTEN),
    tipo: p.tipo,
    ios: ehIos(p.sinais.userAgent, p.sinais.toques),
    memoriaGb: p.sinais.memoriaGb,
    webGpu: p.sinais.webGpu,
    wasm: typeof WebAssembly !== 'undefined',
    isolado: p.sinais.isolado,
    armazenamento: typeof nav?.storage?.getDirectory === 'function' ? opfsConhecido() : false,
    confirmarAcimaDeMb: p.confirmarDownloadAcimaDeMb,
  };
}

export const decisaoDoKitten = (): DecisaoDoKitten => ofertaDoKitten(entrada());

/** A opção aparece? Sem a raiz dos pesos, nunca. */
export const kittenOferecido = (): boolean => raizDoKitten() !== null && decisaoDoKitten().oferecida;

/** Pergunta ao OPFS (uma vez por sessão) se ele funciona. Só com a flag e a raiz. Nunca lança. */
export async function verificarArmazenamentoDoKitten(): Promise<void> {
  if (raizDoKitten() === null || !flagLigada(FLAG_VOZ_KITTEN)) return;
  await opfsUtilizavel();
  avisar();
}

/** O modelo do idioma (na variante deste aparelho) já está aqui, conferido? */
export function modeloKittenPronto(idioma: string): boolean {
  const base = idiomaDoKitten(idioma);
  if (!base) return false;
  const v = decisaoDoKitten().variante;
  return ler(CHAVE_DO_MODELO(v, base)) === REVISAO_DO_KITTEN[v];
}

/** O tamanho do download do idioma neste aparelho (MB) e se pede confirmação (acima do teto do perfil). */
export function downloadDoKitten(idioma: IdiomaDeVoz): { mb: number; confirmar: boolean } {
  /* O que outro idioma já trouxe (no mini, o modelo inteiro) não conta de novo. */
  const prontos = (['pt', 'en', 'es'] as const).filter((i) => i !== idioma && modeloKittenPronto(i));
  const mb = mbDoDownload(decisaoDoKitten().variante, idioma, prontos);
  return { mb, confirmar: confirmarDownloadDoKitten(perfilDoDispositivo().confirmarDownloadAcimaDeMb, mb) };
}

/** A escolha guardada para o idioma, classificada. */
function escolha(idioma: string): EscolhaDeQuemLe {
  const guardada = getVoicePrefs()[idiomaDoKitten(idioma) ?? (idioma || '').toLowerCase().split(/[-_]/)[0]] ?? '';
  if (guardada === VOZ_KITTEN) return 'kitten';
  if (guardada === VOZ_NO_APARELHO) return 'no-aparelho';
  if (guardada === '@nuvem')
    return getEntitlements().vozNatural && flagLigada(FLAG_VOZ_NATURAL) ? 'nuvem' : 'automatica';
  if (!guardada) return 'automatica';
  const vozes = getVoices();
  return !vozes.length || vozes.some((v) => v.name === guardada) ? 'sistema' : 'automatica';
}

function vozDoSistemaAceita(idioma: string): boolean | 'desconhecido' {
  if (!vozesCarregadas()) return 'desconhecido';
  return haVozAceita(
    getVoices().map((v) => ({ name: v.name, lang: v.lang, local: v.localService })),
    idioma,
  );
}

/**
 * QUEM LÊ este idioma agora. Sem a flag `voz_kitten` (ou sem a raiz dos pesos), o comportamento de antes: a Supertonic
 * quando ela lê, senão a voz do sistema (como sempre, sem o corte da voz robótica).
 */
export function quemLe(idioma: string): QuemLe {
  const supertonic = vozNoAparelhoLe(idioma);
  if (raizDoKitten() === null || !flagLigada(FLAG_VOZ_KITTEN)) return supertonic ? 'supertonic' : 'sistema';
  return quemLeEmVozAlta({
    kittenPronto: kittenOferecido() && modeloKittenPronto(idioma),
    supertonicLe: supertonic,
    escolha: escolha(idioma),
    vozDoSistemaAceita: vozDoSistemaAceita(idioma),
  });
}

/** O Kitten lê este idioma agora? */
export const kittenLe = (idioma: string): boolean => quemLe(idioma) === 'kitten';

/** A voz do Kitten escolhida para o idioma (chave), ou a padrão da variante. */
export function vozDoKittenNoIdioma(idioma: IdiomaDeVoz): string {
  return vozDoKitten(decisaoDoKitten().variante, idioma, ler(CHAVE_DA_VOZ(idioma))).chave;
}
export function definirVozDoKitten(idioma: IdiomaDeVoz, chave: string): void {
  gravar(CHAVE_DA_VOZ(idioma), chave);
  avisar();
}

/* ───────── estado do download (para a tela) ───────── */

export interface EstadoDoKitten {
  fase: 'livre' | 'baixando' | 'erro';
  idioma: IdiomaDeVoz | null;
  recebidos: number;
  total: number;
}

let estado: EstadoDoKitten = { fase: 'livre', idioma: null, recebidos: 0, total: 0 };
const ouvintes = new Set<() => void>();
const avisar = () => ouvintes.forEach((f) => f());
const mudar = (e: Partial<EstadoDoKitten>) => {
  estado = { ...estado, ...e };
  avisar();
};

export const estadoDoKitten = (): EstadoDoKitten => estado;
export function aoMudarKitten(f: () => void): () => void {
  ouvintes.add(f);
  return () => ouvintes.delete(f);
}

/* ───────── o motor, tardio ───────── */

type Modulo = typeof import('../../gateway/adapters/kittenLocal');
type Adaptador = ReturnType<Modulo['adaptadorDoKitten']>;
let modulo: Promise<{ m: Modulo; adaptador: Adaptador }> | null = null;
let contexto: AudioContext | null = null;

function contextoDoKitten(): AudioContext {
  contexto ??= new AudioContext();
  return contexto;
}

/** Destrava o áudio no toque da pessoa (o Safari só toca áudio liberado num gesto). */
export function destravarKitten(): void {
  if (!kittenOferecido()) return;
  try {
    void contextoDoKitten()
      .resume()
      .catch(() => undefined);
  } catch {
    /* sem Web Audio: a reserva lê */
  }
}

function carregarModulo(): Promise<{ m: Modulo; adaptador: Adaptador }> {
  if (!kittenOferecido()) return Promise.reject(new Error('voz natural no aparelho indisponível'));
  modulo ??= import('../../gateway/adapters/kittenLocal').then((m) => {
    const d = decisaoDoKitten();
    const adaptador = m.adaptadorDoKitten({
      variante: d.variante,
      threads: d.threadsWasm,
      webgpu: d.backend === 'webgpu',
      pronto: kittenLe,
      vozDoIdioma: vozDoKittenNoIdioma,
      contexto: contextoDoKitten,
      soltarAposMs: perfilDoDispositivo().poucaMemoria ? 0 : SOLTAR_APOS_MS,
    });
    return { m, adaptador };
  });
  return modulo;
}

/**
 * Importa o motor e o registra como `neural-local` na porta (o Narrador da leitura o usa por ali). A Supertonic,
 * quando lê, registra a dela por cima (`vozNoAparelho.carregarMotor`).
 */
export async function carregarMotorKitten(): Promise<Modulo> {
  const { m, adaptador } = await carregarModulo();
  registrarMotorDeVoz(adaptador);
  return m;
}

/** O motor do Kitten pronto para falar (para a fala global e a amostra da tela), ou `null`. */
export async function motorDoKitten(): Promise<TtsEngine | null> {
  if (!kittenOferecido()) return null;
  const { adaptador } = await carregarModulo();
  return adaptador.motor();
}

let download: AbortController | null = null;

/** Baixa o modelo do idioma (só no toque da pessoa). `true` se ficou pronto. */
export async function baixarVozKitten(idioma: IdiomaDeVoz): Promise<boolean> {
  const raiz = raizDoKitten();
  if (!raiz || download || !kittenOferecido()) return false;
  const ctl = new AbortController();
  download = ctl;
  const v = decisaoDoKitten().variante;
  mudar({ fase: 'baixando', idioma, recebidos: 0, total: 0 });
  try {
    const { m } = await carregarModulo();
    await m.baixarKitten(raiz, v, idioma, (recebidos, total) => mudar({ recebidos, total }), ctl.signal);
    gravar(CHAVE_DO_MODELO(v, idioma), REVISAO_DO_KITTEN[v]);
    void navigator.storage?.persist?.().catch(() => false);
    mudar({ fase: 'livre', idioma: null });
    return true;
  } catch {
    mudar({ fase: ctl.signal.aborted ? 'livre' : 'erro' });
    return false;
  } finally {
    download = null;
  }
}

export function cancelarDownloadDoKitten(): void {
  download?.abort();
}

/** Apaga os modelos do aparelho (OPFS) e solta o worker. A escolha guardada fica, mas passa a valer a automática. */
export async function apagarVozKitten(): Promise<void> {
  cancelarDownloadDoKitten();
  const { m, adaptador } = await carregarModulo();
  adaptador.cliente.liberar();
  const v = decisaoDoKitten().variante;
  await m.apagarKitten(v);
  for (const i of ['pt', 'en', 'es'] as const) gravar(CHAVE_DO_MODELO(v, i), null);
  mudar({ fase: 'livre', idioma: null, recebidos: 0, total: 0 });
}
