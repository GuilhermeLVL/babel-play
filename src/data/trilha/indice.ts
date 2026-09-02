import indiceJson from './indice.json'

/**
 * O ÍNDICE, SEM VITE. Vive separado de `carregar.ts` porque este módulo é alcançado pelo servidor
 * (Node puro, via `@core` → `cefrWordlist`), e `import.meta.glob` não existe fora do Vite: um glob
 * aqui derruba o servidor no import, antes de qualquer rota.
 */
export interface EntradaDoIndice {
  escala: 'cefr' | 'frequencia'
  versao: number
  total: number
  comFrase: number
  porNivel: Record<string, number>
  glosas: string[]
}

export type Indice = Record<string, EntradaDoIndice>

export const baseDoIdioma = (lang: string): string => (lang || '').toLowerCase().split('-')[0]

export function indiceDaTrilha(): Indice {
  return indiceJson as unknown as Indice
}
