/**
 * A DESCOBERTA DOS AVATARES NO INTÉRPRETE (puro: sem React, sem rede, sem DOM). Decide o que o atalho "Soletrar nomes"
 * da barra mostra e o que ele oferece quando não dá para soletrar. Nada aqui é recompensa: acessibilidade é de todos.
 */
import type { MotivoDoPainel, SuporteDoInterprete } from './sinais/soletracaoDoInterprete';

/** Motivos que se resolvem trocando o avatar (o modelo não serve para soletrar). */
export const MOTIVOS_DE_OUTRO_AVATAR: readonly MotivoDoPainel[] = [
  'sem_dedos',
  'sem_braco',
  'sem_ossos_reconheciveis',
  'maos_minusculas',
];

/** O que o atalho oferece ao explicar por que não dá para soletrar. */
export type SaidaDoAtalho = 'outro_avatar' | 'mostrar_interprete' | 'nenhuma';

export type AtalhoDeSoletrar =
  | { tipo: 'oculto' }
  | { tipo: 'verificando' }
  | { tipo: 'pronto'; ligado: boolean }
  | { tipo: 'indisponivel'; motivo: MotivoDoPainel; saida: SaidaDoAtalho };

export function atalhoDeSoletrar({
  sinaisLigada,
  soletrar,
  suporte,
}: {
  /** A flag `avatar_sinais` (com `avatar_3d`, que é quem cria o botão). */
  sinaisLigada: boolean;
  /** A preferência da pessoa. */
  soletrar: boolean;
  suporte: SuporteDoInterprete;
}): AtalhoDeSoletrar {
  if (!sinaisLigada) return { tipo: 'oculto' };
  if (suporte.estado === 'verificando') return { tipo: 'verificando' };
  if (suporte.estado === 'sim') return { tipo: 'pronto', ligado: soletrar };
  const { motivo } = suporte;
  const saida: SaidaDoAtalho = MOTIVOS_DE_OUTRO_AVATAR.includes(motivo)
    ? 'outro_avatar'
    : motivo === 'sem_interprete'
      ? 'mostrar_interprete'
      : 'nenhuma';
  return { tipo: 'indisponivel', motivo, saida };
}

/** O atalho discreto "Seu avatar" no Início: só com a flag `avatar_3d` e enquanto a pessoa não o dispensou. */
export function mostrarAtalhoDoInicio({ flag, dispensado }: { flag: boolean; dispensado: boolean }): boolean {
  return flag && !dispensado;
}

/** O cartão "Crie seu avatar" do Perfil: só sem avatar salvo, sem ter sido dispensado e com a flag `avatar_3d`. */
export function convidarParaCriarAvatar({
  flag,
  temAvatar,
  dispensado,
}: {
  flag: boolean;
  temAvatar: boolean;
  dispensado: boolean;
}): boolean {
  return flag && !temAvatar && !dispensado;
}
