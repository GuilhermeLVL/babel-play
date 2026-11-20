/**
 * O REGISTRO DE MOTORES DE VOZ — o par, no gateway, da porta `core/voz/portaDeVoz.ts` (spec
 * `docs/specs/2026-10-28-narracao-v2.md`, §7).
 *
 * Cada motor é um `AdaptadorDeVoz`: as capacidades (puras, lidas pela porta) e a fábrica de um `TtsEngine`
 * (a interface de `lib/tts.ts`, que o Narrador, a fila de fala e os seletores já usam). Registrados de fábrica:
 *   · `aparelho` — o `speechSynthesis` (`nativeTts`);
 *   · `nuvem`    — a voz natural (`lib/voz/vozDaNuvem.ts`, carregada sob demanda: fora do JS inicial).
 *
 * O PONTO DO MOTOR NEURAL FUTURO: `registrarMotorDeVoz({ id: 'neural-local', … })`. Enquanto ninguém registra,
 * `neuralLocalRegistrado()` é `false` e a porta NUNCA escolhe `neural-local`. Registrar é a única mudança
 * necessária no app para ele passar a valer — depois do parecer jurídico (espeak-ng é GPL-3.0) e do pacote de
 * modelo por nível de hardware (pesquisa `docs/pesquisa/2026-10-28-voz-e-modelos-locais.md`).
 */
import {
  CAPACIDADES_DA_NUVEM,
  CAPACIDADES_DO_APARELHO,
  type CapacidadesDoMotor,
  type MotorDeVozId,
} from '../core/voz/portaDeVoz';
import { nativeTts, type TtsEngine } from '../lib/tts';

export interface OpcoesDoMotor {
  /** A voz do aparelho que serve de reserva (padrão: `nativeTts`). */
  reserva?: TtsEngine;
  /** A voz natural recuou para a reserva: o motivo (`cota`, `plano`, …). */
  aoRecuar?: (motivo: string) => void;
}

export interface AdaptadorDeVoz {
  id: MotorDeVozId;
  capacidades: CapacidadesDoMotor;
  /** O motor atende este idioma agora? (modelo baixado, aparelho que aguenta, …) */
  pronto(idioma: string): boolean;
  criar(opcoes?: OpcoesDoMotor): TtsEngine | Promise<TtsEngine>;
}

const registro = new Map<MotorDeVozId, AdaptadorDeVoz>();

export function registrarMotorDeVoz(a: AdaptadorDeVoz): void {
  registro.set(a.id, a);
}

export const motorDeVozRegistrado = (id: MotorDeVozId): AdaptadorDeVoz | undefined => registro.get(id);

/** Só para o teste: volta aos dois motores de fábrica. */
export function reiniciarRegistroDeMotoresDeVoz(): void {
  registro.clear();
  registrarDeFabrica();
}

export const neuralLocalRegistrado = (): boolean => registro.has('neural-local');

/** O motor neural local está registrado E pronto para o idioma? (alimenta `vozDaNarracao`) */
export const neuralLocalPronto = (idioma: string): boolean => registro.get('neural-local')?.pronto(idioma) ?? false;

function registrarDeFabrica(): void {
  registrarMotorDeVoz({
    id: 'aparelho',
    capacidades: CAPACIDADES_DO_APARELHO,
    pronto: () => true,
    criar: () => nativeTts,
  });
  registrarMotorDeVoz({
    id: 'nuvem',
    capacidades: CAPACIDADES_DA_NUVEM,
    pronto: () => true,
    criar: async (o) => {
      const { criarVozDaNuvem } = await import('../lib/voz/vozDaNuvem');
      return criarVozDaNuvem({ reserva: o?.reserva ?? nativeTts, aoRecuar: o?.aoRecuar });
    },
  });
}
registrarDeFabrica();
