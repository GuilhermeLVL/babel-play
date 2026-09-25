#!/usr/bin/env node
/**
 * NENHUMA ROTA `/api` SOME SEM DEPRECIAÇÃO — o contrato de compatibilidade da API (Fase 6).
 *
 * Uma aba aberta desde ontem roda o bundle VELHO contra o servidor NOVO até a pessoa clicar em
 * "Atualizar" (o aviso de versão nova de `x-babel-versao`). E um rollback põe o servidor velho sob
 * o cliente novo. Nos dois casos, uma rota que sumiu vira 404 JSON (`rota_inexistente`) numa tela
 * que funcionava. A política (docs/versionamento.md): a API muda de forma ADITIVA; uma rota só é
 * removida depois de entrar em `tests/contratos/api-depreciacoes.json` e passarem DUAS versões
 * minor (ou uma major) — tempo para toda aba velha ter recarregado.
 *
 * O contrato é `tests/contratos/api-contrato.json`: a lista de `MÉTODO /caminho` que o servidor
 * serve, tirada do mesmo censo do portão de consumidores (`_rotas-do-servidor.mjs`).
 *
 *   node scripts/testes/contrato-api.mjs              # confere (CI); falha com a lista do que mudou
 *   node scripts/testes/contrato-api.mjs --atualizar  # regrava o contrato — só se a conferência
 *                                                     # de remoção passar (rota nova é livre)
 */
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { rotasDoServidor } from './_rotas-do-servidor.mjs'

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
export const ARQ_CONTRATO = path.join(RAIZ, 'tests', 'contratos', 'api-contrato.json')
export const ARQ_DEPRECIACOES = path.join(RAIZ, 'tests', 'contratos', 'api-depreciacoes.json')

/** `1.2.3` → [1, 2, 3]. */
function partes(v) {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(String(v))
  if (!m) throw new Error(`versão "${v}" não é semver`)
  return m.slice(1, 4).map(Number)
}

/** Compara duas versões semver: <0, 0, >0. */
export function compararVersoes(a, b) {
  const [x, y] = [partes(a), partes(b)]
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]
  return 0
}

/** A primeira versão em que uma rota depreciada em `v` pode sumir: duas minor depois (1.2.x → 1.4.0). */
export function removivelAPartirDe(v) {
  const [maior, menor] = partes(v)
  return `${maior}.${menor + 2}.0`
}

/** As rotas `/api` do servidor hoje, como `MÉTODO /caminho`, ordenadas. */
export function rotasAtuais() {
  return rotasDoServidor()
    .filter((r) => r.caminho.startsWith('/api'))
    .map((r) => `${r.metodo} ${r.caminho}`)
    .sort()
}

/**
 * A conferência, pura. `contrato` = rotas registradas; `depreciacoes` = [{ rota, depreciadaEm,
 * motivo, substituta? }]; `versaoAtual` = a do package.json.
 */
export function conferirContrato({ atuais, contrato, depreciacoes, versaoAtual }) {
  const erros = []
  const setAtuais = new Set(atuais)
  const porRota = new Map(depreciacoes.map((d) => [d.rota, d]))

  for (const d of depreciacoes) {
    if (!d.rota || !d.depreciadaEm || !d.motivo) {
      erros.push(`depreciação incompleta (precisa de rota, depreciadaEm e motivo): ${JSON.stringify(d)}`)
    }
  }

  const removidas = contrato.filter((r) => !setAtuais.has(r))
  for (const r of removidas) {
    const d = porRota.get(r)
    if (!d) {
      erros.push(
        `${r} sumiu do servidor sem depreciação. Uma aba aberta com o bundle anterior (ou um rollback) ` +
          'chama esta rota e recebe 404. Restaure-a, ou registre-a em tests/contratos/api-depreciacoes.json e espere duas versões minor (docs/versionamento.md).',
      )
      continue
    }
    const pode = removivelAPartirDe(d.depreciadaEm)
    if (compararVersoes(versaoAtual, pode) < 0) {
      erros.push(
        `${r} foi depreciada em ${d.depreciadaEm} e só pode sumir a partir de ${pode} (versão atual ${versaoAtual})`,
      )
    }
  }

  const novas = atuais.filter((r) => !contrato.includes(r))
  return { erros, removidas, novas }
}

function lerJson(arquivo, padrao) {
  try {
    return JSON.parse(readFileSync(arquivo, 'utf8'))
  } catch {
    return padrao
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const atualizar = process.argv.includes('--atualizar')
  const versaoAtual = JSON.parse(readFileSync(path.join(RAIZ, 'package.json'), 'utf8')).version
  const contrato = lerJson(ARQ_CONTRATO, { rotas: [] }).rotas
  const depreciacoes = lerJson(ARQ_DEPRECIACOES, { depreciacoes: [] }).depreciacoes
  const atuais = rotasAtuais()
  const r = conferirContrato({ atuais, contrato, depreciacoes, versaoAtual })

  for (const e of r.erros) console.error(`ERRO: ${e}`)
  if (r.erros.length) process.exit(1)

  if (atualizar) {
    writeFileSync(
      ARQ_CONTRATO,
      JSON.stringify(
        {
          '//': 'Gerado por `node scripts/testes/contrato-api.mjs --atualizar`. Rota nova entra livre; rota que sai precisa de api-depreciacoes.json (docs/versionamento.md).',
          rotas: atuais,
        },
        null,
        2,
      ) + '\n',
    )
    console.log(
      `contrato regravado: ${atuais.length} rotas (+${r.novas.length} novas, -${r.removidas.length} removidas após depreciação)`,
    )
    process.exit(0)
  }

  if (r.novas.length) {
    for (const n of r.novas) console.error(`NOVA sem contrato: ${n}`)
    console.error(
      'rota nova é permitida (mudança aditiva) — registre-a: node scripts/testes/contrato-api.mjs --atualizar',
    )
    process.exit(1)
  }
  if (r.removidas.length) {
    console.error(
      `removidas após o prazo de depreciação: ${r.removidas.join(', ')} — tire-as do contrato com --atualizar`,
    )
    process.exit(1)
  }
  console.log(`contrato da API: ${atuais.length} rotas /api, nenhuma removida sem depreciação (versão ${versaoAtual})`)
}
