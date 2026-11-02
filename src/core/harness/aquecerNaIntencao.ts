/**
 * AQUECER O STT NA INTENÇÃO — decisão pura (openspec `aquecer-stt-na-intencao`).
 *
 * Quando a pessoa dá sinal de que vai capturar (200 ms de foco/ponteiro em "Iniciar", ou a confirmação
 * dos idiomas), o app pode chamar o pré-aquecimento dos modelos. Esta função só responde SE aquece,
 * por perfil de aparelho; as guardas de carga (cache, nuvem, um modelo por vez) continuam no pipeline.
 *
 * O core não importa de lib/gateway: os tipos abaixo são o recorte mínimo de `PerfilDoDispositivo`
 * (`src/lib/dispositivo/perfil.ts`), que o chamador monta.
 */

/** Mesmos valores de `TipoDeDispositivo` (lib/dispositivo/perfil.ts). */
export type TipoDeAparelho = 'quest' | 'celular-fraco' | 'celular-bom' | 'desktop-sem-gpu' | 'desktop-com-gpu';

export type GatilhoDoAquecimento = 'ponteiro' | 'idiomas';

export interface EntradaDoAquecimento {
  /** `perfil.poucaMemoria`. */
  poucaMemoria: boolean;
  /** `perfil.leve`. */
  leve: boolean;
  /** `perfil.tipo`. */
  tipo: TipoDeAparelho;
  /** `perfil.sinais.isolado` (`crossOriginIsolated`). */
  isolado: boolean;
  gatilho: GatilhoDoAquecimento;
}

export interface DecisaoDoAquecimento {
  aquecer: boolean;
  motivo: string;
}

/**
 * Ordem das regras:
 *  1. desktop sem isolamento (Safari no Mac: WASM em 1 thread, memória alta) nunca aquece, até a
 *     medição do dono ser registrada;
 *  2. a confirmação dos idiomas aquece nos demais perfis (a intenção é explícita);
 *  3. o ponteiro (sinal fraco) só aquece com memória folgada e fora do modo leve.
 */
export function deveAquecerNaIntencao(e: EntradaDoAquecimento): DecisaoDoAquecimento {
  if (e.tipo.startsWith('desktop') && !e.isolado) {
    return { aquecer: false, motivo: 'desktop sem isolamento (Safari): desligado até medir a memória' };
  }
  if (e.gatilho === 'idiomas') {
    return { aquecer: true, motivo: 'idiomas confirmados: intenção explícita' };
  }
  if (e.poucaMemoria) return { aquecer: false, motivo: 'ponteiro ignorado: pouca memória' };
  if (e.leve) return { aquecer: false, motivo: 'ponteiro ignorado: modo leve' };
  return { aquecer: true, motivo: 'ponteiro sobre Iniciar: memória folgada' };
}

/** A flag (desligada de fábrica) que liga o aquecimento por intenção. */
export const FLAG_AQUECER_STT_NA_INTENCAO = 'aquecer_stt_na_intencao';

/** Tempo de permanência do foco/ponteiro em "Iniciar" antes de aquecer. */
export const ATRASO_DA_INTENCAO_MS = 200;
