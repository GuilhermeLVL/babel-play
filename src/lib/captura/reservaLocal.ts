/**
 * QUANDO CARREGAR A RESERVA LOCAL DO STT (auditoria de eficiência 2026-09-28, achado 4).
 *
 * Com a rota "nuvem primeiro", o modelo local é só RESERVA. Até aqui ele era baixado sempre — 80 MB
 * (base q8) a 209 MB de STT, mais 113 MB do tradutor opus-mt — e ainda rodava os parciais locais,
 * mesmo em quem paga e nunca vê a nuvem cair. No celular e no Quest isso é plano de dados e memória
 * da aba (o iPhone perdeu 8 de 12 falas com 1,3–1,4 GB de pico; relatório de dispositivos 26/09).
 *
 * Nestes aparelhos a reserva fica PREGUIÇOSA: nada baixa no início, e a primeira falha da nuvem
 * (`gateway/falhaDaNuvemDoStt.ts`) dispara a carga. O custo é a primeira fala depois da falha,
 * que espera o modelo; o ganho é que a sessão sem falha — a regra — não baixa nada. O parcial
 * local também não roda aqui: ele disputaria o worker e a memória com um modelo que nem é o motor.
 *
 * No DESKTOP nada muda: disco, memória e rede sobram, e a reserva quente é o que deixa a queda da
 * nuvem invisível. Rota local (sem nuvem) em qualquer aparelho: o modelo local é o motor, carrega já.
 */
import type { TipoDeDispositivo } from '../dispositivo/perfil';

export interface PlanoDaReservaLocal {
  /** Baixar/carregar o modelo local (e o tradutor da reserva) já na preparação da captura. */
  carregarAgora: boolean;
  /** Rodar os decodes PARCIAIS no modelo local. */
  parciaisLocais: boolean;
}

const APARELHOS_DE_RESERVA_PREGUICOSA: ReadonlySet<TipoDeDispositivo> = new Set(['celular-fraco', 'celular-bom', 'quest']);

export function planoDaReservaLocal(p: { preferCloud: boolean; tipo: TipoDeDispositivo }): PlanoDaReservaLocal {
  if (p.preferCloud && APARELHOS_DE_RESERVA_PREGUICOSA.has(p.tipo)) return { carregarAgora: false, parciaisLocais: false };
  return { carregarAgora: true, parciaisLocais: true };
}
