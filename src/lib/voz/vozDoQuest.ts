/**
 * A VOZ DO SITE NO APARELHO SEM VOZ (o Meta Quest).
 *
 * O navegador do Quest tem a API `speechSynthesis` e NENHUMA voz instalada: o app mandava ler a
 * tradução do intérprete, nada tocava, e a fila desistia depois de 8 s (relato do dono, 01/10/2026).
 * Aqui a leitura vem da função `/quest/tts` do próprio site (`functions/quest/tts.js`, Workers AI), e o
 * aparelho só toca o MP3.
 *
 * É o MESMO motor da voz natural (`vozDaNuvem.ts`: o tocador único, o guarda de eco, o Repetir sem
 * pedir de novo, as pausas por recusa), com duas trocas: o pedido vai ao site e não ao servidor, e a
 * reserva é MUDA. No Quest a voz do aparelho é justamente a que não toca; recuar para ela deixaria a
 * fila esperando o prazo de novo.
 *
 * IDIOMAS: a Cloudflare lê inglês, espanhol, francês, chinês, japonês e coreano. O português e os
 * demais dependem de um segredo no Pages; o GET da função diz o que esta instalação lê. Idioma sem voz
 * não gasta uma ida à rede: a fala termina na hora e a tela mostra a tradução em texto.
 */
import { cabecalhoDoDono, nuvemDoQuestAtiva } from '../nuvemDoQuest';
import type { SpeakOptions, TtsEngine } from '../tts';
import { criarVozDaNuvem, type OpcoesDaVozDaNuvem, type VozDaNuvem } from './vozDaNuvem';

/** A função do Pages. Fora de `/api`: lá a edição estática responde em memória, sem rede. */
export const ENDPOINT_DA_VOZ_DO_QUEST = '/quest/tts';

/** O que a Cloudflare lê sem segredo nenhum. O GET da função acrescenta o resto, se houver. */
const IDIOMAS_DE_FABRICA: readonly string[] = ['en', 'es', 'fr', 'zh', 'ja', 'ko'];

let idiomas = new Set<string>(IDIOMAS_DE_FABRICA);
let perguntou = false;
const ouvintes = new Set<() => void>();

const base = (idioma: string): string => {
  const b = (idioma || '').toLowerCase().split(/[-_]/)[0];
  return b === 'nb' || b === 'nn' ? 'no' : b;
};

/** A voz do site está LIGADA neste aparelho: a nuvem do site existe aqui e a pessoa consentiu. */
export function vozDoQuestAtiva(): boolean {
  return nuvemDoQuestAtiva();
}

/** A voz do site lê este idioma? (aceita `en` ou `en-US`) */
export function vozDoQuestFala(idioma: string): boolean {
  return idiomas.has(base(idioma));
}

/** Os idiomas que a voz do site lê, em ordem. */
export function idiomasDaVozDoQuest(): string[] {
  return [...idiomas].sort();
}

/** Avisa quando a lista de idiomas muda (a resposta do GET chegou). Devolve o cancelamento. */
export function aoMudarIdiomasDaVozDoQuest(cb: () => void): () => void {
  ouvintes.add(cb);
  return () => {
    ouvintes.delete(cb);
  };
}

/**
 * Pergunta à função, UMA vez, o que esta instalação lê (com o segredo da DeepInfra, o português entra).
 * Falhou, ou a nuvem não respondeu: fica a lista de fábrica.
 */
export async function atualizarIdiomasDaVozDoQuest(buscar: typeof fetch = fetch): Promise<void> {
  if (perguntou) return;
  perguntou = true;
  try {
    const r = await buscar(ENDPOINT_DA_VOZ_DO_QUEST, { headers: cabecalhoDoDono() });
    if (!r.ok) return;
    const lista = ((await r.json()) as { idiomas?: unknown })?.idiomas;
    if (!Array.isArray(lista) || !lista.length) return;
    idiomas = new Set(lista.map((i) => base(String(i))).filter(Boolean));
    for (const avisar of ouvintes) avisar();
  } catch {
    perguntou = false; // rede fora: a próxima tela tenta de novo
  }
}

/** Não fala, e avisa o fim na hora: a fila de fala segue sem esperar prazo nenhum. */
export const MOTOR_MUDO: TtsEngine = {
  speak: (_texto, opcoes) => queueMicrotask(() => opcoes?.onEnd?.()),
  cancel: () => {},
  isSpeaking: () => false,
};

export interface OpcoesDaVozDoQuest {
  buscar?: typeof fetch;
  tocador?: OpcoesDaVozDaNuvem['tocador'];
  /** Quem lê o idioma que a voz do site não tem (padrão: ninguém). */
  reserva?: TtsEngine;
}

/** O motor da voz do site. A tela cria um por conversa; o app, um só (`vozDoQuest`). */
export function criarVozDoQuest(o: OpcoesDaVozDoQuest = {}): VozDaNuvem {
  const buscar = o.buscar ?? fetch;
  const reserva = o.reserva ?? MOTOR_MUDO;
  const nuvem = criarVozDaNuvem({
    reserva,
    ...(o.tocador ? { tocador: o.tocador } : {}),
    buscar: (_caminho, init) =>
      buscar(ENDPOINT_DA_VOZ_DO_QUEST, {
        ...init,
        headers: { ...(init.headers as Record<string, string>), ...cabecalhoDoDono() },
      }),
  });
  return {
    ...nuvem,
    speak(texto: string, opts?: SpeakOptions) {
      if (!texto?.trim() || !opts) return;
      if (!vozDoQuestFala(opts.lang)) {
        /* Sem voz neste idioma: cala o que tocava e entrega a fala à reserva, sem ir à rede. */
        nuvem.cancel();
        reserva.speak(texto, opts);
        return;
      }
      nuvem.speak(texto, { ...opts, lang: base(opts.lang) });
    },
  };
}

let unica: VozDaNuvem | null = null;
/** A voz do site do app inteiro (os botões "Ouvir", os jogos, o narrador). */
export function vozDoQuest(): VozDaNuvem {
  return (unica ??= criarVozDoQuest());
}

/** Só para os testes: volta à lista de fábrica. */
export function _reiniciarVozDoQuest(): void {
  idiomas = new Set(IDIOMAS_DE_FABRICA);
  perguntou = false;
  unica = null;
}
