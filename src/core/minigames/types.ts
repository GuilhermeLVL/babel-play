/**
 * CONTRATO DOS MINIGAMES — TypeScript puro, sem React e sem DOM (roda e é testado em node).
 *
 * Por que um contrato NOVO em vez de estender o dos exercícios: `ExerciseProps` entrega uma
 * SESSÃO (falas, áudio, transcrição). Minigame vive do BARALHO — palavras que a pessoa já
 * salvou, com tradução e estado de memória. São fontes diferentes, e o vazamento já era
 * visível no código antigo, que passava `deckWords` por fora do contrato.
 *
 * A REGRA QUE SUSTENTA TUDO: um jogo só é jogo por fora. Por dentro, cada rodada tem de ser
 * RECUPERAÇÃO — a pessoa precisa buscar a resposta na memória antes de a interface mostrá-la.
 * É a diferença entre um passatempo e um exercício que ensina; caça-palavras clássico, por
 * exemplo, é varredura visual, e por isso aqui a pista é sempre a tradução, nunca a palavra.
 */

/** Os jogos existentes. A tela lê esta lista — nenhuma tela repete a regra de cada um. */
export type MinigameId = 'memory' | 'wordsearch' | 'blitz' | 'termo' | 'scramble' | 'karaoke'
  | 'escuta' | 'ditado' | 'conectores';

/**
 * Um item jogável: a pergunta que a pessoa precisa responder de cabeça.
 *
 * `prompt` é SEMPRE a pista (tradução ou frase com lacuna) e `answer` a palavra-alvo. Nunca o
 * contrário: mostrar a palavra e pedir para achá-la é reconhecimento visual, não memória.
 */
export interface MinigameItem {
  /** Id do cartão de origem. Ausente = item veio de uma fala, e NÃO grava no SRS. */
  cardId?: string;
  /** A pista mostrada à pessoa (tradução, ou a frase real com lacuna). */
  prompt: string;
  /** A palavra que ela precisa lembrar. */
  answer: string;
  /** Frase real de onde a palavra saiu, quando existe (contexto opcional). */
  sentence?: string;
  /** BCP-47/ISO da `answer` — decide a voz do TTS e o teclado. */
  lang: string;
  /** A pista é uma frase com lacuna (e não a tradução)? Muda como a interface a apresenta. */
  clozed?: boolean;
}

/** O que aconteceu com um item durante a rodada. */
export interface ItemOutcome {
  cardId?: string;
  /**
   * O QUE IDENTIFICA ESTE ITEM — a palavra, nos jogos de baralho; o id da fala, nos de frase.
   *
   * Nasceu como `palavra` e o nome ficou mentindo assim que os cinco jogos de frase passaram a
   * reportar identidade: lá o valor é um id de fala, não uma palavra. Um campo com dois
   * significados e um nome só é o tipo de coisa que engana quem for consumir daqui a seis meses.
   *
   * Existe porque `cardId` não basta: os cartões da TRILHA nascem em memória, sem lastro no banco
   * e portanto sem id. Sem isto não havia como saber QUAL item apareceu numa rodada — e é
   * justamente essa a resposta que falta para o usuário saber o que vem, repetir uma rodada e
   * não ficar preso nas mesmas questões. Vai para a coluna `item_ref` de `exercise_results`.
   *
   * Opcional: quando o jogo não sabe identificar o item, o campo fica AUSENTE. Um id fabricado
   * seria pior que a ausência, porque o histórico passaria a mentir.
   */
  itemRef?: string;
  /** Acertou no fim das contas. */
  correct: boolean;
  /** Quantas tentativas até acertar (1 = de primeira). */
  attempts: number;
  /** Tempo até responder, em ms. */
  ms: number;
  /** Usou dica ou revelação. */
  hinted?: boolean;
  /** Desistiu / mandou revelar a resposta. */
  revealed?: boolean;
}

/** O resultado de uma rodada inteira — é o que a raspadinha revela e o que vai para o servidor. */
export interface RoundReport {
  gameId: MinigameId;
  items: ItemOutcome[];
  /** Pontuação do jogo (com combo, tempo etc.). Não é XP — ver `xpFromRound`. */
  score: number;
  durationMs: number;
}

/**
 * Nota do FSRS: 1 = errou, 2 = difícil, 3 = bom, 4 = fácil. Reexportada do AGENDADOR de propósito
 * — declarar um `Grade` próprio aqui criaria dois tipos idênticos que poderiam divergir, e é o
 * agendador quem manda no significado de cada nota.
 */
export type { Grade } from '../learning/scheduler';

/** Declaração de um jogo. A tela "Jogar" lê isto para gatear, rotular e explicar. */
export interface MinigameDef {
  id: MinigameId;
  /** Mínimo de itens para a rodada fazer sentido; abaixo disso o jogo aparece bloqueado. */
  minItems: number;
  /** Teto de itens por rodada (mais que isso cansa e não ensina mais). */
  maxItems: number;
  /** O jogo exige tradução no cartão? A memória exige (o par É a tradução). */
  requiresTranslation: boolean;
  /** Grava nota no SRS? (A raspadinha, por exemplo, não avalia nada.) */
  writesSrs: boolean;
  /**
   * DE QUE MATÉRIA o jogo vive. Era implícito — ficava escondido em qual construtor a tela
   * chamava — e essa implicitude produziu um defeito silencioso: na TRILHA, que tem só palavras,
   * os cinco jogos de frase anunciavam "N falas prontas" e jogavam o áudio de uma gravação
   * qualquer, porque `frases`/`audioSessao` vinham de uma sessão e nem eram função da fonte
   * escolhida. Declarado, o gate passa a poder dizer o motivo certo em vez de "faltam N falas".
   *
   *  · `palavra`     — cartão do baralho. Funciona em qualquer fonte.
   *  · `frase`       — precisa de uma fala real; a trilha não tem.
   *  · `frase-audio` — precisa de fala real COM áudio recortável, ou de voz sintetizada.
   */
  modalidade: 'palavra' | 'frase' | 'frase-audio';
  /**
   * O jogo aceita um ITEM SOLTO (uma palavra) no lugar de uma frase, falado por voz sintetizada?
   *
   * É o que faz escuta/ditado/karaokê funcionarem na trilha: ouvir e escrever a palavra, ouvir e
   * escolher entre palavras parecidas (par mínimo), repetir a palavra em voz alta — todos
   * exercícios legítimos. Caça-conectores e Frase embaralhada não aceitam: conector e ordem de
   * palavras só existem dentro de uma frase, e nenhuma voz resolve isso.
   */
  aceitaPalavraFalada?: boolean;
}

export const MINIGAMES: Record<MinigameId, MinigameDef> = {
  memory: { id: 'memory', minItems: 4, maxItems: 8, requiresTranslation: true, writesSrs: true, modalidade: 'palavra' },
  wordsearch: { id: 'wordsearch', minItems: 4, maxItems: 8, requiresTranslation: false, writesSrs: true, modalidade: 'palavra' },
  blitz: { id: 'blitz', minItems: 4, maxItems: 20, requiresTranslation: false, writesSrs: true, modalidade: 'palavra' },
  // Termo: exige tradução (é a pista) e palavras de 4 a 8 letras — ver `termo.ts`.
  /* `maxItems: 7` = 1+2+4, a escada completa. Estava em 5 e a carta chegava a anunciar "5 prontas"
     para uma rodada que consome 7 — o rótulo e o jogo discordavam. Quem manda no tamanho real é
     `consumoDaEscada` (`minigames/termo.ts`); este teto existe para o rótulo não prometer menos. */
  termo: { id: 'termo', minItems: 3, maxItems: 7, requiresTranslation: true, writesSrs: true, modalidade: 'palavra' },
  // Frase embaralhada e karaokê vivem de FALAS, não de cartões: não há nota de SRS a dar.
  scramble: { id: 'scramble', minItems: 3, maxItems: 5, requiresTranslation: true, writesSrs: false, modalidade: 'frase' },
  karaoke: { id: 'karaoke', minItems: 3, maxItems: 6, requiresTranslation: false, writesSrs: false, modalidade: 'frase-audio', aceitaPalavraFalada: true },
  /* Os três que herdaram o núcleo dos exercícios legados. Também vivem de FALAS — daí
     `writesSrs: false`: uma fala não é cartão do baralho, e gravar nota de agendamento para algo
     que não tem cartão inventaria histórico. */
  escuta: { id: 'escuta', minItems: 4, maxItems: 6, requiresTranslation: false, writesSrs: false, modalidade: 'frase-audio', aceitaPalavraFalada: true },
  ditado: { id: 'ditado', minItems: 3, maxItems: 5, requiresTranslation: false, writesSrs: false, modalidade: 'frase-audio', aceitaPalavraFalada: true },
  conectores: { id: 'conectores', minItems: 3, maxItems: 5, requiresTranslation: false, writesSrs: false, modalidade: 'frase' },
};
