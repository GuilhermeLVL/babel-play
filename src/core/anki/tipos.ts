/** Referências de mídia que um campo cita — o ARQUIVO não é importado, só o nome sobrevive. */
export interface RefsDeMidia {
  sons: string[];
  imagens: string[];
}

/** Uma lacuna de cloze (`{{c1::resposta::dica}}`) — um ordinal vira um cartão no Anki. */
export interface Lacuna {
  ordinal: number;
  resposta: string;
  dica?: string;
}

export interface NotaAnki {
  /** Id ESTÁVEL da nota no Anki (`notes.guid`) — é o que faz reimportar atualizar em vez de
   *  duplicar. Vazio nas leituras de texto (`.txt/.csv/.tsv`), que não têm identidade própria. */
  guid: string;
  /** Todos os campos da nota, por NOME e ainda BRUTOS (com HTML). É o que permite refazer o
   *  mapeamento depois sem pedir o arquivo de novo. */
  camposBrutos?: Record<string, string>;
  frente: string;
  verso: string;
  /** Frase de exemplo, quando o baralho tiver um campo com essa cara. */
  exemplo?: string;
  tags: string[];
  /** Refs de mídia agregadas de TODOS os campos da nota, sem duplicatas, na ordem de aparição. */
  midia?: RefsDeMidia;
  /** Lacunas de cloze agregadas de todos os campos, ordenadas por ordinal. */
  lacunas?: Lacuna[];
  /** Nome do baralho de origem (primeiro cartão da nota), hierarquia com `::`. */
  baralho?: string;
  /** Nome do note type (modelo) da nota. */
  notetype?: string;
  /** Nomes dos campos do tipo da nota, na ordem (o hash da estrutura é calculado por quem grava). */
  campos?: string[];
}

export interface LeituraAnki {
  notas: NotaAnki[];
  /** Nome do arquivo interno que foi lido — a tela mostra, é a procedência. */
  formato: string;
  /** Nomes dos campos como estavam no baralho, para a tela poder dizer o que virou o quê. */
  campos: string[];
  /** Notas descartadas na leitura (frente vazia, sem verso). */
  descartadas: number;
  /** O baralho tinha mídia? Não importamos, e é preciso dizer. */
  temMidia: boolean;
  /** Nomes de baralho distintos encontrados, ordenados. */
  baralhos?: string[];
  /** true quando o arquivo tem mais notas que `TETO_DE_NOTAS` — a leitura foi cortada. */
  truncado?: boolean;
  /** `SELECT count(*)` real de `notes`, mesmo quando a leitura foi cortada. */
  totalNoArquivo?: number;
}

/**
 * ESCRITA DOMINANTE de uma amostra de texto — a base do conserto do S11.
 *
 * O CENÁRIO QUE ISTO EVITA: a rota de import grava `idiomaOrigem` a partir do cabeçalho
 * `X-Src-Lang`, que o CLIENTE preenche com o idioma do LOBBY (a tela que a pessoa está usando),
 * não com o idioma do baralho. Importar um deck JAPONÊS com o lobby em inglês carimbava
 * `srcLang='en'` em milhares de cartões, silenciosamente — envenenando o filtro de idioma para
 * sempre, porque nada nessa cadeia jamais olhava o CONTEÚDO do baralho para conferir.
 *
 * Aqui a conferência: conta caracteres por FAIXA UNICODE (script) sobre uma amostra de frentes, e
 * decide a escrita dominante por MAIORIA das letras (>50%) — não da amostra inteira, porque
 * dígitos/pontuação/espaço não dizem nada sobre o idioma e diluiriam a contagem à toa. Sem letra
 * nenhuma na amostra, a resposta honesta é 'desconhecido', não um palpite.
 */
export type EscritaDominante =
  | 'latino'
  | 'cjk'
  | 'kana'
  | 'hangul'
  | 'cirilico'
  | 'arabe'
  | 'hebraico'
  | 'grego'
  | 'devanagari'
  | 'thai'
  | 'desconhecido';
