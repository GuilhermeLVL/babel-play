import { useEffect, useState } from 'react';

import type { ModoDeCamera } from '../../core/avatar/enquadramento';
import type { EmocaoDoAvatar, EstadoDoAvatar } from '../../core/avatar/estados';
import type { ReceitaDeAvatar } from '../../core/avatar/receita';
import type { TierDoAvatar } from '../../core/avatar/tiers';
import type { MotivoDoFallback } from '../../lib/avatar/fallback2d';
import type { SessaoDeAvatar } from '../../lib/avatar/motor';
import type { PecasDoAvatar } from '../../lib/avatar/pecasNaSessao';
import type { FonteDaBoca, JanelaDoMotor } from '../../lib/avatar/renderer';
import { t } from '../../lib/i18n';
import AvatarCanvas from './AvatarCanvas';

export interface AvatarFalanteProps {
  receita: ReceitaDeAvatar;
  /** A fonte da verdade vem do motor de voz (`useAvatarFalando`): este componente só obedece. */
  falando: boolean;
  emocao: EmocaoDoAvatar;
  /** Lado do quadrado, em pixels. */
  tamanho: number;
  tier: TierDoAvatar;
  /** Boca por quadro (`LigacaoDaFala.pose`). Sem ela o avatar fala só com expressão e postura. */
  fonteDaBoca?: FonteDaBoca | null;
  /** Estado quando NÃO está falando (`ouvindo`, `pensando`). Padrão: `parado`. */
  estadoEmSilencio?: Exclude<EstadoDoAvatar, 'falando'>;
  /**
   * Anuncia a mudança de fala ao leitor de tela (`aria-live="polite"`). DESLIGADO por padrão: a legenda em
   * texto é o conteúdo principal, e o avatar é só imagem; anunciar cada fala repetiria o que já se lê.
   */
  anunciar?: boolean;
  fonte?: string | Blob;
  usuarioId?: string | null;
  aoErro?: (motivo: MotivoDoFallback) => void;
  aoSessao?: (sessao: SessaoDeAvatar | null) => void;
  /** A janela do canvas, quando não é a página (Document PiP). */
  janela?: JanelaDoMotor;
  /** `corpo` (padrão) ou `rosto` (busto, para os círculos do Intérprete e do PiP). */
  modo?: ModoDeCamera;
  /** Peças do Estúdio da receita (o tier fraco já filtra). */
  pecas?: PecasDoAvatar;
}

const SO_PARA_LEITOR = {
  position: 'absolute',
  width: 1,
  height: 1,
  margin: -1,
  padding: 0,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
} as const;

/**
 * O AVATAR QUE FALA: um `AvatarCanvas` com estado derivado de `falando`, emoção e a boca por quadro. Ainda NÃO
 * é montado em tela nenhuma do app (M4 liga ao Intérprete); hoje só o harness E2E o usa.
 */
export default function AvatarFalante({
  receita,
  falando,
  emocao,
  tamanho,
  tier,
  fonteDaBoca,
  estadoEmSilencio = 'parado',
  anunciar = false,
  fonte,
  usuarioId,
  aoErro,
  aoSessao,
  janela,
  modo,
  pecas,
}: AvatarFalanteProps) {
  const estado: EstadoDoAvatar = falando ? 'falando' : estadoEmSilencio;

  // Região viva: só quando pedida, e só muda de texto quando a fala muda (não anuncia quadro a quadro).
  const [aviso, setAviso] = useState('');
  useEffect(() => {
    if (!anunciar) {
      setAviso('');
      return;
    }
    setAviso(falando ? t('Avatar falando') : '');
  }, [anunciar, falando]);

  return (
    <>
      <AvatarCanvas
        receita={receita}
        estado={estado}
        emocao={emocao}
        tier={tier}
        tamanho={tamanho}
        fonte={fonte}
        usuarioId={usuarioId}
        aoErro={aoErro}
        fonteDaBoca={fonteDaBoca}
        aoSessao={aoSessao}
        {...(janela ? { janela } : {})}
        {...(modo ? { modo } : {})}
        {...(pecas ? { pecas } : {})}
      />
      {anunciar && (
        <span aria-live="polite" role="status" data-avatar-aviso style={SO_PARA_LEITOR}>
          {aviso}
        </span>
      )}
    </>
  );
}
