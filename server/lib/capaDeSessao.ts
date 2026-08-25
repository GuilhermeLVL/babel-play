/**
 * CAPA DE SESSÃO — tirar a imagem de dentro da listagem.
 *
 * A capa é uma imagem que o usuário cola no card da Biblioteca, guardada como `data:` URI dentro
 * do blob `meta` da sessão. Medido em `GET /api/sessions`: das 70 sessões deste banco, apenas
 * DUAS têm capa — e elas sozinhas respondiam por 1.045 KiB dos 1.074 KiB da resposta. 97% do
 * payload da listagem era imagem, e ele trafegava a cada carga de página.
 *
 * Três razões pelas quais data-URI numa listagem é o pior lugar possível para uma imagem:
 *  · não tem cache próprio — vem inteira toda vez, junto com o JSON;
 *  · base64 custa 33% a mais que os bytes originais;
 *  · e todas as outras 68 sessões pagam o custo de duas.
 *
 * A correção mantém a capa exatamente onde está no banco e só muda o CAMINHO de entrega: a
 * listagem devolve uma URL para `/api/sessions/:id/capa`, e o navegador passa a cachear a imagem
 * como qualquer outra. O `<img src>` do card continua idêntico — para o componente, é só uma URL.
 */

/** Prefixo de data-URI de imagem. Só estas são reescritas; URL externa já é pequena. */
const DATA_URI = /^data:image\/([a-z0-9.+-]+);base64,(.+)$/i

/**
 * F11-03 — OS SUBTIPOS QUE PODEM VIRAR `Content-Type` DE RESPOSTA.
 *
 * O achado: `isSafeImageUrl` aceitava qualquer coisa começando por `data:image/` (comparação de
 * prefixo) e esta função montava o MIME servido como `image/${subtipo}`, com o subtipo tirado
 * verbatim do URI que o usuário colou. `svg+xml` casava nos dois. Medido: um SVG com `<script>`
 * era aceito na escrita, servido como `image/svg+xml` por `sessions.ts:85-87`, com os bytes
 * idênticos aos que entraram.
 *
 * `X-Content-Type-Options: nosniff` não ajuda nesse vetor — ele impede o navegador de ADIVINHAR
 * um tipo diferente do declarado, e aqui o declarado já era o hostil. A CSP de produção barraria
 * o script embutido, mas `server.ts:59` desliga a CSP fora de produção: em dev e em todo
 * self-host não havia nada.
 *
 * A lista é FECHADA de propósito. Uma negativa (`≠ svg+xml`) protege contra o vetor conhecido e
 * deixa aberto o próximo formato executável que um navegador venha a suportar; uma lista fechada
 * exige uma decisão explícita para cada adição.
 */
export const SUBTIPOS_DE_CAPA_ACEITOS = ['png', 'jpeg', 'jpg', 'gif', 'webp', 'avif'] as const

/** `true` se o subtipo pode ser servido como imagem sem virar documento executável. */
export function subtipoDeCapaAceito(subtipo: string): boolean {
  return (SUBTIPOS_DE_CAPA_ACEITOS as readonly string[]).includes(subtipo.trim().toLowerCase())
}

export interface CapaEmbutida {
  mime: string
  bytes: Buffer
}

/** Decodifica um `data:` URI de imagem. `null` quando não é um, ou quando o subtipo não é aceito. */
export function lerCapaEmbutida(valor: unknown): CapaEmbutida | null {
  if (typeof valor !== 'string') return null
  const m = DATA_URI.exec(valor.trim())
  if (!m) return null
  const subtipo = m[1].toLowerCase()
  // Fail closed: um subtipo fora da lista não vira Content-Type nem chega a ser decodificado.
  if (!subtipoDeCapaAceito(subtipo)) return null
  try {
    return { mime: `image/${subtipo}`, bytes: Buffer.from(m[2], 'base64') }
  } catch {
    return null
  }
}

export const ehCapaEmbutida = (valor: unknown): boolean => lerCapaEmbutida(valor) !== null

/**
 * Reescreve o `meta` de UMA linha, trocando a capa embutida por uma URL servida.
 * URL externa e ausência de capa passam intactas — não há por que mexer no que já é leve.
 */
export function aliviarMeta(meta: unknown, sessionId: string): unknown {
  if (typeof meta !== 'string' || !meta) return meta
  let obj: Record<string, unknown>
  try {
    obj = JSON.parse(meta) as Record<string, unknown>
  } catch {
    // `meta` ilegível não é problema desta função: devolver intacto preserva o comportamento
    // anterior e deixa o erro para quem já o tratava.
    return meta
  }
  if (!obj || typeof obj !== 'object' || !ehCapaEmbutida(obj.imageUrl)) return meta
  return JSON.stringify({ ...obj, imageUrl: `/api/sessions/${sessionId}/capa` })
}

/** Aplica `aliviarMeta` a uma listagem inteira. */
export function aliviarListagem<T extends { id: string; meta?: unknown }>(linhas: T[]): T[] {
  return linhas.map((l) => (l.meta === undefined ? l : { ...l, meta: aliviarMeta(l.meta, l.id) }))
}
