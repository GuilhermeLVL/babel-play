#!/usr/bin/env -S npx tsx
/**
 * PUBLICA O `latencia.json` (openspec `latencia-publicada-por-aparelho`, tarefa 1.3): lê a telemetria de campo `v: 2` dos
 * últimos 28 dias, soma os baldes por classe x idioma (nunca média de percentis), aplica o piso de 200 falas e grava UM arquivo
 * estático. É a ÚNICA peça com credencial de leitura; o app e o site só leem o arquivo.
 *
 *   npx tsx scripts/producao/publicar-latencia.mjs --fonte prometheus --dry-run          (PROMETHEUS_URL)
 *   npx tsx scripts/producao/publicar-latencia.mjs --fonte analytics-engine --dry-run    (CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN)
 *   npx tsx scripts/producao/publicar-latencia.mjs --fonte arquivo --entrada dump.json --saida dist/latencia.json
 *
 * Opções: `--dataset <nome>` (padrão `frasy_metricas`; no staging, `frasy_metricas_staging`), `--janela <dias>` (padrão 28),
 * `--saida <arquivo>` (padrão `latencia.json`), `--dry-run` (valida e imprime o resumo; NÃO grava). Sai com 0 se gerou um
 * arquivo válido, 1 se a fonte falhou ou o contrato não fechou, 2 em uso errado. Não imprime segredo.
 *
 * Sem dados (nenhuma célula) o arquivo sai com `celulas: []`: isso é a resposta honesta ("ainda não há público para publicar").
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { agregarLatencia, JANELA_DIAS, N_MIN } from '../../src/core/latencia/agregarLatencia.ts'
import { celulasOk, validarLatencia } from '../../src/core/latencia/contratoDaLatencia.ts'
import { fonteDeArquivo, fonteDoAnalyticsEngine, fonteDoPrometheus } from './latencia/fontes.mjs'

/** Lê e agrega; devolve o arquivo VALIDADO pelo contrato (ou lança). `fonte` e `hoje` entram para o teste ser determinístico. */
export async function gerarLatencia({ fonte, hoje = new Date(), janelaDias = JANELA_DIAS }) {
  const amostras = await fonte.ler({ janelaDias })
  const arquivo = agregarLatencia(amostras, hoje, janelaDias)
  /* Passa pelo MESMO contrato que o app aplica ao ler: o que o script grava é o que o app aceita. */
  const valido = validarLatencia(JSON.parse(JSON.stringify(arquivo)))
  if (!valido) throw new Error('o agregado não passou no contrato do latencia.json (v: 1)')
  return valido
}

/** Uma linha por célula, para o `--dry-run` conferir contra a consulta manual do runbook §3.2. */
export function resumo(arquivo) {
  const linhas = arquivo.celulas.map((c) =>
    c.estado === 'ok'
      ? `${c.classe} x ${c.idioma}: n=${c.n} p50=${c.p50Ms} ms p75=${c.p75Ms} ms falha=${(c.falha * 100).toFixed(1)}%`
      : `${c.classe} x ${c.idioma}: n=${c.n} insuficiente (< ${N_MIN})`,
  )
  return [
    `latencia.json v${arquivo.v} de ${arquivo.geradoEm}, janela ${arquivo.janelaDias} dias`,
    ...linhas,
    `células ok (das 15): ${celulasOk(arquivo)}`,
  ].join('\n')
}

function lerArgumentos(argv) {
  const o = {
    fonte: undefined,
    dryRun: false,
    saida: 'latencia.json',
    janela: JANELA_DIAS,
    dataset: 'frasy_metricas',
    entrada: undefined,
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    const valor = () => argv[++i]
    if (a === '--dry-run') o.dryRun = true
    else if (a === '--fonte') o.fonte = valor()
    else if (a === '--saida') o.saida = valor()
    else if (a === '--entrada') o.entrada = valor()
    else if (a === '--dataset') o.dataset = valor()
    else if (a === '--janela') o.janela = Number(valor())
    else return { erro: `argumento desconhecido: ${a}` }
  }
  if (!['prometheus', 'analytics-engine', 'arquivo'].includes(o.fonte ?? ''))
    return { erro: '--fonte prometheus|analytics-engine|arquivo' }
  if (!Number.isInteger(o.janela) || o.janela < 1 || o.janela > 90) return { erro: '--janela entre 1 e 90 dias' }
  if (o.fonte === 'arquivo' && !o.entrada) return { erro: '--fonte arquivo exige --entrada <dump.json>' }
  return { opcoes: o }
}

/**
 * @param {string[]} argv
 * @param {Record<string, string | undefined>} env
 * @param {{ log: (m: string) => void, error: (m: string) => void }} [saida]
 */
export async function principal(argv, env, saida = console) {
  const { opcoes, erro } = lerArgumentos(argv)
  if (erro) {
    saida.error(erro)
    return 2
  }
  try {
    const fonte =
      opcoes.fonte === 'prometheus'
        ? fonteDoPrometheus({ base: env.PROMETHEUS_URL ?? '' })
        : opcoes.fonte === 'analytics-engine'
          ? fonteDoAnalyticsEngine({
              conta: env.CLOUDFLARE_ACCOUNT_ID,
              token: env.CLOUDFLARE_API_TOKEN,
              dataset: opcoes.dataset,
            })
          : fonteDeArquivo({ amostras: JSON.parse(readFileSync(opcoes.entrada, 'utf8')) })
    const arquivo = await gerarLatencia({ fonte, janelaDias: opcoes.janela })
    saida.log(resumo(arquivo))
    if (opcoes.dryRun) {
      saida.log('--dry-run: nada foi gravado.')
      return 0
    }
    mkdirSync(path.dirname(path.resolve(opcoes.saida)), { recursive: true })
    writeFileSync(opcoes.saida, `${JSON.stringify(arquivo, null, 2)}\n`)
    saida.log(`gravado em ${opcoes.saida}`)
    return 0
  } catch (e) {
    /* A mensagem nunca carrega o token: as fontes só lançam texto próprio. */
    saida.error(`falhou: ${e instanceof Error ? e.message : String(e)}`)
    return 1
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(await principal(process.argv.slice(2), process.env))
}
