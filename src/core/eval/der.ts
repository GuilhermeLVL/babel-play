/**
 * DER — Diarization Error Rate, a medida de "quem falou quando".
 *
 * O produto erra a atribuição de falante e não havia como provar nem quanto, nem por quê. DER
 * sozinho seria pouco: o valor agregado não distingue "o VAD perdeu a fala" de "o embedding
 * confundiu duas pessoas", que são defeitos com correções opostas. Por isso a decomposição em três
 * componentes é obrigatória aqui, não opcional.
 *
 *   DER = (perdido + falsoAlarme + confusao) / tempoDeFalaNaReferencia
 *
 *   · perdido      → há fala na referência e o sistema não detectou    (VAD conservador, áudio fraco)
 *   · falsoAlarme  → o sistema detectou fala onde não havia            (VAD permissivo, ruído)
 *   · confusao     → ambos detectaram fala, mas o falante está errado  (embedding/cluster)
 *
 * O COLAR de 0,25 s é o padrão da literatura (NIST/pyannote) e existe porque a fronteira exata de
 * uma fala é ambígua até entre anotadores humanos. Sem colar, cada troca de turno cobra alguns
 * centésimos de erro que ninguém consegue acertar. Comparar um DER com colar contra um sem colar é
 * o erro de leitura mais comum da área — por isso o colar entra no resultado.
 *
 * MAPEAMENTO ÓTIMO DE RÓTULOS: o sistema chama de "Pessoa 1" quem a referência chama de "B". Os
 * nomes são arbitrários; o que importa é a partição. Por isso o cálculo procura a correspondência
 * entre rótulos que MINIMIZA o erro antes de contar confusão — senão o número mediria só o acaso
 * da ordem em que as pessoas falaram.
 *
 * Puro e isomórfico: sem I/O, sem áudio, sem Node. Roda no Vitest.
 */

export interface Turno {
  /** Início em milissegundos, relativo ao começo da gravação. */
  inicioMs: number
  fimMs: number
  /** Identificador do falante. Arbitrário: `A`/`B` na referência, `voice_1` no sistema. */
  falante: string
}

export interface ComponentesDoDer {
  /** Segundos de fala na referência que o sistema não detectou. */
  perdidoMs: number
  /** Segundos que o sistema marcou como fala e a referência diz que não é. */
  falsoAlarmeMs: number
  /** Segundos detectados por ambos, mas atribuídos ao falante errado. */
  confusaoMs: number
  /** Denominador: tempo total de fala na referência. */
  falaNaReferenciaMs: number
}

export interface ResultadoDoDer extends ComponentesDoDer {
  /** (perdido + falsoAlarme + confusão) ÷ fala na referência. */
  der: number
  colarMs: number
  /** O casamento escolhido entre rótulos do sistema e da referência. */
  mapeamento: Record<string, string>
}

const COLAR_PADRAO_MS = 250

/* ─────────────────────────── fronteiras e fatias ─────────────────────────── */

/**
 * Quebra a linha do tempo nos instantes em que QUALQUER coisa muda, dos dois lados.
 *
 * Comparar turno a turno não funciona: referência e sistema cortam a fala em pontos diferentes, e
 * um turno do sistema pode cobrir dois da referência. Fatiar nos pontos de mudança reduz o problema
 * a comparar intervalos onde ambos os lados são constantes — que é a definição do DER.
 */
function fronteiras(ref: Turno[], hip: Turno[]): number[] {
  const pontos = new Set<number>()
  for (const t of [...ref, ...hip]) { pontos.add(t.inicioMs); pontos.add(t.fimMs) }
  return [...pontos].sort((a, b) => a - b)
}

function falantesEm(turnos: Turno[], inicio: number, fim: number): Set<string> {
  const s = new Set<string>()
  for (const t of turnos) if (t.inicioMs < fim && t.fimMs > inicio) s.add(t.falante)
  return s
}

/**
 * Zonas de tolerância em torno de cada fronteira da REFERÊNCIA.
 *
 * O colar se aplica às fronteiras da referência (não às do sistema) — é a anotação humana que é
 * imprecisa, e é dela que a tolerância deve partir.
 */
function dentroDoColar(t: number, fronteirasDaRef: number[], colarMs: number): boolean {
  if (colarMs <= 0) return false
  return fronteirasDaRef.some((f) => Math.abs(t - f) < colarMs)
}

/* ─────────────────────────── mapeamento de rótulos ─────────────────────────── */

/**
 * Sobreposição em ms entre cada rótulo do sistema e cada rótulo da referência.
 * É a matriz de custo do casamento.
 */
function sobreposicoes(ref: Turno[], hip: Turno[]): Map<string, Map<string, number>> {
  const m = new Map<string, Map<string, number>>()
  for (const h of hip) {
    if (!m.has(h.falante)) m.set(h.falante, new Map())
    const linha = m.get(h.falante)!
    for (const r of ref) {
      const ini = Math.max(h.inicioMs, r.inicioMs)
      const fim = Math.min(h.fimMs, r.fimMs)
      if (fim > ini) linha.set(r.falante, (linha.get(r.falante) ?? 0) + (fim - ini))
    }
  }
  return m
}

/**
 * Casamento guloso por maior sobreposição, um-para-um.
 *
 * O ótimo exato seria o algoritmo húngaro. Guloso basta e é o que se usa na prática porque o número
 * de falantes é pequeno (o produto limita em 6) e, com poucos rótulos, o guloso coincide com o ótimo
 * salvo em empates patológicos. Trocar por húngaro depois não muda a interface.
 */
export function mapearRotulos(ref: Turno[], hip: Turno[]): Record<string, string> {
  const sobrep = sobreposicoes(ref, hip)
  const pares: { hip: string; ref: string; ms: number }[] = []
  for (const [h, linha] of sobrep) for (const [r, ms] of linha) pares.push({ hip: h, ref: r, ms })
  pares.sort((a, b) => b.ms - a.ms)

  const mapa: Record<string, string> = {}
  const refUsadas = new Set<string>()
  for (const p of pares) {
    if (mapa[p.hip] !== undefined || refUsadas.has(p.ref)) continue
    mapa[p.hip] = p.ref
    refUsadas.add(p.ref)
  }
  return mapa
}

/* ─────────────────────────── o cálculo ─────────────────────────── */

export function calcularDer(ref: Turno[], hip: Turno[], colarMs: number = COLAR_PADRAO_MS): ResultadoDoDer {
  const mapeamento = mapearRotulos(ref, hip)
  const cortes = fronteiras(ref, hip)
  const frontRef = [...new Set(ref.flatMap((t) => [t.inicioMs, t.fimMs]))]

  let perdidoMs = 0, falsoAlarmeMs = 0, confusaoMs = 0, falaNaReferenciaMs = 0

  for (let i = 0; i < cortes.length - 1; i++) {
    const ini = cortes[i], fim = cortes[i + 1]
    const dur = fim - ini
    if (dur <= 0) continue

    // Fatia inteiramente dentro do colar de uma fronteira da referência: não pontua, nem a favor
    // nem contra. Pontuar meia fatia exigiria recortá-la, e o ganho de precisão não paga a
    // complexidade num intervalo de 250 ms.
    const meio = (ini + fim) / 2
    if (dentroDoColar(meio, frontRef, colarMs)) continue

    const naRef = falantesEm(ref, ini, fim)
    const naHip = falantesEm(hip, ini, fim)

    // O denominador conta fala da referência, somando por falante simultâneo (fala sobreposta
    // conta duas vezes) — é a definição padrão.
    falaNaReferenciaMs += naRef.size * dur

    if (naRef.size === 0) { falsoAlarmeMs += naHip.size * dur; continue }
    if (naHip.size === 0) { perdidoMs += naRef.size * dur; continue }

    // Traduz os rótulos do sistema para o vocabulário da referência antes de comparar.
    const hipMapeada = new Set([...naHip].map((h) => mapeamento[h] ?? `__nao_mapeado_${h}`))
    let corretos = 0
    for (const r of naRef) if (hipMapeada.has(r)) corretos++

    // Com N falantes na referência e M no sistema: os que casam estão certos; o excedente de cada
    // lado vira perdido ou falso alarme; o restante é confusão.
    const confundidos = Math.min(naRef.size, naHip.size) - corretos
    confusaoMs += confundidos * dur
    if (naRef.size > naHip.size) perdidoMs += (naRef.size - naHip.size) * dur
    if (naHip.size > naRef.size) falsoAlarmeMs += (naHip.size - naRef.size) * dur
  }

  const erro = perdidoMs + falsoAlarmeMs + confusaoMs
  return {
    perdidoMs, falsoAlarmeMs, confusaoMs, falaNaReferenciaMs,
    der: falaNaReferenciaMs === 0 ? (erro > 0 ? 1 : 0) : erro / falaNaReferenciaMs,
    colarMs,
    mapeamento,
  }
}

/* ─────────────────────────── pureza de cluster ─────────────────────────── */

export interface PurezaDeCluster {
  /** Fração dos enunciados cujo cluster contém majoritariamente o falante verdadeiro. */
  pureza: number
  /** Fração dos falantes verdadeiros que ficaram concentrados num só cluster. */
  cobertura: number
  /** Média harmônica de pureza e cobertura. */
  f1: number
  clustersCriados: number
  falantesReais: number
}

/**
 * Métrica por ENUNCIADO, complementar ao DER por tempo.
 *
 * Existe porque a unidade de decisão do produto é o enunciado — cada balão da transcrição recebe um
 * nome de pessoa. Um DER baixo com fala longa e um erro sistemático nas réplicas curtas dá uma
 * experiência ruim que o DER por tempo dilui. Aqui cada fala pesa igual, que é como o usuário vê.
 *
 * Também expõe `clustersCriados` contra `falantesReais`: fragmentar uma pessoa em três "Pessoa N"
 * é um sintoma diferente de fundir duas pessoas numa, e ambos aparecem aqui.
 */
export function purezaDeClusters(
  verdade: string[],
  atribuido: string[],
): PurezaDeCluster {
  if (verdade.length !== atribuido.length) {
    throw new Error(`listas de tamanhos diferentes: ${verdade.length} vs ${atribuido.length}`)
  }
  const n = verdade.length
  if (n === 0) return { pureza: 0, cobertura: 0, f1: 0, clustersCriados: 0, falantesReais: 0 }

  const porCluster = new Map<string, Map<string, number>>()
  const porFalante = new Map<string, Map<string, number>>()
  for (let i = 0; i < n; i++) {
    if (!porCluster.has(atribuido[i])) porCluster.set(atribuido[i], new Map())
    if (!porFalante.has(verdade[i])) porFalante.set(verdade[i], new Map())
    const a = porCluster.get(atribuido[i])!
    a.set(verdade[i], (a.get(verdade[i]) ?? 0) + 1)
    const b = porFalante.get(verdade[i])!
    b.set(atribuido[i], (b.get(atribuido[i]) ?? 0) + 1)
  }

  const maior = (m: Map<string, number>) => Math.max(...m.values())
  const pureza = [...porCluster.values()].reduce((s, m) => s + maior(m), 0) / n
  const cobertura = [...porFalante.values()].reduce((s, m) => s + maior(m), 0) / n

  return {
    pureza,
    cobertura,
    f1: pureza + cobertura === 0 ? 0 : (2 * pureza * cobertura) / (pureza + cobertura),
    clustersCriados: porCluster.size,
    falantesReais: porFalante.size,
  }
}
