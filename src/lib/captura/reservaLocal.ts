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
import { ID_DO_PARAKEET } from '../../gateway/adapters/parakeetModelo';
import type { TipoDeDispositivo } from '../dispositivo/perfil';

export interface PlanoDaReservaLocal {
  /** Baixar/carregar o modelo local (e o tradutor da reserva) já na preparação da captura. */
  carregarAgora: boolean;
  /** Rodar os decodes PARCIAIS no modelo local. */
  parciaisLocais: boolean;
  /**
   * A reserva da nuvem é o PARAKEET (Fase B, item 5; só computador, só com a cópia no aparelho): o que
   * carrega agora é o Whisper base de sempre (parciais e queda invisível iguais), e o Parakeet (~2 GB
   * de RAM) só entra na cadeia quando a nuvem PAUSA (`parakeetDeReservaNaFalha`), no lugar do Whisper
   * (que é liberado), e sai quando ela volta estável. A sessão sem pausa — a regra — não segura 2 GB
   * por uma reserva que não usa.
   */
  parakeetNaFalha: boolean;
}

const APARELHOS_DE_RESERVA_PREGUICOSA: ReadonlySet<TipoDeDispositivo> = new Set([
  'celular-fraco',
  'celular-bom',
  'quest',
]);

export function planoDaReservaLocal(p: {
  preferCloud: boolean;
  tipo: TipoDeDispositivo;
  /** O modelo local da rota (`SttRoute.localModel`). Ausente = não é o Parakeet. */
  localModel?: string;
}): PlanoDaReservaLocal {
  if (p.preferCloud && APARELHOS_DE_RESERVA_PREGUICOSA.has(p.tipo))
    return { carregarAgora: false, parciaisLocais: false, parakeetNaFalha: false };
  return {
    carregarAgora: true,
    parciaisLocais: true,
    parakeetNaFalha: p.preferCloud && p.localModel === ID_DO_PARAKEET,
  };
}

/* ───────────── o ciclo do Parakeet de reserva (rodada de correção 1, item 2) ───────────── */

/**
 * Quantas respostas boas SEGUIDAS da nuvem soltam o Parakeet de reserva (a nuvem voltou estável). Na
 * pausa a nuvem nem é chamada, então a contagem só anda depois que ela religa.
 */
export const RESPOSTAS_PARA_SOLTAR_O_PARAKEET = 5;

export interface EstadoDoParakeetDeReserva {
  ativo: boolean;
  respostasSeguidas: number;
}

type PassoDoParakeetDeReserva<A> = { estado: EstadoDoParakeetDeReserva; acao: A | null };

/**
 * Uma falha da nuvem. O Parakeet de reserva entra SÓ quando a nuvem PAUSA (402/429/503 ou a 3ª 5xx
 * seguida): num soluço o Whisper quente atende a fala, e baixar 2 GB de modelo por um soluço é o que
 * não pode. Ao entrar, o gateway LIBERA o Whisper (`reservaParakeet`): com o Parakeet,
 * `umModeloDeCadaVez(perfil, true)` é sempre verdadeiro — os três modelos (Whisper, Parakeet e o
 * tradutor) não ficam juntos em aparelho nenhum. Pura.
 */
export function parakeetDeReservaNaFalha(
  e: EstadoDoParakeetDeReserva,
  falha: { pausou: boolean },
): PassoDoParakeetDeReserva<'ligar'> {
  if (!falha.pausou || e.ativo) {
    const estado = e.respostasSeguidas === 0 ? e : { ...e, respostasSeguidas: 0 };
    return { estado, acao: null };
  }
  return { estado: { ativo: true, respostasSeguidas: 0 }, acao: 'ligar' };
}

/** Uma resposta boa da nuvem: depois de `RESPOSTAS_PARA_SOLTAR_O_PARAKEET` seguidas, o Parakeet sai. Pura. */
export function parakeetDeReservaNaResposta(e: EstadoDoParakeetDeReserva): PassoDoParakeetDeReserva<'desligar'> {
  if (!e.ativo) return { estado: e, acao: null };
  const respostasSeguidas = e.respostasSeguidas + 1;
  if (respostasSeguidas < RESPOSTAS_PARA_SOLTAR_O_PARAKEET)
    return { estado: { ativo: true, respostasSeguidas }, acao: null };
  return { estado: { ativo: false, respostasSeguidas: 0 }, acao: 'desligar' };
}
