/**
 * A FICHA DO LIVRO — o "parceiro de leitura" que já leu o livro e pesquisou sobre ele (L4 de Livros & Leitura).
 *
 * Uma ficha por livro do catálogo PD, gerada UMA vez fora do produto (`scripts/livros/gerar-fichas.mjs`, com as
 * assinaturas das CLIs do dono, sem crédito de API) e publicada como JSON estático em
 * `public/catalogo/fichas/<id>.json`, carregado sob demanda. Grátis para todos: não há custo por leitura.
 *
 * O QUE GARANTE A QUALIDADE (o que este módulo confere, e o que o script faz antes):
 *   - o gerador só escreve fato bem estabelecido e se recusa (`conhecimento: baixo`) quando não conhece a obra;
 *   - uma segunda família de modelo revisa item por item e o que ela marcar como duvidoso SAI da ficha;
 *   - nada de citação inventada: texto entre aspas com mais de `MAX_PALAVRAS_ENTRE_ASPAS` palavras reprova o item
 *     (`temCitacaoLonga`), aqui e no script;
 *   - toda ficha leva o aviso `AVISO_DA_FICHA` ("Gerado por IA, revisado automaticamente").
 *
 * QUEM VÊ O QUÊ (`fichaParaLeitor`, a ÚNICA porta da tela):
 *   - o livro tem de estar visível para quem lê (`visivelPara`, a mesma régua da vitrine): menor não vê ficha de
 *     livro que não pode ver;
 *   - item `spoiler` só com `mostrarSpoilers` (a pessoa pediu), em qualquer idade;
 *   - item `sensivel` (violência, sexo, suicídio, drogas, racismo de época em detalhe) e o aviso de conteúdo só a
 *     partir do teto `IDADE_DO_SENSIVEL` ('16'); abaixo dele, o aviso vira uma linha neutra (`AVISO_NEUTRO`). O
 *     aviso também revela o enredo (a nota da classificação conta o desfecho): sem `mostrarSpoilers`, ele vira
 *     `AVISO_SEM_SPOILER`;
 *   - "leia também" só com livros visíveis para quem lê.
 *
 * Módulo puro: o cliente, o servidor (o prompt do parceiro) e o script leem igual.
 */
import { ehClassificacao, type TetoDeClassificacao, visivelPara } from './catalogo';
import { type Classificacao, CLASSIFICACOES } from './tipos';

export const VERSAO_DA_FICHA = 1;
export const AVISO_DA_FICHA = 'Gerado por IA, revisado automaticamente.';
/** O teto de quem lê a partir do qual o que é sensível aparece (e o aviso de conteúdo inteiro). */
export const IDADE_DO_SENSIVEL: TetoDeClassificacao = '16';
export const AVISO_NEUTRO = 'Este livro trata de temas que pedem conversa com um adulto de confiança.';
/** O aviso de conteúdo costuma contar o desfecho ("o suicídio do fim"): sem `mostrarSpoilers`, só esta linha. */
export const AVISO_SEM_SPOILER = 'Este livro tem conteúdo sensível. Os detalhes podem revelar o enredo.';
/** Aspas com mais palavras que isto são citação, e citação a ficha não tem (ninguém conferiu o texto). */
export const MAX_PALAVRAS_ENTRE_ASPAS = 6;

/** Os tetos de quantidade e tamanho. O mínimo vale DEPOIS da revisão: ficha que caiu abaixo dele não é publicada. */
export const LIMITES_DA_FICHA = {
  autorEContexto: { min: 3, max: 8 },
  porQueImporta: { min: 1, max: 4 },
  temas: { min: 2, max: 6 },
  personagens: { min: 0, max: 10 },
  curiosidades: { min: 4, max: 12 },
  vocabulario: { min: 0, max: 14 },
  notasDeEpoca: { min: 0, max: 6 },
  perguntas: { min: 4, max: 10 },
  leiaTambem: { min: 0, max: 4 },
  caracteresDoTexto: 600,
  caracteresDoNome: 80,
} as const;

/** Um item da ficha: uma frase (ou parágrafo curto) e as duas marcas que decidem quem o vê. */
export interface ItemDaFicha {
  texto: string;
  spoiler: boolean;
  sensivel: boolean;
}
export interface ItemComNome extends ItemDaFicha {
  nome: string;
}
export interface TermoDaFicha extends ItemDaFicha {
  /** O termo NO IDIOMA DO LIVRO (a palavra de época, o arcaísmo). `texto` explica em português. */
  termo: string;
}
export interface PerguntaDaFicha extends ItemDaFicha {
  /** A mesma pergunta no idioma do livro ('' quando o livro é em português). */
  noIdiomaDoLivro: string;
}
export interface LeiaTambem {
  /** Id de um livro DO CATÁLOGO (nunca outro). */
  id: string;
  motivo: string;
}
export interface AvisoDeConteudo {
  /** A faixa da proposta de classificação (`docs/livros-classificacao-sugestoes.md`), ou `null` (a revisar). */
  classificacaoSugerida: Classificacao | null;
  /** O porquê da faixa (a mesma nota da proposta). */
  nota: string;
  /** O conteúdo sensível de época anotado na proposta ('' = nada anotado). */
  sensivel: string;
}

export interface FichaDoLivro {
  versao: typeof VERSAO_DA_FICHA;
  livroId: string;
  titulo: string;
  idioma: string;
  /** AAAA-MM-DD. */
  geradaEm: string;
  procedencia: {
    geradoPor: string;
    revisadoPor: string;
    aviso: typeof AVISO_DA_FICHA;
    /** Quantos itens a revisão tirou (o que ela achou duvidoso). */
    removidosNaRevisao: number;
  };
  autorEContexto: ItemDaFicha[];
  porQueImporta: ItemDaFicha[];
  temas: ItemComNome[];
  personagens: ItemComNome[];
  curiosidades: ItemDaFicha[];
  vocabulario: TermoDaFicha[];
  notasDeEpoca: ItemDaFicha[];
  perguntas: PerguntaDaFicha[];
  leiaTambem: LeiaTambem[];
  avisoDeConteudo: AvisoDeConteudo | null;
}

/** As seções de itens, na ordem da tela (o script e o validador percorrem a mesma lista). */
export const SECOES_DE_ITENS = [
  'autorEContexto',
  'porQueImporta',
  'temas',
  'personagens',
  'curiosidades',
  'vocabulario',
  'notasDeEpoca',
  'perguntas',
] as const;
export type SecaoDeItens = (typeof SECOES_DE_ITENS)[number];

const ASPAS = /["“”«»„]([^"“”«»„]{1,400})["“”«»„]/g;

/** O texto tem trecho entre aspas longo demais para ser título ou termo (é citação)? */
export function temCitacaoLonga(texto: string): boolean {
  for (const m of texto.matchAll(ASPAS)) {
    const palavras = m[1].trim().split(/\s+/).filter(Boolean).length;
    if (palavras > MAX_PALAVRAS_ENTRE_ASPAS) return true;
  }
  return false;
}

const ehTexto = (v: unknown, max: number): v is string =>
  typeof v === 'string' && v.trim().length > 0 && v.length <= max;

function erroDoItem(secao: SecaoDeItens, i: number, item: unknown): string | null {
  const onde = `${secao}[${i}]`;
  if (!item || typeof item !== 'object') return `${onde}: não é objeto`;
  const o = item as Record<string, unknown>;
  if (!ehTexto(o.texto, LIMITES_DA_FICHA.caracteresDoTexto)) return `${onde}: texto vazio ou longo demais`;
  if (typeof o.spoiler !== 'boolean' || typeof o.sensivel !== 'boolean') return `${onde}: spoiler/sensivel`;
  if (temCitacaoLonga(o.texto)) return `${onde}: citação entre aspas`;
  if ((secao === 'temas' || secao === 'personagens') && !ehTexto(o.nome, LIMITES_DA_FICHA.caracteresDoNome))
    return `${onde}: nome`;
  if (secao === 'vocabulario' && !ehTexto(o.termo, LIMITES_DA_FICHA.caracteresDoNome)) return `${onde}: termo`;
  if (secao === 'perguntas') {
    if (typeof o.noIdiomaDoLivro !== 'string' || o.noIdiomaDoLivro.length > LIMITES_DA_FICHA.caracteresDoTexto)
      return `${onde}: noIdiomaDoLivro`;
    if (temCitacaoLonga(o.noIdiomaDoLivro)) return `${onde}: citação entre aspas`;
  }
  return null;
}

export type ResultadoDaValidacao = { ok: true; ficha: FichaDoLivro } | { ok: false; erros: string[] };

/**
 * Confere a forma da ficha inteira. `idsDoCatalogo` (quando dado) cobra que o "leia também" só aponte para livros
 * do catálogo e nunca para o próprio. Não conserta nada: o script conserta antes de gravar, e a tela recusa o que
 * vier fora daqui.
 */
export function validarFicha(bruto: unknown, idsDoCatalogo?: ReadonlySet<string>): ResultadoDaValidacao {
  const erros: string[] = [];
  const f = bruto as Partial<FichaDoLivro> | null;
  if (!f || typeof f !== 'object') return { ok: false, erros: ['não é objeto'] };
  if (f.versao !== VERSAO_DA_FICHA) erros.push('versao');
  if (!ehTexto(f.livroId, 200)) erros.push('livroId');
  if (!ehTexto(f.titulo, 300)) erros.push('titulo');
  if (!ehTexto(f.idioma, 12)) erros.push('idioma');
  if (typeof f.geradaEm !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(f.geradaEm)) erros.push('geradaEm');
  const p = f.procedencia;
  if (
    !p ||
    p.aviso !== AVISO_DA_FICHA ||
    !ehTexto(p.geradoPor, 80) ||
    !ehTexto(p.revisadoPor, 80) ||
    !Number.isInteger(p.removidosNaRevisao) ||
    p.removidosNaRevisao < 0
  )
    erros.push('procedencia');
  for (const secao of SECOES_DE_ITENS) {
    const lista = (f as Record<string, unknown>)[secao];
    const { min, max } = LIMITES_DA_FICHA[secao];
    if (!Array.isArray(lista)) {
      erros.push(`${secao}: não é lista`);
      continue;
    }
    if (lista.length < min || lista.length > max) erros.push(`${secao}: ${lista.length} itens (${min}–${max})`);
    lista.forEach((item, i) => {
      const e = erroDoItem(secao, i, item);
      if (e) erros.push(e);
    });
  }
  if (!Array.isArray(f.leiaTambem) || f.leiaTambem.length > LIMITES_DA_FICHA.leiaTambem.max) erros.push('leiaTambem');
  else
    for (const l of f.leiaTambem) {
      if (!l || !ehTexto(l.id, 200) || !ehTexto(l.motivo, LIMITES_DA_FICHA.caracteresDoTexto) || l.id === f.livroId)
        erros.push('leiaTambem: item');
      else if (idsDoCatalogo && !idsDoCatalogo.has(l.id)) erros.push(`leiaTambem: ${l.id} fora do catálogo`);
    }
  const a = f.avisoDeConteudo;
  if (a !== null) {
    if (
      !a ||
      (a.classificacaoSugerida !== null && !ehClassificacao(a.classificacaoSugerida)) ||
      typeof a.nota !== 'string' ||
      typeof a.sensivel !== 'string' ||
      a.nota.length > 1000 ||
      a.sensivel.length > 1000
    )
      erros.push('avisoDeConteudo');
  }
  return erros.length ? { ok: false, erros } : { ok: true, ficha: f as FichaDoLivro };
}

/** O teto de quem lê alcança o que é sensível? */
export function veSensivel(teto: TetoDeClassificacao): boolean {
  if (!ehClassificacao(teto)) return false;
  return CLASSIFICACOES.indexOf(teto) >= CLASSIFICACOES.indexOf(IDADE_DO_SENSIVEL);
}

export interface OpcoesDoLeitor {
  /** O teto de classificação de quem lê (`tetoDoLeitor` no cliente; `tetoPelaFaixa` no servidor). */
  teto: TetoDeClassificacao;
  /** A pessoa pediu para ver o que revela o enredo. */
  mostrarSpoilers: boolean;
  /** O livro do "leia também" é visível para quem lê? Sem ela, o "leia também" sai vazio (falha fechada). */
  livroVisivel?: (id: string) => boolean;
}

/** A ficha como ESTA pessoa a vê, ou `null` quando ela não pode ver o livro. Ver o topo do arquivo. */
export function fichaParaLeitor(
  ficha: FichaDoLivro,
  livro: { classificacao?: unknown },
  o: OpcoesDoLeitor,
): FichaDoLivro | null {
  if (!visivelPara(livro, o.teto)) return null;
  const sensivel = veSensivel(o.teto);
  const passa = (i: ItemDaFicha) => (o.mostrarSpoilers || !i.spoiler) && (sensivel || !i.sensivel);
  const aviso = ficha.avisoDeConteudo;
  const temAviso = !!aviso && !!(aviso.sensivel || aviso.nota);
  const linhaDoAviso = !sensivel ? AVISO_NEUTRO : !o.mostrarSpoilers ? AVISO_SEM_SPOILER : null;
  return {
    ...ficha,
    autorEContexto: ficha.autorEContexto.filter(passa),
    porQueImporta: ficha.porQueImporta.filter(passa),
    temas: ficha.temas.filter(passa),
    personagens: ficha.personagens.filter(passa),
    curiosidades: ficha.curiosidades.filter(passa),
    vocabulario: ficha.vocabulario.filter(passa),
    notasDeEpoca: ficha.notasDeEpoca.filter(passa),
    perguntas: ficha.perguntas.filter(passa),
    leiaTambem: o.livroVisivel ? ficha.leiaTambem.filter((l) => o.livroVisivel?.(l.id) === true) : [],
    avisoDeConteudo:
      aviso && temAviso && linhaDoAviso
        ? { classificacaoSugerida: aviso.classificacaoSugerida, nota: linhaDoAviso, sensivel: '' }
        : aviso,
  };
}

/**
 * O teto de classificação pela FAIXA ETÁRIA do servidor (`server/lib/idade.ts`) — a mesma régua de
 * `src/lib/livros/quemLe.ts` no cliente: idade desconhecida (perfil protegido) fica em '12', o público mínimo.
 */
export function tetoPelaFaixa(faixa: 'menor-12' | '12-15' | '16-17' | 'adulto' | null): TetoDeClassificacao {
  if (faixa === 'adulto') return '18';
  if (faixa === '16-17') return '16';
  if (faixa === 'menor-12') return 'livre';
  return '12';
}

/**
 * O que o PARCEIRO DE LEITURA (a IA paga) recebe da ficha: só o que não revela o enredo (o servidor não sabe onde a
 * pessoa está no livro) e, para quem não alcança o sensível, sem ele. Cada linha é `<seção>: <texto>`, com teto de
 * caracteres no total.
 */
export function fichaParaOPrompt(ficha: FichaDoLivro, teto: TetoDeClassificacao, maxCaracteres: number): string {
  const sensivel = veSensivel(teto);
  const linhas: string[] = [];
  const rotulos: Partial<Record<SecaoDeItens, string>> = {
    autorEContexto: 'contexto',
    porQueImporta: 'importancia',
    temas: 'tema',
    personagens: 'personagem',
    curiosidades: 'curiosidade',
    notasDeEpoca: 'epoca',
  };
  for (const [secao, rotulo] of Object.entries(rotulos) as [SecaoDeItens, string][]) {
    for (const item of ficha[secao] as ItemDaFicha[]) {
      if (item.spoiler || (!sensivel && item.sensivel)) continue;
      const nome = 'nome' in item ? `${String((item as ItemComNome).nome)} — ` : '';
      linhas.push(`${rotulo}: ${nome}${item.texto}`);
    }
  }
  let total = 0;
  const cabem: string[] = [];
  for (const l of linhas) {
    if (total + l.length + 1 > maxCaracteres) break;
    cabem.push(l);
    total += l.length + 1;
  }
  return cabem.join('\n');
}
