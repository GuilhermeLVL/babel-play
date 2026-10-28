import { type ReactNode, useEffect, useState } from 'react';

import { avatarDoPip } from '../../core/avatar/interprete';
import { TIER_DO_PIP } from '../../core/avatar/tiers';
import { FLAG_AVATAR_3D } from '../../core/planos';
import { useAvatarDoPip } from '../../lib/avatar/avatarDoPip';
import { useFlag } from '../../lib/flags';
import { fundoResolvido, lerAparencia } from '../views/captura/legendas/aparenciaDaLegenda';
import AvatarDaConversa from './AvatarDaConversa';

/** O fundo da faixa do avatar acompanha o fundo da legenda (o mesmo que o quadro do PiP de vídeo usa). */
const FUNDOS = { escuro: '#141210', preto: '#000000', claro: '#f6f1e8' } as const;

/** Largura da janela a partir da qual o avatar fica AO LADO da legenda; abaixo, em cima dela. */
const LARGURA_PARA_FICAR_AO_LADO = 520;

/**
 * O AVATAR NO DOCUMENT PiP. Envolve a legenda flutuante: sem a flag `avatar_3d` devolve só os filhos (a janela é a de
 * sempre); com ela, e com o Intérprete publicando avatares (`lib/avatar/avatarDoPip`), mostra UM avatar (o intérprete, com o
 * estado de maior atividade) ao lado da legenda, ou em cima dela numa janela estreita.
 *
 * O renderer é NOVO e vive DENTRO da janela do PiP (canvas criado no documento dela, `requestAnimationFrame` dela, tier
 * `fraco`, sem spring bones). Nada é movido entre documentos: o avatar da página continua lá, e ao fechar a janela a
 * sessão daqui é descartada (renderer, geometrias e contexto). O guarda de `webglcontextlost` é do próprio motor: o laço
 * pausa e, se o contexto não volta, o avatar cai na foto/iniciais.
 */
export default function ComAvatarNoPip({ janela, children }: { janela: Window | null; children: ReactNode }) {
  const ligada = useFlag(FLAG_AVATAR_3D);
  const av = useAvatarDoPip();
  const [largura, setLargura] = useState(() => janela?.innerWidth ?? LARGURA_PARA_FICAR_AO_LADO);
  useEffect(() => {
    if (!janela) return;
    const medir = () => setLargura(janela.innerWidth);
    medir();
    janela.addEventListener('resize', medir);
    return () => janela.removeEventListener('resize', medir);
  }, [janela]);

  if (!ligada || !janela) return <>{children}</>;
  const aoLado = largura >= LARGURA_PARA_FICAR_AO_LADO;
  const { dono, estado } = avatarDoPip(av.estados);
  const lado = aoLado ? 96 : 72;
  return (
    <div
      data-pip-com-avatar={av.ativo ? '' : undefined}
      style={{ display: 'flex', flexDirection: aoLado ? 'row' : 'column', width: '100%', height: '100%' }}
    >
      {av.ativo && (
        <div
          data-testid="avatar-no-pip"
          data-dono={dono}
          style={{
            flex: 'none',
            display: 'grid',
            placeItems: 'center',
            padding: 8,
            background: FUNDOS[fundoResolvido(lerAparencia().fundo, document.documentElement.classList.contains('dark'))],
          }}
        >
          <div style={{ borderRadius: '50%', overflow: 'hidden', lineHeight: 0 }}>
            <AvatarDaConversa
              dono={dono}
              estado={estado}
              fonteDaBoca={estado === 'falando' ? av.boca : null}
              tamanho={lado}
              tier={TIER_DO_PIP}
              anunciar={false}
              janela={janela}
            />
          </div>
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0, minHeight: 0 }}>{children}</div>
    </div>
  );
}
