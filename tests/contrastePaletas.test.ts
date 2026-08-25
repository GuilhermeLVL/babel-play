/**
 * C4 — CONTRASTE DAS PALETAS, TRAVADO NA FONTE.
 *
 * O produto oferece 7 temas × claro/escuro e a auditoria anterior opinou sobre a aparência sem
 * medir contraste em nenhum. Quando a matriz foi finalmente medida, TODAS as 14 combinações
 * reprovavam WCAG 1.4.3, com `notion` claro a 1,15:1 e `premium` escuro a 1,05:1 — o mínimo AA
 * é 4,5:1, e a 1,05:1 o texto é essencialmente invisível.
 *
 * POR QUE ESTE TESTE E NÃO SÓ O COLETOR. A matriz de contraste roda num navegador de verdade,
 * leva minutos e precisa de servidor e banco — é a medição certa, e continua existindo. Mas ela
 * é lenta demais para rodar a cada edição, e uma regressão de paleta introduzida hoje só
 * apareceria na próxima varredura completa. Este teste lê os TOKENS LITERAIS de `src/index.css`
 * e computa a razão WCAG 2.1 em milissegundos, sem navegador: pega o erro no momento em que
 * alguém mexe numa cor, e roda no CI junto com o resto.
 *
 * OS DOIS SE COMPLEMENTAM E NENHUM SUBSTITUI O OUTRO:
 *  · aqui: os pares de token, exaustivamente, em todos os temas — mas só os pares declarados;
 *  · o coletor: o que de fato foi renderizado, incluindo composições que nenhum par prevê
 *    (texto sobre gradiente, opacidade herdada, sobreposição), e é lá que o axe registra os
 *    casos em que se RECUSA a decidir.
 *
 * O limiar é 4,5:1 — o mínimo AA para texto normal. A norma permite 3:1 para texto grande, e
 * essa folga NÃO é usada aqui de propósito: `--ink-faint` aparece em `text-[8px]` e `text-[9px]`
 * na medição, o oposto de texto grande.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const css = readFileSync(path.join(process.cwd(), 'src/index.css'), 'utf8')

/** Mínimo WCAG 2.1 AA para texto normal (1.4.3). */
const MINIMO_AA = 4.5

/**
 * Os pares que a UI de fato compõe.
 *
 * A PRIMEIRA VERSÃO DESTA LISTA SÓ TINHA A MATRIZ DE TINTA, e a omissão custou caro: com os
 * seis primeiros pares passando, o coletor ainda encontrou 1,05:1 no botão "Exportar", porque
 * o par que ele compõe (`--accent-contrast` sobre `--accent`, e `--<cor>-ink` sobre
 * `--<cor>-soft`) não estava aqui. Um teste que cobre parte da matriz dá a sensação de cobrir
 * a matriz — que é o modo mais comum de um gate de qualidade enganar quem confia nele.
 *
 * LIMITE DECLARADO: vários tokens `-soft` são `rgba(...)` com alfa, e a cor final depende do
 * que está atrás. Isso não é computável a partir do CSS, então esses pares são pulados aqui e
 * ficam a cargo do coletor em runtime, que mede o pixel composto. O teste abaixo garante que
 * pular não seja silencioso.
 */
const PARES: [string, string][] = [
  ['ink', 'canvas'], ['ink', 'surface'],
  ['ink-muted', 'canvas'], ['ink-muted', 'surface'],
  ['ink-faint', 'canvas'], ['ink-faint', 'surface'],
  // Preenchimentos: o texto sobre o botão primário e sobre as faixas semânticas.
  ['accent-contrast', 'accent'],
  ['accent-ink', 'accent-soft'], ['good-ink', 'good-soft'],
  ['warn-ink', 'warn-soft'], ['rare-ink', 'rare-soft'], ['error-ink', 'error-soft'],
  // Preenchimento SÓLIDO semântico. Esta linha foi acrescentada na TERCEIRA vez que a lista
  // se mostrou incompleta: com todos os pares acima passando, o coletor ainda achava 2,93:1 no
  // botão "Abrir exercícios", porque `--warn-contrast` sobre `--warn` não estava sendo checado.
  // O padrão já devia ter sido óbvio na segunda: toda vez que um par existe no CSS e não está
  // aqui, ele reprova em silêncio e o teste verde diz que está tudo bem.
  ['good-contrast', 'good'], ['warn-contrast', 'warn'],
  ['error-contrast', 'error'], ['ink-contrast', 'ink'],
  // Os `-ink` também aparecem sobre superfície neutra, não só sobre o `-soft` da própria
  // família: rótulo colorido em card branco, chip com fundo opaco, número destacado. Foi o par
  // da correção do pill "Context" do iChat.
  ['accent-ink', 'surface'], ['accent-ink', 'canvas'],
  ['good-ink', 'surface'], ['warn-ink', 'surface'],
  ['rare-ink', 'surface'], ['error-ink', 'surface'],
  // `--surface-hover` é FUNDO como qualquer outro, e faltava. Quarta vez que a lista se mostrou
  // incompleta, e desta vez o padrão ficou impossível de ignorar: um item de navegação passa
  // metade da vida em hover, e o texto ali estava em 3,89:1 sem nada acusar. A regra que sai
  // disto é simples — todo token que APARECE COMO FUNDO em algum lugar precisa estar nesta
  // matriz, senão o teste verde só cobre os fundos de que alguém lembrou.
  ['ink', 'surface-hover'], ['ink-muted', 'surface-hover'], ['ink-faint', 'surface-hover'],
  ['accent-ink', 'surface-hover'], ['good-ink', 'surface-hover'],
  ['warn-ink', 'surface-hover'], ['rare-ink', 'surface-hover'], ['error-ink', 'surface-hover'],
]

interface Bloco { tema: string; escuro: boolean; tokens: Record<string, string> }

function blocos(): Bloco[] {
  const out: Bloco[] = []
  const re = /\[data-theme="([a-z]+)"\]([^{]*)\{([^}]*)\}/g
  let m: RegExpExecArray | null
  while ((m = re.exec(css))) {
    const [, tema, sufixo, corpo] = m
    const tokens: Record<string, string> = {}
    for (const t of corpo.matchAll(/--([a-z-]+):\s*([^;]+);/g)) tokens[t[1]] = t[2].trim()
    if (Object.keys(tokens).length) out.push({ tema, escuro: /\.dark/.test(sufixo), tokens })
  }
  return out
}

const hex = (s: string): [number, number, number] | null => {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s.trim())
  if (!m) return null
  const h = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1]
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number]
}

/** Luminância relativa — WCAG 2.1, definição normativa. */
const luminancia = (rgb: [number, number, number]) => {
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export const razaoDeContraste = (frente: [number, number, number], fundo: [number, number, number]) => {
  const [alta, baixa] = [luminancia(frente), luminancia(fundo)].sort((a, b) => b - a)
  return (alta + 0.05) / (baixa + 0.05)
}

/**
 * O bloco `.dark` redefine só ALGUNS tokens; o resto herda do bloco claro do mesmo tema.
 * Ignorar isso faria o teste pular pares que o navegador de fato compõe.
 */
function paletaEfetiva(): { rotulo: string; tokens: Record<string, string> }[] {
  const bs = blocos()
  const claros: Record<string, Record<string, string>> = {}
  for (const b of bs) if (!b.escuro) claros[b.tema] = { ...(claros[b.tema] ?? {}), ...b.tokens }
  return bs.map((b) => ({
    rotulo: `${b.tema} ${b.escuro ? 'escuro' : 'claro'}`,
    tokens: b.escuro ? { ...claros[b.tema], ...b.tokens } : b.tokens,
  }))
}

const paletas = paletaEfetiva()

describe('todo par de texto/fundo de todo tema passa WCAG AA', () => {
  it('a extração encontrou as paletas — um regex quebrado tornaria o teste vazio e verde', () => {
    expect(paletas.length).toBeGreaterThanOrEqual(7)
    const temas = new Set(paletas.map((p) => p.rotulo.split(' ')[0]))
    for (const t of ['babel', 'linear', 'vercel', 'mochi', 'notion', 'premium']) expect(temas).toContain(t)
  })

  it('cobre uma quantidade plausível de pares — pular em silêncio é como a lacuna anterior passou', () => {
    const avaliados = paletas.flatMap(({ tokens }) =>
      PARES.filter(([f, g]) => hex(tokens[f] ?? '') && hex(tokens[g] ?? '')))
    // Piso deliberadamente folgado: o ponto é acusar se a extração degradar de vez, não fixar
    // um número que quebre ao adicionar um tema.
    expect(avaliados.length).toBeGreaterThanOrEqual(70)
  })

  for (const { rotulo, tokens } of paletas) {
    for (const [frente, fundo] of PARES) {
      const cf = hex(tokens[frente] ?? '')
      const cg = hex(tokens[fundo] ?? '')
      if (!cf || !cg) continue
      it(`${rotulo} · ${frente} sobre ${fundo}`, () => {
        const r = razaoDeContraste(cf, cg)
        expect(
          Number(r.toFixed(2)),
          `${tokens[frente]} sobre ${tokens[fundo]} = ${r.toFixed(2)}:1, abaixo do mínimo AA de ${MINIMO_AA}:1`,
        ).toBeGreaterThanOrEqual(MINIMO_AA)
      })
    }
  }
})

describe('a matemática de contraste confere com a norma', () => {
  it('preto sobre branco é 21:1, o máximo possível', () => {
    expect(razaoDeContraste([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 5)
  })

  it('uma cor contra ela mesma é 1:1', () => {
    expect(razaoDeContraste([120, 120, 120], [120, 120, 120])).toBeCloseTo(1, 5)
  })

  it('a razão é simétrica — quem é frente e quem é fundo não muda o resultado', () => {
    expect(razaoDeContraste([255, 255, 255], [0, 0, 0])).toBeCloseTo(21, 5)
  })

  it('bate com um valor de referência conhecido (#767676 sobre branco = 4.54:1)', () => {
    // Valor publicado nos exemplos da própria WCAG para o limiar AA.
    expect(razaoDeContraste([0x76, 0x76, 0x76], [255, 255, 255])).toBeCloseTo(4.54, 2)
  })
})
