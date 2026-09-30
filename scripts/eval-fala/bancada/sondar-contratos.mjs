/**
 * SONDA DE CONTRATO DAS APIS DE NUVEM (B5, 29/09/2026) — um pedido MÍNIMO por provedor × modelo,
 * para pegar mudança de API antes que ela chegue à produção.
 *
 * O caso que motivou: a Groq tirou o Llama 3.x do catálogo em 16/08/2026 e o modelo passou a responder
 * `model_not_found`; o `mtProxy` só descobriu atendendo usuário. Esta sonda manda o pedido QUE A
 * PRODUÇÃO MANDARIA (o mesmo de `nuvem.mjs`: prompt, temperatura, raciocínio, `verbose_json`) e
 * confere o que o servidor LÊ da resposta:
 *
 *   tradução   `choices[0].message.content` não vazio e sem pensamento vazando (`<think>`),
 *              `usage.prompt_tokens`/`completion_tokens` (a cota e o custo dependem deles),
 *              `prompt_tokens_details.cached_tokens` (a telemetria do cache de prompt), custo informado;
 *   STT        `text`, `language` e `segments` com `no_speech_prob`/`avg_logprob`/`compression_ratio`
 *              (a triagem de `sttQualidade.ts`); no Cloudflare, o envelope `{ success, result }` e o
 *              `transcription_info`;
 *   sempre     os cabeçalhos de limite (`x-ratelimit-*`, `ratelimit-*`, `retry-after`) e qualquer
 *              campo ou cabeçalho que fale de retenção/ZDR/coleta de dados.
 *
 * VIOLAÇÃO (o contrato mudou: sai com código 1) × AVISO (o provedor está ocupado agora): modelo fora
 * do catálogo, chave recusada e outro 4xx para o pedido da produção são violações; 429 e 5xx são avisos.
 *
 * SEM CHAVE, PULA aquele provedor e diz qual variável falta. Cada pedido passa pelo livro-caixa (a
 * reserva do pior caso antes de sair); a sonda inteira custa menos de um décimo de centavo de dólar.
 *
 * Uso:
 *   node node_modules/tsx/dist/cli.mjs scripts/eval-fala/bancada/sondar-contratos.mjs \
 *     [--saida <dir>, padrão BANCADA_DIR/sonda] [--apenas deepinfra:,cerebras:] [--audio fala.wav] [--nao-falhar]
 * O áudio padrão é a primeira fala do FLEURS pt da bancada, se baixada; senão 1,5 s de um tom.
 */
/* global AbortSignal */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { BANCADA_DIR, flag, gastoTotal, opt, segredos, tentativaPaga, TetoDeGasto } from './comum.mjs'
import {
  chavesAusentes,
  custoDeMt,
  custoDeStt,
  estimarCustoMaximoDeMt,
  formatoDeStt,
  interpretarSistema,
  lerRespostaDeMt,
  montarPedidoDeMt,
  montarPedidoDeStt,
  PROVEDORES,
} from './nuvem.mjs'

/** O que se sonda: as linhas de base da produção e os candidatos do B5. Nunca Gemini. */
export const SONDAS = [
  { funcao: 'mt', spec: 'groq:openai/gpt-oss-120b' },
  { funcao: 'mt', spec: 'groq:openai/gpt-oss-20b' },
  { funcao: 'mt', spec: 'deepinfra:openai/gpt-oss-20b' },
  { funcao: 'mt', spec: 'deepinfra:openai/gpt-oss-120b' },
  { funcao: 'mt', spec: 'deepinfra:Qwen/Qwen3.5-9B@none' },
  { funcao: 'mt', spec: 'deepinfra:google/gemma-4-26B-A4B-it' },
  { funcao: 'mt', spec: 'cerebras:gpt-oss-120b' },
  { funcao: 'mt', spec: 'cloudflare:@cf/openai/gpt-oss-20b' },
  { funcao: 'mt', spec: 'cloudflare:@cf/openai/gpt-oss-120b' },
  { funcao: 'mt', spec: 'cloudflare:@cf/google/gemma-4-26b-a4b-it' },
  { funcao: 'mt', spec: 'openrouter:openai/gpt-oss-120b' },
  { funcao: 'stt', spec: 'groq:whisper-large-v3-turbo' },
  { funcao: 'stt', spec: 'deepinfra:openai/whisper-large-v3-turbo' },
  { funcao: 'stt', spec: 'cloudflare:@cf/openai/whisper-large-v3-turbo' },
]

/** A fala da sonda de tradução: curta, coloquial, com contexto — o caso típico da legenda. */
const CASO_DA_SONDA = { origem: "Hey, what's up? I was out all day.", contexto: ['Where were you?'] }

const ehNumero = (v) => typeof v === 'number' && Number.isFinite(v)

/** Cada sonda, com o motivo do pulo quando falta chave. */
export function planoDaSonda(env, prefixos = null) {
  return SONDAS.filter((s) => !prefixos || prefixos.some((p) => s.spec.startsWith(p))).map((s) => {
    const sis = interpretarSistema(s.spec)
    const faltam = chavesAusentes(sis.provedor, env)
    return { ...s, sis, pulado: faltam.length ? `falta ${faltam.join(' e ')}` : null }
  })
}

export function limitesDosCabecalhos(headers) {
  const out = {}
  for (const [nome, valor] of headers ?? []) {
    const n = nome.toLowerCase()
    if (n.startsWith('x-ratelimit') || n.startsWith('ratelimit') || n === 'retry-after') out[n] = valor
  }
  return out
}

const RETENCAO = /retention|zdr|data[-_]?collection|data[-_]?policy/i

/**
 * Campos que falam de retenção — na resposta (objetos, até 4 níveis; listas como `choices` ficam de
 * fora: são conteúdo) e nos cabeçalhos. Vazio é o normal: quase nenhum provedor devolve isso por
 * pedido, e a retenção declarada fica no registro de `nuvem.mjs`, com fonte.
 */
export function camposDeRetencao(json, headers) {
  const out = {}
  const andar = (obj, prefixo, nivel) => {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj) || nivel > 4) return
    for (const [k, v] of Object.entries(obj)) {
      const caminho = prefixo ? `${prefixo}.${k}` : k
      if (RETENCAO.test(k)) out[caminho] = v
      else andar(v, caminho, nivel + 1)
    }
  }
  andar(json, '', 0)
  for (const [nome, valor] of headers ?? []) if (RETENCAO.test(nome)) out[`cabeçalho ${nome.toLowerCase()}`] = valor
  return out
}

export function conferirContratoMt(json) {
  const violacoes = []
  const msg = json?.choices?.[0]?.message
  const conteudo = msg?.content
  if (typeof conteudo !== 'string') violacoes.push('choices[0].message.content ausente')
  else if (!conteudo.trim())
    violacoes.push('conteúdo vazio (raciocínio gastou o max_tokens da produção, ou o provedor mudou o campo)')
  else if (/<think>|<\/think>|<\|channel\|?>/i.test(conteudo))
    violacoes.push('pensamento vazou no conteúdo (o ajuste de esforço não desligou o raciocínio)')
  const u = json?.usage
  if (!ehNumero(u?.prompt_tokens)) violacoes.push('usage.prompt_tokens ausente (cota e custo dependem dele)')
  if (!ehNumero(u?.completion_tokens)) violacoes.push('usage.completion_tokens ausente (cota e custo dependem dele)')
  const lido = lerRespostaDeMt(json)
  return {
    violacoes,
    observado: {
      tokensEntrada: lido.tokensEntrada,
      tokensSaida: lido.tokensSaida,
      tokensDeRaciocinio: lido.tokensDeRaciocinio,
      cacheInformado: ehNumero(u?.prompt_tokens_details?.cached_tokens),
      custoInformado: lido.custoInformado,
      raciocinioSeparado: typeof msg?.reasoning === 'string' || typeof msg?.reasoning_content === 'string',
      provedorReal: lido.provedorReal,
    },
  }
}

const CAMPOS_DA_TRIAGEM = ['no_speech_prob', 'avg_logprob', 'compression_ratio']

export function conferirContratoStt(formato, json) {
  const violacoes = []
  const observacoes = []
  let r = json
  let idioma
  if (formato === 'cloudflare') {
    if (json?.success === false)
      violacoes.push(`success=false: ${String(json?.errors?.[0]?.message ?? 'sem mensagem').slice(0, 160)}`)
    r = json?.result
    if (!r || typeof r !== 'object') {
      violacoes.push('result ausente no envelope do Workers AI')
      return { violacoes, observacoes, observado: {} }
    }
    idioma = r.transcription_info?.language
    if (typeof idioma !== 'string') violacoes.push('transcription_info.language ausente (o idioma da fala some)')
  } else {
    idioma = r?.language
    if (typeof idioma !== 'string') violacoes.push('language ausente no verbose_json (o idioma da fala some)')
  }
  if (typeof r?.text !== 'string') violacoes.push('text ausente')
  if (!Array.isArray(r?.segments)) {
    violacoes.push('segments ausente: sem verbose_json a triagem de silêncio/repetição da produção fica cega')
  } else if (!r.segments.length) {
    observacoes.push('nenhum segmento (áudio sem fala?): os campos da triagem não foram conferidos')
  } else {
    r.segments.slice(0, 5).forEach((s, i) => {
      for (const campo of CAMPOS_DA_TRIAGEM) if (!ehNumero(s?.[campo])) violacoes.push(`segments[${i}] sem ${campo}`)
    })
  }
  return {
    violacoes,
    observacoes,
    observado: {
      segmentos: Array.isArray(r?.segments) ? r.segments.length : null,
      idioma: typeof idioma === 'string' ? idioma : null,
      duracaoS: formato === 'cloudflare' ? (r.transcription_info?.duration ?? null) : (r?.duration ?? null),
    },
  }
}

/** HTTP de erro: o contrato mudou (violação) ou o provedor está ocupado agora (aviso)? */
export function classificarFalhaHttp(status, corpo = '') {
  const texto = String(corpo)
  if (status === 429) return { violacao: null, aviso: 'limitado agora (HTTP 429) — refaça mais tarde' }
  if (status >= 500) return { violacao: null, aviso: `provedor instável agora (HTTP ${status})` }
  if (
    status === 404 ||
    /model_not_found|decommissioned|does not exist|no such model|unknown model|model.*not found/i.test(texto)
  )
    return { violacao: `modelo fora do catálogo (HTTP ${status}): ${texto.slice(0, 160)}`, aviso: null }
  if (status === 401 || status === 403) return { violacao: `chave recusada (HTTP ${status})`, aviso: null }
  return { violacao: `pedido da produção recusado (HTTP ${status}): ${texto.slice(0, 160)}`, aviso: null }
}

// ------------------------------------------------------------------ execução
/** 1,5 s de um tom de 440 Hz em WAV 16 kHz — quando a bancada não tem fala baixada. */
function tomDeEnsaio() {
  const n = 24_000
  const buf = Buffer.alloc(44 + n * 2)
  buf.write('RIFF', 0, 'ascii')
  buf.writeUInt32LE(36 + n * 2, 4)
  buf.write('WAVEfmt ', 8, 'ascii')
  buf.writeUInt32LE(16, 16)
  buf.writeUInt16LE(1, 20)
  buf.writeUInt16LE(1, 22)
  buf.writeUInt32LE(16000, 24)
  buf.writeUInt32LE(32000, 28)
  buf.writeUInt16LE(2, 32)
  buf.writeUInt16LE(16, 34)
  buf.write('data', 36, 'ascii')
  buf.writeUInt32LE(n * 2, 40)
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / 16000) * 6000), 44 + i * 2)
  return buf
}

function audioDaSonda() {
  const escolhido = opt('audio', null)
  if (escolhido) return { wav: readFileSync(escolhido), origem: escolhido }
  const manifesto = path.join(BANCADA_DIR, 'stt', 'fleurs_pt.jsonl')
  if (existsSync(manifesto)) {
    const primeira = JSON.parse(readFileSync(manifesto, 'utf8').split('\n')[0])
    const arq = path.join(BANCADA_DIR, primeira.arquivo)
    if (existsSync(arq)) return { wav: readFileSync(arq), origem: `FLEURS pt ${primeira.id}` }
  }
  return { wav: tomDeEnsaio(), origem: 'tom de 1,5 s (sem fala: os segmentos podem vir vazios)' }
}

const duracaoDoWav = (wav) => (wav.length - 44) / 32000

async function sondar(item, env, audio) {
  const { sis, funcao } = item
  const base = { provedor: PROVEDORES[sis.provedor].nome, funcao, sistema: sis.id }
  let pedido
  let estimativa
  if (funcao === 'mt') {
    pedido = montarPedidoDeMt({ sis, caso: CASO_DA_SONDA, src: 'en', tgt: 'pt', env })
    estimativa = estimarCustoMaximoDeMt(sis, pedido.corpo)
  } else {
    pedido = montarPedidoDeStt({ sis, wav: audio.wav, idioma: 'pt', t0: true, env })
    estimativa = custoDeStt(sis, duracaoDoWav(audio.wav)).usd
  }
  const inicio = performance.now()
  let r
  try {
    r = await tentativaPaga(`sonda:${sis.id}`, estimativa, () =>
      fetch(pedido.url, { ...pedido.init, signal: AbortSignal.timeout(30_000) }),
    )()
  } catch (e) {
    if (e instanceof TetoDeGasto) throw e
    return { ...base, situacao: 'aviso', avisos: [`sem resposta: ${String(e?.message ?? e).slice(0, 160)}`] }
  }
  const ms = Math.round(performance.now() - inicio)
  const limites = limitesDosCabecalhos(r.headers)
  if (!r.ok) {
    const corpo = await r.text().catch(() => '')
    const { violacao, aviso } = classificarFalhaHttp(r.status, corpo)
    return {
      ...base,
      situacao: violacao ? 'violação' : 'aviso',
      status: r.status,
      ms,
      limites,
      violacoes: violacao ? [violacao] : [],
      avisos: aviso ? [aviso] : [],
    }
  }
  let json
  try {
    json = await r.json()
  } catch {
    r.acertar(Number.NaN)
    return { ...base, situacao: 'violação', status: r.status, ms, limites, violacoes: ['resposta não é JSON'] }
  }
  const contrato = funcao === 'mt' ? conferirContratoMt(json) : conferirContratoStt(formatoDeStt(sis.provedor), json)
  r.acertar(funcao === 'mt' ? custoDeMt(sis, contrato.observado, contrato.observado.custoInformado) : estimativa)
  return {
    ...base,
    situacao: contrato.violacoes.length ? 'violação' : 'ok',
    status: r.status,
    ms,
    limites,
    retencao: camposDeRetencao(json, r.headers),
    retencaoDeclarada: PROVEDORES[sis.provedor].retencao.declarada,
    violacoes: contrato.violacoes,
    avisos: contrato.observacoes ?? [],
    observado: contrato.observado,
    ...(funcao === 'mt' ? { parametros: pedido.parametros } : {}),
  }
}

export function markdownDaSonda(resultados, meta = {}) {
  const l = ['# Sonda de contrato das APIs de nuvem', '']
  if (meta.geradoEm)
    l.push(`${meta.geradoEm} · áudio: ${meta.audio ?? '—'} · gasto: US$ ${(meta.gastoUsd ?? 0).toFixed(5)}`, '')
  l.push('| Provedor | Função | Sistema | Situação | HTTP | ms | Limites | Retenção | Observações |')
  l.push('| --- | --- | --- | --- | --: | --: | --- | --- | --- |')
  for (const x of resultados) {
    const limites = Object.entries(x.limites ?? {})
      .map(([k, v]) => `${k}=${v}`)
      .join('<br>')
    const ret = Object.keys(x.retencao ?? {}).length
      ? Object.entries(x.retencao)
          .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
          .join('<br>')
      : (x.retencaoDeclarada ?? '—')
    const notas = [...(x.violacoes ?? []), ...(x.avisos ?? []), ...(x.pulado ? [x.pulado] : [])].join('; ')
    l.push(
      `| ${x.provedor} | ${x.funcao.toUpperCase()} | \`${x.sistema}\` | ${x.situacao === 'violação' ? '**violação**' : x.situacao} | ${x.status ?? '—'} | ${x.ms ?? '—'} | ${limites || '—'} | ${ret} | ${notas || '—'} |`,
    )
  }
  const n = (s) => resultados.filter((x) => x.situacao === s).length
  l.push('', `${n('ok')} ok · ${n('violação')} violação · ${n('aviso')} aviso · ${n('pulado')} pulado (sem chave)`)
  return `${l.join('\n')}\n`
}

async function main() {
  const env = segredos([...new Set(Object.values(PROVEDORES).flatMap((p) => p.chaves))])
  const prefixos = opt('apenas', null)?.split(',').filter(Boolean) ?? null
  const plano = planoDaSonda(env, prefixos)
  const audio = plano.some((p) => p.funcao === 'stt' && !p.pulado) ? audioDaSonda() : { origem: '—' }
  const resultados = []
  for (const item of plano) {
    if (item.pulado) {
      console.warn(`  pulado: ${item.sis.id} — ${item.pulado}`)
      resultados.push({
        provedor: PROVEDORES[item.sis.provedor].nome,
        funcao: item.funcao,
        sistema: item.sis.id,
        situacao: 'pulado',
        pulado: item.pulado,
      })
      continue
    }
    const r = await sondar(item, env, audio)
    console.warn(`  ${r.situacao}: ${item.sis.id}${r.violacoes?.length ? ` — ${r.violacoes.join('; ')}` : ''}`)
    resultados.push(r)
  }
  const meta = { geradoEm: new Date().toISOString(), audio: audio.origem, gastoUsd: gastoTotal() }
  const md = markdownDaSonda(resultados, meta)
  const saida = opt('saida', path.join(BANCADA_DIR, 'sonda'))
  mkdirSync(saida, { recursive: true })
  writeFileSync(path.join(saida, 'sonda-contratos.json'), `${JSON.stringify({ ...meta, resultados }, null, 2)}\n`)
  writeFileSync(path.join(saida, 'sonda-contratos.md'), md)
  console.log(md)
  if (resultados.some((x) => x.situacao === 'violação') && !flag('nao-falhar')) process.exit(1)
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((e) => {
    console.error('FALHOU:', e.message)
    process.exit(1)
  })
}
