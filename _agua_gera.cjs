/* Gera os roteiros do tema Água a partir dos roteiros que já existem (a navegação é a deles). */
const fs = require('fs')
const path = require('path')
const R = path.join(__dirname, 'scripts/polimento/roteiros')
const ler = (n) => JSON.parse(fs.readFileSync(path.join(R, n + '.json'), 'utf8'))

const CENA = [
  { app: 'main', proto: 'main', nome: 'main (fundo)' },
  '.px-aura',
  '.ag-cena',
  '.ag-raios',
  '.ag-raios i',
  '.ag-raios i + i',
  '.ag-caustica.a',
  '.ag-caustica.a i',
  '.ag-caustica.b',
  '.ag-caustica.b i',
  'canvas.ag-bolhas',
  'canvas.ag-mar',
  '.ag-frente',
  '.ag-brilho',
]
const PROPS = [
  'mixBlendMode',
  'filter',
  'zIndex',
  'overflowX',
  'contain',
  'pointerEvents',
  'maskImage',
  'backgroundSize',
  'animationDirection',
  'animationTimingFunction',
  'animationIterationCount',
  'animationDelay',
  'top',
  'left',
  'willChange',
  'transformOrigin',
]
/* O ponteiro no ponto neutro (tx = ty = 0), a água assenta, e os laços `ag-*` param no quadro zero:
   sem isso o `transform` medido dependeria do instante da captura. */
const ASSENTAR = [
  {
    js: "document.dispatchEvent(new PointerEvent('pointermove', { clientX: innerWidth / 2, clientY: innerHeight * 0.45, bubbles: true }))",
  },
  { esperar: 6500 },
  {
    js: "document.getAnimations().forEach((a) => { if (String(a.animationName || '').startsWith('ag-')) { a.pause(); a.currentTime = 0 } })",
  },
  { esperar: 300 },
]
/* No app o tema vem equipado do armazenamento (`app_theme`, a chave de `src/lib/theme.ts`); a cena é
   ligada à mão enquanto `instalarAgua()` não estiver na casca. No protótipo, o botão da barra. */
const antesNoApp = [
  {
    js: "import('/src/lib/polimento/agua.ts').then((a) => { window.__agua = window.__agua || a.instalarAgua() })",
  },
  { esperar: 1200 },
]
const depoisNoApp = (escuro) => [
  { js: `import('/src/lib/theme.ts').then((t) => t.applyDarkMode(${escuro}))` },
  { esperar: 800 },
  ...ASSENTAR,
]
const antesNoProto = (escuro) => [
  { js: "document.querySelector(\"[data-px-acao='agua']\").click()" },
  { esperar: 1500 },
  ...(escuro ? [{ js: "document.querySelector(\"[data-px-acao='tema']\").click()" }, { esperar: 1500 }] : []),
]
const depoisNoProto = [
  ...ASSENTAR,
  { js: "document.querySelector('.px-barra')?.style.setProperty('display', 'none')" },
]

const TELAS = {
  inicio: { base: 'inicio', baseCel: 'celular-inicio', extra: ['.q-barra > span', '.q-tile:not(.pri) .q-ic'] },
  jogar: { base: 'jogar', baseCel: 'jogar-celular', extra: ['.q-abas', '.q-chip', '.q-ctl'] },
  personalizar: {
    base: 'personalizar-colecao',
    baseCel: 'personalizar-colecao-celular',
    extra: ['.q-abas', '.q-chip', '.q-cab h1'],
  },
}
for (const [tela, def] of Object.entries(TELAS))
  for (const cel of [false, true])
    for (const escuro of [false, true]) {
      const b = ler(cel ? def.baseCel : def.base)
      const nome = `agua-${tela}${cel ? '-celular' : ''}${escuro ? '-escuro' : ''}`
      const r = {
        nome,
        largura: cel ? 390 : 1280,
        altura: cel ? 844 : 960,
        ...(escuro ? { escuro: true } : {}),
        ...(b.toque ? { toque: true } : {}),
        app: {
          caminho: b.app?.caminho || '/',
          guardar: { ...b.app?.guardar, ...(tela === 'inicio' ? { 'babel.px.planoDeProva': 'free' } : {}), app_theme: 'agua' },
          passos: [...antesNoApp, ...(b.app?.passos || []), ...depoisNoApp(escuro)],
        },
        proto: { passos: [...antesNoProto(escuro), ...(b.proto?.passos || []), ...depoisNoProto] },
        props: [...new Set([...(b.props || []), ...PROPS])],
        seletores: [...CENA, ...new Set([...(b.seletores || []), ...def.extra])],
      }
      fs.writeFileSync(path.join(R, nome + '.json'), JSON.stringify(r, null, 2) + '\n')
      console.log(nome, r.seletores.length)
    }
