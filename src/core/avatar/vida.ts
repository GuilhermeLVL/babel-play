/**
 * VIDA PROCEDURAL DO AVATAR: respiração leve, piscar a cada 2,5–4,5 s, micro-olhar e um leve balanço de peso.
 * Puro: o aleatório é injetado (`aleatorio`, padrão `Math.random`) e o tempo vem do `dtMs` de quem chama. O
 * motor (`src/lib/avatar/renderer.ts`) só aplica os números nos ossos e nas expressões do VRM.
 *
 * Política (testada):
 *  · `movimentoReduzido`: NADA ocioso (nem respiração, nem piscar, nem olhar, nem balanço). Só mudança de
 *    expressão, sem suavização, que é do motor;
 *  · tier `fraco`: respiração e piscar (baratos); sem olhar e sem balanço;
 *  · aba oculta: o laço do motor pausa e o `dt` de retomada é limitado, então nada "pula" ao voltar.
 */
import type { EstadoDoAvatar } from './estados';
import type { TierDoAvatar } from './tiers';

export const PISCAR_MIN_MS = 2500;
export const PISCAR_MAX_MS = 4500;
/** Piscada inteira: fecha em ~70 ms e reabre em ~90 ms. */
const PISCAR_FECHA_MS = 70;
const PISCAR_ABRE_MS = 90;

export interface ConfigDaVida {
  tier: TierDoAvatar;
  movimentoReduzido: boolean;
}

export interface EstadoDaVida {
  /** Tempo acumulado (ms) para as senóides. */
  t: number;
  /** Quanto falta (ms) para a próxima piscada. */
  proximoPiscar: number;
  /** Há quanto tempo (ms) a piscada em curso começou; `null` = olhos abertos. */
  piscando: number | null;
  /** Falta (ms) para sortear outro alvo de olhar. */
  proximoOlhar: number;
  olharAlvo: { yaw: number; pitch: number };
  olhar: { yaw: number; pitch: number };
  /** Último estado do avatar visto: mudar de estado sorteia um alvo de olhar na hora. */
  estadoVisto: EstadoDoAvatar | null;
}

export interface SaidaDaVida {
  /** Respiração: rotação extra (rad) do tronco no eixo X. */
  respiracao: number;
  /** Balanço de peso: rotação (rad) do quadril/tronco no eixo Z. */
  balanco: number;
  /** 0 (aberto) a 1 (fechado): peso da expressão `blink`. */
  piscar: number;
  /** Olhar em GRAUS (o `lookAt` do three-vrm usa graus). */
  olhar: { yaw: number; pitch: number };
}

export const VIDA_PARADA: SaidaDaVida = { respiracao: 0, balanco: 0, piscar: 0, olhar: { yaw: 0, pitch: 0 } };

const intervaloDePiscar = (aleatorio: () => number) => PISCAR_MIN_MS + aleatorio() * (PISCAR_MAX_MS - PISCAR_MIN_MS);

export function criarEstadoDaVida(aleatorio: () => number = Math.random): EstadoDaVida {
  return {
    t: 0,
    proximoPiscar: intervaloDePiscar(aleatorio),
    piscando: null,
    proximoOlhar: 1200 + aleatorio() * 2000,
    olharAlvo: { yaw: 0, pitch: 0 },
    olhar: { yaw: 0, pitch: 0 },
    estadoVisto: null,
  };
}

export const piscaPermitido = (c: ConfigDaVida): boolean => !c.movimentoReduzido;
export const respiraPermitido = (c: ConfigDaVida): boolean => !c.movimentoReduzido;
export const olharPermitido = (c: ConfigDaVida): boolean => !c.movimentoReduzido && c.tier !== 'fraco';
export const balancoPermitido = (c: ConfigDaVida): boolean => !c.movimentoReduzido && c.tier !== 'fraco';

/** Alvo base do olhar por estado (graus): ouvindo olha de frente; pensando desvia para cima e para o lado. */
const OLHAR_BASE: Record<EstadoDoAvatar, { yaw: number; pitch: number; vagar: number }> = {
  parado: { yaw: 0, pitch: 0, vagar: 3 },
  ouvindo: { yaw: 0, pitch: 0, vagar: 1.5 },
  pensando: { yaw: 9, pitch: 6, vagar: 2 },
  falando: { yaw: 0, pitch: 0, vagar: 2.5 },
};

/**
 * Um passo da vida. MUTA `estado` (é um acumulador pequeno, de propósito, para o laço de quadros não alocar) e
 * devolve a saída. `dtMs` inválido ou <= 0: devolve a saída atual sem avançar; `dtMs` é limitado a 100 ms.
 */
export function passoDaVida(
  estado: EstadoDaVida,
  dtMs: number,
  config: ConfigDaVida,
  estadoDoAvatar: EstadoDoAvatar,
  aleatorio: () => number = Math.random,
): SaidaDaVida {
  if (config.movimentoReduzido) return VIDA_PARADA;
  const dt = Number.isFinite(dtMs) ? Math.min(100, Math.max(0, dtMs)) : 0;
  estado.t += dt;

  // Piscar
  let piscar = 0;
  if (estado.piscando !== null) {
    estado.piscando += dt;
    const p = estado.piscando;
    if (p >= PISCAR_FECHA_MS + PISCAR_ABRE_MS) estado.piscando = null;
    else piscar = p < PISCAR_FECHA_MS ? p / PISCAR_FECHA_MS : 1 - (p - PISCAR_FECHA_MS) / PISCAR_ABRE_MS;
  } else {
    estado.proximoPiscar -= dt;
    if (estado.proximoPiscar <= 0) {
      estado.piscando = 0;
      estado.proximoPiscar = intervaloDePiscar(aleatorio);
    }
  }

  // Respiração: ~4 s por ciclo, bem pequena (0,012 rad ~ 0,7 grau).
  const respiracao = Math.sin((estado.t / 4000) * Math.PI * 2) * 0.012;

  let balanco = 0;
  const olhar = { yaw: 0, pitch: 0 };
  if (balancoPermitido(config)) balanco = Math.sin((estado.t / 7000) * Math.PI * 2) * 0.014;
  if (olharPermitido(config)) {
    const base = OLHAR_BASE[estadoDoAvatar] ?? OLHAR_BASE.parado;
    if (estado.estadoVisto !== estadoDoAvatar) {
      estado.estadoVisto = estadoDoAvatar;
      estado.proximoOlhar = 0;
    }
    estado.proximoOlhar -= dt;
    if (estado.proximoOlhar <= 0) {
      estado.proximoOlhar = 1200 + aleatorio() * 2600;
      estado.olharAlvo = {
        yaw: base.yaw + (aleatorio() * 2 - 1) * base.vagar,
        pitch: base.pitch + (aleatorio() * 2 - 1) * base.vagar * 0.6,
      };
    }
    // Segue o alvo suavemente (constante ~180 ms).
    const k = 1 - Math.exp(-dt / 180);
    estado.olhar.yaw += (estado.olharAlvo.yaw - estado.olhar.yaw) * k;
    estado.olhar.pitch += (estado.olharAlvo.pitch - estado.olhar.pitch) * k;
    olhar.yaw = estado.olhar.yaw;
    olhar.pitch = estado.olhar.pitch;
  }

  return {
    respiracao: respiraPermitido(config) ? respiracao : 0,
    balanco,
    piscar: piscaPermitido(config) ? piscar : 0,
    olhar,
  };
}
