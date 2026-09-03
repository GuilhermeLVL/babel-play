/// <reference types="vite/client" />

/**
 * A INTERFACE EM OUTRO IDIOMA.
 *
 * A CHAVE É O TEXTO PORTUGUÊS, e essa é a decisão que torna o trabalho possível. O app tem alguns
 * milhares de strings escritas direto no JSX; um catálogo de chaves simbólicas (`play.memory.title`)
 * exigiria batizar cada uma, manter o arquivo português em paralelo e revisar tudo de uma vez,
 * porque uma chave errada não aparece em teste — aparece como texto faltando na tela. Com o
 * português como chave:
 *
 *  · migrar é mecânico e reversível — envolver a string em `t(...)`, sem inventar nome;
 *  · o fallback é o próprio português, então uma tradução ausente NUNCA deixa a tela vazia;
 *  · a migração é incremental de verdade: uma tela traduzida convive com dez não traduzidas.
 *
 * O custo é conhecido e aceito: mudar o texto português troca a chave, e a tradução daquela frase
 * volta ao português até alguém atualizar o catálogo. `scripts/i18n/orfas.mjs` lista essas chaves.
 *
 * SEM BIBLIOTECA. i18next resolveria o mesmo com ~40 kB gzip, detecção, plural CLDR e namespaces —
 * nada disso é necessário aqui: um idioma por vez, plural de duas formas, e o catálogo já viaja
 * pelo mesmo caminho da trilha (`public/`, sob demanda, cacheado pelo CDN).
 */

export type Catalogo = Record<string, string>

/** Idiomas com catálogo em `public/i18n/`. Português é a origem: não tem arquivo nem precisa. */
export const IDIOMAS_DA_INTERFACE = ['pt', 'en', 'es'] as const

const catalogos = new Map<string, Catalogo>()
let atual = 'pt'

/* Quem está na tela precisa saber que o idioma mudou. `t()` é função pura sobre estado de módulo,
   então nada re-renderiza sozinho: os assinantes são avisados na troca, e `useIdiomaDaInterface`
   (em `useI18n.ts`) liga isso ao React sem um provider a mais na árvore. */
const assinantes = new Set<() => void>()

export function assinarIdioma(aviso: () => void): () => void {
  assinantes.add(aviso)
  return () => assinantes.delete(aviso)
}

const base = (lang: string) => (lang || '').toLowerCase().split('-')[0]

/**
 * Traduz. Sem catálogo carregado, ou sem a frase nele, devolve o próprio português — que é a
 * chave, e por isso é sempre uma resposta legível, nunca `undefined` nem `play.memory.title`.
 *
 * `valores` interpola `{nome}`. Não há sintaxe além disso de propósito: o que a tela precisa é
 * substituir um número ou um nome de idioma, e um mini-motor de expressões dentro da string é
 * dívida disfarçada de recurso.
 */
export function t(texto: string, valores?: Record<string, string | number>): string {
  const traduzido = catalogos.get(atual)?.[texto] ?? texto
  if (!valores) return traduzido
  return traduzido.replace(/\{(\w+)\}/g, (inteiro, chave) =>
    chave in valores ? String(valores[chave]) : inteiro)
}

/**
 * Plural de duas formas — a que português, inglês e espanhol usam.
 *
 * Idiomas com três ou mais formas (russo, polonês, árabe) exigiriam regra CLDR; quando a interface
 * chegar a um deles, esta função é o lugar de resolver, e o `t` acima não muda.
 */
export function tp(n: number, umaCoisa: string, muitasCoisas: string, valores?: Record<string, string | number>): string {
  return t(n === 1 ? umaCoisa : muitasCoisas, { n, ...valores })
}

/** O idioma em que a interface está agora. */
export function idiomaDaInterface(): string {
  return atual
}

/** Registra um catálogo já lido. Mantém o núcleo/teste independentes de rede. */
export function registrarCatalogo(lang: string, catalogo: Catalogo): void {
  catalogos.set(base(lang), catalogo)
}

/**
 * Troca o idioma da interface, baixando o catálogo se preciso.
 *
 * Português não busca nada: é a origem. Idioma sem catálogo também não falha — fica no português,
 * que é o que a pessoa já estava vendo.
 */
export async function usarIdioma(lang: string): Promise<void> {
  const idioma = base(lang)
  const anunciar = () => { for (const a of assinantes) a() }
  if (idioma === 'pt') { atual = 'pt'; anunciar(); return }
  if (!catalogos.has(idioma)) {
    try {
      const r = await fetch(`/i18n/${idioma}.json`)
      if (r.ok) catalogos.set(idioma, (await r.json()) as Catalogo)
    } catch { /* offline: segue em português */ }
  }
  atual = catalogos.has(idioma) ? idioma : 'pt'
  anunciar()
}
