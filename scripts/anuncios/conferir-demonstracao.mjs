#!/usr/bin/env node
/**
 * A DEMONSTRAÇÃO DE ANÚNCIOS ESTÁ NO PACOTE? (ruling R38) — confere o `dist` de um build.
 *
 * O provedor de demonstração (`src/components/anuncios/demonstracao/`) só entra no pacote quando o build tem
 * `VITE_ANUNCIOS_DEMONSTRACAO=1` (o Environment `staging`): sem a variável, o Vite elimina o ramo em
 * `demonstracao/ligar.ts` e o chunk não existe. Este script procura, nos `.js` e `.css` de `dist/assets`, as
 * marcas que só a demonstração tem (as marcas de exemplo inventadas do protótipo e a classe do premiado de
 * exemplo).
 *
 *   npm run build && node scripts/anuncios/conferir-demonstracao.mjs --espera ausente
 *   VITE_ANUNCIOS_DEMONSTRACAO=1 npm run build && node scripts/anuncios/conferir-demonstracao.mjs --espera presente
 *
 * Sai com 1 quando o `dist` não é o esperado (ou não existe).
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** O que só o pacote da demonstração tem. */
export const MARCAS_DA_DEMONSTRACAO = ['Tucano-Lilás Idiomas', 'Caderneta Zênite', '.ad-fim-premio']

function arquivos(dir, fora = []) {
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome)
    if (statSync(caminho).isDirectory()) arquivos(caminho, fora)
    else if (/\.(js|mjs|css)$/.test(nome)) fora.push(caminho)
  }
  return fora
}

/** Os arquivos do `dist` (em `assets/`) que trazem alguma marca da demonstração. */
export function arquivosDaDemonstracao(dist) {
  const assets = join(dist, 'assets')
  if (!existsSync(assets)) throw new Error(`sem ${assets}: rode o build antes`)
  return arquivos(assets).filter((f) => {
    const texto = readFileSync(f, 'utf8')
    return MARCAS_DA_DEMONSTRACAO.some((m) => texto.includes(m))
  })
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  const i = args.indexOf('--espera')
  const espera = i >= 0 ? args[i + 1] : 'ausente'
  const dist = args.find((a, j) => !a.startsWith('--') && args[j - 1] !== '--espera') ?? 'dist'
  if (espera !== 'ausente' && espera !== 'presente') {
    console.error('uso: conferir-demonstracao.mjs [dist] --espera ausente|presente')
    process.exit(2)
  }
  let achados
  try {
    achados = arquivosDaDemonstracao(dist)
  } catch (err) {
    console.error(String(err?.message ?? err))
    process.exit(1)
  }
  const presente = achados.length > 0
  console.log(
    presente
      ? `demonstração PRESENTE em ${dist}: ${achados.map((f) => f.slice(dist.length + 1)).join(', ')}`
      : `demonstração AUSENTE em ${dist}`,
  )
  process.exit(presente === (espera === 'presente') ? 0 : 1)
}
