#!/usr/bin/env node
/**
 * O CONTRASTE DO TEXTO SOBRE O TOM DAS ETIQUETAS (`src/styles/etiquetas.css`), nos dois temas do app (tema padrão
 * `babel`) e nos fundos da janela flutuante. O tom é translúcido: a conta mistura o tom com o fundo e mede o texto da
 * legenda por cima. AA para texto normal é 4,5:1; o script falha (código 1) se alguma combinação ficar abaixo.
 *
 *   node scripts/etiquetas/contraste.mjs
 *
 * Os valores abaixo são cópias dos tokens (`src/index.css`, `legendasFlutuantes.css`, `etiquetas.css`): mudou um
 * token, muda aqui.
 */
const hex = (h) => {
  const v = h.replace('#', '')
  return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16))
}
const misturar = (cor, fundo, alfa) => cor.map((c, i) => Math.round(c * alfa + fundo[i] * (1 - alfa)))
const lum = ([r, g, b]) => {
  const f = (c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}
const contraste = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m)
  return (x + 0.05) / (y + 0.05)
}

/**
 * [nome, fundo, texto da linha, texto da palavra com tom, tons]. No app a palavra com tom vai para `--ink` (o texto da
 * linha original é `--ink-muted`); na janela ela fica na cor da legenda.
 */
const CASOS = [
  [
    'app claro · fala anterior',
    '#E6E2D6',
    '#5E5A50',
    '#26241F',
    { salva: ['#F04E23', 0.17], aprendendo: ['#3E6B44', 0.2] },
  ],
  [
    'app claro · fala atual',
    '#F5F2EA',
    '#5E5A50',
    '#26241F',
    { salva: ['#F04E23', 0.17], aprendendo: ['#3E6B44', 0.2] },
  ],
  [
    'app claro · transcrição',
    '#F5F2EA',
    '#26241F',
    '#26241F',
    { salva: ['#F04E23', 0.17], aprendendo: ['#3E6B44', 0.2] },
  ],
  [
    'app escuro · fala anterior',
    '#17130F',
    '#B5AA98',
    '#F3ECE0',
    { salva: ['#FF6B3D', 0.26], aprendendo: ['#6DBE6F', 0.24] },
  ],
  [
    'app escuro · fala atual',
    '#211C17',
    '#B5AA98',
    '#F3ECE0',
    { salva: ['#FF6B3D', 0.26], aprendendo: ['#6DBE6F', 0.24] },
  ],
  [
    'app escuro · transcrição',
    '#211C17',
    '#F3ECE0',
    '#F3ECE0',
    { salva: ['#FF6B3D', 0.26], aprendendo: ['#6DBE6F', 0.24] },
  ],
  ['janela · escuro', '#141210', '#F4EFE8', '#F4EFE8', { salva: ['#FF8C5A', 0.28], aprendendo: ['#6DBE6F', 0.28] }],
  ['janela · preto', '#000000', '#F4EFE8', '#F4EFE8', { salva: ['#FF8C5A', 0.28], aprendendo: ['#6DBE6F', 0.28] }],
  ['janela · claro', '#F6F1E8', '#1D1915', '#1D1915', { salva: ['#F04E23', 0.16], aprendendo: ['#3E6B44', 0.2] }],
]

let falhou = false
for (const [nome, fundo, texto, comTom, tons] of CASOS) {
  const base = contraste(hex(texto), hex(fundo))
  const partes = [`sem tom ${base.toFixed(2)}`]
  for (const [etq, [cor, alfa]] of Object.entries(tons)) {
    const c = contraste(hex(comTom), misturar(hex(cor), hex(fundo), alfa))
    if (c < 4.5) falhou = true
    partes.push(`${etq} ${c.toFixed(2)}${c < 4.5 ? ' ✗' : ''}`)
  }
  console.log(`${nome.padEnd(28)} ${partes.join(' · ')}`)
}
if (falhou) {
  console.error('\nAlguma combinação ficou abaixo de 4,5:1 (AA).')
  process.exit(1)
}
