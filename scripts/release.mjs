#!/usr/bin/env node
/**
 * PREPARA UMA RELEASE SEMVER — auditoria de prontidão, Fase 6.
 *
 *   node scripts/release.mjs patch|minor|major [--data=AAAA-MM-DD] [--raiz=<dir>]
 *   npm run release -- minor
 *
 * O que faz, e só isto (tudo local, nada de rede, nada de git):
 *   1. sobe a versão do `package.json` (e do `package-lock.json`, raiz e `packages[""]`, para o
 *      `npm ci` não ver divergência);
 *   2. move o conteúdo de `## [Unreleased]` do CHANGELOG para `## [X.Y.Z] — AAAA-MM-DD`, deixando
 *      um `[Unreleased]` vazio no topo;
 *   3. IMPRIME os comandos de commit e de tag — não os executa. A tag é o ato de publicar, e quem
 *      publica é uma pessoa olhando o diff (a política está em `docs/versionamento.md`).
 *
 * Recusa: tipo inválido, versão atual que não é semver, `[Unreleased]` ausente ou VAZIO (release
 * sem nada escrito no CHANGELOG é release que ninguém consegue auditar depois).
 *
 * A versão que sai daqui é a que o app mostra: `server/lib/versao.ts` lê o `package.json` e junta o
 * sha do commit (`0.2.0+35bc2d6`), que vai no cabeçalho `x-babel-versao` e em `/api/health`.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const TIPOS = ['patch', 'minor', 'major']

/** `1.2.3` + `minor` → `1.3.0`. Aceita só `X.Y.Z` (sem pré-release: este projeto não publica pré-release). */
export function proximaVersao(atual, tipo) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(atual).trim())
  if (!m) throw new Error(`versão atual "${atual}" não é semver X.Y.Z`)
  if (!TIPOS.includes(tipo)) throw new Error(`tipo "${tipo}" inválido — use ${TIPOS.join(', ')}`)
  let [maior, menor, correcao] = m.slice(1).map(Number)
  if (tipo === 'major') [maior, menor, correcao] = [maior + 1, 0, 0]
  else if (tipo === 'minor') [menor, correcao] = [menor + 1, 0]
  else correcao += 1
  return `${maior}.${menor}.${correcao}`
}

/**
 * Move o bloco `## [Unreleased]` para `## [versao] — data`. O bloco vai do título até o próximo
 * `## [` (ou o fim do arquivo).
 */
export function moverUnreleased(changelog, versao, data) {
  const inicio = changelog.search(/^## \[Unreleased\][^\n]*$/m)
  if (inicio < 0) throw new Error('CHANGELOG sem a seção `## [Unreleased]`')
  const fimDoTitulo = changelog.indexOf('\n', inicio)
  const resto = changelog.slice(fimDoTitulo + 1)
  const proxima = resto.search(/^## \[/m)
  const corpo = (proxima < 0 ? resto : resto.slice(0, proxima)).trim()
  if (!corpo) throw new Error('`## [Unreleased]` está vazio — escreva o que muda antes de lançar')
  if (new RegExp(`^## \\[${versao.replace(/\./g, '\\.')}\\]`, 'm').test(changelog)) {
    throw new Error(`o CHANGELOG já tem a versão ${versao}`)
  }
  const depois = proxima < 0 ? '' : resto.slice(proxima)
  return `${changelog.slice(0, inicio)}## [Unreleased]\n\n## [${versao}] — ${data}\n\n${corpo}\n${depois ? `\n${depois}` : ''}`
}

/** Os comandos que a pessoa roda depois de revisar o diff. */
export function comandosDeTag(versao) {
  return [
    'git diff -- package.json package-lock.json CHANGELOG.md   # revise',
    'git add package.json package-lock.json CHANGELOG.md',
    `git commit -m "chore(release): v${versao}"`,
    `git tag -a v${versao} -m "v${versao}"`,
    'git push origin HEAD --follow-tags',
  ]
}

export function prepararRelease({ raiz, tipo, data }) {
  const arqPkg = path.join(raiz, 'package.json')
  const arqLog = path.join(raiz, 'CHANGELOG.md')
  const arqLock = path.join(raiz, 'package-lock.json')
  const pkg = JSON.parse(readFileSync(arqPkg, 'utf8'))
  const anterior = pkg.version
  const versao = proximaVersao(anterior, tipo)
  // Calcula tudo ANTES de escrever: uma recusa não pode deixar o package.json subido e o CHANGELOG não.
  const changelog = moverUnreleased(readFileSync(arqLog, 'utf8'), versao, data)

  pkg.version = versao
  writeFileSync(arqPkg, JSON.stringify(pkg, null, 2) + '\n')
  if (existsSync(arqLock)) {
    const lock = JSON.parse(readFileSync(arqLock, 'utf8'))
    lock.version = versao
    if (lock.packages?.['']) lock.packages[''].version = versao
    writeFileSync(arqLock, JSON.stringify(lock, null, 2) + '\n')
  }
  writeFileSync(arqLog, changelog)
  return { anterior, versao, comandos: comandosDeTag(versao) }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const tipo = process.argv[2]
  const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3)
  const raiz = path.resolve(arg('raiz') ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '..'))
  const data = arg('data') ?? new Date().toISOString().slice(0, 10)
  if (!TIPOS.includes(tipo) || !/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    console.error('uso: node scripts/release.mjs patch|minor|major [--data=AAAA-MM-DD] [--raiz=<dir>]')
    process.exit(2)
  }
  try {
    const r = prepararRelease({ raiz, tipo, data })
    console.log(`versão: ${r.anterior} → ${r.versao} (${tipo}), CHANGELOG datado ${data}`)
    console.log('\nNada foi commitado nem marcado. Para publicar:\n')
    for (const c of r.comandos) console.log(`  ${c}`)
    console.log('\nDepois: Actions → "Deploy (Fly.io)" em staging com este commit (docs/deploy-checklist.md).')
  } catch (err) {
    console.error(`release recusada: ${err.message}`)
    process.exit(1)
  }
}
