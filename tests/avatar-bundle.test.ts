/**
 * O ORÇAMENTO DE BUNDLE DO AVATAR: `three` e `@pixiv/three-vrm` NUNCA entram no chunk de arranque.
 *
 * Duas camadas:
 *  1. FONTE (sempre roda): ninguém além do motor (`src/lib/avatar/{carregador,renderer,motor}.ts`) importa
 *     `three`/`@pixiv/three-vrm`; o carregador só os cita como tipo e por `import()`; o componente só chega ao motor
 *     por `import()`; e nenhum arquivo do arranque (`App`, `main`) importa o motor.
 *  2. BUILD (roda quando existe `dist/`; com `AVATAR_BUNDLE_EXIGIR=1` a falta do `dist` reprova): o JS inicial
 *     do `dist/index.html` (entrada + modulepreload, que é toda dependência estática) não contém o chunk
 *     `vendor-avatar` nem o código do `WebGLRenderer`, e o chunk existe e é alcançado por `import()`.
 *     Imprime o tamanho do chunk em gzip e brotli.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { brotliCompressSync, gzipSync } from 'node:zlib'

import { describe, expect, it } from 'vitest'

import { arquivosIniciais } from '../scripts/perf/orcamento-bundle.mjs'
import { casaCuringa, PASTAS_FORA_DO_DIST, precomprimirDiretorio } from '../scripts/vite/precomprimir'

const RAIZ = path.resolve(__dirname, '..')

function arquivos(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? arquivos(path.join(dir, d.name)) : [path.join(dir, d.name)],
  )
}
const fonte = (rel: string) => readFileSync(path.join(RAIZ, rel), 'utf8')
const rel = (abs: string) => path.relative(RAIZ, abs).split(path.sep).join('/')

/** `maos.ts` (M4b) usa `three` em tempo de execução e só é alcançado por `import()` dinâmico (ver o teste abaixo). */
const PORTAS_DO_MOTOR = [
  'src/lib/avatar/carregador.ts',
  'src/lib/avatar/renderer.ts',
  'src/lib/avatar/motor.ts',
  // M6: as peças do Estúdio; só alcançadas por import() em `pecasNaSessao.ts`.
  'src/lib/avatar/pecas3d.ts',
  'src/lib/avatar/maos.ts',
]
/** Import estático de valor (não `import type`) de `three` ou `@pixiv/three-vrm`. */
const IMPORT_ESTATICO = /^\s*import\s+(?!type\b)[^'"]*from\s+['"](three|three\/[^'"]*|@pixiv\/[^'"]+)['"]/m
const IMPORT_QUALQUER = /(?:from|import\s*\()\s*['"](three|three\/[^'"]*|@pixiv\/[^'"]+)['"]/

describe('orçamento de bundle do avatar: fonte', () => {
  const codigo = arquivos(path.join(RAIZ, 'src')).filter((f) => /\.(ts|tsx)$/.test(f))

  it('só as portas do motor citam three/three-vrm', () => {
    const intrusos = codigo.map(rel).filter((f) => !PORTAS_DO_MOTOR.includes(f) && IMPORT_QUALQUER.test(fonte(f)))
    expect(intrusos).toEqual([])
  })

  it('maos.ts só é alcançado por import() dinâmico (nada o importa de forma estática)', () => {
    const estaticos = codigo
      .map(rel)
      .filter((f) => /^\s*import\s+(?!type\b)[^'"]*from\s+['"][^'"]*avatar\/maos['"]/m.test(fonte(f)))
      .filter((f) => !f.startsWith('tests/'))
    expect(estaticos).toEqual([])
  })

  it('o carregador só importa three/three-vrm como tipo ou por import() dinâmico', () => {
    expect(IMPORT_ESTATICO.test(fonte('src/lib/avatar/carregador.ts'))).toBe(false)
    expect(fonte('src/lib/avatar/carregador.ts')).toMatch(/import\('three\/examples\/jsm\/loaders\/GLTFLoader\.js'\)/)
    expect(fonte('src/lib/avatar/carregador.ts')).toMatch(/import\('@pixiv\/three-vrm'\)/)
  })

  it('o componente chega ao motor por import() e só importa tipos dele', () => {
    const c = fonte('src/components/avatar/AvatarCanvas.tsx')
    expect(c).toMatch(/import\('\.\.\/\.\.\/lib\/avatar\/motor'\)/)
    expect(c).not.toMatch(/^\s*import\s+(?!type\b)[^'"]*from\s+'\.\.\/\.\.\/lib\/avatar\/(motor|renderer|carregador)'/m)
  })

  it('nada do arranque importa o motor, o renderer ou o carregador de forma estática', () => {
    const portas = /from\s+['"][^'"]*lib\/avatar\/(motor|renderer|carregador)['"]/
    for (const f of ['src/main.tsx', 'src/App.tsx']) {
      if (existsSync(path.join(RAIZ, f))) expect(portas.test(fonte(f))).toBe(false)
    }
    // Quem importa o motor de verdade (fora a própria pasta e o componente) tem de ser só por tipo.
    const estaticos = codigo
      .map(rel)
      .filter((f) => !f.startsWith('src/lib/avatar/') && f !== 'src/components/avatar/AvatarCanvas.tsx')
      .filter((f) =>
        /^\s*import\s+(?!type\b)[^'"]*from\s+['"][^'"]*lib\/avatar\/(motor|renderer|carregador)['"]/m.test(fonte(f)),
      )
    expect(estaticos).toEqual([])
  })

  it('vite.config.ts põe three e three-vrm num chunk próprio', () => {
    expect(fonte('vite.config.ts')).toMatch(/vendor-avatar/)
  })
})

describe('orçamento de bundle do avatar: modelos de teste', () => {
  it('a pasta avatares/dev não vai para o dist', () => {
    expect(PASTAS_FORA_DO_DIST).toContain('avatares/dev/')
    const tmp = path.join(RAIZ, 'node_modules', '.cache', 'avatar-bundle-teste')
    rmSync(tmp, { recursive: true, force: true })
    mkdirSync(path.join(tmp, 'avatares', 'dev'), { recursive: true })
    mkdirSync(path.join(tmp, 'avatares', 'colecao'), { recursive: true })
    writeFileSync(path.join(tmp, 'avatares', 'dev', 'milk.vrm'), 'x')
    writeFileSync(path.join(tmp, 'avatares', 'colecao', 'milk.vrm'), 'x')
    try {
      const r = precomprimirDiretorio(tmp)
      expect(r.removidos).toEqual(['avatares/dev/milk.vrm'])
      expect(existsSync(path.join(tmp, 'avatares', 'colecao', 'milk.vrm'))).toBe(true)
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
    expect(casaCuringa('prototipo-*.html', 'prototipo-x.html')).toBe(true)
  })
})

/**
 * BUILD ISOLADO DO HARNESS: o app ainda não tem tela que use o avatar (M2), então o `dist` do app não traz o
 * chunk. Aqui o Vite empacota o harness, que importa `AvatarCanvas` de forma ESTÁTICA (como a tela fará), com
 * as mesmas `rollupOptions` do `vite.config.ts`. A prova: a entrada e suas pré-cargas ficam sem three, e o
 * `vendor-avatar` só é alcançado por `import()`.
 */
describe('orçamento de bundle do avatar: build isolado do harness', () => {
  it('three e three-vrm ficam no chunk vendor-avatar, fora da entrada', async () => {
    const { build } = await import('vite')
    const react = (await import('@vitejs/plugin-react')).default
    const config = (await import('../vite.config')).default as unknown as (a: { mode: string; command: string }) => {
      define: Record<string, string>
      build: { rollupOptions: Record<string, unknown> }
    }
    const real = config({ mode: 'production', command: 'build' })
    const saida = path.join(RAIZ, 'node_modules', '.cache', 'avatar-bundle-harness')
    rmSync(saida, { recursive: true, force: true })
    try {
      await build({
        configFile: false,
        root: path.join(RAIZ, 'tests', 'e2e', 'avatar-harness'),
        logLevel: 'silent',
        plugins: [react()],
        define: real.define,
        build: { outDir: saida, emptyOutDir: true, minify: true, rollupOptions: real.build.rollupOptions },
      })
      const assets = readdirSync(path.join(saida, 'assets'))
      const chunk = assets.find((n) => /^vendor-avatar-.*\.js$/.test(n))
      expect(chunk).toBeTruthy()
      const html = readFileSync(path.join(saida, 'index.html'), 'utf8')
      const { js } = arquivosIniciais(html) as { js: string[] }
      expect(js.length).toBeGreaterThan(0)
      for (const u of js) {
        expect(u).not.toMatch(/vendor-avatar/)
        const conteudo = readFileSync(path.join(saida, u.replace(/^\//, '')), 'utf8')
        expect(conteudo).not.toMatch(/WebGLRenderer|VRMLoaderPlugin/)
      }
      expect(html).not.toContain(chunk!)
      const bruto = readFileSync(path.join(saida, 'assets', chunk!))
      expect(bruto.toString('utf8')).toMatch(/WebGLRenderer/)
      expect(bruto.toString('utf8')).toMatch(/VRMLoaderPlugin/)
      // O Vite lista o chunk no mapa de pré-carga do `import()` (`__vite__mapDeps`): isso é carga SOB DEMANDA.
      // O que não pode existir é import ESTÁTICO dele (`from"./vendor-avatar-…"`/`import"./vendor-avatar-…"`).
      const estatico = new RegExp(`(?:from|import)\\s*["']\\.?/?${chunk!.replace('.', '\\.')}["']`)
      const iniciais = js.map((u) => path.basename(u))
      for (const n of iniciais) {
        const conteudo = readFileSync(path.join(saida, 'assets', n), 'utf8')
        expect(estatico.test(conteudo), `${n} importa o chunk do avatar de forma estática`).toBe(false)
      }
      // O chunk do motor (carregado por import()) é quem o importa de forma estática.
      const doMotor = assets.filter((n) => /^motor-.*\.js$/.test(n))
      expect(doMotor.length).toBeGreaterThan(0)
      expect(doMotor.some((n) => estatico.test(readFileSync(path.join(saida, 'assets', n), 'utf8')))).toBe(true)
      // E alguém o carrega por import() dinâmico.
      const dinamico = assets.some(
        (n) =>
          n.endsWith('.js') &&
          n !== chunk &&
          new RegExp(`import\\(\\s*["']\\./${chunk!.replace('.', '\\.')}["']`).test(
            readFileSync(path.join(saida, 'assets', n), 'utf8'),
          ),
      )
      expect(dinamico || assets.some((n) => readFileSync(path.join(saida, 'assets', n), 'utf8').includes(chunk!))).toBe(
        true,
      )
      const gz = gzipSync(bruto, { level: 6 }).length
      const br = brotliCompressSync(bruto).length
      console.log(
        `[avatar] ${chunk}: ${(bruto.length / 1024).toFixed(0)} KB bruto, ${(gz / 1024).toFixed(0)} KB gzip, ${(br / 1024).toFixed(0)} KB brotli`,
      )
      expect(gz).toBeLessThan(900 * 1024)
    } finally {
      rmSync(saida, { recursive: true, force: true })
    }
  }, 180_000)
})

const DIST = path.join(RAIZ, 'dist')
const temDist = existsSync(path.join(DIST, 'index.html'))

describe.skipIf(!temDist && process.env.AVATAR_BUNDLE_EXIGIR !== '1')('orçamento de bundle do avatar: dist', () => {
  it('existe um dist para medir', () => expect(temDist).toBe(true))

  const assets = temDist ? readdirSync(path.join(DIST, 'assets')) : []
  const chunk = assets.find((n) => /^vendor-avatar-.*\.js$/.test(n))

  // Enquanto nenhuma tela do app usa o avatar (M2), o chunk NÃO existe no dist do app: é o que se espera.
  it('se o chunk vendor-avatar existir no dist, traz o three', () => {
    if (!chunk) return
    expect(readFileSync(path.join(DIST, 'assets', chunk), 'utf8')).toMatch(/WebGLRenderer/)
  })

  it('o JS inicial (entrada + modulepreload) não inclui o chunk nem código do three', () => {
    const { js } = arquivosIniciais(readFileSync(path.join(DIST, 'index.html'), 'utf8')) as { js: string[] }
    expect(js.length).toBeGreaterThan(0)
    for (const u of js) {
      expect(u).not.toMatch(/vendor-avatar/)
      const conteudo = readFileSync(path.join(DIST, u.replace(/^\/?(app\/)?/, '')), 'utf8')
      expect(conteudo).not.toMatch(/WebGLRenderer|VRMLoaderPlugin/)
    }
  })

  it('o chunk, se existir, só é alcançado por import() dinâmico', () => {
    if (!chunk) return
    expect(readFileSync(path.join(DIST, 'index.html'), 'utf8')).not.toContain(chunk)
  })
})
