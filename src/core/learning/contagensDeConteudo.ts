/**
 * AS CONTAGENS POR FONTE — o contrato de `GET /api/vocab/conteudo`, a leitura do seletor de conteúdo
 * (a ficha no cabeçalho e o catálogo "Escolher o conteúdo").
 *
 * O catálogo mostra, de cada fonte, "37 palavras · 31 frases" e o que há para hoje. Pedir o baralho
 * inteiro para contar isso seria o mesmo custo que `GET /api/vocab/resumo` existe para evitar; aqui o
 * servidor conta e devolve poucos KB. O MESMO cálculo roda no aparelho na edição sem servidor
 * (`src/data/efemero/rotas/conteudo.ts`): a função é esta, pura, e as duas pontas só leem as linhas.
 *
 * AS DEFINIÇÕES (uma de cada, para o número ser o mesmo em toda tela):
 *   palavras   cartões no baralho (`in_deck` 1 ou nulo), como `ResumoDosCartoes.total`;
 *   frases     frases de exemplo DISTINTAS com 4 palavras ou mais entre esses cartões: a regra de
 *              `frasesDoAcervo` (`src/core/minigames/source.ts`), que é o que os jogos de frase leem;
 *   paraHoje   cartões que vencem agora (`due_at <= agora`): as vencidas e as novas já postas na fila
 *              do dia. É o `vence` de `resumoDosCartoes`; a nova nunca vista (`due_at` nulo) não conta;
 *   difícil    errada 8 vezes ou mais (`lapses >= ERROS_DE_DIFICIL`), a régua da tela Cartões.
 *
 * O IDIOMA É O PRIMEIRO NÍVEL (`seletor.js:12-13`): quem tem cartões em dois idiomas ou mais vê um por
 * vez, e "Tudo" quer dizer "tudo em inglês". Quem tem um só não é filtrado (o cartão sem idioma
 * continua contando) e `idioma` volta vazio.
 */
import { ERROS_DE_DIFICIL } from './resumoDosCartoes';

/** Os três números de uma fonte. */
export interface ContagemDaFonte {
  palavras: number;
  frases: number;
  paraHoje: number;
}

/** Uma sessão ou um baralho do Anki no catálogo. */
export interface FonteContada extends ContagemDaFonte {
  id: string;
  /** O título da sessão ou o nome do baralho. */
  nome: string;
  /** Sessão: `audio`, `video`, `document` ou `live`. Baralho do Anki: `null`. */
  tipo: string | null;
  /** Quando a sessão foi gravada ou o baralho foi trazido (ms). */
  quando: number;
  /** Sessão: a duração (ms), quando há. */
  duracaoMs: number | null;
}

export interface ContagensDeConteudo {
  /** O instante (ms) em que "para hoje" foi contado: o fim do minuto do pedido. */
  agora: number;
  /** O idioma aplicado (base ISO, `en`); vazio quando a conta tem menos de dois e nada foi filtrado. */
  idioma: string;
  /** Os idiomas com cartão no baralho, do maior para o menor: a chave do alto do catálogo. */
  idiomas: Array<{ id: string; palavras: number }>;
  tudo: ContagemDaFonte;
  dificeis: ContagemDaFonte;
  /** As sessões com cartão (no idioma aplicado), da mais recente para a mais antiga. */
  sessoes: FonteContada[];
  /** Os baralhos do Anki com cartão, do maior para o menor. */
  anki: FonteContada[];
  /** As palavras da Trilha já ativadas, ou `null` quando não há nenhuma. */
  trilha: ContagemDaFonte | null;
}

/** O que a contagem precisa saber de um cartão. */
export interface CartaoParaContar {
  id: string;
  inDeck: number | null;
  dueAt: number | null;
  lapses: number | null;
  /** A base do idioma (`en`), ou vazio/nulo. */
  idioma: string | null;
  sessionId: string | null;
  sentence: string | null;
}

/** Um par cartão × origem (`vocab_occurrences`): `anki` com o id do baralho, ou `trilha`. */
export interface OrigemParaContar {
  cardId: string;
  tipo: string;
  ref: string | null;
}

export interface SessaoParaContar {
  id: string;
  nome: string;
  tipo: string | null;
  quando: number;
  duracaoMs: number | null;
}

export interface BaralhoParaContar {
  id: string;
  nome: string;
  quando: number;
}

export interface EntradaDaContagem {
  cartoes: readonly CartaoParaContar[];
  origens: readonly OrigemParaContar[];
  /** Só as sessões que existem: cartão de sessão apagada continua em "Tudo", mas a sessão sai da lista. */
  sessoes: readonly SessaoParaContar[];
  baralhos: readonly BaralhoParaContar[];
  /** O idioma pedido (base ISO). Vazio = o maior da conta. */
  idioma: string;
  agora: number;
}

/** Um acumulador: os cartões, os que vencem e as frases distintas (pelo número da frase). */
interface Soma {
  palavras: number;
  paraHoje: number;
  frases: Set<number>;
}

const nova = (): Soma => ({ palavras: 0, paraHoje: 0, frases: new Set() });
const fechar = (s: Soma): ContagemDaFonte => ({ palavras: s.palavras, frases: s.frases.size, paraHoje: s.paraHoje });

function somar(s: Soma, vence: boolean, frase: number): void {
  s.palavras += 1;
  if (vence) s.paraHoje += 1;
  if (frase >= 0) s.frases.add(frase);
}

const ESPACOS = /\s+/;

/** A frase vale para os jogos? 4 palavras ou mais (`frasesDoAcervo`). Devolve a chave de comparação. */
export function chaveDaFraseUtil(sentence: string | null | undefined): string {
  const frase = (sentence ?? '').trim();
  if (!frase || frase.split(ESPACOS).length < 4) return '';
  return frase.toLowerCase();
}

const base = (idioma: string | null | undefined) => (idioma ?? '').toLowerCase().slice(0, 2);
const porId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export function contarConteudo(e: EntradaDaContagem): ContagensDeConteudo {
  /* 1. Os idiomas da conta, sobre o baralho inteiro: é o que decide se há filtro. */
  const porIdioma = new Map<string, number>();
  const noBaralho: CartaoParaContar[] = [];
  for (const c of e.cartoes) {
    if (c.inDeck != null && c.inDeck !== 1) continue;
    noBaralho.push(c);
    const k = base(c.idioma);
    if (k) porIdioma.set(k, (porIdioma.get(k) ?? 0) + 1);
  }
  const idiomas = [...porIdioma]
    .map(([id, palavras]) => ({ id, palavras }))
    .sort((a, b) => b.palavras - a.palavras || porId(a, b));
  const pedido = base(e.idioma);
  const idioma = idiomas.length < 2 ? '' : porIdioma.has(pedido) ? pedido : idiomas[0].id;

  /* 2. Uma passada pelos cartões do idioma: Tudo, Difíceis e cada sessão. */
  const numeroDaFrase = new Map<string, number>();
  const tudo = nova();
  const dificeis = nova();
  const porSessao = new Map<string, Soma>();
  const contado = new Map<string, { vence: boolean; frase: number }>();
  for (const c of noBaralho) {
    if (idioma && base(c.idioma) !== idioma) continue;
    const chave = chaveDaFraseUtil(c.sentence);
    let frase = -1;
    if (chave) {
      frase = numeroDaFrase.get(chave) ?? numeroDaFrase.size;
      numeroDaFrase.set(chave, frase);
    }
    const vence = c.dueAt != null && c.dueAt <= e.agora;
    contado.set(c.id, { vence, frase });
    somar(tudo, vence, frase);
    if ((c.lapses ?? 0) >= ERROS_DE_DIFICIL) somar(dificeis, vence, frase);
    if (c.sessionId) {
      let s = porSessao.get(c.sessionId);
      if (!s) porSessao.set(c.sessionId, (s = nova()));
      somar(s, vence, frase);
    }
  }

  /* 3. As origens: cada baralho do Anki, e a Trilha (uma só; o cartão conta uma vez). */
  const porBaralho = new Map<string, Soma>();
  const trilha = nova();
  const vistos = new Set<string>();
  for (const o of e.origens) {
    const c = contado.get(o.cardId);
    if (!c) continue;
    const marca = `${o.tipo}|${o.tipo === 'anki' ? (o.ref ?? '') : ''}|${o.cardId}`;
    if (vistos.has(marca)) continue;
    vistos.add(marca);
    if (o.tipo === 'anki') {
      if (!o.ref) continue;
      let b = porBaralho.get(o.ref);
      if (!b) porBaralho.set(o.ref, (b = nova()));
      somar(b, c.vence, c.frase);
    } else if (o.tipo === 'trilha') {
      somar(trilha, c.vence, c.frase);
    }
  }

  const sessoes: FonteContada[] = [];
  for (const s of e.sessoes) {
    const soma = porSessao.get(s.id);
    if (!soma) continue;
    sessoes.push({ id: s.id, nome: s.nome, tipo: s.tipo, quando: s.quando, duracaoMs: s.duracaoMs, ...fechar(soma) });
  }
  sessoes.sort((a, b) => b.quando - a.quando || porId(a, b));

  const anki: FonteContada[] = [];
  for (const b of e.baralhos) {
    const soma = porBaralho.get(b.id);
    if (!soma) continue;
    anki.push({ id: b.id, nome: b.nome, tipo: null, quando: b.quando, duracaoMs: null, ...fechar(soma) });
  }
  anki.sort((a, b) => b.palavras - a.palavras || porId(a, b));

  return {
    agora: e.agora,
    idioma,
    idiomas,
    tudo: fechar(tudo),
    dificeis: fechar(dificeis),
    sessoes,
    anki,
    trilha: trilha.palavras ? fechar(trilha) : null,
  };
}
