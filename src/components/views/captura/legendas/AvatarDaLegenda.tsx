import { type ReactNode, useEffect, useRef } from 'react';

import type { EstadoDoAvatar } from '../../../../core/avatar/estados';
import { estadoDaLegenda } from '../../../../core/avatar/modos';
import { publicarAvatarDoPip } from '../../../../lib/avatar/avatarDoPip';
import { criarPonteDaVoz, type PonteDaVoz, useVozTocando } from '../../../../lib/avatar/ponteDaVoz';
import { t } from '../../../../lib/i18n';
import { setEnvolturaDaFala } from '../../../../lib/tts';
import AvatarDoModo from '../../../avatar/modo/AvatarDoModo';
import { BotaoDeAjustesDoAvatar, BotaoDoAvatar, DicaDoAvatar } from '../../../avatar/modo/BotaoDoAvatar';
import { useAvatarDoModo } from '../../../avatar/modo/useAvatarDoModo';

/** O que a legenda diz do avatar em TEXTO (a imagem nunca é o único jeito de saber). */
export const ESTADO_DA_LEGENDA_EM_TEXTO: Record<EstadoDoAvatar, () => string> = {
  parado: () => t('Em repouso'),
  ouvindo: () => t('Ouvindo'),
  pensando: () => t('Traduzindo'),
  falando: () => t('Lendo em voz alta'),
};

export interface PecasDoAvatarDaLegenda {
  /** O botão "Avatar" (sempre à vista com a flag, ligado ou não). */
  botao: ReactNode;
  /** A faixa de presença (avatar + estado em texto + ajustes), ou `null` com o avatar desligado. */
  presenca: ReactNode;
  /** A dica da primeira vez, ou `null`. */
  dica: ReactNode;
  /** O estado de agora (os testes e a janela flutuante leem). */
  estado: EstadoDoAvatar;
}

/**
 * O AVATAR DO MODO LEGENDAR (flag `avatar_3d`): um avatar de presença na tela da captura, que escuta enquanto grava,
 * "pensa" enquanto a tradução não chegou e "fala" quando a voz lê uma fala (tocar para ouvir). O mesmo botão, painel e
 * dica do Livro. Ligado, também aparece na janela flutuante (`publicarAvatarDoPip`), se a pessoa deixar. O texto da
 * legenda não depende dele. Sem a flag devolve `undefined` e a tela é a de antes. Com o Intérprete aberto, o avatar do
 * Intérprete manda: este se cala (um contexto 3D a menos).
 */
export function useAvatarDaLegenda({
  gravando,
  pausado,
  pensando,
  interpreteAberto,
  aoEscolherMeuAvatar,
}: {
  gravando: boolean;
  pausado: boolean;
  /** Há uma fala final ainda sem tradução. */
  pensando: boolean;
  interpreteAberto: boolean;
  aoEscolherMeuAvatar?: (() => void) | undefined;
}): PecasDoAvatarDaLegenda | undefined {
  const ctl = useAvatarDoModo('legenda', { aoEscolherMeuAvatar, comPip: true });
  const ponteRef = useRef<PonteDaVoz | null>(null);
  ponteRef.current ??= criarPonteDaVoz();
  const ponte = ponteRef.current;
  const naTela = ctl.ativo && !interpreteAberto;
  useEffect(() => {
    ponte.ativar(naTela);
    if (!naTela) return;
    setEnvolturaDaFala((motor) => ponte.envolver(motor));
    return () => setEnvolturaDaFala(null);
  }, [ponte, naTela]);
  useEffect(() => () => ponte.dispose(), [ponte]);
  const vozTocando = useVozTocando(ponte);
  const estado = estadoDaLegenda({ gravando, pausado, pensando, falando: vozTocando });

  const noPip = naTela && ctl.noPip;
  const publicou = useRef(false);
  useEffect(() => {
    if (noPip) {
      publicou.current = true;
      publicarAvatarDoPip({ ativo: true, estados: { meu: estado, outro: estado }, boca: ponte.pose, soletracao: null });
    } else if (publicou.current) {
      publicou.current = false;
      publicarAvatarDoPip(null);
    }
  }, [noPip, estado, ponte]);
  useEffect(
    () => () => {
      if (publicou.current) publicarAvatarDoPip(null);
    },
    [],
  );

  if (!ctl.disponivel) return undefined;
  const lado = Math.min(ctl.lado, typeof window !== 'undefined' && window.innerWidth < 640 ? 64 : 96);
  return {
    estado,
    botao: <BotaoDoAvatar modo="legenda" ligado={ctl.ligado} aoAlternar={ctl.alternar} classe="q-ctl avm-no-topo" />,
    dica: ctl.dica.visivel ? (
      <DicaDoAvatar modo="legenda" aoLigar={ctl.alternar} aoDispensar={ctl.dica.dispensar} />
    ) : null,
    presenca: naTela ? (
      <div className="avm-presenca" data-testid="presenca-da-legenda" data-estado={estado}>
        <AvatarDoModo
          modo="legenda"
          dono={ctl.dono}
          estado={estado}
          fonteDaBoca={estado === 'falando' ? ponte.pose : null}
          lado={lado}
          tier={ctl.tier}
          fallback2d={ctl.fallback2d}
          anunciar={ctl.anunciar}
        />
        <p className="avm-presenca-texto" data-testid="avatar-da-legenda-estado">
          {ESTADO_DA_LEGENDA_EM_TEXTO[estado]()}
        </p>
        <BotaoDeAjustesDoAvatar modo="legenda" aberto={ctl.painelAberto} aoAlternar={ctl.alternarPainel} />
        {ctl.painel && <div className="avm-painel-solto">{ctl.painel}</div>}
      </div>
    ) : ctl.painel ? (
      <div className="avm-presenca">
        <div className="avm-painel-solto">{ctl.painel}</div>
      </div>
    ) : null,
  };
}
