/**
 * VARREDURA ESTÁTICA do armazenamento do aparelho em `src/` (usada por `chaves-locais-por-conta.test.ts`).
 * Acha cada chamada `localStorage|sessionStorage.(get|set|remove)Item(...)`, `indexedDB.open(...)` e `openDB(...)` e
 * resolve a chave: literal, constante `const X = '...'` do mesmo arquivo, ou prefixo estático de um template/concatenação.
 * O que não se resolve vira `dinamica` (a chave chega por parâmetro): o ARQUIVO tem de estar na lista de exceções.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const RAIZ = join(__dirname, '..', '..')

function arquivos(dir: string, acc: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) {
      if (n === 'foliate') continue
      arquivos(p, acc)
    } else if (/\.(ts|tsx)$/.test(n) && !/\.d\.ts$/.test(n)) acc.push(p)
  }
  return acc
}

export interface Achado {
  arquivo: string
  tipo: 'storage' | 'banco'
  /** A chave (ou o prefixo estático, quando `prefixo`). `null` = não resolvida. */
  chave: string | null
  prefixo: boolean
}

const CHAMADA = /\b(?:(?:window\.)?(?:localStorage|sessionStorage)|indexedDB)\s*\.\s*(\w+)\s*\(\s*/g
const OPEN_DB = /\bopenDB\s*(?:<[^>(]*>)?\s*\(\s*/g

function constantes(src: string): Map<string, string> {
  const m = new Map<string, string>()
  for (const x of src.matchAll(
    /\b(?:const|let)\s+([A-Za-z_$][\w$]*)\s*(?::\s*[^=]+)?=\s*(['"`])((?:(?!\2)[^\\$]|\\.)*)\2\s*[;,\n]/g,
  ))
    m.set(x[1], x[3])
  return m
}

function resolver(src: string, pos: number, consts: Map<string, string>): { chave: string | null; prefixo: boolean } {
  const r = resolverBruto(src, pos, consts)
  return r.prefixo && r.chave === '' ? { chave: null, prefixo: false } : r
}

function resolverBruto(
  src: string,
  pos: number,
  consts: Map<string, string>,
): { chave: string | null; prefixo: boolean } {
  const resto = src.slice(pos, pos + 400)
  const lit = /^(['"`])((?:(?!\1)[^\\]|\\.)*)\1/.exec(resto)
  if (lit) {
    const texto = lit[2]
    const apos = resto.slice(lit[0].length).trimStart()
    const dinamico = lit[1] === '`' && texto.includes('${')
    if (dinamico) return { chave: texto.slice(0, texto.indexOf('${')), prefixo: true }
    if (apos.startsWith('+')) return { chave: texto, prefixo: true }
    return { chave: texto, prefixo: false }
  }
  const id = /^([A-Za-z_$][\w$.]*)\s*(\+|[,)])/.exec(resto)
  if (id) {
    const v = consts.get(id[1])
    if (v !== undefined) return { chave: v, prefixo: id[2] === '+' }
  }
  const idp = /^([A-Za-z_$][\w$]*)\s*\(/.exec(resto)
  if (idp) {
    /* helper `chave(x) => \`prefixo${x}\``: pega o prefixo estático do template da definição */
    const def = new RegExp(
      `\\b${idp[1]}\\s*=\\s*(?:\\([^)]*\\)|\\w+)\\s*(?::\\s*[^=]+)?=>\\s*(['"\`])((?:(?!\\1)[^\\\\]|\\\\.)*)\\1`,
    ).exec(src)
    if (def) {
      const t = def[2]
      return t.includes('${') ? { chave: t.slice(0, t.indexOf('${')), prefixo: true } : { chave: t, prefixo: false }
    }
  }
  return { chave: null, prefixo: false }
}

export function varrer(): Achado[] {
  const saida: Achado[] = []
  for (const f of arquivos(join(RAIZ, 'src'))) {
    const src = readFileSync(f, 'utf8')
    if (!/localStorage|sessionStorage|indexedDB|openDB/.test(src)) continue
    const consts = constantes(src)
    const arq = relative(RAIZ, f)
    for (const m of src.matchAll(CHAMADA)) {
      const metodo = m[1]
      const banco = /^indexedDB/.test(m[0].replace(/^window\./, ''))
      if (banco) {
        if (metodo !== 'open') continue
      } else if (!/^(getItem|setItem|removeItem)$/.test(metodo)) continue
      const r = resolver(src, (m.index ?? 0) + m[0].length, consts)
      saida.push({ arquivo: arq, tipo: banco ? 'banco' : 'storage', ...r })
    }
    /* Constantes de chave passadas a um helper (`CHAVE_X`, `LS_X`, `PREFIXO_X`, `KEY`) e helpers `chaveX = (a) => \`pref${a}\``. */
    for (const [nome, valor] of consts) {
      if (
        /(CHAVE|KEY|PREFIXO|STORAGE|^LS_)/i.test(nome) &&
        /^[A-Za-z][\w-]*[.:_][\w.:-]*$/.test(valor) &&
        valor.length < 80
      )
        saida.push({ arquivo: arq, tipo: 'storage', chave: valor, prefixo: /[.:_]$/.test(valor) })
    }
    for (const x of src.matchAll(
      /\b(?:const|let)\s+(chave\w*|\w*Chave\w*)\s*=\s*\([^)]*\)\s*(?::\s*[^=]+)?=>\s*(['"`])((?:(?!\2)[^\\]|\\.)*)\2/g,
    )) {
      const t = x[3]
      if (/^[A-Za-z][\w-]*[.:_]/.test(t))
        saida.push({
          arquivo: arq,
          tipo: 'storage',
          chave: t.includes('${') ? t.slice(0, t.indexOf('${')) : t,
          prefixo: t.includes('${'),
        })
    }
    for (const m of src.matchAll(OPEN_DB)) {
      const r = resolver(src, (m.index ?? 0) + m[0].length, consts)
      saida.push({ arquivo: arq, tipo: 'banco', ...r })
    }
  }
  return saida
}
