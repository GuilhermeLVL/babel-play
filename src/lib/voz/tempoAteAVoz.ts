/**
 * A MÉTRICA `tts_inicio` DO MODO INTÉRPRETE (Fase E): do fim da fala original ao começo da voz que lê a
 * tradução, por motor (`voz-da-nuvem` ou `voz-do-aparelho`). É a meta do plano — ≤ 2,5 s p50 no Premium
 * —, medida pelo e2e do E6 em `window.__ttsInicio()`.
 *
 * FORA DO JS INICIAL, de propósito: mora com a fila de fala (que só o intérprete carrega), e não no
 * `captureMetrics.ts` da captura. Fica na aba, como as escaladas: não vai no lote da telemetria (o
 * contrato `v: 1` de `/api/metricas/captura` não muda). A tela liga a fila a ela:
 *
 *   criarFilaDeFala({ …, aoIniciar: (item, espera) => tempoAteAVoz.registrar(espera, voz.motorDaUltimaFala()) })
 */

import { MOTOR_DA_NUVEM, PRECO_DA_NUVEM_USD_POR_MIN } from '../../gateway/capture/captureMetrics';

const TETO_DE_AMOSTRAS = 200;

/** As etapas entre o fim da fala e a voz, na ordem em que acontecem. */
export type EtapaDoInterprete = 'vad' | 'stt' | 'mt' | 'tts';
const ETAPAS_DO_INTERPRETE: readonly EtapaDoInterprete[] = ['vad', 'stt', 'mt', 'tts'];

/** Onde o resumo da última conversa fica guardado (só números), para o `/diagnostico` mostrar. */
export const CHAVE_DO_ULTIMO_INTERPRETE = 'babel.ultimoInterprete';

export interface ResumoDoTempo {
  p50: number;
  p95: number;
  media: number;
  amostras: number;
}

interface ResumoDaEtapa extends ResumoDoTempo {
  motores: string[];
}

export interface ResumoDoTempoAteAVoz extends ResumoDoTempo {
  motores: string[];
  porMotor: Record<string, ResumoDoTempo>;
  /** p50/p95 de cada etapa (VAD, STT, tradução, início da voz). Ausente sem nenhuma amostra. */
  etapas?: Partial<Record<EtapaDoInterprete, ResumoDaEtapa>>;
  /** Custo estimado da conversa em US$; ausente sem nenhum STT medido. */
  custoUsd?: number;
  /** O que o custo cobre: só o STT de nuvem (tradução e voz não têm preço de tabela no código). */
  custoCobre?: 'stt';
}

const amostras: { ms: number; motor: string }[] = [];
/** Uma amostra por fala e etapa (`${etapa}|${segId}`): repetir a mesma fala substitui, não duplica. */
const etapas = new Map<string, { etapa: EtapaDoInterprete; ms: number; motor: string; audioMs?: number }>();

function resumir(xs: number[]): ResumoDoTempo {
  const s = [...xs].sort((a, b) => a - b);
  const pct = (p: number) => s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
  return { p50: pct(50), p95: pct(95), media: Math.round(s.reduce((t, x) => t + x, 0) / s.length), amostras: s.length };
}

export const tempoAteAVoz = {
  /** A voz começou a ler uma tradução `ms` depois do fim da fala original (`filaDeFala.ts`, `aoIniciar`). */
  registrar(ms: number, motor: string): void {
    if (!Number.isFinite(ms) || ms < 0) return;
    amostras.push({ ms: Math.round(ms), motor: motor || 'desconhecido' });
    if (amostras.length > TETO_DE_AMOSTRAS) amostras.shift();
  },

  /**
   * O tempo de UMA etapa de UMA fala (`segId` = id do balão) e quem a fez. `audioMs` (só do STT) dá o
   * custo da nuvem. Só números e nomes de motor: nenhum texto da fala passa por aqui.
   */
  etapa(segId: string, etapa: EtapaDoInterprete, ms: number, motor: string, audioMs?: number): void {
    if (!Number.isFinite(ms) || ms < 0) return;
    etapas.set(`${etapa}|${segId}`, {
      etapa,
      ms: Math.round(ms),
      motor: motor || 'desconhecido',
      ...(audioMs && audioMs > 0 ? { audioMs } : {}),
    });
    if (etapas.size > TETO_DE_AMOSTRAS * ETAPAS_DO_INTERPRETE.length) etapas.delete(etapas.keys().next().value as string);
  },

  /** p50/p95/média de todas e por motor; `null` sem amostra (nunca um zero inventado). */
  resumo(): ResumoDoTempoAteAVoz | null {
    if (!amostras.length) return null;
    const motores = [...new Set(amostras.map((a) => a.motor))];
    const porEtapa: Partial<Record<EtapaDoInterprete, ResumoDaEtapa>> = {};
    for (const nome of ETAPAS_DO_INTERPRETE) {
      const dela = [...etapas.values()].filter((e) => e.etapa === nome);
      if (dela.length) porEtapa[nome] = { ...resumir(dela.map((e) => e.ms)), motores: [...new Set(dela.map((e) => e.motor))] };
    }
    const stts = [...etapas.values()].filter((e) => e.etapa === 'stt');
    const minutosNaNuvem = stts.filter((e) => e.motor === MOTOR_DA_NUVEM).reduce((s, e) => s + (e.audioMs ?? 0), 0) / 60000;
    return {
      ...resumir(amostras.map((a) => a.ms)),
      motores,
      porMotor: Object.fromEntries(
        motores.map((m) => [m, resumir(amostras.filter((a) => a.motor === m).map((a) => a.ms))]),
      ),
      ...(Object.keys(porEtapa).length ? { etapas: porEtapa } : {}),
      ...(stts.length
        ? { custoUsd: Math.round(minutosNaNuvem * PRECO_DA_NUVEM_USD_POR_MIN * 1e6) / 1e6, custoCobre: 'stt' as const }
        : {}),
    };
  },

  /**
   * Guarda o resumo da conversa que acabou (só números), para o `/diagnostico`. Sem amostra, não guarda;
   * sem armazenamento (modo privado), segue sem guardar.
   */
  guardar(quando: number = Date.now()): void {
    const resumo = tempoAteAVoz.resumo();
    if (!resumo) return;
    try {
      localStorage.setItem(CHAVE_DO_ULTIMO_INTERPRETE, JSON.stringify({ quando, ...resumo }));
    } catch {
      /* sem armazenamento */
    }
  },

  /** Zera (começo de uma sessão do intérprete). */
  zerar(): void {
    amostras.length = 0;
    etapas.clear();
  },
};

/** O resumo da última conversa do intérprete neste aparelho, ou `null`. */
export function lerUltimoDoInterprete(): (ResumoDoTempoAteAVoz & { quando: number }) | null {
  try {
    const bruto = localStorage.getItem(CHAVE_DO_ULTIMO_INTERPRETE);
    return bruto ? (JSON.parse(bruto) as ResumoDoTempoAteAVoz & { quando: number }) : null;
  } catch {
    return null;
  }
}

const ROTULO_DA_ETAPA: Record<EtapaDoInterprete, string> = {
  vad: 'espera do VAD',
  stt: 'transcrição',
  mt: 'tradução',
  tts: 'início da voz',
};

/**
 * As etapas do resumo em uma linha para o `/diagnostico`: "espera do VAD 800/800 ms (vad-fixo) · transcrição …",
 * cada uma como p50/p95 e o(s) motor(es). `null` sem etapa. Só números e nomes de motor.
 */
export function descreverEtapas(r: Pick<ResumoDoTempoAteAVoz, 'etapas'>): string | null {
  const partes = ETAPAS_DO_INTERPRETE.flatMap((nome) => {
    const e = r.etapas?.[nome];
    return e ? [`${ROTULO_DA_ETAPA[nome]} ${e.p50}/${e.p95} ms (${e.motores.join(', ')})`] : [];
  });
  return partes.length ? partes.join(' · ') : null;
}

// O gancho do e2e (E6) e da inspeção manual, como o `__capSummary` da captura.
if (typeof window !== 'undefined') {
  (window as unknown as { __ttsInicio?: () => ResumoDoTempoAteAVoz | null }).__ttsInicio = () => tempoAteAVoz.resumo();
}
