/**
 * AS DIRETIVAS DA CSP — Fase 6 do plano de lançamento.
 *
 * Até aqui `connect-src` e `img-src` eram `https:`: qualquer host da internet. Para `connect-src`
 * isso anulava a CSP como barreira contra exfiltração — um script injetado mandava o que quisesse
 * para onde quisesse. A lista abaixo é a dos hosts que o CLIENTE chama de fato, levantada lendo o
 * código em 2026-09-24 (todo `fetch` absoluto de `src/`, e os que as bibliotecas fazem por ele):
 *
 *   huggingface.co, *.huggingface.co, *.hf.co   pesos do Whisper/opus-mt/WeSpeaker (transformers.js
 *                                               baixa do Hub e o Hub redireciona para a CDN) e a
 *                                               consulta de versão (`src/gateway/modelManifest.ts`)
 *   cdn.jsdelivr.net                            o runtime WASM do ONNX: sem `wasmPaths` próprio, o
 *                                               transformers.js baixa `ort-wasm-*.{mjs,wasm}` de lá
 *                                               (node_modules/@huggingface/transformers/src/backends/onnx.js)
 *   *.wiktionary.org                            o verbete do dicionário (`src/lib/dictionary.ts`) e as
 *                                               figuras que ele traz, com autor e licença
 *                                               (`src/lib/imagens/imagensDaPalavra.ts`): é a mesma API
 *   api.openverse.org                           a busca de imagem direta, quando a API cai
 *                                               (`src/data/rotas/imagens.ts`)
 *   api.mymemory.translated.net                 a tradução de reserva do cliente
 *                                               (`src/gateway/adapters/mymemory.ts`)
 *   localhost:11434 / 127.0.0.1:11434           o Ollama LOCAL de quem o tem (`src/gateway/profiles.ts`)
 *
 * E os que dependem do deploy, lidos do ambiente (origem só — caminho e chave não entram):
 *
 *   SUPABASE_URL / VITE_SUPABASE_URL            o login (supabase-js)
 *   VITE_SELF_HOST_MODELS (quando é URL)        o bucket R2 dos pesos dos modelos
 *   VITE_BERGAMOT_MODELOS_URL                   os modelos do Bergamot num R2/CDN (o motor, que é
 *                                               código, vem sempre do próprio domínio: `script-src`
 *                                               não muda)
 *   VITE_SENTRY_DSN                             o envio de erro do navegador
 *   VITE_ORT_WASM_URL                           o runtime do ONNX (`ort-wasm-*.{wasm,mjs}`) num R2/CDN
 *                                               (`src/gateway/baseDoWasm.ts`). ESTE é código: entra
 *                                               também em `script-src` e `worker-src` (ver abaixo)
 *
 *   VITE_TURNSTILE_SITE_KEY (quando existe)     o captcha do Cloudflare Turnstile no convidado com
 *                                               nuvem (Fase 7): script, frame e conexão em
 *                                               `challenges.cloudflare.com`. Sem a chave, nada entra.
 *
 * As `VITE_*` são embutidas no bundle em BUILD; o `Dockerfile` as repete como `ENV` do runtime para
 * a CSP enxergar os mesmos valores que o bundle usa.
 *
 * `img-src` CONTINUA com `https:`, e é decisão, não esquecimento: a capa de sessão escolhida no
 * Openverse é gravada com a URL ORIGINAL da imagem (`src/components/ui/SeletorDeCapa.tsx`), que
 * pode estar em qualquer acervo (Flickr, Wikimedia, museus). Fechar `img-src` apagaria capas já
 * gravadas. Imagem é conteúdo passivo; o canal de exfiltração que importa é `connect-src`.
 *
 * As fontes são do próprio site (pacotes `@fontsource`, emitidos em `/assets` pelo build): `font-src` é só
 * `'self'` e `style-src` não abre nenhuma origem de folha. O Google Fonts saiu em 03/10/2026 — pedir as
 * fontes a ele entregava o IP de cada visitante ao Google (LGPD, docs/lgpd/operadores.md).
 */

/** O que o `helmet` recebe em `contentSecurityPolicy.directives`. */
export interface DiretivasDeCsp {
  defaultSrc: string[]
  scriptSrc: string[]
  workerSrc: string[]
  connectSrc: string[]
  imgSrc: string[]
  mediaSrc: string[]
  styleSrc: string[]
  fontSrc: string[]
  objectSrc: string[]
  frameAncestors: string[]
  baseUri: string[]
  formAction: string[]
  /** Só existe com o Turnstile ligado; sem ela, frames seguem o `default-src 'self'`. */
  frameSrc?: string[]
}

/** O host do Cloudflare Turnstile (script oficial, iframe do desafio e a verificação). */
export const HOST_DO_TURNSTILE = 'https://challenges.cloudflare.com'

const CONEXOES_FIXAS = [
  'https://huggingface.co',
  'https://*.huggingface.co',
  'https://*.hf.co',
  'https://cdn.jsdelivr.net',
  'https://*.wiktionary.org',
  'https://api.openverse.org',
  'https://api.mymemory.translated.net',
  'http://localhost:11434',
  'http://127.0.0.1:11434',
]

/** A ORIGEM (`https://host[:porta]`) de uma URL, ou `null` se ela não for http(s) válida. */
function origemDe(valor: string | undefined): string | null {
  const v = valor?.trim()
  if (!v) return null
  try {
    const u = new URL(v)
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
    return u.origin
  } catch {
    return null
  }
}

/**
 * A ORIGEM DE ANÚNCIOS (`ANUNCIOS_ORIGEM`, rulings R32 e R35): o Worker próprio `frasy-anuncios` que o app
 * embute por `<iframe credentialless>`. Só a origem; só `https` (ou `http` em localhost, para o
 * `worker:dev`). NUNCA a origem do app (`app`, a da requisição, ou a de `APP_URL`): igual = falha fechada.
 * Inválida, ausente ou igual = `null`, e nada muda na CSP.
 */
export function origemDosAnuncios(env: NodeJS.ProcessEnv = process.env, app: string | null = null): string | null {
  const o = origemDe(env.ANUNCIOS_ORIGEM)
  if (!o) return null
  if (o === app || o === origemDe(env.APP_URL)) return null
  const u = new URL(o)
  if (u.protocol === 'https:' || u.hostname === 'localhost' || u.hostname === '127.0.0.1') return o
  return null
}

export interface OpcoesDaCsp {
  /** A flag `anuncios` está ligada (quem lê é o chamador: o Worker, com cache de 60 s). */
  anuncios?: boolean
}

export function diretivasDeCsp(env: NodeJS.ProcessEnv = process.env, opcoes: OpcoesDaCsp = {}): DiretivasDeCsp {
  const doDeploy = [
    origemDe(env.SUPABASE_URL),
    origemDe(env.VITE_SUPABASE_URL),
    /* `VITE_SELF_HOST_MODELS=1` significa "mesmo domínio" e não acrescenta nada; só uma URL traz
       host novo (o bucket R2 público dos pesos). */
    origemDe(env.VITE_SELF_HOST_MODELS),
    /* A9b: sem ela, os `.gz` do Bergamot saem do próprio domínio (`'self'`). */
    origemDe(env.VITE_BERGAMOT_MODELOS_URL),
    /* O DSN tem a chave pública no userinfo; `origin` a descarta e fica só o host de ingestão. */
    origemDe(env.VITE_SENTRY_DSN),
  ].filter((o): o is string => o !== null)

  /* O runtime do ONNX fora do domínio (`VITE_ORT_WASM_URL`). O `onnxruntime-web` 1.26
     (`importWasmModule` em `dist/ort.wasm.mjs`) carrega o `ort-wasm-simd-threaded.mjs` assim: com UMA
     thread, `import()` direto da URL de outra origem (precisa de `script-src`); com várias, `fetch`
     (`connect-src`) e `import()` do `blob:`. O `.wasm` vem por `fetch`. `worker-src` cobre as threads do
     Emscripten quando o loader é servido de lá. Sem a variável, nada entra (o padrão é `/`). */
  const runtimeDoOnnx = [origemDe(env.VITE_ORT_WASM_URL)].filter((o): o is string => o !== null)

  /* Fase 7: o captcha do convidado só entra na CSP quando a chave pública existe no deploy. */
  const turnstile = env.VITE_TURNSTILE_SITE_KEY?.trim() ? [HOST_DO_TURNSTILE] : []

  const conexoes = [
    ...new Set(["'self'", 'blob:', 'data:', ...CONEXOES_FIXAS, ...doDeploy, ...runtimeDoOnnx, ...turnstile]),
  ]

  /* R32: com a flag ligada E a origem configurada, a página de anúncios entra SÓ em `frame-src`. Nada em
     `script-src`: o GPT roda lá, nunca no documento do app. */
  const anuncios = opcoes.anuncios ? [origemDosAnuncios(env)].filter((o): o is string => o !== null) : []
  const quadros = [...turnstile, ...anuncios]

  return {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'", "'wasm-unsafe-eval'", 'blob:', ...runtimeDoOnnx, ...turnstile],
    workerSrc: ["'self'", 'blob:', ...runtimeDoOnnx],
    connectSrc: conexoes,
    imgSrc: ["'self'", 'https:', 'data:', 'blob:'],
    mediaSrc: ["'self'", 'blob:', 'data:'],
    styleSrc: ["'self'", "'unsafe-inline'"],
    // `data:`: o Vite embute no CSS as faces pequenas (Silkscreen, < 4 KB) como data URI; sem isto o
    // navegador as recusa e a marca cai na fonte de reserva (visto no staging, 03/10/2026).
    fontSrc: ["'self'", 'data:'],
    objectSrc: ["'none'"],
    frameAncestors: ["'self'"],
    baseUri: ["'self'"],
    formAction: ["'self'"],
    ...(quadros.length ? { frameSrc: ["'self'", ...quadros] } : {}),
  }
}

/**
 * A SOBREPOSIÇÃO DO WORKER (ruling R31): a CSP do `_headers` é fixa no build; com os anúncios ligados o
 * Worker acrescenta a origem de anúncios em `frame-src` do cabeçalho que veio do `ASSETS` — e só ali.
 * Sem `frame-src`, cria `frame-src 'self' <origem>` (antes valia o `default-src 'self'`). Idempotente.
 */
export function cspComAnuncios(cabecalho: string, origem: string): string {
  const diretivas = cabecalho
    .split(';')
    .map((d) => d.trim())
    .filter(Boolean)
  const i = diretivas.findIndex((d) => d.split(/\s+/)[0].toLowerCase() === 'frame-src')
  if (i < 0) return [...diretivas, `frame-src 'self' ${origem}`].join('; ')
  const valores = diretivas[i].split(/\s+/)
  if (!valores.includes(origem)) diretivas[i] = [...valores, origem].join(' ')
  return diretivas.join('; ')
}

/**
 * A política como texto de cabeçalho (`default-src 'self'; script-src ...`), para quem não passa pelo
 * `helmet`: o `dist/_headers` das edições estáticas (`scripts/vite/cabecalhos.ts`). Mesma fonte, mesmas
 * diretivas, na ordem de `diretivasDeCsp`. Sem `upgrade-insecure-requests`: é o helmet que o acrescenta.
 */
export function serializarCsp(d: DiretivasDeCsp): string {
  return Object.entries(d)
    .filter((par): par is [string, string[]] => Array.isArray(par[1]))
    .map(([nome, valores]) => [nome.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase()), ...valores].join(' '))
    .join('; ')
}
