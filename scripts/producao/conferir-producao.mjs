#!/usr/bin/env node
/**
 * CONFERÊNCIA SOMENTE-LEITURA de um ambiente publicado (produção ou staging), para a prova real
 * (`docs/runbooks/prova-real-producao.md`):
 *
 *   node scripts/producao/conferir-producao.mjs --url https://frasy.com.br --esperar-fechado
 *   node scripts/producao/conferir-producao.mjs --url https://frasy-staging.guigui-cruzeiro.workers.dev
 *
 * Opções: `--esperar-fechado` (reprova se cadastro/venda/anual estiverem abertos ou se uma flag de venda, IA,
 * anúncio ou avatar estiver ligada), `--modelos <raiz>` (padrão `https://modelos.frasy.com.br/supertonic-3`),
 * `--origem <url>` (opcional: a URL direta do Worker, que sem o cabeçalho da borda tem de dar 403).
 *
 * O QUE ELA NÃO FAZ, de propósito: nenhuma escrita, nenhum login, nenhuma rota autenticada e nenhuma que responda
 * 401 (o limitador de falhas de autenticação é por IP e o IP é o do dono). São no máximo 12 requisições GET/HEAD,
 * em sequência, sem repetição nem laço; um 429 é relatado e não repetido. Não lê nem imprime segredo.
 *
 * Sai com 0 se nada crítico falhou, 1 se algo falhou, 2 em uso errado. As decisões estão em `./conferencia.mjs`.
 */
import { fileURLToPath } from 'node:url'

import {
  ARQUIVO_DE_VOZ,
  avaliarAbertura,
  avaliarAdsTxt,
  avaliarCabecalhos,
  avaliarFlags,
  avaliarHealth,
  avaliarModelo,
  avaliarOrigemDireta,
  avaliarPagina,
  avaliarReady,
  avaliarRobots,
  avaliarSitemap,
  lerArgumentos,
  resumir,
} from './conferencia.mjs'

const TEMPO_LIMITE_MS = 15_000
const CABECALHOS = { 'user-agent': 'frasy-conferencia-somente-leitura/1', accept: '*/*' }

/** Uma requisição, sem repetição. Falha de rede vira `status: 0`. O corpo do HEAD é vazio. */
async function pedir(url, { metodo = 'GET', extras = {} } = {}) {
  try {
    const r = await fetch(url, {
      method: metodo,
      headers: { ...CABECALHOS, ...extras },
      redirect: 'follow',
      signal: globalThis.AbortSignal.timeout(TEMPO_LIMITE_MS),
    })
    const texto = metodo === 'HEAD' ? '' : await r.text()
    return { status: r.status, cabecalhos: Object.fromEntries(r.headers), texto }
  } catch {
    return { status: 0, cabecalhos: {}, texto: '' }
  }
}

const json = (texto) => {
  try {
    return JSON.parse(texto)
  } catch {
    return null
  }
}

/** Roda a conferência e devolve os itens (a rede é injetável para quem quiser simular). */
export async function conferir(opcoes, buscar = pedir) {
  const { url, esperarFechado, modelos, origem } = opcoes
  const itens = []
  const health = await buscar(`${url}/api/health`)
  itens.push(...avaliarHealth(health.status, json(health.texto)))
  const ready = await buscar(`${url}/api/ready`)
  itens.push(...avaliarReady(ready.status, json(ready.texto)))
  const abertura = await buscar(`${url}/api/abertura`)
  itens.push(...avaliarAbertura(abertura.status, json(abertura.texto), { esperarFechado }))
  const flags = await buscar(`${url}/api/flags`)
  itens.push(...avaliarFlags(flags.status, json(flags.texto), { esperarFechado }))
  const home = await buscar(`${url}/`)
  itens.push(...avaliarCabecalhos(home.status, home.cabecalhos))
  const app = await buscar(`${url}/app`)
  itens.push(...avaliarPagina('/app', app.status, app.texto))
  const planos = await buscar(`${url}/planos`)
  itens.push(...avaliarPagina('/planos', planos.status, planos.texto, { contem: 'R$' }))
  const robots = await buscar(`${url}/robots.txt`)
  itens.push(...avaliarRobots(robots.status, robots.texto))
  const sitemap = await buscar(`${url}/sitemap.xml`)
  itens.push(...avaliarSitemap(sitemap.status, sitemap.texto))
  const ads = await buscar(`${url}/ads.txt`)
  itens.push(...avaliarAdsTxt(ads.status, ads.texto))
  const origemDoApp = new URL(url).origin
  const modelo = await buscar(`${modelos}/${ARQUIVO_DE_VOZ.caminho}`, {
    metodo: 'HEAD',
    extras: { origin: origemDoApp },
  })
  itens.push(...avaliarModelo(modelo.status, modelo.cabecalhos, { origem: origemDoApp }))
  if (origem) {
    const direta = await buscar(`${origem}/`)
    itens.push(...avaliarOrigemDireta(direta.status))
  }
  return itens
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let opcoes
  try {
    opcoes = lerArgumentos(process.argv.slice(2))
  } catch (e) {
    console.error(`uso: ${e.message}`)
    console.error(
      'node scripts/producao/conferir-producao.mjs --url <base> [--esperar-fechado] [--modelos <raiz>] [--origem <url>]',
    )
    process.exit(2)
  }
  console.log(
    `Conferência somente-leitura de ${opcoes.url}${opcoes.esperarFechado ? ' (esperando tudo fechado)' : ''} — ${new Date().toISOString()}`,
  )
  console.log('')
  const { texto, codigo } = resumir(await conferir(opcoes))
  console.log(texto)
  process.exit(codigo)
}
