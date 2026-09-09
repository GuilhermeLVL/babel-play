/**
 * MONTAR A RODADA — os oito ramos, agora no núcleo e como função PURA.
 *
 * POR QUE ESTE ARQUIVO EXISTE. `montarRodada` nasceu como uma closure dentro de `Play.tsx`: lia
 * quinze valores do componente (baralho triado, fonte, filtro, memória, vozes, áudio, etapa da
 * trilha) e ESCREVIA a rodada chamando `setRodadaTermo`/`setRodadaEscuta`/... na mesma expressão.
 * Com doze pontos de chamada e oito ramos, a regra mais cara da tela era a única que não tinha
 * como ser testada sem renderizar um componente de 4.200 linhas com a rede inteira em pé.
 *
 * A SEPARAÇÃO QUE ISTO ESTABELECE, e é a mesma de `composicao.ts`:
 *   · **núcleo** = ESCOLHER o material — qual ramo, quais itens, em que ordem, com que prévia;
 *   · **tela**   = APLICAR o material — qual `setState` recebe o quê.
 *
 * `montarRodada` devolve o material JÁ ESCOLHIDO num tipo etiquetado (`MaterialDaRodada`), e a
 * tela faz um `switch` de sete linhas. Nada é sorteado de novo na aplicação: a prévia da antessala
 * continua sendo EXATAMENTE a rodada que vai ser jogada — sortear duas vezes seria mentir na cara
 * da pessoa, e é a razão de a antessala existir.
 *
 * TUDO ENTRA POR PARÂMETRO. Não há `Date.now()` implícito (`agora` é campo), não há leitura de
 * `localStorage` (a decisão do modo automático entra como `decisaoAuto`, uma função injetada) e
 * não há `fetch`. O que sobra de não-determinístico é UM `Math.random` no ramo de palavra falada
 * da trilha, e ele está comentado onde acontece.
 */
import type { VocabCard } from '../../types';
import { isDueNow } from '../learning/due';
import { diaLocal } from '../learning/economia';
import { estadoDoItem, type HistoricoDoItem,ordenarPorMemoria, rngDe } from '../learning/memoriaDeItens';
import { baseLang } from '../texto/idioma';
import { chaveDaPalavra } from '../texto/palavra';
import { aceitaFiltroDeDificuldade, type CortesDeFaixa, type EstrategiaDaUI,faixaDe as faixaDaComposicao, type FaixaDificuldade } from './composicao';
import {
  buildRodadasConectores,
  buildRodadasDitado,
  buildRodadasEscuta,
  type FalaComAudio,
  type RodadaConectores,
  type RodadaDitado,
  type RodadaEscuta,
} from './escuta';
import { buildItems } from './itemSource';
import { type ItemCru, type ItemDaAntessala, type OrigemDoItem,origemDoMaterial, previaSegura } from './revelavel';
import { buildScrambleRounds, type RodadaFrase } from './scramble';
import { type FonteDeItens,priorizar } from './source';
import { rodadasDaEscada, type RodadaTermo } from './termo';
import { type MinigameId, type MinigameItem,MINIGAMES } from './types';

/**
 * Uma fala, como esta montagem precisa dela.
 *
 * Descrita por ESTRUTURA e não importada de `lib/sentences` — mesma razão de `escuta.ts`: o núcleo
 * é isomórfico e `lib/sentences` puxa `data/api`, que é DOM. `Sentence` satisfaz esta forma.
 */
export interface FalaDaRodada {
  id: string;
  text: string;
  translation: string;
  lang: string;
  startMs: number;
  endMs: number;
}

/** A fala do Karaokê, na forma que o jogo consome (idêntica a `FalaKaraoke` da tela). */
export interface FalaDeKaraoke {
  id?: string;
  texto: string;
  traducao?: string;
  lang: string;
  startMs: number;
  endMs: number;
}

/**
 * O MATERIAL ESCOLHIDO, etiquetado por destino.
 *
 * É o que substitui o antigo fecho `aplicar: () => void`, que carregava um `setState` de dentro do
 * componente. Etiquetado (e não uma união solta) para a tela não ter de adivinhar: um jogo novo
 * que esqueça de tratar o seu rótulo não compila.
 */
export type MaterialDaRodada =
  | { tipo: 'termo'; rodadas: RodadaTermo[] }
  | { tipo: 'frase'; rodadas: RodadaFrase[] }
  | { tipo: 'escuta'; rodadas: RodadaEscuta[] }
  | { tipo: 'ditado'; rodadas: RodadaDitado[] }
  | { tipo: 'conectores'; rodadas: RodadaConectores[] }
  | { tipo: 'karaoke'; falas: FalaDeKaraoke[] }
  | { tipo: 'itens'; jogo: MinigameId; itens: MinigameItem[] };

/** Uma rodada JÁ MONTADA: a prévia que a antessala mostra e o material que a tela vai aplicar. */
export interface RodadaMontada {
  jogo: MinigameId;
  previa: ItemDaAntessala[];
  material: MaterialDaRodada;
}

/** A etapa atual da trilha, reduzida ao que a montagem usa: a lista de palavras dela. */
export interface EtapaParaRodada {
  palavras: string[];
}

/** A semente de "praticar ISTO agora", reduzida ao que a montagem usa. */
export interface SementeDaRodada {
  word?: string;
  text?: string;
}

/**
 * TUDO O QUE A MONTAGEM PRECISA — e nada que ela possa buscar sozinha.
 *
 * A lista é longa de propósito: era exatamente esta a superfície que a closure lia do componente
 * sem declarar. Escrita, ela vira o contrato que o teste de caracterização fixa.
 */
export interface EntradaDaRodada {
  jogo: MinigameId;
  /** O relógio, injetado. Era `Date.now()` dentro da closure — e o que impedia o teste. */
  agora: number;
  /** O acervo já TRIADO e recortado pela fonte (`jogaveis` na tela). */
  jogaveis: VocabCard[];
  fonte: FonteDeItens;
  /** A etapa atual da trilha, quando existe: ela RECORTA o material antes dos ramos. */
  etapaDaTrilha: EtapaParaRodada | null;
  /** Como cada item foi das outras vezes. Chave = `item_ref`. */
  memoria: ReadonlyMap<string, HistoricoDoItem>;
  estrategia: EstrategiaDaUI;
  /** Os chips de dificuldade escolhidos à mão. Vazio = decide o automático. */
  faixas: FaixaDificuldade[];
  /** Os cortes de faixa que o servidor usou, para rotular igual (ver `composicao.ts`). */
  cortes?: CortesDeFaixa | null;
  /** A decisão do modo automático, INJETADA: ela lê precisões do `localStorage`, que não é daqui. */
  decisaoAuto: (jogo: MinigameId) => { faixa: FaixaDificuldade };
  /** A memória curta ("o que acabou de cair"). PREFERÊNCIA: demove, não exclui. */
  vistasRecentes: ReadonlySet<string>;
  /** As falas de GRAVAÇÃO (já sem filtro de idioma — ele é aplicado aqui). */
  frasesGravadas: FalaDaRodada[];
  /** As falas do Tatoeba da trilha, quando a trilha está na jogada. */
  frasesDaTrilha: FalaDaRodada[];
  /** As frases derivadas do próprio acervo — só entram quando NÃO há fala gravada. */
  frasesDoAcervo: FalaDaRodada[];
  comTrilha: boolean;
  /** Há voz sintetizada NESTE idioma? É o que decide se a trilha tem jogo de escuta. */
  temVoz: boolean;
  /** Há áudio de gravação disponível? Sem ele os três jogos de escuta não montam. */
  temAudio: boolean;
  /** Índice do acervo por palavra em minúsculas — de onde saem nível e procedência da prévia. */
  porPalavra: ReadonlyMap<string, VocabCard>;
  /** De onde veio cada palavra. Injetada: fecha sobre a proveniência servida, que é da tela. */
  origemDaPalavra: (palavra: string, cardId?: string) => OrigemDoItem;
  /** O nome da gravação em uso. Entra CRU: quem o cerca é `previaSegura`, num lugar só. */
  tituloDaSessao?: string;
  semente?: SementeDaRodada | null;
  /** Restringe o material a um conjunto de `item_ref` — é como "repetir a última" funciona. */
  apenas?: ReadonlySet<string>;
  /** O que NÃO pode cair de novo — contrato da corrente ("mais uma, com palavras novas"). */
  evitarTambem?: ReadonlySet<string>;
}

/**
 * MONTAR ≠ COMEÇAR — e essa separação é a antessala inteira.
 *
 * Antes, clicar num jogo montava a rodada e caía direto nela: não havia instante nenhum em que
 * o conteúdo existisse e a pessoa pudesse olhar. Daí as três queixas serem a mesma — "não sei o
 * que vem", "quero repetir esta", "quero pular esta" só têm resposta se a rodada existir ANTES
 * de começar.
 *
 * Devolve `null` quando não dá para montar (faltam itens). O material devolvido é a rodada
 * EXATA que vai ser jogada, e não uma amostra parecida — sortear de novo na hora de jogar seria
 * mentir na cara da pessoa.
 *
 * `apenas` restringe o material de partida a um conjunto de `item_ref`. É como "repetir a
 * última" funciona: não pela semente (o baralho e o relógio mudam entre partidas, então a mesma
 * semente daria outra rodada), mas pelos itens que ficaram gravados.
 */
export function montarRodada(entrada: EntradaDaRodada): RodadaMontada | null {
  const {
    jogo, agora, jogaveis, fonte, etapaDaTrilha, memoria, estrategia, faixas, cortes,
    decisaoAuto, vistasRecentes, frasesGravadas, frasesDaTrilha, frasesDoAcervo,
    comTrilha, temVoz, temAudio, porPalavra, origemDaPalavra, tituloDaSessao,
    semente, apenas, evitarTambem,
  } = entrada;

  const trecho = semente?.word || semente?.text;
  /* SELEÇÃO v2 — os insumos da régua: a memória de itens (histórico por `item_ref`, em todos os
     jogos) e a SEMENTE do dia (rotação própria por jogo dentro do mesmo acervo). */
  const sementeDoDia = String(diaLocal(agora));
  /* A trilha recorta pela ETAPA atual (+ o que está voltando por erro ou vencido): estudar a
     etapa 7 não deveria sortear o nível A2 inteiro. Sem material suficiente, alarga. */
  let base = jogaveis;
  if (!apenas?.size && fonte.id === 'trilha' && etapaDaTrilha) {
    const daEtapa = new Set(etapaDaTrilha.palavras.map((p) => chaveDaPalavra(p)));
    const recorte = jogaveis.filter((c) => {
      if (daEtapa.has(chaveDaPalavra(c.word))) return true;
      const e = estadoDoItem(memoria.get(c.word));
      return e.tag === 'errando' || isDueNow(c, 'fsrs', agora);
    });
    if (recorte.length >= MINIGAMES[jogo].minItems) base = recorte;
  }
  /* Modo AUTO: a faixa decidida pela precisão recente filtra aqui (o pedido ao servidor não muda
     por jogo). Sem material na faixa, alarga para o acervo inteiro em vez de recusar a rodada. */
  if (!apenas?.size && estrategia === 'auto' && aceitaFiltroDeDificuldade(jogo)) {
    const { faixa } = decisaoAuto(jogo);
    const naFaixa = base.filter((c) => {
      const f = faixaDaComposicao(c.difficultyScore ?? null, cortes);
      return f == null || f === faixa;
    });
    if (naFaixa.length >= MINIGAMES[jogo].minItems) base = naFaixa;
  }
  /**
   * O QUE JÁ CAIU NESTA CORRENTE SAI DO MATERIAL — regra DURA, e ela some do resto do arquivo.
   *
   * Há dois conjuntos de "já vi" e eles nunca tiveram o mesmo peso, mas eram fundidos num só
   * `evitar` logo abaixo:
   *
   *   · `vistasRecentes` — memória curta persistida (teto 200, por origem). É PREFERÊNCIA: melhor
   *     não repetir, mas repetir é aceitável, porque a alternativa é ficar sem jogo depois de uma
   *     maratona. Todos os construtores a tratam como demoção, com fallback — e está certo.
   *   · `vistosNaSequencia` — o que caiu NESTA corrente. É CONTRATO: o botão que trouxe a pessoa
   *     até aqui diz "palavras novas".
   *
   * Fundidos, o segundo herdava o fallback do primeiro. MEDIDO no banco real (`trilha:A1`): duas
   * correntes emendadas devolveram 5 das 7 mesmas palavras; simulando com o dado da trilha, da
   * terceira rodada em diante era 7/7 — para sempre. A piscina é pequena porque a trilha recorta
   * pela ETAPA atual e o Termo ainda reduz ao maior grupo de mesmo comprimento: na etapa 1 do A1
   * são nove palavras de cinco letras, e a escada come sete.
   *
   * Cortando aqui, ANTES dos oito ramos, a regra vale para os nove jogos de uma vez — inclusive
   * para o ramo de palavra falada da trilha (Ditado/Qual foi?/Karaokê), que é `slice(0, maxItems)`
   * puro e nunca recebeu `evitar` nenhum: lá "mais uma" repetia a rodada inteira desde sempre.
   *
   * E quando não sobra material, cada ramo já devolve `null` — que é o caminho honesto que
   * existia e era inalcançável: `semMaterial` fica verdadeiro e a raspadinha esconde o "mais uma"
   * em vez de entregar a rodada anterior de novo.
   *
   * `apenas` (repetir estas) ignora a regra de propósito: ali repetir é o pedido.
   */
  const naoRepetir = apenas?.size ? null : evitarTambem;
  const semRepetidas = <T,>(lista: T[], refDe: (x: T) => string) =>
    naoRepetir?.size ? lista.filter((x) => !naoRepetir.has((refDe(x) ?? '').trim())) : lista;

  const cartas = semRepetidas(apenas?.size ? jogaveis.filter((c) => apenas.has(c.word)) : base, (c) => c.word);
  /* Frases: na trilha vêm das 2.552 frases Tatoeba (`frasesDaTrilha`), que antes eram código
     morto e deixavam a Frase embaralhada bloqueada com "trilha sem frase". */
  /* As frases do acervo só entram quando NÃO há fala gravada: numa rodada de escuta, misturar
     voz sintetizada com áudio real entrega a resposta pelo timbre. */
  /* A fala gravada TAMBÉM passa pelo filtro de idioma: sem isto, uma gravação em inglês
     aparecia numa rodada de árabe — a rodada dizia um idioma e jogava outro (G0, defeito 3). */
  const doIdioma = (f: { lang?: string }) => !fonte.lang || !f.lang || baseLang(f.lang) === baseLang(fonte.lang);
  const gravadas = frasesGravadas.filter(doIdioma);
  const falasGravadas = comTrilha ? [...frasesDaTrilha, ...gravadas] : gravadas;
  const falasBrutas = falasGravadas.length ? falasGravadas : frasesDoAcervo;
  const falas = semRepetidas(apenas?.size ? falasBrutas.filter((f) => apenas.has(f.id)) : falasBrutas, (f) => f.id);
  /* Repetir NÃO deve evitar o que acabou de cair — é justamente isso que se está pedindo.
     Já o "trocar por outras" precisa evitar TAMBÉM o que está na tela agora: quem clica ali está
     dizendo "essas não". Medido antes deste ajuste: trocar devolvia 4 dos 12 itens de volta. */
  const evitar = apenas?.size
    ? undefined
    : evitarTambem?.size
      ? new Set([...vistasRecentes, ...evitarTambem])
      : vistasRecentes;

  /**
   * O FUNIL ÚNICO DA PRÉVIA.
   *
   * Antes, cada um dos oito ramos abaixo montava a sua `previa` na mão — e os oito escreviam a
   * RESPOSTA no título (`titulo: x.palavra`, `titulo: i.answer`, `titulo: x.fala.text`…). Oito
   * lugares para lembrar de uma regra é zero lugares: o Termo imprimia a palavra que ia pedir
   * para soletrar letra a letra, e o Ditado, a frase que ia pedir para transcrever.
   *
   * Agora cada ramo só entrega o material CRU e `previaSegura` decide o que vai à tela, pela
   * tabela `REVELAVEL` (ver `core/minigames/revelavel.ts`). Um ramo novo não consegue vazar
   * sem passar por aqui, e um jogo novo não compila sem declarar o que revela.
   */
  /* A procedência PADRÃO é preenchida aqui, no ponto por onde os oito ramos passam — e não em
     cada um deles. Os cinco jogos de frase tiram material de falas, não de cartões: para eles
     não há proveniência por item, mas a fonte da rodada é conhecida e vale para todos. Um ramo
     que já sabe a origem (os de baralho, via `nivelDe`) mantém a sua. */
  /* Jogo de FRASE vive de gravação, e a prévia diz isso mesmo quando a aba é outra —
     `origemDoMaterial` (revelavel.ts) carrega a regra e o porquê (auditoria S4). */
  const pronta = (crus: ItemCru[], material: MaterialDaRodada): RodadaMontada => ({
    jogo,
    previa: previaSegura(
      jogo,
      crus.map((c) => ({
        ...c,
        origem: origemDoMaterial(jogo, fonte.id, c.origem),
        origemRotulo: c.origemRotulo ?? tituloDaSessao,
        idioma: c.idioma ?? fonte.lang,
      })),
    ),
    material,
  });
  /**
   * Os dados de APRESENTAÇÃO de uma palavra: nível e procedência.
   *
   * Nenhum dos dois viaja no `MinigameItem`, e não devem — lá é contrato de JOGO, e nem o nível
   * nem a origem mudam como qualquer um dos nove joga. Vêm daqui, do mesmo índice do baralho que
   * a promoção da trilha já usa, e seguem para `previaSegura`, que decide o que a tela vê.
   *
   * O rótulo da gravação entra CRU de propósito: quem o cerca é `previaSegura`, num lugar só. Se
   * a filtragem fosse feita aqui, cada ramo de `montarRodada` teria de lembrar dela — que é
   * exatamente o arranjo que deixou os oito ramos vazarem a resposta da primeira vez.
   */
  const nivelDe = (palavra: string) => {
    const c = porPalavra.get((palavra || '').toLowerCase());
    return {
      cefr: c?.cefrLevel,
      cefrConfianca: c?.cefrConfidence,
      origem: origemDaPalavra(palavra, c?.id),
      origemRotulo: tituloDaSessao,
      idioma: c?.srcLang || fonte.lang,
    };
  };

  /**
   * `evitar` PARA OS JOGOS DE FALA — que não o recebiam.
   *
   * Só `buildItems` (memória/caça-palavras/duelo) e `buildTermoRounds` aceitam `evitar`. Os cinco
   * jogos de frase nunca souberam o que já tinha caído, e um deles é pior: `buildScrambleRounds`
   * faz `.filter().slice(0, quantidade)` SEM embaralhar — devolvia a MESMA rodada para sempre,
   * então "mais uma" na Frase embaralhada era literalmente a rodada anterior de novo. Medido no
   * navegador ao emendar uma corrente.
   *
   * A despriorização é feita aqui, na lista de falas, com a mesma semântica de `evitar` no core:
   * o que já caiu vai para o FIM da fila, não é excluído. Assim uma fonte com três falas continua
   * jogável em vez de virar beco sem saída.
   */
  const falasNaOrdem = (() => {
    /* SELEÇÃO v2: os cinco jogos de frase passam pela MESMA régua de memória das palavras
       (errando → novas → aprendendo → firmes; leeches fora; semente própria por jogo). Antes só
       demoviam o que tinha acabado de cair, e isso morria no F5. */
    const { ordenados } = ordenarPorMemoria(falas, (f) => f.id, {
      memoria,
      semente: `${jogo}:${sementeDoDia}`,
      agora,
      diaDe: diaLocal,
      cotaDeNovas: 0.3,
    });
    if (!evitar?.size) return ordenados;
    const frescas: typeof falas = [];
    const vistas: typeof falas = [];
    for (const f of ordenados) (evitar.has(f.id) ? vistas : frescas).push(f);
    return [...frescas, ...vistas];
  })();

  if (jogo === 'termo') {
    /* A escada gasta 1+2+4 = 7 palavras, e todas precisam ter o MESMO comprimento: o palpite é
       um só para todos os tabuleiros de um degrau.

       O tamanho da rodada é decidido por `rodadasDaEscada`, no core, e não aqui. O comentário
       que existia neste lugar afirmava que "com menos de 7, `planoDaEscada` encurta a escada em
       vez de recusar o jogo", era falso, e foi essa premissa que deixou o Termo inacessível:
       com `mesmoTamanho`, pedir 7 e ter 5 devolvia lista VAZIA, nunca uma escada curta. */
    /* A FAIXA CHEGA AO TERMO. Ela já recortava o material da rodada, mas o Termo montava a
       escada com régua própria: 4–8 letras e 1→2→4 tabuleiros para todo mundo. O resultado na
       tela era um quarteto — quatro grades lado a lado, nove linhas cada — para quem estava
       começando. Agora as letras e o teto da escada seguem a mesma faixa do resto.
       A escolha explícita nos chips vence; sem ela, a decisão automática pela precisão recente. */
    /* REFAZER NÃO É ESCOLHER DIFICULDADE. Com `apenas`, as palavras JÁ foram escolhidas numa
       rodada que aconteceu, e reaplicar a régua de letras de hoje sobre elas tornava fases
       inteiras impossíveis de refazer — o clique morria em silêncio. Ver `ReguaDeLetras`. */
    const faixaDoTermo = apenas?.size
      ? ('livre' as const)
      : faixas.length === 1
        ? faixas[0]
        : faixas.length
          ? undefined
          : decisaoAuto('termo').faixa;
    const r = rodadasDaEscada(cartas, {
      evitar,
      memoria,
      semente: sementeDoDia,
      diaDe: diaLocal,
      faixa: faixaDoTermo,
    });
    if (!r.length) return null;
    return pronta(
      r.map((x) => ({ ref: x.palavra, alvo: x.palavra, pista: x.pista, ...nivelDe(x.palavra) })),
      { tipo: 'termo', rodadas: r },
    );
  }
  if (jogo === 'scramble') {
    // `rand` com semente: a Frase embaralhada não embaralhava a ORDEM das falas (mesma rodada
    // para sempre); a ordem já vem da memória, e o embaralhar das peças fica determinístico no dia.
    const r = buildScrambleRounds(falasNaOrdem, {
      quantidade: MINIGAMES.scramble.maxItems,
      rand: rngDe(`scramble:${sementeDoDia}:${falasNaOrdem.length}`),
    });
    if (r.length < MINIGAMES.scramble.minItems) return null;
    return pronta(
      r.map((x) => ({ ref: x.sentenceId ?? '', alvo: x.correta.join(' '), pista: x.traducao })),
      { tipo: 'frase', rodadas: r },
    );
  }
  /**
   * NA TRILHA, os três jogos de escuta saem de PALAVRAS faladas por voz sintetizada.
   *
   * `FalaComAudio` pede `startMs`/`endMs`; aqui eles vão ZERADOS de propósito, e é isso que o
   * `falante` lê como "não há clipe a recortar, fale o texto". Marcar um intervalo falso faria
   * o jogo tentar recortar um áudio que não existe.
   *
   * O exercício muda de natureza e continua legítimo: Ditado = ouça e escreva a palavra;
   * Qual foi? = ouça e escolha entre palavras parecidas (par mínimo); Karaokê = repita a palavra.
   */
  if (fonte.id === 'trilha' && MINIGAMES[jogo].aceitaPalavraFalada) {
    const def = MINIGAMES[jogo];
    const sorteadas = priorizar<VocabCard>(cartas, trecho, (c) => c.word).slice(0, def.maxItems);
    if (sorteadas.length < def.minItems || !temVoz) return null;
    const comoFala: FalaComAudio[] = sorteadas.map((c) => ({
      id: c.id || c.word,
      text: c.word,
      translation: c.translation,
      lang: c.srcLang || fonte.lang,
      startMs: 0,
      endMs: 0,
    }));
    const crus: ItemCru[] = sorteadas.map((c) => ({
      ref: c.word,
      alvo: c.word,
      pista: c.translation,
      ...nivelDe(c.word),
    }));

    if (jogo === 'ditado') {
      return pronta(crus, { tipo: 'ditado', rodadas: comoFala.map((f) => ({ fala: f, palavras: 1 })) });
    }
    if (jogo === 'escuta') {
      /* As alternativas erradas são as OUTRAS palavras da mesma leva — é o que transforma isto
         num exercício de par mínimo em vez de adivinhação. */
      /* O ÚNICO ponto não-determinístico desta função: a ORDEM das alternativas. Ela é sorteio de
         apresentação, não escolha de material — o conjunto das opções é fixo, e é ele que o teste
         de caracterização fixa. */
      return pronta(crus, {
        tipo: 'escuta',
        rodadas: comoFala.map((f, i) => ({
          correta: f,
          opcoes: [f, ...comoFala.filter((_, k) => k !== i).slice(0, 3)].sort(() => Math.random() - 0.5),
        })),
      });
    }
    return pronta(crus, {
      tipo: 'karaoke',
      falas: comoFala.map((f) => ({
        id: f.id,
        texto: f.text,
        traducao: f.translation,
        lang: f.lang ?? '',
        startMs: 0,
        endMs: 0,
      })),
    });
  }

  if (jogo === 'escuta') {
    const r = priorizar(
      buildRodadasEscuta(falasNaOrdem, { quantidade: MINIGAMES.escuta.maxItems }),
      trecho,
      (x) => x.correta.text,
    );
    if (r.length < MINIGAMES.escuta.minItems || !temAudio) return null;
    return pronta(
      r.map((x) => ({ ref: x.correta.id ?? '', alvo: x.correta.text, pista: x.correta.translation })),
      { tipo: 'escuta', rodadas: r },
    );
  }
  if (jogo === 'ditado') {
    const r = priorizar(
      buildRodadasDitado(falasNaOrdem, { quantidade: MINIGAMES.ditado.maxItems }),
      trecho,
      (x) => x.fala.text,
    );
    if (r.length < MINIGAMES.ditado.minItems || !temAudio) return null;
    return pronta(
      r.map((x) => ({ ref: x.fala.id ?? '', alvo: x.fala.text, pista: x.fala.translation })),
      { tipo: 'ditado', rodadas: r },
    );
  }
  if (jogo === 'conectores') {
    const r = priorizar(
      buildRodadasConectores(falasNaOrdem, { lang: fonte.lang, quantidade: MINIGAMES.conectores.maxItems }),
      trecho,
      (x) => x.fala.text,
    );
    if (r.length < MINIGAMES.conectores.minItems) return null;
    return pronta(
      r.map((x) => ({ ref: x.fala.id ?? '', alvo: x.fala.text, pista: x.fala.translation })),
      { tipo: 'conectores', rodadas: r },
    );
  }
  if (jogo === 'karaoke') {
    const lista: FalaDeKaraoke[] = priorizar<FalaDaRodada>(
      falasNaOrdem.filter((f) => f.endMs > f.startMs && !!f.text.trim()),
      trecho,
      (f) => f.text,
    )
      .slice(0, MINIGAMES.karaoke.maxItems)
      .map((f) => ({
        id: f.id,
        texto: f.text,
        traducao: f.translation,
        lang: f.lang || '',
        startMs: f.startMs,
        endMs: f.endMs,
      }));
    if (lista.length < MINIGAMES.karaoke.minItems || !temAudio) return null;
    return pronta(
      lista.map((f) => ({ ref: f.id ?? '', alvo: f.texto, pista: f.traducao })),
      { tipo: 'karaoke', falas: lista },
    );
  }
  const itens = priorizar(
    buildItems(jogo, cartas, {
      evitar,
      memoria,
      semente: sementeDoDia,
      diaDe: diaLocal,
      excluirEvitadas: true,
      now: agora,
    }),
    trecho,
    (x) => x.answer,
  );
  if (itens.length < MINIGAMES[jogo].minItems) return null;
  return pronta(
    itens.map((i) => ({ ref: i.answer, alvo: i.answer, pista: i.prompt, ...nivelDe(i.answer) })),
    { tipo: 'itens', jogo, itens },
  );
}
