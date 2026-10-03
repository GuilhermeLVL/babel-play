#!/usr/bin/env node
/**
 * PREFLIGHT DE PRODUÇÃO — confere o arquivo de variáveis do deploy ANTES de subir.
 *
 *     npm run preflight -- C:\caminho\fora\do\repo\.env.producao
 *     node scripts/preflight-producao.mjs C:\caminho\fora\do\repo\.env.producao
 *
 * Diz, SÓ PELOS NOMES, o que BLOQUEIA o boot, o que AVISA (capacidade que fica desligada) e o que está
 * OK. NUNCA imprime um valor — a saída pode ser colada no chat. A regra mora em
 * `server/lib/preflightProducao.ts` e reaproveita as travas do próprio servidor.
 *
 * O arquivo TEM de ficar fora do repositório: um arquivo de segredos dentro da pasta do projeto é um
 * `git add .` de distância de um vazamento. Dentro do repo, o script recusa e nem o abre.
 *
 * Código de saída: 0 sem nenhum BLOQUEIA; 1 com BLOQUEIA; 2 uso errado (sem caminho, arquivo ausente
 * ou dentro do repositório).
 */
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** `true` quando `alvo` é a raiz do repo ou está dentro dela (sem diferenciar maiúsculas no Windows). */
export function estaDentroDoRepo(alvo, raiz = RAIZ) {
  const norm = (p) => (process.platform === 'win32' ? p.toLowerCase() : p)
  const rel = path.relative(norm(raiz), norm(alvo))
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
}

function usar(mensagem) {
  console.error(mensagem)
  console.error('Uso: npm run preflight -- <caminho do arquivo de variáveis, FORA do repositório>')
  process.exit(2)
}

async function principal() {
  const argumento = process.argv[2]
  if (!argumento) usar('Faltou o caminho do arquivo de variáveis de produção.')

  const bruto = path.resolve(argumento)
  // Confere o caminho digitado E o caminho real (um atalho/junção de fora para dentro do repo).
  if (estaDentroDoRepo(bruto)) {
    usar(
      'RECUSADO: o arquivo está dentro do repositório. Guarde o arquivo de segredos fora da pasta do projeto ' +
        '(ex.: C:\\Users\\<você>\\segredos\\babel\\.env.producao) e passe esse caminho.',
    )
  }
  if (!existsSync(bruto) || !statSync(bruto).isFile()) usar('Arquivo não encontrado (ou não é um arquivo).')
  if (estaDentroDoRepo(realpathSync(bruto))) {
    usar('RECUSADO: o arquivo, resolvido por atalho, está dentro do repositório. Guarde-o fora da pasta do projeto.')
  }

  // As regras são TypeScript do servidor: o `tsx` (já é dependência de dev do projeto) as carrega.
  const { tsImport } = await import('tsx/esm/api')
  const { conferirProducao, lerVariaveis, resumir } = await tsImport(
    pathToFileURL(path.join(RAIZ, 'server', 'lib', 'preflightProducao.ts')).href,
    import.meta.url,
  )

  const variaveis = lerVariaveis(readFileSync(bruto, 'utf8'))
  const achados = conferirProducao(variaveis)
  const r = resumir(achados)

  console.log(
    `PREFLIGHT DE PRODUÇÃO — ${Object.keys(variaveis).length} variáveis lidas (valores nunca são mostrados)\n`,
  )
  const secoes = [
    ['BLOQUEIA', 'BLOQUEIA o boot (ou sobe quebrado/inseguro) — corrija antes de subir'],
    ['AVISA', 'AVISA — sobe, mas a capacidade fica desligada, ou há algo a conferir'],
    ['OK', 'OK'],
  ]
  for (const [nivel, titulo] of secoes) {
    const doNivel = achados.filter((a) => a.nivel === nivel)
    if (!doNivel.length) continue
    console.log(`── ${titulo} (${doNivel.length})`)
    for (const a of doNivel) console.log(`  [${nivel}] ${a.nome}: ${a.texto}`)
    console.log('')
  }
  console.log(
    r.podeSubir
      ? `RESULTADO: nada bloqueia o boot (${r.avisa} aviso(s), ${r.ok} ok). Confira os avisos antes de abrir.`
      : `RESULTADO: NÃO SUBA — ${r.bloqueia} item(ns) BLOQUEIA (${r.avisa} aviso(s), ${r.ok} ok).`,
  )
  process.exit(r.podeSubir ? 0 : 1)
}

// Só roda como script; importado (pelo teste), expõe `estaDentroDoRepo` sem efeito colateral.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  principal().catch((erro) => {
    console.error(`Falha inesperada no preflight: ${String(erro?.message ?? erro).slice(0, 200)}`)
    process.exit(2)
  })
}
