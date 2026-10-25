/**
 * CONCORDÂNCIA E CALIBRAÇÃO — kappa de Cohen (juiz × juiz e juiz × humano) e a planilha que um humano LEIGO anota. PURO.
 *
 * POR QUE KAPPA E NÃO "% DE ACORDO": se 90% dos critérios passam, dois avaliadores que dizem "sim" a tudo concordam
 * 90% sem ler nada. O kappa desconta o acordo esperado pelo acaso: κ = (pₒ − pₑ)/(1 − pₑ). A regra do plano: o juiz só
 * decide troca de modelo com κ ≥ 0,6 contra o humano (acordo "substancial", Landis & Koch 1977).
 *
 * A PLANILHA (correção 1 da Fase A):
 *   - CEGA: traz a entrada, a referência escrita pela equipe e a resposta — nunca o modelo nem o veredito dos juízes;
 *   - UMA LINHA POR CASO, uma coluna por critério (vazia para preencher com 1/0; "não se aplica" quando o critério é de
 *     outra função) — o texto longo não se repete;
 *   - CSV com PONTO E VÍRGULA e BOM UTF-8: abre direto no Excel em português, com acento;
 *   - SOBREAMOSTRA o que importa calibrar: vereditos "não atende", discordância entre os juízes e o critério de
 *     gramática (o que mais pesou na rodada 1). Uma amostra uniforme teria quase só "atende" e mediria pouco;
 *   - o veredito comparado é o QUE A DECISÃO USA: a MÉDIA dos dois juízes (1, 0,5 ou 0). O meio a meio ("dividido")
 *     sai do κ principal e é contado à parte.
 */
import { rngComSemente } from '../../src/core/eval/bootstrap.ts'

/**
 * κ de Cohen entre dois avaliadores (mesmos itens, na mesma ordem; valores categóricos — aqui, booleanos). Pares com
 * algum lado `null`/`undefined` saem da conta. Caso degenerado (pₑ = 1: os dois deram SEMPRE a mesma categoria única):
 * κ INDEFINIDO (`NaN`, `indefinido: true`) — não há variação para medir acordo além do acaso; o relatório diz
 * "indefinido" e mostra o acordo bruto. Sem pares, `NaN` com `n = 0`.
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
  if (pe >= 1) return { kappa: Number.NaN, n, concordancia: po, acaso: pe, indefinido: true }
  return { kappa: (po - pe) / (1 - pe), n, concordancia: po, acaso: pe }
}

/** A leitura de Landis & Koch, para o relatório. `NaN` (sem dados ou pₑ = 1) é "indefinido". */
export function leituraDoKappa(k) {
  if (!Number.isFinite(k)) return 'indefinido'
  if (k < 0) return 'pior que o acaso'
  if (k < 0.2) return 'leve'
  if (k < 0.4) return 'razoável'
  if (k < 0.6) return 'moderado'
  if (k < 0.8) return 'substancial'
  return 'quase perfeito'
}

// ------------------------------------------------------------------ CSV (RFC 4180, separador configurável)

const escapar = (v, sep) => {
  const s = v == null ? '' : String(v)
  return s.includes(sep) || /["\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Objetos → CSV. Padrão do Excel pt-BR: ponto e vírgula, BOM UTF-8 e CRLF. */
export function paraCsv(linhas, colunas, { sep = ';', bom = true } = {}) {
  const corpo = [
    colunas.map((c) => escapar(c, sep)).join(sep),
    ...linhas.map((l) => colunas.map((c) => escapar(l[c], sep)).join(sep)),
  ]
  return `${bom ? '﻿' : ''}${corpo.join('\r\n')}\r\n`
}

/**
 * CSV → objetos pelo cabeçalho. Aspas duplas, separador e quebra de linha dentro de aspas, `""` como aspa; BOM
 * ignorado. O separador (`;` ou `,`) é o que mais aparece na linha do cabeçalho — o Excel pode salvar de volta com
 * qualquer um dos dois.
 */
export function lerCsv(texto) {
  const bruto = String(texto ?? '')
  const s = bruto.charCodeAt(0) === 0xfeff ? bruto.slice(1) : bruto
  const cabecalho = s.split(/\r?\n/, 1)[0] ?? ''
  const sep = (cabecalho.match(/;/g) ?? []).length >= (cabecalho.match(/,/g) ?? []).length ? ';' : ','
  const linhas = []
  let campo = ''
  let linha = []
  let aspas = false
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (aspas) {
      if (ch === '"' && s[i + 1] === '"') {
        campo += '"'
        i++
      } else if (ch === '"') aspas = false
      else campo += ch
    } else if (ch === '"') aspas = true
    else if (ch === sep) {
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

export const NAO_SE_APLICA = 'não se aplica'

/** O veredito que a decisão usa: a média dos juízes que julgaram o critério (1, 0,5, 0), ou `null`. */
export function vereditoMedio(vereditos, criterio) {
  const vs = vereditos.map((v) => v?.[criterio]?.veredito).filter((v) => typeof v === 'boolean')
  return vs.length ? vs.filter(Boolean).length / vs.length : null
}

/**
 * Escolhe `n` itens para o humano anotar, SOBREAMOSTRANDO o que mais informa:
 *   1. discordância entre os juízes em algum critério;
 *   2. "não atende" por consenso em algum critério;
 *   3. o critério de gramática reprovado por algum juiz;
 *   e o resto, para não calibrar só nos casos difíceis. Cotas: ~1/3, ~1/3, ~1/6 e o que faltar; embaralhado com
 *   semente fixa (reprodutível), sem repetir item.
 *
 * @param {Array<{chave: string, funcao: string, vereditos: Array<Record<string, {veredito: boolean}>>,
 *   criterios: Array<{id: string}>}>} itens  — `vereditos` = um por juiz.
 */
export function escolherParaCalibrar(itens, n = 30, semente = 20261024) {
  const rng = rngComSemente(semente)
  const embaralhar = (xs) => {
    const a = [...xs]
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1))
      ;[a[i], a[j]] = [a[j], a[i]]
    }
    return a
  }
  const medias = (it) => it.criterios.map((c) => vereditoMedio(it.vereditos, c.id))
  const discorda = (it) => medias(it).some((m) => m !== null && m > 0 && m < 1)
  const reprovaConsenso = (it) => medias(it).some((m) => m === 0)
  const gramatica = (it) => it.vereditos.some((v) => v?.gramatica_correta?.veredito === false)
  const validos = embaralhar(itens.filter((it) => it.vereditos.some(Boolean)))
  const escolhidos = []
  const pegar = (filtro, quantos) => {
    for (const it of validos) {
      if (quantos <= 0 || escolhidos.length >= n) break
      if (!escolhidos.includes(it) && filtro(it)) {
        escolhidos.push(it)
        quantos--
      }
    }
  }
  pegar(discorda, Math.round(n / 3))
  pegar(reprovaConsenso, Math.round(n / 3))
  pegar(gramatica, Math.round(n / 6))
  pegar(() => true, n)
  return escolhidos.slice(0, n)
}

/** As colunas de critério da planilha: a união dos critérios das funções, na ordem em que aparecem. */
export function colunasDeCriterio(escolhidos) {
  const ids = []
  for (const it of escolhidos) for (const c of it.criterios) if (!ids.includes(c.id)) ids.push(c.id)
  return ids
}

export const COLUNAS_FIXAS_DA_PLANILHA = ['chave', 'funcao', 'entrada_e_referencia', 'resposta_a_avaliar']

/**
 * Os escolhidos → linhas da planilha (UMA por caso; critério da função vazio para preencher, o de outra função
 * "não se aplica") e o gabarito dos juízes pela chave `chave#criterio`, com a MÉDIA dos dois.
 */
export function montarPlanilha(escolhidos) {
  const criterios = colunasDeCriterio(escolhidos)
  const linhas = []
  const doJuiz = {}
  for (const it of escolhidos) {
    const linha = {
      chave: it.chave,
      funcao: it.funcao,
      entrada_e_referencia: it.entrada,
      resposta_a_avaliar: it.resposta,
    }
    const daFuncao = new Set(it.criterios.map((c) => c.id))
    for (const c of criterios) {
      linha[c] = daFuncao.has(c) ? '' : NAO_SE_APLICA
      if (daFuncao.has(c)) doJuiz[`${it.chave}#${c}`] = vereditoMedio(it.vereditos, c)
    }
    linhas.push(linha)
  }
  return { linhas, colunas: [...COLUNAS_FIXAS_DA_PLANILHA, ...criterios], doJuiz }
}

const lerHumano = (v) => {
  const s = String(v ?? '')
    .trim()
    .toLowerCase()
  if (['1', 'sim', 's', 'true', 'x', 'atende'].includes(s)) return true
  if (['0', 'nao', 'não', 'n', 'false', 'não atende', 'nao atende'].includes(s)) return false
  return null
}

/**
 * κ juiz × humano da planilha preenchida (uma linha por caso, colunas por critério), contra a MÉDIA dos juízes:
 *   - `geral`/`porCriterio`: só onde os juízes não ficaram divididos (média 1 → atende, 0 → não atende);
 *   - `divididos`: quantos meio a meio havia e em quantos o humano disse "atende".
 * Célula vazia ou "não se aplica" sai da conta; sem anotação nenhuma, `kappa` é `NaN` ("planilha não preenchida").
 */
export function kappaDaPlanilha(linhasCsv, doJuiz) {
  const pares = []
  for (const l of linhasCsv)
    for (const [col, valor] of Object.entries(l)) {
      const chave = `${l.chave}#${col}`
      if (!(chave in doJuiz)) continue
      const humano = lerHumano(valor)
      if (humano === null || doJuiz[chave] === null) continue
      pares.push({ criterio: col, humano, juiz: doJuiz[chave] })
    }
  const decididos = pares.filter((p) => p.juiz === 0 || p.juiz === 1)
  const divididos = pares.filter((p) => p.juiz > 0 && p.juiz < 1)
  const geral = kappaDeCohen(
    decididos.map((p) => p.humano),
    decididos.map((p) => p.juiz === 1),
  )
  const porCriterio = {}
  for (const c of new Set(decididos.map((p) => p.criterio))) {
    const ps = decididos.filter((p) => p.criterio === c)
    porCriterio[c] = kappaDeCohen(
      ps.map((p) => p.humano),
      ps.map((p) => p.juiz === 1),
    )
  }
  return {
    anotadas: pares.length,
    total: Object.keys(doJuiz).length,
    geral,
    porCriterio,
    divididos: { n: divididos.length, humanoDisseAtende: divididos.filter((p) => p.humano).length },
  }
}
