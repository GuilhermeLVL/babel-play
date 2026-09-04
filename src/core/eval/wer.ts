/**
 * WER e CER — a medida de acurácia que este repositório não tinha.
 *
 * Todo número de qualidade de áudio aqui era LATÊNCIA (`captureMetrics.ts`). Latência não diz se a
 * transcrição está certa, e sem isso nenhuma correção do pipeline de fala pode ser demonstrada —
 * só alegada. Este módulo é o pré-requisito de qualquer mudança em STT.
 *
 * A NORMALIZAÇÃO É A PARTE QUE MAIS ENGANA, e por isso está explícita e testada. Um WER medido com
 * normalização frouxa parece ótimo e esconde o defeito; um medido com normalização severa demais
 * pune o modelo por pontuação que ninguém dita. As escolhas abaixo seguem a prática dos benchmarks
 * de pt-BR (CORAA, Common Voice): caixa e pontuação fora, acento MANTIDO por padrão.
 *
 * Por que o acento fica: em português ele distingue palavra ("está"/"esta", "só"/"so"), e removê-lo
 * mascararia justamente o erro que se quer medir. O modo `semAcento` existe para comparar com
 * números publicados que normalizam assim — mas não é o padrão daqui.
 *
 * Puro e isomórfico: sem I/O, sem Node, sem browser. Roda no Vitest e no runner offline.
 */

export interface OpcoesDeNormalizacao {
  /** Remove acentos antes de comparar. Fora do padrão — ver a nota acima. */
  semAcento?: boolean
  /** Converte numerais arábicos por extenso não é feito aqui; ver `NOTA-NUMERAIS` abaixo. */
  manterPontuacao?: boolean
}

/**
 * NOTA-NUMERAIS: "2" e "dois" contam como palavras diferentes, de propósito.
 *
 * Converter numerais exigiria um conversor pt-BR completo (ordinal, gênero, concordância) e cada
 * erro dele entraria na conta como se fosse erro do modelo. É mais honesto deixar a divergência
 * visível e anotá-la na referência do que esconder atrás de um conversor que também erra.
 */
export function normalizarPt(texto: string, opcoes: OpcoesDeNormalizacao = {}): string {
  let t = (texto ?? '').toLowerCase()

  // NFC primeiro: "á" pode chegar como um code point ou como "a"+combinante, e sem unificar isso
  // duas strings visualmente idênticas contariam como diferentes.
  t = t.normalize('NFC')

  if (opcoes.semAcento) {
    t = t.normalize('NFD').replace(/[̀-ͯ]/g, '')
  }

  if (!opcoes.manterPontuacao) {
    // Hífen e apóstrofo viram espaço em vez de sumir: "guarda-chuva" é uma palavra na referência e
    // costuma sair como duas do modelo; colapsar em "guardachuva" criaria um erro artificial.
    t = t.replace(/[-‐-―‘’']/g, ' ')
    t = t.replace(/[.,;:!?¿¡"“”()[\]{}…]/g, '')
  }

  return t.replace(/\s+/g, ' ').trim()
}

export function palavras(texto: string): string[] {
  const t = texto.trim()
  return t ? t.split(' ') : []
}

export interface Distancia {
  distancia: number
  substituicoes: number
  insercoes: number
  delecoes: number
}

/**
 * Levenshtein com backtrace das três operações separadas.
 *
 * A decomposição não é enfeite: um WER alto por DELEÇÃO significa que o modelo está engolindo fala
 * (VAD cortando, áudio fraco), e um alto por SUBSTITUIÇÃO significa que ele ouve mas erra a palavra
 * (modelo pequeno, idioma errado). São defeitos diferentes, com correções diferentes — o número
 * agregado sozinho não distingue os dois.
 *
 * Duas linhas de DP para o custo e uma matriz de operações para o backtrace; o tamanho das
 * entradas aqui (enunciados, não documentos) torna isso barato.
 */
export function distanciaDeEdicao<T>(ref: T[], hip: T[]): Distancia {
  const n = ref.length
  const m = hip.length
  if (n === 0) return { distancia: m, substituicoes: 0, insercoes: m, delecoes: 0 }
  if (m === 0) return { distancia: n, substituicoes: 0, insercoes: 0, delecoes: n }

  // op[i][j]: 'i' inserção, 'd' deleção, 's' substituição, '=' acerto
  const custo: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  const op: string[][] = Array.from({ length: n + 1 }, () => new Array<string>(m + 1).fill('='))

  for (let i = 0; i <= n; i++) { custo[i][0] = i; op[i][0] = 'd' }
  for (let j = 0; j <= m; j++) { custo[0][j] = j; op[0][j] = 'i' }
  op[0][0] = '='

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const igual = ref[i - 1] === hip[j - 1]
      const sub = custo[i - 1][j - 1] + (igual ? 0 : 1)
      const del = custo[i - 1][j] + 1
      const ins = custo[i][j - 1] + 1
      const min = Math.min(sub, del, ins)
      custo[i][j] = min
      op[i][j] = min === sub ? (igual ? '=' : 's') : min === del ? 'd' : 'i'
    }
  }

  let i = n, j = m
  let substituicoes = 0, insercoes = 0, delecoes = 0
  while (i > 0 || j > 0) {
    const o = op[i][j]
    if (o === '=' || o === 's') { if (o === 's') substituicoes++; i--; j-- }
    else if (o === 'd') { delecoes++; i-- }
    else { insercoes++; j-- }
  }

  return { distancia: custo[n][m], substituicoes, insercoes, delecoes }
}

export interface ResultadoDeErro extends Distancia {
  /** Erros ÷ unidades da referência. Pode passar de 1 quando a hipótese inventa texto. */
  taxa: number
  unidadesNaReferencia: number
}

function taxa(d: Distancia, unidades: number): ResultadoDeErro {
  return { ...d, unidadesNaReferencia: unidades, taxa: unidades === 0 ? (d.insercoes > 0 ? 1 : 0) : d.distancia / unidades }
}

/** Word Error Rate sobre texto já normalizado por `normalizarPt`. */
export function wer(referencia: string, hipotese: string, opcoes?: OpcoesDeNormalizacao): ResultadoDeErro {
  const r = palavras(normalizarPt(referencia, opcoes))
  const h = palavras(normalizarPt(hipotese, opcoes))
  return taxa(distanciaDeEdicao(r, h), r.length)
}

/**
 * Character Error Rate. Em pt-BR ele é o complemento necessário do WER: uma flexão errada
 * ("falaram"/"falavam") custa uma palavra inteira no WER e quase nada no CER, então a distância
 * entre as duas métricas diz se o modelo errou o sentido ou só a terminação.
 */
export function cer(referencia: string, hipotese: string, opcoes?: OpcoesDeNormalizacao): ResultadoDeErro {
  const r = [...normalizarPt(referencia, opcoes).replace(/ /g, '')]
  const h = [...normalizarPt(hipotese, opcoes).replace(/ /g, '')]
  return taxa(distanciaDeEdicao(r, h), r.length)
}

export interface CasoDeCorpus {
  id: string
  referencia: string
  hipotese: string
}

export interface AgregadoDeErro {
  casos: number
  /** WER do corpus: soma dos erros ÷ soma das palavras. NÃO é a média dos WER por caso. */
  wer: number
  cer: number
  substituicoes: number
  insercoes: number
  delecoes: number
  palavrasNaReferencia: number
}

/**
 * Agrega o corpus somando erros e unidades — e NÃO tirando a média dos WER individuais.
 *
 * A diferença importa muito aqui: a média por caso dá o mesmo peso a uma fala de 2 palavras e a uma
 * de 40, e como este produto é feito de enunciados curtos, a média seria dominada por falas
 * minúsculas onde um único erro vale 50% de WER. A soma ponderada é a definição padrão dos
 * benchmarks e é a que permite comparar com números publicados.
 */
export function agregar(casos: CasoDeCorpus[], opcoes?: OpcoesDeNormalizacao): AgregadoDeErro {
  let erros = 0, palavrasRef = 0, sub = 0, ins = 0, del = 0
  let errosChar = 0, charsRef = 0

  for (const c of casos) {
    const w = wer(c.referencia, c.hipotese, opcoes)
    erros += w.distancia; palavrasRef += w.unidadesNaReferencia
    sub += w.substituicoes; ins += w.insercoes; del += w.delecoes
    const ce = cer(c.referencia, c.hipotese, opcoes)
    errosChar += ce.distancia; charsRef += ce.unidadesNaReferencia
  }

  return {
    casos: casos.length,
    wer: palavrasRef === 0 ? 0 : erros / palavrasRef,
    cer: charsRef === 0 ? 0 : errosChar / charsRef,
    substituicoes: sub, insercoes: ins, delecoes: del,
    palavrasNaReferencia: palavrasRef,
  }
}

/**
 * Faixas de duração da fala, em palavras da referência.
 *
 * Este recorte é o ponto do plano: a literatura de ASR mostra que o erro do Whisper dispara abaixo
 * de ~6 palavras, e o VAD desta aplicação produz exatamente falas curtas (`minSpeechMs: 400`,
 * corte forçado em 6 s). Se o WER das faixas curtas for muito pior que o das longas, o gargalo é a
 * SEGMENTAÇÃO, não o modelo — e a correção é agrupar fala, não baixar um modelo maior.
 */
export const FAIXAS_DE_TAMANHO = [
  { nome: '1-2 palavras', min: 1, max: 2 },
  { nome: '3-5 palavras', min: 3, max: 5 },
  { nome: '6-10 palavras', min: 6, max: 10 },
  { nome: '11-20 palavras', min: 11, max: 20 },
  { nome: '21+ palavras', min: 21, max: Infinity },
] as const

export function agregarPorFaixa(casos: CasoDeCorpus[], opcoes?: OpcoesDeNormalizacao): Record<string, AgregadoDeErro> {
  const saida: Record<string, AgregadoDeErro> = {}
  for (const faixa of FAIXAS_DE_TAMANHO) {
    const doGrupo = casos.filter((c) => {
      const n = palavras(normalizarPt(c.referencia, opcoes)).length
      return n >= faixa.min && n <= faixa.max
    })
    saida[faixa.nome] = agregar(doGrupo, opcoes)
  }
  return saida
}
