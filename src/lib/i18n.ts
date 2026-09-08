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

/**
 * O valor de uma chave: a frase pronta, ou as formas de plural do idioma.
 *
 * As categorias são as do CLDR (`Intl.PluralRules`), e cada idioma usa as suas: inglês e português
 * têm `one`/`other`; russo e polonês têm `one`/`few`/`many`; árabe tem seis; japonês, chinês e
 * coreano têm uma só. Quem traduz preenche o que o idioma dele pede — não há forma "errada",
 * há forma ausente, e essa cai no `other`.
 */
export type Plural = Partial<Record<Intl.LDMLPluralRule, string>>
export type Catalogo = Record<string, string | Plural>

/* Gerado por `scripts/i18n/cobertura.mjs` e versionado, no mesmo molde do índice da trilha: medir
   em tempo de execução exigiria baixar todos os catálogos só para montar um seletor. */
import COBERTURA from '../data/i18n/cobertura.json'

/**
 * OS IDIOMAS QUE A INTERFACE OFERECE — derivados da COBERTURA MEDIDA, não escritos à mão.
 *
 * A lista era `['pt', 'en', 'es']` fixa, e `es` tinha 20 de 675 chaves: quem escolhesse espanhol
 * via 3% da tela em espanhol e o resto em português, sem aviso nenhum, porque o fallback por
 * chave-texto é sempre legível (auditoria de 2026-09-07, achado A38). Agora a lista sai de
 * `scripts/i18n/cobertura.mjs`, que mede cada catálogo contra a união das chaves extraídas; um
 * idioma abaixo do piso continua no repositório (dá para traduzir e medir) e fora do seletor.
 */
export const IDIOMAS_DA_INTERFACE: readonly string[] = Object.entries(COBERTURA.idiomas)
  .filter(([, m]) => m.cobertura >= COBERTURA.piso)
  .map(([lang]) => lang)
  .sort((a, b) => (a === 'pt' ? -1 : b === 'pt' ? 1 : a.localeCompare(b)))

/** A cobertura medida de um idioma (0..1). A tela usa para explicar por que um idioma não está lá. */
export function coberturaDaInterface(lang: string): number {
  return COBERTURA.idiomas[base(lang) as keyof typeof COBERTURA.idiomas]?.cobertura ?? 0
}

/**
 * Os idiomas que TÊM catálogo e ainda não chegaram ao piso, com a cobertura de cada um.
 *
 * A tela de Ajustes mostra esta lista em vez de esconder o assunto: "espanhol existe, está em 3%,
 * por isso não está no seletor" é uma resposta; um seletor com dois itens e nenhuma explicação
 * parece a lista inteira do produto.
 */
export function idiomasAbaixoDoPiso(): Array<{ lang: string; cobertura: number }> {
  return Object.entries(COBERTURA.idiomas)
    .filter(([, m]) => m.cobertura < COBERTURA.piso)
    .map(([lang, m]) => ({ lang, cobertura: m.cobertura }))
}


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
/**
 * A frase traduzida, SEM interpolar — a etapa de lookup, isolada.
 *
 * Existe porque `<T>` (texto com formatação no meio) precisa da string crua: interpolar antes
 * transformaria um `ReactNode` em `[object Object]`. `t()` continua sendo lookup + interpolação,
 * e as duas portas leem o mesmo catálogo, na mesma chave.
 */
export function bruto(texto: string): string {
  const v = catalogos.get(atual)?.[texto]
  return typeof v === 'string' ? v : (v?.other ?? texto)
}

/** Idem para plural: escolhe a forma pelo CLDR e devolve sem interpolar. */
export function brutoPlural(n: number, umaCoisa: string, muitasCoisas: string): string {
  const v = catalogos.get(atual)?.[muitasCoisas]
  if (v && typeof v !== 'string') {
    // `other` é a única categoria que todo idioma tem — por isso é o fallback dentro do catálogo.
    return v[regraDePlural(atual).select(n)] ?? v.other ?? muitasCoisas
  }
  if (typeof v === 'string') return v
  return regraDePlural('pt').select(n) === 'one' ? umaCoisa : muitasCoisas
}

export function t(texto: string, valores?: Record<string, string | number>): string {
  return interpolar(bruto(texto), valores)
}

function interpolar(texto: string, valores?: Record<string, string | number>): string {
  if (!valores) return texto
  return texto.replace(/\{(\w+)\}/g, (inteiro, chave) =>
    chave in valores ? String(valores[chave]) : inteiro)
}

/**
 * PLURAL PELO CLDR, não por `n === 1`.
 *
 * "Uma ou muitas" é a regra de português, inglês e espanhol — e de mais ninguém. Russo e polonês
 * pedem três formas (1 / 2-4 / 5+), hebraico três, **árabe seis** (zero, um, dois, poucos, muitos,
 * outro), e japonês, chinês e coreano uma só. Dos dezesseis idiomas que já têm trilha aqui, seis
 * não cabem em duas formas: escrever `n === 1` é escolher errar neles.
 *
 * `Intl.PluralRules` vem do runtime — o CLDR inteiro, sem dependência nem tabela para manter.
 *
 * A chave do catálogo continua sendo o PORTUGUÊS PLURAL (a forma `other`), e o valor traz as
 * formas do idioma de destino. Sem tradução, decide entre as duas frases portuguesas que o código
 * passou, com a regra do português.
 */
export function tp(
  n: number,
  umaCoisa: string,
  muitasCoisas: string,
  valores?: Record<string, string | number>,
): string {
  return interpolar(brutoPlural(n, umaCoisa, muitasCoisas), { n, ...valores })
}

const regras = new Map<string, Intl.PluralRules>()

function regraDePlural(lang: string): Intl.PluralRules {
  let r = regras.get(lang)
  if (!r) {
    try { r = new Intl.PluralRules(lang) } catch { r = new Intl.PluralRules('pt') }
    regras.set(lang, r)
  }
  return r
}

/**
 * Existe tradução DESTA frase no idioma corrente?
 *
 * `t()` devolve a chave portuguesa quando falta tradução, e isso é proposital — mas há um caso em
 * que quem chama precisa saber a diferença: quando existem VÁRIAS redações da mesma frase (as três
 * vozes de `profile.ts`) e só faz sentido escolher entre elas se a redação escolhida estiver de
 * fato traduzida. Sem isto, a escolha era feita por `idiomaDaInterface() === 'pt'` cravado.
 */
export function temTraducao(texto: string): boolean {
  if (atual === 'pt') return true // o português É a chave
  return catalogos.get(atual)?.[texto] !== undefined
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

/* ── O QUE MUDA JUNTO COM O IDIOMA, além das palavras ────────────────────────────────────── */

/**
 * Escritas da direita para a esquerda — FONTE UNICA.
 *
 * Mora aqui, e nao em `languages.ts`, so pela direcao das dependencias: `languages` importa este
 * modulo, o contrario faria ciclo. `direcaoDoTexto` (para o conteudo do usuario) e `ehRTL` (para o
 * layout da interface) respondem perguntas diferentes sobre o mesmo fato, e leem a mesma lista.
 */
const RTL = new Set(['ar', 'he', 'fa', 'ur', 'yi', 'ps', 'sd', 'dv'])

export const ehRTL = (lang: string): boolean => RTL.has(base(lang))

/**
 * Número no idioma da interface.
 *
 * `toLocaleString('pt-BR')` estava cravado em ~50 lugares: um americano lia "2.733" e entendia
 * 2,733 — um erro de três ordens de grandeza numa contagem de palavras, dito com toda a confiança.
 */
export function numero(n: number): string {
  return n.toLocaleString(atual)
}

/** Número com opções (casas decimais, unidade) — mesma regra de locale, controle mais fino. */
export function numeroCom(n: number, opcoes: Intl.NumberFormatOptions): string {
  return n.toLocaleString(atual, opcoes)
}

/** Data no idioma da interface. Mesma razão: 03/09 e 09/03 são dias diferentes. */
export function data(d: Date | string | number, opcoes?: Intl.DateTimeFormatOptions): string {
  return new Date(d).toLocaleDateString(atual, opcoes)
}

export function dataHora(d: Date | string | number, opcoes?: Intl.DateTimeFormatOptions): string {
  return new Date(d).toLocaleString(atual, opcoes)
}

/**
 * Dinheiro. A MOEDA é do preço, não do leitor: um preço em reais continua em reais para quem lê em
 * inglês — o que muda é a forma de escrever o número ("R$ 1.234,50" e "R$1,234.50"). Trocar a moeda
 * pelo locale converteria valor sem taxa de câmbio, que é o erro caro.
 */
export function moeda(valor: number, codigo = 'BRL'): string {
  return valor.toLocaleString(atual, { style: 'currency', currency: codigo })
}

/**
 * "R$ 24,90" — uma formatação só, para o preço não divergir entre telas.
 *
 * Vive AQUI e não em `core/creditos.ts`, onde nasceu: o catálogo de preços é regra de negócio e
 * pertence ao núcleo, mas escrever o preço depende do idioma da interface. O núcleo é isomórfico
 * (`src/core/tsconfig.json`: sem DOM, sem Node), e importar este módulo lá dentro arrastava o
 * `fetch` do carregador de catálogo para dentro da fronteira — `npm run typecheck:core` reprovava.
 * O core entrega os centavos; quem os escreve é a camada que sabe em que idioma a tela está.
 */
export function precoEmReais(centavos: number): string {
  return moeda(Math.round(centavos) / 100, 'BRL')
}
