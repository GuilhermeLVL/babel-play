/**
 * Observabilidade da captura de áudio. Registra o ciclo de vida de cada enunciado
 * (início da fala → 1º parcial → fim da fala → decode final) num ring buffer exposto
 * em `window.__capMetrics()` / `window.__capSummary()`.
 *
 * Serve para MEDIR onde o tempo é gasto (o que o usuário sente como "lento / fora de
 * ordem") e para inspecionar via chrome-devtools MCP durante uma sessão real, já que
 * getDisplayMedia + áudio real não roda em navegador headless.
 *
 * Além do ring (que é da aba), um ACUMULADOR DE TELEMETRIA guarda só números — latências, RTF,
 * contagens de descarte e de fallback, o nome do motor — desde o último envio. É o que
 * `telemetriaDeCaptura.ts` drena e manda ao servidor. Texto do usuário nunca entra nele.
 */

export type CapSource = 'mic' | 'system';

export interface UtteranceMetric {
  seq: number;
  source: CapSource;
  /** performance.now() de cada estágio (ms desde a origem do timing). */
  tSpeechStart: number;
  tFirstPartial?: number;
  tSpeechEnd?: number;
  tFinalDone?: number;
  /** Duração do decode FINAL do Whisper (ms). */
  decodeMs?: number;
  /** Duração do áudio do enunciado (ms) — para calcular o RTF (decodeMs/audioMs). */
  audioMs?: number;
  /** Quantos partials chegaram a exibir para este enunciado. */
  partialCount: number;
  /** Enunciados pendentes no worker no momento do final (profundidade de fila). */
  queueDepth?: number;
  /** Algum parcial foi PULADO por worker ocupado (sinal de saturação). */
  saturated?: boolean;
  /** O motor que fez o decode final (`groq-whisper` = nuvem; `whisper-local` = aparelho). */
  engine?: string;
  text?: string;
}

const RING_MAX = 200;

/**
 * As etapas medidas de UMA fala, por id do balão (`mic-3`, `sys-7`): quanto o STT e a tradução levaram e
 * quem os fez. Só números e nomes de motor, nunca texto. O intérprete lê daqui (`etapasDaFala`) quando a
 * voz começa e junta ao tempo até a voz (`tempoAteAVoz.ts`); a nuvem do STT é a única com custo conhecido.
 */
export interface EtapasDaFala {
  stt?: { ms: number; motor: string; audioMs?: number };
  mt?: { ms: number; motor: string };
}
const etapasPorFala = new Map<string, EtapasDaFala>();

function guardarEtapa<K extends keyof EtapasDaFala>(id: string, etapa: K, valor: NonNullable<EtapasDaFala[K]>): void {
  etapasPorFala.set(id, { ...etapasPorFala.get(id), [etapa]: valor });
  // Teto: a mais antiga sai (o Map guarda a ordem de inserção).
  if (etapasPorFala.size > RING_MAX) etapasPorFala.delete(etapasPorFala.keys().next().value as string);
}

/** O adaptador de nuvem do STT (`groqWhisper.ts`): o único que custa por minuto. */
export const MOTOR_DA_NUVEM = 'groq-whisper';
/**
 * Preço de tabela do minuto de fala na nuvem (Whisper large-v3-turbo: US$ 0,0005 no Workers AI,
 * US$ 0,00067 na Groq). É ESTIMATIVA para o medidor da sessão; o custo real é o do provedor.
 */
export const PRECO_DA_NUVEM_USD_POR_MIN = 0.0005;
/** Onde o resumo da última captura fica guardado (só números), para o `/diagnostico` mostrar. */
export const CHAVE_DA_ULTIMA_CAPTURA = 'babel.ultimaCaptura';

/** Guarda o resumo da sessão que acabou. Sem armazenamento (modo privado), segue sem guardar. */
export function guardarUltimaCaptura(duracaoS: number): void {
  try {
    const resumo = capMetrics.summary();
    if (!resumo.count) return;
    localStorage.setItem(CHAVE_DA_ULTIMA_CAPTURA, JSON.stringify({ quando: Date.now(), duracaoS, ...resumo }));
  } catch {
    /* sem armazenamento */
  }
}

// Enunciados em andamento (ainda sem final), por seq.
const inflight = new Map<number, UtteranceMetric>();
// Enunciados concluídos (ring buffer).
const ring: UtteranceMetric[] = [];
// Amostras de latência de TRADUÇÃO (ms) por engine — mede o custo da MT isoladamente.
const mtSamples: { ms: number; engine: string }[] = [];

/** O que vai ao servidor: só números, só desde o último envio (ver `drenarTelemetria`). */
export interface LoteDeTelemetria {
  sttFinalMs: number[];
  primeiroParcialMs: number[];
  mtMs: number[];
  rtf: number[];
  descartesAlucinacao: number;
  fallbacks: Record<string, number>;
  motorStt: string;
  motorMt: string;
}
const lote = {
  sttFinalMs: [] as number[],
  primeiroParcialMs: [] as number[],
  mtMs: [] as number[],
  rtf: [] as number[],
  descartesAlucinacao: 0,
  fallbacks: {} as Record<string, number>,
};
// O motor é "o último que atendeu" — e continua valendo entre lotes (uma janela sem fala não o apaga).
let motorStt = '';
let motorMt = '';
/** Trechos que a porta de qualidade subiu à nuvem, desde o início da gravação. */
const escaladas = { mt: 0, stt: 0 };
/** Falas finais que NÃO foram à MT pela preferência "Tradução" (M0): economia, desde a gravação. */
const mtPuladas = { pedido: 0, conhecidas: 0 };

function empurrar(xs: number[], x: number): void {
  if (!Number.isFinite(x)) return;
  xs.push(Math.round(x * 1000) / 1000);
  if (xs.length > RING_MAX) xs.shift();
}

function zerarLote(): void {
  lote.sttFinalMs = [];
  lote.primeiroParcialMs = [];
  lote.mtMs = [];
  lote.rtf = [];
  lote.descartesAlucinacao = 0;
  lote.fallbacks = {};
}

const nowMs = (): number => (typeof performance !== 'undefined' ? performance.now() : 0);

function pushRing(m: UtteranceMetric): void {
  ring.push(m);
  if (ring.length > RING_MAX) ring.shift();
}

export const capMetrics = {
  /** Início de fala detectado (VAD onSpeechStart). */
  start(seq: number, source: CapSource): void {
    inflight.set(seq, { seq, source, tSpeechStart: nowMs(), partialCount: 0 });
  },

  /** Um parcial foi exibido (transcrição incremental). */
  partial(seq: number): void {
    const m = inflight.get(seq);
    if (!m) return;
    if (m.tFirstPartial === undefined) m.tFirstPartial = nowMs();
    m.partialCount++;
  },

  /** Um parcial foi PULADO porque o worker estava ocupado (saturação). */
  saturated(seq: number): void {
    const m = inflight.get(seq);
    if (m) m.saturated = true;
  },

  /** Fim de fala detectado (VAD onSpeechEnd) — antes do decode final. */
  speechEnd(seq: number): void {
    const m = inflight.get(seq);
    if (m) m.tSpeechEnd = nowMs();
  },

  /** Decode final concluído — encerra o enunciado e o move para o ring. */
  final(
    seq: number,
    info: { decodeMs?: number; queueDepth?: number; text?: string; audioMs?: number; engine?: string },
  ): void {
    const m = inflight.get(seq);
    if (!m) return;
    m.tFinalDone = nowMs();
    m.decodeMs = info.decodeMs;
    m.queueDepth = info.queueDepth;
    m.text = info.text;
    m.audioMs = info.audioMs;
    m.engine = info.engine;
    inflight.delete(seq);
    pushRing(m);
    // Telemetria: os MESMOS números do `summary()`, amostra a amostra. O texto fica no ring (aba).
    if (m.tSpeechEnd !== undefined) empurrar(lote.sttFinalMs, m.tFinalDone - m.tSpeechEnd);
    if (m.tFirstPartial !== undefined) empurrar(lote.primeiroParcialMs, m.tFirstPartial - m.tSpeechStart);
    if (m.decodeMs && m.audioMs) empurrar(lote.rtf, m.decodeMs / m.audioMs);
    if (info.engine) motorStt = info.engine;
    // O id do balão é `<sys|mic>-<seq>` (o `seq` do mic já vem deslocado; ver `pipelineDeFala.ts`).
    if (m.tSpeechEnd !== undefined) {
      guardarEtapa(`${m.source === 'system' ? 'sys' : 'mic'}-${seq}`, 'stt', {
        ms: Math.round(m.tFinalDone - m.tSpeechEnd),
        motor: info.engine || 'desconhecido',
        ...(info.audioMs ? { audioMs: info.audioMs } : {}),
      });
    }
  },

  /** As etapas medidas da fala `id` (STT e tradução), ou `undefined`. Sem texto. */
  etapasDaFala(id: string): EtapasDaFala | undefined {
    return etapasPorFala.get(id);
  },

  /** O motor de STT devolveu texto e o filtro de alucinação o esvaziou (ver `alucinacao.ts`). */
  alucinacao(): void {
    lote.descartesAlucinacao++;
  },

  /** Um motor falhou e o seguinte da cadeia assumiu. Chave: `stt:<adapter>` / `mt:<adapter>`. */
  fallback(chave: string): void {
    lote.fallbacks[chave] = (lote.fallbacks[chave] ?? 0) + 1;
  },

  /**
   * A porta de qualidade (harness §5) subiu UM trecho do motor local à nuvem. Fica na aba
   * (`summary().escaladas`) — é a taxa que calibra os limiares (meta ≤ 15% dos trechos).
   */
  escalada(tipo: 'mt' | 'stt'): void {
    escaladas[tipo]++;
  },

  /**
   * Uma fala final ficou sem MT pela preferência "Tradução" (`traducaoSobDemanda.ts`): `pedido` =
   * "só quando eu pedir"; `todas-conhecidas` = toda palavra já sabida. Fica na aba
   * (`summary().mtPuladas`), sem texto: é a conta de quanto o M0 economiza.
   */
  mtPulada(motivo: 'pedido' | 'todas-conhecidas'): void {
    mtPuladas[motivo === 'pedido' ? 'pedido' : 'conhecidas']++;
  },

  /** Devolve o lote desde o último envio e começa outro. Quem chama é `telemetriaDeCaptura.ts`. */
  drenarTelemetria(): LoteDeTelemetria {
    const saida: LoteDeTelemetria = { ...lote, fallbacks: { ...lote.fallbacks }, motorStt, motorMt };
    zerarLote();
    return saida;
  },

  /** Registra a latência de uma tradução (ms) + engine que a atendeu. */
  mt(ms: number, engine: string, segId?: string): void {
    if (segId) guardarEtapa(segId, 'mt', { ms, motor: engine });
    mtSamples.push({ ms, engine });
    if (mtSamples.length > RING_MAX) mtSamples.shift();
    empurrar(lote.mtMs, ms);
    if (engine) motorMt = engine;
  },

  /** Enunciado descartado (vazio/misfire) — remove sem registrar. */
  drop(seq: number): void {
    inflight.delete(seq);
  },

  /** Zera tudo (chamado no START de uma nova gravação). */
  reset(): void {
    inflight.clear();
    ring.length = 0;
    mtSamples.length = 0;
    etapasPorFala.clear();
    zerarLote();
    motorStt = '';
    motorMt = '';
    escaladas.mt = 0;
    escaladas.stt = 0;
    mtPuladas.pedido = 0;
    mtPuladas.conhecidas = 0;
  },

  /** Snapshot: concluídos + em andamento, em ordem de seq. */
  all(): UtteranceMetric[] {
    return [...ring, ...inflight.values()].sort((a, b) => a.seq - b.seq);
  },

  /** Agregados p/ benchmark: latências (p50/p95), RTF, TTFT, MT, saturação, ordem. */
  summary() {
    const done = ring.filter((m) => m.tFinalDone !== undefined);
    const avg = (xs: number[]): number => (xs.length ? Math.round(xs.reduce((s, x) => s + x, 0) / xs.length) : 0);
    const pct = (xs: number[], p: number): number => {
      if (!xs.length) return 0;
      const s = [...xs].sort((a, b) => a - b);
      return Math.round(s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]);
    };
    const stat = (xs: number[]) => ({ p50: pct(xs, 50), p95: pct(xs, 95), avg: avg(xs) });

    // TTFT = tempo até o 1º texto na tela (parcial); latência final = fim-da-fala → texto final.
    const firstPartial = done
      .filter((m) => m.tFirstPartial !== undefined)
      .map((m) => m.tFirstPartial! - m.tSpeechStart);
    const finalLatency = done
      .filter((m) => m.tSpeechEnd !== undefined && m.tFinalDone !== undefined)
      .map((m) => m.tFinalDone! - m.tSpeechEnd!);
    const decode = done.map((m) => m.decodeMs ?? 0).filter(Boolean);
    // RTF = compute / duração do áudio. < 1 = acompanha o tempo real.
    const rtf = done.filter((m) => m.decodeMs && m.audioMs).map((m) => m.decodeMs! / m.audioMs!);
    const rtfStat = {
      p50:
        pct(
          rtf.map((x) => x * 1000),
          50,
        ) / 1000,
      p95:
        pct(
          rtf.map((x) => x * 1000),
          95,
        ) / 1000,
    };
    const mt = mtSamples.map((s) => s.ms);

    /* POR MOTOR: quanto de fala cada um transcreveu e em quanto tempo — é daqui que sai o custo da
       sessão (só a nuvem custa) e a comparação nuvem × aparelho no MESMO aparelho. */
    const porMotor: Record<string, { falas: number; minutosDeFala: number; finalMs: { p50: number; p95: number } }> =
      {};
    for (const nome of new Set(done.map((m) => m.engine ?? 'desconhecido'))) {
      const dele = done.filter((m) => (m.engine ?? 'desconhecido') === nome);
      const lat = dele.filter((m) => m.tSpeechEnd !== undefined).map((m) => m.tFinalDone! - m.tSpeechEnd!);
      porMotor[nome] = {
        falas: dele.length,
        minutosDeFala: Math.round((dele.reduce((s, m) => s + (m.audioMs ?? 0), 0) / 60000) * 100) / 100,
        finalMs: { p50: pct(lat, 50), p95: pct(lat, 95) },
      };
    }
    const minutosNaNuvem = porMotor[MOTOR_DA_NUVEM]?.minutosDeFala ?? 0;

    const seqs = done.map((m) => m.seq);
    const inOrder = seqs.every((s, i) => i === 0 || s > seqs[i - 1]);
    return {
      count: done.length,
      ttftMs: stat(firstPartial), // time-to-first-token (parcial visível)
      finalLatencyMs: stat(finalLatency), // fim da fala → texto final
      decodeMs: stat(decode),
      rtf: rtfStat, // < 1 = acompanha tempo real
      mtLatencyMs: mt.length ? { ...stat(mt), engines: [...new Set(mtSamples.map((s) => s.engine))] } : null,
      maxQueueDepth: done.reduce((mx, m) => Math.max(mx, m.queueDepth ?? 0), 0),
      saturatedCount: done.filter((m) => m.saturated).length,
      partialsShown: done.filter((m) => m.partialCount > 0).length,
      renderedInSeqOrder: inOrder,
      porMotor,
      nuvem: {
        minutos: minutosNaNuvem,
        custoUsd: Math.round(minutosNaNuvem * PRECO_DA_NUVEM_USD_POR_MIN * 10000) / 10000,
      },
      escaladas: { ...escaladas },
      mtPuladas: { ...mtPuladas },
    };
  },
};

// Ganchos de console para inspeção manual e via chrome-devtools MCP (evaluate_script).
if (typeof window !== 'undefined') {
  (window as any).__capMetrics = () => capMetrics.all();
  (window as any).__capSummary = () => capMetrics.summary();
  (window as any).__capReset = () => capMetrics.reset();
}
