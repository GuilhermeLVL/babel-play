import type { VocabCard, SchedulerType } from '../../types';
import { byUrgency, isDueNow } from '../learning/due';
import { makeCloze } from '../learning/cloze';
import { avaliarCartao, chaveComparavel } from '../learning/quality';
import type { MinigameItem, MinigameId } from './types';
import { MINIGAMES } from './types';

/**
 * DE ONDE VÊM OS ITENS DE UMA RODADA.
 *
 * Regra dura do projeto, que vale aqui também: **nada é inventado**. Se um cartão não tem
 * tradução nem frase de origem, não há pista honesta a mostrar — ele fica de fora da rodada em
 * vez de virar uma pergunta fabricada. Antes de gerar definição por IA, o jogo joga com menos
 * palavras (ou avisa que faltam).
 *
 * A pista é sempre a TRADUÇÃO (ou a frase real com lacuna). Nunca a própria palavra: pedir para
 * localizar uma palavra que está à vista é varredura visual, não recuperação de memória.
 *
 * E "ter tradução" NÃO BASTA — é o que se descobriu jogando. A tradução vem de fala capturada, e
 * fala capturada produz "Isso é", "rápida!!", "T-Lisa". Como definição de uma palavra a soletrar,
 * isso não ensina nada e faz o jogo parecer quebrado funcionando. Por isso todo cartão passa por
 * `avaliarCartao` (`core/learning/quality.ts`) antes de virar item.
 */

export interface BuildItemsOptions {
  scheduler?: SchedulerType;
  now?: number;
  /** Embaralhador injetável — o teste passa um determinístico. */
  shuffle?: <T>(xs: T[]) => T[];
  /** Teto de itens; sem isso vale o `maxItems` do jogo. */
  limit?: number;
  /**
   * Itens que acabaram de cair — vão para o FIM da fila, não para fora dela.
   *
   * É penalidade e não exclusão de propósito. Excluir esvaziaria a rodada num baralho pequeno (o
   * mínimo de vários jogos é 4), e um jogo que some ao clicar é pior que um item repetido. Aqui
   * eles só param de competir pelas primeiras posições.
   *
   * A urgência do FSRS continua mandando ENTRE DIAS — é assim que revisão espaçada funciona. O
   * que isto quebra é a repetição IMEDIATA: errou, a palavra venceu na hora, e voltava na rodada
   * seguinte, e na outra, indefinidamente.
   */
  evitar?: ReadonlySet<string>;
}

/** Embaralhamento padrão (Fisher-Yates). Injetável para o teste ser determinístico. */
function embaralhar<T>(xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * A pista honesta de um cartão: tradução, ou a frase real com lacuna. `null` = sem pista.
 *
 * A régua roda ANTES de aceitar a tradução. Quando ela reprova a tradução mas o cartão tem frase
 * de origem, ainda tentamos a lacuna: a frase real é material legítimo mesmo quando a tradução
 * saiu ruim — são dois defeitos independentes.
 */
export function promptFor(card: VocabCard): { prompt: string; clozed: boolean } | null {
  const veredito = avaliarCartao(card);
  // Defeito na PALAVRA (curta, ruído, gramatical) invalida o cartão inteiro; nenhuma pista salva.
  if (!veredito.serve && veredito.motivo !== 'pista-ruim' && veredito.motivo !== 'traducao-igual') return null;

  const traducao = (card.translation ?? '').trim();
  if (traducao && veredito.serve) return { prompt: traducao, clozed: false };

  const frase = (card.sentence ?? '').trim();
  if (frase) {
    const cloze = makeCloze(frase, card.word);
    if (cloze?.prompt) return { prompt: cloze.prompt, clozed: true };
  }
  return null; // sem pista possível — o cartão sai da rodada
}

/**
 * Monta os itens de uma rodada. O blitz puxa os VENCIDOS por urgência (é o jogo da revisão);
 * os demais puxam do baralho embaralhado, priorizando quem está vencido.
 */
export function buildItems(gameId: MinigameId, cards: VocabCard[], opts: BuildItemsOptions = {}): MinigameItem[] {
  const def = MINIGAMES[gameId];
  const scheduler = opts.scheduler ?? 'fsrs';
  const now = opts.now ?? Date.now();
  const shuffle = opts.shuffle ?? embaralhar;
  const limite = opts.limit ?? def.maxItems;

  const noBaralho = cards.filter(c => c.inDeck && (c.word ?? '').trim());
  const vencidos = byUrgency(noBaralho, scheduler, now);
  const resto = noBaralho.filter(c => !isDueNow(c, scheduler, now));

  /**
   * O DOC ACIMA ERA MENTIRA FORA DO DUELO, e o defeito estava numa única linha: a versão anterior
   * fazia `shuffle([...byUrgency(...), ...resto])` — o embaralhamento envolvia a concatenação
   * INTEIRA e dissolvia a ordem que `byUrgency` tinha acabado de produzir. Nenhum jogo além do
   * duelo priorizava vencido coisa nenhuma; era sorteio uniforme sobre o baralho.
   *
   * Agora o embaralhamento é DENTRO de cada grupo: os vencidos continuam na frente (é o que a
   * revisão espaçada pede), mas em ordem variada entre rodadas — sem isso, os mesmos vencidos
   * caíam sempre na mesma sequência e a partida virava repetição. Medido antes do conserto: o
   * Termo entregava as MESMAS 7 palavras em 5 rodadas seguidas, num baralho de 200.
   */
  const base = gameId === 'blitz'
    // O duelo é a revisão cronometrada: do mais atrasado ao menos, sem embaralhar os vencidos —
    // aqui a ordem de urgência É a mecânica. Completa com o resto quando faltam vencidos.
    ? [...vencidos, ...shuffle(resto)]
    : [...shuffle(vencidos), ...shuffle(resto)];

  // Estável: `filter` preserva a ordem acima dentro de cada metade.
  const evitar = opts.evitar;
  const ordenados = !evitar?.size
    ? base
    : [...base.filter(c => !evitar.has(c.word)), ...base.filter(c => evitar.has(c.word))];

  const itens: MinigameItem[] = [];
  /**
   * A PISTA TEM DE IDENTIFICAR A RESPOSTA — a invariante que faltava, e que nenhum cartão isolado
   * pode garantir.
   *
   * `avaliarCartao` valida a FORMA de um cartão, um por um. Ela nunca poderia perceber que dois
   * cartões diferentes têm a MESMA pista: `body → morto` e `dead → morto` são ambos bem-formados,
   * e juntos na mesma rodada produzem um enigma sem resposta — a pessoa lê "morto", escreve
   * "dead", e o jogo diz que errou.
   *
   * Não é caso raro. Medido no léxico embutido: 490 traduções servem a mais de uma palavra
   * inglesa, afetando 1.116 das 3.997 (28%). "conta" é pista de sete palavras diferentes
   * (check, account, bill, calculation, responsibility, responsible, invoice). O baralho
   * capturado tem o mesmo problema, por outro caminho.
   *
   * Recusar um item NÃO interrompe a rodada: o laço continua descendo a lista. Uma rodada com
   * menos itens é jogável; uma rodada com pista ambígua, não.
   */
  const pistasUsadas = new Set<string>();
  for (const card of ordenados) {
    if (itens.length >= limite) break;
    // Memória: o par É palavra↔tradução, então frase-com-lacuna não serve de carta.
    if (def.requiresTranslation && !(card.translation ?? '').trim()) continue;
    const pista = promptFor(card);
    if (!pista) continue;
    /* Caça-PALAVRAS não usa frase como pista. A lacuna vem de fala real e chega a 150 caracteres
       numa coluna estreita: vira parede de texto para um jogo cuja tarefa é achar uma palavra na
       grade. Sem tradução curta, o cartão sai da rodada em vez de virar atrito. */
    if (pista.clozed && gameId === 'wordsearch') continue;
    const chaveDaPista = chaveComparavel(pista.prompt);
    if (chaveDaPista && pistasUsadas.has(chaveDaPista)) continue;
    pistasUsadas.add(chaveDaPista);
    itens.push({
      cardId: card.id,
      prompt: pista.prompt,
      answer: card.word.trim(),
      sentence: card.sentence,
      lang: card.srcLang || '',
      clozed: pista.clozed,
    });
  }
  return itens;
}

/** Há itens suficientes para este jogo? A tela usa isto para habilitar (ou explicar o que falta). */
export function canPlay(gameId: MinigameId, cards: VocabCard[], opts: BuildItemsOptions = {}): { ok: boolean; disponiveis: number; faltam: number } {
  const def = MINIGAMES[gameId];
  const disponiveis = buildItems(gameId, cards, { ...opts, limit: def.maxItems }).length;
  return { ok: disponiveis >= def.minItems, disponiveis, faltam: Math.max(0, def.minItems - disponiveis) };
}

/**
 * Pista ENCURTADA, para espaços estreitos (a lista lateral do caça-palavras).
 *
 * Necessário porque a pista de reserva é a frase real com lacuna, e fala capturada não tem
 * tamanho: apareceram pistas de 150 caracteres numa coluna de 16rem — ilegíveis e quebrando o
 * layout. Aqui a frase é recortada numa JANELA em torno da lacuna, que é a única parte que
 * ajuda a lembrar; reticências avisam que há mais texto (não fingimos que a frase acabou).
 */
export function shortPrompt(prompt: string, max = 64): string {
  const texto = prompt.trim();
  if (texto.length <= max) return texto;
  const lacuna = texto.indexOf('___');
  if (lacuna < 0) return texto.slice(0, max - 1).trimEnd() + '…';
  // Centraliza a janela na lacuna, sem estourar as bordas da frase.
  const metade = Math.floor((max - 3) / 2);
  const ini = Math.max(0, lacuna - metade);
  const fim = Math.min(texto.length, ini + max);
  return (ini > 0 ? '…' : '') + texto.slice(ini, fim).trim() + (fim < texto.length ? '…' : '');
}

/**
 * Alternativas erradas para uma pergunta de múltipla escolha (o duelo). Vêm de OUTRAS palavras
 * reais do baralho — distrator inventado é pista de que a resposta certa é a "estranha".
 * A resposta correta nunca entra na lista.
 */
export function distractorsFor(item: MinigameItem, itens: MinigameItem[], quantidade = 3, shuffle = embaralhar): string[] {
  const alvo = item.answer.toLowerCase();
  const candidatos = itens
    .filter(i => i.answer.toLowerCase() !== alvo)
    .map(i => i.answer);
  return shuffle([...new Set(candidatos)]).slice(0, quantidade);
}
