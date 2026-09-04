import { MINIGAMES, type MinigameId } from './types';
import { canPlay, promptFor } from './itemSource';
import { chaveComparavel } from '../learning/quality';
import { contarJogaveisMulti, consumoDaEscada, ESCADA_POR_FAIXA, digitavelNoTermo } from './termo';
import { entraNaGrade } from './wordsearch';
import type { FaixaDificuldade } from './composicao';
import { buildScrambleRounds } from './scramble';
import { buildRodadasEscuta, buildRodadasDitado, buildRodadasConectores, temConectores } from './escuta';
import type { VocabCard } from '../../types';
import type { FalaComAudio } from './escuta';

/**
 * O QUE DÁ PARA JOGAR AGORA, e o que falta para o resto — calculado fora do React.
 *
 * ESTA REGRA JÁ MENTIU EM PRODUÇÃO. `frases` e `audioSessao` vêm de uma GRAVAÇÃO e não são função
 * da fonte escolhida. Na trilha, os cinco jogos de frase anunciavam "N falas prontas" e jogavam o
 * áudio de outra fonte — mistura silenciosa, sem erro em lugar nenhum. O conserto foi fazer a
 * `modalidade` declarada em `MINIGAMES` decidir, e o motivo do bloqueio ser o REAL.
 *
 * Ela morava dentro de um `useMemo` de `Play.tsx`: 55 linhas de regra de produto presas num
 * componente de 2.000, impossíveis de testar sem montar a árvore inteira. Aqui é TypeScript puro,
 * roda em Node e é o tipo de coisa que o `src/core` existe para guardar.
 *
 * O QUE ELE NÃO FAZ: não sabe rótulo, ícone nem ordem. Devolve estado por `MinigameId`; quem
 * desenha a carta junta isso com a apresentação.
 */

/** Japonês, chinês e tailandês não marcam onde cada palavra começa. Coreano usa espaço. */
const ESCRITA_SEM_ESPACO = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}]/u;

/** Por que o jogo está bloqueado, quando o número de itens não conta a história toda. */
export type MotivoBloqueio =
  /** Conector e ordem de palavras só existem dentro de uma frase — e a trilha não tem frases. */
  | 'trilha-sem-frase'
  /** Na trilha o som vem do TTS do navegador. Sem voz, o jogo fica bloqueado dizendo isso. */
  | 'sem-voz'
  /**
   * A gravação TEM áudio, mas ele ainda está sendo baixado.
   *
   * Estado transitório e curto — e mesmo assim precisa de nome próprio. Desde que o áudio passou a
   * ser buscado com autenticação (`lib/audioDaSessao`), existe uma janela entre "a sessão abriu" e
   * "o som está pronto". Sem este motivo, a carta cairia no texto de acervo vazio e diria "precisa
   * de uma gravação com legenda" para uma gravação que tem exatamente isso.
   */
  | 'audio-carregando'
  /**
   * O ACERVO TEM PALAVRAS DE SOBRA, MAS NENHUMA CABE NO JOGO — gate mínimo de alfabeto (S2/S3).
   *
   * Hoje: um deck 100% japonês passa na régua de qualidade (tem tradução, não é ruído) e o
   * caça-palavras listava as pistas com a grade vazia — `normalizarPalavra` reduz `食べる` a
   * string vazia, e a única saída era Revelar tudo, nota 1 no FSRS, em silêncio. O Termo aceitava
   * a mesma palavra (`chaveDoTermo` é `\p{L}`) com um teclado QWERTY que não a escreve. Isto NÃO é
   * "faltam N itens" — o acervo tem material de sobra, só que em alfabeto que o jogo não suporta.
   * O gate declarativo por jogo (que faixas de idioma cada um aceita) vem noutra onda; aqui é só o
   * caso extremo: pool suficiente por CONTAGEM, zero digitável/na-grade de fato.
   */
  | 'alfabeto-nao-suportado'
  /**
   * A ESCRITA NÃO SEPARA PALAVRAS — japonês, chinês, tailandês.
   *
   * "Montar a frase" pede para ordenar as palavras de uma frase, e para isso é preciso saber onde
   * cada uma começa. Nessas escritas não há espaço, e sem um tokenizador não há como cortar.
   * Precisa de nome próprio porque o estado é indistinguível de "sem frase" por contagem — e era
   * assim que a tela dizia "precisa de uma gravação com legenda" para a trilha japonesa, que tem
   * 5.181 frases. Nada a consertar: é uma limitação do jogo naquela escrita, dita como tal.
   */
  | 'escrita-sem-separacao';

/**
 * RÓTULO HUMANO de cada motivo — título curto + o que resolve.
 *
 * Os rótulos de hoje moram dentro de `Play.tsx`, como uma cadeia de `if (motivo === …)` espalhada
 * pelo componente (fora do escopo desta pasta). Esta tabela é a versão declarativa, ao lado do
 * tipo que ela rotula, para a UI facetada (e o próprio `Play.tsx`, numa onda futura de migração)
 * consumirem uma verdade só em vez de reescrever a mesma frase em dois lugares.
 */
export const ROTULO_DO_MOTIVO: Record<MotivoBloqueio, { titulo: string; conserto: string }> = {
  'trilha-sem-frase': {
    titulo: 'precisa de frase',
    conserto: 'a trilha tem palavras soltas; escolha uma gravação para liberar este jogo',
  },
  'sem-voz': {
    titulo: 'sem voz sintetizada',
    conserto: 'este navegador não oferece voz no idioma do baralho',
  },
  'audio-carregando': {
    titulo: 'baixando o áudio',
    conserto: 'a gravação tem som; ele ainda está a caminho',
  },
  'alfabeto-nao-suportado': {
    titulo: 'alfabeto não suportado',
    conserto: 'o acervo tem material de sobra, mas em um alfabeto que este jogo não escreve',
  },
  'escrita-sem-separacao': {
    titulo: 'escrita sem separação de palavras',
    conserto: 'a trilha tem frases, mas esta escrita não marca onde cada palavra começa',
  },
};

export interface EstadoDoJogo {
  id: MinigameId;
  ok: boolean;
  disponiveis: number;
  faltam: number;
  /** De onde saem os itens deste jogo NESTE recorte: o baralho ou as falas da gravação. */
  fonte: 'baralho' | 'falas';
  /**
   * Tamanho do acervo, sem o teto do jogo.
   *
   * `canPlay` conta com `limit: maxItems`, então `disponiveis` nunca passa de `maxItems` — e o
   * rodapé da carta não teria como dizer "de 894 prontas". O pool é medido à parte, com teto alto.
   */
  pool?: number;
  motivo?: MotivoBloqueio;
  /**
   * Quantos itens a rodada REALMENTE terá — o número que a carta pode prometer.
   *
   * Existe porque `min(disponiveis, maxItems)` mentia para o Termo: a escada 1+2+4 consome 3 ou 7,
   * nunca 4, 5 ou 6, e a carta chegava a anunciar "5 prontas" para uma rodada de 7. Deixar cada
   * rótulo fazer a própria conta é como o anúncio e o jogo divergiram; aqui é uma conta só, feita
   * no mesmo lugar que decide se o jogo abre.
   */
  tamanhoDaRodada: number;
}

export interface EntradaDoEstado {
  /** Já triadas e recortadas pela fonte (`cartoesDaFonte` + `triarCartoes`). */
  cartas: VocabCard[];
  frases: FalaComAudio[];
  /** A gravação em uso tem áudio reproduzível? Sem isso, escuta/ditado/karaokê não têm o que tocar. */
  temAudio: boolean;
  /**
   * O áudio já está BAIXADO e pronto para tocar.
   *
   * Distinto de `temAudio` desde que o download passou a ser autenticado: a gravação pode ter som
   * (`temAudio`) e ele ainda estar a caminho. Sem a distinção, o gate liberaria um jogo que o
   * montador recusaria — a mesma divergência que deixou o Termo inacessível.
   *
   * Omitido = pronto, para quem não se importa com a janela de carregamento (testes, trilha).
   */
  audioPronto?: boolean;
  /** O navegador oferece síntese de voz? É o que permite a trilha rodar os jogos de áudio. */
  temVoz: boolean;
  /**
   * SELEÇÃO v2: as FRASES DA TRILHA (Tatoeba, `frasesDaTrilha`), separadas de `frases` de
   * propósito — `frases` continua sendo a gravação, e na trilha os jogos de frase NÃO podem contar
   * falas de uma gravação qualquer (era o defeito antigo). Só a Frase embaralhada as consome.
   */
  frasesDaTrilha?: FalaComAudio[];
  fonteId: 'baralho' | 'sessao' | 'trilha' | 'dificeis';
  lang: string;
  /**
   * A FAIXA VIGENTE. O Termo é o único jogo cujo TAMANHO depende dela: a escada sobe até 1, 2
   * ou 4 tabuleiros conforme a faixa, e o gate anuncia esse tamanho. Sem isto o gate prometia
   * 7 palavras e o montador entregava 5 — a divergência gate×montador que já sumiu com o jogo
   * uma vez, e que um teste desta pasta existe para impedir. Omitida = `medio`.
   */
  faixa?: FaixaDificuldade;
}

/** Teto alto para MEDIR o acervo — não é o tamanho da rodada. */
const TETO_DE_MEDICAO = 999;
/** Idem para as contagens de fala, que não têm um `limit` separado. */
const TETO_DE_FALAS = 99;

/**
 * O tamanho real de uma rodada, dado o material.
 *
 * Para oito dos nove jogos é o teto do jogo, ou o acervo quando ele é menor. O Termo é a exceção
 * declarada: a escada consome 3 ou 7, e é `consumoDaEscada` que sabe disso.
 */
function tamanhoDaRodadaDe(id: MinigameId, disponiveis: number, faixa: FaixaDificuldade = 'medio'): number {
  if (id === 'termo') return consumoDaEscada(disponiveis, ESCADA_POR_FAIXA[faixa]);
  return Math.min(disponiveis, MINIGAMES[id].maxItems);
}

/** Os jogos que medem o pool no MESMO acervo. O Termo conta à parte (`contarJogaveisMulti`). */
const JOGOS_DE_PALAVRA = (Object.keys(MINIGAMES) as MinigameId[])
  .filter(id => MINIGAMES[id].modalidade === 'palavra' && id !== 'termo');

/** Quantos itens o acervo serve a cada jogo de palavra, por id. Ver `poolDosJogosDePalavra`. */
export type PoolPorJogo = ReadonlyMap<MinigameId, number>;

/**
 * O POOL DOS JOGOS DE PALAVRA — UMA varredura para todos eles.
 *
 * Era `buildItems(id, cartas, { limit: TETO_DE_MEDICAO })` por jogo, e isso passou a custar caro
 * quando `recortarPelaComposicao` deixou de cortar em 200 e passou a entregar o acervo inteiro:
 * por jogo, uma ordenação por urgência, dois embaralhamentos com cópia do array e uma passada de
 * `avaliarCartao` (cinco regex por cartão) sobre o baralho todo — três vezes. É a causa medida do
 * TBT do Jogar (133 → 933 ms, achado F0-02).
 *
 * O NÚMERO É O MESMO, e é o que autoriza não montar a rodada para contá-la: `buildItems` recusa
 * item cuja pista já apareceu, e a quantidade de chaves DISTINTAS não depende da ordem em que os
 * cartões entram — logo não depende do sorteio nem da urgência. O laço para quando todos os jogos
 * alcançam o teto de medição, como o `break` de `buildItems`.
 */
export function poolDosJogosDePalavra(cartas: VocabCard[]): PoolPorJogo {
  const contagens = new Map(JOGOS_DE_PALAVRA.map(id => [id, { chaves: new Set<string>(), semChave: 0 }]));
  /* Pista de chave vazia nunca é recusada por repetição (o `if (chaveDaPista && …)` de
     `buildItems`), então ela conta à parte em vez de entrar no conjunto. */
  const total = (c: { chaves: Set<string>; semChave: number }) => c.chaves.size + c.semChave;

  for (const card of cartas) {
    let faltando = false;
    for (const c of contagens.values()) if (total(c) < TETO_DE_MEDICAO) { faltando = true; break; }
    if (!faltando) break;

    if (!card.inDeck || !(card.word ?? '').trim()) continue;
    const pista = promptFor(card);
    if (!pista) continue;
    const chave = chaveComparavel(pista.prompt);
    const temTraducao = !!(card.translation ?? '').trim();

    for (const [id, c] of contagens) {
      if (MINIGAMES[id].requiresTranslation && !temTraducao) continue;
      // Caça-palavras não aceita frase com lacuna como pista — mesma recusa de `buildItems`.
      if (id === 'wordsearch' && pista.clozed) continue;
      if (chave) c.chaves.add(chave); else c.semChave += 1;
    }
  }

  return new Map([...contagens].map(([id, c]) => [id, Math.min(total(c), TETO_DE_MEDICAO)]));
}

/**
 * QUANTO O ACERVO SERVE, COM E SEM O FILTRO DE ALFABETO — fonte única para o gate imperativo
 * (`estadoDoJogo`) e o avaliador declarativo (`elegibilidadeDoJogo`).
 *
 * Só existe para termo e wordsearch, os dois jogos que declaram `requisitos.alfabeto: 'latino'`
 * em `MINIGAMES`. `semFiltro` é a contagem sobre o acervo inteiro (o que separa "pouco material"
 * de "material de sobra, alfabeto não suportado"); `apto` é a mesma conta depois de excluir o que
 * o requisito recusa — `entraNaGrade` para a grade do caça-palavras, `digitavelNoTermo` para o
 * teclado QWERTY fixo do Termo.
 */
function contagemComAlfabeto(
  id: 'termo' | 'wordsearch',
  cartas: VocabCard[],
  faixa: FaixaDificuldade = 'medio',
): { semFiltro: number; apto: number } {
  if (id === 'termo') {
    return {
      semFiltro: contarJogaveisMulti(cartas, faixa),
      apto: contarJogaveisMulti(cartas.filter(c => digitavelNoTermo(c.word ?? '')), faixa),
    };
  }
  return {
    semFiltro: canPlay(id, cartas, { ignorarRequisitos: true }).disponiveis,
    apto: canPlay(id, cartas.filter(c => entraNaGrade(c.word ?? ''))).disponiveis,
  };
}

/**
 * `pools` vem de fora quando os nove estados são calculados juntos — é o que evita repetir a
 * varredura do acervo em cada jogo de palavra.
 */
export function estadoDoJogo(id: MinigameId, e: EntradaDoEstado, pools?: PoolPorJogo): EstadoDoJogo {
  const def = MINIGAMES[id];

  /**
   * O Termo conta o MAIOR GRUPO DE MESMO TAMANHO, não o total de palavras: os tabuleiros de um
   * degrau dividem o mesmo palpite, então comprimentos diferentes não jogam juntos. Um baralho de
   * 300 palavras com comprimentos todos distintos não sobe a escada — e a carta precisa dizer isso
   * com número, em vez de falhar no clique.
   */
  if (id === 'termo') {
    const faixa = e.faixa ?? 'medio';
    /* `contagemComAlfabeto` é a MESMA verdade que `elegibilidadeDoJogo` usa para o estado
     * `degradado` — contar sobre o acervo INTEIRO (`semFiltroDeAlfabeto`) e não só sobre o
     * subconjunto digitável é o que separa "acervo pequeno demais" de "acervo tem material, mas em
     * alfabeto que o Termo não suporta". */
    const { semFiltro: semFiltroDeAlfabeto, apto: n } = contagemComAlfabeto('termo', e.cartas, faixa);
    if (n === 0 && semFiltroDeAlfabeto >= def.minItems) {
      return { id, ok: false, disponiveis: 0, faltam: def.minItems, fonte: 'baralho', motivo: 'alfabeto-nao-suportado', tamanhoDaRodada: 0 };
    }
    return { id, ok: n >= def.minItems, disponiveis: n, faltam: Math.max(0, def.minItems - n), fonte: 'baralho', tamanhoDaRodada: tamanhoDaRodadaDe(id, n, e.faixa) };
  }

  if (def.modalidade !== 'palavra') {
    /* Seleção v2: a trilha passou a entregar FRASES (Tatoeba, `e.frasesDaTrilha`) — e SÓ a Frase
       embaralhada as consome. Os de áudio seguem no caminho "palavra falada por TTS"; o Caça-
       conectores continua bloqueado (4,5% das frases têm conector); e `e.frases` (a gravação)
       nunca conta na trilha, que era o defeito antigo. */
    const daTrilha = e.fonteId === 'trilha';
    const frasesDaTrilha = daTrilha && id === 'scramble' ? (e.frasesDaTrilha ?? []) : [];
    const semFrase = daTrilha && !frasesDaTrilha.length;
    const falas = daTrilha ? frasesDaTrilha : e.frases;

    if (semFrase && !def.aceitaPalavraFalada) {
      return { id, ok: false, disponiveis: 0, faltam: def.minItems, fonte: 'falas', motivo: 'trilha-sem-frase', tamanhoDaRodada: 0 };
    }
    if (semFrase) {
      // Material = palavra do baralho curado; som = TTS. Sem TTS não inventamos áudio.
      const n = e.temVoz ? e.cartas.length : 0;
      return {
        id,
        ok: n >= def.minItems,
        disponiveis: n,
        faltam: Math.max(0, def.minItems - n),
        fonte: 'baralho',
        motivo: e.temVoz ? undefined : 'sem-voz',
        tamanhoDaRodada: tamanhoDaRodadaDe(id, n),
      };
    }

    /* A gravação tem som mas ele ainda não chegou: bloqueio TRANSITÓRIO, com o motivo certo. */
    const precisaDeSom = id !== 'scramble';
    if (precisaDeSom && e.temAudio && e.audioPronto === false) {
      return { id, ok: false, disponiveis: 0, faltam: def.minItems, fonte: 'falas', motivo: 'audio-carregando', tamanhoDaRodada: 0 };
    }

    const n =
      id === 'scramble' ? buildScrambleRounds(falas, { quantidade: TETO_DE_FALAS }).length
        : id === 'escuta' ? (e.temAudio ? buildRodadasEscuta(e.frases, { quantidade: TETO_DE_FALAS }).length : 0)
          : id === 'ditado' ? (e.temAudio ? buildRodadasDitado(e.frases, { quantidade: TETO_DE_FALAS }).length : 0)
            : id === 'conectores' ? (temConectores(e.lang) ? buildRodadasConectores(e.frases, { lang: e.lang, quantidade: TETO_DE_FALAS }).length : 0)
              : (e.temAudio ? e.frases.filter(f => f.endMs > f.startMs && f.text.trim()).length : 0);

    /* Frases existem e nenhuma rodada sai: em escrita sem espaço o motivo é a escrita, não a
       falta de material — e dizer "precisa de gravação" mandaria a pessoa procurar o que ela já
       tem. */
    if (id === 'scramble' && n === 0 && falas.length > 0 && ESCRITA_SEM_ESPACO.test(falas[0].text ?? '')) {
      return { id, ok: false, disponiveis: 0, faltam: def.minItems, fonte: 'falas', motivo: 'escrita-sem-separacao', tamanhoDaRodada: 0 };
    }

    return { id, ok: n >= def.minItems, disponiveis: n, faltam: Math.max(0, def.minItems - n), fonte: 'falas', tamanhoDaRodada: tamanhoDaRodadaDe(id, n) };
  }

  if (id === 'wordsearch') {
    /* Igual ao Termo: medir sobre o acervo inteiro (`semFiltroDeAlfabeto`) é o que distingue
     * "pouco material" de "material de sobra, alfabeto não suportado" — ver `contagemComAlfabeto`. */
    const { semFiltro: semFiltroDeAlfabeto } = contagemComAlfabeto('wordsearch', e.cartas);
    const pronto = canPlay(id, e.cartas.filter(c => entraNaGrade(c.word ?? '')));
    const medidos = pools ?? poolDosJogosDePalavra(e.cartas);
    const pool = medidos.get(id) ?? pronto.disponiveis;
    if (pronto.disponiveis === 0 && semFiltroDeAlfabeto >= def.minItems) {
      return { id, ok: false, disponiveis: 0, faltam: def.minItems, fonte: 'baralho', pool, motivo: 'alfabeto-nao-suportado', tamanhoDaRodada: 0 };
    }
    return { id, ...pronto, pool, fonte: 'baralho', tamanhoDaRodada: tamanhoDaRodadaDe(id, pronto.disponiveis) };
  }

  const pronto = canPlay(id, e.cartas);
  const medidos = pools ?? poolDosJogosDePalavra(e.cartas);
  const pool = medidos.get(id) ?? pronto.disponiveis;
  return { id, ...pronto, pool, fonte: 'baralho', tamanhoDaRodada: tamanhoDaRodadaDe(id, pronto.disponiveis) };
}

/**
 * Todos os jogos de uma vez, indexados por id.
 *
 * `Record<MinigameId, …>` e não um array: quem desenha a grade itera na ORDEM DO USUÁRIO
 * (`lib/ordemDosJogos`), e casar duas listas por índice é como a ordem e o estado saem de sincronia.
 */
export function estadoDeCadaJogo(e: EntradaDoEstado): Record<MinigameId, EstadoDoJogo> {
  // Uma medição do acervo para os três jogos de palavra — eles olham o mesmo conjunto.
  const pools = poolDosJogosDePalavra(e.cartas);
  const fora = {} as Record<MinigameId, EstadoDoJogo>;
  for (const id of Object.keys(MINIGAMES) as MinigameId[]) fora[id] = estadoDoJogo(id, e, pools);
  return fora;
}

/**
 * TRÊS ESTADOS EM VEZ DE DOIS — é o que a futura UI facetada (disponível/degradado/indisponível)
 * precisa e que `EstadoDoJogo.ok` (booleano) não consegue expressar. `estadoDoJogo` continua a
 * MESMA verdade e o MESMO formato — nada aqui a substitui — mas `ok: true` esconde o caso em que o
 * pool passa no piso só depois de descontar quem o alfabeto exclui; a pessoa clica achando que vai
 * jogar com o baralho inteiro e a rodada usa uma fração dele, em silêncio.
 */
export type EstadoDeElegibilidade =
  | { estado: 'disponivel' }
  | { estado: 'degradado'; aptos: number; total: number; inaptosPor: MotivoBloqueio }
  | { estado: 'indisponivel'; motivo: MotivoBloqueio | 'sem-material'; faltam?: number };

/**
 * O AVALIADOR ÚNICO — declarativo, puro (sem React, sem DOM), a MESMA verdade que `estadoDoJogo`
 * usa para termo e wordsearch (`contagemComAlfabeto`), só que devolvendo os três estados que a UI
 * facetada precisa em vez do par `ok`/`motivo`.
 *
 * NÃO conhece jogo por NOME — conhece `requisitos` (`MINIGAMES[jogo].requisitos.alfabeto`). É o
 * que o torna extensível: um 10º jogo com grade ou teclado próprio só precisa DECLARAR
 * `requisitos.alfabeto: 'latino'` na tabela para herdar o gate — sem editar este arquivo. Um jogo
 * que não declara nada (a memória, por exemplo) nunca degrada por alfabeto, porque o requisito
 * ausente É a prova de que ele aceita qualquer letra Unicode.
 *
 * `pool` é o acervo já triado (`cartoesDaFonte` + `triarCartoes`), como em `EntradaDoEstado.cartas`
 * — este avaliador não filtra por tradução nem por fonte, isso já aconteceu antes dele.
 */
export function elegibilidadeDoJogo(
  jogo: MinigameId,
  pool: VocabCard[],
  opts: { temVoz?: boolean; frases?: number } = {},
): EstadoDeElegibilidade {
  const def = MINIGAMES[jogo];

  // O ÚNICO requisito declarado hoje é alfabeto, e só termo/wordsearch o carregam.
  if (def.requisitos?.alfabeto === 'latino' && (jogo === 'termo' || jogo === 'wordsearch')) {
    const { semFiltro: total, apto: aptos } = contagemComAlfabeto(jogo, pool);

    if (aptos >= def.minItems) {
      return aptos < total
        ? { estado: 'degradado', aptos, total, inaptosPor: 'alfabeto-nao-suportado' }
        : { estado: 'disponivel' };
    }
    if (total >= def.minItems) return { estado: 'indisponivel', motivo: 'alfabeto-nao-suportado' };
    return { estado: 'indisponivel', motivo: 'sem-material', faltam: def.minItems - total };
  }

  /* Jogos sem requisito declarado: a mesma conta que `estadoDoJogo` faz para o resto da tabela —
   * `canPlay` para os de palavra, a contagem de frases prontas (`opts.frases`) para os de frase.
   * `opts.temVoz` cobre o caminho "palavra falada" (escuta/ditado/karaokê na trilha), que troca
   * FRASE por CARTÃO+voz quando não há frase — ver `estadoDoJogo`. */
  const disponiveis = def.modalidade === 'palavra'
    ? canPlay(jogo, pool).disponiveis
    : (opts.frases ?? (def.aceitaPalavraFalada && opts.temVoz ? pool.length : 0));

  if (disponiveis >= def.minItems) return { estado: 'disponivel' };
  return { estado: 'indisponivel', motivo: 'sem-material', faltam: def.minItems - disponiveis };
}
