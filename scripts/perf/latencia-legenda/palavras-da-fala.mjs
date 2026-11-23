/**
 * ATRASO POR PALAVRA E ERASURE na bancada (change `parciais-incrementais`, tarefa 1.7).
 *
 * Usa as MESMAS funções puras do cliente (`src/core/legendas/medidasDeParcial.ts`); aqui só se monta a entrada a partir de
 * `lat.dom` (a série de quadros do balão que a `sonda.js` registra) e do roteiro com tempo por palavra
 * (`gerar-palavras-do-roteiro.mjs` → `montar-audio.mjs`).
 *
 * Como o balão aparece em `lat.dom` (`{ t, tf, i, o, tr }`, `i` = índice do balão na lista):
 *   - ORIGINAL: `o` quando preenchido (texto final); com `o` vazio, o parcial vem no campo `tr` (a legenda ainda sem tradução
 *     mostra o original do parcial ali). O original visível de um quadro é, portanto, `o || tr`.
 *   - TRADUÇÃO: `tr` só enquanto `o` está preenchido (aí `tr` é a tradução, a do parcial ou a final).
 *   O quadro pintado é `tf ?? t` (o quadro seguinte ao commit do React).
 *
 * Tradução: não há verdade por palavra. O tempo de referência de cada palavra traduzida é o fim da palavra de origem na
 * posição proporcional (`referenciaProporcional`): PROXY declarado; só compara variantes entre si.
 * Fala com `alinhamento.foraDoCalculo` (< 90% das palavras casadas) sai do atraso e é contada em `foraDoCalculo`.
 */
import {
  atrasoDePalavraMs,
  erasure,
  fracaoCasada,
  referenciaProporcional,
  tokenizar,
} from '../../../src/core/legendas/medidasDeParcial.ts'

const comTexto = (s) => typeof s === 'string' && /[\p{L}\p{N}]/u.test(s)

/** O que a tradução mostra num quadro: só vale com o original já preenchido. */
const quadroDaTraducao = (r) => ({ t: r.tf ?? r.t, texto: comTexto(r.o) ? r.tr : '' })
/** O original visível num quadro: `o`, ou o parcial que ocupa o campo da tradução. */
const quadroDoOriginal = (r) => ({ t: r.tf ?? r.t, texto: comTexto(r.o) ? r.o : r.tr })

/** Agrupa `lat.dom` por balão (`i`), em ordem de tempo. */
export function gruposDoDom(dom) {
  const grupos = new Map()
  for (const r of dom ?? []) {
    if (!grupos.has(r.i)) grupos.set(r.i, [])
    grupos.get(r.i).push(r)
  }
  for (const g of grupos.values()) g.sort((a, b) => a.t - b.t)
  return grupos
}

/**
 * O balão de cada fala do roteiro: entre os balões cujo 1º quadro com texto cai na janela da fala
 * [início da voz − 400 ms, início da próxima − 400 ms), o que mais se parece com a referência.
 * @returns {Map<number, any[]>} k → quadros do balão
 */
export function balaoDeCadaFala(dom, falas, tDoArquivo) {
  const grupos = [...gruposDoDom(dom).values()]
    .map((g) => ({ g, t0: g.find((r) => comTexto(r.o) || comTexto(r.tr))?.t }))
    .filter((x) => Number.isFinite(x.t0))
  const saida = new Map()
  falas.forEach((f, idx) => {
    const de = tDoArquivo(f.iniS) - 400
    const ate = idx + 1 < falas.length ? tDoArquivo(falas[idx + 1].iniS) - 400 : Infinity
    const ref = tokenizar(f.referencia ?? '')
    const candidatos = grupos.filter((x) => x.t0 >= de && x.t0 < ate)
    let melhor = null
    let nota = -1
    for (const c of candidatos) {
      const final = [...c.g]
        .reverse()
        .map((r) => quadroDoOriginal(r).texto)
        .find(comTexto)
      const n = fracaoCasada(ref, tokenizar(final ?? ''))
      if (n > nota) {
        nota = n
        melhor = c.g
      }
    }
    if (melhor) saida.set(f.k, melhor)
  })
  return saida
}

/**
 * As medidas de palavra de UMA fala.
 * @returns {{ atrasoOriginalMs: (number|null)[], atrasoTraducaoMs: (number|null)[], semCasamento: number,
 *   erasureOriginal: {apagadas:number, final:number, ne:number}|null, erasureTraducao: {apagadas:number, final:number, ne:number}|null,
 *   foraDoCalculo: boolean, semRoteiroDePalavras: boolean }}
 */
export function medidasDaFala(fala, quadros, tDoArquivo) {
  const original = quadros.map(quadroDoOriginal)
  const traducao = quadros.map(quadroDaTraducao)
  const saida = {
    atrasoOriginalMs: [],
    atrasoTraducaoMs: [],
    semCasamento: 0,
    erasureOriginal: erasure(original),
    erasureTraducao: erasure(traducao),
    foraDoCalculo: !!fala.alinhamento?.foraDoCalculo,
    fimDaFalaAteOriginal: fimDaFalaAteOriginalMs(quadros, tDoArquivo(fala.fimS)),
    semRoteiroDePalavras: !fala.palavras?.length,
  }
  if (saida.foraDoCalculo || saida.semRoteiroDePalavras) return saida
  const referencia = fala.palavras.map((p) => ({ palavra: p.t, fimMs: tDoArquivo(p.fimS) }))
  const o = atrasoDePalavraMs(referencia, original)
  saida.atrasoOriginalMs = o.atrasos.filter((x) => x !== null)
  saida.semCasamento = o.semCasamento
  // Tradução: as palavras do texto final da tradução, cada uma com o tempo proporcional da origem.
  const finalTr = [...traducao].reverse().find((q) => tokenizar(q.texto).length)
  if (finalTr) {
    const ref = referenciaProporcional(tokenizar(finalTr.texto), referencia)
    saida.atrasoTraducaoMs = atrasoDePalavraMs(ref, traducao).atrasos.filter((x) => x !== null)
  }
  return saida
}

/**
 * `fimDaFalaAteOriginalMs` (guarda 1 do final quando não há tradução, ex. pt para pt): do fim da voz no arquivo (`fimMs`) ao
 * PRIMEIRO quadro pintado em que o texto FINAL do original aparece no balão (`tf ?? t`). O texto final é o último original com
 * letras do balão; a comparação é por palavras (`tokenizar`). Vale o original visível (`o || tr`, ver acima) porque sem tradução
 * o original ocupa o campo `tr` até o fim e não há quadro "confirmado" distinguível. Um parcial que já mostrava o texto final
 * conta (o valor pode ser negativo): é o que a pessoa viu. `null` sem texto final ou sem fim da voz.
 * @param {{t:number, tf?:number, o?:string, tr?:string}[]} quadros quadros do balão da fala, em ordem de tempo
 * @param {number} fimMs fim da voz no arquivo, na mesma escala de tempo dos quadros
 * @returns {number|null}
 */
export function fimDaFalaAteOriginalMs(quadros, fimMs) {
  const chave = (s) => tokenizar(s ?? '').join(' ')
  const vistos = quadros.map((r) => ({ t: r.tf ?? r.t, texto: quadroDoOriginal(r).texto }))
  const final = [...vistos].reverse().find((q) => comTexto(q.texto))
  if (!final || !Number.isFinite(fimMs)) return null
  const alvo = chave(final.texto)
  const primeiro = vistos.find((q) => chave(q.texto) === alvo)
  return primeiro ? Math.round(primeiro.t - fimMs) : null
}

/** Todas as falas de uma rodada: `Map k → medidas`. */
export function medidasDeTodasAsFalas(dom, roteiro, tDoArquivo) {
  const baloes = balaoDeCadaFala(dom, roteiro.falas, tDoArquivo)
  const saida = new Map()
  for (const f of roteiro.falas) {
    const quadros = baloes.get(f.k)
    if (quadros) saida.set(f.k, medidasDaFala(f, quadros, tDoArquivo))
  }
  return saida
}

const finito = (x) => typeof x === 'number' && Number.isFinite(x)

/** Percentil por interpolação linear (tipo 7), sem arredondar; `null` sem valores. */
export function percentilDe(xs, p) {
  const s = xs.filter(finito).sort((a, b) => a - b)
  if (!s.length) return null
  const h = (s.length - 1) * (p / 100)
  const lo = Math.floor(h)
  return s[lo] + (s[Math.min(lo + 1, s.length - 1)] - s[lo]) * (h - lo)
}

const estatistica = (valores) => ({
  n: valores.length,
  p50: percentilDe(valores, 50),
  p90: percentilDe(valores, 90),
  valores,
})

const somaDeErasure = (lista) => {
  const dentro = lista.filter(Boolean)
  const apagadas = dentro.reduce((s, e) => s + e.apagadas, 0)
  const final = dentro.reduce((s, e) => s + e.final, 0)
  return { falas: dentro.length, apagadas, final, ne: final ? apagadas / final : null }
}

/**
 * Resume as falas (de `analisarRodada`, campo `palavras`) em números de rodada: p50/p90 do atraso por palavra (original e
 * tradução, as palavras de todas as falas somadas, nunca a mediana de medianas), erasure agregada (Σ apagadas ÷ Σ palavras
 * finais) e as contagens de falas fora do cálculo. `valores` ficam na rodada para a agregação somar as rodadas.
 */
export function resumirPalavras(falas) {
  const medidas = falas.map((f) => f.palavras).filter(Boolean)
  const calculadas = medidas.filter((m) => !m.foraDoCalculo)
  return {
    falasComMedida: medidas.length,
    foraDoCalculo: medidas.filter((m) => m.foraDoCalculo).length,
    semCasamento: calculadas.reduce((s, m) => s + m.semCasamento, 0),
    atrasoDePalavraMs: {
      original: estatistica(calculadas.flatMap((m) => m.atrasoOriginalMs)),
      traducao: estatistica(calculadas.flatMap((m) => m.atrasoTraducaoMs)),
    },
    erasureOriginal: somaDeErasure(medidas.map((m) => m.erasureOriginal)),
    erasureTraducao: somaDeErasure(medidas.map((m) => m.erasureTraducao)),
  }
}

/** Várias rodadas (a saída de `resumirPalavras`) → uma: os valores e as somas de erasure juntos. */
export function agregarPalavras(rodadas) {
  const dentro = rodadas.filter(Boolean)
  const juntar = (caminho) => dentro.flatMap((r) => r.atrasoDePalavraMs[caminho].valores)
  const soma = (campo) => {
    const apagadas = dentro.reduce((s, r) => s + r[campo].apagadas, 0)
    const final = dentro.reduce((s, r) => s + r[campo].final, 0)
    return { apagadas, final, ne: final ? apagadas / final : null }
  }
  return {
    rodadas: dentro.length,
    falasComMedida: dentro.reduce((s, r) => s + r.falasComMedida, 0),
    foraDoCalculo: dentro.reduce((s, r) => s + r.foraDoCalculo, 0),
    semCasamento: dentro.reduce((s, r) => s + r.semCasamento, 0),
    atrasoDePalavraMs: {
      original: (({ n, p50, p90 }) => ({ n, p50, p90 }))(estatistica(juntar('original'))),
      traducao: (({ n, p50, p90 }) => ({ n, p50, p90 }))(estatistica(juntar('traducao'))),
    },
    erasureOriginal: soma('erasureOriginal'),
    erasureTraducao: soma('erasureTraducao'),
  }
}
