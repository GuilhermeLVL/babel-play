/**
 * INTERESSES — o vocabulário fechado do que a pessoa gosta.
 *
 * PARA QUE SERVE, concretamente. Este app nasce do que a pessoa captura, e isso o torna bom no que
 * ela já ouve e cego para o resto. Saber que alguém gosta de música e de jogos permite sugerir o
 * que importar, escolher exemplos e ordenar a trilha — em vez de tratar todo mundo como o mesmo
 * usuário médio.
 *
 * POR QUE FECHADO, E NÃO TEXTO LIVRE. Um campo aberto produziria "jogos", "games", "video game",
 * "videogames" e "vídeo-game" como cinco interesses distintos: bonito de preencher e inútil para
 * agrupar, contar ou recomendar. Uma lista fechada é a diferença entre um dado e um comentário.
 *
 * O `slug` é a CHAVE PERSISTIDA (vai para `user_interests.slug`) e nunca muda. O rótulo é de tela e
 * pode ser reescrito à vontade — trocar o texto não invalida o que já está gravado.
 *
 * A lista é curta de propósito. Vinte opções cabem numa tela sem rolagem e são escolhidas em
 * segundos; cem viram um formulário que ninguém termina. Ela cresce quando houver uso que peça,
 * não por antecipação.
 */

export interface Interesse {
  slug: string;
  rotulo: string;
  /** Agrupamento de exibição. Não é persistido — existe para a tela não virar uma parede de chips. */
  grupo: 'cultura' | 'trabalho' | 'vida' | 'estudo';
}

export const INTERESSES: readonly Interesse[] = [
  { slug: 'musica', rotulo: 'Música', grupo: 'cultura' },
  { slug: 'jogos', rotulo: 'Jogos', grupo: 'cultura' },
  { slug: 'filmes-series', rotulo: 'Filmes e séries', grupo: 'cultura' },
  { slug: 'livros', rotulo: 'Livros', grupo: 'cultura' },
  { slug: 'esportes', rotulo: 'Esportes', grupo: 'cultura' },
  { slug: 'humor', rotulo: 'Humor', grupo: 'cultura' },

  { slug: 'tecnologia', rotulo: 'Tecnologia', grupo: 'trabalho' },
  { slug: 'negocios', rotulo: 'Negócios', grupo: 'trabalho' },
  { slug: 'reunioes', rotulo: 'Reuniões de trabalho', grupo: 'trabalho' },
  { slug: 'entrevistas', rotulo: 'Entrevistas de emprego', grupo: 'trabalho' },
  { slug: 'apresentacoes', rotulo: 'Apresentações e palestras', grupo: 'trabalho' },

  { slug: 'viagem', rotulo: 'Viagem', grupo: 'vida' },
  { slug: 'culinaria', rotulo: 'Culinária', grupo: 'vida' },
  { slug: 'saude', rotulo: 'Saúde e bem-estar', grupo: 'vida' },
  { slug: 'familia', rotulo: 'Conversas do dia a dia', grupo: 'vida' },
  { slug: 'noticias', rotulo: 'Notícias e atualidades', grupo: 'vida' },

  { slug: 'academico', rotulo: 'Estudo acadêmico', grupo: 'estudo' },
  { slug: 'provas', rotulo: 'Provas e certificações', grupo: 'estudo' },
  { slug: 'gramatica', rotulo: 'Gramática', grupo: 'estudo' },
  { slug: 'pronuncia', rotulo: 'Pronúncia e sotaque', grupo: 'estudo' },
] as const;

const PORslug = new Map(INTERESSES.map(i => [i.slug, i]));

/** O interesse, ou `undefined` se o slug não existe (dado antigo, cliente adulterado). */
export function interessePorSlug(slug: string): Interesse | undefined {
  return PORslug.get(slug);
}

/**
 * Filtra uma lista de slugs para os que existem, sem duplicatas e na ordem canônica.
 *
 * É a fronteira de confiança: o que vem do cliente passa por aqui antes de virar linha no banco.
 * Devolver a ordem de `INTERESSES` (e não a de entrada) faz duas contas iguais produzirem a mesma
 * lista, o que torna a comparação em teste possível sem ordenar dos dois lados.
 */
export function saneiaInteresses(slugs: readonly string[]): string[] {
  const pedidos = new Set(slugs);
  return INTERESSES.filter(i => pedidos.has(i.slug)).map(i => i.slug);
}

/**
 * TETO DE ESCOLHAS. Vinte interesses marcados não são um perfil — são a ausência de um.
 *
 * O número existe para o dado continuar significando alguma coisa: se tudo interessa, nada
 * distingue, e qualquer recomendação construída sobre isso vira ruído.
 */
export const MAX_INTERESSES = 8;
