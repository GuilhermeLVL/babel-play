/**
 * ORIGEM PROTEGIDA — só o proxy da frente fala com o servidor.
 *
 * Na produção, o caminho é visitante → Cloudflare (WAF, rate limit, HTTPS) → Fly.io → app. O Fly
 * também publica o app em `<app>.fly.dev`, e quem chega por ali pula o Cloudflare inteiro: sem WAF,
 * sem a regra de rate limit, e com o `X-Forwarded-For` que quiser — que o `TRUST_PROXY=2` aceitaria
 * como o IP do cliente, entregando a ele a chave dos baldes do limitador.
 *
 * O Cloudflare injeta um cabeçalho com um segredo em toda requisição (Transform Rule, ver
 * `docs/LANCAMENTO.md`). Com `ORIGEM_SEGREDO` definido, o servidor recusa com 403 o que chega sem
 * ele. `/api/health` e `/api/ready` ficam de fora: as sondas do Fly batem direto na máquina, pela
 * rede interna, e nunca passam pelo Cloudflare.
 *
 * Sem `ORIGEM_SEGREDO` (dev, self-host, staging sem Cloudflare) o middleware não é montado.
 */
import { timingSafeEqual } from 'node:crypto'

import type { RequestHandler } from 'express'

export const CABECALHO_DE_ORIGEM = 'x-origem-segredo'

/* `/metrics` tem token próprio e é raspado pela rede privada do Fly (`[metrics]` no `fly.toml`). */
const LIVRES = new Set(['/api/health', '/api/ready', '/metrics'])

function iguais(a: string, b: string): boolean {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

export function exigirOrigem(segredo: string): RequestHandler {
  return (req, res, next) => {
    if (LIVRES.has(req.path)) {
      next()
      return
    }
    const recebido = req.header(CABECALHO_DE_ORIGEM)
    if (typeof recebido === 'string' && iguais(recebido, segredo)) {
      next()
      return
    }
    /* Resposta seca e sem dizer o que falta: quem chegou pelo endereço direto não precisa saber
       que existe um cabeçalho a adivinhar. */
    res.status(403).type('text/plain').send('acesso direto não permitido')
  }
}
