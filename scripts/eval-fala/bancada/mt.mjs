/**
 * BANCADA DE TRADUÇÃO — qualidade (chrF++ aqui; COMET e BLEU em `pontuar.py`), latência e custo
 * medidos, por sistema × corpus, com IC de 95% e comparação pareada.
 *
 * Sistemas (`--sistemas`):
 *   groq:openai/gpt-oss-120b            a produção de hoje
 *   deepinfra:openai/gpt-oss-20b        candidatos de nuvem (B5): DeepInfra, Cerebras, Cloudflare
 *   cerebras:gpt-oss-120b                 Workers AI e os de antes (Groq, OpenRouter, HF) — o
 *   cloudflare:@cf/openai/gpt-oss-20b     registro, com preço, chave e retenção de cada um, está
 *   deepinfra:Qwen/Qwen3.5-9B@none        em `nuvem.mjs`. `@esforço` é ajuste de candidato que a
 *                                         produção ainda não manda (fica marcado no bruto)
 *   local:opus-mt                       o tradutor do navegador (Xenova/opus-mt-*, q8, beam 2)
 *   local:tc-big                        opus-mt-tc-big-en-pt (repositório privado já convertido)
 *   bergamot:en-pt | bergamot:pt-en     Firefox Translations (Mozilla, MPL-2.0) no WASM do
 *                                       bergamot-translator — `bergamot.mjs`. O par tem de bater
 *                                       com o do corpus (erro claro se não bater); `bergamot:auto`
 *                                       segue o corpus. Registra também a latência POR FRASE.
 * Corpora (`--corpora`):
 *   fleurs:en-pt  fleurs:pt-en  wmt:en-pt  gold:en-pt
 *   cascata:<sistema-stt>:en-pt   o texto que o STT ENTENDEU do áudio em inglês, traduzido e
 *                                 comparado com a referência humana em pt — o que o usuário vê.
 *
 * NUVEM = O PEDIDO DA PRODUÇÃO (B5): prompt comunicativo, temperatura da fala (0,2), `max_tokens`
 * proporcional e o raciocínio/retenção de `parametrosDoProvedor` — montado em `nuvem.mjs` com as
 * funções do servidor. Até 29/09 a bancada mandava temperatura 0 e o raciocínio padrão do provedor;
 * os brutos antigos NÃO são pareáveis com os novos (o cache também separa: o nome leva o perfil).
 *
 * SEM CHAVE, PULA: o sistema de nuvem cuja chave não existe sai com aviso e entra em `pulados` no
 * bruto — a bancada roda em ensaio sem nenhuma chave. Cada chamada RESERVA o pior caso no
 * livro-caixa antes de sair (`livroCaixa.mjs`); o teto é `BANCADA_TETO_USD`.
 */
/* global AbortSignal */
import path from 'node:path'
import { readFileSync } from 'node:fs'
import os from 'node:os'

import { bootstrap, bootstrapPareado, mediaEm } from '../../../src/core/eval/bootstrap.ts'
import { chrf } from '../../../src/core/eval/chrf.ts'
import { juntarFrases, separarEmFrases } from '../../../src/core/texto/frases.ts'
import {
  BANCADA_DIR,
  cache,
  comAmostra,
  comRetentativa,
  CotaDoProvedor,
  gastoTotal,
  gravarResultado,
  hash,
  lerJsonl,
  opt,
  percentis,
  respeitarRitmo,
  segredos,
  tentativaPaga,
  TetoDeGasto,
} from './comum.mjs'
import { prepararBergamot, traduzirBergamot } from './bergamot.mjs'
import {
  chavesAusentes,
  conferirPolitica,
  custoDeMt,
  ehDeNuvem,
  estimarCustoMaximoDeMt,
  interpretarSistema,
  lerRespostaDeMt,
  montarPedidoDeMt,
  PoliticaDeDados,
  precoDeMt,
  PROVEDORES,
  TIMEOUT_DE_PRODUCAO_MS,
} from './nuvem.mjs'

const SISTEMAS = opt('sistemas', 'groq:openai/gpt-oss-120b')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
const CORPORA = opt('corpora', 'fleurs:en-pt')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
const LIMITE = Number(opt('limite', '0')) || 0
const CONCORRENCIA = Number(opt('concorrencia', '4')) || 4

/** As chaves de todos os provedores de nuvem que existirem (ambiente, `.env.local`, `.env`). */
function ambienteDeNuvem() {
  const env = segredos([...new Set(Object.values(PROVEDORES).flatMap((p) => p.chaves))])
  if (!env.HF_TOKEN) {
    try {
      env.HF_TOKEN = readFileSync(path.join(os.homedir(), '.cache/huggingface/token'), 'utf8').trim()
    } catch {
      /* sem token do HF: o provedor `hf` é pulado */
    }
  }
  return env
}
const ENV_NUVEM = ambienteDeNuvem()

// ------------------------------------------------------------------ corpora
function carregarCorpus(specComAmostra) {
  const { nome: spec, n: amostra } = comAmostra(specComAmostra)
  const partes = spec.split(':')
  const [src, tgt] = partes.at(-1).split('-')
  let casos
  if (partes[0] === 'fleurs') {
    casos = lerJsonl('mt/fleurs_en_pt.jsonl').map((p) => ({ id: p.id, origem: p[src], referencia: p[tgt] }))
  } else if (partes[0] === 'wmt') {
    casos = lerJsonl('mt/wmt24pp_en_ptbr.jsonl').map((p) => ({
      id: p.id,
      origem: p.en,
      referencia: p.pt,
      categoria: p.dominio,
    }))
  } else if (partes[0] === 'gold') {
    casos = readFileSync('tests/eval/fixtures/gold-traducao-v1.jsonl', 'utf8')
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l))
      .map((g) => ({
        id: g.id,
        origem: g.origem,
        referencia: g.referencia,
        contexto: g.contexto ?? [],
        categoria: g.categoria,
      }))
  } else if (partes[0] === 'cascata') {
    const sisStt = partes.slice(1, -1).join(':')
    const arq = path.join(
      BANCADA_DIR,
      'cache',
      `${`stt_${sisStt}_fleurs_${src}`.replace(/[^a-zA-Z0-9._-]+/g, '_')}.json`,
    )
    const hip = JSON.parse(readFileSync(arq, 'utf8'))
    const pares = new Map(lerJsonl('mt/fleurs_en_pt.jsonl').map((p) => [p.floresId, p]))
    casos = Object.entries(hip)
      .map(([id, r]) => {
        const floresId = Number(id.split('_').at(-1))
        return {
          id: `fleurs_${floresId}`,
          origem: r.texto,
          referencia: pares.get(floresId)?.[tgt],
          origemHumana: pares.get(floresId)?.[src],
        }
      })
      .filter((c) => c.referencia && c.origem)
  } else throw new Error(`corpus desconhecido: ${spec}`)
  const n = amostra || LIMITE
  if (n && n < casos.length) {
    // ESTRATIFICADA quando há categoria (domínio do WMT, fenômeno do gold): cortar o topo do arquivo
    // pegaria só os primeiros domínios e mediria outro corpus.
    const cats = [...new Set(casos.map((c) => c.categoria ?? ''))]
    const porCat = Math.ceil(n / cats.length)
    casos = cats.flatMap((cat) => casos.filter((c) => (c.categoria ?? '') === cat).slice(0, porCat)).slice(0, n)
  }
  return { src, tgt, casos }
}

// ------------------------------------------------------------------ nuvem
/**
 * Uma tradução de nuvem com o pedido da produção (`montarPedidoDeMt`). Cada TENTATIVA reserva o pior
 * caso antes de sair (`tentativaPaga`); a resposta acerta pelo custo real. O timeout daqui (60 s) é o
 * da medição; o da produção (12 s) vira a contagem `acimaDoTimeoutDeProducao` no resultado.
 */
async function traduzirNuvem(sis, caso, src, tgt) {
  const pedido = montarPedidoDeMt({ sis, caso, src, tgt, env: ENV_NUVEM })
  const estimativa = estimarCustoMaximoDeMt(sis, pedido.corpo)
  await respeitarRitmo(`LLM_${sis.provedor}_${sis.modelo.replace(/[^a-z0-9]/gi, '')}`, PROVEDORES[sis.provedor].rpmMt)
  const r = await comRetentativa(
    tentativaPaga(sis.id, estimativa, () => fetch(pedido.url, { ...pedido.init, signal: AbortSignal.timeout(60_000) })),
    sis.id,
  )
  let lido
  try {
    lido = lerRespostaDeMt(await r.json())
  } catch (e) {
    r.acertar(Number.NaN) // não deu para ler o custo: cobra o reservado
    throw e
  }
  const usd = custoDeMt(sis, lido, lido.custoInformado)
  r.acertar(usd)
  return {
    texto: lido.texto,
    ms: r.ms,
    tokensEntrada: lido.tokensEntrada,
    tokensSaida: lido.tokensSaida,
    tokensEmCache: lido.tokensEmCache,
    tokensDeRaciocinio: lido.tokensDeRaciocinio,
    usd: Number.isFinite(usd) ? usd : estimativa,
    provedorReal: lido.provedorReal,
  }
}

/**
 * O PERFIL do pedido de nuvem (tudo menos as mensagens e o `max_tokens`, que variam por caso): entra
 * no nome do cache, para uma mudança de parâmetro na produção não servir respostas antigas.
 */
function perfilDoPedido(sis) {
  const { corpo, parametros } = montarPedidoDeMt({
    sis,
    caso: { origem: 'x', contexto: [] },
    src: 'en',
    tgt: 'pt',
    env: ENV_NUVEM,
  })
  const resto = Object.fromEntries(Object.entries(corpo).filter(([k]) => k !== 'messages' && k !== 'max_tokens'))
  return { resto, parametros }
}

// ------------------------------------------------------------------ local
const pipes = new Map()
async function tradutorLocal(nome, src, tgt) {
  const chaveP = `${nome}:${src}-${tgt}`
  if (pipes.has(chaveP)) return pipes.get(chaveP)
  const { pipeline, env } = await import('@huggingface/transformers')
  env.allowLocalModels = false
  try {
    process.env.HF_TOKEN ||= readFileSync(path.join(os.homedir(), '.cache/huggingface/token'), 'utf8').trim()
  } catch {
    /* sem token: só modelos públicos */
  }
  let modelo, tokenId
  if (nome === 'tc-big') {
    if (!(src === 'en' && tgt === 'pt')) throw new Error('tc-big só cobre en→pt')
    modelo = 'GuilhermeLVL/opus-mt-tc-big-en-pt-onnx'
  } else if (src === 'en' && tgt === 'pt') {
    modelo = 'Xenova/opus-mt-en-ROMANCE'
    tokenId = 51
  } else if (src === 'pt' && tgt === 'en') modelo = 'Xenova/opus-mt-ROMANCE-en'
  else throw new Error(`opus-mt não cobre ${src}→${tgt}`)
  const pipe = await pipeline('translation', modelo, { dtype: 'q8', device: 'cpu' })
  // tc-big precisa do token de variante no texto: >>por<< (pt-BR é o padrão do par en-pt do Tatoeba).
  const p = { pipe, tokenId, prefixo: nome === 'tc-big' ? '>>por<< ' : '' }
  pipes.set(chaveP, p)
  return p
}

async function traduzirLocal(sis, caso, src, tgt) {
  const { Tensor } = await import('@huggingface/transformers')
  const { pipe, tokenId, prefixo } = await tradutorLocal(sis.modelo, src, tgt)
  const GERACAO = { num_beams: 2, max_length: 256, no_repeat_ngram_size: 3, early_stopping: true } // = mtWorker.ts
  const t0 = performance.now()
  const partes = []
  for (const frase of separarEmFrases(caso.origem)) {
    if (typeof tokenId === 'number') {
      const enc = pipe.tokenizer(frase)
      const ids = [BigInt(tokenId), ...Array.from(enc.input_ids.data)]
      const input_ids = new Tensor('int64', BigInt64Array.from(ids), [1, ids.length])
      const attention_mask = new Tensor('int64', BigInt64Array.from(ids.map(() => 1n)), [1, ids.length])
      const gen = await pipe.model.generate({ input_ids, attention_mask, ...GERACAO })
      partes.push(pipe.tokenizer.batch_decode(gen, { skip_special_tokens: true })[0] ?? '')
    } else {
      const out = await pipe(prefixo + frase, GERACAO)
      partes.push((Array.isArray(out) ? out[0]?.translation_text : out?.translation_text) ?? '')
    }
  }
  return { texto: juntarFrases(partes).trim(), ms: performance.now() - t0, usd: 0 }
}

/** Par do sistema ≠ par do corpus: erro de USO, não falha do modelo — para em vez de gravar vazios. */
class ParErrado extends Error {}

async function traduzirBergamotBancada(sis, caso, src, tgt) {
  if (sis.modelo !== 'auto' && sis.modelo !== `${src}-${tgt}`)
    throw new ParErrado(`${sis.id} não traduz ${src}→${tgt}: rode este corpus com bergamot:${src}-${tgt}`)
  await prepararBergamot(src, tgt) // download e carga fora do cronômetro
  const t0 = performance.now()
  const texto = (await traduzirBergamot(src, tgt, caso.origem)).trim()
  const ms = performance.now() - t0
  return { texto, ms, frases: separarEmFrases(caso.origem).length, usd: 0 }
}

// ------------------------------------------------------------------ execução
async function rodar(sis, spec) {
  const { src, tgt, casos } = carregarCorpus(spec)
  const nuvem = ehDeNuvem(sis.provedor)
  const perfil = nuvem ? perfilDoPedido(sis) : null
  const c = cache(`mt_${sis.id}_${comAmostra(spec).nome}${perfil ? `_p${hash(JSON.stringify(perfil.resto))}` : ''}`)
  const saida = new Array(casos.length)
  let feitos = 0
  const trabalho = async (i) => {
    const caso = casos[i]
    const k = `${caso.id}|${caso.origem}`
    let r = c.get(k)
    if (!r) {
      try {
        r =
          sis.provedor === 'local'
            ? await traduzirLocal(sis, caso, src, tgt)
            : sis.provedor === 'bergamot'
              ? await traduzirBergamotBancada(sis, caso, src, tgt)
              : await traduzirNuvem(sis, caso, src, tgt)
      } catch (e) {
        if (
          e instanceof TetoDeGasto ||
          e instanceof CotaDoProvedor ||
          e instanceof ParErrado ||
          e instanceof PoliticaDeDados
        )
          throw e
        r = { texto: '', ms: NaN, erro: String(e.message).slice(0, 200) }
      }
      if (!r.erro) c.set(k, r)
    }
    saida[i] = {
      ...caso,
      hipotese: r.texto,
      ms: r.ms,
      frases: r.frases ?? separarEmFrases(caso.origem).length,
      usd: r.usd ?? 0,
      tokensEntrada: r.tokensEntrada,
      tokensSaida: r.tokensSaida,
      erro: r.erro,
    }
    process.stdout.write(`\r  ${sis.id} × ${spec}: ${++feitos}/${casos.length}   `)
  }
  // Local é CPU: um por vez. Nuvem: poucos em paralelo (a latência medida é por chamada).
  const conc = sis.provedor === 'local' || sis.provedor === 'bergamot' ? 1 : CONCORRENCIA
  let proximo = 0
  await Promise.all(
    Array.from({ length: conc }, async () => {
      while (proximo < casos.length) await trabalho(proximo++)
    }),
  )
  c.salvar()
  const notas = saida.map((x) => chrf(x.referencia, x.hipotese).chrf * 100)
  const q = bootstrap(saida.length, mediaEm(notas))
  const falhas = saida.filter((x) => x.erro).length
  const [p50, p95] = percentis(saida.map((x) => x.ms))
  // Latência POR FRASE (o que a legenda espera a cada fim de frase), só para os motores locais: na
  // nuvem a chamada leva o trecho inteiro e dividir mediria a rede, não o modelo.
  const porFrase =
    sis.provedor === 'local' || sis.provedor === 'bergamot'
      ? percentis(saida.filter((x) => x.frases > 0).map((x) => x.ms / x.frases))
      : null
  const usd = saida.reduce((s, x) => s + (x.usd || 0), 0)
  // O que a produção teria desistido de esperar (o cliente cai no tradutor local).
  const acimaDoTimeoutDeProducao = nuvem ? saida.filter((x) => x.ms > TIMEOUT_DE_PRODUCAO_MS).length : 0
  const palavras = saida.reduce((s, x) => s + x.origem.split(/\s+/).length, 0)
  // Custo por HORA DE FALA: ~9.000 palavras por hora de conversa (ritmo médio de 150 palavras/min).
  const usdPorHora = palavras ? (usd / palavras) * 9000 : 0
  console.log(
    `\r  ${sis.id} × ${spec}: chrF++ ${q.valor.toFixed(1)} [${q.ic95[0].toFixed(1)}–${q.ic95[1].toFixed(1)}]  p50 ${p50?.toFixed(0)} ms  p95 ${p95?.toFixed(0)} ms  US$ ${usdPorHora.toFixed(4)}/h de fala${falhas ? `  (${falhas} falhas)` : ''}`,
  )
  return {
    sistema: sis.id,
    corpus: spec,
    n: saida.length,
    falhas,
    chrf: q,
    latenciaMs: { p50, p95 },
    ...(porFrase && { latenciaPorFraseMs: { p50: porFrase[0], p95: porFrase[1] } }),
    ...(perfil && { parametros: perfil.parametros, acimaDoTimeoutDeProducao }),
    usdTotal: usd,
    usdPorHoraDeFala: usdPorHora,
    casos: saida.map((x, i) => ({
      id: x.id,
      categoria: x.categoria,
      origem: x.origem,
      origemHumana: x.origemHumana,
      referencia: x.referencia,
      hipotese: x.hipotese,
      chrf: notas[i],
      ms: Math.round(x.ms),
      tokensSaida: x.tokensSaida,
      erro: x.erro,
    })),
  }
}

/**
 * Os sistemas que vão rodar: a política e o preço são conferidos ANTES de qualquer chamada (um erro
 * de digitação não gasta nada), e o de nuvem sem chave é pulado com aviso.
 */
function sistemasChamaveis() {
  const pulados = []
  const sistemas = []
  for (const s of SISTEMAS) {
    const sis = interpretarSistema(s)
    if (!ehDeNuvem(sis.provedor) && sis.provedor !== 'local' && sis.provedor !== 'bergamot')
      throw new Error(`provedor desconhecido em --sistemas: ${sis.provedor} (os de nuvem estão em nuvem.mjs)`)
    if (ehDeNuvem(sis.provedor)) {
      conferirPolitica(sis)
      precoDeMt(sis)
      const faltam = chavesAusentes(sis.provedor, ENV_NUVEM)
      if (faltam.length) {
        console.warn(`  pulado: ${sis.id} — falta ${faltam.join(' e ')} (modo ensaio)`)
        pulados.push({ sistema: sis.id, motivo: `falta ${faltam.join(', ')}` })
        continue
      }
    }
    sistemas.push(sis)
  }
  return { sistemas, pulados }
}

async function main() {
  const { sistemas, pulados } = sistemasChamaveis()
  const resultados = []
  try {
    for (const spec of CORPORA) for (const sis of sistemas) resultados.push(await rodar(sis, spec))
  } catch (e) {
    if (!(e instanceof TetoDeGasto || e instanceof CotaDoProvedor)) throw e
    console.error(`\n${e.message} — resultados parciais gravados.`)
  }
  const comparacoes = []
  for (const spec of CORPORA) {
    const doCorpus = resultados.filter((r) => r.corpus === spec)
    const base = doCorpus[0]
    if (!base) continue
    for (const outro of doCorpus.slice(1)) {
      const n = Math.min(base.casos.length, outro.casos.length)
      const d = bootstrapPareado(n, mediaEm(outro.casos.map((x) => x.chrf)), mediaEm(base.casos.map((x) => x.chrf)))
      comparacoes.push({ corpus: spec, sistema: outro.sistema, contra: base.sistema, diferencaChrf: d })
      console.log(
        `  Δ chrF++ ${spec}: ${outro.sistema} − ${base.sistema} = ${d.valor.toFixed(2)} [${d.ic95[0].toFixed(2)}, ${d.ic95[1].toFixed(2)}]${d.significativo ? ' *significativo*' : ' (empate)'}`,
      )
    }
  }
  const nome = `mt_${CORPORA.join('-')}_${sistemas.length}sis_${Date.now().toString(36)}`.replace(
    /[^a-zA-Z0-9._-]+/g,
    '_',
  )
  const saida = gravarResultado(nome, {
    sistemas: sistemas.map((x) => x.id),
    corpora: CORPORA,
    gastoTotalUsd: gastoTotal(),
    pulados,
    resultados,
    comparacoes,
  })
  console.log(`\ngasto acumulado da bancada: US$ ${gastoTotal().toFixed(4)}\nbruto: ${saida}`)
}

main().catch((e) => {
  console.error('FALHOU:', e.message)
  process.exit(1)
})
