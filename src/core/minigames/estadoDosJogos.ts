import { MINIGAMES, type MinigameId } from './types';
import { canPlay, promptFor } from './itemSource';
import { chaveComparavel } from '../learning/quality';
import { contarJogaveisMulti, consumoDaEscada } from './termo';
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
  | 'audio-carregando';

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
  fonteId: 'baralho' | 'sessao' | 'trilha';
  lang: string;
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
function tamanhoDaRodadaDe(id: MinigameId, disponiveis: number): number {
  if (id === 'termo') return consumoDaEscada(disponiveis);
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
    const n = contarJogaveisMulti(e.cartas);
    return { id, ok: n >= def.minItems, disponiveis: n, faltam: Math.max(0, def.minItems - n), fonte: 'baralho', tamanhoDaRodada: tamanhoDaRodadaDe(id, n) };
  }

  if (def.modalidade !== 'palavra') {
    const semFrase = e.fonteId === 'trilha';

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
      id === 'scramble' ? buildScrambleRounds(e.frases, { quantidade: TETO_DE_FALAS }).length
        : id === 'escuta' ? (e.temAudio ? buildRodadasEscuta(e.frases, { quantidade: TETO_DE_FALAS }).length : 0)
          : id === 'ditado' ? (e.temAudio ? buildRodadasDitado(e.frases, { quantidade: TETO_DE_FALAS }).length : 0)
            : id === 'conectores' ? (temConectores(e.lang) ? buildRodadasConectores(e.frases, { lang: e.lang, quantidade: TETO_DE_FALAS }).length : 0)
              : (e.temAudio ? e.frases.filter(f => f.endMs > f.startMs && f.text.trim()).length : 0);

    return { id, ok: n >= def.minItems, disponiveis: n, faltam: Math.max(0, def.minItems - n), fonte: 'falas', tamanhoDaRodada: tamanhoDaRodadaDe(id, n) };
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
