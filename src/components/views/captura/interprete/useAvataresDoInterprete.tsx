import { UserRound } from 'lucide-react';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';

import {
  type EntradaDoEstadoDaConversa,
  estadoDoLadoNaConversa,
  type LadoDaConversa,
  ladoDoAvatarEmPx,
  politicaDosAvatares,
} from '../../../../core/avatar/interprete';
import { FLAG_AVATAR_3D, FLAG_AVATAR_SINAIS } from '../../../../core/planos';
import { publicarAvatarDoPip } from '../../../../lib/avatar/avatarDoPip';
import { destravarComAvatar } from '../../../../lib/avatar/destravarComAvatar';
import { detectarTier, temWebGL2 } from '../../../../lib/avatar/detectarTier';
import { criarPonteDaVoz, type PonteDaVoz, useVozTocando } from '../../../../lib/avatar/ponteDaVoz';
import { usePreferenciasDosAvatares } from '../../../../lib/avatar/preferenciasDoInterprete';
import { useFlag } from '../../../../lib/flags';
import { t } from '../../../../lib/i18n';
import AvatarDaConversa from '../../../avatar/AvatarDaConversa';
import type { AvataresDaConversa } from './ConversaDoPrototipo';
import PainelDosAvatares from './PainelDosAvatares';

export interface AvataresDoInterprete {
  /** Os avatares estão ligados (flag, preferência e modo economia)? Falso = a tela é a de antes. */
  ativo: boolean;
  /** O motor de voz passa por aqui para a boca acompanhar; desligada, devolve o motor como veio. */
  ponte: PonteDaVoz;
  /** Troca o destravador da voz pelo que também prepara o analisador, dentro do mesmo gesto. */
  destravar: (original: () => void) => () => void;
  /** O avatar de um LADO DO MOTOR (`meu`/`outro`), ou `undefined` onde não há. */
  doLado: (lado: LadoDaConversa) => ReactNode;
  /** O botão e o painel de configuração; `undefined` sem a flag. */
  avatares: AvataresDaConversa | undefined;
}

/**
 * OS AVATARES DO INTÉRPRETE. Tudo atrás de `avatar_3d`: sem a flag o hook devolve `ativo: false`, nenhum nó e a ponte
 * desligada, e a tela é exatamente a de antes. O estado de cada avatar vem do `estado()` do controle (fase, lado,
 * falando) e do motor de voz (`useVozTocando`); a legenda não depende de nada daqui.
 */
export function useAvataresDoInterprete({
  estado,
  layout,
}: {
  estado: EntradaDoEstadoDaConversa & { trocados: boolean };
  layout: 'celular' | 'computador' | 'quest';
}): AvataresDoInterprete {
  const flag = useFlag(FLAG_AVATAR_3D);
  const sinais = useFlag(FLAG_AVATAR_SINAIS);
  const [prefs, guardar] = usePreferenciasDosAvatares();
  const ponteRef = useRef<PonteDaVoz | null>(null);
  ponteRef.current ??= criarPonteDaVoz();
  const ponte = ponteRef.current;

  // O que só se mede com a flag ligada (a sonda de WebGL2 cria um contexto descartável).
  const medido = useMemo(
    () => (flag ? { tier: detectarTier(), webgl2: temWebGL2() } : { tier: 'fraco' as const, webgl2: true }),
    [flag],
  );
  const politica = politicaDosAvatares({ flag, prefs, webgl2: medido.webgl2, tier: medido.tier, sinais });
  const ativo = politica.mostrar;

  useEffect(() => {
    ponte.ativar(ativo);
  }, [ponte, ativo]);
  useEffect(() => () => ponte.dispose(), [ponte]);
  const vozTocando = useVozTocando(ponte);

  const [painelAberto, setPainelAberto] = useState(false);
  const ativoRef = useRef(ativo);
  ativoRef.current = ativo;
  const destravar = useMemo(() => (original: () => void) => destravarComAvatar(original, () => ativoRef.current), []);

  const tamanho = ladoDoAvatarEmPx(prefs.tamanho, layout);
  const donoDe = (lado: LadoDaConversa): LadoDaConversa =>
    estado.trocados ? (lado === 'meu' ? 'outro' : 'meu') : lado;
  /* O PiP lê o estado por DONO (a pessoa, o intérprete): é UM avatar só, o de quem tem atividade. */
  const estadoDoMeu = estadoDoLadoNaConversa(donoDe('meu'), estado, vozTocando);
  const estadoDoOutro = estadoDoLadoNaConversa(donoDe('outro'), estado, vozTocando);
  useEffect(() => {
    publicarAvatarDoPip(
      ativo ? { ativo: true, estados: { meu: estadoDoMeu, outro: estadoDoOutro }, boca: ponte.pose } : null,
    );
  }, [ativo, estadoDoMeu, estadoDoOutro, ponte]);
  useEffect(() => () => publicarAvatarDoPip(null), []);

  const doLado = (lado: LadoDaConversa): ReactNode => {
    if (!ativo) return undefined;
    const dono = donoDe(lado);
    if (!politica.donos.includes(dono)) return undefined;
    const meuEstado = estadoDoLadoNaConversa(lado, estado, vozTocando);
    const comABoca = meuEstado === 'falando';
    return (
      <AvatarDaConversa
        dono={dono}
        estado={meuEstado}
        fonteDaBoca={comABoca ? ponte.pose : null}
        tamanho={tamanho}
        tier={politica.tier}
        anunciar={prefs.anunciar}
      />
    );
  };

  const avatares: AvataresDaConversa | undefined = flag
    ? {
        botao: (
          <button
            type="button"
            className="int-modo"
            aria-haspopup="dialog"
            aria-expanded={painelAberto}
            aria-pressed={ativo}
            aria-label={t('Avatares da conversa')}
            onClick={() => setPainelAberto((v) => !v)}
            data-testid="avatares-da-conversa"
          >
            <UserRound aria-hidden />
            <span className="int-modo-txt" aria-hidden>
              {t('Avatares')}
            </span>
          </button>
        ),
        painel: ({ escolherVoz }) =>
          painelAberto ? (
            <PainelDosAvatares
              prefs={prefs}
              aoMudar={guardar}
              aoFechar={() => setPainelAberto(false)}
              sinaisLigada={sinais}
              sem3d={!medido.webgl2}
              aoEscolherVoz={escolherVoz}
            />
          ) : null,
      }
    : undefined;

  return { ativo, ponte, destravar, doLado, avatares };
}
