import { comBaseLatina } from '../texto/palavra';
import { escreveSemEspaco } from '../texto/segmentacao';
import { chaveSemAcento } from './resposta';
import { distanciaDeEdicao } from './termo';

/**
 * CORREÇÃO DE FRASE NO APARELHO — a régua dos dois exercícios que pedem a frase INTEIRA:
 * a retradução (a pessoa vê a tradução e reescreve no idioma-alvo) e o ditado de frase (ouve e digita).
 *
 * Sem IA e sem rede: compara texto com texto. O que vira nota é o RESULTADO da escrita, nunca o tempo
 * (Decreto 12.880, art. 9º; ver `maestria.ts`).
 *
 * TOLERÂNCIA (todas ligadas por padrão):
 *  · caixa nunca conta;
 *  · pontuação não conta (`ignorarPontuacao`); desligada, ela vai colada à palavra, como na frase;
 *  · acento é opcional por configuração (`ignorarAcentos`: nem todo teclado escreve "ç"). "Acento" é só
 *    o latino — marca de outro alfabeto (dakuten) faz parte da letra (`chaveSemAcento`).
 *
 * O DIFF é por palavra: certas, trocadas (no mesmo lugar, outra palavra), faltando e sobrando. Idiomas
 * sem espaço (ja/zh/th…) são comparados por CARACTERE: o corte por dicionário do navegador muda de um
 * aparelho para outro, e ali ninguém escreve "palavras" separadas.
 */

export type StatusDoToken = 'certa' | 'trocada' | 'faltando' | 'sobrando';

export interface TokenComparado {
  status: StatusDoToken;
  /** A unidade esperada (ausente em `sobrando`). */
  alvo?: string;
  /** O que a pessoa escreveu (ausente em `faltando`). */
  resposta?: string;
}

export interface OpcoesDeComparacao {
  /** Acento latino não conta como erro. Padrão: true. */
  ignorarAcentos?: boolean;
  /** Pontuação não conta como erro. Padrão: true. */
  ignorarPontuacao?: boolean;
}

export interface ResultadoDaFrase {
  tokens: TokenComparado[];
  /** 0..100. 100 = igual dentro da tolerância. */
  nota: number;
  certas: number;
  trocadas: number;
  faltando: number;
  sobrando: number;
  /** Tudo certo dentro da tolerância. */
  igual: boolean;
}

/** Tamanho que a frase precisa ter para virar exercício, em unidades (palavras; caracteres sem espaço). */
export const LIMITES_DA_FRASE = { minPalavras: 4, maxPalavras: 14, minCaracteres: 4, maxCaracteres: 30 } as const;

/** Uma palavra trocada por uma letra só (erro de digitação) vale meio ponto na nota. */
const CREDITO_DE_QUASE = 0.5;

const PONTUACAO = /[\p{P}\p{S}]/gu;

/** As unidades comparáveis, como escritas (com pontuação colada quando ela conta). */
function unidades(texto: string, lang: string, ignorarPontuacao: boolean): string[] {
  const t = (texto ?? '').normalize('NFC').trim();
  if (escreveSemEspaco(lang)) {
    return Array.from(t.replace(/\s+/gu, '').replace(PONTUACAO, ''));
  }
  const palavras = t.split(/\s+/u).filter(Boolean);
  return ignorarPontuacao ? palavras.map((p) => p.replace(PONTUACAO, '')).filter(Boolean) : palavras;
}

function chave(u: string, ignorarAcentos: boolean, ignorarPontuacao = true): string {
  if (ignorarPontuacao) {
    if (ignorarAcentos) return chaveSemAcento(u) || u.toLowerCase();
    return u.normalize('NFC').toLowerCase();
  }
  /* Pontuação conta: só caixa e (se for o caso) acento saem da chave. */
  const base = u.normalize('NFC').toLowerCase();
  return ignorarAcentos
    ? comBaseLatina(base)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .normalize('NFC')
    : base;
}

/** Quantas unidades a frase tem (palavras, ou caracteres nos idiomas sem espaço). */
export function contarUnidades(texto: string, lang = ''): number {
  return unidades(texto, lang, true).length;
}

/** A frase tem tamanho para o exercício? */
export function fraseDeTamanhoBom(texto: string, lang = ''): boolean {
  const n = contarUnidades(texto, lang);
  return escreveSemEspaco(lang)
    ? n >= LIMITES_DA_FRASE.minCaracteres && n <= LIMITES_DA_FRASE.maxCaracteres
    : n >= LIMITES_DA_FRASE.minPalavras && n <= LIMITES_DA_FRASE.maxPalavras;
}

export function compararFrase(
  alvo: string,
  resposta: string,
  lang = '',
  opcoes: OpcoesDeComparacao = {},
): ResultadoDaFrase {
  const ignorarAcentos = opcoes.ignorarAcentos ?? true;
  const ignorarPontuacao = opcoes.ignorarPontuacao ?? true;
  const a = unidades(alvo, lang, ignorarPontuacao);
  const r = unidades(resposta, lang, ignorarPontuacao);
  const ka = a.map((u) => chave(u, ignorarAcentos, ignorarPontuacao));
  const kr = r.map((u) => chave(u, ignorarAcentos, ignorarPontuacao));

  /* Maior subsequência comum: o que sobrevive é o que está "certo e na ordem". */
  const m = ka.length;
  const n = kr.length;
  const lcs: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      lcs[i][j] = ka[i] === kr[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const tokens: TokenComparado[] = [];
  /* Entre duas âncoras, os restos dos dois lados se emparelham por posição (`trocada`); o que
     sobra de um lado é `faltando` ou `sobrando`. */
  const fecharLacuna = (gi: string[], gj: string[]) => {
    const par = Math.min(gi.length, gj.length);
    for (let k = 0; k < par; k++) tokens.push({ status: 'trocada', alvo: gi[k], resposta: gj[k] });
    for (let k = par; k < gi.length; k++) tokens.push({ status: 'faltando', alvo: gi[k] });
    for (let k = par; k < gj.length; k++) tokens.push({ status: 'sobrando', resposta: gj[k] });
  };
  let i = 0;
  let j = 0;
  let lacunaA: string[] = [];
  let lacunaR: string[] = [];
  while (i < m || j < n) {
    if (i < m && j < n && ka[i] === kr[j]) {
      fecharLacuna(lacunaA, lacunaR);
      lacunaA = [];
      lacunaR = [];
      tokens.push({ status: 'certa', alvo: a[i], resposta: r[j] });
      i++;
      j++;
    } else if (j >= n || (i < m && lcs[i + 1][j] >= lcs[i][j + 1])) {
      lacunaA.push(a[i++]);
    } else {
      lacunaR.push(r[j++]);
    }
  }
  fecharLacuna(lacunaA, lacunaR);

  const conta = (s: StatusDoToken) => tokens.filter((t) => t.status === s).length;
  const certas = conta('certa');
  const quase = tokens.filter(
    (t) =>
      t.status === 'trocada' &&
      distanciaDeEdicao(
        chave(t.alvo!, ignorarAcentos, ignorarPontuacao),
        chave(t.resposta!, ignorarAcentos, ignorarPontuacao),
      ) === 1,
  ).length;
  const base = Math.max(m, n);
  const nota = base ? Math.round(((certas + quase * CREDITO_DE_QUASE) / base) * 100) : 0;
  return {
    tokens,
    nota,
    certas,
    trocadas: conta('trocada'),
    faltando: conta('faltando'),
    sobrando: conta('sobrando'),
    igual: base > 0 && certas === m && m === n,
  };
}

/** Uma fala candidata a exercício de frase (estrutura mínima; `core` não importa de `lib`). */
export interface FraseCandidata {
  id?: string;
  text: string;
  translation?: string;
  lang?: string;
}

export type ModoDeFrase = 'retraducao' | 'ditado';

/**
 * As frases que servem ao exercício: tamanho bom e sem duplicata. A retradução exige TRADUÇÃO
 * diferente do texto (sem ela não há o que ler na língua da pessoa); o ditado não exige.
 * Mantém a ordem de entrada (quem chama já ordenou por memória) e corta em `quantidade`.
 */
export function frasesElegiveis<T extends FraseCandidata>(
  falas: readonly T[],
  modo: ModoDeFrase,
  opts: { lang?: string; quantidade?: number } = {},
): T[] {
  const vistas = new Set<string>();
  const saida: T[] = [];
  for (const f of falas) {
    const texto = (f.text ?? '').trim();
    const lang = f.lang || opts.lang || '';
    if (!texto || !fraseDeTamanhoBom(texto, lang)) continue;
    if (modo === 'retraducao') {
      const trad = (f.translation ?? '').trim();
      if (!trad || trad.toLowerCase() === texto.toLowerCase()) continue;
    }
    const k = chave(texto, true);
    if (vistas.has(k)) continue;
    vistas.add(k);
    saida.push(f);
    if (opts.quantidade && saida.length >= opts.quantidade) break;
  }
  return saida;
}

/**
 * A DICA: a primeira letra de cada palavra, o resto em traços ("T___ c____ e___"). Nos idiomas sem
 * espaço, só o primeiro caractere seguido de um traço por caractere restante. Pontuação fica de fora:
 * a pessoa não precisa dela para acertar (ver `ignorarPontuacao`).
 */
export function dicaDaFrase(alvo: string, lang = ''): string {
  const us = unidades(alvo, lang, true);
  if (escreveSemEspaco(lang)) return us.length ? us[0] + '_'.repeat(us.length - 1) : '';
  return us
    .map((p) => {
      const [primeira, ...resto] = Array.from(p);
      return primeira + '_'.repeat(resto.length);
    })
    .join(' ');
}
