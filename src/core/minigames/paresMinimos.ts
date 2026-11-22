import pares from '../../data/pares-minimos/pares.json';
import { embaralharComSemente, rngDe } from '../learning/memoriaDeItens';
import { baseLang } from '../texto/idioma';

/**
 * PARES MÍNIMOS — treinar o OUVIDO antes de decorar palavras (Wyner, Fluent Forever).
 *
 * O app toca UMA palavra de um par que só difere num som (ship/sheep, pero/perro, poisson/poison) e a
 * pessoa escolhe qual ouviu. As listas são do IDIOMA (`src/data/pares-minimos/pares.json`, curadas à mão),
 * não do baralho: o jogo existe para quem ainda não ouve a diferença, tenha ou não vocabulário salvo.
 * Corrigido no aparelho: sem IA, sem rede, sem custo. Nada vale por tempo (Decreto 12.880, art. 9º).
 *
 * Puro: o sorteio recebe a semente; não lê relógio, voz nem armazenamento.
 */

/** Um par como está no dado: duas palavras e os dois sons que as separam, na ordem (a, b). */
export interface ParMinimo {
  a: string;
  b: string;
  sons: readonly [string, string];
}

/** Uma das duas palavras na tela, com o som que a distingue. */
export interface OpcaoDoPar {
  palavra: string;
  som: string;
}

/** Uma pergunta: as duas opções NA ORDEM EM QUE APARECEM e qual delas foi tocada (0 ou 1). */
export interface RodadaDePar {
  /** Estável por par e independente do lado/ordem: serve de `item_ref`. */
  id: string;
  opcoes: readonly [OpcaoDoPar, OpcaoDoPar];
  tocada: 0 | 1;
  /** O contraste rotulado, p. ex. `/ɪ/ × /iː/`, na ordem em que as opções aparecem. */
  contraste: string;
}

export const PARES_MINIMOS = pares as unknown as Record<string, ParMinimo[]>;

/** Tamanho da rodada: pouco é leve, e mais que isso cansa o ouvido (a fadiga estraga o treino). */
export const PARES_POR_RODADA = { min: 5, max: 8 } as const;

/** Idiomas com lista curada. */
export const IDIOMAS_COM_PARES: readonly string[] = Object.keys(PARES_MINIMOS);

/** Os pares do idioma-alvo (aceita `en-US`, `pt-BR`…). Vazio se o idioma não tem lista. */
export function paresDoIdioma(lang: string | undefined | null): readonly ParMinimo[] {
  return PARES_MINIMOS[baseLang(lang)] ?? [];
}

export const temParesMinimos = (lang: string | undefined | null): boolean => paresDoIdioma(lang).length > 0;

/** `/ɪ/ × /iː/` */
export const rotuloDoContraste = (sons: readonly [string, string]): string => `/${sons[0]}/ × /${sons[1]}/`;

/** O mesmo contraste visto de qualquer ordem tem a mesma chave (`ɪ|iː` = `iː|ɪ`). */
export const chaveDoContraste = (sons: readonly [string, string]): string => [...sons].sort().join('|');

/** O id do par, na ordem do dado: não muda com o lado sorteado. */
export const idDoPar = (p: Pick<ParMinimo, 'a' | 'b'>): string => `${p.a}|${p.b}`;

/**
 * Metade das vezes toca um lado, metade o outro: uma lista de `n` booleanos com a diferença entre
 * verdadeiros e falsos de no máximo 1, embaralhada. Sem isso um sorteio simples pode tocar sempre a
 * mesma posição, e a pessoa acertaria por palpite.
 */
function equilibrados(n: number, rand: () => number): boolean[] {
  const base = Array.from({ length: n }, (_, i) => i % 2 === 0);
  for (let i = base.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [base[i], base[j]] = [base[j], base[i]];
  }
  return base;
}

export interface OpcoesDoSorteio {
  /** Quantos pares. Padrão: `PARES_POR_RODADA.max`. */
  quantidade?: number;
  /** Semente do sorteio (a tela passa o dia + a rodada). Mesma semente, mesma rodada. */
  semente?: string | number;
  /** `idDoPar` do que caiu há pouco: preferência (demove), não proibição. */
  evitar?: ReadonlySet<string>;
}

/**
 * SORTEIO DA RODADA.
 *  · só pares do idioma-alvo;
 *  · não repete par, nem palavra, dentro da rodada (pala/bala e pala/para não caem juntos);
 *  · prefere o que não caiu há pouco (`evitar`), mas completa com eles se faltar par;
 *  · equilibra QUAL palavra toca e QUAL fica à esquerda, de forma independente.
 */
export function sortearRodada(lang: string | undefined | null, opts: OpcoesDoSorteio = {}): RodadaDePar[] {
  const todos = paresDoIdioma(lang);
  if (!todos.length) return [];
  const quantidade = Math.max(0, Math.min(opts.quantidade ?? PARES_POR_RODADA.max, todos.length));
  const semente = opts.semente ?? 0;
  const evitar = opts.evitar ?? new Set<string>();

  const embaralhados = embaralharComSemente(todos, `pares:${baseLang(lang)}:${semente}`);
  const ordenados = [
    ...embaralhados.filter((p) => !evitar.has(idDoPar(p))),
    ...embaralhados.filter((p) => evitar.has(idDoPar(p))),
  ];

  const escolhidos: ParMinimo[] = [];
  const palavras = new Set<string>();
  for (const p of ordenados) {
    if (escolhidos.length >= quantidade) break;
    if (palavras.has(p.a) || palavras.has(p.b)) continue;
    escolhidos.push(p);
    palavras.add(p.a);
    palavras.add(p.b);
  }

  const rand = rngDe(`lados:${baseLang(lang)}:${semente}`);
  const tocaA = equilibrados(escolhidos.length, rand);
  const aEsquerda = equilibrados(escolhidos.length, rand);

  return escolhidos.map((p, i) => {
    const oa: OpcaoDoPar = { palavra: p.a, som: p.sons[0] };
    const ob: OpcaoDoPar = { palavra: p.b, som: p.sons[1] };
    const opcoes: readonly [OpcaoDoPar, OpcaoDoPar] = aEsquerda[i] ? [oa, ob] : [ob, oa];
    const tocada = (tocaA[i] === aEsquerda[i] ? 0 : 1) as 0 | 1;
    return { id: idDoPar(p), opcoes, tocada, contraste: rotuloDoContraste([opcoes[0].som, opcoes[1].som]) };
  });
}

/** A palavra que o jogo vai tocar. */
export const palavraTocada = (r: RodadaDePar): string => r.opcoes[r.tocada].palavra;

/** A pessoa escolheu a opção `escolha` (0 ou 1): era a que tocou? */
export const conferirPar = (r: RodadaDePar, escolha: 0 | 1): boolean => escolha === r.tocada;

export interface ContrasteConfundido {
  /** Rótulo `/ɪ/ × /iː/`, na ordem do primeiro erro visto. */
  contraste: string;
  sons: readonly [string, string];
  /** Quantas vezes a pessoa errou este contraste na rodada. */
  erros: number;
  /** Os pares errados, `palavra × palavra`. */
  pares: string[];
}

/**
 * O RESUMO DO FIM: quais contrastes o ouvido confundiu, do que mais errou para o que menos. Dois pares
 * com o mesmo contraste (ship/sheep e bit/beat, ambos /ɪ/ × /iː/) contam juntos, na mesma linha.
 * `erradas` são as rodadas que a pessoa errou.
 */
export function resumirContrastes(erradas: readonly RodadaDePar[]): ContrasteConfundido[] {
  const porChave = new Map<string, ContrasteConfundido>();
  for (const r of erradas) {
    const sons: readonly [string, string] = [r.opcoes[0].som, r.opcoes[1].som];
    const chave = chaveDoContraste(sons);
    const par = `${r.opcoes[0].palavra} × ${r.opcoes[1].palavra}`;
    const atual = porChave.get(chave);
    if (atual) {
      atual.erros += 1;
      atual.pares.push(par);
    } else {
      porChave.set(chave, { contraste: rotuloDoContraste(sons), sons, erros: 1, pares: [par] });
    }
  }
  return [...porChave.values()].sort((x, y) => y.erros - x.erros);
}
