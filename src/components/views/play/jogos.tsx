import type { MinigameId } from '@core';
import React from 'react';

import { t } from '../../../lib/i18n';
import type { AgeProfileType } from '../../../lib/profile';
import { IconePixel } from './IconesPixel';

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
  /**
   * A DESCRIÇÃO QUANDO A FONTE É A TRILHA — só para os jogos que MUDAM DE NATUREZA ali.
   *
   * Na trilha não existe gravação nem áudio recortado: ditado, escuta e karaokê passam a ouvir
   * PALAVRAS faladas por voz sintetizada (`Play.tsx`, o ramo `aceitaPalavraFalada`). As descrições
   * seguiam dizendo "a fala real toca", "outras falas da mesma gravação", "ouça a frase" — e a
   * pessoa clicava esperando uma coisa e recebia outra.
   *
   * É opcional de propósito. A regra continua sendo dizer a fonte UMA vez, no topo da tela; isto
   * aqui existe só onde o jogo em si é outro, não para repetir "trilha" em nove cartas.
   */
  descricaoNaTrilha?: Record<AgeProfileType, string>;
}

/**
 * Os jogos, na ordem PADRÃO — do mais simples ao mais tenso, para quem nunca mexeu.
 * A ordem que vale na tela é a do usuário (`lib/ordemDosJogos.ts`); esta é só o ponto de partida.
 */
export const JOGOS: JogoUI[] = [
  {
    chave: 'memory',
    id: 'memory',
    icone: <IconePixel id="memory" className="w-5 h-5" />,
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
    icone: <IconePixel id="wordsearch" className="w-5 h-5" />,
    titulo: { kids: 'Caça-palavras', pro: 'Caça-palavras por definição', senior: 'Caça-palavras' },
    descricao: {
      kids: 'Leia a dica e ache a palavra escondida',
      pro: 'A pista é a tradução, lembre da palavra antes de procurar',
      senior: 'Leia a tradução e encontre a palavra no quadro',
    },
  },
  {
    chave: 'termo',
    id: 'termo',
    icone: <IconePixel id="termo" className="w-5 h-5" />,
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
    icone: <IconePixel id="scramble" className="w-5 h-5" />,
    titulo: { kids: 'Monte a frase', pro: 'Frase embaralhada', senior: 'Montar a frase' },
    descricao: {
      kids: 'Coloque as palavras na ordem certa',
      // Sem "sua gravação": na trilha a frase vem do Tatoeba, e a fonte já está dita no topo.
      pro: 'Uma frase real, fora de ordem',
      senior: 'Ordene as palavras até a frase fazer sentido',
    },
  },
  {
    chave: 'karaoke',
    id: 'karaoke',
    icone: <IconePixel id="karaoke" className="w-5 h-5" />,
    titulo: { kids: 'Cante junto', pro: 'Karaokê da fala', senior: 'Repetir em voz alta' },
    descricao: {
      kids: 'Fale junto com o áudio e veja sua nota',
      pro: 'A fala real toca com as palavras acendendo; você repete',
      senior: 'Ouça a frase e repita, recebe uma nota de pronúncia',
    },
    descricaoNaTrilha: {
      kids: 'Ouça a palavra e fale junto',
      pro: 'A palavra é falada por voz sintetizada; você repete e recebe a nota',
      senior: 'Ouça a palavra e repita, recebe uma nota de pronúncia',
    },
  },
  {
    chave: 'escuta',
    id: 'escuta',
    icone: <IconePixel id="escuta" className="w-5 h-5" />,
    titulo: { kids: 'Qual foi?', pro: 'Qual foi a fala? (escuta)', senior: 'Reconhecer a fala' },
    descricao: {
      kids: 'Ouça e ache a frase certa entre as parecidas',
      pro: 'Só o áudio: as alternativas são outras falas parecidas',
      senior: 'Ouça o trecho e escolha qual frase foi dita',
    },
    descricaoNaTrilha: {
      kids: 'Ouça e ache a palavra certa entre as parecidas',
      pro: 'Par mínimo: as alternativas são outras palavras da mesma leva',
      senior: 'Ouça a palavra e escolha qual foi dita',
    },
  },
  {
    chave: 'ditado',
    id: 'ditado',
    icone: <IconePixel id="ditado" className="w-5 h-5" />,
    titulo: { kids: 'Escreva o que ouviu', pro: 'Ditado', senior: 'Escrever o que ouviu' },
    descricao: {
      kids: 'Ouça quantas vezes quiser e escreva',
      pro: 'Correção palavra a palavra, você vê exatamente onde errou',
      senior: 'Ouça com calma e escreva a frase; a correção mostra cada palavra',
    },
    descricaoNaTrilha: {
      kids: 'Ouça a palavra e escreva',
      pro: 'Uma palavra por vez, falada; a correção mostra letra a letra',
      senior: 'Ouça a palavra com calma e escreva',
    },
  },
  {
    chave: 'conectores',
    id: 'conectores',
    icone: <IconePixel id="conectores" className="w-5 h-5" />,
    titulo: { kids: 'Palavras que ligam', pro: 'Caça-conectores', senior: 'Palavras de ligação' },
    descricao: {
      kids: 'Ache as palavrinhas que mudam o rumo da frase',
      pro: 'Marcadores de discurso na fala real, o que amarra as ideias',
      senior: 'Marque as palavras que ligam uma ideia à outra',
    },
  },
  {
    chave: 'blitz',
    id: 'blitz',
    icone: <IconePixel id="blitz" className="w-5 h-5" />,
    titulo: { kids: 'Duelo relâmpago', pro: 'Duelo relâmpago (contra o tempo)', senior: 'Desafio rápido' },
    descricao: {
      kids: 'Acerte rápido e faça sequência para multiplicar',
      pro: 'Rodada cronometrada com as palavras que estão vencendo',
      senior: 'Responda no seu ritmo, com um tempo folgado',
    },
  },
  {
    chave: 'karuta',
    id: 'karuta',
    icone: <IconePixel id="karuta" className="w-5 h-5" />,
    titulo: { kids: 'Karuta', pro: 'Karuta: ouça e pegue a carta', senior: 'Karuta' },
    descricao: {
      kids: 'Ouça a dica e toque na carta certa',
      pro: 'O narrador diz o significado; toque na palavra que ele descreve',
      senior: 'Ouça a dica e toque na carta com a palavra certa',
    },
  },
  {
    chave: 'choseong',
    id: 'choseong',
    icone: <IconePixel id="choseong" className="w-5 h-5" />,
    titulo: { kids: 'Complete as vogais', pro: 'Choseong: consoantes à vista', senior: 'Complete as vogais' },
    descricao: {
      kids: 'As consoantes aparecem, você põe as vogais',
      pro: 'Só as consoantes aparecem: complete a palavra',
      senior: 'As consoantes aparecem e você completa as vogais',
    },
  },
  {
    chave: 'tenis',
    id: 'tenis',
    icone: <IconePixel id="tenis" className="w-5 h-5" />,
    titulo: { kids: 'Tênis de palavras', pro: 'Rali cronometrado', senior: 'Tênis de palavras' },
    descricao: {
      kids: 'Devolva a bola escrevendo a palavra',
      pro: 'Rali: devolva escrevendo a palavra antes de a bola cair',
      senior: 'Devolva a bola escrevendo a palavra a tempo',
    },
  },
  {
    chave: 'koffer',
    id: 'koffer',
    icone: <IconePixel id="koffer" className="w-5 h-5" />,
    titulo: { kids: 'A mala', pro: 'Mala cumulativa de memória', senior: 'A mala' },
    descricao: {
      kids: 'Guarde tudo que entra na mala, na ordem',
      pro: 'A cada nível entra uma palavra: reconstrua a mala de memória',
      senior: 'Guarde as palavras que entram na mala, na ordem',
    },
  },
  {
    chave: 'bao',
    id: 'bao',
    icone: <IconePixel id="bao" className="w-5 h-5" />,
    titulo: { kids: 'Bao: monte a palavra', pro: 'Bao: semeie os pedaços', senior: 'Bao: monte a palavra' },
    descricao: {
      kids: 'Junte os pedaços na ordem certa',
      pro: 'Semeie os pedaços da palavra na ordem',
      senior: 'Junte os pedaços para formar a palavra',
    },
  },
  {
    chave: 'vitendawili',
    id: 'vitendawili',
    icone: <IconePixel id="vitendawili" className="w-5 h-5" />,
    titulo: { kids: 'Charada', pro: 'Vitendawili: a frase com lacuna', senior: 'Charada' },
    descricao: {
      kids: 'Descubra a palavra que sumiu da frase',
      pro: 'O enigma é a sua própria frase com a palavra apagada',
      senior: 'Descubra qual palavra sumiu da frase',
    },
  },
  {
    chave: 'shiritori',
    id: 'shiritori',
    icone: <IconePixel id="shiritori" className="w-5 h-5" />,
    titulo: { kids: 'Corrente de palavras', pro: 'Shiritori: encadeie pela última letra', senior: 'Corrente de palavras' },
    descricao: {
      kids: 'Cada palavra começa com a última letra da anterior',
      pro: 'Encadeie: a próxima começa com a última letra da anterior',
      senior: 'Cada palavra começa com a última letra da anterior',
    },
  },
  {
    chave: 'cadavre',
    id: 'cadavre',
    icone: <IconePixel id="cadavre" className="w-5 h-5" />,
    titulo: { kids: 'Frase maluca', pro: 'Cadavre exquis: produção livre', senior: 'Frase maluca' },
    descricao: {
      kids: 'Escreva uma frase usando as quatro palavras',
      pro: 'Quatro palavras da leva, uma frase sua. Não conta para a revisão',
      senior: 'Escreva uma frase que use as quatro palavras',
    },
  },
  {
    chave: 'taboo',
    id: 'taboo',
    icone: <IconePixel id="taboo" className="w-5 h-5" />,
    titulo: { kids: 'Palavra proibida', pro: 'Tabu: a definição sem os termos óbvios', senior: 'Palavra proibida' },
    descricao: {
      kids: 'Descubra a palavra sem as pistas óbvias',
      pro: 'A definição vem sem os termos mais óbvios: descubra a palavra',
      senior: 'Descubra a palavra pela definição',
    },
  },
];

/**
 * O título e a descrição do jogo, já no idioma da interface.
 *
 * Mesma escolha de `navLabel`: a tradução entra no ponto de SAÍDA, não na tabela. As variantes por
 * perfil continuam sendo escolhidas antes — "Memória: palavra e tradução" e "Jogo da memória" são
 * frases diferentes, com traduções diferentes —, e a tabela segue legível como a fonte da redação.
 */
export function tituloDoJogo(jogo: JogoUI, perfil: AgeProfileType): string {
  return t(jogo.titulo[perfil]);
}

export function descricaoDoJogo(jogo: JogoUI, perfil: AgeProfileType, naTrilha = false): string {
  const tabela = naTrilha && jogo.descricaoNaTrilha ? jogo.descricaoNaTrilha : jogo.descricao;
  return t(tabela[perfil]);
}
