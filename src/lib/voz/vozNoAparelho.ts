/**
 * A VOZ NO APARELHO (Supertonic 3, openspec `voz-no-aparelho`) — o lado LEVE, estático: o portão, o estado do download e
 * a escolha. O motor (worker, `onnxruntime-web`, tocador) só chega por `import()` em `carregarMotor()`, e só com a flag
 * `voz_no_aparelho` ligada, o perfil permitindo e o endereço dos pesos configurado (`VITE_VOZ_MODELO_URL`).
 *
 *  · A ESCOLHA é a preferência de voz do idioma (`@no-aparelho`, como `@nuvem`): vale onde o motor serve (pt, en, es),
 *    com o modelo neste aparelho. Noutro aparelho da mesma conta, `vozEmUso` responde "automática".
 *  · O MODELO no aparelho: os arquivos e o sha256 ficam no OPFS (o worker confere); aqui só a marca de que terminou.
 *  · A VOZ DO NARRADOR (padrão F1) e a do elenco: `vozDoNarradorNoAparelho()`.
 */
import {
  convidarParaVozNoAparelho,
  type DecisaoDaVozNoAparelho,
  type EntradaDaVozDaLeitura,
  type EntradaDaVozNoAparelho,
  type EscolhaDaVoz,
  FLAG_VOZ_NO_APARELHO,
  ofertaDaVozNoAparelho,
  supertonicLe,
} from '../../core/harness/vozNoAparelho';
import {
  ehVozDoSupertonic,
  idiomaDoSupertonic,
  REVISAO_DO_SUPERTONIC,
  VOZ_PADRAO_DO_NARRADOR,
  type VozDoSupertonic,
} from '../../core/voz/supertonic';
import { FLAG_VOZ_NATURAL } from '../../core/vozNatural';
import { motorDeVozRegistrado, registrarMotorDeVoz } from '../../gateway/registroDeMotoresDeVoz';
import { perfilDoDispositivo } from '../dispositivo/perfil';
import { getEntitlements } from '../entitlements';
import { flagLigada } from '../flagsCache';
import { perfilProtegido } from '../protecaoDoMenor';
import { getVoicePrefs, getVoices, type TtsEngine } from '../tts';

/** A escolha "Voz de alta qualidade (no aparelho)" na preferência de voz. O `@` não existe em voz do sistema. */
export const VOZ_NO_APARELHO = '@no-aparelho';

const CHAVE_DO_MODELO = 'frasy.vozNoAparelho.modelo';
const CHAVE_DO_NARRADOR = 'frasy.vozNoAparelho.narrador';
/** Ao parar a narração: soltar o worker na hora em pouca memória, 20 s depois no resto (como os modelos da captura). */
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

/** A raiz pública dos pesos (`VITE_VOZ_MODELO_URL`), só http(s), sem barra final; `null` sem ela. */
export function raizDoModelo(): string | null {
  const v = (import.meta.env?.VITE_VOZ_MODELO_URL as string | undefined)?.trim();
  if (!v) return null;
  try {
    const u = new URL(v);
    return u.protocol === 'https:' || u.protocol === 'http:' ? v.replace(/\/+$/, '') : null;
  } catch {
    return null;
  }
}

const ehIos = (ua: string, toques: number) => /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && toques > 1);

/** O portão agora: a flag, o perfil de quem lê e o do aparelho. */
export function decisaoDaVozNoAparelho(): DecisaoDaVozNoAparelho {
  return ofertaDaVozNoAparelho(entradaDoPortao());
}

function entradaDoPortao(): EntradaDaVozNoAparelho {
  const p = perfilDoDispositivo();
  const nav = typeof navigator !== 'undefined' ? navigator : undefined;
  return {
    flagLigada: flagLigada(FLAG_VOZ_NO_APARELHO),
    perfilProtegido: perfilProtegido(),
    tipo: p.tipo,
    poucaMemoria: p.poucaMemoria,
    memoriaGb: p.sinais.memoriaGb,
    webGpu: p.sinais.webGpu,
    wasm: typeof WebAssembly !== 'undefined',
    isolado: p.sinais.isolado,
    ios: ehIos(p.sinais.userAgent, p.sinais.toques),
    armazenamento: typeof nav?.storage?.getDirectory === 'function',
  };
}

/** A opção aparece (por padrão ou por escolha)? Sem a raiz dos pesos, nunca. */
export const vozNoAparelhoOferecida = (): boolean =>
  raizDoModelo() !== null && decisaoDaVozNoAparelho().oferta !== 'nao';

export const modeloNoAparelho = (): boolean => ler(CHAVE_DO_MODELO) === REVISAO_DO_SUPERTONIC;

/** Oferecida E com o modelo baixado: pode ler. */
export const vozNoAparelhoUtilizavel = (): boolean => modeloNoAparelho() && vozNoAparelhoOferecida();

/** A pessoa escolheu a voz no aparelho para este idioma, e ela serve aqui agora? */
export function vozNoAparelhoPronta(idioma: string): boolean {
  const base = idiomaDoSupertonic(idioma);
  return !!base && getVoicePrefs()[base] === VOZ_NO_APARELHO && vozNoAparelhoUtilizavel();
}

/* ───────── o primeiro contato: a "Automática" e o convite ───────── */

const CHAVE_DO_CONVITE = 'frasy.vozNoAparelho.conviteRecusadoEm';

/** A escolha guardada para o idioma, classificada (voz do sistema que sumiu, ou nuvem fora do plano, = automática). */
function escolhaDaVoz(idioma: string): EscolhaDaVoz {
  const guardada = getVoicePrefs()[idiomaDoSupertonic(idioma) ?? ''] ?? '';
  if (guardada === VOZ_NO_APARELHO) return 'no-aparelho';
  if (guardada === '@nuvem')
    return getEntitlements().vozNatural && flagLigada(FLAG_VOZ_NATURAL) ? 'nuvem' : 'automatica';
  if (!guardada) return 'automatica';
  /* Antes de o sistema entregar a lista de vozes, não dá para saber se a escolhida sumiu: ela vale. */
  const vozes = getVoices();
  return !vozes.length || vozes.some((v) => v.name === guardada) ? 'sistema' : 'automatica';
}

function entradaDaLeitura(idioma: string): EntradaDaVozDaLeitura {
  return {
    ...entradaDoPortao(),
    idiomaSuportado: !!idiomaDoSupertonic(idioma),
    modeloPronto: modeloNoAparelho(),
    escolha: escolhaDaVoz(idioma),
  };
}

/**
 * A voz no aparelho LÊ este idioma agora? A escolha explícita dela, ou a "Automática" com o modelo já pronto (a melhor
 * voz disponível desde a primeira frase). Uma voz do sistema escolhida pela pessoa sempre vence.
 */
export const vozNoAparelhoLe = (idioma: string): boolean =>
  raizDoModelo() !== null && supertonicLe(entradaDaLeitura(idioma));

const recusadoEm = (): number | null => {
  const n = Number(ler(CHAVE_DO_CONVITE));
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** Mostrar o convite "Quer uma voz mais natural?" na barra do narrador? */
export function conviteDaVozNoAparelho(idioma: string, audioGravado: boolean): boolean {
  if (raizDoModelo() === null) return false;
  return convidarParaVozNoAparelho({
    ...entradaDaLeitura(idioma),
    audioGravado,
    recusadoEm: recusadoEm(),
    agora: Date.now(),
  });
}

/** "Agora não": o convite não volta neste aparelho por 30 dias (a opção segue no seletor). */
export function recusarConviteDaVozNoAparelho(): void {
  gravar(CHAVE_DO_CONVITE, String(Date.now()));
}

/** Carrega as sessões do modelo no worker (a conferência de que ele abre aqui), antes de trocar a voz. */
export async function aquecerVozNoAparelho(): Promise<void> {
  await carregarMotor();
  await (
    motorDeVozRegistrado('neural-local') as { cliente?: { carregar(): Promise<unknown> } } | undefined
  )?.cliente?.carregar();
}

export function vozDoNarradorNoAparelho(): VozDoSupertonic {
  const v = ler(CHAVE_DO_NARRADOR);
  return ehVozDoSupertonic(v) ? v : VOZ_PADRAO_DO_NARRADOR;
}

/* ───────── estado do download (para a tela) ───────── */

export interface EstadoDaVozNoAparelho {
  fase: 'livre' | 'baixando' | 'erro';
  recebidos: number;
  total: number;
}

let estado: EstadoDaVozNoAparelho = { fase: 'livre', recebidos: 0, total: 0 };
const ouvintes = new Set<() => void>();
const avisar = () => ouvintes.forEach((f) => f());
const mudar = (e: Partial<EstadoDaVozNoAparelho>) => {
  estado = { ...estado, ...e };
  avisar();
};

export const estadoDaVozNoAparelho = (): EstadoDaVozNoAparelho => estado;
export function aoMudarVozNoAparelho(f: () => void): () => void {
  ouvintes.add(f);
  return () => ouvintes.delete(f);
}

export function definirVozDoNarrador(v: VozDoSupertonic): void {
  gravar(CHAVE_DO_NARRADOR, v);
  avisar();
}

/* ───────── o motor, tardio ───────── */

type Modulo = typeof import('../../gateway/adapters/supertonicLocal');
let modulo: Promise<Modulo> | null = null;
let contexto: AudioContext | null = null;

/** O `AudioContext` da voz, criado (ou destravado) no toque da pessoa: o Safari só toca áudio liberado num gesto. */
export function contextoDaVozNoAparelho(): AudioContext {
  contexto ??= new AudioContext();
  return contexto;
}
export function destravarVozNoAparelho(): void {
  if (!vozNoAparelhoUtilizavel()) return;
  try {
    void contextoDaVozNoAparelho()
      .resume()
      .catch(() => undefined);
  } catch {
    /* sem Web Audio: a reserva lê */
  }
}

/** Importa o motor (uma vez) e registra o `neural-local` na porta. Recusa sem a flag, sem o perfil ou sem a raiz. */
export function carregarMotor(): Promise<Modulo> {
  if (!vozNoAparelhoOferecida()) return Promise.reject(new Error('voz no aparelho indisponível'));
  modulo ??= import('../../gateway/adapters/supertonicLocal').then((m) => {
    const d = decisaoDaVozNoAparelho();
    registrarMotorDeVoz(
      m.adaptadorDoSupertonic({
        threads: d.threadsWasm,
        webgpu: d.backend === 'webgpu',
        pronto: vozNoAparelhoLe,
        vozPadrao: vozDoNarradorNoAparelho,
        contexto: contextoDaVozNoAparelho,
        soltarAposMs: perfilDoDispositivo().poucaMemoria ? 0 : SOLTAR_APOS_MS,
      }),
    );
    return m;
  });
  return modulo;
}

/** O motor registrado, pronto para falar (para a amostra do seletor e do elenco), ou `null`. */
export async function motorDaVozNoAparelho(): Promise<TtsEngine | null> {
  if (!vozNoAparelhoUtilizavel()) return null;
  await carregarMotor();
  return (await motorDeVozRegistrado('neural-local')?.criar()) ?? null;
}

let download: AbortController | null = null;

/** Baixa o modelo (só no toque da pessoa). `true` se ficou pronto. */
export async function baixarVozNoAparelho(): Promise<boolean> {
  const raiz = raizDoModelo();
  if (!raiz || download) return false;
  const ctl = new AbortController();
  download = ctl;
  mudar({ fase: 'baixando', recebidos: 0, total: 0 });
  try {
    const m = await carregarMotor();
    await m.baixarSupertonic(raiz, (recebidos, total) => mudar({ recebidos, total }), ctl.signal);
    gravar(CHAVE_DO_MODELO, REVISAO_DO_SUPERTONIC);
    void navigator.storage?.persist?.().catch(() => false);
    mudar({ fase: 'livre' });
    return true;
  } catch {
    mudar({ fase: ctl.signal.aborted ? 'livre' : 'erro' });
    return false;
  } finally {
    download = null;
  }
}

export function cancelarDownloadDaVozNoAparelho(): void {
  download?.abort();
}

/** Apaga o modelo do aparelho (OPFS) e solta o worker. A escolha guardada fica, mas passa a valer a automática. */
export async function apagarVozNoAparelho(): Promise<void> {
  cancelarDownloadDaVozNoAparelho();
  const m = await carregarMotor();
  (motorDeVozRegistrado('neural-local') as { cliente?: { liberar(): void } } | undefined)?.cliente?.liberar();
  await m.apagarSupertonic();
  gravar(CHAVE_DO_MODELO, null);
  mudar({ fase: 'livre', recebidos: 0, total: 0 });
}
