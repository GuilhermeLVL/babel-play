/**
 * A VERSÃO DO APP — uma regra só, para o cliente e para o servidor (P0-7b, auditoria de prontidão).
 *
 * Antes não havia versão em lugar nenhum: nem na tela, nem na API. Um bug relatado não dizia de
 * qual deploy era, e uma aba aberta desde ontem seguia rodando o bundle velho contra o servidor
 * novo sem ninguém saber.
 *
 * O FORMATO é o do semver com metadado de build: `0.1.0` (o `package.json`) e, quando o commit é
 * conhecido, `0.1.0+35bc2d6`. O sha vem de `GIT_SHA` ou, na falta dele, de `SENTRY_RELEASE` — que o
 * `Dockerfile` já preenche com o commit (`--build-arg VERSAO="$GITHUB_SHA"` no `deploy.yml`). Valor
 * que não tem cara de sha é descartado: um `SENTRY_RELEASE=babel-play@1.2` não pode virar parte da
 * versão que o cliente compara byte a byte.
 *
 * QUEM USA:
 *   - `vite.config.ts` embute a versão no bundle (`define: __APP_VERSION__`) e grava
 *     `dist/versao.json`;
 *   - o servidor em PRODUÇÃO lê esse `versao.json`, e não recalcula. Recalcular com o ambiente do
 *     runtime daria outra string sempre que o build e o runtime vissem variáveis diferentes (o
 *     `ARG` do Docker não atravessa estágio sozinho) — e cliente e servidor discordando é o aviso
 *     de "nova versão" em toda página, para sempre. Ler o arquivo do build é o que garante que os
 *     dois lados falam a mesma coisa;
 *   - fora de produção (dev, testes) não há build, e a versão é recalculada com a mesma função que
 *     o `vite.config.ts` usa no mesmo processo.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'

type Ambiente = Record<string, string | undefined>

const SHA = /^[0-9a-f]{7,40}$/i

/** `0.1.0` ou `0.1.0+<sha7>`. Pura: recebe a versão do pacote e o ambiente. */
export function montarVersao(versaoDoPacote: string, env: Ambiente): string {
  const candidato = [env.GIT_SHA, env.SENTRY_RELEASE].map((v) => v?.trim() ?? '').find((v) => v !== '')
  if (!candidato || !SHA.test(candidato)) return versaoDoPacote
  return `${versaoDoPacote}+${candidato.slice(0, 7).toLowerCase()}`
}

/** A versão que o build do cliente gravou em `<dist>/versao.json`, ou `null` se não houver. */
export function lerVersaoDoBuild(dist: string): string | null {
  try {
    const conteudo = JSON.parse(readFileSync(path.join(dist, 'versao.json'), 'utf8')) as { versao?: unknown }
    return typeof conteudo?.versao === 'string' && conteudo.versao ? conteudo.versao : null
  } catch {
    return null
  }
}

/** Versão do `package.json` na raiz do processo (em produção, `/app/package.json` do Dockerfile). */
function versaoDoPacote(): string {
  try {
    const pkg = JSON.parse(readFileSync(path.join(process.cwd(), 'package.json'), 'utf8')) as { version?: unknown }
    return typeof pkg.version === 'string' ? pkg.version : '0.0.0'
  } catch {
    return '0.0.0'
  }
}

let calculada: string | null = null

/** A versão deste processo — calculada uma vez (o disco e o ambiente não mudam depois do boot). */
export function versaoDoApp(): string {
  if (calculada) return calculada
  const doBuild = process.env.NODE_ENV === 'production' ? lerVersaoDoBuild(path.join(process.cwd(), 'dist')) : null
  calculada = doBuild ?? montarVersao(versaoDoPacote(), process.env)
  return calculada
}

/** Nome do cabeçalho que leva a versão em toda resposta `/api` (o cliente compara com o bundle). */
export const CABECALHO_DA_VERSAO = 'x-babel-versao'
