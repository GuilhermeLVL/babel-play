/**
 * A VOZ NATURAL NO APARELHO (Kitten TTS 2, openspec `voz-natural-no-aparelho-kitten`) — a quem oferecer, qual variante e
 * quem lê em voz alta. Decisões puras; a entrada é o recorte de `PerfilDoDispositivo` que o chamador monta.
 *
 * O spike de 17/11/2026 (Chromium e WebKit do Playwright, Mac Apple Silicon) mediu, em RTF (tempo de síntese ÷ áudio):
 *   mini (~83 MB + ~7 MB de vozes): WASM 4 threads 0,40; WASM 1 thread 1,15 (mais lento que a fala); WebGPU de verdade
 *     0,05–0,09, mas WebGPU por software (headless) 17;
 *   pico (~8 MB por idioma + ~2 MB de vozes): WASM 4 threads 0,05; 1 thread 0,10; WebGPU 0,02 (0,28 no WebKit).
 * Daí: o mini só com isolamento de origem (WASM em 4 threads garante tempo real; o WebGPU é bônus que o worker confere no
 * aquecimento), o pico no resto. Licença Apache-2.0 e fonetizador próprio: serve TODO perfil, inclusive o protegido.
 *
 * Regras, em ordem: flag desligada → não; sem WASM → não; sem armazenamento persistente (OPFS) → não; senão oferece, com
 * a variante do aparelho e a confirmação quando o download do idioma passa do teto do perfil (`confirmarDownloadAcimaDeMb`).
 */
import type { IdiomaDeVoz } from '../leitura/prepararTextoParaVoz';
import { arquivosDoIdioma, bytesDe, type VarianteDoKitten } from '../voz/kitten';
import type { TipoDeAparelho } from './aquecerNaIntencao';

/** A flag (desligada de fábrica) que liga a voz natural no aparelho. */
export const FLAG_VOZ_KITTEN = 'voz_kitten';

export interface EntradaDoKitten {
  flagLigada: boolean;
  tipo: TipoDeAparelho;
  ios: boolean;
  /** `navigator.deviceMemory` (só Chromium). */
  memoriaGb: number | null;
  webGpu: boolean;
  wasm: boolean;
  /** `crossOriginIsolated`: threads do WASM. */
  isolado: boolean;
  /** OPFS: `false` (ausente ou a sonda falhou), `true`, ou `'desconhecido'` (a sonda ainda não respondeu). */
  armazenamento: boolean | 'desconhecido';
  /** O teto do perfil para baixar sem perguntar (MB); `null` = nunca perguntar. */
  confirmarAcimaDeMb: number | null;
}

export type MotivoDoKitten = 'flag-desligada' | 'sem-motor' | 'sem-armazenamento' | 'aparelho-capaz';

export interface DecisaoDoKitten {
  oferecida: boolean;
  motivo: MotivoDoKitten;
  variante: VarianteDoKitten;
  /** O que o worker tenta primeiro (o WebGPU cai sozinho para WASM se falhar ou se for lento). */
  backend: 'webgpu' | 'wasm';
  threadsWasm: number;
  /** RTF medido no spike para essa variante e backend. */
  rtfEstimado: number;
}

const RTF = {
  mini: { webgpu: 0.09, wasm4: 0.4 },
  pico: { wasm4: 0.05, wasm1: 0.1 },
} as const;

/** A variante do aparelho: o mini só em desktop com isolamento de origem e memória suficiente; o pico no resto. */
export function varianteDoKitten(e: Pick<EntradaDoKitten, 'tipo' | 'ios' | 'memoriaGb' | 'isolado'>): VarianteDoKitten {
  const desktop = e.tipo.startsWith('desktop') && !e.ios;
  const memoriaOk = e.memoriaGb == null || e.memoriaGb >= 4;
  return desktop && memoriaOk && e.isolado ? 'mini' : 'pico';
}

export function ofertaDoKitten(e: EntradaDoKitten): DecisaoDoKitten {
  const variante = varianteDoKitten(e);
  const threadsWasm = e.isolado ? 4 : 1;
  const backend = variante === 'mini' && e.webGpu ? 'webgpu' : 'wasm';
  const rtfEstimado =
    variante === 'mini'
      ? backend === 'webgpu'
        ? RTF.mini.webgpu
        : RTF.mini.wasm4
      : threadsWasm > 1
        ? RTF.pico.wasm4
        : RTF.pico.wasm1;
  const d = (oferecida: boolean, motivo: MotivoDoKitten): DecisaoDoKitten => ({
    oferecida,
    motivo,
    variante,
    backend,
    threadsWasm,
    rtfEstimado,
  });
  if (!e.flagLigada) return d(false, 'flag-desligada');
  if (!e.wasm) return d(false, 'sem-motor');
  if (e.armazenamento === false) return d(false, 'sem-armazenamento');
  return d(true, 'aparelho-capaz');
}

/**
 * O tamanho do download de um idioma na variante, em MB decimais (arredondado para cima), sem o que os idiomas já
 * baixados trouxeram (no mini, o modelo é um só: o 2º idioma custa só as vozes).
 */
export function mbDoDownload(
  v: VarianteDoKitten,
  idioma: IdiomaDeVoz,
  jaBaixados: readonly IdiomaDeVoz[] = [],
): number {
  const tem = new Set(jaBaixados.flatMap((i) => arquivosDoIdioma(v, i).map((a) => a.caminho)));
  return Math.ceil(bytesDe(arquivosDoIdioma(v, idioma).filter((a) => !tem.has(a.caminho))) / 1_000_000);
}

/** Pedir confirmação antes de baixar? (acima do teto do perfil; teto 0 = sempre perguntar) */
export function confirmarDownloadDoKitten(teto: number | null, mb: number): boolean {
  return teto != null && mb > teto;
}

/* ───────── quem lê em voz alta ───────── */

/** A escolha guardada para o idioma, já classificada (`kitten` = a voz natural no aparelho, `@kitten`). */
export type EscolhaDeQuemLe = 'automatica' | 'kitten' | 'no-aparelho' | 'nuvem' | 'sistema';

export interface EntradaDeQuemLe {
  /** A oferta permite e o modelo do idioma está no aparelho, conferido. */
  kittenPronto: boolean;
  /** A Supertonic (flag `voz_no_aparelho`) lê este idioma agora (escolha explícita ou "Automática" com o modelo). */
  supertonicLe: boolean;
  escolha: EscolhaDeQuemLe;
  /**
   * Há, entre as vozes do sistema, uma ACEITA para o idioma (sem efeito nem robótica)? `'desconhecido'` enquanto o
   * navegador não entregou a lista: aí o navegador escolhe, como sempre.
   */
  vozDoSistemaAceita: boolean | 'desconhecido';
}

export type QuemLe = 'kitten' | 'supertonic' | 'sistema' | 'nenhuma';

/**
 * A ORDEM (com a flag `voz_kitten` ligada): a voz natural no aparelho → a voz boa do sistema → nenhuma (o texto fica na
 * tela). Escolha explícita vence: a Supertonic escolhida lê; uma voz do sistema escolhida lê.
 */
export function quemLeEmVozAlta(e: EntradaDeQuemLe): QuemLe {
  if (e.escolha === 'no-aparelho' && e.supertonicLe) return 'supertonic';
  if (e.escolha === 'sistema' || e.escolha === 'nuvem') return 'sistema';
  if (e.kittenPronto && (e.escolha === 'automatica' || e.escolha === 'kitten')) return 'kitten';
  if (e.supertonicLe) return 'supertonic';
  return e.vozDoSistemaAceita === false ? 'nenhuma' : 'sistema';
}
