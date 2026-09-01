import type { VocabCard } from '../../types';
import { isDueNow } from '../learning/due';
import { pistaUtil, chaveComparavel } from '../learning/quality';
import { ordenarPorMemoria, type HistoricoDoItem } from '../learning/memoriaDeItens';
import type { FaixaDificuldade } from './composicao';

/**
 * TERMO JUSTO (seleção v2, 2026-08-28) — três defeitos medidos e consertados aqui:
 *
 *  1. `normalizarPalavra` apaga tudo que não é A–Z DEPOIS de tirar acentos: `œuvre` virava `UVRE`,
 *     `well-being` virava `WELLBEING` (9 letras, fora do teto) e a grade mostrava a forma mutilada.
 *     Agora a chave do Termo preserva letras Unicode e palavras com hífen/espaço ficam FORA com
 *     motivo dito (`diagnosticoTermo`), em vez de entrar coladas.
 *  2. SINÔNIMOS: a pista é uma tradução, e "morto" descreve `dead` e `deceased`. Quem escrevia o
 *     sinônimo certo perdia a tentativa. Agora cada rodada carrega `alternativas` (outras palavras
 *     do MESMO acervo com a mesma tradução) e `julgarPalpite` reconhece o sinônimo: não gasta
 *     tentativa, orienta ("a desta rodada tem 6 letras e começa com S") e revela a 1ª letra.
 *  3. "QUASE": a uma letra da resposta (`distanciaDeEdicao` = 1) na última tentativa, o jogo avisa
 *     sem gastar a tentativa — uma vez por tabuleiro. Erro de digitação não é erro de vocabulário.
 */

/** Chave de comparação do Termo: sem acento, maiúscula, só LETRAS (Unicode). Hífen/espaço somem
 *  aqui só para COMPARAR; a elegibilidade os trata antes (ver `diagnosticoTermo`). */
export function chaveDoTermo(texto: string): string {
  return (texto ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^\p{L}]/gu, '');
}

export type MotivoForaDoTermo = 'hifen-ou-espaco' | 'curta' | 'longa' | 'sem-pista';

/**
 * Por que uma palavra não joga o Termo — para a antessala dizer em vez de sumir com ela.
 *
 * A FAIXA governa o comprimento aceito (ver `LETRAS_POR_FAIXA`). Sem faixa, vale o médio, que é
 * a régua histórica: quem não passa faixa não vê mudança nenhuma.
 */
export function motivoForaDoTermo(
  c: Pick<VocabCard, 'word' | 'translation' | 'inDeck'>,
  faixa: FaixaDificuldade = 'medio',
): MotivoForaDoTermo | null {
  const bruto = (c.word ?? '').trim();
  if (/[\s-]/.test(bruto)) return 'hifen-ou-espaco';
  const n = chaveDoTermo(bruto).length;
  const regua = LETRAS_POR_FAIXA[faixa] ?? LETRAS_POR_FAIXA.medio;
  if (n < regua.min) return 'curta';
  if (n > regua.max) return 'longa';
  if (!pistaUtil(c.translation ?? '')) return 'sem-pista';
  return null;
}

export function diagnosticoTermo(cards: VocabCard[]): { jogaveis: number; foraPor: Record<MotivoForaDoTermo, number> } {
  const foraPor: Record<MotivoForaDoTermo, number> = { 'hifen-ou-espaco': 0, curta: 0, longa: 0, 'sem-pista': 0 };
  let jogaveis = 0;
  for (const c of cards) {
    if (!c.inDeck) continue;
    const m = motivoForaDoTermo(c);
    if (m) foraPor[m] += 1; else jogaveis += 1;
  }
  return { jogaveis, foraPor };
}

/** Levenshtein pequeno, só para o "quase". */
export function distanciaDeEdicao(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

export interface Julgamento {
  palpite: Palpite;
  acertou: boolean;
  /** O palpite é OUTRA palavra válida para a mesma pista (não gasta tentativa). */
  sinonimo?: string;
  /** A uma letra da resposta (não gasta tentativa; uma vez por tabuleiro). */
  quase?: boolean;
  /** Orientação para a tela. */
  dica?: string;
}

/**
 * Julga um palpite CONTRA A RODADA (resposta + alternativas), não só contra a resposta.
 * `quaseJaUsado`: o aviso de "quase" só vale uma vez por tabuleiro.
 */
export function julgarPalpite(palpiteBruto: string, rodada: RodadaTermo, opts: { ultimaTentativa?: boolean; quaseJaUsado?: boolean } = {}): Julgamento {
  const palpite = avaliarPalpite(palpiteBruto, rodada.resposta);
  if (acertou(palpite)) return { palpite, acertou: true };
  const chave = chaveDoTermo(palpiteBruto);
  const sinonimo = (rodada.alternativas ?? []).find((a) => chaveDoTermo(a) === chave);
  if (sinonimo) {
    const alvo = rodada.resposta;
    return {
      palpite, acertou: false, sinonimo,
      dica: `"${sinonimo}" também significa isso — mas a desta rodada tem ${alvo.length} letras e começa com ${alvo[0]}.`,
    };
  }
  if (opts.ultimaTentativa && !opts.quaseJaUsado && distanciaDeEdicao(chave, rodada.resposta) === 1) {
    return { palpite, acertou: false, quase: true, dica: 'Quase: uma letra de diferença. Esta não conta como tentativa.' };
  }
  return { palpite, acertou: false };
}

/**
 * TERMO — soletrar a palavra a partir do significado.
 *
 * A DIFERENÇA PARA O TERMO/WORDLE ORIGINAL, e a razão de ela existir: lá você adivinha às cegas
 * uma palavra sorteada de uma lista curada — é quebra-cabeça, e o vocabulário é quase incidental.
 * Aqui a TRADUÇÃO aparece como pista, então a pessoa já sabe QUAL palavra é; o que ela precisa
 * fazer é lembrar COMO SE ESCREVE. Vira produção ortográfica, que é a lacuna do app: nenhum
 * exercício treinava escrever a palavra letra a letra.
 *
 * Consequência de desenho: fica mais fácil que o Termo original. É de propósito — o objetivo é
 * treinar, não derrotar o jogador. Para palavras já firmes no agendador existe o modo difícil,
 * sem pista, que aí sim é o jogo clássico.
 */

/** O que cada letra da tentativa diz sobre a resposta. */
export type EstadoLetra = 'certa' | 'existe' | 'ausente';

export interface Palpite {
  letras: string[];
  estados: EstadoLetra[];
}

/**
 * Tamanhos aceitos. Abaixo de 4 é trivial; acima de 6 vira PAREDE.
 *
 * O teto era 8, e a faixa difícil o esticava até 10. Na tela isso deixou de ser dificuldade e
 * virou defeito: um dueto de 10 letras são vinte quadrados numa linha atravessando o monitor
 * inteiro, e o quarteto seriam quarenta. Ninguém lê uma palavra assim como palavra — lê como
 * grade —, e o teclado desce para fora da dobra.
 *
 * O 6 foi MEDIDO na trilha inteira, contando o maior grupo de mesmo comprimento por etapa (que é
 * o que o Termo de fato consome). Descer de 8 para 6 praticamente não custa material — B1 vai de
 * 27 para 27 etapas jogáveis em 28, B2 de 20 para 19 em 21 —, enquanto descer para 5 quebraria
 * um quinto do B1 (27 → 22 de 28) e deixaria C1/C2 na mediana de 3, o mínimo absoluto da escada.
 * Difícil passa a ser quantos tabuleiros ao mesmo tempo, não quantos quadrados por linha.
 */
export const MIN_LETRAS = 4;
export const MAX_LETRAS = 6;

/**
 * O COMPRIMENTO DA PALAVRA É DIFICULDADE — e era a alavanca que a faixa não alcançava.
 *
 * O Termo tinha régua única (4–8 letras) para todo mundo. A faixa (`facil`/`medio`/`dificil`) já
 * existia e já recortava o material da rodada; faltava ela chegar às duas coisas que decidem o
 * custo real deste jogo: quantas letras a palavra tem e até quantos tabuleiros a escada sobe.
 *
 * NENHUMA FAIXA PASSA DE `MAX_LETRAS`. O comprimento serve para separar o começo do resto —
 * fácil fica em palavras curtas (4–5), difícil tira as curtas da mesa (5–6) —, mas o teto é o
 * mesmo para todo mundo, porque acima dele o problema deixa de ser dificuldade e vira parede.
 * Quem escala a dificuldade de verdade é `ESCADA_POR_FAIXA`: quantos tabuleiros de uma vez.
 */
export const LETRAS_POR_FAIXA: Record<FaixaDificuldade, { min: number; max: number }> = {
  facil: { min: 4, max: 5 },
  medio: { min: MIN_LETRAS, max: MAX_LETRAS },
  dificil: { min: 5, max: MAX_LETRAS },
};
/**
 * Tentativas por MODO, como no jogo original: quanto mais tabuleiros simultâneos, mais chances.
 * A conta do original é boa e não vale reinventar — com 4 palavras e 6 tentativas o jogo é
 * matematicamente quase impossível, e um jogo injusto não ensina, só frustra.
 */
export const TENTATIVAS_POR_MODO: Record<ModoTermo, number> = { termo: 6, dueto: 7, quarteto: 9 };
/** Compatibilidade: o modo simples. */
export const MAX_TENTATIVAS = 6;

/** Quantos tabuleiros são resolvidos ao mesmo tempo. */
export type ModoTermo = 'termo' | 'dueto' | 'quarteto';
export const TABULEIROS_POR_MODO: Record<ModoTermo, number> = { termo: 1, dueto: 2, quarteto: 4 };

/**
 * A ESCADA — 1 tabuleiro, depois 2, depois 4, subindo A CADA ACERTO.
 *
 * Por que não três jogos separados no lobby, como estavam: eram três cartas para a mesma coisa,
 * e quem chegava tinha de escolher a dificuldade ANTES de saber se dava conta. Escolher difícil
 * cedo demais frustra; escolher fácil demais entedia — e nos dois casos a pessoa refaz o mesmo
 * caminho na carta seguinte. Como escada, a dificuldade se ajusta sozinha: quem acerta sobe, e
 * quem não acerta parou no degrau que era o dele.
 */
export const ESCADA_PADRAO: number[] = [1, 2, 4];

/**
 * ATÉ ONDE A ESCADA SOBE, por faixa. Cada degrau é o número de tabuleiros simultâneos.
 *
 * O quarteto deixa de ser o destino de todo mundo. Na tela ele é uma parede — quatro grades lado
 * a lado, nove linhas de tentativa cada, e um teclado embaixo —, e quem estava começando recebia
 * exatamente o mesmo jogo de quem já domina. No fácil a escada não sobe: um tabuleiro por vez,
 * três vezes; a repetição é o que ensina, e dividir a atenção em quatro no começo só ensina a
 * desistir. O difícil mantém o 1→2→4 original.
 */
export const ESCADA_POR_FAIXA: Record<FaixaDificuldade, number[]> = {
  facil: [1, 1, 1],
  medio: [1, 2, 2],
  dificil: [1, 2, 4],
};

/** O modo correspondente a um número de tabuleiros (é o que decide as tentativas do degrau). */
export function modoDeTabuleiros(n: number): ModoTermo {
  return n >= 4 ? 'quarteto' : n === 2 ? 'dueto' : 'termo';
}

/**
 * Quais degraus cabem no que a pessoa tem. Com 5 palavras jogáveis dá para 1+2 mas não para o
 * quarteto — e é melhor uma escada curta e honesta do que um degrau que falha ao pisar.
 */
export function planoDaEscada(palavrasDisponiveis: number, escada: number[] = ESCADA_PADRAO): number[] {
  const plano: number[] = [];
  let usadas = 0;
  for (const degrau of escada) {
    if (usadas + degrau > palavrasDisponiveis) break;
    plano.push(degrau);
    usadas += degrau;
  }
  return plano;
}

/**
 * QUANTAS PALAVRAS A ESCADA REALMENTE CONSOME. 0–2 → 0 · 3–6 → 3 · ≥7 → 7.
 *
 * O DEFEITO QUE ISTO CONSERTA — e ele deixou o jogo inteiro inacessível por meses.
 *
 * A carta do Termo liberava com 3 palavras do mesmo tamanho (`contarJogaveisMulti >= minItems`,
 * e o 3 está certo: é o piso da escada `[1,2]`). Mas quem montava a rodada pedia `quantidade: 7`
 * fixo, e `buildTermoRounds` com `mesmoTamanho` é tudo-ou-nada: abaixo do pedido devolve `[]`.
 * Entre 3 e 6 palavras a carta ficava verde e o clique não fazia NADA — `montarRodada` devolvia
 * `null` e quem chamava engolia em silêncio.
 *
 * Os dois lados mediam a mesma grandeza (`maiorGrupoPorTamanho(...).length`); só os limiares nunca
 * foram combinados. Esta função é o número que faltava: o único que a rodada de fato entrega.
 *
 * Repare que 4, 5 e 6 continuam produzindo rodada de 3 — o quarteto não cabe, e uma escada curta e
 * honesta é melhor que um degrau que falha ao pisar. É a mesma regra que `planoDaEscada` já dizia.
 */
export function consumoDaEscada(disponiveis: number, escada: number[] = ESCADA_PADRAO): number {
  return planoDaEscada(disponiveis, escada).reduce((soma, degrau) => soma + degrau, 0);
}

/**
 * DOIS DEGRAUS É O MÍNIMO PARA SER UMA ESCADA.
 *
 * Com uma palavra só, `planoDaEscada` devolve `[1]` — aritmeticamente correto e sem sentido como
 * jogo: um tabuleiro sozinho é um exercício de soletrar, não o Termo. A identidade deste jogo é a
 * ESCALADA (acertou uma? vêm duas; acertou? vêm quatro), e ela precisa de pelo menos um salto.
 *
 * É também o número que faz o gate e o construtor fecharem exatamente: `MINIGAMES.termo.minItems`
 * é 3, e 3 é justamente o material do plano `[1, 2]`. Sem esta constante, o construtor aceitaria
 * 1 e 2 palavras que a carta bloqueia — a mesma classe de divergência que deixou o jogo
 * inacessível, só que na direção oposta.
 */
export const DEGRAUS_MINIMOS = 2;

/**
 * A rodada do Termo, JÁ dimensionada pela escada. É o único caminho que o lobby deve usar.
 *
 * Existe para que o tamanho não POSSA divergir: ela mesma conta o material, deriva o consumo e
 * chama o construtor com o número certo. Enquanto o cálculo do tamanho morava em quem chamava, ele
 * divergiu — e foi assim que o jogo sumiu.
 *
 * `buildTermoRounds` mantém a semântica de exato-N (há testes que a fixam e outros chamadores que
 * dependem dela). Quem se ajusta é esta camada.
 *
 * O SEGUNDO CORTE não é redundante: depois de escolher o grupo, o construtor ainda descarta pistas
 * repetidas — duas palavras traduzidas igual tornam o degrau logicamente insolúvel. Isso pode
 * devolver menos do que foi pedido, então o plano é recalculado sobre o que HOUVE, não sobre o que
 * se esperava. Sem isso, uma rodada de 5 tentaria montar um quarteto que não existe.
 */
export function rodadasDaEscada(
  cards: VocabCard[],
  opts: { dificil?: boolean; now?: number; shuffle?: <T>(xs: T[]) => T[]; evitar?: ReadonlySet<string>; memoria?: ReadonlyMap<string, HistoricoDoItem>; semente?: string; diaDe?: (ts: number) => number; faixa?: FaixaDificuldade } = {},
): RodadaTermo[] {
  /* A FAIXA GOVERNA AS DUAS ALAVANCAS que decidem o custo do Termo: quantas letras a palavra pode
     ter e até quantos tabuleiros a escada sobe. Sem ela, todo mundo recebia 4–8 letras e o
     quarteto no fim — o mesmo jogo para quem começou hoje e para quem já domina. */
  const faixa = opts.faixa ?? 'medio';
  const escada = ESCADA_POR_FAIXA[faixa] ?? ESCADA_PADRAO;
  const disponiveis = contarJogaveisMulti(cards, faixa);
  if (planoDaEscada(disponiveis, escada).length < DEGRAUS_MINIMOS) return [];

  const rodadas = buildTermoRounds(cards, { ...opts, faixa, quantidade: consumoDaEscada(disponiveis, escada), mesmoTamanho: true });
  if (planoDaEscada(rodadas.length, escada).length < DEGRAUS_MINIMOS) return [];
  return rodadas.slice(0, consumoDaEscada(rodadas.length, escada));
}

/** Fatia as palavras nos degraus do plano (1, depois 2, depois 4). */
export function montarEscada(rodadas: RodadaTermo[], plano: number[]): RodadaTermo[][] {
  const grupos: RodadaTermo[][] = [];
  let i = 0;
  for (const degrau of plano) {
    if (i + degrau > rodadas.length) break;
    grupos.push(rodadas.slice(i, i + degrau));
    i += degrau;
  }
  return grupos;
}

/**
 * Avalia uma tentativa contra a resposta.
 *
 * O CASO DIFÍCIL são as letras REPETIDAS, e é onde quase toda implementação erra. Se a resposta
 * é "CASA" e a tentativa é "AAAA", só DUAS letras podem ficar marcadas — a palavra tem dois "A".
 * A regra correta exige duas passadas: primeiro marca as posições exatas e CONSOME essas letras
 * do estoque; só depois distribui o que sobrou entre as amarelas, da esquerda para a direita.
 * Uma passada só produziria quatro amarelas e mentiria para o jogador.
 */
export function avaliarPalpite(palpite: string, resposta: string): Palpite {
  const p = chaveDoTermo(palpite).split('');
  const r = chaveDoTermo(resposta).split('');
  const estados: EstadoLetra[] = new Array(p.length).fill('ausente');

  // Estoque de letras da resposta ainda "disponíveis" para casar.
  const estoque = new Map<string, number>();
  for (const letra of r) estoque.set(letra, (estoque.get(letra) ?? 0) + 1);

  // 1ª passada: posições exatas consomem do estoque.
  for (let i = 0; i < p.length; i++) {
    if (p[i] === r[i]) {
      estados[i] = 'certa';
      estoque.set(p[i], (estoque.get(p[i]) ?? 0) - 1);
    }
  }
  // 2ª passada: o que sobrou vira amarelo, enquanto houver estoque.
  for (let i = 0; i < p.length; i++) {
    if (estados[i] === 'certa') continue;
    const restante = estoque.get(p[i]) ?? 0;
    if (restante > 0) {
      estados[i] = 'existe';
      estoque.set(p[i], restante - 1);
    }
  }
  return { letras: p, estados };
}

/** Acertou? (todas as letras certas) */
export function acertou(palpite: Palpite): boolean {
  return palpite.estados.length > 0 && palpite.estados.every(e => e === 'certa');
}

/**
 * Estado consolidado do TECLADO: uma letra usada em vários palpites mostra o MELHOR resultado
 * já obtido. Sem isso, uma letra que já apareceu verde voltaria a cinza no palpite seguinte e o
 * jogador perderia a informação que conquistou.
 */
export function estadoDoTeclado(palpites: Palpite[]): Record<string, EstadoLetra> {
  const ordem: Record<EstadoLetra, number> = { ausente: 0, existe: 1, certa: 2 };
  const mapa: Record<string, EstadoLetra> = {};
  for (const p of palpites) {
    p.letras.forEach((letra, i) => {
      const novo = p.estados[i];
      if (!mapa[letra] || ordem[novo] > ordem[mapa[letra]]) mapa[letra] = novo;
    });
  }
  return mapa;
}

export interface RodadaTermo {
  cardId?: string;
  /** A palavra a soletrar, já normalizada (só letras, maiúsculas). */
  resposta: string;
  /**
   * A palavra COMO ESTÁ NO BARALHO — acentos, caixa e tudo.
   *
   * Existe porque `resposta` é normalizada para o teclado do jogo, e usá-la como identidade
   * partiria o histórico em dois: o Termo gravaria "HOUSE" enquanto Memória e Duelo gravam
   * "house", e "o que eu já vi" passaria a contar a mesma palavra duas vezes. O `item_ref` de
   * `exercise_results` precisa ser o MESMO valor em todos os jogos.
   */
  palavra: string;
  /** A pista (tradução). Vazia no modo difícil. */
  pista: string;
  lang: string;
  /** Outras palavras do acervo com a MESMA tradução (sinônimos aceitos por `julgarPalpite`). */
  alternativas?: string[];
  /** Frase de contexto, quando a pista é ambígua (tem alternativas). */
  contexto?: string;
}

/**
 * A PISTA PRESTA? — a régua mora agora em `core/learning/quality.ts`.
 *
 * Ela nasceu aqui, dentro do Termo, mas o defeito nunca foi do Termo: era do funil que alimenta
 * TODOS os jogos. Subiu de lugar e continua exportada daqui só para não quebrar quem já a
 * importava — a implementação é uma só.
 */
export { pistaUtil } from '../learning/quality';

/**
 * Sorteia as palavras jogáveis do baralho: só as que têm tradução ÚTIL (a pista) e tamanho na
 * faixa. Vencidas primeiro — jogar é também revisar.
 */
/** Fisher-Yates. Injetável para o teste ser determinístico — mesmo padrão de `itemSource.ts`. */
function embaralhar<T>(xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function buildTermoRounds(
  cards: VocabCard[],
  opts: { quantidade?: number; dificil?: boolean; now?: number; mesmoTamanho?: boolean;
          shuffle?: <T>(xs: T[]) => T[]; evitar?: ReadonlySet<string>;
          memoria?: ReadonlyMap<string, HistoricoDoItem>; semente?: string; diaDe?: (ts: number) => number;
          faixa?: FaixaDificuldade } = {},
): RodadaTermo[] {
  const now = opts.now ?? Date.now();
  const quantidade = opts.quantidade ?? 5;
  // Elegibilidade pela chave Unicode (ver `motivoForaDoTermo`): hífen/espaço fora, acentos ok.
  // A FAIXA entra aqui: é ela que decide o comprimento aceito (ver `LETRAS_POR_FAIXA`).
  let candidatos = cards.filter(c => c.inDeck && motivoForaDoTermo(c, opts.faixa ?? 'medio') === null);
  /* SINÔNIMOS DO ACERVO: para cada tradução, quais palavras (do acervo INTEIRO recebido) a
     carregam. É o que permite aceitar "deceased" quando a rodada pediu "dead". */
  const porPista = new Map<string, string[]>();
  for (const c of cards) {
    if (!c.inDeck) continue;
    const chave = chaveComparavel(c.translation ?? '');
    if (!chave) continue;
    const lista = porPista.get(chave) ?? [];
    const w = (c.word ?? '').trim();
    if (w && !lista.includes(w)) lista.push(w);
    porPista.set(chave, lista);
  }

  // NO DUETO/QUARTETO as palavras PRECISAM ter o mesmo tamanho: o palpite é um só e é avaliado
  // em todos os tabuleiros ao mesmo tempo — com tamanhos diferentes não existe palpite válido.
  // (No original isso é de graça, todas as palavras têm 5 letras; aqui elas vêm do baralho.)
  if (opts.mesmoTamanho) {
    const grupo = maiorGrupoPorTamanho(candidatos);
    if (grupo.length < quantidade) return [];
    candidatos = grupo;
  }

  /**
   * ANTES NÃO HAVIA SORTEIO NENHUM AQUI, e o efeito foi medido: as MESMAS 7 palavras em 5 rodadas
   * seguidas, num baralho de 200 — 100% de repetição. A ordem era a do array recebido, com os
   * vencidos empurrados à frente, e `slice(0, 7)` sempre pegava o mesmo começo. Pior no Dueto/
   * Quarteto, onde `mesmoTamanho` já reduz o pool ao maior grupo de mesmo comprimento.
   *
   * O embaralhamento é DENTRO de cada grupo: vencido continua vindo primeiro (a revisão espaçada
   * pede isso), mas qual vencido varia. E `evitar` empurra para o fim o que acabou de cair.
   */
  const shuffle = opts.shuffle ?? embaralhar;
  const evitar = opts.evitar;
  const semPenalidade = (c: VocabCard) => !evitar?.has(c.word);
  let ordenados: VocabCard[];
  if (opts.memoria && opts.semente) {
    // Seleção v2: régua de memória + semente própria do Termo (rotação distinta dos outros jogos).
    const { ordenados: porMemoria } = ordenarPorMemoria(candidatos, c => c.word, {
      memoria: opts.memoria, semente: `termo:${opts.semente}`, agora: now,
      diaDe: opts.diaDe ?? ((ts) => Math.floor(ts / 86_400_000)),
      urgente: c => isDueNow(c, 'fsrs', now), cotaDeNovas: 0.3, limite: quantidade,
    });
    ordenados = !evitar?.size ? porMemoria : [...porMemoria.filter(semPenalidade), ...porMemoria.filter(c => !semPenalidade(c))];
  } else {
    const grupo = (vencido: boolean) => shuffle(candidatos.filter(c => isDueNow(c, 'fsrs', now) === vencido));
    const porUrgencia = [...grupo(true), ...grupo(false)];
    ordenados = !evitar?.size
      ? porUrgencia
      : [...porUrgencia.filter(semPenalidade), ...porUrgencia.filter(c => !semPenalidade(c))];
  }

  /**
   * PISTA REPETIDA NÃO ENTRA DUAS VEZES — e aqui isso é mais grave que em qualquer outro jogo.
   *
   * No Termo a pista é a ÚNICA informação: você lê "morto" e tem de escrever a palavra inteira,
   * letra por letra. Com `body → morto` e `dead → morto` no mesmo degrau, não existe palpite certo
   * — e no Dueto/Quarteto, onde um palpite é avaliado em todos os tabuleiros ao mesmo tempo, duas
   * pistas iguais tornam o degrau logicamente insolúvel.
   *
   * No modo difícil a pista é vazia de propósito (`opts.dificil`), e aí a regra não se aplica:
   * sem pista não há pista repetida.
   */
  const escolhidos: VocabCard[] = [];
  const pistasUsadas = new Set<string>();
  for (const c of ordenados) {
    if (escolhidos.length >= quantidade) break;
    if (!opts.dificil) {
      const chave = chaveComparavel(c.translation ?? '');
      if (chave && pistasUsadas.has(chave)) continue;
      pistasUsadas.add(chave);
    }
    escolhidos.push(c);
  }

  return escolhidos.map(c => {
    const palavra = (c.word ?? '').trim();
    const alternativas = (porPista.get(chaveComparavel(c.translation ?? '')) ?? []).filter(w => chaveDoTermo(w) !== chaveDoTermo(palavra));
    return {
      cardId: c.id,
      resposta: chaveDoTermo(palavra),
      palavra,
      pista: opts.dificil ? '' : (c.translation ?? '').trim(),
      lang: c.srcLang || '',
      ...(alternativas.length ? { alternativas } : {}),
      // Pista ambígua nasce com a frase de contexto (quando existe): é o desempate honesto.
      ...(alternativas.length && (c.sentence ?? '').trim() ? { contexto: (c.sentence ?? '').trim() } : {}),
    };
  });
}

/** O maior conjunto de cartões que compartilham o mesmo número de letras (desempate: mais curto). */
function maiorGrupoPorTamanho(cards: VocabCard[]): VocabCard[] {
  const porTamanho = new Map<number, VocabCard[]>();
  for (const c of cards) {
    const n = chaveDoTermo(c.word ?? '').length;
    const lista = porTamanho.get(n);
    if (lista) lista.push(c); else porTamanho.set(n, [c]);
  }
  let melhor: VocabCard[] = [];
  for (const [tamanho, lista] of porTamanho) {
    const tamanhoMelhor = melhor.length ? chaveDoTermo(melhor[0].word ?? '').length : Infinity;
    if (lista.length > melhor.length || (lista.length === melhor.length && tamanho < tamanhoMelhor)) melhor = lista;
  }
  return melhor;
}

/**
 * Quantos tabuleiros o baralho aguenta no Dueto/Quarteto — que NÃO é o total de palavras
 * jogáveis, e sim o tamanho do maior grupo de mesmo comprimento. Um baralho com 20 palavras
 * todas de comprimentos diferentes não joga Dueto, e a tela precisa dizer isso com número.
 */
export function contarJogaveisMulti(cards: VocabCard[], faixa: FaixaDificuldade = 'medio'): number {
  const jogaveis = cards.filter(c => c.inDeck && motivoForaDoTermo(c, faixa) === null);
  return maiorGrupoPorTamanho(jogaveis).length;
}

/**
 * ESTADO DO TECLADO no Dueto/Quarteto.
 *
 * Com vários tabuleiros, a mesma letra pode ser verde num e ausente noutro — e é aí que o
 * teclado do jogo original fica ambíguo. A regra aqui: mostra o MELHOR estado entre os
 * tabuleiros AINDA ABERTOS. Contar tabuleiro já resolvido pintaria de verde uma letra que não
 * ajuda mais em nada, que é pior do que não pintar.
 */
export function estadoDoTecladoMulti(palpitesPorTabuleiro: Palpite[][], resolvidos: boolean[]): Record<string, EstadoLetra> {
  const abertos = palpitesPorTabuleiro.filter((_, i) => !resolvidos[i]);
  return estadoDoTeclado(abertos.flat());
}

/**
 * As letras que a pessoa JÁ DESCOBRIU, por posição (null onde ainda não sabe).
 *
 * Serve para a interface mostrar, em cinza, o que já foi conquistado dentro da linha que está
 * sendo digitada. Não é dica: essa informação já está na tela, espalhada pelas tentativas
 * anteriores — o que muda é ela ficar ONDE a pessoa vai escrever, em vez de obrigar a olhar
 * para cima e transcrever de cabeça.
 */
export function letrasCertas(palpites: Palpite[], tamanho: number): (string | null)[] {
  const certas: (string | null)[] = new Array(tamanho).fill(null);
  for (const p of palpites) {
    p.estados.forEach((e, i) => { if (e === 'certa' && i < tamanho) certas[i] = p.letras[i]; });
  }
  return certas;
}

/**
 * DICA — revela uma letra ainda desconhecida.
 *
 * Devolve a POSIÇÃO e a letra. Custa: quem usa dica tem a nota limitada (ver `gradeFor`), e é
 * assim que a ajuda não vira atalho grátis. Escolhe entre as posições que a pessoa ainda não
 * descobriu; se já descobriu todas, devolve `null` (não há o que revelar).
 */
export function dicaDeLetra(
  resposta: string,
  palpites: Palpite[],
  jaReveladas: Iterable<number> = [],
): { posicao: number; letra: string } | null {
  const conhecidas = new Set<number>(jaReveladas);
  for (const p of palpites) {
    p.estados.forEach((e, i) => { if (e === 'certa') conhecidas.add(i); });
  }
  // `jaReveladas` não é detalhe: sem ele o sorteio repetia uma posição já revelada e a pessoa
  // gastava a ajuda para receber de volta o que já estava na tela.
  const candidatas = resposta.split('').map((_, i) => i).filter(i => !conhecidas.has(i));
  if (!candidatas.length) return null;
  const posicao = candidatas[Math.floor(Math.random() * candidatas.length)];
  return { posicao, letra: resposta[posicao] };
}

/** Quantas palavras do baralho servem para o Termo (a tela usa para gatear com número). */
export function contarJogaveisTermo(cards: VocabCard[]): number {
  return diagnosticoTermo(cards).jogaveis;
}
