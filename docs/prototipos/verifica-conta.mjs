import { createRequire } from 'node:module'
import { join } from 'node:path'
import { readFileSync, mkdirSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
const RAIZ = 'C:/Users/Guilh/OneDrive/Área de Trabalho/babel-play-lab/.claude/worktrees/audit-v4'
const require = createRequire(join(RAIZ, 'package.json'))
const { chromium } = require('playwright')
const AXE = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8')
const ARQ = pathToFileURL(join(RAIZ, 'docs/prototipos/consistencia-telas.html')).href
const OUT = join(import.meta.dirname, 'conta'); mkdirSync(OUT, { recursive: true })
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
      return (await axe.run({ include:[alvo], exclude:['#toast','#tip'] }, { runOnly:{ type:'tag', values:['wcag2a','wcag2aa','wcag21aa','wcag22aa'] } })).violations.map((x)=>`${x.id}×${x.nodes.length} ${x.nodes[0].target.join(' ')} ${(x.nodes[0].any[0]?.message||x.nodes[0].failureSummary||'').slice(0,90)}`) }, [AXE, alvo])
    ok(!v.length, `axe ${r} ${v.join(' | ')}`) }
  const icones = async (r) => { const f = await p.evaluate(() => [...new Set([...document.querySelectorAll('#app i[data-lucide]')].map(i=>i.dataset.lucide))]); ok(!f.length, `ícones renderizados (${r}) ${f.join(',')}`) }
  const hscroll = async (r) => ok(await p.evaluate(() => { const e = document.querySelector('#rolagem'); return e.scrollWidth <= e.clientWidth + 1 }), `sem rolagem lateral: ${r}`)
  const foto = (n) => p.screenshot({ path: join(OUT, `${modo}-${n}.png`) })
  // Estatísticas
  await p.evaluate(() => ir('estatisticas')); await esperar(600)
  ok(await p.locator('.kpi').count() === 5, 'estatísticas: 5 KPIs'); ok(await p.locator('.graf-cartao').count() === 6, 'estatísticas: 6 gráficos')
  await icones('estatísticas'); await axe('estatísticas'); await hscroll('estatísticas'); await foto('1-estatisticas')
  await p.locator('[data-stat-per="90"]').click(); await esperar(100)
  ok(await p.locator('.esqueleto').count() > 0, 'troca de período mostra esqueleto'); await esperar(500)
  ok(/semana/.test(await p.locator('#gt-minutos').innerText()), '90 dias agrupa por semana')
  await p.locator('.g-barra').first().scrollIntoViewIfNeeded(); await p.locator('g[data-tip]:has(.g-barra)').first().hover(); await esperar(150)
  ok(await p.locator('#tip.on').count() === 1 && /min/.test(await p.locator('#tip').innerText()), 'tooltip no gráfico')
  await p.locator('[data-tabela-graf=minutos]').click(); await esperar(200)
  ok(await p.locator('.graf-cartao table').count() === 1, 'gráfico vira tabela'); await axe('estatísticas com tabela')
  await p.locator('.cab-acoes [data-relatorio-semanal]').click(); await esperar(300); await axe('relatório semanal', '#dlg'); await foto('2-relatorio'); await p.keyboard.press('Escape'); await esperar(200)
  // Ajustes: notificações, privacidade, conta
  for (const aba of ['notificacoes', 'privacidade', 'conta']) { await p.evaluate((a) => ir('ajustes', { abaAlvo:a }), aba); await esperar(450); await icones('ajustes/' + aba); await axe('ajustes/' + aba); await hscroll('ajustes/' + aba); await foto(`3-ajustes-${aba}`) }
  await p.evaluate(() => ir('ajustes', { abaAlvo:'notificacoes' })); await esperar(400)
  await p.locator('[data-sw="lembrete"]').click(); await esperar(200)
  ok(await p.locator('[data-sw="lembrete"]').getAttribute('aria-checked') === 'false', 'interruptor alterna')
  await p.evaluate(() => ir('ajustes', { abaAlvo:'privacidade' })); await esperar(400)
  await p.locator('[data-exportar-dados]').click(); await esperar(2100)
  ok(/pronto/.test(await p.locator('#main').innerText()), 'exportação de dados fica pronta')
  await p.evaluate(() => ir('ajustes', { abaAlvo:'conta' })); await esperar(400)
  await p.locator('[data-conta="2fa"]').click(); await esperar(250); await axe('diálogo 2FA', '#dlg'); await p.locator('[data-conta-ok="2fa"]').click(); await esperar(400)
  ok(await p.locator('.codigos-rec code').count() === 8, '2FA mostra códigos de recuperação'); await p.keyboard.press('Escape'); await esperar(200)
  await p.locator('[data-sair-sessao]').first().click(); await esperar(250)
  ok(await p.locator('[data-sair-sessao]').count() === 1, 'sair de um aparelho')
  await p.locator('[data-conta="excluir"]').click(); await esperar(250)
  ok(await p.locator('[data-conta-ok="excluir"]').isDisabled(), 'excluir começa desabilitado'); await p.fill('#dg-confirma', 'excluir'); await esperar(100)
  ok(!(await p.locator('[data-conta-ok="excluir"]').isDisabled()), 'digitar EXCLUIR libera'); await axe('diálogo excluir', '#dlg'); await p.keyboard.press('Escape'); await esperar(200)
  // Perfil
  await p.evaluate(() => { E.abas.perfil = 'voce'; ir('perfil') }); await esperar(450)
  await p.fill('#pf-nome', 'Guilherme'); await esperar(150)
  ok(await p.locator('.barra-salvar.on').count() === 1, 'perfil mostra alterações não salvas')
  await p.locator('[data-pf-salvar]').click(); await esperar(250); ok(await p.getByText('Salvo agora').count() === 1, 'salvar dá feedback')
  await icones('perfil'); await axe('perfil'); await foto('4-perfil')
  // Notificações
  await p.locator('.sino:visible').first().click(); await esperar(300)
  ok(await p.locator('#notif.on .notif-item').count() >= 4, 'central de notificações'); await axe('notificações', '#notif'); await foto('5-notificacoes')
  await p.locator('[data-notif-todas]').click(); await esperar(200); ok(await p.locator('.contagem').count() === 0, 'marcar todas zera o contador')
  await p.locator('[data-notif="n3"]').click(); await esperar(450); ok(await p.evaluate(() => E.tela === 'estatisticas'), 'notificação leva à tela')
  // Ajuda, atalhos, 404, offline
  await p.evaluate(() => ir('ajuda')); await esperar(400); await icones('ajuda'); await axe('ajuda'); await foto('6-ajuda')
  await p.locator('#rolagem').click({ position:{ x:5, y:5 } }); await p.keyboard.press('?'); await esperar(300)
  ok(await p.evaluate(() => document.getElementById('dlg').open && /Atalhos/.test(document.getElementById('dlg').innerText)), 'tecla ? abre atalhos'); await p.keyboard.press('Escape'); await esperar(200)
  await p.keyboard.press('g'); await p.keyboard.press('j'); await esperar(400); ok(await p.evaluate(() => E.tela === 'jogar'), 'G J vai para Jogar')
  await p.evaluate(() => ir('rota-que-nao-existe')); await esperar(400); ok(/não existe/.test(await p.locator('#main').innerText()), 'rota desconhecida mostra 404'); await axe('404')
  await p.click('#p-offline'); await esperar(400); ok(await p.locator('#offline.on').count() === 1, 'aviso de offline'); await foto('7-offline'); await p.click('#p-offline')
  // Entrada
  await p.evaluate(() => irAuth('entrar')); await esperar(400); await icones('entrar'); await axe('entrar', '#auth'); await foto('8-entrar')
  for (let i = 0; i < 5; i++) { await p.fill('#au-email', 'x@y.co'); await p.fill('#au-senha', '123'); await p.locator('[data-auth-form=entrar] button[type=submit]').click(); await esperar(120) }
  ok(/Muitas tentativas/.test(await p.locator('#auth').innerText()), 'bloqueio depois de 5 tentativas')
  await p.locator('[data-auth=criar]').first().click(); await esperar(300)
  await p.fill('#au-nome', 'Ana'); await p.fill('#au-email', 'ana@exemplo.com'); await p.fill('#au-dia', '10'); await p.fill('#au-mes', '05'); await p.fill('#au-ano', '2018')
  await p.fill('#au-senha', 'abc'); await esperar(100); ok(/Muito fraca|Fraca/.test(await p.locator('.forca').innerText()), 'medidor mostra senha fraca')
  await p.fill('#au-senha', 'Cavalo-Azul-2026'); await esperar(100); ok(/Forte|Boa/.test(await p.locator('.forca').innerText()), 'medidor mostra senha forte')
  await axe('criar conta', '#auth'); await foto('9-criar')
  await p.locator('[data-auth-form=criar] button[type=submit]').click(); await esperar(200)
  ok(/aceite os Termos/.test(await p.locator('#auth').innerText()), 'exige aceite dos termos')
  await p.check('#au-aceite'); await p.locator('[data-auth-form=criar] button[type=submit]').click(); await esperar(300)
  ok(/responsável/.test(await p.locator('#auth').innerText()), 'menor de 12 vai para o fluxo do responsável'); await axe('responsável', '#auth'); await foto('10-responsavel')
  await p.evaluate(() => { E.cad = {}; irAuth('criar') }); await esperar(300); await p.fill('#au-nome', 'Ana'); await p.fill('#au-email', 'ana@exemplo.com'); await p.fill('#au-dia', '10'); await p.fill('#au-mes', '05'); await p.fill('#au-ano', '1995'); await p.fill('#au-senha', 'Cavalo-Azul-2026'); await p.check('#au-aceite'); await p.locator('[data-auth-form=criar] button[type=submit]').click(); await esperar(400); console.log('    estado:', await p.evaluate(() => E.auth + ' ' + (E.authErro||'')))
  ok(await p.locator('[data-dig]').count() === 6, 'adulto vai para o código de 6 dígitos'); await axe('código', '#auth')
  await p.locator('[data-dig="0"]').focus(); await p.keyboard.type('123456'); await esperar(150); await p.locator('[data-auth-form=codigo] button[type=submit]').click(); await esperar(300)
  ok(await p.evaluate(() => !E.auth), 'código válido entra no app')
  await p.evaluate(() => irAuth('esqueci')); await esperar(200); await p.fill('#au-email', 'ana@exemplo.com'); await p.locator('[data-auth-form=esqueci] button').click(); await esperar(200)
  await p.locator('[data-auth=redefinir]').click(); await esperar(200); await p.fill('#au-senha', 'Cavalo-Azul-2026'); await p.fill('#au-senha2', 'outra'); await p.locator('[data-auth-form=redefinir] button[type=submit]').click(); await esperar(200)
  ok(/não são iguais/.test(await p.locator('#auth').innerText()), 'redefinir confere a repetição'); await axe('redefinir', '#auth')
  await p.evaluate(() => irAuth(null))
  ok(!erros.length, `sem erros de JS ${erros.join(' ; ').slice(0, 300)}`)
  await p.close()
}
await b.close(); console.log(falhas ? `${falhas} FALHA(S)` : 'TUDO OK')
