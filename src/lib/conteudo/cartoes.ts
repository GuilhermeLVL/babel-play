/**
 * O CONTEÚDO ESCOLHIDO, NOS CARTÕES — o recorte da tela Cartões e da fila de revisão pela fonte do
 * seletor (`fsNaFonte()`, `fsHojeN()` e `fsBaralho()` de `seletor.js:22-39`). Só funções PURAS.
 *
 * O PREDICADO é o mesmo de `contarConteudo` (`core/learning/contagensDeConteudo.ts`), para a lista de
 * Palavras e a fila da revisão terem o que o catálogo contou:
 *   Tudo      todo cartão (do idioma);
 *   Difíceis  errada 8 vezes ou mais (`lapses >= ERROS_DE_DIFICIL`);
 *   sessão    nascido dela (`sourceSessionId`);
 *   Anki      do baralho (`baralhosAnki`);
 *   Trilha    da Trilha (`daTrilha`).
 * SEMPRE no idioma do conteúdo, quando a conta tem dois idiomas ou mais; com um só, nada é filtrado por
 * idioma (o cartão sem idioma continua contando).
 */
import type { ContagemDaFonte, ContagensDeConteudo } from '../../core/learning/contagensDeConteudo';
import { type ContagemDeFila, ERROS_DE_DIFICIL, type ResumoDosCartoes } from '../../core/learning/resumoDosCartoes';
import type { VocabCard } from '../../types';
import { contagemDaFonte, type Conteudo, type FonteDeConteudo } from './estado';

/** O que o predicado lê de um cartão (o `VocabCard` do app tem todos; `lapses` chega do servidor). */
export type CartaoDaFonte = Pick<VocabCard, 'srcLang' | 'sourceSessionId' | 'daTrilha' | 'baralhosAnki' | 'inDeck'> & {
  lapses?: number | null;
};

const base = (idioma: string | null | undefined) => (idioma ?? '').toLowerCase().slice(0, 2);

/** A palavra é "difícil"? A régua única da tela Cartões, do catálogo e da revisão. */
export const cartaoDificil = (c: { lapses?: number | null }): boolean => (c.lapses ?? 0) >= ERROS_DE_DIFICIL;

/**
 * O idioma que vale para o recorte: vazio com menos de dois idiomas no baralho; senão o pedido, ou o
 * maior da conta quando o pedido não existe (a mesma decisão de `contarConteudo`).
 */
export function idiomaAplicado(cartoes: readonly CartaoDaFonte[], pedido: string): string {
  const porIdioma = new Map<string, number>();
  for (const c of cartoes) {
    if (!c.inDeck) continue;
    const k = base(c.srcLang);
    if (k) porIdioma.set(k, (porIdioma.get(k) ?? 0) + 1);
  }
  if (porIdioma.size < 2) return '';
  const k = base(pedido);
  if (porIdioma.has(k)) return k;
  return [...porIdioma].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0][0];
}

/** O cartão é da fonte? (sem olhar o idioma) */
export function naFonte(c: CartaoDaFonte, f: FonteDeConteudo): boolean {
  if (f.tipo === 'dificeis') return cartaoDificil(c);
  if (f.tipo === 'sessao') return c.sourceSessionId === f.id;
  if (f.tipo === 'anki') return !!c.baralhosAnki?.includes(f.id);
  if (f.tipo === 'trilha') return !!c.daTrilha;
  return true;
}

/** Os cartões do conteúdo: a fonte e, com dois idiomas ou mais, o idioma. Suspensos incluídos. */
export function cartoesDoConteudo<T extends CartaoDaFonte>(cartoes: readonly T[], conteudo: Conteudo): T[] {
  const idioma = idiomaAplicado(cartoes, conteudo.idioma);
  return cartoes.filter((c) => (!idioma || base(c.srcLang) === idioma) && naFonte(c, conteudo.fonte));
}

/** O que a aba Hoje precisa saber da fonte escolhida. */
export interface HojeDaFonte {
  /** Cartões da fonte no baralho. */
  total: number;
  /** O que vence agora, por fase. */
  fila: ContagemDeFila;
  /** `false` quando o resumo não tinha a linha da fonte e as três fases vieram só do total que vence. */
  porFase: boolean;
}

const ZERO: ContagemDeFila = { novas: 0, aprendendo: 0, revisar: 0 };

/**
 * "O RESUMO FILTRADO": o total e a fila de hoje DA FONTE (`fsHojeN()`, `seletor.js:27`).
 *
 * As três fases vêm de `GET /api/vocab/resumo`, que já conta por idioma, por sessão, por baralho do Anki
 * e a Trilha; o total e o "para hoje" vêm de `contagemDaFonte` (`GET /api/vocab/conteudo`). Onde o resumo
 * não tem a linha (uma sessão além das 60 que ele lista), o que vence entra inteiro em "a rever".
 * "Difíceis" não tem linha no resumo, e não precisa: errar 8 vezes pede 8 revisões, então todo cartão
 * difícil está na fase de revisão.
 */
export function hojeDaFonte(
  resumo: Pick<ResumoDosCartoes, 'total' | 'hoje' | 'baralhos'>,
  conteudo: Conteudo,
  contagens: ContagensDeConteudo | null,
): HojeDaFonte {
  const f = conteudo.fonte;
  const contada: ContagemDaFonte | null = contagens ? contagemDaFonte(f, contagens) : null;
  const soDoTotal = (): HojeDaFonte => ({
    total: contada?.palavras ?? 0,
    fila: { ...ZERO, revisar: contada?.paraHoje ?? 0 },
    porFase: false,
  });
  if (f.tipo === 'dificeis') return { ...soDoTotal(), porFase: true };

  let linha: (ContagemDeFila & { total: number }) | null | undefined;
  if (f.tipo === 'tudo') {
    const idioma = contagens?.idioma ?? '';
    if (!idioma) return { total: resumo.total, fila: resumo.hoje, porFase: true };
    linha = resumo.baralhos.idiomas.find((i) => i.id === idioma);
    /* Dois idiomas e nenhum cartão neste: nada vence aqui. */
    if (!linha) return { total: 0, fila: ZERO, porFase: true };
  } else if (f.tipo === 'sessao') linha = resumo.baralhos.sessoes.find((s) => s.id === f.id);
  else if (f.tipo === 'anki') linha = resumo.baralhos.anki.find((b) => b.id === f.id);
  else linha = resumo.baralhos.trilha;

  if (!linha) return soDoTotal();
  const { novas, aprendendo, revisar } = linha;
  return { total: contada?.palavras ?? linha.total, fila: { novas, aprendendo, revisar }, porFase: true };
}

/** A soma da fila: quantos cartões vencem agora. */
export const somaDaFila = (n: ContagemDeFila): number => n.novas + n.aprendendo + n.revisar;
