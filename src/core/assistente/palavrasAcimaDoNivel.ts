/**
 * PALAVRAS ACIMA DO MEU NÍVEL — o recurso 2 do assistente ao vivo, 100% LOCAL (sem rede, sem custo; vale também no
 * Grátis). Spec: `docs/specs/2026-10-25-assistente-ao-vivo.md`.
 *
 * A linha da legenda vira uma lista de TRECHOS (início/fim no texto original) das palavras cujo nível passa do nível
 * da pessoa, para a tela destacar. O nível de cada palavra sai da MESMA régua do resto do app (`nivelCefr`, as listas
 * A1–C2 da trilha em `src/data/trilha/niveis/<idioma>.json`):
 *   - inglês: CEFR-J + Octanove (escala `cefr`, nível de linguista);
 *   - os outros idiomas da trilha: faixas de FREQUÊNCIA com os mesmos seis rótulos (escala `frequencia`) — a tela
 *     diz "menos comum", não "C1". As listas desses idiomas só existem depois de `precarregarNiveis(lang)` (camada de
 *     dados); antes disso, nada é marcado — o honesto.
 *
 * O QUE NÃO É MARCADO, de propósito:
 *   - palavra FORA da lista (`ausente`): não sabemos o nível, e as listas são curtas (2.784 palavras no inglês) —
 *     marcar "desconhecida" acenderia metade da legenda. `marcarForaDaLista` liga isso para quem quiser;
 *   - nome próprio provável (maiúscula no meio da frase), número, sigla em caixa alta (essa é do recurso de termos);
 *   - idiomas escritos sem espaço (chinês, japonês, tailandês…): sem segmentador local, não há palavra para medir.
 *
 * O inglês tenta formas flexionadas simples (plural, -ed, -ing, -er/-est, 3ª pessoa) antes de desistir: "studies"
 * acha "study". Irregulares ("went") ficam de fora da conta — ausência, não erro.
 */
import { type CefrLevel, nivelCefr } from '../learning/cefrWordlist';

export const NIVEIS_CEFR: readonly CefrLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

export interface PalavraAcimaDoNivel {
  /** A palavra como está na linha. */
  palavra: string;
  /** Início e fim (exclusivo) no texto original, em unidades de código (`String.prototype.slice`). */
  inicio: number;
  fim: number;
  /** O nível (escala `cefr`) ou a faixa de frequência (escala `frequencia`) da palavra; `null` se fora da lista. */
  nivel: CefrLevel | null;
  escala: 'cefr' | 'frequencia' | 'fora_da_lista';
}

export interface OpcoesDoNivel {
  /** Marca também as palavras fora da lista (padrão: não). */
  marcarForaDaLista?: boolean;
}

/** Idiomas sem espaço entre palavras: sem segmentador local, o recurso não se aplica. */
const SEM_ESPACO = new Set(['zh', 'ja', 'th', 'lo', 'km', 'my']);

/** Uma palavra: letras (com marcas), com apóstrofo ou hífen no meio ("don't", "well-known"). */
const PALAVRA = /\p{L}[\p{L}\p{M}]*(?:['’-]\p{L}[\p{L}\p{M}]*)*/gu;

const indice = (n: CefrLevel): number => NIVEIS_CEFR.indexOf(n);

/**
 * As formas-base prováveis de uma palavra inglesa flexionada, da mais provável à menos.
 *
 * LIMITAÇÃO, de propósito: é corte de sufixo, não lematizador. Não acha irregulares ("went" → "go", "children" →
 * "child", "better" → "good"), erra em palavras que só parecem flexionadas ("during", "bless", "early" podem gerar
 * candidatos falsos — só valem se o candidato estiver na lista, e aí o nível do candidato é o que aparece) e não trata
 * "-ves" ("knives"), "-ier"/"-iest" ("happier") nem prefixos. Errar aqui é deixar de marcar, que é o lado seguro; um
 * lematizador de verdade só se a medição mostrar que vale o tamanho.
 */
export function formasDoIngles(p: string): string[] {
  const f: string[] = [];
  const add = (s: string) => {
    if (s.length >= 2 && !f.includes(s)) f.push(s);
  };
  if (p.endsWith("'s") || p.endsWith('’s')) add(p.slice(0, -2));
  if (p.endsWith('ies')) add(`${p.slice(0, -3)}y`);
  if (p.endsWith('es')) add(p.slice(0, -2));
  if (p.endsWith('s') && !p.endsWith('ss')) add(p.slice(0, -1));
  if (p.endsWith('ied')) add(`${p.slice(0, -3)}y`);
  if (p.endsWith('ed')) {
    add(p.slice(0, -2));
    add(p.slice(0, -1));
    if (/(.)\1ed$/.test(p)) add(p.slice(0, -3));
  }
  if (p.endsWith('ing')) {
    add(p.slice(0, -3));
    add(`${p.slice(0, -3)}e`);
    if (/(.)\1ing$/.test(p)) add(p.slice(0, -4));
  }
  if (p.endsWith('est')) add(p.slice(0, -3));
  if (p.endsWith('er')) add(p.slice(0, -2));
  if (p.endsWith('ly')) add(p.slice(0, -2));
  return f;
}

/** O nível medido de uma palavra (com as formas do inglês), ou o `ausente`. */
function medir(palavra: string, lang: string): { nivel: CefrLevel | null; escala: PalavraAcimaDoNivel['escala'] } {
  const tentativas = [palavra, ...(lang.toLowerCase().startsWith('en') ? formasDoIngles(palavra.toLowerCase()) : [])];
  for (const t of tentativas) {
    const n = nivelCefr(t, lang);
    if (n.level) return { nivel: n.level, escala: 'cefr' };
    if (n.faixa) return { nivel: n.faixa, escala: 'frequencia' };
  }
  return { nivel: null, escala: 'fora_da_lista' };
}

/**
 * As palavras da linha ACIMA do nível da pessoa (estritamente acima: quem é B1 vê B2, C1 e C2). Pura e síncrona: a
 * tela chama a cada linha nova, sem rede.
 */
export function palavrasAcimaDoNivel(
  linha: string,
  lang: string,
  nivelDaPessoa: CefrLevel,
  opcoes: OpcoesDoNivel = {},
): PalavraAcimaDoNivel[] {
  const idioma = (lang || '').toLowerCase().split('-')[0];
  if (!linha || !idioma || SEM_ESPACO.has(idioma) || indice(nivelDaPessoa) < 0) return [];
  const saida: PalavraAcimaDoNivel[] = [];
  for (const m of linha.matchAll(PALAVRA)) {
    const palavra = m[0];
    const inicio = m.index ?? 0;
    if (palavra.length < 2) continue;
    /* Sigla em caixa alta (é do recurso de termos) e nome próprio provável (maiúscula fora do começo da frase). */
    if (palavra.length > 1 && palavra === palavra.toUpperCase() && palavra !== palavra.toLowerCase()) continue;
    const comecoDeFrase =
      /^[\s"'“‘(¿¡-]*$/.test(linha.slice(0, inicio)) || /[.!?…]\s*["'”’)]*\s*$/.test(linha.slice(0, inicio));
    if (!comecoDeFrase && palavra[0] !== palavra[0].toLowerCase()) continue;
    const { nivel, escala } = medir(palavra, idioma);
    const acima = nivel ? indice(nivel) > indice(nivelDaPessoa) : opcoes.marcarForaDaLista === true;
    if (acima) saida.push({ palavra, inicio, fim: inicio + palavra.length, nivel, escala });
  }
  return saida;
}
