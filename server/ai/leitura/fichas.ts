/**
 * O QUE O SERVIDOR DO PARCEIRO SABE DOS LIVROS DO CATÁLOGO: o título, a autoria e a classificação (do
 * `public/catalogo/livros.json`, o mesmo que a vitrine lê) e a FICHA sem spoiler (`src/data/livros/fichasDoParceiro.json`,
 * que `scripts/livros/gerar-fichas.mjs` monta junto com as fichas públicas).
 *
 * POR QUE NO SERVIDOR, e não do corpo: o cliente diz só o id. O título, a autoria e a ficha que vão ao prompt (e à
 * chave do cache compartilhado) são os NOSSOS, e a classificação decide se um menor pode pedir sobre aquele livro.
 *
 * EMPACOTADOS (o molde de `server/lib/niveisDaTrilha.ts`): o servidor sai do esbuild (Node e Worker), e ler do disco
 * exigiria resolver caminho em cada ambiente. O catálogo inteiro é ~370 KB; as fichas no formato do servidor não levam
 * vocabulário, perguntas nem spoilers.
 */
import catalogoBruto from '../../../public/catalogo/livros.json'
import { ehClassificacao } from '../../../src/core/livros/catalogo'
import {
  type FichaDoLivro,
  type ItemComNome,
  type ItemDaFicha,
  LIMITES_DA_FICHA,
  temCitacaoLonga,
  VERSAO_DA_FICHA,
} from '../../../src/core/livros/ficha'
import type { Classificacao } from '../../../src/core/livros/tipos'
import fichasBrutas from '../../../src/data/livros/fichasDoParceiro.json'

export interface LivroParaOParceiro {
  id: string
  titulo: string
  autoria: string
  idioma: string
  classificacao: Classificacao | null
}

let livros: Map<string, LivroParaOParceiro> | null = null
let fichas: Map<string, FichaDoLivro> | null = null

function montarLivros(): Map<string, LivroParaOParceiro> {
  const m = new Map<string, LivroParaOParceiro>()
  const lista = (catalogoBruto as unknown as { livros?: unknown[] }).livros ?? []
  for (const bruto of lista) {
    const l = bruto as {
      id?: unknown
      titulo?: unknown
      autores?: { nome?: unknown }[]
      idioma?: unknown
      classificacao?: unknown
    }
    if (typeof l.id !== 'string' || typeof l.titulo !== 'string') continue
    m.set(l.id, {
      id: l.id,
      titulo: l.titulo,
      autoria:
        (l.autores ?? [])
          .map((a) => String(a.nome ?? ''))
          .filter(Boolean)
          .join(', ') || 'autoria desconhecida',
      idioma: typeof l.idioma === 'string' ? l.idioma : '',
      /* Valor fora da lista vale como "a revisar" (`null`), que menor não vê — a mesma falha fechada da vitrine. */
      classificacao: ehClassificacao(l.classificacao) ? l.classificacao : null,
    })
  }
  return m
}

/**
 * As fichas no formato do servidor: sem spoiler, sem vocabulário e sem perguntas — por isso NÃO passam pelos mínimos
 * de `validarFicha` (que são da ficha pública). Aqui só se confere a forma de cada item; o que não tiver a forma sai.
 */
function montarFichas(): Map<string, FichaDoLivro> {
  const m = new Map<string, FichaDoLivro>()
  const todas = (fichasBrutas as unknown as { fichas?: Record<string, Partial<FichaDoLivro>> }).fichas ?? {}
  const itens = <T extends ItemDaFicha>(v: unknown): T[] =>
    (Array.isArray(v) ? v : []).filter(
      (i): i is T =>
        !!i &&
        typeof i.texto === 'string' &&
        i.texto.length <= LIMITES_DA_FICHA.caracteresDoTexto &&
        typeof i.spoiler === 'boolean' &&
        typeof i.sensivel === 'boolean' &&
        !temCitacaoLonga(i.texto),
    )
  for (const [id, f] of Object.entries(todas)) {
    if (f?.versao !== VERSAO_DA_FICHA || f.livroId !== id || typeof f.titulo !== 'string') continue
    m.set(id, {
      ...(f as FichaDoLivro),
      autorEContexto: itens(f.autorEContexto),
      porQueImporta: itens(f.porQueImporta),
      temas: itens<ItemComNome>(f.temas).filter((i) => typeof i.nome === 'string'),
      personagens: itens<ItemComNome>(f.personagens).filter((i) => typeof i.nome === 'string'),
      curiosidades: itens(f.curiosidades),
      notasDeEpoca: itens(f.notasDeEpoca),
      vocabulario: [],
      perguntas: [],
      leiaTambem: [],
    })
  }
  return m
}

/**
 * SÓ PARA TESTES: troca o catálogo e as fichas por outros (o publicado ainda não tem classificação aprovada, e as
 * fichas mudam a cada geração). `null` volta ao empacotado.
 */
export function trocarCatalogoParaTeste(
  l: readonly LivroParaOParceiro[] | null,
  f?: Readonly<Record<string, FichaDoLivro>> | null,
): void {
  livros = l ? new Map(l.map((x) => [x.id, x])) : null
  fichas = f ? new Map(Object.entries(f)) : null
}

/** O livro do catálogo pelo id, ou `null` (fora do catálogo). */
export function livroDoCatalogo(id: string): LivroParaOParceiro | null {
  livros ??= montarLivros()
  return livros.get(id) ?? null
}

/** A ficha do livro (sem spoiler), ou `null` quando o livro ainda não tem ficha. */
export function fichaDoServidor(id: string): FichaDoLivro | null {
  fichas ??= montarFichas()
  return fichas.get(id) ?? null
}
