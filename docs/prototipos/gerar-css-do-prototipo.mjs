// Gera src/styles/prototipo.css a partir do <style> de docs/prototipos/consistencia-telas.html.
//
// O protótipo é o "Figma" do app (decisão do dono, 23/09/2026): as telas têm de ficar IDÊNTICAS a
// ele. Em vez de reescrever o CSS à mão (e errar um pixel aqui e outro ali), o app usa o MESMO CSS,
// traduzido só no que é do protótipo e não do produto:
//   - tokens (:root, temas) ficam em src/index.css, que já tem os mesmos nomes;
//   - a moldura do protótipo (.proto, .palco, .app, body, painel "O que mudou") sai;
//   - :root[data-escuro] vira .dark (é assim que o app liga o escuro);
//   - regras dos temas indigo/matcha, da fonte arcade e do modo "celular" simulado saem
//     (no app o tema é escolhido pelos tokens, e o celular é a largura real).
//
// Uso: node docs/prototipos/gerar-css-do-prototipo.mjs
import { readFileSync, writeFileSync } from 'node:fs'

const html = readFileSync(new URL('./consistencia-telas.html', import.meta.url), 'utf8')
const css = html.slice(html.indexOf('<style>') + 7, html.indexOf('</style>'))

/** Divide o CSS em blocos de topo: { prelude, corpo } (corpo null para @import etc.). */
function blocos(src) {
  const out = []
  let i = 0
  while (i < src.length) {
    // pula espaço e comentários
    const resto = src.slice(i)
    const ws = resto.match(/^(\s+|\/\*[\s\S]*?\*\/)/)
    if (ws) { i += ws[0].length; continue }
    const abre = src.indexOf('{', i)
    const pv = src.indexOf(';', i)
    if (abre < 0) break
    if (pv >= 0 && pv < abre) { out.push({ prelude: src.slice(i, pv).trim(), corpo: null }); i = pv + 1; continue }
    let nivel = 0, j = abre
    for (; j < src.length; j++) {
      if (src[j] === '{') nivel++
      else if (src[j] === '}') { nivel--; if (nivel === 0) break }
    }
    out.push({ prelude: src.slice(i, abre).trim(), corpo: src.slice(abre + 1, j) })
    i = j + 1
  }
  return out
}

const DESCARTA = [
  /^\.proto\b/, /^\.palco\b/, /^\.app$/, /^body$/, /^html,\s*body$/, /^:root$/, /^body\.celular\b/,
  /\[data-tema=/, /\[data-fonte=/, /^\.notas\b/, /^#notas\b/, /^:root\[data-escuro\]\s*body$/,
]

function traduzSeletor(sel) {
  sel = sel.trim()
  if (DESCARTA.some((re) => re.test(sel))) return null
  if (/^:root\[data-escuro\]$/.test(sel)) return null // bloco de tokens do escuro: está no index.css
  if (/^:root(\[[^\]]+\])*$/.test(sel)) return null // qualquer bloco de tokens
  sel = sel.replace(/:root\[data-escuro\]\s*/g, '.dark ')
  sel = sel.replace(/^body\.celular\s+/, '')
  return sel
}

function traduz(lista, dentroDeKeyframes = false) {
  let out = ''
  for (const b of lista) {
    if (b.corpo === null) continue
    if (b.prelude.startsWith('@keyframes') || b.prelude.startsWith('@font-face')) {
      out += `${b.prelude}{${b.corpo}}\n`
      continue
    }
    if (b.prelude.startsWith('@')) {
      const dentro = traduz(blocos(b.corpo))
      if (dentro.trim()) out += `${b.prelude}{\n${dentro}}\n`
      continue
    }
    if (dentroDeKeyframes) { out += `${b.prelude}{${b.corpo}}\n`; continue }
    // Do `body` do protótipo fica a tipografia (14px/1.5, Inter, tinta, suavização); o fundo cinza
    // é da moldura do protótipo, não do app.
    if (b.prelude.trim() === 'body') {
      const tipo = b.corpo.split(';').filter((d) => /^\s*(font|color|-webkit-font-smoothing)\s*:/.test(d))
      out += `body{${tipo.join(';')}}\n`
      continue
    }
    const seletores = b.prelude.split(/,(?![^(]*\))/).map(traduzSeletor).filter(Boolean)
    if (!seletores.length) continue
    out += `${seletores.join(',')}{${b.corpo.trim()}}\n`
  }
  return out
}

const saida = `/* GERADO por docs/prototipos/gerar-css-do-prototipo.mjs — não edite à mão.
   Fonte: docs/prototipos/consistencia-telas.html (protótipo aprovado, o "Figma" do app). */\n` + traduz(blocos(css))
writeFileSync(new URL('../../src/styles/prototipo.css', import.meta.url), saida)
console.log('src/styles/prototipo.css:', saida.split('\n').length, 'linhas')
