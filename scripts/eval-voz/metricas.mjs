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
 * ATENÇÃO, siglas: "CPF", "cê pê efe" e "C P F" normalizam de modos diferentes (a referência com sigla
 * vira uma palavra, a transcrição costuma vir soletrada), o que infla o WER/CER das frases com siglas.
 * Para siglas vale o acerto do item (`acertoDosItens`), não o WER da frase.
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

/**
 * Palavras de número (sem acento) em pt, en e es. "um/uma/uno/una/un/one" ficam à parte (ARTIGOS):
 * também são artigos, então só contam como número ao lado de um conector ("vinte e um").
 */
const PALAVRAS_DE_NUMERO = new Set(
  (
    'zero dois duas tres quatro cinco seis sete oito nove dez onze doze treze catorze quatorze quinze ' +
    'dezesseis dezessete dezoito dezenove vinte trinta quarenta cinquenta sessenta setenta oitenta noventa ' +
    'cem cento duzentos trezentos quatrocentos quinhentos seiscentos setecentos oitocentos novecentos ' +
    'mil milhao milhoes bilhao bilhoes ' +
    'two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen ' +
    'eighteen nineteen twenty thirty forty fifty sixty seventy eighty ninety hundred thousand million billion ' +
    'cuatro siete ocho nueve diez once doce trece catorce quince dieciseis diecisiete dieciocho diecinueve ' +
    'veinte veintiuno veintidos veintitres veinticuatro veinticinco veintiseis veintisiete veintiocho veintinueve ' +
    'cien treinta cuarenta cincuenta sesenta ochenta ciento doscientos trescientos cuatrocientos quinientos ' +
    'seiscientos setecientos ochocientos novecientos millon millones'
  ).split(' '),
)
const ARTIGOS_NUMERO = new Set(['um', 'uma', 'uno', 'una', 'un', 'one'])
const CONECTORES = new Set(['e', 'and', 'y'])

const ehDigito = (t) => /\d/.test(t)
/** Número "forte": dígito ou palavra de número que não é artigo. */
const ehNumero = (t) => t !== undefined && (ehDigito(t) || PALAVRAS_DE_NUMERO.has(t))
/** Número "amplo": inclui um/uma/uno/una/un/one, usado do outro lado de um conector. */
const ehNumeroAmplo = (t) => ehNumero(t) || (t !== undefined && ARTIGOS_NUMERO.has(t))

/**
 * Um achado em `palheiro[i, i+n)` é um numeral EXATO se nada numérico o prolonga:
 * - antes: nem número forte, nem conector precedido de número forte ("cento e [vinte e um]");
 * - depois: nem número forte, nem conector seguido de número amplo ("[vinte] e um").
 * Limitação aceita: dois numerais sem pontuação visível entre eles ("1889 1776") reprovam; na prática
 * a pontuação some na normalização, mas o corpus separa os itens por palavras comuns.
 */
function numeralExato(palheiro, i, n) {
  const antes = palheiro[i - 1]
  if (ehNumero(antes)) return false
  if (CONECTORES.has(antes) && ehNumero(palheiro[i - 2])) return false
  const depois = palheiro[i + n]
  if (ehNumero(depois)) return false
  if (CONECTORES.has(depois) && ehNumeroAmplo(palheiro[i + n + 1])) return false
  return true
}

/**
 * `agulha` aparece em `palheiro` como sequência contígua de palavras inteiras? Com `exato`
 * (itens `numero` e `ano`), o achado não pode ser parte de um numeral maior (ver `numeralExato`).
 */
function contem(palheiro, agulha, exato = false) {
  if (agulha.length === 0) return false
  for (let i = 0; i + agulha.length <= palheiro.length; i++) {
    if (agulha.every((p, k) => palheiro[i + k] === p) && (!exato || numeralExato(palheiro, i, agulha.length))) {
      return true
    }
  }
  return false
}

/**
 * Quantos itens difíceis aparecem na hipótese. Um item acerta se QUALQUER forma de `aceita` aparece
 * como sequência de palavras inteiras, depois de normalizar os dois lados e ignorar acento.
 * Itens `numero` e `ano` exigem casamento EXATO no sentido numeral (o achado não pode estar dentro de
 * um número maior: "onze mil oitocentos e oitenta e nove" não acerta 1889; "vinte e um" não acerta
 * "vinte"). Hora e moeda acertam pelas próprias formas da lista `aceita` ("sete horas e trinta",
 * "quarenta e nove reais e noventa centavos"). `nome` e `sigla` usam contenção simples.
 *
 * Siglas ("CPF", "cê pê efe", "C P F") normalizam de modo diferente na referência e na hipótese:
 * frases com siglas inflam o WER/CER; a medida confiável delas é o acerto do item, não o WER da frase.
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
    const exato = item.tipo === 'numero' || item.tipo === 'ano'
    const ok = item.aceita.some((forma) => contem(palavras, paraItem(forma, idioma), exato))
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
 * @param {{ ignorar?: string[] }} [opcoes]  `ignorar`: campos de `MedidasDoIdioma` que NÃO são checados
 *   (ex.: `['estabilidade']`, que este script não mede). Só o resumo do CLI usa; o padrão é reprovar.
 * @returns {{ passou: boolean, falhas: string[] }}
 */
export function avaliarContraLimiares(medidas, limiares, { ignorar = [] } = {}) {
  const falhas = []
  for (const [idioma, m] of Object.entries(medidas.porIdioma)) {
    const lim = limiares[idioma]
    if (!lim) continue
    const checar = (campo, nome, valor, limite, tipo, formato = pct) => {
      if (limite === undefined || ignorar.includes(campo)) return
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
    checar('cer', 'CER', m.cer, lim.cerMax, 'max')
    checar('wer', 'WER', m.wer, lim.werMax, 'max')
    checar('itensAcerto', 'itens difíceis corretos', m.itensAcerto, lim.itensAcertoMin, 'min')
    checar('itensNumerosEAnos', 'números e anos corretos', m.itensNumerosEAnos, lim.itensNumerosEAnosMin, 'min')
    checar('estabilidade', 'estabilidade (inserções + deleções)', m.estabilidade, lim.estabilidadeMax, 'max')
    checar('foraDaMediana', 'frases fora de ±30% da mediana', m.foraDaMediana, lim.foraDaMedianaMax, 'max')
    checar('semAudio', 'frases sem áudio', m.semAudio, lim.semAudioMax, 'max', String)
    checar('invalidos', 'frases com áudio inválido', m.invalidos, lim.invalidosMax, 'max', String)
  }
  return { passou: falhas.length === 0, falhas }
}
