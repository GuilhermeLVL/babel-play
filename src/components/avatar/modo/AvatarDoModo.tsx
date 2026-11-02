import '../../../styles/avatarDoModo.css';

import { useLayoutEffect, useMemo, useState } from 'react';

import { receitaNova } from '../../../core/avatar/edicao';
import type { EmocaoDoAvatar, EstadoDoAvatar } from '../../../core/avatar/estados';
import type { ModoDoAvatar } from '../../../core/avatar/modos';
import type { TierDoAvatar } from '../../../core/avatar/tiers';
import { COLECAO_CURADA } from '../../../data/avatar/colecao';
import { reservarContexto } from '../../../lib/avatar/avatarDoModo';
import { descritorDoFallback } from '../../../lib/avatar/fallback2d';
import type { FonteDaBoca } from '../../../lib/avatar/renderer';
import { useFotoDoPerfil } from '../../../lib/fotoDoPerfil';
import { t } from '../../../lib/i18n';
import { usePerfil } from '../../../lib/usePerfil';
import { useReceitaDoDono } from '../AvatarDaConversa';
import AvatarFalante from '../AvatarFalante';

const ROTULO_DO_ESTADO: Record<EstadoDoAvatar, () => string> = {
  parado: () => t('Avatar em repouso'),
  ouvindo: () => t('Avatar ouvindo'),
  pensando: () => t('Avatar pensando'),
  falando: () => t('Avatar falando'),
};

export interface AvatarDoModoProps {
  modo: ModoDoAvatar;
  /** `meu` = o avatar do Perfil (ou o que a pessoa trouxe); `outro` = o avatar-intérprete. */
  dono: 'meu' | 'outro';
  estado: EstadoDoAvatar;
  fonteDaBoca?: FonteDaBoca | null;
  emocao?: EmocaoDoAvatar;
  /** Lado do círculo, em px. */
  lado: number;
  tier: TierDoAvatar;
  /** Força o 2D (sem WebGL2). Também vale quando a página já está no teto de contextos 3D. */
  fallback2d?: boolean;
  anunciar?: boolean;
  /** Um modelo da coleção no lugar do avatar do dono (o elenco: um rosto por personagem). */
  modeloId?: string | null;
  /** O nome que as iniciais do 2D usam quando o modelo é de uma personagem. */
  nomeDoModelo?: string;
}

/**
 * O AVATAR DE UM MODO (Livro, Legendar): um círculo com o `AvatarFalante` e o mesmo contrato dos avatares da conversa
 * (só imagem, sem foco, descrito por `aria-label`). Reserva um dos contextos WebGL da página; no teto, sem WebGL2 ou se
 * o modelo falha, mostra a foto ou as iniciais: o avatar nunca some sozinho e o texto nunca depende dele.
 */
export default function AvatarDoModo({
  modo,
  dono,
  estado,
  fonteDaBoca = null,
  emocao = 'neutro',
  lado,
  tier,
  fallback2d = false,
  anunciar = false,
  modeloId = null,
  nomeDoModelo,
}: AvatarDoModoProps) {
  const { perfil } = usePerfil();
  const receitaDoDono = useReceitaDoDono(dono);
  const receita = useMemo(
    () =>
      modeloId && COLECAO_CURADA.some((m) => m.id === modeloId)
        ? receitaNova({ origem: 'colecao', id: modeloId }, nomeDoModelo ?? t('Narrador'), 0)
        : receitaDoDono,
    [modeloId, nomeDoModelo, receitaDoDono],
  );
  const [contexto, setContexto] = useState<boolean | null>(null);
  useLayoutEffect(() => {
    if (fallback2d) {
      setContexto(false);
      return;
    }
    const r = reservarContexto();
    setContexto(r.ok);
    return r.soltar;
  }, [fallback2d]);
  const foto = useFotoDoPerfil(dono === 'meu' && !modeloId ? perfil?.id : null);
  const d2 = useMemo(
    () =>
      descritorDoFallback({
        usuario: dono === 'meu' && !modeloId ? perfil?.id : null,
        nome: receita?.meta.nome,
        motivo: 'sem_webgl2',
      }),
    // `foto` muda quando a pessoa troca a foto do perfil.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dono, modeloId, perfil?.id, receita?.meta.nome, foto],
  );
  if (!receita) return null;
  return (
    <div
      className="avm-rosto"
      style={{ width: lado, height: lado }}
      data-testid="avatar-do-modo"
      data-modo={modo}
      data-estado={estado}
      data-dono={dono}
      data-emocao={emocao}
      data-2d={contexto === false ? '' : undefined}
    >
      {contexto === true && (
        <AvatarFalante
          receita={receita}
          falando={estado === 'falando'}
          emocao={emocao}
          tamanho={lado}
          tier={tier}
          fonteDaBoca={estado === 'falando' ? fonteDaBoca : null}
          estadoEmSilencio={estado === 'falando' ? 'parado' : estado}
          anunciar={anunciar}
          usuarioId={dono === 'meu' && !modeloId ? perfil?.id : null}
          modo="rosto"
        />
      )}
      {contexto === false && (
        <div
          role="img"
          aria-label={ROTULO_DO_ESTADO[estado]()}
          className="avm-2d"
          data-avatar-fallback={d2.motivo}
          style={{ fontSize: Math.max(12, lado * 0.36) }}
        >
          {d2.tipo === 'foto' ? <img src={d2.src} alt="" /> : <span aria-hidden="true">{d2.texto}</span>}
        </div>
      )}
    </div>
  );
}
