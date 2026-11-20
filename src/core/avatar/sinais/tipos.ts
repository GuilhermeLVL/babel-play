/**
 * TIPOS DO MOTOR DE SOLETRAÇÃO (alfabeto manual). Esquema dos dados: `src/data/avatar/sinais/ESQUEMA.md`
 * (`frasy-alfabeto-mao/2`). Tudo aqui é puro: sem DOM, sem `three`, sem rede.
 *
 * AVISO DE PRODUTO: isto é SOLETRAÇÃO, não tradução. As poses são de DEMONSTRAÇÃO e NÃO foram revisadas por
 * pessoas surdas. A fidelidade de cada letra é AUTOAVALIADA (não é validação).
 */

export type Vec3 = readonly [number, number, number];
export type Intervalo = readonly [number, number];
export type Lingua = 'libras' | 'asl';
export type Fidelidade = 'alta' | 'media' | 'baixa';

export const NOMES_DOS_DEDOS = ['indicador', 'medio', 'anelar', 'minimo'] as const;
export type NomeDoDedo = (typeof NOMES_DOS_DEDOS)[number];

export interface DedoDoDado {
  mcp: number;
  pip: number;
  /** `null` = ACOPLADO: o motor usa DIP = `dip_acoplado` (2/3) do PIP. */
  dip: number | null;
  abd: number;
}

export interface PolegarDoDado {
  cmc_flex: number;
  cmc_abd: number;
  mcp: number;
  ip: number;
  oposicao: number;
}

export interface MaoDoDado {
  polegar: PolegarDoDado;
  indicador: DedoDoDado;
  medio: DedoDoDado;
  anelar: DedoDoDado;
  minimo: DedoDoDado;
}

export interface PontoDoCaminho {
  t: number;
  dpos?: Vec3;
  /** Graus em torno de x, y, z do sinalizador. */
  rot?: Vec3;
  /** Soma nos ângulos: dedos `[mcp, pip, dip, abd]`; polegar `[cmc_flex, cmc_abd, mcp, ip, oposicao]`. */
  dflex?: Partial<Record<NomeDoDedo | 'polegar', readonly number[]>>;
}

export interface LetraDoAlfabeto {
  fidelidade: Fidelidade;
  movimento: boolean;
  movimento_descricao: string | null;
  obs: string;
  referencia: string;
  mao: MaoDoDado;
  orientacao: { dedos: Vec3; palma: Vec3 };
  posicao: Vec3;
  cotovelo: { giro: number };
  caminho?: PontoDoCaminho[];
}

export interface Alfabeto {
  esquema: string;
  aviso: string;
  lingua: Lingua;
  mao_dominante_padrao: 'direita' | 'esquerda';
  letras: Record<string, LetraDoAlfabeto>;
}

export interface Limites {
  dedo: { mcp: Intervalo; pip: Intervalo; dip: Intervalo; abd: Intervalo };
  dedo_por_osso?: Partial<Record<NomeDoDedo, Partial<Record<'mcp' | 'pip' | 'dip' | 'abd', Intervalo>>>>;
  polegar: { cmc_flex: Intervalo; cmc_abd: Intervalo; mcp: Intervalo; ip: Intervalo; oposicao: Intervalo };
  /** Zero do RIG do protótipo (polegar levantado ~30 graus). Só o motor de ossos soma; os dados são relativos à palma. */
  polegar_zero: { cmc_abd: number };
  dip_acoplado: number;
  giro: Intervalo;
}

/** Quantidade de ângulos de uma pose: 5 do polegar + 4 por dedo. */
export const NUM_ANGULOS = 21;

/**
 * Pose RESOLVIDA de uma mão (a letra já com DIP acoplado, pronta para interpolar e aplicar).
 * `a[0..4]` polegar (`cmc_flex, cmc_abd, mcp, ip, oposicao`); `a[5+4f..]` dedo f (indicador, médio, anelar,
 * mínimo): `mcp, pip, dip, abd`. Ângulos em graus. `cmc_abd` é RELATIVO À PALMA (0 = polegar deitado na palma).
 */
export interface PoseDeMao {
  a: number[];
  /** `acoplado[f]`: o DIP do dedo f segue o PIP (inclusive no percurso). */
  acoplado: boolean[];
  /** Centro da palma, em metros, no espaço do sinalizador (x direita, y cima, z frente), origem no ombro. */
  posicao: Vec3;
  /** Para onde os dedos apontam. */
  dedos: Vec3;
  /** Normal da palma. */
  palma: Vec3;
  /** Giro do cotovelo, em graus. */
  giro: number;
  /** A pose já foi espelhada (mão esquerda): usa os ossos do lado esquerdo. */
  espelhada: boolean;
}

export type MotivoDeNaoSoletrar =
  | 'teto' // estourou o teto de tempo da fala
  | 'numero' // só números (não suportados)
  | 'sem_letras' // só símbolos/pontuação/caracteres desconhecidos
  | 'uma_letra' // palavra de uma letra: não gasta o teto
  | 'so_nomes' // opção "só nomes próprios"
  | 'dicionario'; // há sinal gravado (ponto de extensão; hoje nunca)

export interface PassoDeSoletracao {
  /** A letra como apareceu no texto (maiúscula), ex.: `Ç`, `A`. */
  letra: string;
  /** A chave no alfabeto (`Ç` vira `C` em ASL; `Ã` vira `A`). */
  chave: string;
  /** Índice da palavra (token do texto) de onde vem. */
  palavra: number;
  indiceNaPalavra: number;
  /** Letra com til (`Ã`, `Õ` em Libras): balanço lateral (convenção NÃO confirmada com surdos). */
  til: boolean;
  /** Mesma letra da anterior: rebote. */
  rebote: boolean;
  movimento: boolean;
  /** Começa a transição para esta letra. */
  inicioMs: number;
  /** A mão chegou à forma da letra. */
  chegadaMs: number;
  /** Fim da retenção (e do percurso/til). */
  fimMs: number;
  pose: PoseDeMao;
}

export interface PalavraDaFala {
  indice: number;
  texto: string;
  estado: 'soletrada' | 'nao_soletrada';
  motivo?: MotivoDeNaoSoletrar;
  /** Só para as soletradas. */
  inicioMs?: number;
  fimMs?: number;
  /** Havia dígitos nela: foram pulados (números não são suportados). */
  temNumeros: boolean;
}

export type Suavizacao = 'suave' | 'senoide';
export interface ChaveDeTempo {
  tMs: number;
  pose: PoseDeMao;
  ease: Suavizacao;
}

export interface Sequencia {
  lingua: Lingua;
  passos: PassoDeSoletracao[];
  palavras: PalavraDaFala[];
  chaves: ChaveDeTempo[];
  duracaoMs: number;
  /** Alguma palavra ficou de fora pelo teto de tempo. */
  tetoAtingido: boolean;
  /** Caracteres que viraram pausa (emoji, escrita RTL, símbolos), sem repetição. */
  desconhecidos: string[];
  /** Havia números no texto: pulados e marcados. */
  numerosPulados: boolean;
  /** O texto passou do máximo de caracteres processados e foi cortado. */
  textoCortado: boolean;
  /** Pose de repouso (início e fim) e de descanso (entre palavras). */
  repouso: PoseDeMao;
  descanso: PoseDeMao;
}

/** Ponto de extensão: sinal GRAVADO por palavra (hoje o dicionário está vazio e tudo é soletrado). */
export interface SinalGravado {
  /** Identificador do sinal na biblioteca de clipes (futuro). */
  clipe: string;
  /** Duração do clipe. */
  duracaoMs: number;
  /** Fonte/revisão: obrigatório dizer se pessoas surdas revisaram. */
  revisadoPorSurdos: boolean;
}
export type DicionarioDeSinais = Readonly<Record<string, SinalGravado>>;
