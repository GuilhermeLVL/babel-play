/**
 * Cloudflare Pages Function — proxy de `/api/*` para a API (Cloud Run).
 *
 * O front é estático no Pages (banda ilimitada — os 40 MB de wasm/onnx por visitante novo não
 * cabem no egress de nenhum free tier de API). A API roda em outro host; este proxy mantém a
 * origem única que o cliente assume (`apiFetch` chama caminhos relativos `/api/…`), e com isso
 * não há CORS nem cookie cruzado.
 *
 * `API_ORIGIN` é uma variável do projeto Pages. Sem ela — enquanto a API não foi publicada — a
 * resposta é um 503 JSON que diz exatamente isso, em vez de um 404 mudo. O modo sem conta nunca
 * chega aqui: ele responde no navegador.
 */
interface Env { API_ORIGIN?: string }
// Tipo mínimo do Pages Function — evita depender de @cloudflare/workers-types só por esta assinatura.
type PagesFunction<E> = (ctx: { request: Request; env: E }) => Promise<Response>

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  const origem = (env.API_ORIGIN ?? '').replace(/\/+$/, '')
  if (!origem) {
    return new Response(JSON.stringify({ error: 'API ainda não publicada neste ambiente', codigo: 'API_INDISPONIVEL' }), {
      status: 503,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    })
  }
  const entrada = new URL(request.url)
  const alvo = new URL(entrada.pathname + entrada.search, origem)
  const cabecalhos = new Headers(request.headers)
  cabecalhos.delete('host')
  cabecalhos.set('x-forwarded-host', entrada.host)
  cabecalhos.set('x-forwarded-proto', 'https')
  const resposta = await fetch(alvo, {
    method: request.method,
    headers: cabecalhos,
    body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
    redirect: 'manual',
  })
  return new Response(resposta.body, { status: resposta.status, headers: resposta.headers })
}
