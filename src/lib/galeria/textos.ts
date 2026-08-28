/**
 * GLOSSÁRIO DOS ESTADOS DE UM ITEM — um texto por estado, lido por todos os botões e selos.
 *
 * Personalizar v3 (2026-08-28): a Loja dizia "Liberado · usar no Visual", o editor dizia
 * "Obter · 50", o modal ia dizer outra coisa. Aqui mora a única redação; quem mostra um item lê daqui.
 */
export const TEXTOS = {
  liberado: 'Liberado',
  emUso: 'Em uso',
  equipar: 'Equipar',
  equiparAgora: 'Equipar agora',
  obter: (seeds: number) => `Obter · ${seeds} Seeds`,
  nivel: (n: number) => `Nível ${n}`,
  conquista: (nome: string) => `Conquista: ${nome}`,
  nivelOuSeeds: (n: number, seeds: number) => `Nível ${n} ou ${seeds} Seeds`,
  proximaRecompensa: 'Próxima recompensa',
  faltamXp: (xp: number) => `faltam ${xp} XP`,
  verTudoQueVem: 'Ver tudo que vem',
  resgatarEContinuar: 'Resgatar tudo e continuar',
  verEmPersonalizar: 'Ver em Personalizar',
} as const
