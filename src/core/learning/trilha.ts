import type { CefrLevel } from './contract';
import { baseLangDe } from './quality';
import { SESSAO_DA_TRILHA } from '../minigames/source';

/**
 * A TRILHA — vocabulário curado por nível, para quem ainda não tem o que capturar.
 *
 * O PROBLEMA QUE ELA RESOLVE. Tudo neste app nasce do que a pessoa grava, e isso é a maior
 * qualidade dele — mas cria um vazio no começo: quem acabou de instalar não tem baralho, e sem
 * baralho não há jogo. Pior, quem só captura acaba com um vocabulário enviesado pelo que assiste,
 * cheio de buracos nas palavras básicas que nunca apareceram no vídeo.
 *
 * A HONESTIDADE AQUI É O NÍVEL. O `estimateCefr` do app chuta por COMPRIMENTO DA PALAVRA mais um
 * conjunto de 68 palavras em inglês — e diz isso, carregando `confidence: 0.3`. A trilha traz
 * nível MEDIDO por linguistas, então entra com `confidence: 1`. É essa diferença que separa
 * "acho que é B1" de "é B1", e ela precisa continuar visível: um número curado e um chute não
 * podem virar a mesma coisa no banco.
 *
 * O DADO É EMBUTIDO (`src/data/trilha/en.json`, 3.997 pares: A1 827, A2 807, B1 1.114, B2 925,
 * C1 214, C2 110), não buscado. Motivos em `src/data/trilha/FONTES.md`, junto com a atribuição de
 * licença — que é obrigação, não cortesia.
 *
 * O QUE MUDOU, E POR QUÊ. Antes cada nível era uma lista de palavras SECAS, e este módulo dizia
 * "traduzir não é comigo". Só que a pista de todo jogo É a tradução: sem ela, a tela era obrigada
 * a traduzir palavra por palavra pela rede na hora de baixar o lote — 116 cliques para completar o
 * A1, com falhas silenciosas quando o tradutor não respondia e resultados fora de contexto
 * ("cook → cozinheiro de bordo"). E no perfil Privado/Local, sem gateway de nuvem, a trilha
 * simplesmente não funcionava. Com a tradução EMBUTIDA no par, a trilha joga direto do dado: zero
 * rede, zero espera, e a mesma pista para todo mundo.
 */

export interface DadoTrilha {
  lang: string;
  fonte: string;
  versao: string;
  /**
   * `[palavra, traducao]` e, quando existe, `[palavra, traducao, frase, fraseTraduzida]`.
   *
   * O par não é conveniência: é a única forma de a trilha ser jogável sem tradutor externo — ver o
   * cabeçalho deste arquivo.
   *
   * A FRASE é opcional porque a cobertura é real, não total: 2.552 das 2.784 palavras têm frase
   * (91,7%), e a queda é por nível — 99,7% no A1, 26,6% no C2. Um par de três elementos com a frase
   * vazia mentiria sobre a existência do dado; a ausência do elemento é a verdade. Vem do Tatoeba,
   * CC BY 2.0 FR, com os autores creditados em `FONTES.md`.
   */
  niveis: Partial<Record<CefrLevel, Array<[string, string, string?, string?]>>>;
}

/** A ordem dos níveis — usada para "até este nível" e para o próximo degrau. */
export const NIVEIS_CEFR: CefrLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

/** Confiança do nível vindo da trilha. 1 = medido por linguista, não estimado. */
export const CONFIANCA_CURADA = 1;

export interface PalavraDaTrilha {
  palavra: string;
  /** A tradução curada que acompanha a palavra — é ela que vira pista no jogo. */
  traducao: string;
  nivel: CefrLevel;
  /**
   * Frase de exemplo REAL contendo a palavra (Tatoeba, CC BY 2.0 FR), de 5 a 12 palavras.
   *
   * Ausente em 232 das 2.784 palavras, e a ausência é o dado: forjar uma frase daria à trilha um
   * contexto que ninguém escreveu. Quem consome trata `undefined` como "esta palavra não tem
   * exemplo", nunca como string vazia.
   */
  frase?: string;
  /** Tradução portuguesa da `frase`, do mesmo par do Tatoeba. Só existe se `frase` existir. */
  fraseTraduzida?: string;
}

export interface EscolhaOpts {
  /** Quantas palavras devolver. */
  quantidade: number;
  /** Palavras que a pessoa JÁ tem no baralho (normalizadas por quem chama). */
  jaTem: ReadonlySet<string>;
  /** Embaralhador injetável — o teste passa um determinístico. */
  shuffle?: <T>(xs: T[]) => T[];
}

function embaralhar<T>(xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Normalização usada para casar com o baralho: sem acento, sem caixa, só letras e números. */
export function chaveDaPalavra(s: string): string {
  return (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '');
}

/**
 * Escolhe as próximas palavras de um nível, pulando o que a pessoa já tem.
 *
 * NÃO devolve palavra repetida do baralho — reapresentar o que já se sabe é o jeito mais rápido
 * de a trilha parecer inútil. Se o nível acabar, devolve menos do que se pediu em vez de
 * completar com palavra de outro nível: a promessa é "vocabulário A2", e cumprir pela metade é
 * melhor que cumprir errado.
 */
export function proximasPalavras(
  dado: DadoTrilha,
  nivel: CefrLevel,
  opts: EscolhaOpts,
): PalavraDaTrilha[] {
  const shuffle = opts.shuffle ?? embaralhar;
  const doNivel = dado.niveis[nivel] ?? [];
  const candidatas = doNivel.filter(par => !opts.jaTem.has(chaveDaPalavra(par[0])));
  return shuffle(candidatas)
    .slice(0, Math.max(0, opts.quantidade))
    /* `frase`/`fraseTraduzida` só entram quando o par as tem — ver o docstring de `PalavraDaTrilha`. */
    .map(([palavra, traducao, frase, fraseTraduzida]) => (
      frase ? { palavra, traducao, nivel, frase, fraseTraduzida } : { palavra, traducao, nivel }
    ));
}

/**
 * O CARTÃO DA TRILHA — o formato mínimo que o funil de jogos consome.
 *
 * DECLARADO AQUI, E NÃO IMPORTADO DE `src/types.ts`, pelo mesmo motivo que `FalaComAudio` em
 * `core/minigames/escuta.ts`: `core` é isomórfico e não pode depender de código de aplicação.
 * Descrever o contrato por ESTRUTURA mantém o núcleo testável sem navegador e sem banco.
 *
 * Os campos são exatamente os que a cadeia lê — `buildItems` (`inDeck`, `word`, `id`,
 * `translation`, `srcLang`, e as datas via `byUrgency`/`isDueNow`), `avaliarCartao` (`word`,
 * `translation`, `srcLang`) e `cartoesDaFonte` (`sourceSessionId`, `cefrLevel`). Nada além disso:
 * campo que ninguém lê num objeto que não existe no banco é só convite a acreditar que ele existe.
 */
export interface VocabCardDaTrilha {
  /**
   * SEMPRE VAZIO, e isso é a razão de ser deste tipo.
   *
   * Estes cartões são montados em memória e NUNCA foram gravados — não há linha em `vocab_cards`
   * com um id correspondente. No fim da rodada, `Play.tsx` (`aoTerminar`) faz
   * `if (o.cardId && def.writesSrs) await reviewCard(o.cardId, …)`. Com id preenchido, cada item
   * jogado viraria uma chamada de revisão a um id inexistente — erro por item, a rodada inteira
   * falhando em silêncio no `catch` de best-effort. Vazio, a condição é falsa e o resultado cai no
   * ramo `drill`, que é a verdade: foi treino, não revisão agendada.
   */
  id: string;
  word: string;
  translation: string;
  srcLang: string;
  cefrLevel: CefrLevel;
  cefrConfidence: number;
  /** O id sintético que `bulkAdd` decompõe para gravar a ocorrência. NÃO serve para filtrar. */
  sourceSessionId: string;
  /** A marca de procedência — é por ela que `cartoesDaFonte` recorta. Sempre `true` aqui. */
  daTrilha: true;
  /** `buildItems` descarta quem não está no baralho; a rodada da trilha É o baralho dela. */
  inDeck: boolean;
  /**
   * Vazias de propósito. Cartão que nunca foi estudado não tem vencimento, e `isDueAt` trata
   * string vazia como "não vencido" — então eles entram na fila normal em vez de fingirem
   * urgência que ninguém mediu.
   */
  fsrsDueAt: string;
  leitnerDueAt: string;
  /**
   * Frase de exemplo real (Tatoeba, CC BY 2.0 FR) — o MESMO nome de campo que o cartão do banco usa.
   *
   * É por este nome que os jogos de lacuna funcionam na trilha sem nenhuma mudança neles: quem lê
   * `card.sentence` não precisa saber se veio do banco ou do dado embutido. Ausente em 232 das
   * 2.784 palavras.
   */
  sentence?: string;
  /** Tradução portuguesa da `sentence`. Só existe quando `sentence` existe. */
  sentenceTranslation?: string;
}

export interface CartoesOpts {
  /** Teto de cartões. Sem isso, vai o nível inteiro e quem limita é o `maxItems` do jogo. */
  quantidade?: number;
  /** Embaralhador injetável — o teste passa um determinístico. */
  shuffle?: <T>(xs: T[]) => T[];
}

/**
 * Monta os cartões de uma rodada da trilha DIRETO DO DADO EMBUTIDO, sem tocar em rede nem banco.
 *
 * É a peça que faz a trilha jogável de imediato. Antes era preciso baixar um lote (traduzindo
 * palavra a palavra pela rede) e só então jogar; agora escolher o nível já basta — o que também
 * devolve a trilha a quem usa o perfil Privado/Local, onde não há gateway de nuvem para traduzir.
 *
 * `sourceSessionId` e `cefrLevel` são preenchidos para o filtro que JÁ EXISTE continuar valendo:
 * `cartoesDaFonte` recorta por `sourceSessionId === SESSAO_DA_TRILHA(lang)` e depois por nível.
 * Sem os dois, uma rodada "Trilha A2" voltaria vazia (nenhum cartão da fonte) ou misturaria
 * níveis — e uma trilha graduada que não gradua é pior que trilha nenhuma.
 *
 * NÃO filtra o que a pessoa já tem no baralho, ao contrário de `proximasPalavras`: aqui não se
 * está adicionando vocabulário novo, e sim praticando um nível. Repetir uma palavra conhecida numa
 * partida é prática; gravá-la de novo no baralho é lixo.
 */
export function cartoesDaTrilha(
  dado: DadoTrilha,
  nivel: CefrLevel,
  opts: CartoesOpts = {},
): VocabCardDaTrilha[] {
  const doNivel = dado.niveis[nivel] ?? [];
  if (!doNivel.length) return []; // nível ausente do arquivo devolve vazio; a tela avisa, não quebra
  const shuffle = opts.shuffle ?? embaralhar;
  const teto = opts.quantidade === undefined ? doNivel.length : Math.max(0, opts.quantidade);
  const lang = baseLangDe(dado.lang) || 'en';
  const sessao = SESSAO_DA_TRILHA(dado.lang);

  return shuffle(doNivel).slice(0, teto).map(([palavra, traducao, frase, fraseTraduzida]) => ({
    id: '',                       // ver o doc de `VocabCardDaTrilha.id`
    word: (palavra ?? '').trim(),
    translation: (traducao ?? '').trim(),
    srcLang: lang,
    cefrLevel: nivel,
    cefrConfidence: CONFIANCA_CURADA,
    /* `sourceSessionId` continua sendo escrito porque é o que `bulkAdd` decompõe para gravar
       `origin_kind='trilha'` na ocorrência. Mas ele NÃO sobrevive na coluna do cartão (o servidor
       o sanea para NULL), então quem filtra é `daTrilha`. Os dois juntos: um para escrever, outro
       para ler. */
    sourceSessionId: sessao,
    daTrilha: true,
    inDeck: true,
    fsrsDueAt: '',
    leitnerDueAt: '',
    /* A frase entra no campo `sentence`, o MESMO nome que o cartão do banco usa — é assim que os
       jogos de lacuna passam a funcionar na trilha sem saber que a fonte mudou. Ausente quando o
       par não tem frase; string vazia afirmaria que existe um exemplo em branco. */
    ...(frase ? { sentence: frase, sentenceTranslation: fraseTraduzida } : {}),
  }));
}

/**
 * FRASES DA TRILHA no formato que os jogos de FRASE consomem.
 *
 * POR QUE ISTO EXISTE. Os cinco jogos de frase ficavam bloqueados na trilha com o motivo certo: "a
 * trilha tem palavras soltas — este jogo precisa de frase". Agora ela tem frase para 2.552 das 2.784
 * palavras, e esta função é a ponte: devolve a mesma forma que `buildScrambleRounds` já recebe
 * (`{ id, text, translation, lang }`), então nenhum jogo precisa saber que a fonte mudou.
 *
 * `startMs`/`endMs` ficam em ZERO de propósito, e não é descuido: é assim que `criarFalante`
 * (`lib/falante.ts`) reconhece "não há clipe para recortar, fale o texto". Marcar um intervalo falso
 * faria o jogo tentar cortar um áudio que não existe.
 *
 * O ID é `trilha:<palavra>` — precisa ser estável entre rodadas para o histórico saber o que já
 * caiu, e a palavra é o único identificador natural que a trilha tem (os cartões nascem sem id).
 *
 * O QUE ISTO **NÃO** DESTRAVA: o Caça-conectores. Medido no dado real — das 2.552 frases, apenas
 * **116 (4,5%)** contêm algum conector da lista do jogo, porque as frases do Tatoeba são curtas por
 * natureza (média perto de 5,5 palavras) e frase curta raramente traz "however" ou "although". Um
 * jogo de conectores sobre 116 palavras cairia sempre nas mesmas. Continua bloqueado, e o motivo
 * agora é este, não "a trilha não tem frase".
 */
export function frasesDaTrilha(
  dado: DadoTrilha,
  nivel: CefrLevel,
  opts: CartoesOpts = {},
): Array<{ id: string; text: string; translation: string; lang: string; startMs: number; endMs: number }> {
  const doNivel = dado.niveis[nivel] ?? [];
  if (!doNivel.length) return [];
  const shuffle = opts.shuffle ?? embaralhar;
  const lang = baseLangDe(dado.lang) || 'en';
  /* Só pares COM frase. Filtra antes de cortar pelo teto, senão uma rodada de 6 podia sair com 2
     porque quatro sorteados não tinham exemplo. */
  const comFrase = doNivel.filter((par): par is [string, string, string, string] => !!par[2] && !!par[3]);
  const teto = opts.quantidade === undefined ? comFrase.length : Math.max(0, opts.quantidade);
  return shuffle(comFrase).slice(0, teto).map(([palavra, , frase, fraseTraduzida]) => ({
    id: `trilha:${palavra}`,
    text: frase.trim(),
    translation: fraseTraduzida.trim(),
    lang,
    startMs: 0,
    endMs: 0,
  }));
}

export interface ProgressoNivel {
  nivel: CefrLevel;
  total: number;
  /** Quantas dessas a pessoa já tem no baralho. */
  jaTem: number;
  /** 0..100 */
  pct: number;
}

/**
 * Quanto de cada nível já está no baralho.
 *
 * É o número que faz a trilha ser uma TRILHA e não uma lista: sem ele, a pessoa não tem como
 * saber se está no começo do A2 ou no fim dele, e a escolha de nível vira chute.
 */
export function progressoDaTrilha(dado: DadoTrilha, jaTem: ReadonlySet<string>): ProgressoNivel[] {
  return NIVEIS_CEFR
    .filter(n => (dado.niveis[n] ?? []).length > 0)
    .map(nivel => {
      const lista = dado.niveis[nivel] ?? [];
      // Só a PALAVRA casa com o baralho: a tradução é o verso do cartão, não a chave dele.
      const tem = lista.reduce((n, par) => n + (jaTem.has(chaveDaPalavra(par[0])) ? 1 : 0), 0);
      return { nivel, total: lista.length, jaTem: tem, pct: lista.length ? Math.round((tem / lista.length) * 100) : 0 };
    });
}

/**
 * O nível sugerido: o primeiro que ainda não está praticamente completo.
 *
 * O corte em 80% é deliberado e não em 100%: as listas têm palavras raras que a pessoa pode nunca
 * encontrar, e exigir o nível inteiro prenderia alguém no A1 para sempre. Quatro em cinco já é
 * sinal de que o nível está dominado o bastante para o seguinte fazer sentido.
 *
 * Trabalha sobre `ProgressoNivel`, que já é indiferente ao formato do dado — o par não mudou nada
 * aqui, e nem em `CONFIANCA_CURADA`: a confiança é do NÍVEL, não da tradução.
 */
export function nivelSugerido(progresso: ProgressoNivel[]): CefrLevel {
  const aberto = progresso.find(p => p.pct < 80);
  return aberto?.nivel ?? progresso[progresso.length - 1]?.nivel ?? 'A1';
}
