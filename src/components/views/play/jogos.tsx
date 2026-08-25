import React from 'react';
import { Grid3x3, Search, Timer, Type, Shuffle, Music, Headphones, PenLine, Link2 } from 'lucide-react';
import type { MinigameId } from '@core';
import type { AgeProfileType } from '../../../lib/profile';

/**
 * OS NOVE JOGOS, como a tela os apresenta.
 *
 * Saiu de dentro de `Play.tsx` (que tinha 2.000 linhas e concentrava lobby, antessala, nove jogos,
 * raspadinha, resumo, curadoria, mapa, trilha, Anki e tour) porque é DADO, não comportamento: 105
 * linhas de rótulo e ícone que qualquer mudança de copy obrigava a abrir o arquivo inteiro.
 *
 * A regra do jogo mora em `@core/minigames`; o que fica aqui é só como ele se chama e que ícone
 * usa. A separação é a mesma de sempre neste projeto: o core não sabe desenhar, a view não decide.
 *
 * OS TRÊS PERFIS NÃO SÃO TRADUÇÃO, SÃO PÚBLICOS DIFERENTES. `kids` diz o que a pessoa FAZ ("Ache os
 * pares de cartas viradas"); `pro` diz a mecânica ("Vire as cartas e feche os pares palavra ↔
 * tradução"); `senior` explica passo a passo. Reduzi-los a um texto só custaria a razão de os três
 * perfis existirem.
 */

export interface JogoUI {
  chave: string;
  id: MinigameId;
  icone: React.ReactNode;
  titulo: Record<AgeProfileType, string>;
  descricao: Record<AgeProfileType, string>;
}

/**
 * Os jogos, na ordem PADRÃO — do mais simples ao mais tenso, para quem nunca mexeu.
 * A ordem que vale na tela é a do usuário (`lib/ordemDosJogos.ts`); esta é só o ponto de partida.
 */
export const JOGOS: JogoUI[] = [
  {
    chave: 'memory',
    id: 'memory',
    icone: <Grid3x3 className="w-5 h-5" />,
    titulo: { kids: 'Jogo da memória', pro: 'Memória: palavra e tradução', senior: 'Jogo da memória' },
    descricao: {
      kids: 'Ache os pares de cartas viradas',
      pro: 'Vire as cartas e feche os pares palavra ↔ tradução',
      senior: 'Vire duas cartas e encontre a palavra com a tradução dela',
    },
  },
  {
    chave: 'wordsearch',
    id: 'wordsearch',
    icone: <Search className="w-5 h-5" />,
    titulo: { kids: 'Caça-palavras', pro: 'Caça-palavras por definição', senior: 'Caça-palavras' },
    descricao: {
      kids: 'Leia a dica e ache a palavra escondida',
      pro: 'A pista é a tradução — lembre da palavra antes de procurar',
      senior: 'Leia a tradução e encontre a palavra no quadro',
    },
  },
  {
    chave: 'termo',
    id: 'termo',
    icone: <Type className="w-5 h-5" />,
    titulo: { kids: 'Escreva a palavra', pro: 'Soletrar (Termo)', senior: 'Escrever a palavra' },
    descricao: {
      kids: 'Acertou? Vêm duas de uma vez. Acertou de novo? Quatro!',
      pro: 'Escada: 1 palavra, depois 2 e depois 4 ao mesmo tempo',
      senior: 'Comece com uma palavra; acertando, o desafio aumenta',
    },
  },
  {
    chave: 'scramble',
    id: 'scramble',
    icone: <Shuffle className="w-5 h-5" />,
    titulo: { kids: 'Monte a frase', pro: 'Frase embaralhada', senior: 'Montar a frase' },
    descricao: {
      kids: 'Coloque as palavras na ordem certa',
      pro: 'Uma frase real da sua gravação, fora de ordem',
      senior: 'Ordene as palavras de uma frase que você gravou',
    },
  },
  {
    chave: 'karaoke',
    id: 'karaoke',
    icone: <Music className="w-5 h-5" />,
    titulo: { kids: 'Cante junto', pro: 'Karaokê da fala', senior: 'Repetir em voz alta' },
    descricao: {
      kids: 'Fale junto com o áudio e veja sua nota',
      pro: 'A fala real toca com as palavras acendendo; você repete',
      senior: 'Ouça a frase e repita — recebe uma nota de pronúncia',
    },
  },
  {
    chave: 'escuta',
    id: 'escuta',
    icone: <Headphones className="w-5 h-5" />,
    titulo: { kids: 'Qual foi?', pro: 'Qual foi a fala? (escuta)', senior: 'Reconhecer a fala' },
    descricao: {
      kids: 'Ouça e ache a frase certa entre as parecidas',
      pro: 'Só o áudio: as alternativas são outras falas da mesma gravação',
      senior: 'Ouça o trecho e escolha qual frase foi dita',
    },
  },
  {
    chave: 'ditado',
    id: 'ditado',
    icone: <PenLine className="w-5 h-5" />,
    titulo: { kids: 'Escreva o que ouviu', pro: 'Ditado', senior: 'Escrever o que ouviu' },
    descricao: {
      kids: 'Ouça quantas vezes quiser e escreva',
      pro: 'Correção palavra a palavra — você vê exatamente onde errou',
      senior: 'Ouça com calma e escreva a frase; a correção mostra cada palavra',
    },
  },
  {
    chave: 'conectores',
    id: 'conectores',
    icone: <Link2 className="w-5 h-5" />,
    titulo: { kids: 'Palavras que ligam', pro: 'Caça-conectores', senior: 'Palavras de ligação' },
    descricao: {
      kids: 'Ache as palavrinhas que mudam o rumo da frase',
      pro: 'Marcadores de discurso na fala real — o que amarra as ideias',
      senior: 'Marque as palavras que ligam uma ideia à outra',
    },
  },
  {
    chave: 'blitz',
    id: 'blitz',
    icone: <Timer className="w-5 h-5" />,
    titulo: { kids: 'Duelo relâmpago', pro: 'Duelo relâmpago (contra o tempo)', senior: 'Desafio rápido' },
    descricao: {
      kids: 'Acerte rápido e faça sequência para multiplicar',
      pro: 'Rodada cronometrada com as palavras que estão vencendo',
      senior: 'Responda no seu ritmo, com um tempo folgado',
    },
  },
];
