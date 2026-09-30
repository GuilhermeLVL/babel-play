/**
 * Peças comuns da bancada de avaliação (STT, tradução, alucinação).
 *
 * Três regras que cada script daqui herda deste arquivo, e que não dependem da boa vontade de quem
 * escrever o próximo:
 *   1. CHAVE NUNCA IMPRESSA. Vem do ambiente, de `.env.local` ou de `.env`, nessa ordem.
 *   2. TETO DE GASTO. Cada chamada paga RESERVA o pior caso num livro-caixa em disco
 *      (`BANCADA_DIR/gasto.json`) ANTES de sair; a que passaria do teto (`BANCADA_TETO_USD`, padrão
 *      5; 3 no workflow da nuvem) não sai, e a bancada PARA — não "avisa e continua".
 *   3. RESPOSTAS EM CACHE. A saída de cada (sistema, caso) fica gravada; re-pontuar com outra métrica
 *      ou refazer o relatório não paga de novo. Só `--refazer` ignora o cache.
 */
import { createHash } from 'node:crypto'
import { createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import path from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

import { LivroCaixa, TetoDeGasto } from './livroCaixa.mjs'

export const BANCADA_DIR =
  process.env.BANCADA_DIR || path.join(process.env.LOCALAPPDATA || process.env.HOME || '.', 'babel-bancada')
export const TETO_USD = Number(process.env.BANCADA_TETO_USD || 5)

const args = process.argv.slice(2)
export const opt = (nome, padrao) => {
  const i = args.indexOf(`--${nome}`)
  return i > -1 && args[i + 1] ? args[i + 1] : padrao
}
export const flag = (nome) => args.includes(`--${nome}`)

/** Lê uma chave sem nunca imprimi-la. */
export function chave(nome) {
  if (process.env[nome]) return process.env[nome]
  for (const arq of ['.env.local', '.env']) {
    try {
      const m = readFileSync(arq, 'utf8').match(new RegExp(`^${nome}=(.+)$`, 'm'))
      if (m && m[1].trim()) return m[1].trim()
    } catch {
      /* ausente é normal */
    }
  }
  throw new Error(`${nome} não encontrada (ambiente, .env.local ou .env)`)
}

/**
 * As chaves que EXISTEM, entre as pedidas — para a bancada pular o provedor sem chave em vez de
 * quebrar. Mesma ordem de `chave()`; o valor nunca é impresso.
 */
export function segredos(nomes) {
  const achados = {}
  for (const nome of nomes) {
    try {
      achados[nome] = chave(nome)
    } catch {
      /* ausente: quem chama decide pular */
    }
  }
  return achados
}

export function lerJsonl(rel) {
  const p = path.isAbsolute(rel) ? rel : path.join(BANCADA_DIR, rel)
  if (!existsSync(p)) throw new Error(`ausente: ${p} — rode antes: python scripts/eval-fala/baixar-bancada.py`)
  return readFileSync(p, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l))
}

export function commitAtual() {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim()
  } catch {
    return null
  }
}

// ---------------------------------------------------------------- livro-caixa
/**
 * O livro-caixa em disco. A regra (reserva ANTES da chamada, acerto depois) está em `livroCaixa.mjs`;
 * aqui fica só o armazém: `BANCADA_DIR/gasto.json`, lido a cada reserva e somado a cada acerto —
 * as etapas do workflow são processos separados e o teto vale para a execução inteira.
 */
const CAIXA = path.join(BANCADA_DIR, 'gasto.json')
function lerCaixa() {
  try {
    return JSON.parse(readFileSync(CAIXA, 'utf8'))
  } catch {
    return { totalUsd: 0, porSistema: {} }
  }
}
const armazemEmDisco = {
  ler: lerCaixa,
  somar: (sistema, usd) => {
    const c = lerCaixa()
    c.totalUsd += usd
    c.porSistema[sistema] = (c.porSistema[sistema] ?? 0) + usd
    mkdirSync(BANCADA_DIR, { recursive: true })
    writeFileSync(CAIXA, JSON.stringify(c, null, 2))
  },
}
let livro = null
const livroDaBancada = () => (livro ??= new LivroCaixa({ tetoUsd: TETO_USD, armazem: armazemEmDisco }))

export { TetoDeGasto }
export function gastoTotal() {
  return lerCaixa().totalUsd
}
/** Registra o gasto de uma chamada JÁ FEITA e lança quando o teto é ultrapassado (sonda de latência). */
export function registrarGasto(sistema, usd) {
  livroDaBancada().registrar(sistema, usd)
}
/** Reserva o pior caso de uma chamada ANTES dela; `TetoDeGasto` se não couber (ver `livroCaixa.mjs`). */
export function reservarGasto(sistema, estimativaUsd) {
  return livroDaBancada().reservar(sistema, estimativaUsd)
}

/**
 * UMA TENTATIVA PAGA, para passar a `comRetentativa`: reserva o pior caso antes de sair, CANCELA
 * quando o provedor recusou (4xx/5xx não são cobrados — e a retentativa reserva de novo), cobra o
 * reservado quando a rede caiu no meio (a chamada pode ter sido cobrada). A resposta ok volta com
 * `r.acertar(usdReal)`, que quem chama DEVE chamar — com `NaN` se não conseguiu ler o custo.
 */
export function tentativaPaga(sistema, estimativaUsd, fazerFetch) {
  return async () => {
    const reserva = reservarGasto(sistema, estimativaUsd)
    let r
    try {
      r = await fazerFetch()
    } catch (e) {
      reserva.acertar(estimativaUsd)
      throw e
    }
    if (!r.ok) {
      reserva.cancelar()
      return r
    }
    r.acertar = (usd) => reserva.acertar(usd)
    return r
  }
}

// ---------------------------------------------------------------- cache
export function cache(nome) {
  const arq = path.join(BANCADA_DIR, 'cache', `${nome.replace(/[^a-zA-Z0-9._-]+/g, '_')}.json`)
  let dados = {}
  try {
    dados = JSON.parse(readFileSync(arq, 'utf8'))
  } catch {
    /* vazio */
  }
  const refazer = flag('refazer')
  let sujo = 0
  return {
    get: (k) => (refazer ? undefined : dados[k]),
    set: (k, v) => {
      dados[k] = v
      if (++sujo % 10 === 0) this_salvar()
    },
    salvar: () => this_salvar(),
  }
  function this_salvar() {
    mkdirSync(path.dirname(arq), { recursive: true })
    writeFileSync(arq, JSON.stringify(dados))
  }
}
export const hash = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16)

// ---------------------------------------------------------------- modelos
/**
 * Baixa um arquivo de modelo para `BANCADA_DIR/cache/modelos/<rel>` — fora do git, e é essa pasta
 * que o `actions/cache` do workflow da bancada guarda entre execuções. Grava em `.parcial` e só
 * renomeia no fim: um download interrompido não passa por modelo inteiro na próxima vez.
 */
export async function baixarModelo(url, rel) {
  const destino = path.join(BANCADA_DIR, 'cache', 'modelos', rel)
  if (existsSync(destino)) return destino
  mkdirSync(path.dirname(destino), { recursive: true })
  const r = await fetch(url, { redirect: 'follow' })
  if (!r.ok || !r.body) throw new Error(`download ${url}: HTTP ${r.status}`)
  const parcial = `${destino}.parcial`
  await pipeline(Readable.fromWeb(r.body), createWriteStream(parcial))
  renameSync(parcial, destino)
  return destino
}

// ---------------------------------------------------------------- áudio
/** Lê WAV PCM 16-bit (a bancada grava tudo em 16 kHz mono). */
export function lerWav(buf) {
  let pos = 12,
    fmt = null,
    dados = null
  while (pos + 8 <= buf.length) {
    const id = buf.toString('ascii', pos, pos + 4)
    const tam = buf.readUInt32LE(pos + 4)
    const corpo = pos + 8
    if (id === 'fmt ')
      fmt = {
        canais: buf.readUInt16LE(corpo + 2),
        taxa: buf.readUInt32LE(corpo + 4),
        bits: buf.readUInt16LE(corpo + 14),
      }
    else if (id === 'data') dados = buf.subarray(corpo, Math.min(corpo + tam, buf.length))
    pos = corpo + tam + (tam % 2)
  }
  if (!fmt || !dados || fmt.bits !== 16 || fmt.taxa !== 16000) throw new Error('esperado WAV PCM16 16 kHz')
  const n = dados.length / 2 / fmt.canais
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    let s = 0
    for (let c = 0; c < fmt.canais; c++) s += dados.readInt16LE((i * fmt.canais + c) * 2)
    out[i] = s / fmt.canais / 32768
  }
  return out
}

/**
 * RITMO por provedor: a camada gratuita da Groq permite 20 requisições/minuto no Whisper e ~8 mil
 * tokens/minuto nos LLMs. Espaçar as chamadas custa menos tempo do que apanhar 429 em rajada.
 * `BANCADA_RPM_<ROTULO>` ajusta (ex.: BANCADA_RPM_STT_groq=19; o padrão de cada provedor está em `nuvem.mjs`).
 */
const ultimoPorRitmo = new Map()
export async function respeitarRitmo(rotulo, rpmPadrao) {
  const rpm = Number(process.env[`BANCADA_RPM_${rotulo}`] || rpmPadrao)
  const intervalo = 60_000 / rpm
  const agora = Date.now()
  const proximo = Math.max(agora, (ultimoPorRitmo.get(rotulo) ?? 0) + intervalo)
  ultimoPorRitmo.set(rotulo, proximo)
  if (proximo > agora) await new Promise((s) => setTimeout(s, proximo - agora))
}

/** A cota DIÁRIA do provedor acabou: parar é a única resposta honesta (esperar horas não é retentativa). */
export class CotaDoProvedor extends Error {}

/**
 * Espera progressiva em 429/5xx/timeout, honrando `retry-after`. Sem isto a bancada mede a cota, não
 * o modelo. Devolve também `ms`: a latência da tentativa que DEU CERTO — a espera de ritmo e as
 * retentativas não entram, senão a "latência" mediria a fila da bancada.
 */
export async function comRetentativa(fn, rotulo) {
  for (let t = 0; ; t++) {
    const inicio = performance.now()
    let r
    try {
      r = await fn()
    } catch (e) {
      if (t < 6 && /timeout|aborted|ECONNRESET|fetch failed/i.test(String(e?.message ?? e))) {
        await new Promise((s) => setTimeout(s, 5000 * (t + 1)))
        continue
      }
      throw e
    }
    if (r.ok) {
      r.ms = performance.now() - inicio
      return r
    }
    if (r.status === 429 || r.status >= 500) {
      const corpo = await r.text()
      if (/per day|\(RPD\)|\(ASD\)|\(TPD\)/i.test(corpo))
        throw new CotaDoProvedor(`${rotulo}: cota diária do provedor esgotada — ${corpo.slice(0, 160)}`)
      if (t < 12) {
        const sug = Number(r.headers.get('retry-after')) * 1000
        const espera = Math.max(
          r.status === 429 ? 5000 : 1000,
          Number.isFinite(sug) && sug > 0 ? Math.min(sug + 500, 90_000) : Math.min(2000 * 2 ** t, 60_000),
        )
        await new Promise((s) => setTimeout(s, espera))
        continue
      }
      throw new Error(`${rotulo}: HTTP ${r.status} ${corpo.slice(0, 200)}`)
    }
    throw new Error(`${rotulo}: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`)
  }
}

/** `nome#N` → { nome, n }: amostra por conjunto sem mudar o nome do cache. */
export function comAmostra(spec) {
  const [nome, n] = spec.split('#')
  return { nome, n: Number(n) || 0 }
}

export function percentis(valores, ps = [0.5, 0.95]) {
  const o = [...valores].filter(Number.isFinite).sort((a, b) => a - b)
  return ps.map((p) => (o.length ? o[Math.min(o.length - 1, Math.floor(p * o.length))] : NaN))
}

export function gravarResultado(nome, dados) {
  const saida = path.join('docs/auditoria/eval/bancada-2026-09', `${nome}.json`)
  mkdirSync(path.dirname(saida), { recursive: true })
  writeFileSync(saida, JSON.stringify({ geradoEm: new Date().toISOString(), commit: commitAtual(), ...dados }, null, 2))
  return saida
}
