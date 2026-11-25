/**
 * O CONTRATO DO `latencia.json` (`v: 1`; openspec `latencia-publicada-por-aparelho`): validação ESTRITA (listas fechadas, sem
 * campo extra, `insuficiente` sem número), frescor (35 dias) e a escolha da célula do selo. Quem lê o arquivo (app, painel,
 * gerador do site, script de publicação) passa por aqui: arquivo inválido = "sem dado", nunca um número duvidoso na tela.
 */
import {
  type CelulaDeLatencia,
  type ClasseDaLatencia,
  CLASSES_DA_LATENCIA,
  IDADE_MAXIMA_DIAS,
  type IdiomaDaLatencia,
  IDIOMAS_DA_LATENCIA,
  type LatenciaPublicada,
} from './agregarLatencia';

const CAMPOS_DO_ARQUIVO = new Set(['v', 'geradoEm', 'janelaDias', 'celulas']);
const CAMPOS_OK = new Set(['classe', 'idioma', 'n', 'estado', 'p50Ms', 'p75Ms', 'falha']);
const CAMPOS_INSUFICIENTE = new Set(['classe', 'idioma', 'n', 'estado']);
/** Tetos de sanidade: um agregado maior que isto não veio do nosso agregador. */
const MAX_CELULAS = CLASSES_DA_LATENCIA.length * IDIOMAS_DA_LATENCIA.length;
const MAX_MS = 30000;
const DIA_MS = 86_400_000;

const ehObjeto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const soCampos = (o: Record<string, unknown>, permitidos: ReadonlySet<string>): boolean =>
  Object.keys(o).every((k) => permitidos.has(k));
const inteiro = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;
const dentro = (v: unknown, max: number): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max;
const ehClasse = (v: unknown): v is ClasseDaLatencia => (CLASSES_DA_LATENCIA as readonly unknown[]).includes(v);
const ehIdioma = (v: unknown): v is IdiomaDaLatencia => (IDIOMAS_DA_LATENCIA as readonly unknown[]).includes(v);

function celulaValida(v: unknown): CelulaDeLatencia | null {
  if (!ehObjeto(v) || !ehClasse(v.classe) || !ehIdioma(v.idioma) || !inteiro(v.n)) return null;
  const base = { classe: v.classe, idioma: v.idioma, n: v.n };
  if (v.estado === 'insuficiente') {
    return soCampos(v, CAMPOS_INSUFICIENTE) ? { ...base, estado: 'insuficiente' } : null;
  }
  if (v.estado !== 'ok' || !soCampos(v, CAMPOS_OK)) return null;
  if (!dentro(v.p50Ms, MAX_MS) || !dentro(v.p75Ms, MAX_MS) || !dentro(v.falha, 1)) return null;
  if (v.p75Ms < v.p50Ms) return null;
  return { ...base, estado: 'ok', p50Ms: v.p50Ms, p75Ms: v.p75Ms, falha: v.falha };
}

/** O arquivo, se bate com o contrato `v: 1`; senão `null`. Não olha o frescor (veja `arquivoFresco`). */
export function validarLatencia(v: unknown): LatenciaPublicada | null {
  if (!ehObjeto(v) || !soCampos(v, CAMPOS_DO_ARQUIVO) || v.v !== 1) return null;
  if (typeof v.geradoEm !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v.geradoEm)) return null;
  if (Number.isNaN(Date.parse(v.geradoEm))) return null;
  if (!inteiro(v.janelaDias) || v.janelaDias < 1 || v.janelaDias > 365) return null;
  if (!Array.isArray(v.celulas) || v.celulas.length > MAX_CELULAS) return null;
  const celulas: CelulaDeLatencia[] = [];
  const vistas = new Set<string>();
  for (const c of v.celulas) {
    const ok = celulaValida(c);
    if (!ok) return null;
    const chave = `${ok.classe}|${ok.idioma}`;
    if (vistas.has(chave)) return null;
    vistas.add(chave);
    celulas.push(ok);
  }
  return { v: 1, geradoEm: v.geradoEm, janelaDias: v.janelaDias, celulas };
}

/** O arquivo ainda vale? Passou de `IDADE_MAXIMA_DIAS` (ou é de amanhã): não se mostra. */
export function arquivoFresco(l: LatenciaPublicada, agora: Date): boolean {
  const idade = (agora.getTime() - Date.parse(l.geradoEm)) / DIA_MS;
  return idade >= -1 && idade <= IDADE_MAXIMA_DIAS;
}

/**
 * A célula do selo: a da classe do aparelho x idioma de origem; sem idioma (ou sem célula `ok` dele), a linha `todos` da
 * classe. Só devolve célula `ok`: `insuficiente` não vira "estimativa".
 */
export function celulaDoSelo(l: LatenciaPublicada, classe: string, idioma: string | null): CelulaDeLatencia | null {
  const base = (idioma ?? '').toLowerCase().split('-')[0] ?? '';
  const achar = (i: string) =>
    l.celulas.find((c) => c.classe === classe && c.idioma === i && c.estado === 'ok') ?? null;
  return (base ? achar(base) : null) ?? achar('todos');
}

/** Quantas das 15 células (5 classes x pt/en/es) estão `ok`: o critério de ligar a flag é 6 ou mais. */
export const celulasOk = (l: LatenciaPublicada): number =>
  l.celulas.filter(
    (c) => c.estado === 'ok' && c.classe !== 'outro' && (c.idioma === 'pt' || c.idioma === 'en' || c.idioma === 'es'),
  ).length;
