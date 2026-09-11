#!/usr/bin/env node
/**
 * EVIDÊNCIAS VISUAIS DO REDESIGN — uma captura por rota × viewport × modo.
 *
 *     node scripts/redesign/evidencias.mjs --fase 00-base
 *     node scripts/redesign/evidencias.mjs --fase 02-casca --so /jogar,/vocabulario
 *     node scripts/redesign/evidencias.mjs --fase 12-temas --so inicio,jogar --temas babel,mochi,aurora
 *
 * Não é teste: não afirma nada, só registra. O objetivo é que cada PR do redesign mostre o antes
 * e o depois de cada tela nos três viewports da suíte E2E (375/768/1280) e nos dois modos
 * (claro/escuro), em vez de descrever a mudança em prosa. As imagens vão para
 * `docs/redesign/evidencias/<fase>/<rota>__<viewport>__<modo>.png`.
 *
 * Sobe o app sozinho, na mesma porta e com o mesmo banco descartável da suíte E2E
 * (`scripts/e2e/preparar-banco.mjs`), para nunca fotografar — nem escrever em — o banco real.
 * Se já houver um servidor na porta, reaproveita.
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { chromium } from '@playwright/test'

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const args = process.argv.slice(2)
const lerArg = (nome, padrao) => {
  const i = args.indexOf(nome)
  return i >= 0 && args[i + 1] ? args[i + 1] : padrao
}
const fase = lerArg('--fase', null)
if (!fase) {
  console.error('Uso: node scripts/redesign/evidencias.mjs --fase <NN-nome> [--so /rota,/rota] [--modos claro,escuro]')
  process.exit(2)
}
const PORTA = process.env.PORT ?? '3302'
const BASE = `http://localhost:${PORTA}`
const BANCO = process.env.DATABASE_URL ?? 'file:./data/evidencias-descartavel.db'

/* As rotas de topo de `src/lib/rotas.ts` mais as abas com endereço próprio. `/sessao/<id>` e
   `/revisar/<id>` dependem de dados; ficam de fora até o banco descartável ser semeado. */
const ROTAS_PADRAO = [
  '/',
  '/capturar',
  '/jogar',
  '/biblioteca',
  '/vocabulario',
  '/revisar',
  '/loja/meu-visual',
  '/loja/itens',
  '/loja/passe',
  '/loja/desafios',
  '/sobre',
  '/plano',
  '/perfil',
  '/ajustes',
]
/* `inicio` é o apelido da raiz: no Git Bash um argumento `/` vira `C:/Program Files/Git/` antes de
   chegar ao Node (conversão de caminho do MSYS), e a captura da tela inicial falhava em silêncio. */
const rotas = lerArg('--so', '')
  ? lerArg('--so', '')
      .split(',')
      .map((r) => (r === 'inicio' || r === '' ? '/' : r.startsWith('/') ? r : `/${r}`))
  : ROTAS_PADRAO
/* Mesma lista de `tests/e2e/acessibilidade.e2e.ts`: conquistas de `core/learning/conquistas.ts` + níveis. */
const CONQUISTAS = [
  'primeira-captura',
  'ouvinte',
  'caderno-cheio',
  'revisor',
  'sem-erro',
  'perfeccionista',
  'maratonista',
  'constante',
  'colecionador',
  'poliglota',
  'duelista',
  'cliente',
  'nivel-5',
  'nivel-10',
]
const RECOMPENSAS_VISTAS = [
  ...CONQUISTAS.map((id) => `conquista:${id}`),
  ...Array.from({ length: 60 }, (_, n) => `nivel:${n + 1}`),
]
const modos = lerArg('--modos', 'claro,escuro').split(',')
/* Temas (`data-theme`): o servidor vence o localStorage em `hydrateTheme`, então cada passada grava
   o tema por `PUT /api/settings` e o script devolve `babel` no fim. Sem `--temas`, uma passada só,
   no tema que o banco descartável já tem (babel), e o nome do arquivo não muda. */
const temas = lerArg('--temas', '') ? lerArg('--temas', '').split(',') : [null]
const VIEWPORTS = [
  { nome: '375', width: 375, height: 812, isMobile: true, hasTouch: true },
  { nome: '768', width: 768, height: 1024 },
  { nome: '1280', width: 1280, height: 800 },
]

async function servidorResponde() {
  try {
    const r = await fetch(`${BASE}/api/ready`)
    return r.ok
  } catch {
    return false
  }
}

async function subirServidor() {
  if (await servidorResponde()) {
    console.log(`Servidor já responde em ${BASE}; reaproveitando.`)
    return null
  }
  console.log(`Subindo o app em ${BASE} com ${BANCO}…`)
  const filho = spawn(process.execPath, ['scripts/e2e/preparar-banco.mjs'], {
    cwd: raiz,
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: BANCO },
  })
  await new Promise((ok, erro) =>
    filho.on('exit', (c) => (c === 0 ? ok() : erro(new Error(`preparar-banco saiu com ${c}`)))),
  )
  const servidor = spawn(process.execPath, ['subir-dev.mjs'], {
    cwd: raiz,
    stdio: 'ignore',
    env: { ...process.env, DATABASE_URL: BANCO, PORT: PORTA },
  })
  for (let i = 0; i < 90; i++) {
    await new Promise((r) => setTimeout(r, 1000))
    if (await servidorResponde()) return servidor
  }
  servidor.kill()
  throw new Error('o servidor não respondeu em 90 s')
}

/* O onboarding não tem <main>; marcar `onboarded` pelo mesmo PUT que a suíte E2E usa. */
async function gravarUi(ui) {
  await fetch(`${BASE}/api/settings`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ui }),
  }).catch(() => {})
}
const pularOnboarding = () => gravarUi({ onboarded: true })

const servidor = await subirServidor()
await pularOnboarding()
const destino = join(raiz, 'docs', 'redesign', 'evidencias', fase)
mkdirSync(destino, { recursive: true })

const navegador = await chromium.launch()
let total = 0
try {
  for (const tema of temas) {
    /* `PUT /api/settings` SUBSTITUI o blob `ui` inteiro (server/db/repositories/settings.ts:57);
     não há merge no servidor. Sem repetir `onboarded: true` aqui, a segunda troca de tema apagava
     o pulo do onboarding e as capturas seguintes fotografavam a tela de boas-vindas. */
    if (tema) await gravarUi({ theme: tema, onboarded: true })
    for (const vp of VIEWPORTS) {
      for (const modo of modos) {
        const contexto = await navegador.newContext({
          viewport: { width: vp.width, height: vp.height },
          isMobile: vp.isMobile ?? false,
          hasTouch: vp.hasTouch ?? false,
          colorScheme: modo === 'escuro' ? 'dark' : 'light',
          reducedMotion: 'reduce',
        })
        /* O modo é forçado pelo mesmo localStorage que `theme.ts` lê no boot (`DARK_KEY = 'theme'`),
         para a captura não depender da preferência do sistema nem da hidratação do servidor.
         A fila de recompensas é silenciada do mesmo jeito que `tests/e2e/acessibilidade.e2e.ts`
         faz: marcando como vistas todas as conquistas do catálogo e os níveis. */
        await contexto.addInitScript(
          ({ m, t, vistas }) => {
            try {
              localStorage.setItem('theme', m === 'escuro' ? 'dark' : 'light')
              if (t) localStorage.setItem('app_theme', t)
              localStorage.setItem('babel.recompensas_vistas', JSON.stringify(vistas))
            } catch {}
          },
          { m: modo, t: tema, vistas: RECOMPENSAS_VISTAS },
        )
        const pagina = await contexto.newPage()
        for (const rota of rotas) {
          const nome =
            (rota === '/' ? 'inicio' : rota.replace(/^\//, '').replace(/\//g, '-')) +
            `__${vp.nome}__${modo}${tema ? `__${tema}` : ''}.png`
          try {
            await pagina.goto(`${BASE}${rota}`, { waitUntil: 'networkidle', timeout: 30_000 })
            await pagina
              .getByRole('main')
              .first()
              .waitFor({ timeout: 15_000 })
              .catch(() => {})
            await pagina.waitForTimeout(400)
            await pagina.screenshot({ path: join(destino, nome), fullPage: true })
            total++
            console.log(`  ${nome}`)
          } catch (e) {
            console.log(`  FALHOU ${nome}: ${e.message.split('\n')[0]}`)
          }
        }
        await contexto.close()
      }
    }
  }
} finally {
  if (temas[0]) await gravarUi({ theme: 'babel', onboarded: true })
  await navegador.close()
  if (servidor) servidor.kill()
}
console.log(`\n${total} capturas em docs/redesign/evidencias/${fase}/`)
if (!existsSync(join(destino))) process.exit(1)
