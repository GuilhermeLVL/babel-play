/**
 * O CLIENTE DO OPENROUTER DA BANCADA DE IA PAGA — o pedido da produção, o preço-teto ZDR e a chamada com streaming.
 *
 * O PEDIDO É O DA PRODUÇÃO (`llmClient.ts` → `chamarChat`): `model`, `messages`, `temperature`, `max_tokens` e o que
 * `parametrosDoProvedor` acrescenta para a base do OpenRouter — o roteamento de retenção zero (`data_collection:
 * deny`, `zdr: true`, `ignore` do Vertex e do AI Studio) e o raciocínio "low" do gpt-oss. A MESMA função, importada.
 * A bancada acrescenta só o que não muda o texto gerado: `stream: true` (para medir o TTFT — a produção usa
 * `stream: false`, e o que a pessoa espera hoje é a latência TOTAL) e `usage.include` (o custo real na resposta).
 *
 * AJUSTE DE CANDIDATO (`modelo@esforço`, `modelo~provedor+provedor`): como em `bancada/nuvem.mjs`, o `@low`/`@none`
 * é raciocínio que a produção ainda NÃO manda para aquele modelo, e `~groq+cerebras` restringe o provedor (o
 * `only` do roteamento, que `parametrosDoProvedor` aceita e endurece). O bruto marca `foraDaProducao` quando o
 * ajuste muda o pedido — trocar o padrão exige levar o ajuste ao registro junto.
 *
 * PREÇO É CONDIÇÃO PARA CHAMAR, e a mesma consulta prova a retenção zero: o preço-teto de cada modelo é o MAIOR entre
 * os endpoints de `GET /api/v1/endpoints/zdr` (sem os do Google). Modelo sem endpoint ZDR não tem teto e não sai —
 * é pulado e registrado. A reserva do livro-caixa usa esse teto (pior caso); o acerto usa o `usage.cost` real.
 *
 * NUNCA GEMINI: qualquer id com "gemini" é recusado aqui, antes de qualquer chamada.
 */
/* global AbortSignal, TextDecoder */
import { parametrosDoProvedor } from '../../server/ai/parametrosDoProvedor.ts'

export const BASE_OPENROUTER = 'https://openrouter.ai/api/v1'
/** = `bancada/nuvem.mjs`: o cabeçalho que o provedor põe em volta das mensagens, em tokens (pior caso). */
export const CABECALHO_DO_CHAT_TOKENS = 256

/**
 * `modelo[@esforço][~provedor+provedor]` → partes. Ex.: `openai/gpt-oss-120b~groq+cerebras`,
 * `deepseek/deepseek-v4.1-flash@low`.
 */
export function interpretarSistema(spec) {
  const s = String(spec ?? '').trim()
  let resto = s
  let only = null
  const til = resto.indexOf('~')
  if (til > 0) {
    only = resto
      .slice(til + 1)
      .split('+')
      .map((x) => x.trim().toLowerCase())
      .filter(Boolean)
    resto = resto.slice(0, til)
  }
  let esforco = null
  const arroba = resto.lastIndexOf('@')
  if (arroba > 0) {
    esforco = resto.slice(arroba + 1) || null
    resto = resto.slice(0, arroba)
  }
  if (!/^[\w.-]+\/[\w.:-]+$/.test(resto)) throw new Error(`id de modelo inválido: ${spec}`)
  if (/gemini/i.test(resto)) throw new Error(`${spec}: a API do Gemini é proibida (o app atende menores)`)
  if (/:free$/i.test(resto)) throw new Error(`${spec}: modelo gratuito pode treinar com os dados — fora`)
  return { id: s, modelo: resto, esforco, only }
}

const ehDoGoogle = (e) => /google/i.test(String(e.provider_name ?? '')) || /^google/i.test(String(e.tag ?? ''))

/** O slug do provedor no roteamento do OpenRouter (`groq`, `cerebras`…), tirado da `tag` (`groq/fp8` → `groq`). */
const slugDoProvedor = (e) =>
  String(e.tag ?? e.provider_name ?? '')
    .split('/')[0]
    .toLowerCase()

/**
 * O preço-teto ZDR de um sistema, em US$ por 1M tokens: o MAIOR entre os endpoints ZDR do modelo (sem os do Google;
 * com `only`, só os dos provedores pedidos). `null` = sem endpoint ZDR elegível — o sistema não pode ser chamado.
 */
export function tetoDePrecoZdr(endpoints, sis) {
  const elegiveis = (endpoints ?? []).filter(
    (e) => e.model_id === sis.modelo && !ehDoGoogle(e) && (!sis.only || sis.only.includes(slugDoProvedor(e))),
  )
  if (!elegiveis.length) return null
  const n = (v) => Number(v) * 1e6
  return {
    entrada: Math.max(...elegiveis.map((e) => n(e.pricing?.prompt ?? 0))),
    saida: Math.max(...elegiveis.map((e) => n(e.pricing?.completion ?? 0))),
    endpoints: elegiveis.length,
    provedores: [...new Set(elegiveis.map((e) => e.provider_name))].sort(),
  }
}

/**
 * Provedores que dizem aceitar `reasoning` mas IGNORAM `reasoning.enabled: false` (o modelo pensa do mesmo jeito):
 * o ajuste `@none` os tira do roteamento, senão o "sem raciocínio" medido seria um sorteio de provedor.
 */
export const IGNORAM_RACIOCINIO_DESLIGADO = Object.freeze(['novita'])

/** O ajuste `@esforço` no dialeto do OpenRouter (= `bancada/nuvem.mjs`). */
function ajusteDeEsforco(esforco) {
  if (!esforco) return {}
  const desligar = esforco === 'none' || esforco === 'off'
  return { reasoning: desligar ? { enabled: false } : { effort: esforco, exclude: true } }
}

const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b)

/** O que só a bancada acrescenta e não muda o texto gerado: streaming (para o TTFT) e o custo na resposta. */
export const CAMPOS_DA_BANCADA = Object.freeze(['stream', 'usage'])

/**
 * O corpo do pedido, pronto para o `fetch` — o MESMO que `chamarChat` (`server/ai/llmClient.ts`) monta: `model`,
 * `messages`, `temperature`, `max_tokens` e `parametrosDoProvedor(base, model, roteamento, { formato, legenda })`,
 * com a saída estruturada (`formato`, de `src/lib/esquemasDeSaida.ts`) e o roteamento da legenda (`legenda: true`).
 * `tests/eval/ia-paga-cliente.test.ts` compara byte a byte com o corpo que o servidor manda.
 *
 * `parametros` diz o que veio da produção, o que é ajuste de candidato e se o ajuste muda o pedido (`foraDaProducao`).
 * Sem ajuste, o corpo é conferido contra `parametrosDoProvedor` e qualquer divergência LANÇA: medir um pedido que a
 * produção não manda é medir outro produto. `respostaJson` (só os JUÍZES, que não são produção) pede `json_object`.
 * `roteamento`: o `roteamento` declarado do provedor no registro (`ops/ia-provedores.openrouter.json`, como a perna da
 * produção o leva). Ausente = o padrão endurecido (ZDR, sem Google).
 */
export function montarCorpo({
  sis,
  mensagens,
  temperatura,
  maxTokens,
  formato,
  legenda = false,
  respostaJson = false,
  roteamento,
}) {
  const opcoes = { ...(formato ? { formato } : {}), ...(legenda ? { legenda: true } : {}) }
  const producao = parametrosDoProvedor(BASE_OPENROUTER, sis.modelo, roteamento, opcoes)
  const desligaRaciocinio = sis.esforco === 'none' || sis.esforco === 'off'
  const ajusteDeRota =
    sis.only || desligaRaciocinio
      ? {
          ...producao.provider,
          ...(sis.only ? { only: sis.only, allow_fallbacks: false } : {}),
          ...(desligaRaciocinio
            ? { ignore: [...new Set([...(producao.provider.ignore ?? []), ...IGNORAM_RACIOCINIO_DESLIGADO])] }
            : {}),
        }
      : null
  const doRoteamento = ajusteDeRota ? parametrosDoProvedor(BASE_OPENROUTER, sis.modelo, ajusteDeRota, opcoes) : producao
  const ajuste = ajusteDeEsforco(sis.esforco)
  const foraDaProducao = Boolean(ajusteDeRota) || Object.entries(ajuste).some(([k, v]) => !igual(producao[k], v))
  const corpo = {
    model: sis.modelo,
    messages: mensagens,
    stream: true,
    ...(temperatura !== undefined ? { temperature: temperatura } : {}),
    max_tokens: maxTokens,
    ...doRoteamento,
    ...ajuste,
    ...(respostaJson ? { response_format: { type: 'json_object' } } : {}),
    usage: { include: true },
  }
  // A regra dura, conferida no corpo final (nada acima pode afrouxar): retenção zero e sem Google.
  if (corpo.provider?.zdr !== true || corpo.provider?.data_collection !== 'deny')
    throw new Error(`${sis.id}: pedido sem retenção zero — recusado`)
  for (const g of ['google-vertex', 'google-ai-studio'])
    if (!corpo.provider.ignore?.includes(g)) throw new Error(`${sis.id}: pedido sem ignorar ${g} — recusado`)
  // Sem ajuste e sem ser juiz: o corpo TEM de ser o da produção.
  if (!foraDaProducao && !respostaJson) {
    for (const [k, v] of Object.entries(producao))
      if (!igual(corpo[k], v)) throw new Error(`${sis.id}: o pedido diverge da produção em "${k}" — recusado`)
    const extras = Object.keys(corpo).filter(
      (k) => !(k in producao) && !['model', 'messages', 'temperature', 'max_tokens', ...CAMPOS_DA_BANCADA].includes(k),
    )
    if (extras.length) throw new Error(`${sis.id}: campos fora da produção no pedido (${extras.join(', ')}) — recusado`)
  }
  return { corpo, parametros: { producao, ajuste, roteamento: corpo.provider, foraDaProducao } }
}

/** O pior caso da chamada (reserva): entrada ≤ 1 token por caractere + cabeçalho; saída = `max_tokens` inteiro. */
export function piorCasoUsd(corpo, preco) {
  const caracteres = corpo.messages.reduce((n, m) => n + String(m.content ?? '').length, 0)
  return ((caracteres + CABECALHO_DO_CHAT_TOKENS) * preco.entrada + corpo.max_tokens * preco.saida) / 1e6
}

/**
 * Lê um fluxo SSE do OpenRouter já acumulado em `linhas` (cada `data: {…}`). Devolve o texto, o uso e o provedor.
 * Comentários (`: OPENROUTER PROCESSING`) e `[DONE]` são ignorados; um `error` no meio do fluxo vira `erro`.
 */
export function lerEventoSse(linha, estado) {
  const l = linha.trim()
  if (!l.startsWith('data:')) return estado
  const dado = l.slice(5).trim()
  if (!dado || dado === '[DONE]') return estado
  let j
  try {
    j = JSON.parse(dado)
  } catch {
    return estado
  }
  if (j.error) estado.erro = String(j.error.message ?? j.error).slice(0, 200)
  const delta = j.choices?.[0]?.delta?.content
  if (typeof delta === 'string' && delta) {
    estado.texto += delta
    estado.primeiroConteudo ??= true
  }
  if (j.choices?.[0]?.finish_reason) estado.fim = j.choices[0].finish_reason
  if (j.usage) estado.uso = j.usage
  if (typeof j.provider === 'string') estado.provedor = j.provider
  return estado
}

/** Erro que não adianta repetir (4xx que não é 429): para o sistema, não a bancada. */
export class RecusaDoProvedor extends Error {}

/**
 * A CHAVE não pode mais gastar (401/402/403: limite de gasto da chave, saldo, chave inválida). Não é falha do modelo:
 * para a bancada inteira, como o teto do livro-caixa — gravar "sem resposta" para todos os casos apagaria a medição.
 */
export class LimiteDaChave extends Error {}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * UMA chamada com streaming: reserva o pior caso no livro-caixa ANTES, mede TTFT (primeiro pedaço de conteúdo) e
 * total, acerta pelo `usage.cost` (sem ele, cobra o reservado). 429/5xx: até 2 novas tentativas, cada uma com a sua
 * reserva (4xx/5xx não são cobrados: a reserva é cancelada). `TetoDeGasto` do livro sobe sem chamar.
 * `aoConteudo(texto, ms, tentativa)`: opcional, o texto acumulado a cada pedaço (ms desde o início da tentativa).
 */
export async function chamar({ corpo, preco, livro, rotulo, chave, timeoutMs = 60_000, tentativas = 4, aoConteudo }) {
  let ultimo = null
  for (let t = 0; t < tentativas; t++) {
    const reserva = livro.reservar(rotulo, piorCasoUsd(corpo, preco))
    const t0 = performance.now()
    let r
    try {
      r = await fetch(`${BASE_OPENROUTER}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(corpo),
        signal: AbortSignal.timeout(timeoutMs),
      })
    } catch (e) {
      reserva.cancelar()
      ultimo = `rede: ${String(e.message).slice(0, 120)}`
      await esperar(1500 * (t + 1))
      continue
    }
    if (!r.ok) {
      reserva.cancelar()
      const corpoErro = (await r.text().catch(() => '')).slice(0, 200)
      ultimo = `HTTP ${r.status}: ${corpoErro}`
      if ([401, 402, 403].includes(r.status)) throw new LimiteDaChave(ultimo)
      if (r.status !== 429 && r.status < 500) throw new RecusaDoProvedor(ultimo)
      await esperar((r.status === 429 ? 6000 : 2000) * (t + 1))
      continue
    }
    const estado = { texto: '', uso: null, provedor: null, erro: null, fim: null, primeiroConteudo: null }
    let ttftMs = null
    try {
      const leitor = r.body.getReader()
      const dec = new TextDecoder()
      let buffer = ''
      for (;;) {
        const { done, value } = await leitor.read()
        if (done) break
        buffer += dec.decode(value, { stream: true })
        let i
        while ((i = buffer.indexOf('\n')) >= 0) {
          const linha = buffer.slice(0, i)
          buffer = buffer.slice(i + 1)
          const antes = estado.texto.length
          lerEventoSse(linha, estado)
          if (ttftMs === null && estado.texto.length > antes) ttftMs = performance.now() - t0
          /* Quem mede mais que o TTFT (o tempo até a primeira sugestão do "Como respondo?") lê o texto que cresce. */
          if (aoConteudo && estado.texto.length > antes) aoConteudo(estado.texto, performance.now() - t0, t)
        }
      }
      if (buffer) lerEventoSse(buffer, estado)
    } catch (e) {
      // O fluxo caiu no meio: o provedor pode ter cobrado — cobra o reservado (o lado seguro).
      reserva.acertar(Number.NaN)
      ultimo = `fluxo interrompido: ${String(e.message).slice(0, 120)}`
      await esperar(1500 * (t + 1))
      continue
    }
    const totalMs = performance.now() - t0
    const custo = Number(estado.uso?.cost)
    reserva.acertar(Number.isFinite(custo) && custo >= 0 ? custo : Number.NaN)
    if (estado.erro && !estado.texto) {
      ultimo = `erro no fluxo: ${estado.erro}`
      await esperar(1500 * (t + 1))
      continue
    }
    const u = estado.uso ?? {}
    return {
      texto: estado.texto.trim(),
      ttftMs,
      totalMs,
      usd: Number.isFinite(custo) ? custo : null,
      tokensEntrada: u.prompt_tokens ?? null,
      tokensSaida: u.completion_tokens ?? null,
      tokensEmCache: u.prompt_tokens_details?.cached_tokens ?? null,
      tokensDeRaciocinio: u.completion_tokens_details?.reasoning_tokens ?? null,
      fim: estado.fim,
      provedor: estado.provedor,
    }
  }
  throw new Error(ultimo ?? 'falhou')
}
