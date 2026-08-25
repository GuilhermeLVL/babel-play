/**
 * REGRESSÃO — S-13: `imageUrl` de capa aceita URL de saída arbitrária.
 * Correção: só `https:` ou `data:image/`. (server/validation.ts isSafeImageUrl, usado em
 * server/routes/sessions.ts no PATCH /:id/meta.)
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * ATUALIZADO PELO F11-03, e vale dizer o que mudou e por quê.
 *
 * Este arquivo afirmava que `data:image/svg+xml;utf8,<svg/>` DEVIA ser aceito — o que estava
 * certo para o requisito do S-13 (que é sobre o ESQUEMA: nada de `http:`, `javascript:`,
 * `file:`) e virou errado quando o F11-03 mediu o que acontece com o SUBTIPO: ele seguia
 * verbatim até o `Content-Type` da resposta, e um SVG com `<script>` voltava servido como
 * `image/svg+xml` com os bytes intactos.
 *
 * A asserção foi INVERTIDA, não removida: o requisito do S-13 continua testado abaixo, e o
 * caso que ele autorizava passou a ser o caso que o F11-03 proíbe.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect } from 'vitest'
import { isSafeImageUrl } from '../../server/validation'

describe('S-13 — validação de imageUrl', () => {
  it('aceita https e data:image de subtipo servível', () => {
    expect(isSafeImageUrl('https://example.com/capa.png')).toBe(true)
    expect(isSafeImageUrl('data:image/png;base64,iVBORw0KGgo=')).toBe(true)
  })

  it('F11-03: recusa data:image/svg+xml, que o S-13 sozinho autorizava', () => {
    expect(isSafeImageUrl('data:image/svg+xml;utf8,<svg/>')).toBe(false)
  })
  it('rejeita http, javascript, file, data não-imagem e lixo', () => {
    expect(isSafeImageUrl('http://tracker.example/pixel.gif')).toBe(false)
    expect(isSafeImageUrl('javascript:alert(1)')).toBe(false)
    expect(isSafeImageUrl('file:///etc/passwd')).toBe(false)
    expect(isSafeImageUrl('data:text/html,<script>')).toBe(false)
    expect(isSafeImageUrl('not a url')).toBe(false)
    expect(isSafeImageUrl('')).toBe(false)
  })
})
