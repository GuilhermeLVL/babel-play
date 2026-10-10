/**
 * BANCADA DE NUVEM PAGA (09/10/2026) — peças comuns: a chave, o retrato do saldo e o teto de gasto.
 *
 * Três regras, que os scripts desta pasta herdam daqui:
 *   1. A CHAVE NUNCA SAI DO PROCESSO. É lida do `.env` do dono em tempo de execução e só entra no
 *      cabeçalho `Authorization`. Nada daqui a imprime; `limpar()` ainda apaga o valor de qualquer
 *      texto que vá para a tela ou para o disco (corpo de erro do provedor, por exemplo). O retrato
 *      de `/api/v1/key` guarda só os números (o campo `label` de lá traz um pedaço da chave).
 *   2. TETO RÍGIDO de US$ 0,30 para a rodada inteira (`TETO_USD`). Cada chamada RESERVA o pior caso
 *      antes de sair (o `LivroCaixa` da bancada de setembro, com armazém próprio em
 *      `docs/auditoria/eval/bancada-2026-10-nuvem/gasto.json`); a que passaria do teto não sai.
 *   3. NO MÁXIMO UMA NOVA TENTATIVA por item (`umaTentativaAMais`). Sem espera progressiva.
 *
 * Nenhum cabeçalho de requisição é gravado em lugar nenhum.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { LivroCaixa, TetoDeGasto } from '../livroCaixa.mjs'

export { TetoDeGasto }

export const BASE = 'https://openrouter.ai/api/v1'
export const TETO_USD = 0.3
export const SAIDA = 'docs/auditoria/eval/bancada-2026-10-nuvem'
export const BRUTO = path.join(SAIDA, 'bruto')
export const BANCADA_DIR =
  process.env.BANCADA_DIR || path.join(process.env.LOCALAPPDATA || process.env.HOME || '.', 'babel-bancada')
/** Onde está a chave do dono. Só este arquivo, só esta variável. */
const ARQUIVO_DA_CHAVE =
  process.env.BANCADA_NUVEM_ENV ||
  path.join(process.env.USERPROFILE || '', 'OneDrive', 'Área de Trabalho', 'babel-play-lab', '.env')
const NOME_DA_CHAVE = 'OPENROUTER_API_KEY'

const args = process.argv.slice(2)
export const opt = (n, p) => {
  const i = args.indexOf(`--${n}`)
  return i > -1 && args[i + 1] ? args[i + 1] : p
}
export const flag = (n) => args.includes(`--${n}`)

let chaveEmMemoria = null
/** A chave, lida uma vez. Nunca imprima o retorno. */
export function chave() {
  if (chaveEmMemoria) return chaveEmMemoria
  let texto
  try {
    texto = readFileSync(ARQUIVO_DA_CHAVE, 'utf8')
  } catch {
    throw new Error('arquivo .env do dono não encontrado')
  }
  const m = texto.match(new RegExp(`^\\s*${NOME_DA_CHAVE}\\s*=\\s*(.+?)\\s*$`, 'm'))
  const valor = m?.[1]?.replace(/^["']|["']$/g, '').trim()
  if (!valor) throw new Error(`${NOME_DA_CHAVE} não está no .env do dono`)
  chaveEmMemoria = valor
  return valor
}
export const autorizacao = () => ({ Authorization: `Bearer ${chave()}` })

/** Tira a chave de qualquer texto antes de imprimir ou gravar. */
export function limpar(texto) {
  let s = String(texto ?? '')
  if (chaveEmMemoria) s = s.split(chaveEmMemoria).join('[chave]')
  return s.replace(/sk-or-[A-Za-z0-9_-]{6,}/g, '[chave]').replace(/Bearer\s+\S+/gi, 'Bearer [chave]')
}

const numero = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/**
 * O retrato de `GET /api/v1/key` (não custa nada): só os NÚMEROS. Grava em `retratos.json` com o
 * rótulo dado (`antes`, `meio`, `depois`…) e devolve.
 */
export async function retratoDaChave(rotulo) {
  const r = await fetch(`${BASE}/key`, { headers: autorizacao() })
  if (!r.ok) throw new Error(`GET /key: HTTP ${r.status} ${limpar(await r.text()).slice(0, 200)}`)
  const d = (await r.json())?.data ?? {}
  const retrato = {
    rotulo,
    em: new Date().toISOString(),
    limit: numero(d.limit),
    usage: numero(d.usage),
    limit_remaining: numero(d.limit_remaining),
    is_free_tier: typeof d.is_free_tier === 'boolean' ? d.is_free_tier : null,
  }
  if (rotulo) {
    mkdirSync(SAIDA, { recursive: true })
    const arq = path.join(SAIDA, 'retratos.json')
    const todos = existsSync(arq) ? JSON.parse(readFileSync(arq, 'utf8')) : []
    todos.push(retrato)
    writeFileSync(arq, JSON.stringify(todos, null, 1))
  }
  return retrato
}

// ---------------------------------------------------------------- livro-caixa (teto de US$ 0,30)
const CAIXA = path.join(SAIDA, 'gasto.json')
function lerCaixa() {
  try {
    return JSON.parse(readFileSync(CAIXA, 'utf8'))
  } catch {
    return { totalUsd: 0, porSistema: {} }
  }
}
const armazem = {
  ler: lerCaixa,
  somar: (sistema, usd) => {
    const c = lerCaixa()
    c.totalUsd += usd
    c.porSistema[sistema] = (c.porSistema[sistema] ?? 0) + usd
    mkdirSync(SAIDA, { recursive: true })
    writeFileSync(CAIXA, JSON.stringify(c, null, 1))
  },
}
export const livro = new LivroCaixa({ tetoUsd: TETO_USD, armazem })
export const gastoTotal = () => lerCaixa().totalUsd

/**
 * Para ANTES do lote se a previsão não couber: gasto já feito + pior caso do lote > teto → erro.
 */
export function conferirLote(nome, piorCasoUsd) {
  const gasto = gastoTotal()
  const cabe = gasto + piorCasoUsd <= TETO_USD
  console.log(
    `  previsão de ${nome}: pior caso US$ ${piorCasoUsd.toFixed(4)}; já gasto US$ ${gasto.toFixed(4)}; teto US$ ${TETO_USD.toFixed(2)} → ${cabe ? 'cabe' : 'NÃO CABE'}`,
  )
  if (!cabe) throw new TetoDeGasto(`${nome}: a previsão passa do teto de US$ ${TETO_USD} — lote não iniciado`)
}

/**
 * Uma chamada paga com no máximo UMA nova tentativa. `fazer()` devolve `{ ok, status, corpo, ms }`.
 * Reserva o pior caso antes de cada tentativa; recusa do provedor (4xx/5xx) cancela a reserva; rede
 * caída no meio cobra o reservado (pode ter sido cobrada). Devolve também quantas tentativas fez.
 */
export async function umaTentativaAMais(sistema, piorCasoUsd, fazer) {
  let ultimoErro = null
  for (let tentativa = 1; tentativa <= 2; tentativa++) {
    const reserva = livro.reservar(sistema, piorCasoUsd)
    let r
    try {
      r = await fazer()
    } catch (e) {
      reserva.acertar(piorCasoUsd)
      ultimoErro = `rede: ${limpar(e?.message ?? e).slice(0, 160)}`
      continue
    }
    if (!r.ok) {
      reserva.cancelar()
      ultimoErro = `HTTP ${r.status} ${limpar(r.corpo).slice(0, 300)}`
      // 4xx que não é 429 não melhora repetindo: para já.
      if (r.status >= 400 && r.status < 500 && r.status !== 429) return { erro: ultimoErro, tentativas: tentativa }
      await new Promise((s) => setTimeout(s, 2000))
      continue
    }
    return { ...r, tentativas: tentativa, acertar: (usd) => reserva.acertar(usd) }
  }
  return { erro: ultimoErro, tentativas: 2 }
}

export function lerJsonl(p) {
  return readFileSync(p, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l))
}

/** Bruto retomável: um JSON por (sistema, conjunto), com os casos por id. */
export function bruto(nome) {
  const arq = path.join(BRUTO, `${nome.replace(/[^a-zA-Z0-9._-]+/g, '_')}.json`)
  let dados = { casos: {} }
  try {
    dados = JSON.parse(readFileSync(arq, 'utf8'))
  } catch {
    /* novo */
  }
  return {
    dados,
    salvar: () => {
      mkdirSync(BRUTO, { recursive: true })
      writeFileSync(arq, JSON.stringify(dados, null, 1))
    },
  }
}

/** Mediana e p90 (posição `floor(p·n)`, como o `percentis` da bancada). */
export function percentis(valores, ps = [0.5, 0.9]) {
  const o = [...valores].filter(Number.isFinite).sort((a, b) => a - b)
  return ps.map((p) => (o.length ? o[Math.min(o.length - 1, Math.floor(p * o.length))] : NaN))
}
