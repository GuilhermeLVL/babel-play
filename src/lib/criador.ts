/**
 * QUEM FEZ O APP — a única fonte dos dados do criador.
 *
 * Tudo que a interface mostra sobre o autor (onboarding, tela Sobre) lê daqui. Para atualizar um
 * link, uma chave Pix ou o texto, edita-se UM arquivo — nada espalhado por telas.
 *
 * Placeholders: os campos marcados com `AQUI` ainda não foram preenchidos pelo dono; a interface
 * esconde o que estiver como placeholder em vez de mostrar um link quebrado.
 */

export const CRIADOR = {
  nome: 'Guilherme',
  papel: 'Desenvolvedor independente · Brasil',
  /** Avatar do GitHub — sempre atual, sem arquivo no repositório. */
  foto: 'https://github.com/GuilhermeLVL.png?size=240',
  github: 'https://github.com/GuilhermeLVL',
  portfolio: 'https://full-stack-ai-portfolio.vercel.app/',
  linkedin: 'LINKEDIN_AQUI',
  email: 'EMAIL_AQUI',
  /** Chave Pix para apoio — aparece com botão de copiar na tela Sobre. */
  pix: 'PIX_AQUI',
  /** Onde deixar comentários/sugestões públicas. */
  comentarios: 'https://github.com/GuilhermeLVL/babel-play/discussions',
  issues: 'https://github.com/GuilhermeLVL/babel-play/issues',
} as const;

/** Um campo preenchido de verdade (não placeholder, não vazio)? */
export function preenchido(valor: string): boolean {
  return !!valor && !valor.endsWith('_AQUI') && valor !== 'AQUI';
}
