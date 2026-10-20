/**
 * IMPORTAR O SERVIDOR NÃO TEM EFEITO COLATERAL (Fase 2, Task 5 — boot preguiçoso).
 *
 * Num Cloudflare Worker não há `process.env` preenchido, disco nem banco no momento em que o módulo é
 * carregado: um módulo que lê ambiente ou disco ao ser importado quebra todo isolate. A regra que este
 * teste trava: importar `server/http/app.ts` (e tudo o que ele puxa) num processo com o ambiente
 * reduzido ao `PATH` e o `cwd` num diretório vazio não lança e não cria arquivo nenhum. O banco, a
 * chave de segredos e o diretório de áudio só existem no primeiro uso.
 *
 * E a segunda metade: `criarApp()` monta e uma rota PÚBLICA que não toca o banco (`/api/abertura`)
 * responde num processo sem `DATABASE_URL` e sem disco (o Worker é simulado pelo `navigator.userAgent`,
 * que é como `server/lib/runtime.ts` o reconhece). A primeira rota que precisa do banco (`GET
 * /api/sessions`) responde 503 `banco_indisponivel`, não 500.
 *
 * Os dois rodam em processo FILHO: o processo do vitest já tem `DATABASE_URL` (setup) e módulos em
 * cache, que esconderiam exatamente o efeito procurado.
 */
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { afterEach, describe, expect, it } from 'vitest'

const RAIZ = path.resolve(__dirname, '..', '..')
const LOADER_DO_TSX = pathToFileURL(path.join(RAIZ, 'node_modules', 'tsx', 'dist', 'loader.mjs')).href
const APP = pathToFileURL(path.join(RAIZ, 'server', 'http', 'app.ts')).href
const ERRO_GLOBAL = pathToFileURL(path.join(RAIZ, 'server', 'lib', 'erroGlobal.ts')).href

const pastas: string[] = []
function pastaVazia(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'babel-import-'))
  pastas.push(dir)
  return dir
}
afterEach(() => {
  for (const dir of pastas.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function rodar(dir: string, codigo: string) {
  return spawnSync(process.execPath, ['--import', LOADER_DO_TSX, '--input-type=module', '-e', codigo], {
    cwd: dir,
    /* Só o PATH: nenhuma `DATABASE_URL`, `DATA_DIR`, `AUDIO_DIR`, `SECRET_KEY` ou `NODE_ENV`. O
       `TSX_TSCONFIG_PATH` é do carregador (os apelidos `@core/*` do `tsconfig.json`), não do app: com o
       `cwd` fora do repositório, o tsx não acharia o `tsconfig.json` sozinho. */
    env: { PATH: process.env.PATH ?? '', TSX_TSCONFIG_PATH: path.join(RAIZ, 'tsconfig.json') },
    encoding: 'utf8',
    timeout: 90_000,
  })
}

describe('importação sem efeitos', () => {
  it('importar server/http/app.ts com env vazio e cwd vazio não lança e não cria arquivo', () => {
    const dir = pastaVazia()
    const r = rodar(
      dir,
      `import(${JSON.stringify(APP)}).then(() => process.exit(0), (e) => { console.error(e); process.exit(1) })`,
    )
    expect(r.status, `${r.stdout}\n${r.stderr}`).toBe(0)
    expect(readdirSync(dir)).toEqual([])
  }, 120_000)

  it('criarApp() serve rota pública sem banco; rota de banco responde 503, não 500', () => {
    const dir = pastaVazia()
    const codigo = `
      Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'Cloudflare-Workers' }, configurable: true })
      const { criarApp } = await import(${JSON.stringify(APP)})
      const { erroGlobal } = await import(${JSON.stringify(ERRO_GLOBAL)})
      const app = criarApp()
      app.use(erroGlobal)
      const servidor = app.listen(0, '127.0.0.1')
      await new Promise((ok) => servidor.once('listening', ok))
      const base = 'http://127.0.0.1:' + servidor.address().port
      const publica = await fetch(base + '/api/abertura')
      const deBanco = await fetch(base + '/api/sessions')
      console.log('RESULTADO ' + JSON.stringify({
        publica: publica.status,
        deBanco: deBanco.status,
        corpo: await deBanco.json(),
      }))
      servidor.close()
      process.exit(0)
    `
    const r = rodar(dir, codigo)
    const linha = r.stdout.split('\n').find((l) => l.startsWith('RESULTADO '))
    expect(linha, `${r.stdout}\n${r.stderr}`).toBeDefined()
    const resultado = JSON.parse(linha!.slice('RESULTADO '.length)) as {
      publica: number
      deBanco: number
      corpo: { code?: string }
    }
    expect(resultado.publica).toBe(200)
    expect(resultado.deBanco).toBe(503)
    expect(resultado.corpo.code).toBe('banco_indisponivel')
    expect(readdirSync(dir)).toEqual([])
  }, 120_000)
})
