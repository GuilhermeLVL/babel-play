import { estadoDoTeto,TETO_ANONIMO } from '@core'

/**
 * OS AVISOS POR MARCO DE USO — a peça que não existia (mudança porta-de-entrada).
 *
 * O QUE HAVIA ATÉ 01/09: o convite aparecia UMA VEZ por visita (`sessionStorage
 * 'babel.convite_visto'`) e só era disparado por sete padrões de ação que pediam rede — importar,
 * usar IA de nuvem, mexer em credenciais. Depois disso, silêncio. Quem gravou dez sessões e fichou
 * cem palavras sem conta nunca ouviu que ia perder tudo ao trocar de navegador.
 *
 * A REGRA NOVA é a do padrão de 2026, e é a mesma que o Figma usa: pedir a conta **no momento em
 * que a pessoa tem algo a perder**, não na porta. Cada marco dispara UMA vez, é dispensável, e
 * nunca bloqueia o que está acontecendo — quem dispensou já respondeu, e repetir é implicar.
 *
 * Por que a memória é `localStorage` e não `sessionStorage`: um aviso que volta a cada aba nova é
 * a mesma conversa de novo. O que a pessoa dispensou, ficou dispensado.
 */

export type MarcoDeConta = 'segunda-sessao' | 'caderno-quase-cheio' | 'acervo-quase-cheio'

const CHAVE = 'babel.marcos_vistos'

function vistos(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(CHAVE) || '[]') as string[]) } catch { return new Set() }
}

export function marcarVisto(m: MarcoDeConta): void {
  try {
    const s = vistos(); s.add(m)
    localStorage.setItem(CHAVE, JSON.stringify([...s]))
  } catch { /* sem storage: o aviso volta, e é melhor do que sumir */ }
}

export function jaViu(m: MarcoDeConta): boolean {
  return vistos().has(m)
}

export interface AvisoDeConta {
  marco: MarcoDeConta
  titulo: string
  texto: string
}

const TEXTO: Record<MarcoDeConta, AvisoDeConta> = {
  'segunda-sessao': {
    marco: 'segunda-sessao',
    titulo: 'Suas gravações estão só neste navegador',
    texto: 'Limpar o navegador ou trocar de aparelho leva tudo junto. Criar uma conta guarda o que você já fez — e o que está aqui sobe junto.',
  },
  'caderno-quase-cheio': {
    marco: 'caderno-quase-cheio',
    titulo: `Seu caderno está chegando no limite de ${TETO_ANONIMO.palavras} palavras`,
    texto: 'Sem conta, o caderno para aí. Com conta ele deixa de ter teto, e o que você já fichou sobe junto.',
  },
  'acervo-quase-cheio': {
    marco: 'acervo-quase-cheio',
    titulo: `Você está chegando no limite de ${TETO_ANONIMO.sessoes} gravações`,
    texto: 'Sem conta, a próxima não cabe. Com conta não há teto, e estas aqui sobem junto.',
  },
}

/**
 * O QUE AVISAR AGORA — função pura, testável, sem tela.
 *
 * Devolve no máximo um aviso: dois de uma vez viram ruído, e o primeiro da lista é sempre o mais
 * concreto (o teto que está perto vale mais do que o lembrete genérico de guardar).
 */
export function avisoPendente(estado: { sessoes: number; palavras: number; semConta: boolean }): AvisoDeConta | null {
  if (!estado.semConta) return null

  const acervo = estadoDoTeto('sessoes', estado.sessoes)
  if (acervo.perto && !jaViu('acervo-quase-cheio')) return TEXTO['acervo-quase-cheio']

  const caderno = estadoDoTeto('palavras', estado.palavras)
  if (caderno.perto && !jaViu('caderno-quase-cheio')) return TEXTO['caderno-quase-cheio']

  // O mais genérico por último: só fala quando não há nada mais concreto para dizer.
  if (estado.sessoes >= 2 && !jaViu('segunda-sessao')) return TEXTO['segunda-sessao']

  return null
}
