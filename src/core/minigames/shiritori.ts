import type { MinigameItem } from './types';
import { MINIGAMES } from './types';

/**
 * A CORRENTE DO SHIRITORI — montada ANTES da rodada, a partir do baralho.
 *
 * O jogo original encadeava contra um dicionário inglês fixo de 100+ palavras e ainda aceitava
 * digitação livre: qualquer palavra com a letra certa virava acerto, sem cartão por trás e sem
 * nada para agendar. Aqui a corrente é uma ORDENAÇÃO dos itens da rodada — se o material não
 * fecha uma corrente, não há rodada, e o componente sai.
 *
 * Está fora do React porque é combinatória: achar a maior sequência em que a última letra de uma
 * palavra é a primeira da seguinte é busca com retorno, e busca com retorno se testa sozinha.
 */

/** Menos que isto não é corrente: uma palavra de abertura e duas escolhas. */
export const PASSOS_MINIMOS = 2;

/** Quantas palavras a busca considera. Acima disto o custo da busca deixa de valer a pena. */
const TETO_DO_POOL = 60;

/** Escolhas por passo: a certa e até dois distratores reais. */
const OPCOES_POR_PASSO = 3;

/** Só letras, minúsculas, sem acento — 'Água' e 'agua' terminam e começam igual. */
function letras(palavra: string): string {
  return (palavra ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}]/gu, '');
}

export function letraInicial(palavra: string): string {
  return letras(palavra)[0] ?? '';
}

export function letraFinal(palavra: string): string {
  const l = letras(palavra);
  return l[l.length - 1] ?? '';
}

/** Fisher-Yates. Injetável para o teste ser determinístico. */
function embaralhar<T>(xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * A maior corrente possível no material, ou vazio.
 *
 * Busca exaustiva com retorno: o guloso não serve, porque a primeira palavra que cabe pode ser
 * justamente a que fecha a saída da corrente. O custo é fatorial e por isso a entrada é cortada
 * no teto do próprio jogo.
 */
export function maiorCorrente(items: MinigameItem[]): MinigameItem[] {
  const vistas = new Set<string>();
  const uteis = items
    .filter((i) => {
      const chave = letras(i.answer);
      if (!chave || vistas.has(chave)) return false; // repetir palavra é falta no shiritori
      vistas.add(chave);
      return true;
    })
    .slice(0, TETO_DO_POOL);

  /* O corte que torna a busca viavel e a PROFUNDIDADE, nao o tamanho do pool. Cortar o pool no
     teto da rodada (8) era o mesmo que perguntar "estas 8 palavras encadeiam?", e 8 palavras
     tiradas do baralho quase nunca encadeiam — o jogo praticamente nunca abria. Procurando a
     corrente de ate 8 dentro de um pool de 60, cada nivel so considera as poucas palavras que
     comecam com a letra exigida, e a busca para assim que a corrente enche. */
  const alvo = MINIGAMES.shiritori.maxItems;
  let melhor: MinigameItem[] = [];
  const usado = new Array<boolean>(uteis.length).fill(false);
  const atual: MinigameItem[] = [];

  const buscar = (): void => {
    if (atual.length > melhor.length) melhor = [...atual];
    if (melhor.length >= alvo) return;
    const exigida = atual.length ? letraFinal(atual[atual.length - 1].answer) : '';
    for (let i = 0; i < uteis.length; i++) {
      if (usado[i]) continue;
      if (exigida && letraInicial(uteis[i].answer) !== exigida) continue;
      usado[i] = true;
      atual.push(uteis[i]);
      buscar();
      atual.pop();
      usado[i] = false;
      if (melhor.length >= alvo) return;
    }
  };
  buscar();
  return melhor;
}

/** Um elo perguntado: a palavra que continua, a letra exigida e as escolhas na tela. */
export interface PassoDaCorrente {
  item: MinigameItem;
  /** Letra com que a resposta precisa começar (a última da palavra anterior), em maiúscula. */
  letra: string;
  /** A certa e os distratores, já embaralhados. */
  opcoes: string[];
}

export interface CorrenteShiritori {
  /** Abre a corrente: é mostrada, não perguntada — não vira outcome. */
  inicio: MinigameItem;
  passos: PassoDaCorrente[];
}

/**
 * A rodada inteira, pronta. `null` quando o material não dá corrente — o componente chama `onExit`.
 *
 * Distrator é `answer` de outro item que NÃO serve para a letra exigida: um que servisse teria
 * duas respostas certas na tela. Sem nenhum distrator a corrente para ali, porque opção única
 * daria ponto sem a pessoa ter recuperado nada.
 */
export function montarCorrente(
  items: MinigameItem[],
  shuffle: <T>(xs: T[]) => T[] = embaralhar,
): CorrenteShiritori | null {
  const corrente = maiorCorrente(items);
  if (corrente.length < PASSOS_MINIMOS + 1) return null;

  const passos: PassoDaCorrente[] = [];
  for (let i = 1; i < corrente.length; i++) {
    const alvo = corrente[i];
    const letra = letraFinal(corrente[i - 1].answer);
    const distratores = shuffle([
      ...new Set(
        items
          .map((x) => x.answer)
          .filter((a) => a !== alvo.answer && letraInicial(a) !== letra),
      ),
    ]).slice(0, OPCOES_POR_PASSO - 1);
    if (!distratores.length) break;
    passos.push({
      item: alvo,
      letra: letra.toUpperCase(),
      opcoes: shuffle([alvo.answer, ...distratores]),
    });
  }

  return passos.length >= PASSOS_MINIMOS ? { inicio: corrente[0], passos } : null;
}

/** Os itens que sobrevivem a montagem da corrente. Vazio quando o material nao encadeia. */
export function itensDaCorrente(items: MinigameItem[]): MinigameItem[] {
  const c = montarCorrente(items);
  return c ? [c.inicio, ...c.passos.map((p) => p.item)] : [];
}
