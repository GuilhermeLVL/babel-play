import type { ReactNode } from 'react';

import { FLAG_AVATAR_3D } from '../../core/planos';
import { iniciaisDe } from '../../lib/avatar/fallback2d';
import { useMiniaturaDoAvatar } from '../../lib/avatar/meuAvatar';
import { useFlag } from '../../lib/flags';
import { useFotoDoPerfil } from '../../lib/fotoDoPerfil';
import { t } from '../../lib/i18n';
import { usePerfil } from '../../lib/usePerfil';

/**
 * O AVATAR DA PESSOA onde a foto aparece (moldura do perfil, recordes, trilho).
 *
 * LEVE DE PROPÓSITO: é uma IMAGEM ESTÁTICA (a miniatura de 192 px renderizada uma vez na tela de Ajustes e guardada
 * no aparelho). Não carrega `three`, não abre WebGL e não pede nada à rede; só a prévia da tela de Ajustes é viva.
 * Ordem: miniatura do avatar → foto do perfil → iniciais. Sem a flag `avatar_3d`, `useAvatarDaMoldura` devolve
 * `undefined` e nada muda.
 */
function AvatarDoUsuario({ tamanho = 40 }: { tamanho?: number }) {
  const { perfil } = usePerfil();
  const usuario = perfil?.id;
  const miniatura = useMiniaturaDoAvatar(usuario);
  const foto = useFotoDoPerfil(usuario);
  const estilo = { width: tamanho, height: tamanho, borderRadius: '50%', objectFit: 'cover' as const };
  const imagem = miniatura ?? (foto && /^data:image\//.test(foto) ? foto : null);
  if (imagem)
    return (
      <img src={imagem} alt={t('Seu avatar')} data-avatar-do-usuario={miniatura ? 'avatar' : 'foto'} style={estilo} />
    );
  return (
    <span
      role="img"
      aria-label={t('Seu avatar')}
      data-avatar-do-usuario="iniciais"
      style={{
        ...estilo,
        display: 'inline-grid',
        placeItems: 'center',
        background: 'var(--surface-sunken, var(--surface))',
        color: 'var(--ink)',
        fontWeight: 800,
        fontSize: Math.max(11, tamanho * 0.36),
      }}
    >
      {iniciaisDe(perfil?.displayName)}
    </span>
  );
}

/**
 * O elemento de avatar para a moldura, ou `undefined` (sem a flag ou sem avatar salvo: tudo como era antes).
 * É um hook para a moldura decidir se desenha o anel em volta de uma pessoa ou do ícone `Frame`.
 */
export function useAvatarDaMoldura(tamanho: number): ReactNode | undefined {
  const ligada = useFlag(FLAG_AVATAR_3D);
  const { perfil } = usePerfil();
  const miniatura = useMiniaturaDoAvatar(perfil?.id);
  return ligada && miniatura ? <AvatarDoUsuario tamanho={Math.max(16, tamanho - 6)} /> : undefined;
}
