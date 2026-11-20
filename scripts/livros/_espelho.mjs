/** O TEXTO DE UM LIVRO DO GUTENBERG, de um espelho oficial (usado pela montagem do catálogo e pela curadoria). */
import { TextDecoder } from 'node:util'

import { baixar } from './_rede.mjs'

/**
 * O texto puro, de um ESPELHO oficial (nunca do gutenberg.org): o da XMission primeiro (rápido), o da PGLAF
 * depois. O arquivo antigo em latin-1 é decodificado como latin-1. Um livro que nenhum espelho entrega fica
 * de fora desta montagem (aparece no log), sem derrubar o resto; texto acima de 8 MB (dicionário, coletânea
 * de obras completas) também.
 */
const TETO_DO_TEXTO = 8 * 1024 * 1024
export async function textoDoEspelho(id) {
  const n = String(id)
  const pastas = n.length === 1 ? `0/${n}` : `${n.slice(0, -1).split('').join('/')}/${n}`
  const tentativas = [
    `https://mirrors.xmission.com/gutenberg/${pastas}/${n}-0.txt`,
    `https://mirrors.xmission.com/gutenberg/${pastas}/${n}-8.txt`,
    `https://mirrors.xmission.com/gutenberg/${pastas}/${n}.txt`,
    `https://gutenberg.pglaf.org/cache/epub/${n}/pg${n}.txt`,
  ]
  for (const url of tentativas) {
    try {
      const bytes = await baixar(url, 'binario', { tentativas: 1 })
      if (!bytes) continue
      if (bytes.length > TETO_DO_TEXTO) return null
      try {
        return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
      } catch {
        return new TextDecoder('latin1').decode(bytes)
      }
    } catch (e) {
      console.warn(`[espelho] ${n}: ${e.message}`)
    }
  }
  return null
}
