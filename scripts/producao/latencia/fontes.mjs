/**
 * AS DUAS FONTES DA LATÊNCIA DE CAMPO atrás de uma interface só (openspec `latencia-publicada-por-aparelho`, tarefa 1.2):
 *
 *   fonte.ler({ janelaDias }) -> Promise<AmostraDeCelula[]>
 *
 * `AmostraDeCelula` = `{ classe, idioma, baldes: number[9], falas, falhas }`, contagens SOMADAS na janela (o agregador puro de
 * `src/core/latencia/agregarLatencia.ts` faz o resto; aqui só se traduz o formato de cada fonte).
 *
 *  - Prometheus (self-host): histograma `captura_fim_da_fala_ate_legenda_ms_bucket{classe,idioma,le}` (cumulativo; vira
 *    contagem por balde) e os contadores `captura_legenda_falas_total` / `captura_legenda_falhas_total`.
 *  - Analytics Engine (Worker): o SQL do `docs/runbook.md` §3.2, família `captura_latencia` (um ponto por balde não vazio,
 *    `double1` = limite do balde, `double2` = contagem; `blob4` = `balde` | `falas` | `falhas` | `sem_traducao`).
 *
 * O `buscar` (fetch) é injetado: os testes passam respostas gravadas; o script passa o `fetch` global. Credencial só vem do
 * ambiente do Action (nunca de arquivo versionado) e nunca é impressa.
 */
import { LIMITES_DOS_BALDES_MS, N_BALDES_DA_LATENCIA } from '../../../src/core/latencia/agregarLatencia.ts'

const arredondar = (x) => (Number.isFinite(x) && x > 0 ? Math.round(x) : 0)

/** O índice do balde para o limite em ms (o último, "acima de 10 s", é qualquer valor acima do teto); -1 se não é balde. */
export function indiceDoLimite(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return -1
  const i = LIMITES_DOS_BALDES_MS.indexOf(ms)
  if (i !== -1) return i
  return ms > LIMITES_DOS_BALDES_MS.at(-1) ? N_BALDES_DA_LATENCIA - 1 : -1
}

const chave = (classe, idioma) => `${classe}\u0000${idioma}`
function celula(mapa, classe, idioma) {
  const k = chave(classe, idioma)
  let c = mapa.get(k)
  if (!c) {
    c = { classe, idioma, baldes: Array.from({ length: N_BALDES_DA_LATENCIA }, () => 0), falas: 0, falhas: 0 }
    mapa.set(k, c)
  }
  return c
}

/* ------------------------------------------------------------------ Prometheus */

/** Janela em dias como duração do PromQL. */
const duracao = (dias) => `${Math.max(1, Math.floor(dias))}d`

async function consultaInstantanea(buscar, base, consulta) {
  const url = new URL('/api/v1/query', base)
  url.searchParams.set('query', consulta)
  const r = await buscar(url.toString(), { headers: { accept: 'application/json' } })
  if (!r.ok) throw new Error(`Prometheus respondeu ${r.status}`)
  const corpo = await r.json()
  if (corpo?.status !== 'success' || !Array.isArray(corpo?.data?.result))
    throw new Error('resposta do Prometheus fora do formato')
  return corpo.data.result
}

/** Fonte Prometheus: `base` é a URL do servidor (`PROMETHEUS_URL`). */
export function fonteDoPrometheus({ base, buscar = fetch }) {
  return {
    nome: 'prometheus',
    async ler({ janelaDias }) {
      const j = duracao(janelaDias)
      const mapa = new Map()
      /* Histograma cumulativo por `le`: guarda o acumulado por limite e depois subtrai o balde anterior. */
      const acumulado = new Map()
      const series = await consultaInstantanea(
        buscar,
        base,
        `sum by (classe, idioma, le) (increase(captura_fim_da_fala_ate_legenda_ms_bucket[${j}]))`,
      )
      for (const s of series) {
        const { classe, idioma, le } = s.metric ?? {}
        if (typeof classe !== 'string' || typeof idioma !== 'string' || typeof le !== 'string') continue
        const k = chave(classe, idioma)
        const por = acumulado.get(k) ?? { classe, idioma, porLe: new Map() }
        por.porLe.set(le === '+Inf' ? Infinity : Number(le), Number(s.value?.[1]))
        acumulado.set(k, por)
      }
      for (const { classe, idioma, porLe } of acumulado.values()) {
        const c = celula(mapa, classe, idioma)
        let anterior = 0
        const limites = [...LIMITES_DOS_BALDES_MS, Infinity]
        limites.forEach((limite, i) => {
          const cum = porLe.get(limite)
          if (cum === undefined || !Number.isFinite(cum)) return
          c.baldes[i] = arredondar(cum - anterior)
          anterior = Math.max(anterior, cum)
        })
      }
      for (const [metrica, campo] of [
        ['captura_legenda_falas_total', 'falas'],
        ['captura_legenda_falhas_total', 'falhas'],
      ]) {
        const r = await consultaInstantanea(buscar, base, `sum by (classe, idioma) (increase(${metrica}[${j}]))`)
        for (const s of r) {
          const { classe, idioma } = s.metric ?? {}
          if (typeof classe !== 'string' || typeof idioma !== 'string') continue
          celula(mapa, classe, idioma)[campo] = arredondar(Number(s.value?.[1]))
        }
      }
      return [...mapa.values()]
    },
    /** Tempo de carga do modelo por classe, modelo e fase (`captura_carga_modelo_ms`), só para a visão do dono. */
    async lerCargas({ janelaDias }) {
      const series = await consultaInstantanea(
        buscar,
        base,
        `sum by (classe, modelo, fase, le) (increase(captura_carga_modelo_ms_bucket[${duracao(janelaDias)}]))`,
      )
      const grupos = new Map()
      for (const s of series) {
        const { classe, modelo, fase, le } = s.metric ?? {}
        if ([classe, modelo, fase, le].some((x) => typeof x !== 'string')) continue
        const k = [classe, modelo, fase].join('\u0000')
        const g = grupos.get(k) ?? { classe, modelo, fase, porLe: new Map() }
        g.porLe.set(le === '+Inf' ? Infinity : Number(le), Number(s.value?.[1]))
        grupos.set(k, g)
      }
      return [...grupos.values()].map(({ porLe, ...resto }) => ({ ...resto, baldes: baldesDoCumulativo(porLe) }))
    },
  }
}

/** O histograma cumulativo por `le` vira contagem por balde. */
function baldesDoCumulativo(porLe) {
  const baldes = Array.from({ length: N_BALDES_DA_LATENCIA }, () => 0)
  let anterior = 0
  ;[...LIMITES_DOS_BALDES_MS, Infinity].forEach((limite, i) => {
    const cum = porLe.get(limite)
    if (cum === undefined || !Number.isFinite(cum)) return
    baldes[i] = arredondar(cum - anterior)
    anterior = Math.max(anterior, cum)
  })
  return baldes
}

/* ------------------------------------------------------------------ Analytics Engine */

/** O SQL do `docs/runbook.md` §3.2, uma linha por (classe, idioma, tipo, limite) com a contagem ponderada pela amostragem. */
export function sqlDoAnalyticsEngine({ dataset, janelaDias }) {
  if (!/^[A-Za-z0-9_]{1,64}$/.test(dataset)) throw new Error('nome de dataset inválido')
  const dias = Math.max(1, Math.floor(janelaDias))
  return (
    `SELECT blob2 AS classe, blob3 AS idioma, blob4 AS tipo, double1 AS limite_ms, SUM(double2 * _sample_interval) AS q ` +
    `FROM ${dataset} WHERE blob1 = 'captura_latencia' AND timestamp > NOW() - INTERVAL '${dias}' DAY ` +
    `GROUP BY classe, idioma, tipo, limite_ms FORMAT JSON`
  )
}

/** Fonte Analytics Engine: `conta` e `token` vêm do ambiente do Action (`CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`). */
export function fonteDoAnalyticsEngine({ conta, token, dataset = 'frasy_metricas', buscar = fetch }) {
  async function consultar(sql) {
    if (!/^[a-f0-9]{32}$/i.test(conta ?? '')) throw new Error('CLOUDFLARE_ACCOUNT_ID ausente ou inválido')
    if (!token) throw new Error('CLOUDFLARE_API_TOKEN ausente')
    const r = await buscar(`https://api.cloudflare.com/client/v4/accounts/${conta}/analytics_engine/sql`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'text/plain' },
      body: sql,
    })
    if (!r.ok) throw new Error(`Analytics Engine respondeu ${r.status}`)
    const corpo = await r.json()
    if (!Array.isArray(corpo?.data)) throw new Error('resposta do Analytics Engine fora do formato')
    return corpo
  }
  return {
    nome: 'analytics-engine',
    async ler({ janelaDias }) {
      const corpo = await consultar(sqlDoAnalyticsEngine({ dataset, janelaDias }))
      const mapa = new Map()
      for (const l of corpo.data) {
        if (typeof l?.classe !== 'string' || typeof l?.idioma !== 'string') continue
        const q = arredondar(Number(l.q))
        if (q === 0) continue
        const c = celula(mapa, l.classe, l.idioma)
        if (l.tipo === 'balde') {
          const i = indiceDoLimite(Number(l.limite_ms))
          if (i !== -1) c.baldes[i] += q
        } else if (l.tipo === 'falas') c.falas += q
        else if (l.tipo === 'falhas') c.falhas += q
      }
      return [...mapa.values()]
    },
    async lerCargas({ janelaDias }) {
      if (!/^[A-Za-z0-9_]{1,64}$/.test(dataset)) throw new Error('nome de dataset inválido')
      const dias = Math.max(1, Math.floor(janelaDias))
      const sql =
        `SELECT blob2 AS classe, blob3 AS modelo, blob4 AS fase, double1 AS limite_ms, SUM(double2 * _sample_interval) AS q ` +
        `FROM ${dataset} WHERE blob1 = 'captura_carga' AND timestamp > NOW() - INTERVAL '${dias}' DAY ` +
        `GROUP BY classe, modelo, fase, limite_ms FORMAT JSON`
      const corpo = await consultar(sql)
      const grupos = new Map()
      for (const l of corpo.data) {
        if ([l?.classe, l?.modelo, l?.fase].some((x) => typeof x !== 'string')) continue
        const q = arredondar(Number(l.q))
        const i = indiceDoLimite(Number(l.limite_ms))
        if (q === 0 || i === -1) continue
        const k = [l.classe, l.modelo, l.fase].join('\u0000')
        const g = grupos.get(k) ?? {
          classe: l.classe,
          modelo: l.modelo,
          fase: l.fase,
          baldes: Array.from({ length: N_BALDES_DA_LATENCIA }, () => 0),
        }
        g.baldes[i] += q
        grupos.set(k, g)
      }
      return [...grupos.values()]
    },
  }
}

/** Fonte de arquivo: um dump local (`AmostraDeCelula[]` em JSON), para o `--dry-run` e para os testes. */
export function fonteDeArquivo({ amostras, cargas = /** @type {any[]} */ ([]) }) {
  return { nome: 'arquivo', ler: async () => amostras, lerCargas: async () => cargas }
}
