#!/usr/bin/env node
/* global AbortSignal */
/**
 * BANCADA DE DESEMPENHO DA CAPTURA (A0 do plano "grátis sem travar") — a régua que prova, e vigia no
 * CI, os ganhos dos A1–A7: frames longos na thread principal, tempo até a 1ª legenda, RTF p50/p95
 * do STT local, memória de pico, CPU no silêncio e renders/s da tela de captura.
 *
 *   npm run build:estatica
 *   node scripts/perf/latencia-legenda/bancada-captura.mjs [--perfis desktop,fraco] [--rodadas 3]
 *        [--porta 4181] [--saida DIR] [--cache-modelos DIR] [--ambiente NOME]
 *        [--gravar-linha-de-base] [--contra resultado-anterior.json] [--sem-comparar] [--headful]
 *        [--alvos antes=http://127.0.0.1:4182,depois=http://127.0.0.1:4183]
 *
 * O que faz, por perfil de aparelho:
 *  1. monta o áudio do fixture versionado (`tests/fixtures/bancada-captura/fleurs-en-8.json`: 8 falas
 *     em inglês, 4 s de silêncio antes, 20 s depois) — igual em qualquer máquina;
 *  2. sobe o servidor da edição estática numa porta SÓ desta bancada (`_servidor-estatico.mjs`;
 *     recusa porta ocupada: outra worktree serviria o `dist/` dela);
 *  3. uma rodada de AQUECIMENTO num perfil de navegador novo (os pesos vêm do cache em disco,
 *     `--cache-modelos`, e caem no Cache Storage), e N rodadas medidas no mesmo perfil — o regime
 *     de quem já usou o app (pré-aquecimento ao abrir a tela, nada baixado);
 *  4. `metricas-captura.mjs` tira as métricas de cada rodada e a mediana das N; `comparar.mjs`
 *     confere contra `slo-captura.json` do ambiente e sai com 1 se algo piorou.
 *
 * Cenário (o que a rota escolhe o MENOR modelo nos dois perfis, para o CI não demorar): mídia em
 * inglês com legenda em português — "Idioma do conteúdo: English", microfone mudo, áudio do sistema
 * pela sonda. A rota dá Moonshine base q8 (WASM) + opus-mt en→ROMANCE. "Modo desempenho" no de
 * fábrica do aparelho (`--desempenho padrao`).
 *
 * Perfis: `desktop` = o navegador da máquina como está (headless: WebGPU sem adaptador →
 * desktop-sem-gpu); `fraco` = notebook de entrada emulado (`APARELHOS_DA_BANCADA`: sem WebGPU,
 * 2 núcleos, 2 GB, CPU 4× mais lenta pelo CDP).
 *
 * `--alvos` mede builds já servidas (sem subir servidor), com as rodadas INTERCALADAS (A, B, A, B…):
 * a deriva da máquina cai igual nos dois lados. É o antes × depois. Com dois alvos, grava também a
 * tabela `antes-depois.md`.
 *
 * `--gravar-linha-de-base` escreve a base do ambiente em `slo-captura.json` a partir do resultado.
 * A base só vale no MESMO tipo de máquina: a do CI sai de uma execução no Actions
 * (`workflow_dispatch` com `gravar_linha_de_base`), nunca de um desktop.
 */
import { spawn, spawnSync } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { comparar, gravarLinhaDeBase, ruidoEntre, tabelaAntesDepois, tabelaMarkdown, validarSlo } from './comparar.mjs'
import { agregarRodadas, metricasDaRodada } from './metricas-captura.mjs'

const AQUI = path.dirname(fileURLToPath(import.meta.url))
const RAIZ = path.join(AQUI, '..', '..', '..')
const args = process.argv.slice(2)
const opt = (n, d) => {
  const i = args.indexOf(`--${n}`)
  return i > -1 && args[i + 1] !== undefined ? args[i + 1] : d
}
const flag = (n) => args.includes(`--${n}`)

const PERFIS = { desktop: null, fraco: 'fraco' }
const perfis = opt('perfis', 'desktop,fraco').split(',').filter(Boolean)
for (const p of perfis) if (!(p in PERFIS)) throw new Error(`perfil desconhecido: ${p} (${Object.keys(PERFIS)})`)
const RODADAS = Number(opt('rodadas', 3))
const PORTA = Number(opt('porta', 4181))
const carimbo = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
const SAIDA = path.resolve(opt('saida', path.join(os.tmpdir(), 'bancada-captura', carimbo)))
const CACHE_MODELOS = path.resolve(opt('cache-modelos', path.join(os.homedir(), '.cache', 'babel-bancada', 'modelos')))
const AMBIENTE = opt('ambiente', process.env.GITHUB_ACTIONS ? 'ci-ubuntu' : `local-${process.platform}`)
const ARQ_SLO = path.resolve(opt('slo', path.join(AQUI, 'slo-captura.json')))
const FIXTURE = path.join(RAIZ, 'tests', 'fixtures', 'bancada-captura', 'fleurs-en-8.json')
const CENARIO = [
  '--modo',
  'sistema',
  '--eles',
  'en-US',
  '--eu',
  'pt-BR',
  '--desempenho',
  'padrao',
  '--amostra-ms',
  '1000',
  '--retratos',
  '0',
  '--espera-extra',
  '2',
  '--teto',
  '240',
  '--soltar-cpu-no-silencio',
]

const git = (...a) => spawnSync('git', a, { cwd: RAIZ, encoding: 'utf8' }).stdout?.trim() || null
const commit = process.env.GITHUB_SHA?.slice(0, 7) ?? git('rev-parse', '--short', 'HEAD')
const log = (...a) => console.log('[bancada]', ...a)

mkdirSync(path.join(SAIDA, 'rodadas'), { recursive: true })
mkdirSync(path.join(SAIDA, 'metricas'), { recursive: true })

// ---- 1. áudio
const AUDIO_DIR = path.join(SAIDA, 'audio')
{
  const r = spawnSync(
    process.execPath,
    [
      path.join(AQUI, 'montar-audio.mjs'),
      '--idioma',
      'en',
      '--n',
      '8',
      '--fixture',
      FIXTURE,
      '--silencio-inicial',
      '4',
      '--silencio-final',
      '20',
      '--nome',
      'bancada_en',
      '--saida',
      AUDIO_DIR,
    ],
    { stdio: 'inherit' },
  )
  if (r.status !== 0) throw new Error('montar-audio falhou')
}
const ROTEIRO = path.join(AUDIO_DIR, 'bancada_en.json')

// ---- 2. alvos (e o servidor, quando a bancada sobe o seu)
const respondeu = async (url) => {
  try {
    return (await fetch(url, { signal: AbortSignal.timeout(1500) })).ok
  } catch {
    return false
  }
}
let servidor = null
let alvos
if (opt('alvos', '')) {
  alvos = opt('alvos')
    .split(',')
    .map((par) => {
      const [nome, url] = par.split('=')
      return { nome, url }
    })
  for (const a of alvos) if (!(await respondeu(a.url))) throw new Error(`alvo ${a.nome} não responde em ${a.url}`)
} else {
  const url = `http://127.0.0.1:${PORTA}`
  if (await respondeu(url))
    throw new Error(`a porta ${PORTA} já responde: outra worktree pode estar servindo o dist dela; use --porta`)
  if (!existsSync(path.join(RAIZ, 'dist', 'index.html'))) throw new Error('dist/ ausente: rode npm run build:estatica')
  servidor = spawn(
    process.execPath,
    [path.join(RAIZ, 'tests', 'e2e-estatica', '_servidor-estatico.mjs'), String(PORTA)],
    {
      stdio: 'ignore',
    },
  )
  for (let i = 0; i < 100 && !(await respondeu(url)); i++) await new Promise((r) => setTimeout(r, 100))
  if (!(await respondeu(url))) throw new Error('o servidor estático não subiu')
  alvos = [{ nome: 'atual', url }]
}
const encerrar = () => servidor?.kill()
process.on('exit', encerrar)
process.on('SIGINT', () => {
  encerrar()
  process.exit(130)
})

// ---- 3. rodadas
const perfilDoNavegador = {}
const metricas = {} // alvo → perfil → [métricas por rodada]
let uaDoNavegador = null

function rodar(alvo, perfil, rotulo) {
  const chave = `${alvo.nome}.${perfil}`
  perfilDoNavegador[chave] ??= mkdtempSync(path.join(os.tmpdir(), `bq-${perfil}-`))
  const a = [
    path.join(AQUI, 'medir.mjs'),
    '--rotulo',
    rotulo,
    '--audio',
    ROTEIRO,
    '--url',
    alvo.url,
    '--perfil',
    perfilDoNavegador[chave],
    '--saida',
    path.join(SAIDA, 'rodadas'),
    '--cache-modelos',
    CACHE_MODELOS,
    ...CENARIO,
    ...(flag('headful') ? [] : ['--headless']),
    ...(PERFIS[perfil] ? ['--dispositivo', PERFIS[perfil]] : []),
  ]
  log('>>', rotulo)
  const res = spawnSync(process.execPath, a, { stdio: 'inherit', timeout: 10 * 60_000 })
  const arq = path.join(SAIDA, 'rodadas', `${rotulo}.json`)
  if (!existsSync(arq)) return { rotulo, valida: false, motivo: `medir.mjs saiu com ${res.status} sem gravar a rodada` }
  const d = JSON.parse(readFileSync(arq, 'utf8'))
  uaDoNavegador ??= d.ua ?? null
  const m = metricasDaRodada(d)
  writeFileSync(path.join(SAIDA, 'metricas', `${rotulo}.json`), JSON.stringify(m, null, 1))
  if (m.valida)
    log(
      `   ${rotulo}: ${m.modeloStt?.split('/').pop()} · frames>50 ${m.framesLongos.n50} (>100 ${m.framesLongos.n100}, Σ ${m.framesLongos.somaMs} ms) · 1ª legenda ${m.primeiraLegendaMs} ms · RTF p50 ${m.rtf.p50?.toFixed(3)} · memória ${m.memoriaPicoMb} MB · CPU no silêncio ${m.cpuSilencio.processoPct?.toFixed(1)}% · renders/s ${m.rendersPorS.silencio?.toFixed(1)} (silêncio) ${m.rendersPorS.fala?.toFixed(1)} (fala) · trocas de modelo ${m.regulador.trocasDeModelo} · pedidos ao Hub ${m.pedidosAoHub}`,
    )
  else log(`   ${rotulo}: INVÁLIDA — ${m.motivo}`)
  return m
}

const prefixo = (alvo) => (alvos.length > 1 ? `${alvo.nome}.` : '')
for (const perfil of perfis) {
  for (const alvo of alvos) rodar(alvo, perfil, `${prefixo(alvo)}${perfil}.aquecimento`)
  for (let r = 1; r <= RODADAS; r++)
    for (const alvo of alvos) {
      const m = rodar(alvo, perfil, `${prefixo(alvo)}${perfil}.r${r}`)
      ;((metricas[alvo.nome] ??= {})[perfil] ??= []).push(m)
    }
}
encerrar()
for (const dir of Object.values(perfilDoNavegador))
  try {
    rmSync(dir, { recursive: true, force: true })
  } catch {
    /* o Chromium ainda segura algum arquivo (Windows): fica na pasta temporária */
  }

// ---- 4. resultado, comparação
const maquina = {
  so: `${os.type()} ${os.release()}`,
  cpu: os.cpus()[0]?.model?.trim() ?? '?',
  nucleos: os.cpus().length,
  memoriaGb: Math.round(os.totalmem() / 1073741824),
  navegador: uaDoNavegador,
}
const resultados = {}
let faltouRodada = false
for (const alvo of alvos) {
  const perfisDoAlvo = {}
  for (const perfil of perfis) {
    const ag = agregarRodadas(metricas[alvo.nome]?.[perfil] ?? [])
    const modelos = [...new Set((metricas[alvo.nome]?.[perfil] ?? []).map((m) => m.modeloStt).filter(Boolean))]
    perfisDoAlvo[perfil] = {
      ...ag,
      modelos,
      aparelho: metricas[alvo.nome]?.[perfil]?.find((m) => m.perfil)?.perfil ?? null,
    }
    if (ag.rodadas < Math.ceil(RODADAS / 2)) {
      faltouRodada = true
      log(
        `ERRO: ${alvo.nome}/${perfil} com só ${ag.rodadas} de ${RODADAS} rodadas válidas`,
        JSON.stringify(ag.invalidas),
      )
    }
  }
  resultados[alvo.nome] = {
    ambiente: AMBIENTE,
    quando: new Date().toISOString(),
    commit,
    alvo,
    maquina,
    perfis: perfisDoAlvo,
  }
  const nome = alvos.length > 1 ? `resultado-${alvo.nome}.json` : 'resultado.json'
  writeFileSync(path.join(SAIDA, nome), JSON.stringify(resultados[alvo.nome], null, 1))
}

const slo = JSON.parse(readFileSync(ARQ_SLO, 'utf8'))
const errosDoSlo = validarSlo(slo)
if (errosDoSlo.length) throw new Error(`slo-captura.json inválido:\n- ${errosDoSlo.join('\n- ')}`)
const saidaMd = []
const resumo = (texto) => {
  console.log(texto)
  saidaMd.push(texto)
}

if (alvos.length === 2) {
  const [a, b] = alvos
  resumo(`### Antes × depois — ${RODADAS} rodadas intercaladas por perfil (mediana)\n`)
  resumo(tabelaAntesDepois(resultados[a.nome], resultados[b.nome], slo.metricas, { antes: a.nome, depois: b.nome }))
  writeFileSync(path.join(SAIDA, 'antes-depois.md'), saidaMd.join('\n') + '\n')
}

let piorou = false
if (alvos.length === 1) {
  const r = resultados[alvos[0].nome]
  if (flag('gravar-linha-de-base')) {
    const novo = gravarLinhaDeBase(slo, r, AMBIENTE, {
      descricao: `${maquina.so} · ${maquina.cpu} · ${maquina.nucleos} núcleos · ${maquina.memoriaGb} GB · ${maquina.navegador?.match(/Chrome\/[\d.]+/)?.[0] ?? '?'}`,
      medidoEm: r.quando,
      commit,
    })
    writeFileSync(ARQ_SLO, JSON.stringify(novo, null, 2) + '\n')
    log(`linha de base de "${AMBIENTE}" gravada em ${ARQ_SLO}`)
    Object.assign(slo, novo)
  }
  if (!flag('sem-comparar')) {
    const c = comparar(slo, r, AMBIENTE)
    resumo(`### Bancada de desempenho da captura — ambiente \`${AMBIENTE}\`, commit ${commit ?? '?'}\n`)
    resumo(
      `${RODADAS} rodadas por perfil (mediana; RTF sobre as falas somadas). Máquina: ${maquina.cpu}, ${maquina.nucleos} núcleos, ${maquina.memoriaGb} GB.\n`,
    )
    if (c.semBase)
      resumo(
        `Sem linha de base para \`${AMBIENTE}\`: nada foi reprovado. Grave-a com \`--gravar-linha-de-base\` (no Actions: workflow \`desempenho\` com \`gravar_linha_de_base\`).\n`,
      )
    resumo(tabelaMarkdown(c))
    piorou = c.piorou
    writeFileSync(path.join(SAIDA, 'comparacao.md'), saidaMd.join('\n') + '\n')
  }
  if (opt('contra', '')) {
    const outro = JSON.parse(readFileSync(opt('contra'), 'utf8'))
    const ruido = ruidoEntre(outro, r, Object.keys(slo.metricas))
    resumo(`\n### Ruído contra ${opt('contra')} (|a − b| ÷ média)\n`)
    resumo('| perfil | métrica | anterior | agora | ruído |\n|---|---|---|---|---|')
    for (const l of ruido.linhas)
      resumo(
        `| ${l.perfil} | ${slo.metricas[l.metrica]?.rotulo ?? l.metrica} | ${l.a ?? '—'} | ${l.b ?? '—'} | ${l.ruidoPct === null ? '—' : `${l.ruidoPct.toFixed(1)}%`} |`,
      )
  }
}

if (process.env.GITHUB_STEP_SUMMARY && saidaMd.length)
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, saidaMd.join('\n') + '\n')
log('saída em', SAIDA)
if (faltouRodada) process.exit(3)
if (piorou) process.exit(1)
