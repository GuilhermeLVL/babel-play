/**
 * AS DECISÕES DA CONFERÊNCIA SOMENTE-LEITURA (`scripts/producao/conferir-producao.mjs`), sem rede: cada função
 * recebe o que uma resposta trouxe (status, cabeçalhos, corpo) e devolve itens `{ nome, estado, detalhe }`.
 * Separadas da rede para o teste (`tests/conferir-producao.test.ts`) cobrir cada veredicto sem chamar a internet.
 *
 * Estados: `ok` (✅), `aviso` (⚠️, informativo ou fora do ideal, não reprova) e `falha` (❌, crítico: sai com 1).
 */

/** O arquivo conhecido da voz no aparelho: o primeiro de `ARQUIVOS_DO_SUPERTONIC` (`src/core/voz/supertonic.ts`). */
export const ARQUIVO_DE_VOZ = { caminho: 'onnx/tts.json', bytes: 8_253 }
export const RAIZ_PADRAO_DOS_MODELOS = 'https://modelos.frasy.com.br/supertonic-3'

/**
 * Flags que, ligadas, abrem VENDA, IA de nuvem paga, anúncio ou avatar. Com `--esperar-fechado`, qualquer uma
 * ligada reprova. As demais (ex.: `oferta_planos`, `recompensas_v2`) só aparecem na lista.
 */
const FLAG_DE_RISCO = /^(venda_|vender_|avatar_|ia_|nuvem_)/
const FLAGS_DE_RISCO_EXATAS = new Set([
  'anuncios',
  'stt_ao_vivo',
  'assistente_ao_vivo',
  'voz_natural',
  'audiolivros_nuvem',
  'audiolivros_elenco',
])
export const ehFlagDeRisco = (chave) => FLAG_DE_RISCO.test(chave) || FLAGS_DE_RISCO_EXATAS.has(chave)

const item = (nome, estado, detalhe) => ({ nome, estado, detalhe })
const ehObjeto = (v) => typeof v === 'object' && v !== null && !Array.isArray(v)

/** 429 é o limitador do servidor ou da borda: a conferência para de insistir e diz por quê. */
function statusInesperado(nome, status) {
  if (status === 429) return item(nome, 'falha', '429: limitador atingido; NÃO repita agora, espere 15 min')
  if (status === 0) return item(nome, 'falha', 'sem resposta (rede ou tempo esgotado)')
  return item(nome, 'falha', `HTTP ${status}`)
}

/** `GET /api/health`: 200, `status: ok`, `db: up` e uma versão. */
export function avaliarHealth(status, corpo) {
  const nome = '/api/health'
  if (status !== 200) return [statusInesperado(nome, status)]
  if (!ehObjeto(corpo)) return [item(nome, 'falha', 'resposta sem JSON')]
  if (corpo.status !== 'ok') return [item(nome, 'falha', `status "${corpo.status}" (esperado "ok")`)]
  if (corpo.db !== 'up') return [item(nome, 'falha', `db "${corpo.db}" (esperado "up")`)]
  const versao = typeof corpo.versao === 'string' && corpo.versao ? corpo.versao : null
  return [
    item(nome, versao ? 'ok' : 'aviso', `ok, db up, banco ${corpo.banco ?? '?'}, versão ${versao ?? '(ausente)'}`),
  ]
}

/** `GET /api/ready`: 200; `degradado` (R2 fora) não reprova, só avisa (ADR 0009). */
export function avaliarReady(status, corpo) {
  const nome = '/api/ready'
  if (status !== 200) return [statusInesperado(nome, status)]
  const estado = ehObjeto(corpo) ? corpo.status : undefined
  if (estado === 'degradado') return [item(nome, 'aviso', `200 degradado: ${JSON.stringify(corpo).slice(0, 160)}`)]
  return [item(nome, 'ok', `200${estado ? ` (${estado})` : ''}`)]
}

/** `GET /api/abertura`: as portas de cadastro, venda e anual. Com `esperarFechado`, as três têm de estar fechadas. */
export function avaliarAbertura(status, corpo, { esperarFechado = false } = {}) {
  const nome = '/api/abertura'
  if (status !== 200) return [statusInesperado(nome, status)]
  if (!ehObjeto(corpo)) return [item(nome, 'falha', 'resposta sem JSON')]
  const portas = ['cadastro', 'checkout', 'anual']
  const texto = portas.map((p) => `${p}=${corpo[p] === true ? 'aberto' : corpo[p] === false ? 'fechado' : '?'}`)
  if (!esperarFechado) return [item(nome, 'ok', texto.join(', '))]
  const abertas = portas.filter((p) => corpo[p] !== false)
  if (abertas.length) return [item(nome, 'falha', `esperava tudo fechado; aberto/indefinido: ${abertas.join(', ')}`)]
  return [item(nome, 'ok', `${texto.join(', ')} (como esperado)`)]
}

/** As chaves ligadas de `{ flags: { <chave>: { ligada } } }`, em ordem alfabética. */
export function flagsLigadas(corpo) {
  if (!ehObjeto(corpo) || !ehObjeto(corpo.flags)) return null
  return Object.entries(corpo.flags)
    .filter(([, v]) => ehObjeto(v) && v.ligada === true)
    .map(([k]) => k)
    .sort()
}

/**
 * `GET /api/flags` SEM token: o resultado para um visitante sem conta. Flag com alvo por plano ou lista de ids pode
 * estar ligada para alguém e aparecer desligada aqui; a lista completa é `flags listar` (CLI) ou Admin → Flags.
 */
export function avaliarFlags(status, corpo, { esperarFechado = false } = {}) {
  const nome = '/api/flags'
  if (status !== 200) return [statusInesperado(nome, status)]
  const ligadas = flagsLigadas(corpo)
  if (!ligadas) return [item(nome, 'falha', 'resposta fora da forma { flags: {...} }')]
  const total = Object.keys(corpo.flags).length
  const lista = ligadas.length ? ligadas.join(', ') : 'nenhuma'
  const deRisco = ligadas.filter(ehFlagDeRisco)
  if (esperarFechado && deRisco.length) {
    return [item(nome, 'falha', `flags de venda/IA/avatar ligadas: ${deRisco.join(', ')} (de ${total})`)]
  }
  return [item(nome, 'ok', `${ligadas.length} de ${total} ligadas (visitante sem conta): ${lista}`)]
}

/** Cabeçalho por nome, sem caixa, de um objeto simples (`Object.fromEntries(resposta.headers)`). */
const cab = (cabecalhos, nome) => {
  const achado = Object.entries(cabecalhos ?? {}).find(([k]) => k.toLowerCase() === nome)
  return achado ? String(achado[1]) : null
}

/** Os cabeçalhos de segurança da home (os do `dist/_headers`, `scripts/vite/cabecalhos.ts`). */
export function avaliarCabecalhos(status, cabecalhos) {
  const nome = 'cabeçalhos de /'
  if (status !== 200) return [statusInesperado('/ (home)', status)]
  const itens = [item('/ (home)', 'ok', '200')]
  const csp = cab(cabecalhos, 'content-security-policy')
  if (csp) itens.push(item(`${nome}: CSP`, 'ok', `presente (${csp.length} caracteres)`))
  else if (cab(cabecalhos, 'content-security-policy-report-only'))
    itens.push(item(`${nome}: CSP`, 'falha', 'só Report-Only: a CSP não bloqueia'))
  else itens.push(item(`${nome}: CSP`, 'falha', 'ausente'))

  const hsts = cab(cabecalhos, 'strict-transport-security')
  const maxAge = hsts ? Number(/max-age=(\d+)/i.exec(hsts)?.[1] ?? 0) : 0
  if (!hsts) itens.push(item(`${nome}: HSTS`, 'falha', 'ausente'))
  else if (maxAge < 15_552_000) itens.push(item(`${nome}: HSTS`, 'aviso', `max-age curto: ${hsts}`))
  else itens.push(item(`${nome}: HSTS`, 'ok', hsts))

  const xcto = cab(cabecalhos, 'x-content-type-options')
  itens.push(
    xcto?.toLowerCase() === 'nosniff'
      ? item(`${nome}: X-Content-Type-Options`, 'ok', 'nosniff')
      : item(`${nome}: X-Content-Type-Options`, 'falha', xcto ?? 'ausente'),
  )

  /* O isolamento (threads do WASM): COOP + COEP no modo completo, ou só o Document-Isolation-Policy no modo `dip`
     (`server/http/isolamento.ts`). Um dos dois tem de estar lá; `CROSS_ORIGIN_ISOLATION=0` desliga por decisão. */
  const coop = cab(cabecalhos, 'cross-origin-opener-policy')
  const coep = cab(cabecalhos, 'cross-origin-embedder-policy')
  const dip = cab(cabecalhos, 'document-isolation-policy')
  const completo = coop === 'same-origin' && (coep === 'credentialless' || coep === 'require-corp')
  const detalhe = `COOP=${coop ?? '—'}, COEP=${coep ?? '—'}, DIP=${dip ?? '—'}`
  if (completo || dip) itens.push(item(`${nome}: isolamento`, 'ok', detalhe))
  else itens.push(item(`${nome}: isolamento`, 'falha', `sem COOP/COEP nem DIP (${detalhe})`))
  return itens
}

/** `/robots.txt`: 200 e texto; um `Disallow: /` sozinho tira o site da busca (aviso). */
export function avaliarRobots(status, texto) {
  const nome = '/robots.txt'
  if (status !== 200) return [statusInesperado(nome, status)]
  const fechado = /^\s*disallow:\s*\/\s*$/im.test(texto)
  const sitemap = /^\s*sitemap:/im.test(texto)
  if (fechado) return [item(nome, 'aviso', 'Disallow: / (buscadores bloqueados)')]
  return [item(nome, sitemap ? 'ok' : 'aviso', sitemap ? '200, aponta o sitemap' : '200, sem linha Sitemap:')]
}

/** `/sitemap.xml`: 200 com `<urlset`; conta as URLs. */
export function avaliarSitemap(status, texto) {
  const nome = '/sitemap.xml'
  if (status !== 200) return [statusInesperado(nome, status)]
  if (!/<urlset/i.test(texto)) return [item(nome, 'falha', '200 sem <urlset>')]
  const urls = (texto.match(/<loc>/gi) ?? []).length
  return [item(nome, 'ok', `${urls} URL(s)`)]
}

/** `/ads.txt`: informativo (precisa de `ADSENSE_PUB_ID` no build; anúncios estão desligados). Nunca reprova. */
export function avaliarAdsTxt(status, texto) {
  const nome = '/ads.txt'
  if (status === 200 && texto.trim()) return [item(nome, 'ok', `200, ${texto.trim().split('\n').length} linha(s)`)]
  return [item(nome, 'aviso', `HTTP ${status} (informativo: sem ADSENSE_PUB_ID não há ads.txt)`)]
}

/** Uma página HTML que tem de carregar (`/planos`, `/app`), opcionalmente com um trecho esperado. */
export function avaliarPagina(nome, status, texto, { contem } = {}) {
  if (status !== 200) return [statusInesperado(nome, status)]
  if (!/<html/i.test(texto)) return [item(nome, 'falha', '200 sem HTML')]
  if (contem && !texto.includes(contem)) return [item(nome, 'falha', `200 sem o trecho "${contem}"`)]
  return [item(nome, 'ok', `200${contem ? `, contém "${contem}"` : ''}`)]
}

/**
 * HEAD num arquivo conhecido dos pesos da voz: 200 e o tamanho fixado no código. Com `origem`, confere o CORS
 * (o navegador do app baixa de outra origem). Tamanho ausente ou CORS diferente só avisam.
 *
 * @param {number} status
 * @param {Record<string, string>} cabecalhos
 * @param {{ origem?: string, bytes?: number }} [opcoes]
 */
export function avaliarModelo(status, cabecalhos, { origem, bytes = ARQUIVO_DE_VOZ.bytes } = {}) {
  const nome = `modelo de voz (HEAD ${ARQUIVO_DE_VOZ.caminho})`
  if (status !== 200) return [statusInesperado(nome, status)]
  const tamanho = cab(cabecalhos, 'content-length')
  const itens = []
  if (tamanho === null) itens.push(item(nome, 'aviso', '200 sem content-length'))
  else if (Number(tamanho) !== bytes) itens.push(item(nome, 'falha', `content-length ${tamanho} (esperado ${bytes})`))
  else itens.push(item(nome, 'ok', `200, ${bytes} bytes`))
  if (origem) {
    const acao = cab(cabecalhos, 'access-control-allow-origin')
    const ok = acao === '*' || acao === origem
    itens.push(item('modelo de voz: CORS', ok ? 'ok' : 'aviso', `allow-origin=${acao ?? '—'} para ${origem}`))
  }
  return itens
}

/** Opcional: a origem SEM o cabeçalho da borda (`x-origem-segredo`) tem de responder 403 (LANCAMENTO §9.3). */
export function avaliarOrigemDireta(status) {
  const nome = 'origem direta sem x-origem-segredo'
  if (status === 403) return [item(nome, 'ok', '403, como esperado')]
  if (status === 0) return [item(nome, 'aviso', 'sem resposta (workers.dev desligado?)')]
  return [item(nome, 'falha', `HTTP ${status} (esperado 403)`)]
}

const ICONE = { ok: '✅', aviso: '⚠️', falha: '❌' }

/** A tabela em texto e o código de saída: 1 se algum item falhou. */
export function resumir(itens) {
  const largura = Math.max(...itens.map((i) => i.nome.length), 4)
  const linhas = itens.map((i) => `${ICONE[i.estado] ?? '?'}  ${i.nome.padEnd(largura)}  ${i.detalhe}`)
  const conta = (e) => itens.filter((i) => i.estado === e).length
  const falhas = conta('falha')
  linhas.push('', `${conta('ok')} ok, ${conta('aviso')} aviso(s), ${falhas} falha(s)`)
  return { texto: linhas.join('\n'), codigo: falhas > 0 ? 1 : 0 }
}

/** `--url <base> [--esperar-fechado] [--modelos <raiz>] [--origem <url-direta>]`. Lança em uso errado. */
export function lerArgumentos(argv) {
  const opcoes = { url: null, esperarFechado: false, modelos: RAIZ_PADRAO_DOS_MODELOS, origem: null }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--esperar-fechado') opcoes.esperarFechado = true
    else if (a === '--url' || a === '--modelos' || a === '--origem') {
      const v = argv[++i]
      if (!v || v.startsWith('--')) throw new Error(`${a} pede um valor`)
      opcoes[a.slice(2)] = v
    } else throw new Error(`argumento desconhecido: ${a}`)
  }
  if (!opcoes.url) throw new Error('falta --url <base> (ex.: --url https://frasy.com.br)')
  for (const k of ['url', 'modelos', 'origem']) {
    if (opcoes[k] === null) continue
    let u
    try {
      u = new URL(opcoes[k])
    } catch {
      throw new Error(`--${k} não é uma URL: ${opcoes[k]}`)
    }
    if (u.protocol !== 'https:' && u.hostname !== '127.0.0.1' && u.hostname !== 'localhost') {
      throw new Error(`--${k} precisa ser https: ${opcoes[k]}`)
    }
    opcoes[k] = opcoes[k].replace(/\/+$/, '')
  }
  return opcoes
}
