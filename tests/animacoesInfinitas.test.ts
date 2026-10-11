/**
 * ANIMAÇÃO QUE NÃO ACABA SÓ MEXE EM `transform` E `opacity` (auditoria de desempenho de 10/10/2026, seção 7).
 *
 * Uma animação infinita de `box-shadow`, `background`, `width`… obriga o navegador a refazer estilo e
 * pintura a cada quadro, para sempre, no fio principal: foi o que a auditoria de 26/09 achou (`respira`,
 * ~300 ms/s parado) e o que a de 10/10 achou de novo (`px-pulso`, 240 ms/s com o laço da aura). As duas
 * propriedades que o navegador anima fora do fio principal são `transform` (e as três soltas dele:
 * `translate`, `rotate`, `scale`) e `opacity`.
 *
 * Este teste lê o CSS do app (`src/index.css` e `src/styles/**`) e acha todo `@keyframes` usado com
 * `infinite`. O que já existia e anima outra coisa está em `EXCECOES`, com o motivo: animação NOVA fora
 * da regra reprova, e exceção consertada também (é para sair da lista).
 *
 * Fora do alcance: animações feitas no JS (`Element.animate`) e as classes utilitárias do Tailwind.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const RAIZ = path.resolve(__dirname, '..')
const COMPOSTAS = new Set(['transform', 'opacity', 'translate', 'rotate', 'scale'])

function folhas(dir: string, fora: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    const caminho = path.join(dir, nome)
    if (statSync(caminho).isDirectory()) folhas(caminho, fora)
    else if (nome.endsWith('.css')) fora.push(caminho)
  }
  return fora
}

const semComentarios = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')

/** O bloco `{ … }` que começa em `abre` (o índice da chave), com as chaves de dentro casadas. */
function bloco(css: string, abre: number): string {
  let fundo = 0
  for (let i = abre; i < css.length; i++) {
    if (css[i] === '{') fundo++
    else if (css[i] === '}' && --fundo === 0) return css.slice(abre + 1, i)
  }
  return css.slice(abre + 1)
}

/** nome do `@keyframes` → as propriedades que ele anima. */
function quadrosDe(css: string): Map<string, Set<string>> {
  const fora = new Map<string, Set<string>>()
  for (const m of css.matchAll(/@keyframes\s+([\w-]+)\s*\{/g)) {
    const corpo = bloco(css, m.index + m[0].length - 1)
    const props = fora.get(m[1]) ?? new Set<string>()
    for (const passo of corpo.matchAll(/\{([^{}]*)\}/g))
      for (const d of passo[1].split(';')) {
        const prop = d.split(':')[0].trim().toLowerCase()
        if (prop && !prop.startsWith('--') && prop !== 'animation-timing-function') props.add(prop)
      }
    fora.set(m[1], props)
  }
  return fora
}

/** Os nomes de `@keyframes` que o arquivo usa com `infinite`. */
function infinitasDe(css: string, conhecidas: Set<string>): Set<string> {
  const fora = new Set<string>()
  let todasAsSoltas = false
  /* Os blocos mais de dentro: as regras (os passos de um `@keyframes` também, mas não declaram animação). */
  for (const regra of css.matchAll(/\{([^{}]*)\}/g)) {
    const decls = regra[1].split(';').map((d) => d.trim())
    const valor = (prop: string) =>
      decls
        .filter((d) => d.toLowerCase().startsWith(prop + ':'))
        .map((d) => d.slice(prop.length + 1))
        .join(' ')
    const curta = valor('animation')
    if (/\binfinite\b/.test(curta)) for (const t of curta.split(/[\s,()]+/)) if (conhecidas.has(t)) fora.add(t)
    if (/\binfinite\b/.test(valor('animation-iteration-count'))) {
      const nomes = valor('animation-name').trim()
      /* `minis.css`: a regra geral diz "infinita" para todas as peças, e cada peça dá o nome à parte. */
      if (!nomes) todasAsSoltas = true
      for (const t of nomes.split(/[\s,]+/)) if (conhecidas.has(t)) fora.add(t)
    }
  }
  if (todasAsSoltas)
    for (const m of css.matchAll(/animation-name\s*:\s*([^;}]+)/g))
      for (const t of m[1].split(/[\s,]+/)) if (conhecidas.has(t)) fora.add(t)
  return fora
}

const arquivos = [path.join(RAIZ, 'src/index.css'), ...folhas(path.join(RAIZ, 'src/styles'))].map((caminho) => ({
  nome: path.relative(path.join(RAIZ, 'src'), caminho).replace(/\\/g, '/'),
  css: semComentarios(readFileSync(caminho, 'utf8')),
}))

/** `arquivo · animação · propriedades fora da regra`, para cada animação infinita que pinta. */
function foraDaRegra(): string[] {
  const quadros = new Map<string, Set<string>>()
  for (const a of arquivos) for (const [nome, props] of quadrosDe(a.css)) quadros.set(nome, new Set([...(quadros.get(nome) ?? []), ...props]))
  const conhecidas = new Set(quadros.keys())
  const fora: string[] = []
  for (const a of arquivos)
    for (const nome of infinitasDe(a.css, conhecidas)) {
      const pintam = [...quadros.get(nome)!].filter((p) => !COMPOSTAS.has(p)).sort()
      if (pintam.length) fora.push(`${a.nome} · ${nome} · ${pintam.join(', ')}`)
    }
  return fora.sort()
}

/**
 * O QUE JÁ EXISTIA EM 10/10/2026 e anima algo além de `transform`/`opacity`, com o motivo de estar aqui.
 * Não acrescente: troque a animação por uma camada que cresce, gira ou some.
 */
const EXCECOES: Record<string, string> = {
  /* Substituída: a regra copiada do protótipo continua no arquivo, mas `polimentoDesempenho.css` a desliga
     (`animation: none`) e põe o mesmo anel numa camada composta (terceiro teste abaixo). */
  'styles/polimento/efeitos.css · px-pulso · box-shadow': 'desligada pelo app; o anel é `px-pulso-composto`',
  /* A PRÓXIMA A CONSERTAR: roda no saguão do Jogar em todo cartão à vista no celular (a letra achada da
     Caça-palavras). Trocar a cor por uma camada que aparece e some pede marcação nova na miniatura. */
  'styles/polimento/minis.css · mm-acende · background, color': 'miniatura da Caça-palavras; só anima à vista',
  /* Só enquanto dura um estado da tela (gravando, ouvindo, falando, carregando, rodada no fim): */
  'styles/capturaNoCelular.css · cel-pulsa · box-shadow': 'o ponto de "gravando" da captura no celular',
  'styles/polimento/telas.css · px-ao-vivo · box-shadow': 'o ponto de "ao vivo" da captura',
  'styles/polimento/telas2.css · px-ao-vivo · box-shadow': 'o ponto de "ao vivo" da captura',
  'styles/modoInterprete.css · int-anel · box-shadow': 'o anel de quem está falando, no Intérprete',
  'styles/polimento/jogos.css · pj-eq · height': 'as barras de som enquanto o jogo fala',
  'styles/polimento/jogos.css · pj-eq2 · height': 'as barras de som enquanto o jogo ouve',
  'styles/questLeitura.css · ql-onda · height': 'as barras de som da leitura em voz alta',
  'styles/prototipo.css · onda · height': 'as barras de som da gravação (desenho de antes)',
  'styles/prototipo.css · onda-onb · height': 'as barras de som do tour e do "ouvir"',
  'styles/prototipo.css · esq · background-position': 'o esqueleto de carregamento (desenho de antes)',
  'styles/quest.css · q-espera · background-position': 'o esqueleto de carregamento',
  'styles/questAjustes.css · q-espera · background-position': 'o esqueleto de carregamento dos Ajustes',
  'styles/prototipo.css · pulsa-borda · box-shadow': 'o botão enquanto grava (desenho de antes)',
  'styles/prototipo.css · tenso · box-shadow': 'o palco do jogo nos últimos segundos da rodada',
  'styles/prototipo.css · fever-brilho · box-shadow': 'o palco do jogo durante o combo máximo',
  'styles/prototipo.css · laco-luz · box-shadow': 'a lista de passos do tour de boas-vindas',
  /* Fica na tela o tempo todo, mas só em quem tem um cartão com a pele lendária à vista: */
  'styles/cartoes.css · pele-brilho · box-shadow': 'o brilho do cartão com pele lendária',
  /* Da revisão enxuta (CSS copiado do protótipo, `cartoes-enxuto-src`). Nenhuma fica na tela parada:
     a primeira só existe enquanto um som toca (fora disso as barras estão com `display: none`), a
     segunda só enquanto o microfone grava, e uma gravação não passa de 8 s. */
  'styles/polimento/cartoes.css · ct-eq · height': 'as 4 barras do botão de ouvir, só enquanto a fala toca',
  'styles/polimento/cartoes4.css · cx-pulso · box-shadow': 'o botão do microfone, só enquanto grava (até 8 s)',
}

describe('animação infinita só em transform e opacity', () => {
  it('o leitor de CSS acha os quadros e quem os usa sem fim', () => {
    const css = semComentarios(`
      @keyframes gira { to { transform: rotate(360deg); } }
      @keyframes brilha { 0% { box-shadow: 0 0 0 0 red; } 100% { box-shadow: 0 0 0 9px red; opacity: 0; } }
      @keyframes entra { from { width: 0; } }
      .a { animation: gira 1s linear infinite; }
      .b { animation: brilha 2s ease-out infinite; }
      .c { animation: entra 300ms; }
      .d * { animation-iteration-count: infinite; }
      .e { animation-name: entra; }`)
    const quadros = quadrosDe(css)
    expect([...quadros.get('brilha')!].sort()).toEqual(['box-shadow', 'opacity'])
    expect([...infinitasDe(css, new Set(quadros.keys()))].sort()).toEqual(['brilha', 'entra', 'gira'])
  })

  it('nenhuma animação infinita nova pinta a cada quadro (as de antes estão na lista, com o motivo)', () => {
    expect(foraDaRegra()).toEqual(Object.keys(EXCECOES).sort())
  })

  it('o pulso do contador saiu do `box-shadow`: a regra do protótipo é desligada e o anel é camada composta', () => {
    const css = arquivos.find((a) => a.nome === 'styles/polimentoDesempenho.css')!.css
    expect(css).toMatch(/html\[data-px='on'\] \.q-contagem\.q-contagem\s*\{[^}]*animation:\s*none;/)
    expect([...quadrosDe(css).get('px-pulso-composto')!].sort()).toEqual(['opacity', 'transform'])
    expect(css).toMatch(/\.q-contagem\.q-contagem::before\s*\{[^}]*animation:\s*px-pulso-composto calc\(1\.9s \* var\(--px-k\)\) ease-out infinite;/)
  })
})
