/**
 * MARCAS DE DESEMPENHO DA CAPTURA (`performance.mark`), para a bancada medir onde o tempo vai (CEL-08, auditoria de
 * 17/11/2026: a 2ª sessão, com os modelos em cache, traduzia mais devagar que a 1ª, e o atraso estava entre o texto e a
 * tradução). A hipótese é a disputa entre a carga do STT e a do tradutor no início da sessão; as marcas separam as três
 * coisas: a carga do STT, a carga de cada modelo de tradução e o pedido de tradução de cada final (com a fila do worker).
 *
 * Todas começam com `frasy:` e levam o detalhe em `detail`: o harness lê `performance.getEntriesByType('mark')`
 * (`reports/auditoria-qualidade/celular/medir-celular.mjs`). Custo: uma entrada na linha do tempo por evento, nenhuma
 * por parcial. Sem `performance.mark` (Node antigo, worker sem a API): nada.
 */
import { capMetrics } from './capture/captureMetrics';

/** De onde veio a tradução que o balão mostrou (lista fechada; é a `origem` de `frasy:legenda:traduzida`). */
export type OrigemDaLegenda = 'memoria' | 'dicionario' | 'nativo' | 'local' | 'nuvem';
export const ORIGENS_DA_LEGENDA: readonly OrigemDaLegenda[] = ['memoria', 'dicionario', 'nativo', 'local', 'nuvem'];

/** As três fases da carga de um modelo, em ordem (`frasy:modelo:<fase>:inicio|fim`). */
export type FaseDeCarga = 'download' | 'compilacao' | 'aquecimento';
export const FASES_DE_CARGA: readonly FaseDeCarga[] = ['download', 'compilacao', 'aquecimento'];

/**
 * Motor que produziu o parcial (lista fechada; é o `motor` de `frasy:parcial`). `local` = o parcial do STT no aparelho
 * quando o ponto da marca não sabe qual dos motores locais foi.
 */
export type MotorDeParcial = 'local' | 'whisper' | 'moonshine' | 'parakeet';
export const MOTORES_DE_PARCIAL: readonly MotorDeParcial[] = ['local', 'whisper', 'moonshine', 'parakeet'];

/**
 * O QUE UMA MARCA PODE LEVAR (D2 de `lab-medicao-legenda-traduzida`): números, o id do modelo (constante do código,
 * o do tradutor ou do STT que está carregando), o id do balão (`mic-3`, `sys-7`, local à aba, nunca enviado) e
 * a origem da tradução (lista fechada). Nenhum campo de texto livre: o `marcar` descarta o que não está aqui.
 */
export interface DetalheDaMarca {
  modelo?: string;
  id?: string;
  origem?: OrigemDaLegenda;
  ok?: boolean;
  fila?: number;
  /** `frasy:parcial`: motor (lista fechada), índice do parcial na fala e contagens de palavras. Só números e a lista. */
  motor?: MotorDeParcial;
  indice?: number;
  palavras?: number;
  confirmadas?: number;
}

/** Marcas que a bancada lê no fim da sessão: acima de `TETO_DE_MARCAS_LIDAS` a linha do tempo é esvaziada (só as mais novas ficam). */
const MARCAS_CONSUMIDAS = ['frasy:fala:fim', 'frasy:legenda:traduzida', 'frasy:parcial'];
const TETO_DE_MARCAS_LIDAS = 200;
const contagem = new Map<string, number>();
const TAMANHO_MAX_DO_ID = 64;

function limpar(d: DetalheDaMarca): DetalheDaMarca {
  const saida: DetalheDaMarca = {};
  if (typeof d.modelo === 'string') saida.modelo = d.modelo.slice(0, TAMANHO_MAX_DO_ID);
  if (typeof d.id === 'string') saida.id = d.id.slice(0, TAMANHO_MAX_DO_ID);
  if (d.origem && ORIGENS_DA_LEGENDA.includes(d.origem)) saida.origem = d.origem;
  if (typeof d.ok === 'boolean') saida.ok = d.ok;
  if (Number.isFinite(d.fila)) saida.fila = d.fila;
  if (d.motor && MOTORES_DE_PARCIAL.includes(d.motor)) saida.motor = d.motor;
  if (Number.isFinite(d.indice)) saida.indice = d.indice;
  if (Number.isFinite(d.palavras)) saida.palavras = d.palavras;
  if (Number.isFinite(d.confirmadas)) saida.confirmadas = d.confirmadas;
  return saida;
}

/**
 * `instante` (ms de `performance.now()`) leva a marca para trás no tempo: é o caso do último quadro de voz, que o VAD
 * só entrega depois (a marca vale o quadro, não a decisão).
 */
export function marcar(nome: string, detalhe?: DetalheDaMarca, instante?: number): void {
  try {
    if (typeof performance === 'undefined' || typeof performance.mark !== 'function') return;
    const chave = `frasy:${nome}`;
    if (MARCAS_CONSUMIDAS.includes(chave)) {
      // Sessão longa: a linha do tempo não cresce sem fim (as marcas viram números em `captureMetrics`).
      const n = (contagem.get(chave) ?? 0) + 1;
      if (n > TETO_DE_MARCAS_LIDAS) {
        performance.clearMarks?.(chave);
        contagem.set(chave, 1);
      } else contagem.set(chave, n);
    }
    const opcoes: PerformanceMarkOptions = {};
    if (detalhe) opcoes.detail = limpar(detalhe);
    if (instante !== undefined && Number.isFinite(instante) && instante >= 0) opcoes.startTime = instante;
    performance.mark(chave, Object.keys(opcoes).length ? opcoes : undefined);
  } catch {
    /* a marca é diagnóstico: nunca derruba a captura */
  }
}

/**
 * `frasy:parcial` (`parciais-incrementais`, 1.4): um parcial foi pintado. Só números e o motor da lista fechada: o
 * índice do parcial na fala, quantas palavras tem e quantas estão confirmadas (0 até existir LocalAgreement). Nunca texto.
 * Conta também em `capMetrics.parcialPintado`. Não muda nada na tela.
 */
export function marcarParcial(d: {
  motor: MotorDeParcial;
  indice: number;
  palavras: number;
  confirmadas?: number;
}): void {
  marcar('parcial', { motor: d.motor, indice: d.indice, palavras: d.palavras, confirmadas: d.confirmadas ?? 0 });
  capMetrics.parcialPintado(d.palavras, d.confirmadas ?? 0);
}

/** Esvazia as marcas de fala e legenda da linha do tempo (início de uma gravação nova). */
export function limparMarcasConsumidas(): void {
  try {
    for (const chave of MARCAS_CONSUMIDAS) performance.clearMarks?.(chave);
    contagem.clear();
  } catch {
    /* diagnóstico */
  }
}

/**
 * A CARGA DE UM MODELO EM TRÊS FASES (`frasy:modelo:<fase>:inicio|fim`, com `{ modelo }`): download (os bytes até o
 * cache), compilação (criar a sessão ou o worker) e aquecimento (a 1ª inferência, descartada). Quem carrega chama
 * `para` quando a fase seguinte começa e `fim` quando o modelo fica pronto; fase pulada sai com duração zero, então
 * as seis marcas existem sempre, em ordem. Cada fase fechada também vira número em `captureMetrics.carga`.
 */
export function iniciarFasesDeCarga(modelo: string) {
  const t0: Partial<Record<FaseDeCarga, number>> = {};
  let atual = -1;
  let encerrado = false;
  const abrir = (i: number): void => {
    const fase = FASES_DE_CARGA[i];
    t0[fase] = performance.now();
    marcar(`modelo:${fase}:inicio`, { modelo });
  };
  const fechar = (i: number): void => {
    const fase = FASES_DE_CARGA[i];
    marcar(`modelo:${fase}:fim`, { modelo });
    capMetrics.carga(modelo, fase, performance.now() - (t0[fase] ?? performance.now()));
  };
  const ir = (destino: number): void => {
    while (atual < destino) {
      if (atual >= 0) fechar(atual);
      atual++;
      abrir(atual);
    }
  };
  ir(0);
  return {
    /** A fase `fase` começa agora (as anteriores que não foram vistas fecham com duração zero). */
    para(fase: FaseDeCarga): void {
      const i = FASES_DE_CARGA.indexOf(fase);
      if (!encerrado && i > atual) ir(i);
    },
    /** O modelo ficou pronto: fecha o que estiver aberto. */
    fim(): void {
      if (encerrado) return;
      encerrado = true;
      ir(FASES_DE_CARGA.length - 1);
      fechar(atual);
    },
  };
}
