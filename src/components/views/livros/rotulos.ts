/** Os nomes que a tela Livros mostra para os códigos do catálogo (todos por `t()`). */
import type { Tamanho } from '../../../core/livros/catalogo';
import type { CategoriaDoLivro, Classificacao, FonteDoLivro, MotivoDeExclusao } from '../../../core/livros/tipos';
import { t } from '../../../lib/i18n';
import { langLabelNaUI } from '../../../lib/languages';

export function rotuloDaCategoria(c: CategoriaDoLivro): string {
  switch (c) {
    case 'classicos':
      return t('Clássicos mais lidos');
    case 'aventura':
      return t('Aventura');
    case 'contos':
      return t('Contos');
    case 'misterio':
      return t('Mistério e suspense');
    case 'poesia':
      return t('Poesia');
    case 'teatro':
      return t('Teatro');
    case 'infantojuvenil':
      return t('Infantojuvenil');
    case 'didaticos':
      return t('Não ficção');
    case 'simples':
      return t('Leituras simples');
    case 'enem':
      return t('Vestibular e ENEM');
  }
}

export function rotuloDaFonte(f: FonteDoLivro): string {
  switch (f) {
    case 'standard-ebooks':
      return 'Standard Ebooks';
    case 'wikisource':
      return 'Wikisource';
    case 'gutenberg-curado':
      return 'Project Gutenberg';
    case 'internet-archive-aberto':
      return 'Internet Archive';
  }
}

export function rotuloDoTamanho(tm: Tamanho): string {
  switch (tm) {
    case 'curto':
      return t('Curto');
    case 'medio':
      return t('Médio');
    case 'longo':
      return t('Longo');
  }
}

export function rotuloDaClassificacao(c: Classificacao | null): string {
  if (c === null) return t('Classificação a revisar');
  if (c === 'livre') return t('Livre para todas as idades');
  return t('A partir de {n} anos', { n: c });
}

export function rotuloDoMotivo(m: MotivoDeExclusao): string {
  switch (m) {
    case 'autor-protegido':
      return t('O autor morreu há menos de 70 anos');
    case 'autor-sem-ano-de-morte':
      return t('Não sabemos o ano de morte do autor');
    case 'sem-autor':
      return t('A obra não tem autor identificado');
    case 'tradutor-protegido':
      return t('O tradutor morreu há menos de 70 anos');
    case 'tradutor-sem-ano-de-morte':
      return t('Não sabemos o ano de morte do tradutor');
    case 'traducao-sem-tradutor':
      return t('É uma tradução sem tradutor identificado');
    case 'fonte-nao-aceita':
      return t('A fonte não está entre as que usamos');
    case 'direitos-declarados-na-fonte':
      return t('A própria fonte diz que a obra tem direitos autorais');
  }
}

/** "Inglês", com maiúscula: é rótulo de opção, não meio de frase. */
export function rotuloDoIdioma(codigo: string): string {
  const nome = langLabelNaUI(codigo);
  return nome.charAt(0).toUpperCase() + nome.slice(1);
}
