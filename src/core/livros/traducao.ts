/**
 * O TEXTO DIZ QUE É TRADUÇÃO? Procura no começo do livro as fórmulas de crédito de tradução, nos idiomas do
 * catálogo. Serve para a fonte que esqueceu de listar o tradutor: o Gutendex sem `translators`, o EPUB sem `trl`.
 *
 * As fronteiras de palavra são por LETRA Unicode (`\p{L}`, flag `u`), e não `\b`: sem a flag `u`, `\b` só
 * conhece [A-Za-z0-9_], e nunca casa ao lado de "перевод", "翻訳" ou "çeviren".
 */
/** Fórmulas de idiomas com espaço entre palavras: casam com fronteira de letra dos dois lados. */
const COM_FRONTEIRA = [
  'translated\\s+(?:from\\s+[^\\n]{0,60}?)?(?:into\\s+\\p{L}+\\s+)?by',
  'translator',
  'translation\\s+by',
  'traduzid[oa]s?\\s+(?:do\\s+\\p{L}+\\s+)?por',
  'tradução\\s+de',
  'traducción\\s+de',
  'traducid[oa]s?\\s+(?:del?\\s+\\p{L}+\\s+)?por',
  'traduit\\s+(?:de\\s+[^\\n]{0,40}?)?par',
  'traduction\\s+de',
  'übersetzt\\s+von',
  'übersetzung\\s+von',
  'deutsch\\s+von',
  'tradotto\\s+da',
  'traduzione\\s+di',
  'vertaald\\s+door',
  'przełoży\\p{L}*',
  'przekład\\p{L}*',
  'tłumaczy\\p{L}*',
  'перевод\\p{L}*',
  'перевел\\p{L}*',
  'översatt\\s+av',
  'översättning',
  'çeviren',
  'tercüme\\p{L}*',
];

/**
 * Fórmulas de escritas sem espaço entre palavras (chinês, japonês) ou em que a palavra vem colada a prefixo
 * (árabe, hebraico) ou leva marcas combinantes (hindi): aqui a fronteira de letra impediria o acerto.
 */
const SEM_FRONTEIRA = ['ترجم', 'תרגום', 'תרגם', 'अनुवाद', '翻訳', '翻译', '翻譯', '譯者', '译者', '번역'];

export const MARCA_DE_TRADUCAO = new RegExp(
  `(?<![\\p{L}\\p{N}])(?:${COM_FRONTEIRA.join('|')})(?![\\p{L}\\p{N}])|${SEM_FRONTEIRA.join('|')}`,
  'iu',
);

/** Os primeiros 4000 caracteres do texto já limpo trazem uma fórmula de tradução? */
export function textoDizQueETraducao(texto: string): boolean {
  return MARCA_DE_TRADUCAO.test(texto.slice(0, 4000));
}
