import { describe, it, expect } from 'vitest';
import { PASSOS_DOS_JOGOS } from '../src/components/minigames/passosDosJogos';
import { COMO_SE_JOGA } from '../src/components/minigames/ComoSeJoga';
import { MINIGAMES, type MinigameId } from '../src/core/minigames/types';

/**
 * O TOUR GUIADO.
 *
 * O que estes testes protegem não é o motor (esse se vê na tela), e sim a DISCIPLINA DE ESCRITA
 * que faz o tour valer mais que o textão que ele substituiu. Um passo comprido, ou dez passos
 * seguidos, e a pessoa volta a clicar "próximo" sem ler — que é exatamente o problema de origem.
 */

const IDS = Object.keys(MINIGAMES) as MinigameId[];

describe('todo jogo tem tour', () => {
  it('nenhum jogo fica sem passos', () => {
    for (const id of IDS) {
      expect(PASSOS_DOS_JOGOS[id], `jogo ${id}`).toBeDefined();
      expect(PASSOS_DOS_JOGOS[id].length, `jogo ${id}`).toBeGreaterThanOrEqual(2);
    }
  });

  it('no máximo cinco passos — acima disso ninguém lê', () => {
    for (const id of IDS) {
      expect(PASSOS_DOS_JOGOS[id].length, `jogo ${id}`).toBeLessThanOrEqual(5);
    }
  });
});

describe('a disciplina de escrita', () => {
  it('uma frase por passo: se precisou de duas, o passo está grande demais', () => {
    for (const id of IDS) {
      for (const p of PASSOS_DOS_JOGOS[id]) {
        // Conta pontos finais no MEIO do texto (o último não conta).
        const finais = (p.texto.slice(0, -1).match(/[.!?]\s/g) ?? []).length;
        expect(finais, `${id}: "${p.texto}"`).toBeLessThanOrEqual(1);
        expect(p.texto.length, `${id}: "${p.texto}"`).toBeLessThanOrEqual(120);
        expect(p.texto.length, `${id}: "${p.texto}"`).toBeGreaterThan(20);
      }
    }
  });

  it('todo passo aponta para um alvo marcado com data-tour', () => {
    for (const id of IDS) {
      for (const p of PASSOS_DOS_JOGOS[id]) {
        expect(p.alvo, `jogo ${id}`).toMatch(/^\[data-tour="[a-z-]+"\]$/);
      }
    }
  });
});

describe('a razão de o tour existir', () => {
  /**
   * O tour nasceu porque as AJUDAS eram invisíveis: radar, varinha, ouvir devagar e cortar duas
   * são ícones de canto que ninguém descobre sozinho. Se um jogo que tem ajuda não a menciona no
   * tour, voltamos ao problema original — por isso isto é teste, e não convenção.
   */
  it('jogo com ajuda menciona ao menos uma delas no tour', () => {
    const PALAVRAS_DE_AJUDA = /radar|varinha|lâmpada|dica|espiar|devagar|tesoura|corta|abre a mesa|escreve a próxima|acende/i;
    for (const id of IDS) {
      /* Só cobra de quem tem BOTÃO de ajuda — ou seja, algo que se descobre clicando. O
         caça-conectores declara como "ajuda" o fato de dar para desmarcar antes de conferir, que
         não é um controle escondido e não precisa de tour. */
      const ajudas = COMO_SE_JOGA[id].ajudas;
      const temBotaoDeAjuda = ajudas.length >= 2 || ajudas.some(a => a.custo !== null);
      if (!temBotaoDeAjuda) continue;
      const textoDoTour = PASSOS_DOS_JOGOS[id].map(p => p.texto).join(' ');
      expect(textoDoTour, `jogo ${id} não fala de nenhuma ajuda`).toMatch(PALAVRAS_DE_AJUDA);
    }
  });

  it('a ficha completa continua existindo para quem quer ler os detalhes', () => {
    // O tour é o primeiro contato; os LIMITES do método continuam escritos no "?" — no meio da
    // partida eles seriam justamente o texto que faz pular.
    for (const id of IDS) {
      expect(COMO_SE_JOGA[id].limites.length, `jogo ${id}`).toBeGreaterThan(30);
    }
  });
});
