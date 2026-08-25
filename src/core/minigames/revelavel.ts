import { MINIGAMES, type MinigameId } from './types';
import { chaveComparavel } from '../learning/quality';

/**
 * O QUE A PRÉVIA PODE MOSTRAR — a regra anti-spoiler, declarada em vez de improvisada.
 *
 * O DEFEITO QUE ISTO CONSERTA. Dentro dos jogos a disciplina era rigorosa e comentada: o
 * caça-palavras se recusa a imprimir a palavra ("antes disso seria entregar"), o Qual foi? só
 * revela a tradução DEPOIS de responder, o Termo troca a pista pela resposta só quando o degrau
 * fecha. Mas a antessala — a tela que aparece imediatamente ANTES de tudo isso — imprimia a
 * resposta dos nove jogos. Ela listava a palavra que o Termo ia pedir para soletrar letra a letra,
 * a frase que o Ditado ia pedir para transcrever, e os pares inteiros da Memória antes de virar
 * qualquer carta. O jogo cuidava do sigilo e a porta de entrada o entregava.
 *
 * A REGRA: **a antessala nunca mostra mais do que o próprio jogo mostra no primeiro instante da
 * jogada.** Não é um ajuste caso a caso — é a tabela `REVELAVEL` abaixo, e como ela é um
 * `Record<MinigameId, …>`, um décimo jogo NÃO COMPILA sem declarar o que revela. O vazamento
 * deixa de ser algo que se esquece de conferir.
 *
 * POR QUE ISTO NÃO MATA A ANTESSALA. O objetivo declarado dela é deixar a pessoa NOTAR que o
 * sorteio repetiu (a queixa original foi "fico preso nas mesmas questões", e a medição no Termo
 * dava 7 palavras distintas em 35 jogadas). Só que imprimir os itens é um jeito ruim de responder
 * isso — obriga a comparar sete palavras de memória. Quem monta a prévia agora MEDE a repetição e
 * diz o número ("5 dos 7 já caíram na sua última rodada"). Responde melhor, e custa zero conteúdo.
 */

export type Faceta =
  /** O texto que a pessoa tem de produzir, achar ou soletrar. É a resposta. */
  | 'alvo'
  /** A tradução, ou a frase com lacuna — o que o jogo já usa como enunciado. */
  | 'pista'
  /** O esqueleto: quantas letras, quantas palavras. Nunca QUAIS letras. */
  | 'forma'
  /** nova · já viu · você errou · vencida. */
  | 'estado'
  /** Quando este item caiu pela última vez. */
  | 'quando'
  /** Nível CEFR, e só quando a fonte é curada (ver `CONFIANCA_CURADA`). */
  | 'nivel'
  /**
   * De onde o item veio: o baralho, uma gravação sua, a trilha — e em que idioma.
   *
   * Entra na mesma categoria de `estado`, `quando` e `nivel`: fala da SUA RELAÇÃO com o item e da
   * procedência dele, não do conteúdo. Saber que uma palavra veio da conversa de terça não ajuda a
   * lembrar qual palavra é.
   *
   * COM UMA EXCEÇÃO CERCADA: o rótulo da gravação é texto escrito por gente, e o título "Chaves
   * perdidas" numa rodada sobre *chaves* entrega a resposta. `previaSegura` passa esse rótulo pela
   * mesma peneira da pista (`pistaEntregaAlvo`) e o degrada para o nome genérico da fonte quando
   * ele contém o alvo.
   */
  | 'origem';

/**
 * Derivada, jogo a jogo, do que a tela mostra no instante em que a partida abre.
 *
 * `estado`, `quando`, `nivel` e `origem` valem para todos: falam da SUA relação com o item (já caiu?
 * errou? é do A1? veio de onde?), não do conteúdo dele. Nenhum deles ajuda a responder.
 *
 * O que varia é o topo:
 *  - **alvo** só para karaokê e caça-conectores, onde mostrar a frase inteira É a mecânica — os
 *    dois exibem texto e tradução o tempo todo, e não há nada a esconder.
 *  - **pista** para caça-palavras, duelo, Termo e frase embaralhada: os quatro já abrem com a
 *    tradução/enunciado na tela. O duelo mostra as quatro alternativas mas não diz qual é — logo
 *    pista, jamais alvo.
 *  - **só forma** para Memória, Qual foi? e Ditado. A Memória abre com as cartas viradas para
 *    baixo; o Qual foi? mostra as alternativas sem dizer qual; o Ditado já anuncia o número de
 *    palavras por conta própria. Nos três, o número de letras não ajuda a responder — na Memória o
 *    desafio é lembrar POSIÇÃO, e no Ditado a forma é literalmente o que o jogo imprime.
 */
export const REVELAVEL: Record<MinigameId, ReadonlySet<Faceta>> = {
  memory: new Set<Faceta>(['forma', 'estado', 'quando', 'nivel', 'origem']),
  escuta: new Set<Faceta>(['forma', 'estado', 'quando', 'nivel', 'origem']),
  ditado: new Set<Faceta>(['forma', 'estado', 'quando', 'nivel', 'origem']),
  wordsearch: new Set<Faceta>(['pista', 'forma', 'estado', 'quando', 'nivel', 'origem']),
  blitz: new Set<Faceta>(['pista', 'forma', 'estado', 'quando', 'nivel', 'origem']),
  termo: new Set<Faceta>(['pista', 'forma', 'estado', 'quando', 'nivel', 'origem']),
  scramble: new Set<Faceta>(['pista', 'forma', 'estado', 'quando', 'nivel', 'origem']),
  karaoke: new Set<Faceta>(['alvo', 'pista', 'forma', 'estado', 'quando', 'nivel', 'origem']),
  conectores: new Set<Faceta>(['alvo', 'pista', 'forma', 'estado', 'quando', 'nivel', 'origem']),
};

/**
 * O MAPA DO CONTEÚDO CONTINUA REVELANDO A PALAVRA — e isto é uma decisão, não um esquecimento.
 *
 * O mapa é retrospectivo e somente-leitura: ele responde "o que já caiu, o que nunca apareceu,
 * o que está vencido" sobre o acervo INTEIRO, não sobre a próxima rodada. Uma lista de "7 letras ·
 * nunca caiu" repetida quatrocentas vezes não responde nada. E ele não fica a um clique de uma
 * partida em curso: durante uma sequência encadeada não há como chegar nele.
 *
 * Fica declarado aqui, junto da regra que ele excetua, para ser auditável — e não uma omissão que
 * alguém descobre relendo `Play.tsx` daqui a um ano.
 */
export const MAPA_REVELA_ALVO = true;

/** O que cada ramo de `montarRodada` produz. Cru: ainda tem a resposta dentro. */
export interface ItemCru {
  /** O `item_ref` — a palavra (jogos de baralho) ou o id da fala (jogos de frase). */
  ref: string;
  /** A resposta. Só chega à tela se o jogo declarar a faceta `alvo`. */
  alvo: string;
  /** A tradução ou o enunciado. */
  pista?: string;
  cefr?: string;
  /** Sem confiança curada, o nível é chute — e chute não vai para a tela. */
  cefrConfianca?: number;
  /** De onde este item veio. Vem de `Proveniencia`, que o servidor já devolve e ninguém lia. */
  origem?: OrigemDoItem;
  /** O nome da gravação. Passa pela cerca anti-spoiler antes de virar tela. */
  origemRotulo?: string;
  /** Código do idioma do item ("en"), quando conhecido. */
  idioma?: string;
}

export type OrigemDoItem = 'baralho' | 'sessao' | 'trilha';

/** Como a origem chega à tela: já redigida e já cercada. */
export interface OrigemNaTela {
  tipo: OrigemDoItem;
  /**
   * O nome da gravação — ou `undefined` quando o nome foi retido por conter a resposta. A tela cai
   * então para o nome genérico da fonte, que `tipo` sustenta.
   */
  rotulo?: string;
  idioma?: string;
}

/** Já redigido para a tela: nada aqui vaza o que o jogo esconde. */
export interface ItemDaAntessala {
  ref: string;
  /** A linha principal, já escolhida conforme a faceta: a resposta, a pista, ou o esqueleto. */
  titulo: string;
  /** Apoio, quando existe E é permitido. */
  pista?: string;
  /** "7 letras" · "12 palavras". */
  forma?: string;
  /**
   * O mesmo número de `forma`, cru. Existe para a tela resumir uma rodada ("de 4 a 13 letras")
   * sem ter de reanalisar o rótulo que ela própria acabou de receber. É contagem, não conteúdo.
   */
  tamanho?: number;
  cefr?: string;
  /** Procedência, quando o jogo declara a faceta `origem` e o dado existe. */
  origem?: OrigemNaTela;
}

/**
 * Conta letras e palavras SEM devolver nenhum caractere do original.
 *
 * Letras conta grafemas alfabéticos (`\p{L}`), não `length`: "co-worker" tem 9 caracteres e 8
 * letras, e é o número de letras que o tabuleiro do Termo desenha. Hífen e apóstrofo não ganham
 * casa.
 */
export function esqueleto(texto: string): { letras: number; palavras: number } {
  const limpo = (texto || '').trim();
  return {
    letras: (limpo.match(/\p{L}/gu) || []).length,
    palavras: limpo ? limpo.split(/\s+/).length : 0,
  };
}

/**
 * O rótulo da forma sai do TEXTO, não da `modalidade` do jogo.
 *
 * Motivo concreto: na trilha, Ditado/Qual foi?/Karaokê rodam sobre PALAVRAS soltas faladas por voz
 * sintetizada, embora sejam declarados `frase-audio`. Ler a modalidade diria "1 palavras" ali.
 */
function rotuloDaForma(alvo: string): { rotulo: string; tamanho: number } {
  const { letras, palavras } = esqueleto(alvo);
  if (palavras > 1) return { rotulo: `${palavras} palavras`, tamanho: palavras };
  return { rotulo: letras === 1 ? '1 letra' : `${letras} letras`, tamanho: letras };
}

/**
 * A PISTA ÀS VEZES É A RESPOSTA — e mostrá-la seria furar a própria regra.
 *
 * Dois casos reais, os dois pegos por `tests/antessala.test.ts`:
 *  1. cartão cuja tradução É a própria palavra ("hotel" → "Hotel"). `avaliarCartao` já cataloga
 *     isso como `traducao-igual`: são 72 cartões no baralho medido, não uma hipótese.
 *  2. pista que cita a palavra ("run" → "run away — fugir").
 *
 * A comparação é por SUBSTRING sobre a chave normalizada, não por igualdade — "Hotel" e "hotel"
 * têm de casar, e "run" dentro de "run away" também. Isso bloqueia demais em palavra curtíssima
 * ("ir" dentro de "sair"), e o preço disso é a linha cair para o esqueleto: menos informativa,
 * nunca insegura. Escolhido de propósito nessa direção — a regra existe para proteger o jogo, e
 * uma prévia menos rica é um custo aceitável perto de entregar a resposta.
 */
function pistaEntregaAlvo(pista: string, alvo: string): boolean {
  const a = chaveComparavel(alvo);
  return !!a && chaveComparavel(pista).includes(a);
}

/**
 * Redige a prévia obedecendo à tabela. É o único caminho até a tela — os ramos de `montarRodada`
 * devolvem `ItemCru` e param de decidir o que aparece.
 *
 * A escolha do `titulo` desce a escada das facetas: a resposta se for permitida, senão a pista,
 * senão o esqueleto. Sempre sobra alguma coisa para ler, e nunca mais do que o jogo mostra.
 */
export function previaSegura(jogo: MinigameId, crus: ItemCru[]): ItemDaAntessala[] {
  const pode = REVELAVEL[jogo];
  // Um jogo fora da tabela seria um vazamento silencioso; melhor falhar alto no primeiro teste.
  if (!pode) throw new Error(`revelavel: jogo sem facetas declaradas: ${jogo}`);
  const curado = (c: ItemCru) => c.cefr && (c.cefrConfianca ?? 0) >= 1;

  return crus.map((c) => {
    const f = pode.has('forma') ? rotuloDaForma(c.alvo) : undefined;
    const forma = f?.rotulo;
    const tamanho = f?.tamanho;
    const nivel = curado(c) ? c.cefr : undefined;

    /**
     * A ORIGEM PASSA PELA MESMA PENEIRA DA PISTA — e este é o ponto delicado da faceta.
     *
     * O tipo da origem ("veio de uma gravação sua") é inócuo. O RÓTULO não é: ele é texto escrito
     * por gente, e uma gravação chamada "Conversa sobre as chaves perdidas" numa rodada que pede
     * *keys* entrega a resposta antes do primeiro clique. Reusar `pistaEntregaAlvo` aqui custa uma
     * linha e cobre o caso; sem ela, teríamos criado um vazamento novo pela porta dos fundos, no
     * mesmo arquivo escrito para fechá-la.
     *
     * Quando o rótulo é retido, o `tipo` sobrevive — a tela ainda diz "desta gravação", que é
     * verdade e não entrega nada.
     */
    const origem = pode.has('origem') && c.origem
      ? {
        tipo: c.origem,
        rotulo: c.origemRotulo && !pistaEntregaAlvo(c.origemRotulo, c.alvo) ? c.origemRotulo : undefined,
        idioma: c.idioma,
      }
      : undefined;

    if (pode.has('alvo')) {
      // Aqui a resposta já está autorizada: nada a esconder, e a pista não precisa de cerca.
      return { ref: c.ref, titulo: c.alvo, pista: pode.has('pista') ? c.pista : undefined, forma, tamanho, cefr: nivel, origem };
    }
    if (pode.has('pista') && c.pista && !pistaEntregaAlvo(c.pista, c.alvo)) {
      // A pista SOBE para o título: ela é o enunciado que o jogo já vai mostrar, e repeti-la na
      // coluna de apoio deixaria a linha principal vazia.
      return { ref: c.ref, titulo: c.pista, forma, tamanho, cefr: nivel, origem };
    }
    /* Nem alvo nem pista utilizável: sobra o esqueleto. É pouco de propósito — quem carrega a
       leitura aqui é o selo de estado e o "quando", que dizem a SUA relação com o item sem
       entregar o item.

       `forma` VAI JUNTO, mesmo virando o título. Ela ficava de fora aqui, e o efeito passou
       despercebido por ser a dois passos de distância: a antessala decide entre lista e resumo
       comparando `titulo !== forma`, e com `forma` ausente a comparação dava SEMPRE verdadeiro.
       Resultado — o card "este jogo esconde o conteúdo até você jogar", escrito justamente para os
       três jogos que não podem revelar nada, era código morto: a Memória imprimia oito linhas
       "N letras · VENCIDA" que ninguém consegue usar para decidir jogar ou trocar.

       `tamanho` (a mesma medida, crua) já ia. Omitir só o rótulo era descuido, não decisão. */
    return { ref: c.ref, titulo: forma ?? '—', forma, tamanho, cefr: nivel, origem };
  });
}

/**
 * Quantos itens desta rodada já caíram na rodada anterior DESTE jogo.
 *
 * É a peça que substitui a lista de palavras na função de denunciar sorteio repetido — e responde
 * melhor, porque ninguém precisa comparar sete itens de memória para ver "5 dos 7".
 */
export function repetidosDaUltima(crus: { ref: string }[], anteriores: ReadonlySet<string>): number {
  if (!anteriores?.size) return 0;
  return crus.reduce((n, c) => (c.ref && anteriores.has(c.ref) ? n + 1 : n), 0);
}

/** Os ids dos jogos, para quem precisa iterar (testes, filtro de `exercise_kind` no servidor). */
export const MINIGAME_IDS = Object.keys(MINIGAMES) as MinigameId[];
