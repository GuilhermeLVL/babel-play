/**
 * A VISÃO DO DONO (openspec `latencia-publicada-por-aparelho`, tarefa 2.4): a mesma tabela do agregado público MAIS o p95 (só
 * com `N_MIN_P95` falas ou mais) e o tempo de carga do modelo por fase (download, compilação, aquecimento), com a MESMA regra de
 * `insuficiente` do público. Este arquivo (`latencia-dono.json`) NÃO é público: quem o publica o põe atrás de acesso
 * (`docs/runbook.md`, "Latência publicada"). Puro, em `src/core/`.
 */
import {
  agregarLatencia,
  type AmostraDeCelula,
  type CelulaDeLatencia,
  type ClasseDaLatencia,
  CLASSES_DA_LATENCIA,
  N_BALDES_DA_LATENCIA,
  N_MIN,
  N_MIN_P95,
  quantilEmMs,
  somarBaldes,
} from './agregarLatencia';
import { validarLatencia } from './contratoDaLatencia';

export const FASES_DE_CARGA = ['download', 'compilacao', 'aquecimento'] as const;
export type FaseDeCarga = (typeof FASES_DE_CARGA)[number];

/** Contagens somadas de uma (classe, modelo, fase) na janela: os baldes de `captura_carga`. */
export interface AmostraDeCarga {
  classe: string;
  modelo: string;
  fase: string;
  baldes: readonly number[];
}

export interface CelulaDoDono extends CelulaDeLatencia {
  /** Só com `n >= N_MIN_P95`; ausente com amostra menor (o painel diz "amostra pequena"). */
  p95Ms?: number;
}

export interface CargaDeModelo {
  classe: ClasseDaLatencia;
  modelo: string;
  fase: FaseDeCarga;
  n: number;
  estado: 'ok' | 'insuficiente';
  p50Ms?: number;
  p75Ms?: number;
}

export interface LatenciaDoDono {
  v: 1;
  geradoEm: string;
  janelaDias: number;
  celulas: CelulaDoDono[];
  cargas: CargaDeModelo[];
}

/** O alfabeto fechado do modelo (o mesmo do recebimento: id de motor do registro). */
const MODELO = /^[a-z0-9-]{1,40}$/;

export function agregarLatenciaDoDono(
  amostras: readonly AmostraDeCelula[],
  cargas: readonly AmostraDeCarga[],
  hoje: Date,
  janelaDias?: number,
): LatenciaDoDono {
  const publico = agregarLatencia(amostras, hoje, janelaDias);
  /* O p95 vem da soma dos baldes da mesma célula; refaz a soma por (classe, idioma) e pela linha `todos`. */
  const baldesDe = new Map<string, number[]>();
  const classes = new Set<string>(CLASSES_DA_LATENCIA);
  const idiomas = new Set(['pt', 'en', 'es']);
  for (const a of amostras) {
    const classe = classes.has(a.classe) ? a.classe : 'outro';
    const idioma = idiomas.has(a.idioma) ? a.idioma : 'outro';
    for (const k of [`${classe}|${idioma}`, `${classe}|todos`]) {
      baldesDe.set(k, somarBaldes(baldesDe.get(k) ?? [], a.baldes));
    }
  }
  const celulas: CelulaDoDono[] = publico.celulas.map((c) => {
    if (c.estado !== 'ok' || c.n < N_MIN_P95) return c;
    const p95 = quantilEmMs(baldesDe.get(`${c.classe}|${c.idioma}`) ?? [], 0.95);
    return p95 === null ? c : { ...c, p95Ms: p95 };
  });

  const somadas = new Map<string, { classe: ClasseDaLatencia; modelo: string; fase: FaseDeCarga; baldes: number[] }>();
  for (const a of cargas) {
    if (!(FASES_DE_CARGA as readonly string[]).includes(a.fase) || !MODELO.test(a.modelo)) continue;
    const classe = (classes.has(a.classe) ? a.classe : 'outro') as ClasseDaLatencia;
    const chave = `${classe}|${a.modelo}|${a.fase}`;
    const atual = somadas.get(chave);
    const baldes = Array.from({ length: N_BALDES_DA_LATENCIA }, (_, i) => Math.max(0, Math.floor(a.baldes[i] ?? 0)));
    somadas.set(chave, {
      classe,
      modelo: a.modelo,
      fase: a.fase as FaseDeCarga,
      baldes: atual ? somarBaldes(atual.baldes, baldes) : baldes,
    });
  }
  const cargasFinais: CargaDeModelo[] = [...somadas.values()]
    .map((c) => {
      const n = c.baldes.reduce((x, y) => x + y, 0);
      const base = { classe: c.classe, modelo: c.modelo, fase: c.fase, n };
      return n < N_MIN
        ? ({ ...base, estado: 'insuficiente' } as CargaDeModelo)
        : ({
            ...base,
            estado: 'ok',
            p50Ms: quantilEmMs(c.baldes, 0.5)!,
            p75Ms: quantilEmMs(c.baldes, 0.75)!,
          } as CargaDeModelo);
    })
    .sort((a, b) => `${a.classe}|${a.modelo}|${a.fase}`.localeCompare(`${b.classe}|${b.modelo}|${b.fase}`));

  return { v: 1, geradoEm: publico.geradoEm, janelaDias: publico.janelaDias, celulas, cargas: cargasFinais };
}

const ehObjeto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Valida o arquivo do dono: a parte pública pelo contrato do público (com `p95Ms` permitido) e as cargas pelas listas fechadas. */
export function validarLatenciaDoDono(v: unknown): LatenciaDoDono | null {
  if (!ehObjeto(v) || !Array.isArray(v.cargas) || !Array.isArray(v.celulas)) return null;
  const p95 = new Map<string, number>();
  const semP95 = v.celulas.map((c) => {
    if (!ehObjeto(c)) return c;
    const { p95Ms, ...resto } = c;
    if (typeof p95Ms === 'number' && Number.isFinite(p95Ms) && p95Ms >= 0 && p95Ms <= 30000) {
      p95.set(`${String(c.classe)}|${String(c.idioma)}`, p95Ms);
    } else if (p95Ms !== undefined) return null;
    return resto;
  });
  const { cargas, ...resto } = v;
  const base = validarLatencia({ ...resto, celulas: semP95 });
  if (!base) return null;
  const celulas: CelulaDoDono[] = [];
  for (const c of base.celulas) {
    const x = p95.get(`${c.classe}|${c.idioma}`);
    if (x !== undefined && (c.estado !== 'ok' || c.n < N_MIN_P95)) return null;
    celulas.push(x === undefined ? c : { ...c, p95Ms: x });
  }
  const cargasOk: CargaDeModelo[] = [];
  for (const c of cargas as unknown[]) {
    if (!ehObjeto(c)) return null;
    const { classe, modelo, fase, n, estado, p50Ms, p75Ms, ...extra } = c;
    if (Object.keys(extra).length > 0) return null;
    if (!(CLASSES_DA_LATENCIA as readonly unknown[]).includes(classe)) return null;
    if (typeof modelo !== 'string' || !MODELO.test(modelo)) return null;
    if (!(FASES_DE_CARGA as readonly unknown[]).includes(fase)) return null;
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 0) return null;
    if (estado === 'insuficiente') {
      if (p50Ms !== undefined || p75Ms !== undefined) return null;
      cargasOk.push({ classe, modelo, fase, n, estado } as CargaDeModelo);
    } else if (
      estado === 'ok' &&
      typeof p50Ms === 'number' &&
      typeof p75Ms === 'number' &&
      p50Ms >= 0 &&
      p75Ms >= p50Ms &&
      p75Ms <= 30000
    ) {
      cargasOk.push({ classe, modelo, fase, n, estado, p50Ms, p75Ms } as CargaDeModelo);
    } else return null;
  }
  return { v: 1, geradoEm: base.geradoEm, janelaDias: base.janelaDias, celulas, cargas: cargasOk };
}
