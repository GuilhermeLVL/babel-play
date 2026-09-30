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

const TETO_DE_AMOSTRAS = 200;

export interface ResumoDoTempo {
  p50: number;
  p95: number;
  media: number;
  amostras: number;
}

export interface ResumoDoTempoAteAVoz extends ResumoDoTempo {
  motores: string[];
  porMotor: Record<string, ResumoDoTempo>;
}

const amostras: { ms: number; motor: string }[] = [];

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

  /** p50/p95/média de todas e por motor; `null` sem amostra (nunca um zero inventado). */
  resumo(): ResumoDoTempoAteAVoz | null {
    if (!amostras.length) return null;
    const motores = [...new Set(amostras.map((a) => a.motor))];
    return {
      ...resumir(amostras.map((a) => a.ms)),
      motores,
      porMotor: Object.fromEntries(
        motores.map((m) => [m, resumir(amostras.filter((a) => a.motor === m).map((a) => a.ms))]),
      ),
    };
  },

  /** Zera (começo de uma sessão do intérprete). */
  zerar(): void {
    amostras.length = 0;
  },
};

// O gancho do e2e (E6) e da inspeção manual, como o `__capSummary` da captura.
if (typeof window !== 'undefined') {
  (window as unknown as { __ttsInicio?: () => ResumoDoTempoAteAVoz | null }).__ttsInicio = () => tempoAteAVoz.resumo();
}
