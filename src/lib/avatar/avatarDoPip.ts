/**
 * O QUE O PiP SABE DOS AVATARES DA CONVERSA. O Intérprete (`useAvataresDoInterprete`) PUBLICA aqui o estado dos avatares
 * por DONO (`meu` = a pessoa, `outro` = o intérprete) e a boca da fala; a janela flutuante, que mora em outro lugar da
 * árvore e noutro documento, só LÊ. Nada de React nem de rede: um valor e quem o observa.
 *
 * `ativo: false` (o padrão, e o que fica quando o Intérprete fecha, a flag está desligada ou o modo economia está
 * ligado) significa que o PiP não desenha avatar nenhum e a janela é a de sempre.
 */
import { useSyncExternalStore } from 'react';

import type { EstadoDoAvatar } from '../../core/avatar/estados';
import type { LadoDaConversa } from '../../core/avatar/interprete';
import type { DecisaoDeSoletracao } from '../../core/avatar/sinais/soletracaoDoInterprete';
import type { Lingua } from '../../core/avatar/sinais/tipos';
import type { FonteDaBoca } from './renderer';

/**
 * A soletração ligada no Intérprete (as duas flags, a opção e o modelo com dedos): o PiP mostra os dois avisos fixos e,
 * quando há um nome a soletrar, o avatar das mãos no lugar do círculo. Ausente = o PiP é o de sempre.
 */
export interface SoletracaoNoPip {
  camera: 'corpo' | 'maos';
  decisao: DecisaoDeSoletracao;
  /** A fala em voz agora (`null` = a voz parou). */
  itemId: string | null;
  /** O alfabeto da conversa, quando há um: sem nome a soletrar, o PiP mostra as mãos em repouso. */
  repouso?: { alfabeto: Lingua; espelhar: boolean } | null;
}

export interface AvatarDoPip {
  ativo: boolean;
  estados: Record<LadoDaConversa, EstadoDoAvatar>;
  /** A boca da fala em curso (de quem fala). */
  boca: FonteDaBoca | null;
  soletracao?: SoletracaoNoPip | null;
}

export const SEM_AVATAR_NO_PIP: AvatarDoPip = Object.freeze({
  ativo: false,
  estados: Object.freeze({ meu: 'parado', outro: 'parado' }),
  boca: null,
  soletracao: null,
}) as AvatarDoPip;

let atual: AvatarDoPip = SEM_AVATAR_NO_PIP;
const ouvintes = new Set<() => void>();

function iguais(a: AvatarDoPip, b: AvatarDoPip): boolean {
  return (
    a.ativo === b.ativo &&
    a.boca === b.boca &&
    a.estados.meu === b.estados.meu &&
    a.estados.outro === b.estados.outro &&
    (a.soletracao ?? null) === (b.soletracao ?? null)
  );
}

/** Publica o estado (ou `null` para limpar). Só avisa quando algo mudou. */
export function publicarAvatarDoPip(novo: AvatarDoPip | null): void {
  const proximo = novo ?? SEM_AVATAR_NO_PIP;
  if (iguais(atual, proximo)) return;
  atual = proximo;
  for (const cb of [...ouvintes]) cb();
}

const assinar = (cb: () => void) => {
  ouvintes.add(cb);
  return () => ouvintes.delete(cb);
};

export function useAvatarDoPip(): AvatarDoPip {
  return useSyncExternalStore(
    assinar,
    () => atual,
    () => SEM_AVATAR_NO_PIP,
  );
}
