/**
 * CONCORDÂNCIA E CALIBRAÇÃO — kappa de Cohen (juiz × juiz e juiz × humano) e a planilha que o dono anota. PURO.
 *
 * POR QUE KAPPA E NÃO "% DE ACORDO": se 90% dos critérios passam, dois avaliadores que dizem "sim" a tudo concordam
 * 90% sem ler nada. O kappa desconta o acordo esperado pelo acaso: κ = (pₒ − pₑ)/(1 − pₑ). A regra do plano: o juiz só
 * decide troca de modelo com κ ≥ 0,6 contra o humano (acordo "substancial", Landis & Koch 1977).
 *
 * A PLANILHA é CEGA: traz a entrada, a resposta e a pergunta de cada critério — nunca o modelo nem o veredito do juiz.
 * Formato longo (uma linha por caso × critério, coluna `humano` com 1 ou 0), CSV RFC 4180 para abrir em qualquer
 * planilha. Os vereditos do juiz ficam num JSON ao lado (`calibracao-juiz.json`), pela mesma `chave`.
 */
import { rngComSemente } from '../../src/core/eval/bootstrap.ts'

/**
 * κ de Cohen entre dois avaliadores (mesmos itens, na mesma ordem; valores categóricos — aqui, booleanos). Pares com
 * algum lado `null`/`undefined` saem da conta. Caso degenerado (pₑ = 1: os dois deram SEMPRE a mesma categoria única):
 * κ = 1 se concordaram em tudo — não há acaso a descontar —, e `NaN` com `n = 0`.
 */
export function kappaDeCohen(a, b) {
  if (a.length !== b.length) throw new Error(`kappa: listas de tamanhos diferentes (${a.length} × ${b.length})`)
  const pares = []
  for (let i = 0; i < a.length; i++) if (a[i] != null && b[i] != null) pares.push([a[i], b[i]])
  const n = pares.length
  if (!n) return { kappa: Number.NaN, n: 0, concordancia: Number.NaN, acaso: Number.NaN }
  const cats = [...new Set(pares.flat().map(String))]
  const po = pares.filter(([x, y]) => String(x) === String(y)).length / n
  let pe = 0
  for (const c of cats) {
    const pa = pares.filter(([x]) => String(x) === c).length / n
    const pb = pares.filter(([, y]) => String(y) === c).length / n
    pe += pa * pb
  }
  const kappa = pe >= 1 ? (po === 1 ? 1 : 0) : (po - pe) / (1 - pe)
  return { kappa, n, concordancia: po, acaso: pe }
}

/** A leitura de Landis & Koch, para o relatório. */
export function leituraDoKappa(k) {
  if (!Number.isFinite(k)) return 'sem dados'
  if (k < 0) return 'pior que o acaso'
  if (k < 0.2) return 'leve'
  if (k < 0.4) return 'razoável'
  if (k < 0.6) return 'moderado'
  if (k < 0.8) return 'substancial'
  return 'quase perfeito'
}

// ------------------------------------------------------------------ CSV (RFC 4180)

const escapar = (v) => {
  const s = v == null ? '' : String(v)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function paraCsv(linhas, colunas) {
  return `${[colunas.join(','), ...linhas.map((l) => colunas.map((c) => escapar(l[c])).join(','))].join('\n')}\n`
}

/** CSV → objetos pelo cabeçalho. Aspas duplas, vírgula e quebra de linha dentro de aspas, `""` como aspa. */
export function lerCsv(texto) {
  const linhas = []
  let campo = ''
  let linha = []
  let aspas = false
  const bruto = String(texto ?? '')
  const s = bruto.charCodeAt(0) === 0xfeff ? bruto.slice(1) : bruto // BOM do Excel
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (aspas) {
      if (ch === '"' && s[i + 1] === '"') {
        campo += '"'
        i++
      } else if (ch === '"') aspas = false
      else campo += ch
    } else if (ch === '"') aspas = true
    else if (ch === ',') {
      linha.push(campo)
      campo = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++
      linha.push(campo)
      linhas.push(linha)
      linha = []
      campo = ''
    } else campo += ch
  }
  if (campo || linha.length) {
    linha.push(campo)
    linhas.push(linha)
  }
  const [cab, ...resto] = linhas.filter((l) => l.some((c) => c.trim()))
  if (!cab) return []
  return resto.map((l) => Object.fromEntries(cab.map((c, i) => [c.trim(), l[i] ?? ''])))
}

// ------------------------------------------------------------------ planilha de calibração

export const COLUNAS_DA_PLANILHA = ['chave', 'funcao', 'caso', 'criterio', 'pergunta', 'entrada', 'resposta', 'humano']

/**
 * Escolhe `n` itens julgados para o humano anotar: estratificado por função (na proporção pedida em `cotas`, o resto
 * no fim), embaralhado com semente fixa (reprodutível) e sem repetir caso × sistema. Só entram itens com veredito do
 * juiz (respostas válidas): a inválida não precisa de humano.
 *
 * @param {Array<{chave: string, funcao: string, caso: string, entrada: string, resposta: string,
 *   criterios: Array<{id: string, pergunta: string}>, veredito: Record<string, {veredito: boolean}>}>} itens
 */
export function escolherParaCalibrar(itens, n = 30, cotas = {}, semente = 20261024) {
  const rng = rngComSemente(semente)
  const embaralhar = (xs) => {
    const a = [...xs]
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1))
      ;[a[i], a[j]] = [a[j], a[i]]
    }
    return a
  }
  const porFuncao = new Map()
  for (const it of embaralhar(itens.filter((x) => x.veredito))) {
    if (!porFuncao.has(it.funcao)) porFuncao.set(it.funcao, [])
    porFuncao.get(it.funcao).push(it)
  }
  const escolhidos = []
  for (const [f, lista] of porFuncao) escolhidos.push(...lista.slice(0, cotas[f] ?? 0))
  const resto = embaralhar([...porFuncao.values()].flat().filter((x) => !escolhidos.includes(x)))
  while (escolhidos.length < n && resto.length) escolhidos.push(resto.shift())
  return escolhidos.slice(0, n)
}

/** Os itens escolhidos → linhas da planilha (uma por critério) e o gabarito do juiz pela mesma chave. */
export function montarPlanilha(escolhidos) {
  const linhas = []
  const doJuiz = {}
  for (const it of escolhidos) {
    for (const c of it.criterios) {
      const chave = `${it.chave}#${c.id}`
      linhas.push({
        chave,
        funcao: it.funcao,
        caso: it.caso,
        criterio: c.id,
        pergunta: c.pergunta,
        entrada: it.entrada,
        resposta: it.resposta,
        humano: '',
      })
      doJuiz[chave] = it.veredito[c.id]?.veredito ?? null
    }
  }
  return { linhas, doJuiz }
}

const lerHumano = (v) => {
  const s = String(v ?? '')
    .trim()
    .toLowerCase()
  if (['1', 'sim', 's', 'true', 'x'].includes(s)) return true
  if (['0', 'nao', 'não', 'n', 'false'].includes(s)) return false
  return null
}

/**
 * κ juiz × humano da planilha preenchida: geral e por critério. Linha sem anotação sai da conta; `anotadas` diz
 * quantas ficaram. Sem anotação nenhuma, `kappa` é `NaN` e o relatório diz "planilha não preenchida".
 */
export function kappaDaPlanilha(linhasCsv, doJuiz) {
  const pares = linhasCsv
    .map((l) => ({ criterio: l.criterio, humano: lerHumano(l.humano), juiz: doJuiz[l.chave] ?? null }))
    .filter((p) => p.humano !== null && p.juiz !== null)
  const geral = kappaDeCohen(
    pares.map((p) => p.humano),
    pares.map((p) => p.juiz),
  )
  const porCriterio = {}
  for (const c of new Set(pares.map((p) => p.criterio))) {
    const ps = pares.filter((p) => p.criterio === c)
    porCriterio[c] = kappaDeCohen(
      ps.map((p) => p.humano),
      ps.map((p) => p.juiz),
    )
  }
  return { anotadas: pares.length, total: linhasCsv.length, geral, porCriterio }
}
