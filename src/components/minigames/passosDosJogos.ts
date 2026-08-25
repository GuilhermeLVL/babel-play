import type { MinigameId } from '@core';
import type { PassoTour } from './TourGuiado';

/**
 * OS PASSOS DE CADA JOGO — o que o tour aponta, na ordem.
 *
 * A REGRA DE ESCRITA, e ela é o que faz o tour valer mais que o textão que ele substituiu:
 *
 *   1. UMA FRASE por passo, no imperativo. Se precisou de duas, o passo está grande demais.
 *   2. NO MÁXIMO CINCO passos. Acima disso a pessoa começa a clicar "próximo" sem ler, e o tour
 *      vira o mesmo texto que ninguém lê, só que mais lento.
 *   3. A AJUDA SEMPRE ENTRA. É o motivo de tudo isto existir: radar, varinha, ouvir devagar e
 *      cortar duas são ícones de canto que ninguém descobre sozinho — e quem não descobre joga
 *      na versão difícil achando que é ruim naquilo.
 *   4. O PREÇO junto da ajuda, quando tem. "De graça" também é informação.
 *
 * O que NÃO entra aqui: os limites do método (o que a nota não mede). Isso é importante e continua
 * escrito, mas no "?" — no meio da partida seria justamente o texto que faz pular.
 */
export const PASSOS_DOS_JOGOS: Record<MinigameId, PassoTour[]> = {
  memory: [
    { alvo: '[data-tour="mesa"]', texto: 'Toque numa carta para virar. Depois vire outra e tente formar o par: palavra e tradução.', gesto: 'clique' },
    { alvo: '[data-tour="espiar"]', texto: 'Travou? Isto abre a mesa inteira por um instante, duas vezes por rodada — e custa nota.', gesto: 'clique' },
    { alvo: '[data-tour="placar"]', texto: 'Pares seguidos sem errar multiplicam os seus pontos.' },
  ],
  wordsearch: [
    { alvo: '[data-tour="pistas"]', texto: 'A pista é o SIGNIFICADO. Lembre qual é a palavra antes de sair procurando.' },
    { alvo: '[data-tour="grade"]', texto: 'Arraste sobre as letras para marcar. Vale em qualquer direção, inclusive na diagonal.', gesto: 'arraste' },
    { alvo: '[data-tour="radar"]', texto: 'O radar acende as duas pontas de uma palavra no quadro. Não custa nota nenhuma.', gesto: 'clique' },
  ],
  termo: [
    { alvo: '[data-tour="pista"]', texto: 'A pista é o significado. Escreva a palavra que ele descreve.' },
    { alvo: '[data-tour="tabuleiro"]', texto: 'Toque num quadrado para escrever nele — dá para preencher fora de ordem.', gesto: 'clique' },
    { alvo: '[data-tour="varinha"]', texto: 'A varinha preenche as letras que você já descobriu. Essa é de graça.', gesto: 'clique' },
    { alvo: '[data-tour="teclado"]', texto: 'Verde é letra no lugar certo; amarelo existe na palavra, mas em outra posição.', gesto: 'digite' },
  ],
  scramble: [
    { alvo: '[data-tour="traducao"]', texto: 'Este é o significado da frase — é ele que guia a ordem das palavras.' },
    { alvo: '[data-tour="pecas"]', texto: 'Toque nas palavras na ordem certa. Tocar de novo devolve a palavra.', gesto: 'clique' },
    { alvo: '[data-tour="conferir"]', texto: 'Se errar, eu digo QUANTAS estão no lugar — sem dizer quais.', gesto: 'clique' },
    { alvo: '[data-tour="dica-scramble"]', texto: 'Empacou? A lâmpada encaixa a próxima palavra certa no lugar, e custa nota.', gesto: 'clique' },
  ],
  karaoke: [
    { alvo: '[data-tour="frase"]', texto: 'As palavras acendem no ritmo do áudio de verdade.' },
    { alvo: '[data-tour="devagar"]', texto: 'Difícil de acompanhar? Isto toca mais devagar, de graça e sem deixar a voz esquisita.', gesto: 'clique' },
    { alvo: '[data-tour="falar"]', texto: 'Toque aqui e repita a frase em voz alta.', gesto: 'clique' },
  ],
  blitz: [
    { alvo: '[data-tour="pergunta"]', texto: 'Você tem poucos segundos: responder rápido é o que prova que a palavra está firme.' },
    { alvo: '[data-tour="alternativas"]', texto: 'As alternativas erradas são outras palavras reais do seu baralho.', gesto: 'clique' },
    { alvo: '[data-tour="tesoura"]', texto: 'A tesoura corta duas alternativas erradas — duas vezes por rodada. Custa nota.', gesto: 'clique' },
  ],
  escuta: [
    { alvo: '[data-tour="ouvir"]', texto: 'O trecho toca sozinho. Ouça de novo quantas vezes quiser — isso não tira ponto.', gesto: 'clique' },
    { alvo: '[data-tour="devagar"]', texto: 'Ainda difícil? Aqui ele toca devagar, sem mudar o tom da voz.', gesto: 'clique' },
    { alvo: '[data-tour="alternativas"]', texto: 'Escolha qual frase foi dita. As outras são falas da mesma gravação — só ouvindo dá.', gesto: 'clique' },
  ],
  ditado: [
    { alvo: '[data-tour="ouvir"]', texto: 'Ouça o trecho. Pode repetir à vontade, e devagar também.', gesto: 'clique' },
    { alvo: '[data-tour="entrada"]', texto: 'Escreva o que você entendeu. Acento e pontuação não contam — o jogo é de ouvido.', gesto: 'digite' },
    { alvo: '[data-tour="dica-ditado"]', texto: 'Empacou numa palavra? A lâmpada escreve a próxima para você, e isso custa nota.', gesto: 'clique' },
    { alvo: '[data-tour="conferir"]', texto: 'Ao conferir, eu mostro cada palavra e o que você escreveu no lugar.', gesto: 'clique' },
  ],
  conectores: [
    { alvo: '[data-tour="frase-conectores"]', texto: 'Toque nas palavras que ligam uma ideia à outra — "porque", "porém", "however".', gesto: 'clique' },
    { alvo: '[data-tour="conferir"]', texto: 'Marcar demais atrapalha: deixar passar e marcar à toa pesam igual na nota.', gesto: 'clique' },
  ],
};

const CHAVE = (jogo: string) => `babel_tour_${jogo}`;

/** Já fez o tour deste jogo? */
export function jaFezTour(jogo: MinigameId): boolean {
  try { return localStorage.getItem(CHAVE(jogo)) === '1'; } catch { return false; }
}

export function marcarTourFeito(jogo: MinigameId): void {
  try { localStorage.setItem(CHAVE(jogo), '1'); } catch { /* storage bloqueado: mostra de novo */ }
}
