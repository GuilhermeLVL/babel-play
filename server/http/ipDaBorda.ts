/**
 * O IP DO CLIENTE NO WORKER. Atrás do `httpServerHandler`, o Express vê sempre o mesmo endereço de socket
 * (o loopback do isolate): sem isto, todo visitante dividiria um balde só do limitador por IP e da trava do
 * ranking. Quem sabe o IP é a borda da Cloudflare, no `CF-Connecting-IP`.
 *
 * Esta função APAGA o `X-Forwarded-For` (e os parentes) que o cliente mandou — forjá-los escolheria a chave
 * do balde — e põe nele SÓ o `CF-Connecting-IP`. O app, no Worker, confia em exatamente um salto
 * (`app.set('trust proxy', 1)` em `server/http/app.ts`), então `req.ip` é esse valor e nada mais.
 * Sem `CF-Connecting-IP` (não acontece atrás da borda), o cabeçalho fica ausente e `req.ip` é o do socket.
 */
export function comIpDaBorda(request: Request): Request {
  const headers = new Headers(request.headers)
  headers.delete('x-forwarded-for')
  headers.delete('x-real-ip')
  headers.delete('forwarded')
  const ip = request.headers.get('cf-connecting-ip')?.trim()
  if (ip) headers.set('x-forwarded-for', ip)
  return new Request(request, { headers })
}
