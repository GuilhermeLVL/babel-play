#!/usr/bin/env node
/**
 * BANCO DESCARTAVEL DA SUITE E2E — apagado e recriado do zero a cada execucao.
 *
 * POR QUE ISTO EXISTE. Ate 2026-09-11 a suite usava o default de `server/db/db.ts:16`
 * (`file:./data/babel.db`), que e o banco REAL de quem desenvolve. As corridas criaram sessoes,
 * gastaram Seeds e avaliaram cartoes; o arquivo cresceu 950 KB e precisou ser restaurado de backup.
 *
 * O dano maior nao foi a escrita, foi a MEDICAO. Com o banco carregando o historico de uso da
 * maquina, cinco testes passaram a falhar — e eu os diagnostiquei como "falhas pre-existentes da
 * main". Nao eram: a main com banco limpo passa nos cinco. Uma suite cujo resultado depende de
 * quantos cartoes o dono revisou ontem nao mede o codigo.
 * Ver `docs/redesign/AUDITORIA-EXCECOES-E2E.md`.
 *
 * Este script roda como primeira etapa do `webServer.command` do Playwright, entao vale para
 * `npm run test:e2e` E para `npx playwright test` digitado a mao.
 */
import { existsSync, rmSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const CAMINHO_DESCARTAVEL = 'data/e2e-descartavel.db'

const url = process.env.DATABASE_URL ?? ''

/**
 * RECUSA EXPLICITA, e nao um aviso. Um `DATABASE_URL` apontando para o banco de trabalho e
 * exatamente o erro que custou uma restauracao de backup nesta rodada; falhar cedo e barulhento
 * custa um comando repetido, enquanto continuar custa os dados de alguem.
 */
const ehBancoDeTrabalho = /babel\.db(\?|$)/.test(url) || url === ''
if (ehBancoDeTrabalho) {
  console.error('')
  console.error('  A SUITE E2E RECUSOU SUBIR.')
  console.error('')
  console.error(`  DATABASE_URL = ${url || '(vazio — cairia no default file:./data/babel.db)'}`)
  console.error('')
  console.error('  A suite escreve no banco: cria sessoes, gasta Seeds, avalia cartoes. Apontar')
  console.error('  para data/babel.db destroi o estado real de quem desenvolve E torna o')
  console.error('  resultado dependente desse estado — ver docs/redesign/AUDITORIA-EXCECOES-E2E.md.')
  console.error('')
  console.error(`  Use:  DATABASE_URL=file:./${CAMINHO_DESCARTAVEL}`)
  console.error('  (o playwright.config.ts ja faz isso por padrao)')
  console.error('')
  process.exit(1)
}

/* Apagar e o passo que garante determinismo: o servidor roda as migracoes no boot, e o
   `_global-setup.ts` grava `settings.ui.onboarded` logo depois. Sem apagar, a segunda corrida
   herdaria o que a primeira escreveu — que e a forma lenta de reintroduzir o mesmo problema. */
let apagados = 0
for (const sufixo of ['', '-wal', '-shm']) {
  const arquivo = resolve(raiz, CAMINHO_DESCARTAVEL + sufixo)
  if (existsSync(arquivo)) {
    rmSync(arquivo, { force: true })
    apagados++
  }
}

console.log(
  `[e2e] banco descartavel: ${CAMINHO_DESCARTAVEL} (${apagados ? `${apagados} arquivo(s) removido(s)` : 'ja inexistente'}); ` +
    'as migracoes rodam no boot do servidor.',
)
