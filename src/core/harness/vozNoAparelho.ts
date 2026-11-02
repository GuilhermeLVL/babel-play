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
  /** OPFS (`navigator.storage.getDirectory`) para guardar o modelo. */
  armazenamento: boolean;
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
  if (!e.armazenamento) return d('nao', 'sem-armazenamento');
  if (e.poucaMemoria || !e.isolado) return d('por-escolha', 'sem-isolamento');
  if (e.memoriaGb != null && e.memoriaGb < 8) return d('por-escolha', 'memoria-justa');
  return d('padrao', 'aparelho-capaz');
}
