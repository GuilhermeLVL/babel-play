/**
 * A VAZÃO DA REDE, MEDIDA (carga-rapida-no-celular, 3.2).
 *
 * O Safari não tem `navigator.connection`: no iPhone o aviso de rede lenta nunca aparecia, e 90 MB saíam do plano
 * de dados sem a pessoa saber quanto ia demorar (auditoria de 17/11/2026, CEL-04). Aqui a vazão vem do que o
 * navegador JÁ baixou, sem gastar um byte a mais:
 *   - antes do clique: a Resource Timing dos arquivos do próprio app (o pedaço da Captura tem ~140 KB);
 *   - durante o download do modelo: o progresso dele (bytes por instante), numa média móvel de 10 s, que dá a
 *     estimativa de tempo em faixa ("cerca de 3 a 5 min").
 * A última vazão medida fica guardada por 24 h (`localStorage`), para a próxima confirmação já saber.
 * Lenta: abaixo de 1,5 Mbit/s.
 */

/** Abaixo disto (Mbit/s) a rede é lenta: o aviso aparece e todo download pede confirmação. */
export const LIMIAR_DE_REDE_LENTA_MBPS = 1.5;
/** Acima disto (Mbit/s) a transcrição e o tradutor podem baixar juntos. */
export const VAZAO_PARA_BAIXAR_JUNTO_MBPS = 5;
const CHAVE = 'babel.vazao';
const VALIDADE_MS = 24 * 60 * 60 * 1000;
/** Os primeiros bytes que bastam para uma medida (e que viram a vazão guardada). */
export const AMOSTRA_MINIMA_BYTES = 256 * 1024;
/** A janela da média móvel do progresso (ms). */
export const JANELA_MS = 10_000;

export const mbps = (bytes: number, ms: number): number => (bytes * 8) / 1e6 / (ms / 1000);

/** O que a Resource Timing diz de um arquivo (o mínimo que esta conta usa). */
export interface EntradaDeRecurso {
  transferSize?: number;
  encodedBodySize?: number;
  responseStart: number;
  responseEnd: number;
}

/**
 * A vazão pelos arquivos que a página já baixou (Mbit/s), ou `null` sem medida que preste. Só os maiores que 30 KB
 * (os pequenos medem a latência, não a banda) e com tempo de corpo de verdade (cache e memória respondem em 0 ms).
 * Fica a MAIOR: com vários downloads juntos, cada um vê só uma parte da banda. Pura.
 */
export function vazaoPelosRecursos(entradas: readonly EntradaDeRecurso[]): number | null {
  let melhor: number | null = null;
  for (const e of entradas) {
    /* O Safari antigo não dá `transferSize`: o corpo codificado é o que passou pela rede. */
    const bytes = e.transferSize || e.encodedBodySize || 0;
    const ms = e.responseEnd - e.responseStart;
    if (bytes < 30 * 1024 || ms < 20) continue;
    const v = mbps(bytes, ms);
    if (melhor === null || v > melhor) melhor = v;
  }
  return melhor === null ? null : Math.round(melhor * 100) / 100;
}

/** A vazão guardada, se ainda vale (24 h). */
export function vazaoGuardada(agora = Date.now()): number | null {
  try {
    const v = JSON.parse(localStorage.getItem(CHAVE) ?? 'null') as { mbps?: number; em?: number } | null;
    if (!v || typeof v.mbps !== 'number' || typeof v.em !== 'number' || agora - v.em > VALIDADE_MS) return null;
    return v.mbps;
  } catch {
    return null;
  }
}

export function guardarVazao(valor: number, agora = Date.now()): void {
  if (!(valor > 0)) return;
  try {
    localStorage.setItem(CHAVE, JSON.stringify({ mbps: Math.round(valor * 100) / 100, em: agora }));
  } catch {
    /* sem storage: a próxima vez mede de novo */
  }
}

/** A melhor estimativa AGORA, sem rede: a guardada, ou a dos arquivos do próprio app. */
export function vazaoConhecida(): number | null {
  const guardada = vazaoGuardada();
  if (guardada !== null) return guardada;
  try {
    const entradas = performance.getEntriesByType('resource') as unknown as EntradaDeRecurso[];
    return vazaoPelosRecursos(entradas);
  } catch {
    return null;
  }
}

/** A rede é lenta? `null` = não sei. O tipo que o navegador declara vence; sem ele, a vazão medida. Pura. */
export function redeLentaPor(s: { tipoDeRede: string | null; vazaoMbps: number | null }): boolean | null {
  if (s.tipoDeRede) return s.tipoDeRede !== '4g';
  if (s.vazaoMbps === null) return null;
  return s.vazaoMbps < LIMIAR_DE_REDE_LENTA_MBPS;
}

/** Uma faixa de tempo, em segundos. */
export interface FaixaDeTempo {
  minS: number;
  maxS: number;
}

/**
 * Quanto falta para baixar `bytes` a `vazaoMbps`, em faixa: a rede de celular oscila, e um número exato erra. A
 * faixa vai de 80% a 150% do tempo estimado, arredondada (segundos até 1 min, depois minutos inteiros). Pura.
 */
export function estimarTempo(bytes: number, vazaoMbps: number | null): FaixaDeTempo | null {
  if (vazaoMbps === null || !(vazaoMbps > 0) || bytes <= 0) return null;
  const s = (bytes * 8) / (vazaoMbps * 1e6);
  const arredondar = (x: number) => (x < 60 ? Math.max(5, Math.round(x / 5) * 5) : Math.round(x / 60) * 60);
  const minS = arredondar(s * 0.8);
  const maxS = Math.max(minS, arredondar(s * 1.5));
  return { minS, maxS };
}

/** A faixa em palavras ("cerca de 3 a 5 min", "menos de 1 min"). Pura (o `t` vem de quem chama). */
export function faixaEmTexto(f: FaixaDeTempo, t: (s: string, v?: Record<string, string | number>) => string): string {
  const min = (s: number) => Math.max(1, Math.round(s / 60));
  if (f.maxS < 60) return t('menos de 1 min');
  if (min(f.minS) === min(f.maxS)) return t('cerca de {n} min', { n: min(f.maxS) });
  return t('cerca de {a} a {b} min', { a: min(f.minS), b: min(f.maxS) });
}

/**
 * O MEDIDOR DO PROGRESSO: recebe o total já baixado (de todos os modelos) a cada aviso e dá a vazão na média móvel
 * de 10 s. Na primeira vez que passa de 256 KB, guarda a vazão para a próxima confirmação.
 */
export class MedidorDeVazao {
  private amostras: Array<{ t: number; bytes: number }> = [];
  private guardou = false;
  private inicio: { t: number; bytes: number } | null = null;

  constructor(private readonly guardar: (mbps: number) => void = guardarVazao) {}

  registrar(bytesBaixados: number, t: number): void {
    this.inicio ??= { t, bytes: bytesBaixados };
    const ultima = this.amostras[this.amostras.length - 1];
    if (ultima && bytesBaixados < ultima.bytes) {
      /* Outro arquivo recomeçou a conta: o medidor recomeça junto. */
      this.amostras = [];
      this.inicio = { t, bytes: bytesBaixados };
    }
    this.amostras.push({ t, bytes: bytesBaixados });
    while (this.amostras.length > 2 && t - this.amostras[0].t > JANELA_MS) this.amostras.shift();
    if (!this.guardou && bytesBaixados - this.inicio.bytes >= AMOSTRA_MINIMA_BYTES && t > this.inicio.t) {
      this.guardou = true;
      this.guardar(mbps(bytesBaixados - this.inicio.bytes, t - this.inicio.t));
    }
  }

  /** A vazão da janela (Mbit/s), ou `null` com menos de 1 s ou 64 KB de amostra. */
  vazao(): number | null {
    if (this.amostras.length < 2) return null;
    const a = this.amostras[0];
    const b = this.amostras[this.amostras.length - 1];
    if (b.t - a.t < 1000 || b.bytes - a.bytes < 64 * 1024) return null;
    return mbps(b.bytes - a.bytes, b.t - a.t);
  }
}
