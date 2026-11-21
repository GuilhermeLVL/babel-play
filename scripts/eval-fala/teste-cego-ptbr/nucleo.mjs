/**
 * NÚCLEO PURO DO TESTE CEGO pt-BR (openspec `traducao-local-por-direcao`, D4): sorteio, distribuição, CSV, kappa, IC e
 * veredito. Sem rede, sem disco, sem relógio: `gerar.mjs` e `apurar.mjs` só leem e gravam arquivos em volta destas funções.
 *
 * O PROTOCOLO É O DADO: tudo que muda o resultado (nº de frases, sistemas, semente, avaliadores, repetição, limiares) vai no
 * objeto `protocolo`, cujo sha256 (`hashDoProtocolo`) é gravado no gabarito e carimbado em cada planilha (`lote`). Mudou o
 * protocolo depois de gerar = lote diferente = a rodada não vale (`conferirLote`).
 */
import { createHash } from 'node:crypto'

import { bootstrap, bootstrapPareado, mediaEm, rngComSemente } from '../../../src/core/eval/bootstrap.ts'

export const VARIANTES = ['brasileiro', 'portugal', 'indeterminado']

/** Limiares do spec (D4): escritos aqui UMA vez e levados ao protocolo (e ao hash). */
export const LIMIARES = {
  ptPtMaximo: 0.1, // (i) pt-PT em < 10% das frases, por avaliador e na união
  faixaInconclusivaDe: 0.08, // 8–12% com o IC cruzando o limite = inconclusivo
  faixaInconclusivaAte: 0.12,
  kappaMinimo: 0.4, // abaixo disso a rodada é inválida
}

export const PROTOCOLO_PADRAO = {
  versao: 1,
  frasesDeConversa: 50,
  frasesDeTextoLimpo: 50,
  repeticaoEntreAvaliadores: 20, // FRASES (com todas as saídas dos sistemas) que todos os avaliadores veem
  avaliadores: 2,
  semente: 20261121,
  controle: 'local:opus-mt',
  limiares: LIMIARES,
}

const ordenarChaves = (v) =>
  Array.isArray(v)
    ? v.map(ordenarChaves)
    : v && typeof v === 'object'
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, ordenarChaves(v[k])]),
        )
      : v

export const hashDoProtocolo = (protocolo) =>
  createHash('sha256')
    .update(JSON.stringify(ordenarChaves(protocolo)))
    .digest('hex')

/** O carimbo curto que vai em cada planilha. */
export const loteDoProtocolo = (protocolo) => hashDoProtocolo(protocolo).slice(0, 12)

/** Embaralha uma cópia (Fisher–Yates) com o gerador dado. */
export function embaralhar(lista, rng) {
  const a = [...lista]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/**
 * As frases elegíveis a partir dos brutos da bancada (`mt_*.json`): as que TODOS os sistemas traduziram, sem erro e sem
 * texto vazio. `tipo`: `gold:` = conversa/legenda; `fleurs:` e `wmt:` = texto limpo. Chave = `corpus|id`.
 * `brutos` = lista de `{ resultados: [{ sistema, corpus, casos: [{ id, origem, hipotese, erro }] }] }`.
 */
export function frasesElegiveis(brutos, sistemas) {
  const porFrase = new Map()
  for (const b of brutos)
    for (const r of b.resultados ?? [])
      for (const c of r.casos ?? []) {
        if (!sistemas.includes(r.sistema) || c.erro || !String(c.hipotese ?? '').trim()) continue
        const tipo = r.corpus.startsWith('gold:') ? 'conversa' : /^(fleurs|wmt):/.test(r.corpus) ? 'limpo' : null
        if (!tipo) continue
        const chave = `${r.corpus}|${c.id}`
        const f = porFrase.get(chave) ?? { chave, corpus: r.corpus, tipo, origem: c.origem, saidas: {} }
        f.saidas[r.sistema] = c.hipotese.trim()
        porFrase.set(chave, f)
      }
  return [...porFrase.values()].filter((f) => sistemas.every((s) => f.saidas[s]))
}

/** Sorteia as frases do teste: `n` de cada tipo, ordem estável pela semente. Falta de frases = erro claro. */
export function escolherFrases(elegiveis, protocolo) {
  const rng = rngComSemente(protocolo.semente)
  const escolhidas = []
  for (const [tipo, n] of [
    ['conversa', protocolo.frasesDeConversa],
    ['limpo', protocolo.frasesDeTextoLimpo],
  ]) {
    const doTipo = [...elegiveis.filter((f) => f.tipo === tipo)].sort((a, b) => a.chave.localeCompare(b.chave))
    if (doTipo.length < n)
      throw new Error(
        `faltam frases de ${tipo}: há ${doTipo.length} elegíveis (todos os sistemas, sem erro) e o protocolo pede ${n}`,
      )
    escolhidas.push(...embaralhar(doTipo, rng).slice(0, n))
  }
  return escolhidas
}

/**
 * Distribui por FRASE (todas as saídas de uma frase vão ao mesmo avaliador: a comparação entre sistemas fica dentro do
 * mesmo julgador). `repeticaoEntreAvaliadores` frases vão a TODOS (base do kappa); o resto, a um só, em rodízio.
 * Devolve, por avaliador, a lista de itens JÁ EMBARALHADA (ordem própria) e o rótulo oculto de cada item no gabarito.
 */
export function montarLote(frases, sistemas, protocolo) {
  if (protocolo.avaliadores < 2) throw new Error('o teste cego pede no mínimo 2 avaliadores')
  if (protocolo.repeticaoEntreAvaliadores > frases.length) throw new Error('mais frases repetidas do que frases')
  const rng = rngComSemente(protocolo.semente + 1)
  const ordem = embaralhar(frases, rng)
  const repetidas = ordem.slice(0, protocolo.repeticaoEntreAvaliadores)
  const resto = ordem.slice(protocolo.repeticaoEntreAvaliadores)

  const itens = {} // id opaco → dados (gabarito)
  let contador = 0
  const itensDaFrase = new Map()
  const idsOpacos = embaralhar(
    Array.from({ length: frases.length * sistemas.length }, (_, i) => i),
    rng,
  )
  for (const f of ordem)
    itensDaFrase.set(
      f.chave,
      sistemas.map((sistema) => {
        const id = `i${String(idsOpacos[contador++]).padStart(4, '0')}`
        itens[id] = {
          frase: f.chave,
          tipo: f.tipo,
          corpus: f.corpus,
          sistema,
          origem: f.origem,
          traducao: f.saidas[sistema],
        }
        return id
      }),
    )

  const doAvaliador = Array.from({ length: protocolo.avaliadores }, () => [])
  for (const f of repetidas) for (const lista of doAvaliador) lista.push(...itensDaFrase.get(f.chave))
  resto.forEach((f, i) => doAvaliador[i % protocolo.avaliadores].push(...itensDaFrase.get(f.chave)))

  const avaliadores = doAvaliador.map((ids, k) => ({
    id: `A${k + 1}`,
    itens: embaralhar(ids, rngComSemente(protocolo.semente + 100 + k)),
  }))
  return { itens, avaliadores, repetidas: repetidas.map((f) => f.chave) }
}

// ---------------------------------------------------------------- CSV (RFC 4180, o suficiente)
export function escreverCsv(linhas) {
  const q = (v) => {
    const s = String(v ?? '')
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return `${linhas.map((l) => l.map(q).join(',')).join('\n')}\n`
}

export function lerCsv(texto) {
  const linhas = []
  let campo = ''
  let linha = []
  let aspas = false
  const t = texto.replace(/^\uFEFF/, '')
  for (let i = 0; i < t.length; i++) {
    const c = t[i]
    if (aspas) {
      if (c === '"' && t[i + 1] === '"') {
        campo += '"'
        i++
      } else if (c === '"') aspas = false
      else campo += c
    } else if (c === '"') aspas = true
    else if (c === ',') {
      linha.push(campo)
      campo = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++
      linha.push(campo)
      campo = ''
      if (linha.some((x) => x !== '')) linhas.push(linha)
      linha = []
    } else campo += c
  }
  if (campo !== '' || linha.length) {
    linha.push(campo)
    if (linha.some((x) => x !== '')) linhas.push(linha)
  }
  return linhas
}

export const CABECALHO_DA_PLANILHA = ['lote', 'item', 'frase_em_ingles', 'traducao', 'variante', 'naturalidade_1a5']

/** A planilha do avaliador: SEM o sistema, SEM o corpus, SEM a ordem do gabarito (só o item opaco). */
export function planilhaDoAvaliador(lote, avaliador, itens) {
  return escreverCsv([
    CABECALHO_DA_PLANILHA,
    ...avaliador.itens.map((id) => [lote, id, itens[id].origem, itens[id].traducao, '', '']),
  ])
}

// ---------------------------------------------------------------- estatística
/** Intervalo de Wilson (95%) para uma proporção k/n. */
export function wilson(k, n, z = 1.96) {
  if (n === 0) return { p: NaN, ic95: [NaN, NaN] }
  const p = k / n
  const d = 1 + (z * z) / n
  const centro = (p + (z * z) / (2 * n)) / d
  const meia = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d
  return { p, ic95: [Math.max(0, centro - meia), Math.min(1, centro + meia)] }
}

/** Kappa de Cohen entre dois avaliadores nos mesmos itens: `pares` = [[rótuloA, rótuloB], …]. */
export function kappaDeCohen(pares, categorias = VARIANTES) {
  const n = pares.length
  if (n === 0) return NaN
  const observada = pares.filter(([a, b]) => a === b).length / n
  let esperada = 0
  for (const c of categorias) {
    const pa = pares.filter(([a]) => a === c).length / n
    const pb = pares.filter(([, b]) => b === c).length / n
    esperada += pa * pb
  }
  // Os dois só usaram uma categoria: concordância total é kappa 1; senão, indefinido (tratado como 0).
  if (esperada === 1) return observada === 1 ? 1 : 0
  return (observada - esperada) / (1 - esperada)
}

/**
 * A proporção de pt-PT (por sistema) com as marcas por avaliador e na união (cada marca é uma observação).
 * `respostas` = [{ avaliador, item, variante, naturalidade }].
 */
export function proporcaoPtPt(respostas, itens, sistema) {
  const doSistema = respostas.filter((r) => itens[r.item].sistema === sistema)
  const conta = (lista) => ({ k: lista.filter((r) => r.variante === 'portugal').length, n: lista.length })
  const porAvaliador = Object.fromEntries(
    [...new Set(doSistema.map((r) => r.avaliador))].map((a) => [a, conta(doSistema.filter((r) => r.avaliador === a))]),
  )
  return { uniao: conta(doSistema), porAvaliador }
}

/** Kappa médio entre os pares de avaliadores nos itens que os dois marcaram (as frases repetidas). */
export function kappaDaRodada(respostas) {
  const avaliadores = [...new Set(respostas.map((r) => r.avaliador))].sort()
  const por = Object.fromEntries(
    avaliadores.map((a) => [a, new Map(respostas.filter((r) => r.avaliador === a).map((r) => [r.item, r.variante]))]),
  )
  const ks = []
  let comuns = 0
  for (let i = 0; i < avaliadores.length; i++)
    for (let j = i + 1; j < avaliadores.length; j++) {
      const pares = [...por[avaliadores[i]]]
        .filter(([item]) => por[avaliadores[j]].has(item))
        .map(([item, v]) => [v, por[avaliadores[j]].get(item)])
      if (pares.length === 0) continue
      comuns = Math.max(comuns, pares.length)
      ks.push(kappaDeCohen(pares))
    }
  return { kappa: ks.length ? ks.reduce((s, k) => s + k, 0) / ks.length : NaN, itensEmComum: comuns, pares: ks.length }
}

/** Naturalidade (1–5) por sistema, média por frase entre os avaliadores; diferença pareada contra o controle. */
export function naturalidade(respostas, itens, sistemas, controle) {
  const porFrase = {} // frase → sistema → [notas]
  for (const r of respostas) {
    const it = itens[r.item]
    ;((porFrase[it.frase] ??= {})[it.sistema] ??= []).push(r.naturalidade)
  }
  const media = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length
  const out = {}
  for (const s of sistemas) {
    const frases = Object.keys(porFrase).filter((f) => porFrase[f][s])
    const valores = frases.map((f) => media(porFrase[f][s]))
    const ic = bootstrap(valores.length, mediaEm(valores))
    out[s] = { n: valores.length, media: ic.valor, ic95: ic.ic95 }
    if (s !== controle) {
      const comuns = frases.filter((f) => porFrase[f][controle])
      const a = comuns.map((f) => media(porFrase[f][s]))
      const b = comuns.map((f) => media(porFrase[f][controle]))
      const d = comuns.length >= 2 ? bootstrapPareado(comuns.length, mediaEm(a), mediaEm(b)) : null
      out[s].contraOControle = d && {
        n: comuns.length,
        diferenca: d.valor,
        ic95: d.ic95,
        significativo: d.significativo,
      }
    }
  }
  return out
}

/**
 * O VEREDITO de um sistema candidato (D4). Entradas já calculadas:
 *   ptPt: { uniao:{k,n}, porAvaliador:{A1:{k,n}…} }, kappa, naturalidade (contraOControle), qualidade:
 *   { chrf:{ 'fleurs:en-pt':{ic95}, 'gold:en-pt':{ic95} } | null, comet: idem | null }.
 *
 *   invalida      kappa < 0,4 (a rodada não decide nada);
 *   reprovado     pt-PT > 12% na união, ou pt-PT ≥ 10% com o IC inteiro acima de 10%, ou qualquer par/métrica pior no IC 95%
 *                 (IC inteiro abaixo de 0), ou naturalidade pior no IC 95%;
 *   inconclusivo  pt-PT entre 8% e 12% com o IC cruzando 10%, ou um avaliador ≥ 10% sem a união reprovar, ou COMET (ou
 *                 chrF++) não informado — não se aprova no escuro;
 *   aprovado      pt-PT < 8% na união e < 10% por avaliador, e (ii) e (iii) sem piora no IC 95%.
 */
export function veredito({ ptPt, kappa, naturalidade: nat, qualidade }, limiares = LIMIARES) {
  const motivos = []
  if (!(kappa >= limiares.kappaMinimo)) {
    return {
      veredito: 'invalida',
      motivos: [
        `kappa ${Number.isFinite(kappa) ? kappa.toFixed(2) : 'indefinido'} < ${limiares.kappaMinimo}: a rodada não decide nada`,
      ],
    }
  }
  const w = wilson(ptPt.uniao.k, ptPt.uniao.n)
  const p = w.p
  const limite = limiares.ptPtMaximo
  const piorQueOControle = []
  for (const [metrica, porCorpus] of Object.entries(qualidade ?? {}))
    for (const [corpus, v] of Object.entries(porCorpus ?? {}))
      if (v && v.ic95[1] < 0) piorQueOControle.push(`${metrica} em ${corpus}`)
  if (nat?.contraOControle && nat.contraOControle.ic95[1] < 0) piorQueOControle.push('naturalidade')

  let reprova = false
  if (p > limiares.faixaInconclusivaAte) {
    reprova = true
    motivos.push(`pt-PT ${(p * 100).toFixed(1)}% > ${limiares.faixaInconclusivaAte * 100}% na união`)
  } else if (p >= limite && w.ic95[0] >= limite) {
    reprova = true
    motivos.push(`pt-PT ${(p * 100).toFixed(1)}% com o IC inteiro ≥ ${limite * 100}%`)
  }
  if (piorQueOControle.length) {
    reprova = true
    motivos.push(`pior que o controle no IC 95%: ${piorQueOControle.join(', ')}`)
  }
  if (reprova) return { veredito: 'reprovado', motivos }

  let inconclusivo = false
  const naFaixa =
    p >= limiares.faixaInconclusivaDe && p <= limiares.faixaInconclusivaAte && w.ic95[0] < limite && w.ic95[1] > limite
  if (naFaixa) {
    inconclusivo = true
    motivos.push(
      `pt-PT ${(p * 100).toFixed(1)}% na faixa ${limiares.faixaInconclusivaDe * 100}–${limiares.faixaInconclusivaAte * 100}% com o IC cruzando ${limite * 100}%`,
    )
  }
  const altos = Object.entries(ptPt.porAvaliador).filter(([, v]) => v.n > 0 && v.k / v.n >= limite)
  if (altos.length) {
    inconclusivo = true
    motivos.push(`avaliador com pt-PT ≥ ${limite * 100}%: ${altos.map(([a]) => a).join(', ')}`)
  }
  if (p >= limiares.faixaInconclusivaDe && !naFaixa && !altos.length) {
    inconclusivo = true
    motivos.push(`pt-PT ${(p * 100).toFixed(1)}% não está claramente abaixo de ${limiares.faixaInconclusivaDe * 100}%`)
  }
  for (const metrica of ['comet', 'chrf']) {
    const m = qualidade?.[metrica]
    if (!m || !Object.keys(m).length) {
      inconclusivo = true
      motivos.push(`${metrica === 'comet' ? 'COMET' : 'chrF++'} não informado`)
    }
  }
  if (!nat?.contraOControle) {
    inconclusivo = true
    motivos.push('naturalidade pareada indisponível')
  }
  if (inconclusivo) return { veredito: 'inconclusivo', motivos }
  return {
    veredito: 'aprovado',
    motivos: [
      `pt-PT ${(p * 100).toFixed(1)}% (IC ${(w.ic95[0] * 100).toFixed(1)}–${(w.ic95[1] * 100).toFixed(1)}%), kappa ${kappa.toFixed(2)}, sem piora no IC 95%`,
    ],
  }
}

/** O lote da planilha tem de ser o do protocolo gravado no gabarito, e o gabarito tem de bater com o próprio hash. */
export function conferirLote(gabarito, loteDaPlanilha) {
  const hash = hashDoProtocolo(gabarito.protocolo)
  if (hash !== gabarito.protocoloSha256)
    throw new Error(
      'o protocolo do gabarito mudou depois de gerado (sha256 não confere): a rodada não vale como decisão',
    )
  if (loteDaPlanilha !== hash.slice(0, 12))
    throw new Error(
      `a planilha é do lote ${loteDaPlanilha}, o gabarito é do lote ${hash.slice(0, 12)}: protocolo alterado, a rodada não vale`,
    )
}

/** Lê as respostas de UMA planilha preenchida e valida cada linha contra o gabarito. */
export function lerRespostas(csv, avaliador, gabarito) {
  const linhas = lerCsv(csv)
  const [cab, ...corpo] = linhas
  if (!cab || cab.join(',') !== CABECALHO_DA_PLANILHA.join(','))
    throw new Error(`${avaliador.id}: cabeçalho da planilha diferente do esperado`)
  const meus = new Set(avaliador.itens)
  const vistos = new Set()
  const respostas = []
  const problemas = []
  for (const [lote, item, , , variante, nota] of corpo) {
    conferirLote(gabarito, lote)
    if (!meus.has(item)) {
      problemas.push(`${avaliador.id}: item ${item} não é desta planilha`)
      continue
    }
    if (vistos.has(item)) {
      problemas.push(`${avaliador.id}: item ${item} repetido`)
      continue
    }
    vistos.add(item)
    const v = String(variante ?? '')
      .trim()
      .toLowerCase()
    const n = Number(String(nota ?? '').trim())
    if (!VARIANTES.includes(v) || !Number.isInteger(n) || n < 1 || n > 5) {
      problemas.push(`${avaliador.id}: item ${item} sem resposta válida (variante "${variante}", nota "${nota}")`)
      continue
    }
    respostas.push({ avaliador: avaliador.id, item, variante: v, naturalidade: n })
  }
  const faltam = avaliador.itens.filter((i) => !vistos.has(i))
  if (faltam.length) problemas.push(`${avaliador.id}: ${faltam.length} item(ns) sem linha na planilha`)
  return { respostas, problemas }
}
