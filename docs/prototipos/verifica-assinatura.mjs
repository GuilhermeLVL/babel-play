import { createRequire } from 'node:module'
import { join } from 'node:path'
import { readFileSync, mkdirSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
const RAIZ = 'C:/Users/Guilh/OneDrive/Área de Trabalho/babel-play-lab/.claude/worktrees/audit-v4'
const require = createRequire(join(RAIZ, 'package.json'))
const { chromium } = require('playwright')
const AXE = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8')
const ARQ = pathToFileURL(join(RAIZ, 'docs/prototipos/consistencia-telas.html')).href
const OUT = join(import.meta.dirname, 'assin'); mkdirSync(OUT, { recursive: true })
const esperar = (ms) => new Promise((r) => setTimeout(r, ms))
let falhas = 0; const ok = (c, m) => { console.log(c ? '  ok ' : '  ERR', m); if (!c) falhas++ }
const b = await chromium.launch({ headless: true })
for (const modo of ['desktop-claro', 'desktop-escuro', 'celular-claro']) {
  console.log('==', modo)
  const cel = modo.startsWith('celular')
  const p = await b.newPage({ viewport: cel ? { width: 430, height: 1000 } : { width: 1440, height: 1000 } })
  const erros = []; p.on('pageerror', (e) => erros.push(e.message)); p.on('console', (m) => m.type()==='error' && erros.push(m.text()))
  await p.goto(ARQ, { waitUntil: 'networkidle' }); await esperar(400)
  if (cel) await p.click('#p-celular'); if (modo.endsWith('escuro')) await p.click('#p-escuro'); await esperar(300)
  const axe = async (r, alvo = '#app') => { const v = await p.evaluate(async ([src, alvo]) => { if (!window.axe) { const s = document.createElement('script'); s.textContent = src; document.head.appendChild(s) }
      return (await axe.run({ include:[alvo], exclude:['#toast'] }, { runOnly:{ type:'tag', values:['wcag2a','wcag2aa','wcag21aa','wcag22aa'] } })).violations.map((x)=>`${x.id}×${x.nodes.length} ${x.nodes[0].target.join(' ')} ${(x.nodes[0].any[0]?.message||x.nodes[0].failureSummary||'').slice(0,90)}`) }, [AXE, alvo])
    ok(!v.length, `axe ${r} ${v.join(' | ')}`) }
  const hscroll = async (r) => ok(await p.evaluate(() => { const e = document.querySelector('#rolagem'); return e.scrollWidth <= e.clientWidth + 1 }), `sem rolagem lateral: ${r}`)
  const foto = (n) => p.screenshot({ path: join(OUT, `${modo}-${n}.png`) })
  // Planos: período anual
  await p.evaluate(() => ir('planos')); await esperar(500)
  await p.click('[data-periodo=anual]'); await esperar(300)
  ok(/16,58/.test(await p.locator('.plano2.destaque .valor').innerText()), 'anual mostra R$ 16,58/mês no Pro')
  ok(await p.locator('.plano2.destaque .economia').count() === 1, 'anual mostra a economia')
  await foto('1-planos-anual'); await axe('planos anual'); await hscroll('planos')
  // Checkout cartão
  await p.locator('[data-cta-plano=pro]').click(); await esperar(500)
  ok(await p.evaluate(() => E.tela==='checkout' && E.co.periodo==='anual'), 'checkout abre com Pro anual')
  await foto('2-checkout-passo1'); await axe('checkout passo 1'); await hscroll('checkout 1')
  await p.click('[data-co-avancar]'); await esperar(300)
  await p.click('[data-co-pagar]'); await esperar(300)
  ok(await p.locator('[aria-invalid="true"]').count() >= 5, 'pagar vazio mostra erros por campo')
  await foto('3-checkout-erros'); await axe('checkout com erros')
  await p.fill('#co-numero', '4242424242424242'); ok(await p.inputValue('#co-numero') === '4242 4242 4242 4242', 'máscara do cartão')
  await p.fill('#co-nome', 'Guilherme Teste'); await p.fill('#co-validade', '1229'); ok(await p.inputValue('#co-validade') === '12/29', 'máscara da validade')
  await p.fill('#co-cvv', '123'); await p.fill('#co-cpf', '12345678901'); ok(await p.inputValue('#co-cpf') === '123.456.789-01', 'máscara do CPF')
  await p.fill('#co-email', 'teste@exemplo.com')
  await p.click('[data-co-cupom-abrir]'); await p.fill('#co-cupom', 'babel10'); await p.click('[data-co-cupom]'); await esperar(250)
  ok(await p.getByText('Cupom BABEL10').count() === 1, 'cupom aplica desconto no resumo')
  ok(/CDC, art\. 49/.test(await p.locator('.legal').innerText()), 'texto legal antes do botão')
  await foto('4-checkout-pronto')
  await p.click('[data-co-pagar]'); await esperar(1400)
  ok(await p.evaluate(() => E.tela==='assinado' && CONTA.estado==='pro-anual'), 'pagamento conclui e ativa o Pro anual')
  await foto('5-confirmado'); await axe('confirmação')
  // Sua assinatura
  await p.evaluate(() => ir('planos', { abaAlvo:'assinatura' })); await esperar(500)
  ok(await p.locator('.acao-assin').count() >= 4, 'sua assinatura mostra as ações')
  await foto('6-sua-assinatura'); await axe('sua assinatura'); await hscroll('sua assinatura')
  await p.locator('[data-sub=mudar-plano]').click(); await esperar(300)
  ok(await p.evaluate(() => document.getElementById('dlg').open), 'diálogo de mudar plano'); await axe('diálogo mudar plano', '#dlg'); await p.keyboard.press('Escape'); await esperar(200)
  await p.locator('[data-fatura]').first().click(); await esperar(250); await axe('recibo', '#dlg'); await p.keyboard.press('Escape'); await esperar(200)
  // Cancelamento com oferta e reembolso
  await p.locator('[data-sub=cancelar]').click(); await esperar(400)
  await foto('7-cancelar-1'); await axe('cancelar 1')
  await p.locator('[data-cx="2"]').click(); await esperar(250)
  await p.locator('[data-motivo=caro]').click(); await esperar(250)
  await foto('8-cancelar-motivo'); await axe('cancelar motivo')
  await p.locator('.botoes-cx .btn[data-cx="3"]').click(); await esperar(250)
  ok(/Essencial/.test(await p.locator('#main').innerText()), 'oferta coerente com "caro"')
  ok(await p.getByRole('button', { name: /Não, quero cancelar/ }).count() === 1, 'sempre dá para recusar a oferta')
  await foto('9-cancelar-oferta'); await axe('cancelar oferta')
  await p.getByRole('button', { name: /Não, quero cancelar/ }).click(); await esperar(250)
  await p.locator('[data-reembolso="1"]').click(); await esperar(200)
  await foto('10-cancelar-confirmar'); await axe('cancelar confirmar')
  await p.click('[data-cx-confirmar]'); await esperar(400)
  ok(/BP-2026/.test(await p.locator('#main').innerText()), 'tela final com protocolo')
  await foto('11-cancelado'); await axe('cancelado')
  // Pix
  await p.selectOption('#p-conta', 'selfhost'); await esperar(400)
  await p.evaluate(() => { Object.assign(E.co, { plano:'essencial', periodo:'mensal', passo:2, metodo:'pix', erros:{}, pixGerado:false }); ir('checkout') }); await esperar(400)
  await p.fill('#co-cpf', '12345678901'); await p.fill('#co-email', 'a@b.co'); await p.click('[data-co-pagar]'); await esperar(300)
  ok(await p.locator('.qr').count() === 1, 'Pix gera QR code'); await foto('12-pix'); await axe('pix')
  await p.click('[data-pix-pago]'); await esperar(500)
  ok(await p.evaluate(() => E.tela==='assinado' && CONTA.plano==='essencial'), 'Pix pago ativa o Essencial')
  // Estados
  for (const est of ['falhou', 'cancelada', 'pausada', 'gratis']) {
    await p.selectOption('#p-conta', est); await esperar(450)
    await foto(`13-estado-${est}`); await axe(`estado ${est}`)
  }
  ok(!erros.length, `sem erros de JS ${erros.join(' ; ').slice(0, 200)}`)
  await p.close()
}
await b.close(); console.log(falhas ? `${falhas} FALHA(S)` : 'TUDO OK')
