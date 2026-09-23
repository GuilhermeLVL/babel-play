import { createRequire } from 'node:module'
import { join } from 'node:path'
import { mkdirSync, readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
const RAIZ = 'C:/Users/Guilh/OneDrive/Área de Trabalho/babel-play-lab/.claude/worktrees/audit-v4'
const require = createRequire(join(RAIZ, 'package.json'))
const { chromium } = require('playwright')
const AXE = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8')
const ARQ = pathToFileURL(join(RAIZ, 'docs/prototipos/consistencia-telas.html')).href
const OUT = join(import.meta.dirname, 'ichat'); mkdirSync(OUT, { recursive: true })
const esperar = (ms) => new Promise((r) => setTimeout(r, ms))
let falhas = 0
const ok = (c, m) => { if (!c) { falhas++; console.log('  ERR', m) } else console.log('  ok ', m) }
const axe = async (page, rotulo) => {
  const v = await page.evaluate(async (src) => { if (!window.axe) { const s = document.createElement('script'); s.textContent = src; document.head.appendChild(s) }
    return (await axe.run('#painel-chat', { runOnly: { type: 'tag', values: ['wcag2a','wcag2aa','wcag21aa','wcag22aa'] } })).violations.map((x) => `${x.id}×${x.nodes.length} ${x.nodes[0].target.join(' ')} ${(x.nodes[0].any[0]?.message||x.nodes[0].failureSummary||'').slice(0,100)}`) }, AXE)
  ok(!v.length, `axe ${rotulo}: ${v.join(' | ')}`)
}
const browser = await chromium.launch({ headless: true })
for (const modo of ['desktop-claro', 'desktop-escuro', 'celular-claro']) {
  console.log('==', modo)
  const celular = modo.startsWith('celular')
  const page = await browser.newPage({ viewport: celular ? { width: 430, height: 1000 } : { width: 1440, height: 1000 } })
  const erros = []; page.on('pageerror', (e) => erros.push(e.message)); page.on('console', (m) => m.type() === 'error' && erros.push(m.text()))
  await page.goto(ARQ, { waitUntil: 'networkidle' }); await esperar(500)
  if (celular) await page.click('#p-celular')
  if (modo.endsWith('escuro')) await page.click('#p-escuro')
  await esperar(300)
  await page.click('#fab'); await esperar(400)
  ok(await page.locator('#painel-chat.on').count() === 1, 'painel abre')
  ok(/tela Início/.test(await page.locator('.ch-ctx-linha').innerText()), 'contexto começa em Início')
  await axe(page, 'painel vazio')
  await page.screenshot({ path: join(OUT, `${modo}-1-aberto.png`) })
  // contexto acompanha a navegação
  await page.evaluate(() => ir('jogar')); await esperar(450)
  ok(/tela Jogar/.test(await page.locator('.ch-ctx-linha').innerText()), 'contexto acompanha para Jogar')
  await page.click('.ch-ctx-linha'); await esperar(200)
  ok(/3 palavras de Minhas gravações/.test(await page.locator('.ch-ctx-det').innerText()), 'detalhe do contexto lista os campos')
  // autocompletar @ → ficha → enviar
  await page.fill('#ch-input', 'o que significa @lev'); await esperar(250)
  ok(await page.locator('.ch-pop [data-ch-token]').count() === 1, 'autocompletar @ filtra palavras')
  await page.keyboard.press('Enter'); await esperar(250)
  ok(await page.locator('.ch-chip').count() === 1, 'ficha @leverage adicionada')
  await page.locator('#ch-input').fill('o que significa'); await page.keyboard.press('Enter'); await esperar(2400)
  const ultima = await page.locator('.ch-msg.ia').last().innerText()
  ok(/alavancar/.test(ultima) && /Origem/.test(ultima), 'resposta cita a palavra e a origem')
  await page.screenshot({ path: join(OUT, `${modo}-2-resposta.png`) })
  await axe(page, 'com resposta e proposta')
  // proposta com confirmação
  ok(await page.locator('[data-ch-confirmar]').count() >= 1, 'proposta pede confirmação')
  await page.locator('[data-ch-confirmar]').last().click(); await esperar(500)
  ok(await page.evaluate(() => E.tela === 'revisao'), 'confirmar a proposta abre a revisão')
  ok(/tela Revisão/.test(await page.locator('.ch-ctx-linha').innerText()), 'contexto vira Revisão')
  // !ação e lacuna honesta
  await page.fill('#ch-input', 'qual o status do meu pagamento?'); await page.keyboard.press('Enter'); await esperar(1600)
  ok(/Não tenho esse dado/.test(await page.locator('.ch-msg.ia').last().innerText()), 'lacuna: diz que não sabe')
  // ferramentas por tela
  await page.click('[data-ch=ferramentas]'); await esperar(200)
  ok(/Ferramentas para/.test(await page.locator('.ch-ferr').innerText()), 'menu de ferramentas da tela')
  await page.screenshot({ path: join(OUT, `${modo}-3-ferramentas.png`) })
  await axe(page, 'ferramentas')
  await page.locator('[data-ch-ferr=jogar]').click(); await esperar(2400)
  ok(/Memória/.test(await page.locator('.ch-msg.ia').last().innerText()), 'ferramenta sugerir jogo responde')
  // rastro
  await page.click('[data-ch=rastro]'); await esperar(250)
  const stats = await page.locator('.ch-stats b').allInnerTexts()
  ok(+stats[0] >= 3 && +stats[1] >= 1 && +stats[3] >= 2 && +stats[4] >= 1, `rastro conta telas/palavras/perguntas/ações: ${stats.join(',')}`)
  await page.screenshot({ path: join(OUT, `${modo}-4-rastro.png`) })
  await axe(page, 'rastro')
  // histórico: nova, renomear, buscar
  await page.click('[data-ch=conversas]'); await esperar(250)
  ok(await page.locator('.ch-item').count() >= 2, 'histórico lista conversas')
  await page.locator('.ch-item.atual [data-ch-renomear]').click(); await esperar(150)
  await page.fill('#ch-renome', 'Dúvidas da revisão'); await page.keyboard.press('Enter'); await esperar(200)
  ok(await page.getByText('Dúvidas da revisão').count() > 0, 'renomear conversa')
  await page.fill('#ch-busca', 'alavancar'); await esperar(250)
  ok(await page.locator('.ch-achado').count() >= 1, 'busca mostra “achado em”')
  await page.screenshot({ path: join(OUT, `${modo}-5-conversas.png`) })
  await axe(page, 'conversas')
  await page.fill('#ch-busca', ''); await page.click('[data-ch=nova]'); await esperar(250)
  ok(await page.locator('.ch-msg').count() === 1, 'nova conversa começa limpa')
  await page.keyboard.press('Escape'); await esperar(250)
  ok(await page.locator('#painel-chat.on').count() === 0, 'Esc fecha o iChat')
  ok(!erros.length, `sem erros de JS ${erros.join(' ; ').slice(0, 200)}`)
  await page.close()
}
await browser.close()
console.log(falhas ? `${falhas} FALHA(S)` : 'TUDO OK')
