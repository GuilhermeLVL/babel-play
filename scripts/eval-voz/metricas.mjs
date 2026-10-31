/**
 * Métricas puras do round-trip de voz (texto -> TTS -> Whisper -> texto) da bancada `scripts/eval-voz/`.
 *
 * Fica separado de `comum.mjs` de propósito: aqui se importa TypeScript de `src/core` (`wer.ts`,
 * `prepararTextoParaVoz.ts`, que tem imports sem extensão), então quem usa este módulo roda sob `tsx`
 * (ou Vitest). Já `comum.mjs` (corpus, tipos, limiares) segue carregável em `node` puro.
 */
import { cer as cerDe, normalizarPt, wer as werDe } from '../../src/core/eval/wer.ts'
import { prepararTextoParaVoz } from '../../src/core/leitura/prepararTextoParaVoz.ts'

/** Folga contra erro de ponto flutuante nas comparações com o limiar (3,0 % tem de passar). */
const EPSILON = 1e-9

/**
 * A MESMA função nos dois lados (referência e hipótese): prepara o texto como o sintetizador o leria
 * (números, moeda, ordinais por extenso em pt) e normaliza caixa e pontuação. O acento é MANTIDO:
 * `normalizarPt` só o remove com `semAcento`, que aqui não é usado (WER/CER são sensíveis a ele).
 * @param {string} texto
 * @param {'pt'|'en'|'es'} idioma
 * @returns {string}
 */
export function normalizarParaComparar(texto, idioma) {
  return normalizarPt(prepararTextoParaVoz(texto ?? '', idioma))
}

/**
 * WER e CER de um trecho, como frações. Referência vazia: 0 se a hipótese também é vazia, 1 se ela
 * inventou texto (sem divisão por zero).
 * @param {string} ref
 * @param {string} hip
 * @param {'pt'|'en'|'es'} idioma
 * @returns {{ wer: number, cer: number }}
 */
export function medirTrecho(ref, hip, idioma) {
  const r = normalizarParaComparar(ref, idioma)
  const h = normalizarParaComparar(hip, idioma)
  return { wer: werDe(r, h).taxa, cer: cerDe(r, h).taxa }
}

/** Normaliza e dobra o acento, para o casamento dos itens difíceis. */
function paraItem(texto, idioma) {
  return normalizarParaComparar(texto, idioma).normalize('NFD').replace(/[̀-ͯ]/g, '').split(' ').filter(Boolean)
}

/** `agulha` aparece em `palheiro` como sequência contígua de palavras inteiras? */
function contem(palheiro, agulha) {
  if (agulha.length === 0) return false
  for (let i = 0; i + agulha.length <= palheiro.length; i++) {
    if (agulha.every((p, k) => palheiro[i + k] === p)) return true
  }
  return false
}

/**
 * Quantos itens difíceis aparecem na hipótese. Um item acerta se QUALQUER forma de `aceita` aparece
 * como sequência de palavras inteiras, depois de normalizar os dois lados e ignorar acento.
 * @param {string} hip
 * @param {import('./comum.mjs').ItemDificil[]} itens
 * @param {'pt'|'en'|'es'} [idioma]
 * @returns {{ acertos: number, total: number, porTipo: Record<string, [number, number]> }}
 */
export function acertoDosItens(hip, itens, idioma = 'pt') {
  const palavras = paraItem(hip, idioma)
  const porTipo = {}
  let acertos = 0
  for (const item of itens) {
    const ok = item.aceita.some((forma) => contem(palavras, paraItem(forma, idioma)))
    const par = (porTipo[item.tipo] ??= [0, 0])
    par[1]++
    if (ok) {
      par[0]++
      acertos++
    }
  }
  return { acertos, total: itens.length, porTipo }
}

const pct = (v) => `${(v * 100).toFixed(1).replace('.', ',')} %`

/**
 * Confronta as medidas com os limiares. Métrica com limiar mas sem medida reprova ("não medida"):
 * passar calado por falta de dado esconderia justamente o que falta medir.
 * @param {import('./comum.mjs').Medidas} medidas
 * @param {import('./comum.mjs').Limiares} limiares
 * @returns {{ passou: boolean, falhas: string[] }}
 */
export function avaliarContraLimiares(medidas, limiares) {
  const falhas = []
  for (const [idioma, m] of Object.entries(medidas.porIdioma)) {
    const lim = limiares[idioma]
    if (!lim) continue
    const checar = (nome, valor, limite, tipo, formato = pct) => {
      if (limite === undefined) return
      if (typeof valor !== 'number' || Number.isNaN(valor)) {
        falhas.push(`${idioma}: ${nome} não medida (limite ${formato(limite)})`)
        return
      }
      const reprovou = tipo === 'max' ? valor > limite + EPSILON : valor < limite - EPSILON
      if (reprovou) {
        falhas.push(
          `${idioma}: ${nome} ${formato(valor)} ${tipo === 'max' ? 'acima do máximo' : 'abaixo do mínimo'} de ${formato(limite)}`,
        )
      }
    }
    checar('CER', m.cer, lim.cerMax, 'max')
    checar('WER', m.wer, lim.werMax, 'max')
    checar('itens difíceis corretos', m.itensAcerto, lim.itensAcertoMin, 'min')
    checar('números e anos corretos', m.itensNumerosEAnos, lim.itensNumerosEAnosMin, 'min')
    checar('estabilidade (inserções + deleções)', m.estabilidade, lim.estabilidadeMax, 'max')
    checar('frases fora de ±30% da mediana', m.foraDaMediana, lim.foraDaMedianaMax, 'max')
    checar('frases sem áudio', m.semAudio, lim.semAudioMax, 'max', String)
  }
  return { passou: falhas.length === 0, falhas }
}
