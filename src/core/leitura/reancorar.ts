/**
 * REANCORAR PELA CITAÇÃO (L2, critério 9 da spec): quando o CFI não resolve mais (outra edição do
 * livro, capítulo reorganizado), a anotação procura o seu `exact` no texto e desempata as
 * ocorrências pelo `prefix`/`suffix`. Sem casamento, ela vai para "não localizadas" — e continua
 * guardada, exportável e apagável: uma anotação nunca some por o texto ter mudado.
 */
import type { AnotacaoDeLeitura, CitacaoDoTexto } from './anotacao';

export interface Trecho {
  inicio: number;
  fim: number;
}

/** Espaços colapsados, para casar "a  b" com "a b" (o motor pode juntar nós de texto de outro jeito). */
function normalizarComMapa(s: string): { texto: string; mapa: number[] } {
  let texto = '';
  const mapa: number[] = [];
  let espaco = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (/\s/.test(ch)) {
      if (espaco) continue;
      espaco = true;
      texto += ' ';
    } else {
      espaco = false;
      texto += ch;
    }
    mapa.push(i);
  }
  mapa.push(s.length);
  return { texto, mapa };
}

const colapsar = (s: string) => s.replace(/\s+/g, ' ');

/** Quantos caracteres do fim de `a` casam com o fim de `b`. */
function sufixoComum(a: string, b: string): number {
  let n = 0;
  while (n < a.length && n < b.length && a[a.length - 1 - n] === b[b.length - 1 - n]) n++;
  return n;
}
/** Quantos caracteres do começo de `a` casam com o começo de `b`. */
function prefixoComum(a: string, b: string): number {
  let n = 0;
  while (n < a.length && n < b.length && a[n] === b[n]) n++;
  return n;
}

/**
 * Acha a citação dentro de `texto`. Devolve o trecho (em índices do texto ORIGINAL) da ocorrência
 * com mais contexto casado; empate fica com a primeira. `null` = nenhuma ocorrência do `exact`.
 */
export function acharCitacao(texto: string, citacao: CitacaoDoTexto): Trecho | null {
  const exact = colapsar(citacao.exact).trim();
  if (!exact) return null;
  const { texto: alvo, mapa } = normalizarComMapa(texto);
  const prefix = colapsar(citacao.prefix);
  const suffix = colapsar(citacao.suffix);
  let melhor: { pos: number; nota: number } | null = null;
  for (let pos = alvo.indexOf(exact); pos >= 0; pos = alvo.indexOf(exact, pos + 1)) {
    const antes = alvo.slice(Math.max(0, pos - prefix.length), pos);
    const depois = alvo.slice(pos + exact.length, pos + exact.length + suffix.length);
    const nota = sufixoComum(antes, prefix) + prefixoComum(depois, suffix);
    if (!melhor || nota > melhor.nota) melhor = { pos, nota };
  }
  if (!melhor) return null;
  return { inicio: mapa[melhor.pos], fim: mapa[melhor.pos + exact.length - 1] + 1 };
}

export type Ancoragem =
  | { como: 'cfi' }
  | { como: 'citacao'; secao: number; trecho: Trecho }
  | { como: 'nao-localizada' };

/**
 * Decide onde a anotação mora: pelo CFI (se ele resolve e o texto dele ainda é a citação), pela
 * citação (procurada seção a seção) ou em lugar nenhum. `resolverCfi` devolve o TEXTO que o CFI
 * aponta hoje (ou `null` se não resolve); `textos` é o texto de cada seção, na ordem do livro.
 */
export function ancorar(
  a: Pick<AnotacaoDeLeitura, 'alvo'>,
  resolverCfi: (cfi: string) => string | null,
  textos: readonly string[],
): Ancoragem {
  const { cfi, citacao } = a.alvo;
  if (cfi) {
    const atual = resolverCfi(cfi);
    // Sem citação guardada, o CFI que resolve é a única prova; com ela, o texto tem de bater.
    if (atual != null && (!citacao.exact || colapsar(atual).trim() === colapsar(citacao.exact).trim())) {
      return { como: 'cfi' };
    }
  }
  for (let secao = 0; secao < textos.length; secao++) {
    const trecho = acharCitacao(textos[secao], citacao);
    if (trecho) return { como: 'citacao', secao, trecho };
  }
  return { como: 'nao-localizada' };
}
