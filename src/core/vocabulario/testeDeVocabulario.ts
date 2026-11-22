/**
 * O TESTE RÁPIDO DE VOCABULÁRIO (openspec `teste-de-vocabulario`): semeia as "palavras que você conhece" para a conta
 * não começar fria. Regra pura: sem rede, sem DOM, sem relógio (nada por tempo: Decreto 12.880/2026, art. 9º) e
 * sem sorteio escondido (a amostra é determinística pela semente).
 *
 * MÉTODO ("sim/não" no estilo LexTALE): a pessoa vê UMA palavra por vez e diz "sei" ou "não sei". Entre as palavras
 * reais de cada faixa CEFR (A1 → C2) vão PSEUDOPALAVRAS plausíveis (~20%); marcar "sei" para uma delas é chute, e a
 * taxa de chute corrige a estimativa e, se alta, cancela a semeadura.
 *
 * ADAPTATIVO: o teste para na faixa em que a pessoa não sabe a maioria das palavras reais (pior caso, `limiar` de
 * acerto não alcançável), sem mostrar o resto. Faixas mais difíceis seriam só frustração.
 *
 * O QUE SEMEIA: as palavras que a pessoa marcou "sei" + TODAS as palavras das faixas de acerto alto (≥ 80% depois da
 * correção) que vêm em sequência a partir de A1. Com chute alto, nada; com chute moderado, só marcadas de faixas
 * confiáveis. O teste é um diagnóstico: não dá XP nem Seeds.
 *
 * A estimativa de palavras é na escala da LISTA DE REFERÊNCIA do idioma (não é o vocabulário total da pessoa).
 */
import { type CefrLevel, palavrasPorNivel } from '../learning/cefrWordlist';
import { baseLang } from '../texto/idioma';
import { chaveDaPalavra } from '../texto/palavra';
import { PSEUDOPALAVRAS } from './pseudopalavras';

export const FAIXAS_DO_TESTE: readonly CefrLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

export const PALAVRAS_POR_FAIXA = 10;
export const PSEUDOS_POR_FAIXA = 3;
/** A faixa "passa" com pelo menos esta fração das palavras reais conhecidas; abaixo, o teste para. */
export const LIMIAR_DE_PARADA = 0.5;
/** A faixa conta como "dominada" (semeia a faixa inteira) com esta taxa, já corrigida pelo chute. */
export const LIMIAR_DE_ACERTO_ALTO = 0.8;
/** Até esta taxa de chute a pessoa é tratada como confiável; acima, só marcadas das faixas boas. */
export const CHUTE_TOLERADO = 0.15;
/** Daqui para cima não semeia nada (e avisa com gentileza). */
export const CHUTE_QUE_CANCELA = 0.4;
/** Com menos pseudopalavras vistas que isto, a taxa de chute não é lida como cancelamento. */
export const PSEUDOS_MINIMAS = 4;

export interface ItemDoTeste {
  palavra: string;
  pseudo: boolean;
  faixa: CefrLevel;
}

export interface TesteDeVocabulario {
  lang: string;
  semente: string;
  /** Os itens na ordem em que são mostrados (faixa a faixa, reais e pseudopalavras embaralhadas). */
  itens: readonly ItemDoTeste[];
}

/** O idioma tem teste (lista de níveis E pseudopalavras)? */
export function idiomaTemTeste(lang: string | null | undefined): boolean {
  const idioma = baseLang(lang);
  if (!idioma || !PSEUDOPALAVRAS[idioma]?.length) return false;
  return FAIXAS_DO_TESTE.some((f) => palavrasPorNivel(idioma)[f].length > 0);
}

/** Os idiomas que têm teste hoje (só onde há lista confiável). */
export function idiomasComTeste(): string[] {
  return Object.keys(PSEUDOPALAVRAS).filter(idiomaTemTeste);
}

/* PRNG pequeno e estável (mulberry32) com hash FNV-1a da semente: o mesmo texto dá sempre a mesma amostra. */
function gerador(semente: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < semente.length; i++) h = Math.imul(h ^ semente.charCodeAt(i), 16777619);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function embaralhar<T>(lista: readonly T[], rnd: () => number): T[] {
  const r = [...lista];
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [r[i], r[j]] = [r[j]!, r[i]!];
  }
  return r;
}

/** Só palavras de verdade para mostrar: letras, 3 ou mais (fora siglas e ruído). */
const MOSTRAVEL = /^\p{L}{3,}$/u;

/** Monta o teste, ou `null` quando o idioma não tem lista confiável. Determinístico em (`lang`, `semente`). */
export function montarTeste(lang: string, semente: string): TesteDeVocabulario | null {
  const idioma = baseLang(lang);
  if (!idiomaTemTeste(idioma)) return null;
  const rnd = gerador(`${idioma}|${semente}`);
  const lista = palavrasPorNivel(idioma);
  const reais = new Set(FAIXAS_DO_TESTE.flatMap((f) => lista[f]));
  const pool = embaralhar(
    (PSEUDOPALAVRAS[idioma] ?? []).filter((p) => !reais.has(chaveDaPalavra(p))),
    rnd,
  );
  const itens: ItemDoTeste[] = [];
  for (const faixa of FAIXAS_DO_TESTE) {
    const sorteadas = embaralhar(
      lista[faixa].filter((p) => MOSTRAVEL.test(p)),
      rnd,
    ).slice(0, PALAVRAS_POR_FAIXA);
    if (!sorteadas.length) continue;
    const doces = pool.splice(0, PSEUDOS_POR_FAIXA);
    const mistura: ItemDoTeste[] = [
      ...sorteadas.map((palavra) => ({ palavra, pseudo: false, faixa })),
      ...doces.map((palavra) => ({ palavra, pseudo: true, faixa })),
    ];
    itens.push(...embaralhar(mistura, rnd));
  }
  return { lang: idioma, semente, itens };
}

export interface AndamentoDoTeste {
  /** Quantos itens já foram respondidos. */
  respondidas: number;
  /** O próximo item, ou `null` quando acabou. */
  proximo: ItemDoTeste | null;
  terminou: boolean;
  /** `parou`: a pessoa não sabe a maioria das palavras de uma faixa e o resto foi poupado. */
  motivoDoFim: 'completo' | 'parou' | null;
  /** Índice (0 a 5) da faixa do próximo item, ou da última, ao terminar. */
  faixaAtual: number;
  /** Quantas faixas o teste tem (as com palavras). */
  totalDeFaixas: number;
}

interface ContagemDaFaixa {
  nivel: CefrLevel;
  reaisTotal: number;
  reaisRespondidas: number;
  sei: number;
}

/** A leitura das respostas (`respostas[i]` = "sei" para `itens[i]`) faixa a faixa, parando na regra adaptativa. */
function percorrer(teste: TesteDeVocabulario, respostas: readonly boolean[]) {
  const faixas: ContagemDaFaixa[] = [];
  let pseudoVistas = 0;
  let pseudoSei = 0;
  let parou = false;
  let usadas = 0;
  for (let i = 0; i < teste.itens.length && i < respostas.length; i++) {
    const item = teste.itens[i]!;
    let f = faixas[faixas.length - 1];
    if (!f || f.nivel !== item.faixa) {
      const reaisTotal = teste.itens.filter((x) => x.faixa === item.faixa && !x.pseudo).length;
      f = { nivel: item.faixa, reaisTotal, reaisRespondidas: 0, sei: 0 };
      faixas.push(f);
    }
    usadas = i + 1;
    if (item.pseudo) {
      pseudoVistas++;
      if (respostas[i]) pseudoSei++;
    } else {
      f.reaisRespondidas++;
      if (respostas[i]) f.sei++;
      const precisa = Math.ceil(LIMIAR_DE_PARADA * f.reaisTotal);
      const naoSei = f.reaisRespondidas - f.sei;
      if (naoSei > f.reaisTotal - precisa) {
        parou = true;
        break;
      }
    }
  }
  return { faixas, pseudoVistas, pseudoSei, parou, usadas };
}

/** Onde o teste está: o próximo item, ou o fim. Puro em (`teste`, `respostas`). */
export function andamentoDoTeste(teste: TesteDeVocabulario, respostas: readonly boolean[]): AndamentoDoTeste {
  const { parou, usadas } = percorrer(teste, respostas);
  const totalDeFaixas = new Set(teste.itens.map((i) => i.faixa)).size;
  const terminou = parou || usadas >= teste.itens.length;
  const proximo = terminou ? null : (teste.itens[usadas] ?? null);
  const ref = proximo ?? teste.itens[Math.max(0, usadas - 1)];
  const faixaAtual = ref ? Math.max(0, FAIXAS_DO_TESTE.indexOf(ref.faixa)) : 0;
  return {
    respondidas: usadas,
    proximo,
    terminou,
    motivoDoFim: terminou ? (parou ? 'parou' : 'completo') : null,
    faixaAtual,
    totalDeFaixas,
  };
}

export interface FaixaDoResultado {
  nivel: CefrLevel;
  respondidas: number;
  sei: number;
  /** Fração de "sei" entre as palavras reais respondidas. */
  taxa: number;
  /** A taxa depois de descontar o chute. */
  taxaCorrigida: number;
}

export interface ResultadoDoTeste {
  /** `chute`: marcou "sei" para pseudopalavras demais; `sem_dados`: nenhuma palavra real respondida. */
  motivo: 'ok' | 'chute' | 'sem_dados';
  /** Pode semear? (`false` com `chute` e `sem_dados`.) */
  confiavel: boolean;
  /** O maior nível, em sequência a partir de A1, com taxa corrigida ≥ `LIMIAR_DE_PARADA`; `null` antes de A1. */
  nivel: CefrLevel | null;
  /** Estimativa na escala da lista de referência (arredondada de 10 em 10). */
  palavrasEstimadas: number;
  /** Fração de pseudopalavras marcadas "sei" (0 sem nenhuma vista). */
  taxaDeChute: number;
  faixas: FaixaDoResultado[];
  /** As chaves a marcar como conhecidas (`chaveDaPalavra`), sem repetir. Vazio quando não confiável. */
  aMarcar: string[];
}

/** (H − FA) / (1 − FA), entre 0 e 1: a correção clássica de acerto por falso alarme. */
function corrigir(taxa: number, chute: number): number {
  if (chute >= 1) return 0;
  return Math.min(1, Math.max(0, (taxa - chute) / (1 - chute)));
}

export function resultadoDoTeste(teste: TesteDeVocabulario, respostas: readonly boolean[]): ResultadoDoTeste {
  const { faixas: contagens, pseudoVistas, pseudoSei } = percorrer(teste, respostas);
  const taxaDeChute = pseudoVistas ? pseudoSei / pseudoVistas : 0;
  const faixas: FaixaDoResultado[] = contagens
    .filter((f) => f.reaisRespondidas > 0)
    .map((f) => {
      const taxa = f.sei / f.reaisRespondidas;
      return {
        nivel: f.nivel,
        respondidas: f.reaisRespondidas,
        sei: f.sei,
        taxa,
        taxaCorrigida: corrigir(taxa, taxaDeChute),
      };
    });
  const vazio = (motivo: ResultadoDoTeste['motivo'], nivel: CefrLevel | null = null): ResultadoDoTeste => ({
    motivo,
    confiavel: false,
    nivel,
    palavrasEstimadas: 0,
    taxaDeChute,
    faixas,
    aMarcar: [],
  });
  if (!faixas.length) return vazio('sem_dados');
  if (pseudoVistas >= PSEUDOS_MINIMAS && taxaDeChute >= CHUTE_QUE_CANCELA) return vazio('chute');

  const lista = palavrasPorNivel(teste.lang);
  let nivel: CefrLevel | null = null;
  for (const f of faixas) {
    if (f.taxaCorrigida < LIMIAR_DE_PARADA) break;
    nivel = f.nivel;
  }

  const estimadas = faixas.reduce((n, f) => n + f.taxaCorrigida * lista[f.nivel].length, 0);

  const aMarcar = new Set<string>();
  const moderado = taxaDeChute > CHUTE_TOLERADO;
  const corrigidaDe = new Map(faixas.map((f) => [f.nivel, f.taxaCorrigida]));
  for (let i = 0; i < teste.itens.length && i < respostas.length; i++) {
    const item = teste.itens[i]!;
    if (item.pseudo || !respostas[i]) continue;
    if (moderado && (corrigidaDe.get(item.faixa) ?? 0) < LIMIAR_DE_PARADA) continue;
    aMarcar.add(chaveDaPalavra(item.palavra));
  }
  for (const f of faixas) {
    if (f.taxaCorrigida < LIMIAR_DE_ACERTO_ALTO) break;
    for (const p of lista[f.nivel]) aMarcar.add(chaveDaPalavra(p));
  }
  aMarcar.delete('');

  return {
    motivo: 'ok',
    confiavel: true,
    nivel,
    palavrasEstimadas: Math.round(estimadas / 10) * 10,
    taxaDeChute,
    faixas,
    aMarcar: [...aMarcar],
  };
}
