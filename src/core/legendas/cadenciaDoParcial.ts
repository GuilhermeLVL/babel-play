/**
 * CADÊNCIA ADAPTATIVA DO PARCIAL (change `parciais-incrementais`, D3): quando pedir o próximo decode parcial.
 *
 * PURA: sem relógio próprio (o chamador passa os tempos), sem React, sem rede.
 *
 * Orçamento: o parcial só inicia se o custo estimado do decode (`RTF × janela`) cabe numa FRAÇÃO do intervalo;
 * o intervalo é esse custo ÷ fração, preso entre o piso (500 ms) e o teto (2 s). RTF alto → intervalo maior (até
 * o teto, e acima dele o parcial não compensa: pula); RTF baixo → intervalo no piso. Sem teto de contagem por fala,
 * mas com TETO DE CPU: a fração do tempo recente que o worker passou em parciais. Worker ocupado → não pede (o
 * parcial nunca enfileira; o FINAL tem prioridade e cancela o parcial em voo: `filaDoWorker.ts`). Fim provável (V5): com silêncio
 * já acumulado, só pede se o decode estimado termina antes do final especulativo ser postado.
 */

export interface ConfigDaCadencia {
  /** Menor espaçamento entre parciais (ms). */
  pisoMs: number;
  /** Maior espaçamento (ms); acima dele, o orçamento não fecha e o parcial é pulado. */
  tetoMs: number;
  /** Quanto do intervalo o decode pode custar (0..1). */
  fracao: number;
  /** Teto da fração do tempo recente gasta em parciais (0..1). */
  tetoDeCpu: number;
  /** Áudio novo mínimo (amostras a 16 kHz) para valer um decode. */
  minAmostras: number;
  /** RTF presumido enquanto não há medida (o 1º parcial da sessão). */
  rtfInicial: number;
  /**
   * Silêncio (ms) em que o decode FINAL especulativo é postado (`ESPECULATIVO_MS` da captura). V5 "final livre": o parcial que ainda
   * estaria em voo nesse instante faria o final esperar (o encoder do Parakeet não aborta), então ele nem começa.
   */
  finalEspeculativoMs: number;
}

export const CADENCIA_PADRAO: ConfigDaCadencia = {
  pisoMs: 500,
  tetoMs: 2000,
  fracao: 0.5,
  tetoDeCpu: 0.6,
  minAmostras: 16000 * 0.5,
  rtfInicial: 0.3,
  finalEspeculativoMs: 450,
};

export interface EntradaDaCadencia {
  /** RTF medido (tempo de decode ÷ duração do áudio) ou `null` sem medida. */
  rtf: number | null;
  /** Duração do áudio que o parcial decodificaria agora (s). */
  janelaS: number;
  /** O worker está ocupado (qualquer decode em voo ou na fila)? */
  workerOcupado: boolean;
  /** ms desde o último parcial desta fala (`Infinity` = nenhum ainda). */
  msDesdeUltimo: number;
  /** Amostras a 16 kHz acumuladas desde o último parcial. */
  amostrasNovas: number;
  /** Fração do tempo recente que o worker gastou em parciais (0..1). */
  cpuRecente?: number;
  /** Silêncio acumulado na pausa de agora (ms; 0 = falando). Ausente = não se sabe: sem a regra do fim provável. */
  silencioMs?: number;
}

export type MotivoDaCadencia =
  | 'ok'
  | 'ocupado'
  | 'poucas-amostras'
  | 'intervalo'
  | 'orcamento'
  | 'cpu'
  | 'fim-provavel';

export interface DecisaoDaCadencia {
  pedir: boolean;
  motivo: MotivoDaCadencia;
  /** O espaçamento que o orçamento pede agora (ms). */
  intervaloMs: number;
}

export function decidirParcial(e: EntradaDaCadencia, cfg: ConfigDaCadencia = CADENCIA_PADRAO): DecisaoDaCadencia {
  const rtf = e.rtf !== null && Number.isFinite(e.rtf) && e.rtf >= 0 ? e.rtf : cfg.rtfInicial;
  const custoMs = rtf * Math.max(0, e.janelaS) * 1000;
  const ideal = custoMs / cfg.fracao;
  const intervaloMs = Math.min(cfg.tetoMs, Math.max(cfg.pisoMs, ideal));
  const sem = (motivo: MotivoDaCadencia): DecisaoDaCadencia => ({ pedir: false, motivo, intervaloMs });
  if (e.workerOcupado) return sem('ocupado');
  /* FIM PROVÁVEL (V5): a pessoa já parou (há silêncio) e o parcial só acabaria depois de o final especulativo ser postado. O texto
     dele não mudaria (não entrou áudio de fala) e o final esperaria por ele: não começa. Falando (silêncio 0), pede como sempre. */
  if (e.silencioMs !== undefined && e.silencioMs > 0 && e.silencioMs + custoMs > cfg.finalEspeculativoMs)
    return sem('fim-provavel');
  if (e.amostrasNovas < cfg.minAmostras) return sem('poucas-amostras');
  if (ideal > cfg.tetoMs) return sem('orcamento');
  if ((e.cpuRecente ?? 0) >= cfg.tetoDeCpu) return sem('cpu');
  if (e.msDesdeUltimo < intervaloMs) return sem('intervalo');
  return { pedir: true, motivo: 'ok', intervaloMs };
}

/**
 * O que a cadência mede: o RTF (média móvel exponencial dos decodes de parcial) e a fração de CPU numa janela
 * deslizante. O relógio vem de fora (`agora`), para o teste mandar nele.
 */
export interface MedidorDeParcial {
  /** Registra um decode de parcial concluído (ms de parede e duração do áudio decodificado). */
  registrar(decodeMs: number, audioMs: number): void;
  rtf(): number | null;
  /** Fração (0..1) dos últimos `janelaMs` que o worker passou decodificando parciais. */
  cpu(): number;
}

export function criarMedidorDeParcial(agora: () => number, janelaMs = 10_000, alfa = 0.4): MedidorDeParcial {
  let rtf: number | null = null;
  let usos: { fim: number; ms: number }[] = [];
  return {
    registrar(decodeMs, audioMs) {
      if (!(decodeMs >= 0) || !(audioMs > 0)) return;
      const r = decodeMs / audioMs;
      rtf = rtf === null ? r : alfa * r + (1 - alfa) * rtf;
      usos.push({ fim: agora(), ms: decodeMs });
    },
    rtf: () => rtf,
    cpu() {
      const t = agora();
      usos = usos.filter((u) => u.fim > t - janelaMs);
      let soma = 0;
      for (const u of usos) soma += Math.min(u.ms, janelaMs, u.fim - (t - janelaMs));
      return Math.min(1, soma / janelaMs);
    },
  };
}
