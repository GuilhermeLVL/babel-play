import { type ReactNode, useCallback, useMemo, useState } from 'react';

import { ladoDoAvatarDoModo, type ModoDoAvatar, politicaDoAvatarDoModo } from '../../../core/avatar/modos';
import { FLAG_AVATAR_3D } from '../../../core/planos';
import { usePreferenciasDoModo } from '../../../lib/avatar/avatarDoModo';
import { useDicaUmaVez } from '../../../lib/avatar/descoberta';
import { detectarTier, temWebGL2 } from '../../../lib/avatar/detectarTier';
import { usePreferenciasDosAvatares } from '../../../lib/avatar/preferenciasDoInterprete';
import { useFlag } from '../../../lib/flags';
import PainelDoAvatarDoModo from './PainelDoAvatarDoModo';

export const DICA_DO_MODO: Record<ModoDoAvatar, string> = {
  livro: 'frasy.avatar.dica.livro',
  legenda: 'frasy.avatar.dica.legenda',
};

export interface AvatarDoModoControle {
  /** A flag `avatar_3d` está ligada? Falso: nada do avatar existe na tela. */
  disponivel: boolean;
  /** O avatar está na tela agora (flag, ligado e fora do modo economia)? */
  ativo: boolean;
  ligado: boolean;
  dono: 'meu' | 'outro';
  recolhido: boolean;
  noPip: boolean;
  tier: ReturnType<typeof detectarTier>;
  fallback2d: boolean;
  anunciar: boolean;
  /** Lado do círculo em px para esta janela. */
  lado: number;
  /** A dica da primeira vez deve aparecer? */
  dica: { visivel: boolean; dispensar: () => void };
  painelAberto: boolean;
  alternarPainel: () => void;
  /** Liga/desliga em um toque (e tira o modo economia do caminho ao ligar). */
  alternar: () => void;
  ligar: (v: boolean) => void;
  recolher: (v: boolean) => void;
  /** O painel pronto (ou `null` fechado). */
  painel: ReactNode;
}

/**
 * O CONTROLE DO AVATAR DE UM MODO. UM só para o Livro e a Legenda: o mesmo botão, o mesmo painel, a mesma política, a
 * mesma dica. Tudo atrás de `avatar_3d`: sem a flag `disponivel` é falso e a tela é a de antes.
 */
export function useAvatarDoModo(
  modo: ModoDoAvatar,
  o: {
    aoEscolherMeuAvatar?: (() => void) | undefined;
    comPip?: boolean;
    /** Outro avatar 3D já ocupa a página (o teto de tier cai para médio). */
    outrosContextos?: number;
  } = {},
): AvatarDoModoControle {
  const flag = useFlag(FLAG_AVATAR_3D);
  const [prefs, guardar] = usePreferenciasDoModo(modo);
  const [gerais, guardarGerais] = usePreferenciasDosAvatares();
  const medido = useMemo(
    () => (flag ? { tier: detectarTier(), webgl2: temWebGL2() } : { tier: 'fraco' as const, webgl2: true }),
    [flag],
  );
  const dica = useDicaUmaVez(DICA_DO_MODO[modo]);
  const [painelAberto, setPainelAberto] = useState(false);
  const politica = politicaDoAvatarDoModo({
    flag,
    modo: prefs,
    gerais,
    webgl2: medido.webgl2,
    tier: medido.tier,
    outrosContextos: o.outrosContextos ?? 0,
  });
  const ligar = useCallback(
    (v: boolean) => {
      if (v) guardarGerais({ economia: false });
      guardar({ ligado: v });
      dica.dispensar();
      if (!v) setPainelAberto(false);
    },
    [guardar, guardarGerais, dica],
  );
  const alternar = () => ligar(!(prefs.ligado && !gerais.economia));
  const alturaDaJanela = typeof window === 'undefined' ? 800 : window.innerHeight;
  const painel =
    flag && painelAberto ? (
      <PainelDoAvatarDoModo
        modo={modo}
        prefs={prefs}
        gerais={gerais}
        aoMudar={guardar}
        aoMudarGerais={(parcial) => {
          guardarGerais(parcial);
          if (parcial.economia === true) setPainelAberto(false); // sem avatar não há onde o painel ficar
        }}
        aoDesligar={() => ligar(false)}
        aoFechar={() => setPainelAberto(false)}
        aoEscolherMeuAvatar={o.aoEscolherMeuAvatar}
        comPip={o.comPip ?? false}
        sem3d={!medido.webgl2}
      />
    ) : null;
  return {
    disponivel: flag,
    ativo: politica.mostrar,
    ligado: prefs.ligado && !gerais.economia,
    dono: prefs.dono,
    recolhido: prefs.recolhido,
    noPip: prefs.noPip,
    tier: politica.mostrar ? politica.tier : medido.tier,
    fallback2d: politica.fallback2d,
    anunciar: gerais.anunciar,
    lado: ladoDoAvatarDoModo(gerais.tamanho, alturaDaJanela),
    dica: {
      visivel: flag && dica.visivel && !prefs.ligado && !gerais.economia,
      dispensar: dica.dispensar,
    },
    painelAberto,
    alternarPainel: () => setPainelAberto((v) => !v),
    alternar,
    ligar,
    recolher: (v) => guardar({ recolhido: v }),
    painel,
  };
}
