/**
 * MEDIÇÃO 2 — tradução: dois modelos de linguagem baratos pelo OpenRouter contra o tradutor local do
 * app (opus-mt), nas MESMAS frases e com o método da bancada de setembro (`bancada/mt.mjs`).
 *
 * FRASES. O FLEURS é paralelo: as 100 falas de inglês e as 100 de português da bancada do aparelho
 * têm os mesmos 100 ids do FLORES. As transcrições de referência formam o par (en→pt e pt→en), e
 * são exatamente as 100 primeiras frases de `fleurs:en-pt` / `fleurs:pt-en#100` de setembro
 * (conferido: 100 ids e 100 textos iguais).
 *
 * NUVEM = O PEDIDO DA PRODUÇÃO, montado por `bancada/nuvem.mjs` (`montarPedidoDeMt`) com as funções
 * do servidor: prompt comunicativo, temperatura da fala (0,2), `max_tokens` proporcional,
 * `reasoning: { effort: 'low', exclude: true }` no gpt-oss e o `provider` de retenção zero
 * (`data_collection: deny`, `zdr: true`, `ignore` do Google). Um pedido por vez.
 *
 * LOCAL = `Xenova/opus-mt-en-ROMANCE` (token >>pt_br<<, id 51) e `Xenova/opus-mt-ROMANCE-en`, q8,
 * feixe 2, frase a frase — a mesma função de `bancada/mt.mjs` (= `mtWorker.ts`), em Node, na CPU.
 *
 * Uso (precisa do tsx):
 *   node node_modules/tsx/dist/cli.mjs scripts/eval-fala/bancada/nuvem/mt.mjs
 *        --sistemas openrouter:openai/gpt-oss-120b,openrouter:openai/gpt-oss-20b,local:opus-mt
 *        [--direcoes en-pt,pt-en] [--limite 3]
 */
/* global AbortSignal */
import path from 'node:path'

import { juntarFrases, separarEmFrases } from '../../../../src/core/texto/frases.ts'
import { estimarCustoMaximoDeMt, interpretarSistema, lerRespostaDeMt, montarPedidoDeMt } from '../nuvem.mjs'
import {
  BANCADA_DIR,
  BASE,
  bruto,
  chave,
  conferirLote,
  gastoTotal,
  lerJsonl,
  limpar,
  opt,
  TetoDeGasto,
  umaTentativaAMais,
} from './comum.mjs'

const SISTEMAS = opt('sistemas', 'openrouter:openai/gpt-oss-120b,openrouter:openai/gpt-oss-20b,local:opus-mt').split(
  ',',
)
const DIRECOES = opt('direcoes', 'en-pt,pt-en').split(',')
const LIMITE = Number(opt('limite', '0')) || 0
const RAIZ = path.join(BANCADA_DIR, 'navegador', 'stt')

function corpus(direcao) {
  const [src, tgt] = direcao.split('-')
  const origem = lerJsonl(path.join(RAIZ, `fleurs_${src}.jsonl`))
  const alvo = new Map(lerJsonl(path.join(RAIZ, `fleurs_${tgt}.jsonl`)).map((x) => [x.floresId, x]))
  const casos = origem
    .filter((x) => alvo.has(x.floresId))
    .map((x) => ({ id: `fleurs_${x.floresId}`, origem: x.referencia, referencia: alvo.get(x.floresId).referencia }))
  return { src, tgt, casos: casos.slice(0, LIMITE || 100) }
}

// ------------------------------------------------------------------ nuvem
/**
 * O teto de preço de cada modelo: o endpoint de retenção zero MAIS CARO, fora o Google, em
 * `GET /api/v1/endpoints/zdr` (grátis), lido na hora. É com ele que se prevê o lote e se reserva.
 */
async function tetoDePreco(modelo) {
  const r = await fetch(`${BASE}/endpoints/zdr`)
  if (!r.ok) throw new Error(`GET /endpoints/zdr: HTTP ${r.status}`)
  const e = (await r.json()).data.filter((x) => x.model_id === modelo && !/^google/i.test(x.tag))
  if (!e.length) throw new Error(`${modelo}: nenhum endpoint de retenção zero — escolha outro modelo`)
  const max = (k) => Math.max(...e.map((x) => Number(x.pricing[k]))) * 1e6
  const min = (k) => Math.min(...e.map((x) => Number(x.pricing[k]))) * 1e6
  return {
    entrada: max('prompt'),
    saida: max('completion'),
    entradaMinima: min('prompt'),
    saidaMinima: min('completion'),
    endpointsZdr: e.length,
  }
}

async function rodarNuvem(sis, direcao) {
  const { src, tgt, casos } = corpus(direcao)
  const teto = await tetoDePreco(sis.modelo)
  const env = { OPENROUTER_API_KEY: chave() }
  const b = bruto(`mt_${sis.id}_${direcao}`)
  const pedidoDe = (caso) => montarPedidoDeMt({ sis, caso: { ...caso, contexto: [] }, src, tgt, env })
  const exemplo = pedidoDe(casos[0])
  Object.assign(b.dados, {
    sistema: sis.id,
    direcao,
    modelo: sis.modelo,
    // O corpo do pedido sem as mensagens: o que a produção manda. Nenhum cabeçalho.
    pedido: Object.fromEntries(Object.entries(exemplo.corpo).filter(([k]) => k !== 'messages' && k !== 'max_tokens')),
    system: exemplo.corpo.messages[0].content,
    tetoDePrecoUsdPorMilhao: teto,
  })
  // Previsão do LOTE: entrada ≤ 1 token a cada 2 caracteres (texto latino dá ~1 a cada 4) + 256 de
  // cabeçalho, saída = `max_tokens` inteiro, tudo no preço do endpoint ZDR mais caro.
  const previsao = (caso) => {
    const corpo = pedidoDe(caso).corpo
    const caracteres = corpo.messages.reduce((n, m) => n + m.content.length, 0)
    return ((caracteres / 2 + 256) * teto.entrada + corpo.max_tokens * teto.saida) / 1e6
  }
  // Reserva POR CHAMADA: o pior caso da bancada (1 token por caractere), no mesmo preço-teto.
  const reserva = (corpo) => {
    const tabela = estimarCustoMaximoDeMt(sis, corpo)
    const caracteres = corpo.messages.reduce((n, m) => n + m.content.length, 0)
    return Math.max(tabela, ((caracteres + 256) * teto.entrada + corpo.max_tokens * teto.saida) / 1e6)
  }
  const faltam = casos.filter((c) => !b.dados.casos[c.id]?.ok)
  conferirLote(
    `${sis.id} ${direcao} (${faltam.length} frases)`,
    faltam.reduce((s, c) => s + previsao(c), 0),
  )
  let feitos = 0
  for (const caso of faltam) {
    const pedido = pedidoDe(caso)
    const fazer = async () => {
      const t0 = performance.now()
      const r = await fetch(pedido.url, { ...pedido.init, signal: AbortSignal.timeout(60_000) })
      const corpo = await r.text()
      return { ok: r.ok, status: r.status, corpo, ms: performance.now() - t0 }
    }
    const r = await umaTentativaAMais(sis.id, reserva(pedido.corpo), fazer)
    const base = { origem: caso.origem, referencia: caso.referencia }
    if (r.erro) {
      b.dados.casos[caso.id] = { ...base, ok: false, erro: r.erro, tentativas: r.tentativas }
      b.salvar()
      console.error(`\n  ${caso.id}: ${r.erro}`)
      if (/^HTTP 4/.test(r.erro) && !/^HTTP 429/.test(r.erro))
        throw new Error(`o provedor recusou o pedido (${r.erro}) — lote interrompido`)
      continue
    }
    let lido = null
    let json = null
    try {
      json = JSON.parse(r.corpo)
      lido = lerRespostaDeMt(json)
    } catch {
      /* cobra o reservado */
    }
    const custo = lido && Number.isFinite(lido.custoInformado) ? lido.custoInformado : Number.NaN
    r.acertar(custo)
    b.dados.casos[caso.id] = {
      ...base,
      ok: Boolean(lido?.texto),
      texto: lido?.texto ?? '',
      ms: Math.round(r.ms),
      tentativas: r.tentativas,
      usd: Number.isFinite(custo) ? custo : null,
      tokensEntrada: lido?.tokensEntrada ?? null,
      tokensSaida: lido?.tokensSaida ?? null,
      tokensDeRaciocinio: lido?.tokensDeRaciocinio ?? null,
      provedorReal: lido?.provedorReal ?? null,
      motivoDoFim: json?.choices?.[0]?.finish_reason ?? null,
      ...(lido?.texto ? {} : { corpoCru: limpar(r.corpo).slice(0, 300) }),
    }
    b.salvar()
    process.stdout.write(
      `\r  ${sis.id} × ${direcao}: ${++feitos}/${faltam.length}  gasto US$ ${gastoTotal().toFixed(5)}   `,
    )
  }
  b.dados.geradoEm = new Date().toISOString()
  b.salvar()
  console.log()
}

// ------------------------------------------------------------------ local (= bancada/mt.mjs)
const pipes = new Map()
async function tradutorLocal(src, tgt) {
  const k = `${src}-${tgt}`
  if (pipes.has(k)) return pipes.get(k)
  const { pipeline, env } = await import('@huggingface/transformers')
  env.allowLocalModels = false
  // Pesos fora do repositório e fora de node_modules.
  env.cacheDir = path.join(BANCADA_DIR, 'cache', 'modelos', 'transformers')
  let modelo, tokenId
  if (src === 'en' && tgt === 'pt') {
    modelo = 'Xenova/opus-mt-en-ROMANCE'
    tokenId = 51
  } else if (src === 'pt' && tgt === 'en') modelo = 'Xenova/opus-mt-ROMANCE-en'
  else throw new Error(`opus-mt não cobre ${src}→${tgt}`)
  const t0 = performance.now()
  const pipe = await pipeline('translation', modelo, { dtype: 'q8', device: 'cpu' })
  const p = { pipe, tokenId, modelo, cargaMs: performance.now() - t0 }
  pipes.set(k, p)
  return p
}

async function rodarLocal(sis, direcao) {
  const { src, tgt, casos } = corpus(direcao)
  const { Tensor } = await import('@huggingface/transformers')
  const { pipe, tokenId, modelo, cargaMs } = await tradutorLocal(src, tgt)
  const GERACAO = { num_beams: 2, max_length: 256, no_repeat_ngram_size: 3, early_stopping: true } // = mtWorker.ts
  const b = bruto(`mt_${sis.id}_${direcao}`)
  Object.assign(b.dados, {
    sistema: sis.id,
    direcao,
    modelo,
    dtype: 'q8',
    geracao: GERACAO,
    cargaMs: Math.round(cargaMs),
  })
  const traduzir = async (texto) => {
    const partes = []
    for (const frase of separarEmFrases(texto)) {
      if (typeof tokenId === 'number') {
        const enc = pipe.tokenizer(frase)
        const ids = [BigInt(tokenId), ...Array.from(enc.input_ids.data)]
        const input_ids = new Tensor('int64', BigInt64Array.from(ids), [1, ids.length])
        const attention_mask = new Tensor('int64', BigInt64Array.from(ids.map(() => 1n)), [1, ids.length])
        const gen = await pipe.model.generate({ input_ids, attention_mask, ...GERACAO })
        partes.push(pipe.tokenizer.batch_decode(gen, { skip_special_tokens: true })[0] ?? '')
      } else {
        const out = await pipe(frase, GERACAO)
        partes.push((Array.isArray(out) ? out[0]?.translation_text : out?.translation_text) ?? '')
      }
    }
    return juntarFrases(partes).trim()
  }
  await traduzir(casos[0].origem) // aquecimento fora do cronômetro
  let feitos = 0
  for (const caso of casos) {
    if (b.dados.casos[caso.id]?.ok) continue
    const t0 = performance.now()
    const texto = await traduzir(caso.origem)
    b.dados.casos[caso.id] = {
      origem: caso.origem,
      referencia: caso.referencia,
      ok: true,
      texto,
      ms: Math.round(performance.now() - t0),
      frases: separarEmFrases(caso.origem).length,
      usd: 0,
      tentativas: 1,
    }
    process.stdout.write(`\r  ${sis.id} × ${direcao}: ${++feitos}/${casos.length}   `)
  }
  b.dados.geradoEm = new Date().toISOString()
  b.salvar()
  console.log()
}

try {
  for (const direcao of DIRECOES)
    for (const spec of SISTEMAS) {
      const sis = interpretarSistema(spec)
      if (sis.provedor === 'openrouter') await rodarNuvem(sis, direcao)
      else if (spec === 'local:opus-mt') await rodarLocal(sis, direcao)
      else throw new Error(`sistema fora desta bancada: ${spec}`)
    }
} catch (e) {
  console.error(`\n${e instanceof TetoDeGasto ? 'PARADO PELO TETO' : 'FALHOU'}: ${limpar(e?.message ?? e)}`)
  process.exitCode = 2
}
console.log(`livro-caixa: US$ ${gastoTotal().toFixed(6)}`)
