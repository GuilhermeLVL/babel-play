#!/usr/bin/env node
/**
 * COMPARA a bancada de desempenho da captura com a LINHA DE BASE de `slo-captura.json`.
 *
 *   node scripts/perf/latencia-legenda/comparar.mjs --resultado resultado.json [--slo slo-captura.json]
 *        [--ambiente ci-ubuntu] [--gravar-linha-de-base] [--commit SHA] [--descricao TEXTO]
 *
 * Imprime uma tabela markdown (o workflow a manda para o `$GITHUB_STEP_SUMMARY`) e sai com código 1
 * quando alguma métrica PIOROU além da tolerância. Sem linha de base para o ambiente, não reprova:
 * avisa e diz como gravá-la — a base só vale no MESMO tipo de máquina (um runner do GitHub não se
 * compara a um desktop), então cada ambiente tem a sua.
 *
 * `--gravar-linha-de-base` reescreve a base do ambiente a partir do resultado (N rodadas, mediana) e
 * mantém a configuração das métricas. O workflow faz isso sob `workflow_dispatch` e publica o arquivo
 * como artefato: quem aprova a base nova é quem a commita.
 *
 * A regra de cada métrica (`sentido`, `toleranciaPct`, `folgaAbs`):
 *   sentido "menor" (menor é melhor): piorou se medido > base × (1 + tol) + folga;
 *   sentido "maior":                  piorou se medido < base × (1 − tol) − folga.
 * A `folgaAbs` existe para as métricas que vivem perto de zero (renders/s no silêncio, frames longos
 * contados): sem ela, 0 → 1 seria +∞%.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SENTIDOS = new Set(['menor', 'maior'])

/** Erros de forma do SLO (lista vazia = válido). */
export function validarSlo(doc) {
  const erros = []
  if (!doc || typeof doc !== 'object') return ['o SLO não é um objeto']
  const metricas = doc.metricas ?? {}
  for (const [nome, cfg] of Object.entries(metricas)) {
    if (!SENTIDOS.has(cfg?.sentido)) erros.push(`métrica "${nome}": sentido "${cfg?.sentido}" (use menor ou maior)`)
    if (typeof cfg?.toleranciaPct !== 'number' || cfg.toleranciaPct < 0)
      erros.push(`métrica "${nome}": toleranciaPct tem de ser um número ≥ 0`)
    if (cfg?.folgaAbs !== undefined && (typeof cfg.folgaAbs !== 'number' || cfg.folgaAbs < 0))
      erros.push(`métrica "${nome}": folgaAbs tem de ser um número ≥ 0`)
  }
  for (const [amb, a] of Object.entries(doc.ambientes ?? {}))
    for (const [perfil, valores] of Object.entries(a?.perfis ?? {}))
      for (const nome of Object.keys(valores ?? {}))
        if (!(nome in metricas)) erros.push(`ambiente "${amb}", perfil "${perfil}": métrica "${nome}" fora da lista`)
  return erros
}

function limiteDe(cfg, base) {
  const tol = (cfg.toleranciaPct ?? 0) / 100
  const folga = cfg.folgaAbs ?? 0
  return cfg.sentido === 'maior' ? base * (1 - tol) - folga : base * (1 + tol) + folga
}

function melhoraDe(cfg, base) {
  const tol = (cfg.toleranciaPct ?? 0) / 100
  const folga = cfg.folgaAbs ?? 0
  return cfg.sentido === 'maior' ? base * (1 + tol) + folga : base * (1 - tol) - folga
}

const finito = (x) => typeof x === 'number' && Number.isFinite(x)

/**
 * Uma linha por perfil do resultado × métrica do SLO. `piorou` = alguma linha piorou.
 * `semBase` = o ambiente não tem linha de base nenhuma.
 */
export function comparar(slo, resultado, ambiente) {
  const baseDoAmbiente = slo.ambientes?.[ambiente]?.perfis ?? null
  const linhas = []
  for (const [perfil, r] of Object.entries(resultado.perfis ?? {})) {
    for (const [metrica, cfg] of Object.entries(slo.metricas ?? {})) {
      const medido = r.metricas?.[metrica]
      const base = baseDoAmbiente?.[perfil]?.[metrica]
      const linha = { perfil, metrica, rotulo: cfg.rotulo ?? metrica, base: base ?? null, medido: medido ?? null }
      if (!finito(base)) linhas.push({ ...linha, status: 'sem-base', limite: null, deltaPct: null })
      else if (!finito(medido))
        linhas.push({ ...linha, status: 'sem-medida', limite: limiteDe(cfg, base), deltaPct: null })
      else {
        const limite = limiteDe(cfg, base)
        const piorou = cfg.sentido === 'maior' ? medido < limite : medido > limite
        const melhorou = cfg.sentido === 'maior' ? medido > melhoraDe(cfg, base) : medido < melhoraDe(cfg, base)
        linhas.push({
          ...linha,
          limite,
          deltaPct: base !== 0 ? ((medido - base) / Math.abs(base)) * 100 : null,
          status: piorou ? 'piorou' : melhorou ? 'melhorou' : 'ok',
        })
      }
    }
  }
  return { ambiente, semBase: !baseDoAmbiente, piorou: linhas.some((l) => l.status === 'piorou'), linhas }
}

/** Número para a tabela: inteiro como está; fração com até 3 casas e vírgula decimal (pt-BR). */
export function formatar(x) {
  if (!finito(x)) return '—'
  if (Number.isInteger(x)) return String(x)
  const casas = Math.abs(x) >= 100 ? 1 : Math.abs(x) >= 10 ? 2 : 3
  return String(Number(x.toFixed(casas))).replace('.', ',')
}

/** Δ% com sinal (o menos tipográfico, como no resto dos relatórios); `—` sem número. */
function pct(d) {
  if (!finito(d)) return '—'
  const r = Math.round(d)
  return r === 0 ? '0%' : `${r > 0 ? '+' : '−'}${Math.abs(r)}%`
}

const SITUACAO = {
  ok: 'ok',
  melhorou: 'melhorou',
  piorou: '**piorou**',
  'sem-base': 'sem base',
  'sem-medida': 'sem medida',
}

export function tabelaMarkdown(comparacao) {
  const cab = ['| perfil | métrica | linha de base | medido | Δ | limite | situação |', '|---|---|---|---|---|---|---|']
  const corpo = comparacao.linhas.map((l) => {
    const delta = pct(l.deltaPct)
    return `| ${l.perfil} | ${l.rotulo} | ${formatar(l.base)} | ${formatar(l.medido)} | ${delta} | ${formatar(l.limite)} | ${SITUACAO[l.status]} |`
  })
  return [...cab, ...corpo].join('\n')
}

/** Arredonda para a base versionada: o bastante para comparar, sem ruído de 12 casas no diff. */
function arredondar(x) {
  const casas = Math.abs(x) >= 100 ? 1 : Math.abs(x) >= 1 ? 2 : 3
  return Number(x.toFixed(casas))
}

/** O SLO com a base do `ambiente` trocada pelo resultado. Puro: quem grava o arquivo é a CLI. */
export function gravarLinhaDeBase(slo, resultado, ambiente, meta = {}) {
  const perfis = {}
  const rodadas = {}
  for (const [perfil, r] of Object.entries(resultado.perfis ?? {})) {
    rodadas[perfil] = r.rodadas
    perfis[perfil] = {}
    for (const metrica of Object.keys(slo.metricas ?? {})) {
      const v = r.metricas?.[metrica]
      if (finito(v)) perfis[perfil][metrica] = arredondar(v)
    }
  }
  return {
    ...slo,
    ambientes: {
      ...(slo.ambientes ?? {}),
      [ambiente]: { ...(slo.ambientes?.[ambiente] ?? {}), ...meta, rodadas, perfis },
    },
  }
}

/**
 * ANTES × DEPOIS (duas builds medidas na mesma máquina, rodadas intercaladas): uma linha por perfil ×
 * métrica do SLO, com o Δ% do depois sobre o antes. `rotulos` = { antes, depois } (ex.: os commits).
 */
export function tabelaAntesDepois(antes, depois, metricas, rotulos = { antes: 'antes', depois: 'depois' }) {
  const perfis = [...new Set([...Object.keys(antes.perfis ?? {}), ...Object.keys(depois.perfis ?? {})])]
  const linhas = [`| perfil | métrica | ${rotulos.antes} | ${rotulos.depois} | Δ |`, '|---|---|---|---|---|']
  for (const perfil of perfis)
    for (const [metrica, cfg] of Object.entries(metricas)) {
      const a = antes.perfis?.[perfil]?.metricas?.[metrica]
      const b = depois.perfis?.[perfil]?.metricas?.[metrica]
      const d = !finito(a) || !finito(b) ? null : a === b ? 0 : a === 0 ? null : ((b - a) / Math.abs(a)) * 100
      linhas.push(`| ${perfil} | ${cfg.rotulo ?? metrica} | ${formatar(a)} | ${formatar(b)} | ${pct(d)} |`)
    }
  return linhas.join('\n')
}

/**
 * RUÍDO entre duas execuções da bancada na mesma máquina: |a − b| ÷ média, por perfil × métrica. É o
 * número do aceite do A0 (≤ 10% nas métricas principais) e o que justifica cada tolerância do SLO.
 */
export function ruidoEntre(a, b, nomes) {
  const perfis = [...new Set([...Object.keys(a.perfis ?? {}), ...Object.keys(b.perfis ?? {})])]
  const linhas = []
  for (const perfil of perfis)
    for (const metrica of nomes) {
      const va = a.perfis?.[perfil]?.metricas?.[metrica]
      const vb = b.perfis?.[perfil]?.metricas?.[metrica]
      if (!finito(va) || !finito(vb)) {
        linhas.push({ perfil, metrica, a: va ?? null, b: vb ?? null, ruidoPct: null })
        continue
      }
      const media = (Math.abs(va) + Math.abs(vb)) / 2
      linhas.push({ perfil, metrica, a: va, b: vb, ruidoPct: media === 0 ? 0 : (Math.abs(va - vb) / media) * 100 })
    }
  const pcts = linhas.map((l) => l.ruidoPct).filter(finito)
  return { linhas, maiorPct: pcts.length ? Math.max(...pcts) : null }
}

// ───────────────────────────── CLI ─────────────────────────────

const AQUI = path.dirname(fileURLToPath(import.meta.url))

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  const opt = (n, d) => {
    const i = args.indexOf(`--${n}`)
    return i > -1 && args[i + 1] !== undefined ? args[i + 1] : d
  }
  const arqSlo = opt('slo', path.join(AQUI, 'slo-captura.json'))
  const arqResultado = opt('resultado')
  if (!arqResultado) throw new Error('--resultado <resultado.json> é obrigatório')
  const slo = JSON.parse(readFileSync(arqSlo, 'utf8'))
  const erros = validarSlo(slo)
  if (erros.length) {
    console.error(`SLO inválido (${arqSlo}):\n- ${erros.join('\n- ')}`)
    process.exit(2)
  }
  const resultado = JSON.parse(readFileSync(arqResultado, 'utf8'))
  const ambiente = opt('ambiente', resultado.ambiente)
  if (!ambiente) throw new Error('--ambiente é obrigatório (ou `ambiente` no resultado)')

  if (args.includes('--gravar-linha-de-base')) {
    const meta = {
      descricao: opt('descricao', slo.ambientes?.[ambiente]?.descricao ?? resultado.maquina ?? ''),
      medidoEm: resultado.quando ?? new Date().toISOString(),
      commit: opt('commit', resultado.commit ?? null),
    }
    const novo = gravarLinhaDeBase(slo, resultado, ambiente, meta)
    writeFileSync(arqSlo, JSON.stringify(novo, null, 2) + '\n')
    console.log(`linha de base de "${ambiente}" gravada em ${arqSlo}`)
  }

  const c = comparar(JSON.parse(readFileSync(arqSlo, 'utf8')), resultado, ambiente)
  console.log(`### Bancada de desempenho da captura — ambiente \`${ambiente}\`\n`)
  if (c.semBase)
    console.log(
      `Sem linha de base para \`${ambiente}\` em \`slo-captura.json\`: nada foi reprovado. Grave-a com ` +
        '`--gravar-linha-de-base` (no Actions: rode o workflow `desempenho` com `gravar_linha_de_base`).\n',
    )
  console.log(tabelaMarkdown(c))
  const piores = c.linhas.filter((l) => l.status === 'piorou')
  if (piores.length) {
    console.log(`\n${piores.length} métrica(s) piorou(aram) além da tolerância.`)
    process.exit(1)
  }
}
