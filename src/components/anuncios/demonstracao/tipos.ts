import type { LucideIcon } from 'lucide-react';

/** Um anunciante DE MENTIRA do protótipo (`MARCAS`, `anuncios.js:57-64`). Nenhum existe. */
export interface MarcaDeExemplo {
  nome: string;
  icone: LucideIcon;
  cor: string;
  titulo: string;
  texto: string;
  acao: string;
}

export interface PremioDeExemplo {
  /** "ganhar +10 Seeds": completa a pergunta da folha. */
  frase: string;
  /** "+10 Seeds": o que o rodapé do anúncio promete. */
  premio: string;
  marca: MarcaDeExemplo;
}

/** Premiados por dia (`LIMITE_PREMIADOS`, `anuncios.js:21`). Na demonstração só enfeita a nota da folha. */
export const LIMITE_DE_PREMIADOS = 5;
