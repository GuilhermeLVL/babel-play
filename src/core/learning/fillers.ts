/**
 * VÍCIOS DE LINGUAGEM (marcadores de hesitação) — contagem DETERMINÍSTICA, por idioma.
 *
 * POR QUE ISTO EXISTE. A tela de Análise mostrava o cartão "Vícios Identificados" com o valor **8**
 * cravado no JSX e a legenda "Uso excessivo de marcadores discursivos como 'tipo' e 'ah'" — número
 * inventado apresentado como medição. E, três painéis acima, o MESMO indicador dizia "em breve".
 * Contar hesitação não precisa de IA: é busca de token. O que precisa de cuidado é a lista.
 *
 * A LISTA É POR IDIOMA, E ISSO FOI MEDIDO, NÃO SUPOSTO. No banco desta máquina (2.741 falas,
 * 21.222 palavras) a busca cega por `um` deu **172 ocorrências** — mas apenas **1** estava em texto
 * inglês. As outras 171 eram o ARTIGO português. `um` é hesitação em inglês e artigo em português;
 * uma lista única produziria um número sem significado nenhum.
 *
 * AMBÍGUOS FICAM FORA, e o preço de incluí-los foi medido: `like`/`right`/`so` no inglês e
 * `tipo`/`assim`/`sabe` no português inflariam a contagem em **518%** (11 → 68) e **65%** (154 →
 * 254). São palavras de conteúdo legítimo — `like` é verbo, `assim` é advérbio, `sabe` é verbo.
 * Acusar alguém de vício por dizer "eu gosto" é pior que não contar.
 *
 * O que sobra é só o que não pode ser outra coisa: interjeições de hesitação, mais duas locuções
 * ("you know", "i mean", "tipo assim") que só existem como marcador. Medido no mesmo banco:
 * português 8,7 por mil palavras, inglês 3,6 por mil.
 *
 * HONESTIDADE. Sem lista para o idioma, devolve `null` — e a tela diz que não sabe, em vez de
 * mostrar zero, que se leria como elogio. Das 15 línguas presentes no banco, só duas têm lista.
 */

/**
 * Marcadores INEQUÍVOCOS por idioma: nenhum deles é palavra de conteúdo no próprio idioma.
 * Acentuação e caixa são normalizadas na comparação, então basta a forma minúscula.
 */
const MARCADORES: Readonly<Record<string, readonly string[]>> = {
  pt: ['ah', 'ahn', 'ahm', 'hum', 'hmm', 'uhm', 'eh', 'ehh', 'né', 'tipo assim'],
  en: ['uh', 'uhh', 'um', 'umm', 'er', 'erm', 'hmm', 'mmm', 'you know', 'i mean'],
}

export interface ViciosContados {
  /** Total de ocorrências de marcador. */
  total: number
  /** Palavras consideradas — o denominador, para a taxa ser conferível. */
  palavras: number
  /** Ocorrências por mil palavras, 1 casa decimal. Comparável entre gravações de tamanhos diferentes. */
  porMilPalavras: number
  /** Quais marcadores apareceram, do mais frequente ao menos. Só os que apareceram. */
  detalhe: Array<{ marcador: string; vezes: number }>
  /** Qual lista foi usada — a tela mostra, para o número ter procedência. */
  idioma: string
}

/** Idiomas para os quais existe lista. A tela usa para explicar a ausência. */
export function idiomasComVicios(): string[] {
  return Object.keys(MARCADORES)
}

/**
 * Conta marcadores de hesitação em `texto`, usando a lista de `lang`.
 *
 * Devolve `null` quando não há lista para o idioma — ausência de resposta, não zero. Um zero aqui
 * significaria "você não hesitou"; `null` significa "não sei medir isto neste idioma".
 *
 * `lang` aceita tanto `pt` quanto `pt-BR`: só os dois primeiros caracteres importam.
 */
export function contarVicios(texto: string, lang: string | null | undefined): ViciosContados | null {
  const idioma = (lang ?? '').slice(0, 2).toLowerCase()
  const lista = MARCADORES[idioma]
  if (!lista) return null

  const t = (texto ?? '').toLowerCase()
  const palavras = (t.match(/[\p{L}\p{N}']+/gu) ?? []).length

  const detalhe: Array<{ marcador: string; vezes: number }> = []
  let total = 0
  for (const m of lista) {
    /* Fronteira por `\p{L}` e NÃO por `\b`: o `\b` do JavaScript é definido por [A-Za-z0-9_], então
       um acento conta como fronteira de palavra e `/né\b/` casaria dentro de "nébula". É o mesmo
       defeito que `pistaUtil` tinha, achado em quality.ts. */
    const re = new RegExp('(?<!\\p{L})' + escaparRegex(m) + '(?!\\p{L})', 'giu')
    const vezes = (t.match(re) ?? []).length
    if (vezes > 0) { detalhe.push({ marcador: m, vezes }); total += vezes }
  }
  detalhe.sort((a, b) => b.vezes - a.vezes || a.marcador.localeCompare(b.marcador))

  return {
    total,
    palavras,
    porMilPalavras: palavras > 0 ? Math.round((total / palavras) * 1000 * 10) / 10 : 0,
    detalhe,
    idioma,
  }
}

function escaparRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Conta sobre uma lista de falas, agrupando por idioma de cada uma.
 *
 * Existe porque uma gravação é frequentemente MISTA — no banco desta máquina há 15 idiomas, e a
 * mesma sessão pode ter fala em português e em inglês. Somar tudo com uma lista só é exatamente o
 * erro do `um`. Aqui cada fala é contada com a lista do próprio idioma e os totais se somam; o que
 * não tem lista entra em `palavrasSemLista`, que a tela mostra para o total não parecer completo.
 */
export function contarViciosDasFalas(
  falas: ReadonlyArray<{ text: string; lang?: string | null }>,
): { total: number; palavras: number; porMilPalavras: number; detalhe: Array<{ marcador: string; vezes: number }>; idiomas: string[]; palavrasSemLista: number } {
  const somaPorMarcador = new Map<string, number>()
  const idiomas = new Set<string>()
  let total = 0
  let palavras = 0
  let palavrasSemLista = 0

  for (const f of falas) {
    const c = contarVicios(f.text, f.lang)
    if (!c) {
      palavrasSemLista += ((f.text ?? '').toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? []).length
      continue
    }
    idiomas.add(c.idioma)
    total += c.total
    palavras += c.palavras
    for (const d of c.detalhe) somaPorMarcador.set(d.marcador, (somaPorMarcador.get(d.marcador) ?? 0) + d.vezes)
  }

  const detalhe = [...somaPorMarcador.entries()]
    .map(([marcador, vezes]) => ({ marcador, vezes }))
    .sort((a, b) => b.vezes - a.vezes || a.marcador.localeCompare(b.marcador))

  return {
    total,
    palavras,
    porMilPalavras: palavras > 0 ? Math.round((total / palavras) * 1000 * 10) / 10 : 0,
    detalhe,
    idiomas: [...idiomas].sort(),
    palavrasSemLista,
  }
}
