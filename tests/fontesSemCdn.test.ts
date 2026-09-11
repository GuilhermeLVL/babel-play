/**
 * NENHUMA FONTE VEM DE TERCEIRO.
 *
 * `src/index.css:1` carregava 14 famílias com um `@import url('https://fonts.googleapis.com/...')`:
 * um request único, render-blocking, sem `preconnect`. Três problemas, nesta ordem de gravidade:
 *
 *  1. CONTRADIZIA A PROMESSA DO PRODUTO. O README diz que, no modo local, "not a single request
 *     reaches the server" — e o app abria pedindo CSS ao Google em toda visita, levando IP e
 *     User-Agent de cada usuário para um terceiro que ninguém escolheu.
 *  2. QUEBRAVA OFFLINE. Sem internet, ou com o domínio bloqueado, a interface inteira caía para
 *     fonte de sistema — justamente no app que se vende como executável sem rede.
 *  3. Bloqueava o primeiro render por um recurso fora do nosso controle.
 *
 * Agora as famílias vêm de `@fontsource`, resolvidas pelo Vite e servidas do próprio domínio.
 *
 * ESTE TESTE LÊ O CSS FONTE, não o build: pega a regressão no commit em que alguém colar de volta
 * um `@import` de CDN — que é como isto entrou da primeira vez.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const BRUTO = readFileSync(path.join(process.cwd(), 'src/index.css'), 'utf8')

/**
 * O CSS SEM COMENTÁRIOS — e a razão é a mesma que `semConteudoFabricado.test.ts:29` documenta:
 * este repositório explica densamente o que foi removido, e o cabeçalho de `src/index.css` cita
 * textualmente o `@import url('https://fonts.googleapis.com/...')` que saiu. Varrer o arquivo cru
 * acusaria o próprio comentário que conta a história — falso positivo que ensinaria a próxima
 * pessoa a apagar a explicação para o teste passar.
 */
const CSS = BRUTO.replace(/\/\*[\s\S]*?\*\//g, '')

/** Hosts de fonte de terceiros que já apareceram, ou que apareceriam num copiar-e-colar. */
const CDNS = [
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'use.typekit.net',
  'fonts.bunny.net',
  'cdn.jsdelivr.net',
  'unpkg.com',
]

describe('fontes self-hosted', () => {
  it('src/index.css não referencia nenhum CDN de fonte', () => {
    for (const host of CDNS) {
      expect(CSS, `${host} voltou a aparecer em src/index.css`).not.toContain(host)
    }
  })

  it('nenhum @import do CSS aponta para http(s)', () => {
    const externos = [...CSS.matchAll(/@import\s+url\(\s*['"]?(https?:)?\/\//gi)]
    expect(externos.map((m) => m[0])).toEqual([])
  })

  it('as famílias sempre visíveis continuam declaradas — a correção não podia apagar fonte', () => {
    /* Marca e corpo: se algum destes sumir, a interface cai para fonte de sistema sem avisar. */
    for (const pacote of [
      '@fontsource-variable/inter',
      '@fontsource-variable/archivo',
      '@fontsource/ibm-plex-mono',
      '@fontsource/silkscreen',
    ]) {
      expect(CSS, `${pacote} deixou de ser importado`).toContain(pacote)
    }
  })

  it('VT323 não volta: estava no import antigo e não era usada por nenhuma regra', () => {
    expect(CSS).not.toMatch(/font-family:[^;]*VT323/i)
    expect(CSS).not.toContain('@fontsource/vt323')
  })

  it('toda família usada em font-family tem import correspondente', () => {
    /* A lista de `data-fonte` do app (`src/lib/appearance.ts`) promete 8 tipografias. Uma família
       citada em `font-family` sem `@font-face` carregado é promessa que o navegador não cumpre. */
    const importadas = [...CSS.matchAll(/@fontsource(?:-variable)?\/([a-z0-9-]+)/g)].map((m) => m[1])
    const normaliza = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
    const temImport = (familia: string) =>
      importadas.some((p) => normaliza(p) === normaliza(familia))

    const familias = new Set<string>()
    for (const m of CSS.matchAll(/font-family:\s*([^;}]+)/g)) {
      const primeira = m[1].split(',')[0].trim().replace(/^['"]|['"]$/g, '')
      if (/^(var\(|inherit|system-ui|sans-serif|serif|monospace|ui-)/.test(primeira)) continue
      familias.add(primeira)
    }

    const semImport = [...familias].filter((f) => !temImport(f))
    expect(semImport, `famílias citadas sem @fontsource: ${semImport.join(', ')}`).toEqual([])
  })
})
