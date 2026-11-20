/**
 * A VOZ NO APARELHO (Supertonic 3, openspec `voz-no-aparelho`) — a quem oferecer, decisão pura.
 *
 * O spike de 02/11/2026 mediu 1,9 a 3,2 GB de memória com o modelo carregado, ~400 MB de download e RTF ~0,03 (WebGPU),
 * ~0,31 (WASM com threads) e ~0,64 (WASM em 1 thread, sem isolamento de origem). Daí as regras, em ordem:
 *   1. flag desligada → não;
 *   2. perfil protegido (menor ou idade não declarada) → não: a licença dos pesos (OpenRAIL-M) tem cláusulas sobre
 *      menores, em revisão jurídica;
 *   3. iOS/iPadOS → não (a aba morre perto de 1 a 2 GB e é suspensa em segundo plano);
 *   4. celular e Quest → não (pouca memória para 2 a 3 GB);
 *   5. memória informada abaixo de 4 GB → não;
 *   6. sem WebGPU e sem WASM, ou sem armazenamento persistente (OPFS) → não;
 *   7. desktop sem isolamento (Safari no Mac) ou com menos de 8 GB → POR ESCOLHA, com aviso de memória: o dono ouviu a
 *      página de teste no Safari de um Mac de 6 GB e funcionou;
 *   8. o resto → padrão (a opção aparece; o download sempre espera o toque da pessoa).
 *
 * O core não importa de lib/gateway: a entrada é o recorte de `PerfilDoDispositivo` que o chamador monta.
 */
import type { TipoDeAparelho } from './aquecerNaIntencao';

/** A flag (desligada de fábrica) que libera a voz no aparelho. */
export const FLAG_VOZ_NO_APARELHO = 'voz_no_aparelho';

export interface EntradaDaVozNoAparelho {
  flagLigada: boolean;
  perfilProtegido: boolean;
  tipo: TipoDeAparelho;
  /** `perfil.poucaMemoria` (todo móvel, Quest e navegador sem `crossOriginIsolated`). */
  poucaMemoria: boolean;
  /** `navigator.deviceMemory` (só Chromium; `null` no Safari e no Firefox). */
  memoriaGb: number | null;
  /** Há adaptador WebGPU. */
  webGpu: boolean;
  /** `WebAssembly` existe. */
  wasm: boolean;
  /** `crossOriginIsolated` (threads do WASM). */
  isolado: boolean;
  ios: boolean;
  /**
   * OPFS para guardar o modelo: `false` (API ausente ou a sonda falhou, como no Safari em navegação privada), `true`
   * (a sonda criou e apagou um arquivo) ou `'desconhecido'` (a sonda ainda não respondeu: não bloqueia a leitura, mas
   * o convite espera a resposta).
   */
  armazenamento: boolean | 'desconhecido';
}

export type OfertaDaVoz = 'padrao' | 'por-escolha' | 'nao';

export type MotivoDaOferta =
  | 'flag-desligada'
  | 'perfil-protegido'
  | 'ios'
  | 'aparelho-de-pouca-memoria'
  | 'memoria-insuficiente'
  | 'sem-motor'
  | 'sem-armazenamento'
  | 'sem-isolamento'
  | 'memoria-justa'
  | 'aparelho-capaz';

export interface DecisaoDaVozNoAparelho {
  oferta: OfertaDaVoz;
  motivo: MotivoDaOferta;
  /** Mostrar "usa cerca de 2 a 3 GB enquanto lê". */
  avisoDeMemoria: boolean;
  /** O que o motor vai tentar primeiro (o WebGPU cai sozinho para WASM se falhar). */
  backend: 'webgpu' | 'wasm';
  threadsWasm: number;
  /** RTF medido no spike para esse backend (tempo de síntese ÷ duração do áudio). */
  rtfEstimado: number;
}

/** RTF medido no spike (Mac Apple Silicon): WebGPU, WASM com threads, WASM em 1 thread. */
const RTF = { webgpu: 0.03, wasmThreads: 0.31, wasm1: 0.64 } as const;

export function ofertaDaVozNoAparelho(e: EntradaDaVozNoAparelho): DecisaoDaVozNoAparelho {
  const backend = e.webGpu ? 'webgpu' : 'wasm';
  const threadsWasm = e.isolado ? 4 : 1;
  const rtfEstimado = e.webGpu ? RTF.webgpu : e.isolado ? RTF.wasmThreads : RTF.wasm1;
  const d = (oferta: OfertaDaVoz, motivo: MotivoDaOferta): DecisaoDaVozNoAparelho => ({
    oferta,
    motivo,
    avisoDeMemoria: oferta === 'por-escolha',
    backend,
    threadsWasm,
    rtfEstimado,
  });
  if (!e.flagLigada) return d('nao', 'flag-desligada');
  if (e.perfilProtegido) return d('nao', 'perfil-protegido');
  if (e.ios) return d('nao', 'ios');
  if (e.tipo === 'quest' || e.tipo.startsWith('celular')) return d('nao', 'aparelho-de-pouca-memoria');
  if (e.memoriaGb != null && e.memoriaGb < 4) return d('nao', 'memoria-insuficiente');
  if (!e.webGpu && !e.wasm) return d('nao', 'sem-motor');
  if (e.armazenamento === false) return d('nao', 'sem-armazenamento');
  if (e.poucaMemoria || !e.isolado) return d('por-escolha', 'sem-isolamento');
  if (e.memoriaGb != null && e.memoriaGb < 8) return d('por-escolha', 'memoria-justa');
  return d('padrao', 'aparelho-capaz');
}

/* ───────── o primeiro contato (02/11/2026): a "Automática" e o convite ───────── */

/** A escolha guardada para o idioma, já classificada (voz do sistema que sumiu daqui conta como `automatica`). */
export type EscolhaDaVoz = 'automatica' | 'no-aparelho' | 'nuvem' | 'sistema';

export interface EntradaDaVozDaLeitura extends EntradaDaVozNoAparelho {
  /** O motor fala o idioma (pt, en, es). */
  idiomaSuportado: boolean;
  /** O modelo está baixado e conferido NESTE aparelho. */
  modeloPronto: boolean;
  escolha: EscolhaDaVoz;
}

/**
 * A Supertonic lê? Com o portão permitindo (flag, perfil, aparelho), o idioma do motor e o modelo pronto, a "Automática"
 * resolve para ela desde a primeira frase. Uma escolha explícita por voz do sistema ou da nuvem sempre vence.
 */
export function supertonicLe(e: EntradaDaVozDaLeitura): boolean {
  if (ofertaDaVozNoAparelho(e).oferta === 'nao' || !e.idiomaSuportado || !e.modeloPronto) return false;
  return e.escolha === 'automatica' || e.escolha === 'no-aparelho';
}

/** "Agora não" cala o convite neste aparelho por 30 dias. */
export const PRAZO_DO_CONVITE_MS = 30 * 24 * 60 * 60 * 1000;

export interface EntradaDoConvite extends EntradaDaVozDaLeitura {
  /** O capítulo toca o áudio pré-gerado: ele tem prioridade e o convite não aparece. */
  audioGravado: boolean;
  /** Quando a pessoa tocou "Agora não" neste aparelho (ms), ou `null`. */
  recusadoEm: number | null;
  agora: number;
}

/**
 * O cartão "Quer uma voz mais natural?" no primeiro "Ouvir": só para quem PODE usar a voz (o mesmo portão), com o modelo
 * ainda fora do aparelho, a "Automática" (ou a própria voz no aparelho) escolhida, sem áudio gravado e sem recusa recente.
 */
export function convidarParaVozNoAparelho(e: EntradaDoConvite): boolean {
  if (ofertaDaVozNoAparelho(e).oferta === 'nao' || !e.idiomaSuportado || e.modeloPronto || e.audioGravado) return false;
  if (e.armazenamento !== true) return false; // sem a resposta da sonda do OPFS, o convite não aparece
  if (e.escolha !== 'automatica' && e.escolha !== 'no-aparelho') return false;
  return e.recusadoEm == null || e.agora - e.recusadoEm >= PRAZO_DO_CONVITE_MS;
}
