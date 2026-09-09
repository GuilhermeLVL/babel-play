import type { ReactElement, ReactNode } from 'react';
import { cloneElement, Fragment, isValidElement } from 'react';

import { bruto, brutoPlural } from './i18n';
import { useI18n } from './useI18n';

/**
 * FRASE COM FORMATAÇÃO NO MEIO, traduzível inteira.
 *
 * O PROBLEMA. `Encontrei <strong>{n}</strong> sessões` não é uma string: em JSX são vários nós de
 * texto. Traduzir pedaço por pedaço obriga cada idioma a manter a ordem do português — e japonês,
 * alemão e árabe mudam a ordem. O resultado é uma frase que "está traduzida" e não faz sentido.
 *
 * A SOLUÇÃO. A frase volta a ser UMA string, com a marcação dentro:
 *
 *   <T txt="Encontrei <b>{sessoes}</b> sessões e <b>{cartoes}</b> cartões."
 *      val={{ sessoes, cartoes }} />
 *
 * O tradutor japonês move `<b>{cartoes}</b>` para onde o japonês pede; o casamento é por NOME, não
 * por posição, então qualquer ordem funciona.
 *
 * POR QUE NOMES E NÃO `<1>…</1>` (o estilo do `<Trans>` do i18next). Com índices, a chave deixaria
 * de ser a frase portuguesa e passaria a ser uma serialização da árvore JSX: `scripts/i18n/orfas.mjs`
 * pararia de funcionar (ele procura a chave como literal no `.tsx`), e trocar `<strong>` por `<b>`
 * renumeraria tudo, orfanando a tradução **em silêncio** — o fallback é legível, ninguém percebe.
 *
 * TRÊS PROPRIEDADES INEGOCIÁVEIS:
 *
 *  1. **Nunca lança.** Tag desconhecida, não fechada, cruzada ou inventada pelo tradutor degrada
 *     para texto literal. O pior caso é a pessoa ver `<b>` na tela: feio, legível, e detectável.
 *  2. **Sem `dangerouslySetInnerHTML`.** O catálogo vem de `fetch()` — nenhum byte dele vira HTML.
 *     As únicas tags que existem são as que o CÓDIGO declarou. `<script>` no JSON sai como texto.
 *  3. **Atributos não entram na string traduzida.** `href` e `onClick` são decisão de código;
 *     aceitá-los vindos de um JSON baixado da rede seria abrir injeção.
 */

export type ValorDeT = string | number | ReactNode;
export type Tags = Record<string, ReactElement>;

export interface PropsDeT {
  /** A frase portuguesa COM marcação — é a chave do catálogo. */
  txt: string;
  /** Interpolação de `{nome}`. Aceita `ReactNode`, ao contrário de `t()`. */
  val?: Record<string, ValorDeT>;
  /** Elementos-modelo por nome de tag. Mescla com os padrões; o mapa vence. */
  tags?: Tags;
  /** Plural: com `n`, `txt` é a forma OTHER e `um` é a forma ONE. */
  n?: number;
  um?: string;
}

/** Tags implícitas: cobrem o caso dominante (um número em negrito) sem exigir mapa. */
const PADRAO: Tags = {
  b: <strong />, i: <em />, code: <code />, br: <br />, small: <small />,
};
const VAZIAS = new Set(['br']);

/* Nomes de tag e de placeholder: letras, dígitos e hífen. Sem atributos — ver propriedade 3. */
const TOKEN = /<(\/?)([a-zA-Z][\w-]*)\s*(\/?)>|\{(\w+)\}/g;

/**
 * A string traduzida vira nós de React.
 *
 * Exportada separada do componente porque `title`, `aria-label` e testes precisam do motor sem o
 * React em volta.
 */
export function montar(texto: string, val?: Record<string, ValorDeT>, tags?: Tags): ReactNode[] {
  const mapa = tags ? { ...PADRAO, ...tags } : PADRAO;
  const raiz: ReactNode[] = [];
  const pilha: { nome: string; abre: string; filhos: ReactNode[] }[] = [];
  const topo = () => (pilha.length ? pilha[pilha.length - 1].filhos : raiz);
  let cursor = 0;
  let k = 0;

  TOKEN.lastIndex = 0;
  for (let m: RegExpExecArray | null; (m = TOKEN.exec(texto)) !== null; ) {
    const solto = texto.slice(cursor, m.index);
    if (solto) topo().push(solto);
    cursor = TOKEN.lastIndex;
    const [inteiro, fecha, nome, autoFecha, chave] = m;

    if (chave !== undefined) {
      const v = val?.[chave];
      // Valor ausente deixa `{nome}` intacto — mesmo contrato de `interpolar()`, já travado em teste.
      if (v === undefined || v === null) topo().push(inteiro);
      else if (isValidElement(v)) topo().push(<Fragment key={`v${k++}`}>{v}</Fragment>);
      else topo().push(String(v));
      continue;
    }

    const modelo = mapa[nome];
    if (!modelo) { topo().push(inteiro); continue; }

    if (autoFecha || VAZIAS.has(nome)) {
      topo().push(cloneElement(modelo, { key: `t${k++}` }));
      continue;
    }

    if (!fecha) { pilha.push({ nome, abre: inteiro, filhos: [] }); continue; }

    let i = pilha.length - 1;
    while (i >= 0 && pilha[i].nome !== nome) i--;
    if (i < 0) { topo().push(inteiro); continue; }
    /* Aberturas presas acima do que fechou (`<b><i>x</b>`) viram texto, e o conteúdo é preservado:
       tradução malformada custa formatação, nunca palavras. */
    while (pilha.length - 1 > i) {
      const orfa = pilha.pop()!;
      topo().push(orfa.abre, ...orfa.filhos);
    }
    const q = pilha.pop()!;
    /* Filhos como VARARGS, não como array: React exige `key` em array, e passar `q.filhos` inteiro
       reintroduziria o warning em toda frase aninhada. */
    topo().push(cloneElement(modelo, { key: `t${k++}` }, ...q.filhos));
  }

  const resto = texto.slice(cursor);
  if (resto) topo().push(resto);

  while (pilha.length) {
    const orfa = pilha.pop()!;
    topo().push(orfa.abre, ...orfa.filhos);
  }
  return raiz;
}

export function T({ txt, val, tags, n, um }: PropsDeT) {
  useI18n(); // re-renderiza quando o idioma troca
  const frase = n === undefined ? bruto(txt) : brutoPlural(n, um ?? txt, txt);
  const valores = n === undefined ? val : { n, ...val };
  return <>{montar(frase, valores, tags)}</>;
}
