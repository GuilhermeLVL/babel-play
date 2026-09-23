// Rodada 9: cada subtela abre, funciona, passa no axe (WCAG 2.2 AA) e não cria rolagem lateral.
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { readFileSync, mkdirSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
const RAIZ = 'C:/Users/Guilh/OneDrive/Área de Trabalho/babel-play-lab/.claude/worktrees/audit-v4'
const require = createRequire(join(RAIZ, 'package.json'))
const { chromium } = require('playwright')
const AXE = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8')
const ARQ = pathToFileURL(join(RAIZ, 'docs/prototipos/consistencia-telas.html')).href
const OUT = join(import.meta.dirname, 'sub'); mkdirSync(OUT, { recursive: true })
const esperar = (ms) => new Promise((r) => setTimeout(r, ms))
let falhas = 0; const ok = (c, m) => { console.log(c ? '  ok ' : '  ERR', m); if (!c) falhas++ }
const MODOS = process.argv[2] ? [process.argv[2]] : ['desktop-claro', 'desktop-escuro', 'celular-claro']
const b = await chromium.launch({ headless: true })
for (const modo of MODOS) {
  console.log('==', modo)
  const cel = modo.startsWith('celular')
  const p = await b.newPage({ viewport: cel ? { width: 430, height: 1000 } : { width: 1440, height: 1000 } })
  const erros = []; p.on('pageerror', (e) => { erros.push(e.message); console.log('  !! JS', e.stack.split(String.fromCharCode(10)).slice(0,3).join(' | ')) }); p.on('console', (m) => m.type()==='error' && erros.push(m.text()))
  await p.goto(ARQ, { waitUntil: 'networkidle' }); await esperar(400)
  if (cel) await p.click('#p-celular'); if (modo.endsWith('escuro')) await p.click('#p-escuro'); await esperar(300)
  const axe = async (r, alvo = '#app') => { const v = await p.evaluate(async ([src, alvo]) => { if (!window.axe) { const s = document.createElement('script'); s.textContent = src; document.head.appendChild(s) }
      return (await axe.run({ include:[alvo], exclude:['#toast','#tip'] }, { runOnly:{ type:'tag', values:['wcag2a','wcag2aa','wcag21aa','wcag22aa'] } })).violations.map((x)=>`${x.id}×${x.nodes.length} ${x.nodes[0].target.join(' ')} ${(x.nodes[0].any[0]?.message||x.nodes[0].failureSummary||'').slice(0,90)}`) }, [AXE, alvo])
    ok(!v.length, `axe ${r} ${v.join(' | ')}`) }
  const icones = async (r) => { const f = await p.evaluate(() => [...new Set([...document.querySelectorAll('i[data-lucide]')].map(i=>i.dataset.lucide))]); ok(!f.length, `ícones (${r}) ${f.join(',')}`) }
  const hscroll = async (r) => ok(await p.evaluate(() => { const e = document.querySelector('#rolagem'); return e.scrollWidth <= e.clientWidth + 1 }), `sem rolagem lateral: ${r}`)
  const foto = (n) => p.screenshot({ path: join(OUT, `${modo}-${n}.png`) })
  const dlgAberto = () => p.evaluate(() => document.getElementById('dlg').open)
  const fechar = async () => { await p.evaluate(() => { const d = document.getElementById('dlg'); if (d.open) d.close(); const g = document.getElementById('gav'); if (g.open) g.close() }); await esperar(150) }
  const texto = (sel) => p.locator(sel).innerText()

  // ── JOGAR
  await p.evaluate(() => ir('jogar')); await esperar(500)
  ok(await p.locator('.reco').count() === 1, 'jogar: sugestão para hoje'); await icones('jogar'); await axe('jogar'); await hscroll('jogar'); await foto('01-jogar')
  await p.locator('[data-sub="por-que"]').click(); await esperar(200); ok(await p.locator('.porque li').count() === 4, 'por que este? mostra 4 motivos')
  const antes = await texto('#reco-t'); await p.locator('[data-sub="outra-sugestao"]').click(); await esperar(200); ok((await p.locator('.reco p').innerText()) !== '' , `outra sugestão (${antes})`)
  await p.locator('[data-sub="diag"]').click(); await esperar(200); ok(await p.locator('.diag').count() === 1, 'diagnóstico aparece')
  await p.locator('[data-sub="recordes"]').click(); await esperar(300); ok(await dlgAberto() && await p.locator('#dlg .tabela').count() === 1, 'recordes: meus'); await axe('recordes', '#dlg'); await foto('02-recordes')
  await p.locator('[data-seg="rec-aba:global"]').click(); await esperar(200); ok(await p.locator('#dlg .ranking li').count() === 10, 'recordes: ranking com 10'); await axe('ranking', '#dlg'); await fechar()
  await p.locator('#btn-fonte').click(); await esperar(350); ok(await p.evaluate(() => document.getElementById('gav').open), 'fonte abre a gaveta'); await axe('fonte', '#gav'); await foto('03-fonte')
  await p.locator('#gav [data-f-origem="anki"]').click(); await esperar(200)
  await p.locator('#gav [data-f-origem="trilha"]').click(); await esperar(200); ok(await p.locator('#gav [data-f-nivel]').count() === 6, 'trilha mostra os 6 níveis')
  const n1 = await p.locator('.gav-pe .tn b').innerText(); await p.locator('#gav [data-f-recorte="revisao"]').click(); await esperar(200)
  const n2 = await p.locator('.gav-pe .tn b').innerText(); ok(n1 !== n2, `recorte muda a contagem (${n1} → ${n2})`); await axe('fonte com trilha e anki', '#gav')
  await p.locator('#gav [data-f-cobertura]').click(); await esperar(200); ok(await p.locator('#gav table').count() === 1, 'tabela de cobertura dos idiomas')
  await p.locator('.gav-pe [data-fechar-gav]').click(); await esperar(400)
  ok(/Baralhos do Anki/i.test(await texto('.faixa-escura')), 'faixa mostra a fonte escolhida'); ok(await p.locator('[data-ir="curadoria"]').count() === 1, 'botão Curadoria aparece com Anki')
  ok(await p.locator('.jogo.clicavel').count() > 6, `mais jogos prontos com mais material (${await p.locator('.jogo.clicavel').count()})`); await hscroll('jogar com anki'); await foto('04-jogar-anki')
  // Mapa e Curadoria
  await p.locator('[data-ir="mapa"]').click(); await esperar(500); ok(await p.locator('.niveis .nivel-trilha').count() === 6, 'mapa: níveis da trilha'); await icones('mapa'); await axe('mapa'); await hscroll('mapa'); await foto('05-mapa')
  await p.locator('[data-mapa-filtro="erro"]').click(); await esperar(200); ok(await p.locator('.lista-mapa .badge.warn').count() === await p.locator('.lista-mapa li').count(), 'mapa filtra por erro')
  await p.evaluate(() => ir('curadoria')); await esperar(400); await axe('curadoria'); await hscroll('curadoria'); await foto('06-curadoria')
  await p.locator('[data-cur-editar]').first().click(); await esperar(200); await p.fill('#cur-in', 'a saber'); await p.locator('#cur-in').press('Enter'); await esperar(250)
  ok(/volta para os jogos/i.test(await texto('#toast')), 'curadoria: salvar tradução')
  const c1 = await p.locator('.lista-cur li').count(); await p.locator('[data-cur-feito]').first().click(); await esperar(200); ok(await p.locator('.lista-cur li').count() === c1 - 1, 'curadoria: arquivar')
  // Anki
  await p.evaluate(() => { E.abas.anki = 'trazer'; ir('anki') }); await esperar(400); await axe('anki trazer'); await foto('07-anki')
  await p.locator('[data-anki-arquivo]').click(); await esperar(1700); ok(await p.locator('[data-anki-importar]').count() === 1, 'anki: leitura do arquivo'); await axe('anki lido'); await hscroll('anki lido'); await foto('08-anki-lido')
  await p.locator('[data-anki-importar]').click(); await esperar(250); ok(/300 entraram/i.test(await texto('#main')), 'anki: importar 300')
  await p.locator('[role=tab][data-aba="levar"]').click(); await esperar(250); await axe('anki levar'); await hscroll('anki levar')
  await p.locator('[role=tab][data-aba="baralhos"]').click(); await esperar(250); ok(await p.locator('.baralho').count() === 3, 'anki: 3 baralhos'); await axe('anki gerenciar')
  await p.locator('[data-anki-abrir]').first().click(); await esperar(200); ok(await p.locator('.notas-baralho li').count() > 0, 'anki: notas do baralho'); await axe('anki notas'); await hscroll('anki notas'); await foto('09-anki-baralhos')
  await p.locator('[data-anki-apagar]').last().click(); await esperar(200); await axe('apagar baralho', '#dlg'); await p.locator('[data-anki-apagar-ok]').click(); await esperar(200); ok(await p.locator('.baralho').count() === 2, 'anki: apagar com confirmação')
  // Antessala, como se joga, pausa, fim
  await p.evaluate(() => { E.verAntes = true; ir('jogar') }); await esperar(400)
  await p.locator('.jogo [data-como="termo"]').dispatchEvent('click'); await esperar(250); ok(await dlgAberto() && /Como jogar/i.test(await texto('#dlg')), 'como se joga'); await axe('como se joga', '#dlg'); await foto('10-como'); await fechar()
  await p.evaluate(() => jogarJogo('memory')); await esperar(1000); ok(await p.evaluate(() => E.tela === 'antessala'), 'prévia abre a antessala'); await icones('antessala'); await axe('antessala'); await hscroll('antessala'); await foto('11-antessala')
  await p.locator('[data-ante-trocar]').click(); await esperar(200); await p.locator('[data-seg="ante-foco:errando"]').click(); await esperar(200); ok(/Errando/i.test(await texto('#main')), 'antessala: trocar o foco'); await axe('antessala aberta')
  await p.locator('[data-ante-itens]').click(); await esperar(200); ok(await p.locator('.lista-mapa li').count() >= 3, 'antessala: lista de itens')
  await p.locator('.pe-ante [data-jogo-direto]').last().click(); await esperar(500); ok(await p.evaluate(() => E.tela === 'memoria'), 'jogar sai da antessala')
  await p.locator('#mem-pausar').click(); await esperar(250); ok(/Rodada em pausa/i.test(await texto('#dlg')), 'pausa'); await axe('pausa', '#dlg'); await foto('12-pausa')
  await p.locator('[data-pausa-jogo="sair"]').click(); await esperar(200); ok(/Sair sem terminar/i.test(await texto('#dlg')), 'sair pede confirmação'); await p.locator('[data-pausa-jogo="menu"]').click(); await esperar(150); await p.locator('[data-pausa-jogo="continuar"]').click(); await esperar(200)
  await p.evaluate(() => { E.memErros = 1; E.memErrou = new Set([1]); fimDeRodada() }); await esperar(500)
  ok(await p.evaluate(() => E.tela === 'resultado'), 'fim de rodada'); await axe('fim de rodada'); await foto('13-fim')
  await p.locator('[data-revelar]').click(); await esperar(300); ok(await p.locator('.raspa.revelada').count() === 1, 'raspadinha revela (atalho sem raspar)')
  await p.locator('[data-res-resumo]').click(); await esperar(250); ok(/Errou \(1\)/i.test(await texto('#main')), 'o que escapou lista o erro'); await axe('resumo da rodada'); await hscroll('fim'); await foto('14-resumo')

  // ── CAPTURAR
  await p.evaluate(() => ir('capturar')); await esperar(450)
  await p.locator('[data-cap-ajustes]').first().click(); await esperar(300); ok(await dlgAberto(), 'ajustes da captura'); await axe('ajustes da captura', '#dlg'); await foto('15-ajustes-captura')
  await p.locator('[data-seg="cap-sistema:loop"]').click(); await esperar(200); ok(await p.locator('[data-cap="loop"]').count() === 1, 'loopback mostra dispositivo')
  await p.locator('[data-cap-testar]').click(); await esperar(1800); ok(await p.locator('#dlg .badge.warn, #dlg .badge.ok').count() === 1, 'testar a captura dá resultado')
  await p.selectOption('[data-cap="vis.tema"]', 'neon'); await esperar(200); ok(await p.locator('.previa-leg.tema-neon').count() === 1, 'prévia da legenda muda'); await fechar()
  await p.locator('[data-cap-guia]').click(); await esperar(250); ok(await p.locator('#dlg .g-guia .cartao').count() === 6, 'guia rápido'); await axe('guia', '#dlg'); await fechar()
  await p.locator('[data-cap-modelo]').click(); await esperar(250); ok(/Modelo no dispositivo/i.test(await texto('#dlg')), 'modelo'); await axe('modelo', '#dlg'); await fechar()
  await p.locator('[data-cap-idiomas]').click(); await esperar(250); await p.locator('[data-idioma-campo="de"]').click(); await esperar(200)
  await p.fill('[data-idioma-busca]', 'jap'); await esperar(200); ok(await p.locator('.picker-lista [data-idioma]').count() === 1, 'busca de idioma'); await axe('idiomas', '#dlg'); await foto('16-idiomas')
  await p.locator('[data-idioma="ja"]').click(); await esperar(200); ok(/日本語/i.test(await texto('#dlg')), 'escolher idioma'); await fechar()
  ok(/日本語/i.test(await texto('#main [data-cap-idiomas]')), 'chip mostra os idiomas escolhidos')
  await p.locator('[data-cap-mic]').click(); await esperar(250); ok(await p.locator('.falantes').count() === 1, 'microfone ativo mostra falantes')
  await p.locator('[data-renomear="A"]').click(); await esperar(150); await p.fill('#ren-A', 'Carla'); await p.locator('#ren-A').press('Enter'); await esperar(200); ok(/Carla/i.test(await texto('.falantes')), 'renomear falante')
  ok(await p.locator('text=Bingo').count() === 0, 'o Bingo saiu da Capturar')
  await p.locator('#btn-gravar').click(); await esperar(5600); ok(await p.locator('.fala').count() > 0, 'captura mostra falas'); await axe('captura gravando'); await hscroll('captura'); await foto('17-captura')
  await p.locator('[data-cap-legendas]').first().click(); await esperar(300); ok(await p.locator('#leg-flut .leg-fala').count() > 0, 'legendas flutuantes com falas')
  await p.locator('#leg-flut [data-leg="painel"]').click(); await esperar(200); ok(await p.locator('.leg-painel').count() === 1, 'personalização das legendas'); await axe('legendas', '#leg-flut'); await foto('18-legendas')
  await p.locator('[data-leg-trad="oculta"]').click(); await esperar(150); ok(await p.locator('#leg-flut .leg-t').count() === 0, 'modo imersão esconde a tradução')
  await p.locator('#leg-flut [data-leg="fechar"]').click(); await esperar(200)
  await p.locator('[data-cap-foco]').click(); await esperar(350); ok(await p.locator('.foco-cheio').count() === 1, 'foco cheio'); ok(await p.evaluate(() => document.querySelectorAll('#relogio').length === 1 && document.querySelectorAll('#btn-gravar').length === 1), 'foco: ids únicos'); await foto('19-foco')
  await p.keyboard.press('Escape'); await esperar(300); ok(await p.locator('.foco-cheio').count() === 0, 'Esc sai do foco cheio')
  await p.locator('#btn-gravar').click(); await esperar(300); ok(/Encerrar a sessão/i.test(await texto('#dlg')), 'parar abre encerrar'); await axe('encerrar', '#dlg'); await foto('20-encerrar')
  await p.fill('#enc-titulo', 'Aula de terça'); await p.locator('[data-encerrar="salvar-ir"]').click(); await esperar(600)
  ok(await p.evaluate(() => E.tela === 'sessao' && MIDIAS[0].t === 'Aula de terça'), 'salvar e ir para a análise'); await fechar()

  // ── BIBLIOTECA
  await p.evaluate(() => { E.bib.filtros = true; ir('biblioteca') }); await esperar(450); ok(await p.locator('.g-filtros fieldset').count() === 4, 'filtros com 4 grupos'); await axe('filtros'); await hscroll('filtros'); await foto('21-filtros')
  await p.locator('[data-tam-bib][value="longa"]').check(); await esperar(200); ok(/Mostrando 0 de/i.test(await texto('.filtros')), 'filtro de tamanho filtra'); ok(await p.locator('.n-filtro').count() === 1, 'botão mostra a contagem de filtros')
  await p.locator('[data-limpar-filtros]').first().click(); await esperar(200)
  await p.evaluate(() => { E.bib.importar = true; E.bib.fonte = 'local'; render() }); await esperar(250); await p.locator('[data-importar-ok]').click(); await esperar(300)
  ok(await p.locator('.fila li').count() === 1, 'fila de importação'); await axe('fila'); await esperar(2900); ok(await p.evaluate(() => MIDIAS[0].t === 'entrevista.m4a'), 'importação termina na biblioteca')
  await p.locator('[data-menu-midia]').first().click(); await esperar(150); await p.locator('[data-acao-midia^="editar"]').click(); await esperar(300); ok(/Editar sessão/i.test(await texto('#dlg')), 'editar título e capa'); await axe('editar sessão', '#dlg')
  await p.fill('#ed-titulo', ''); await p.locator('#dlg form button:not([type=button])').last().click(); await esperar(150); ok(/não pode ficar vazio/i.test(await texto('#dlg')), 'valida título vazio')
  await p.fill('#ed-titulo', 'Entrevista'); await p.locator('[data-capa="2"]').click(); await esperar(150); await p.locator('#dlg form button:not([type=button])').last().click(); await esperar(250); ok(await p.evaluate(() => E.edMidia.t === 'Entrevista'), 'salva o título')
  await p.locator('[data-menu-midia]').first().click(); await esperar(150); await p.locator('[data-acao-midia^="exportar"]').click(); await esperar(250); ok(await p.locator('#dlg [data-exp-formato]').count() === 4, 'exportar transcrição: 4 formatos'); await axe('exportar transcrição', '#dlg'); await fechar()

  // ── VOCABULÁRIO
  await p.evaluate(() => ir('vocabulario', { abaAlvo:'palavras' })); await esperar(450); await axe('vocabulário'); await hscroll('vocabulário')
  await p.locator('[data-voc-nivel="B1"]').click(); await esperar(200); ok(await p.locator('#tabela-palavras tbody tr').count() === 1, 'filtro de nível filtra')
  await p.locator('[data-voc-limpar]').first().click(); await esperar(200); ok(await p.locator('#tabela-palavras tbody tr').count() === 3, 'limpar filtros')
  await p.locator('[data-voc-exportar]').click(); await esperar(250); ok(await p.locator('.cartao-anki').count() === 1, 'exportar: prévia do cartão Anki'); await axe('exportar vocabulário', '#dlg'); await foto('22-exportar-vocab')
  await p.locator('[data-expv-formato="csv"]').click(); await esperar(150); ok(await p.locator('.cartao-anki').count() === 0, 'csv não mostra cartão'); await fechar()
  await p.locator('#tabela-palavras tbody tr').first().click(); await esperar(350); ok(await p.evaluate(() => document.getElementById('gav').open), 'analista da palavra'); await axe('analista', '#gav'); await foto('23-analista')
  await p.locator('#gav [data-palavra-editar]').first().click(); await esperar(200); await p.fill('#pw-t', 'impulsionar'); await p.locator('#gav form button:not([type=button])').click(); await esperar(250); ok(/impulsionar/i.test(await texto('#gav')), 'editar a palavra')
  await p.locator('#gav [data-palavra-suspender]').click(); await esperar(200); ok(/Reativar/i.test(await texto('#gav')), 'suspender'); await p.locator('#gav [data-palavra-suspender]').click(); await esperar(200); await fechar()
  await p.locator('[data-voc-add]').click(); await esperar(250); await axe('adicionar palavra', '#dlg'); await p.locator('#dlg form button:not([type=button])').click(); await esperar(150); ok(/Escreva a palavra/i.test(await texto('#dlg')), 'adicionar valida vazio')
  await p.fill('#np-w', 'milestone'); await p.fill('#np-t', 'marco'); await p.locator('#dlg form button:not([type=button])').click(); await esperar(250); ok(await p.evaluate(() => PALAVRAS.some(x=>x.w==='milestone')), 'adicionar palavra')

  // ── REVISÃO
  await p.evaluate(() => { E.revisadas = 0; E.revHist = []; ir('revisao') }); await esperar(400); await axe('revisão'); await hscroll('revisão')
  await p.locator('[data-rev-opcoes]').click(); await esperar(250); ok(/Opções da revisão/i.test(await texto('#dlg')), 'opções da revisão'); await axe('opções da revisão', '#dlg'); await foto('24-opcoes-revisao'); await fechar()
  await p.locator('#mostrar').click(); await esperar(150); await p.locator('[data-fsrs]').nth(2).click(); await esperar(300); ok(await p.evaluate(() => E.revisadas === 1), 'responder')
  await p.locator('[data-rev-desfazer]').click(); await esperar(250); ok(await p.evaluate(() => E.revisadas === 0), 'desfazer a resposta')
  await p.evaluate(() => { E.revisadas = PALAVRAS.length; render() }); await esperar(300); ok(await p.locator('.fim-rev .ladrilho').count() === 4, 'resultado da revisão'); await axe('resultado da revisão')

  // ── OUTROS
  await p.evaluate(() => ir('personalizar')); await esperar(400); await p.evaluate(() => dialogoEditorTema()); await esperar(500); await axe('editor do tema', '#dlg'); await foto('25-editor-tema'); await fechar()
  await p.evaluate(() => ir('sobre')); await esperar(400); await p.locator('[data-legal="privacidade"]').click(); await esperar(250); ok(/LGPD/i.test(await texto('#dlg')), 'política de privacidade'); await axe('política', '#dlg'); await fechar()
  await p.evaluate(() => ir('ajuda')); await esperar(400); await p.locator('[data-artigo]').first().click(); await esperar(250); ok(/Isto ajudou/i.test(await texto('#dlg')), 'artigo da ajuda'); await p.locator('[data-util="sim"]').click(); await esperar(150); ok(/Obrigado/i.test(await texto('#dlg')), 'isto ajudou?'); await fechar()
  ok(!erros.length, `sem erros de JS ${erros.join(' ; ').slice(0, 400)}`)
  await p.close()
}
await b.close(); console.log(falhas ? `${falhas} FALHA(S)` : 'TUDO OK')
