import { useEffect, useMemo, useState } from 'react';

import { receitaNova } from '../../core/avatar/edicao';
import type { EstadoDoAvatar } from '../../core/avatar/estados';
import { modeloDoInterprete, modeloPadraoDaPessoa } from '../../core/avatar/interprete';
import type { ReceitaDeAvatar } from '../../core/avatar/receita';
import type { TierDoAvatar } from '../../core/avatar/tiers';
import { COLECAO_CURADA } from '../../data/avatar/colecao';
import { assinarMeuAvatar, lerMeuAvatar, lerMeuAvatarLocal } from '../../lib/avatar/meuAvatar';
import type { FonteDaBoca } from '../../lib/avatar/renderer';
import { t } from '../../lib/i18n';
import { usePerfil } from '../../lib/usePerfil';
import AvatarFalante from './AvatarFalante';

const IDS_DA_COLECAO = COLECAO_CURADA.map((m) => m.id);

/** A receita que a pessoa salvou em "Meu avatar" (espelho local na hora, IndexedDB logo depois), ou `null`. */
export function useReceitaDaPessoa(usuario: string | null | undefined): ReceitaDeAvatar | null {
  const [receita, setReceita] = useState<ReceitaDeAvatar | null>(() => lerMeuAvatarLocal(usuario));
  useEffect(() => {
    let vivo = true;
    const reler = () => {
      setReceita(lerMeuAvatarLocal(usuario));
      void lerMeuAvatar(usuario).then((r) => vivo && r && setReceita(r));
    };
    reler();
    const soltar = assinarMeuAvatar(reler);
    return () => {
      vivo = false;
      soltar();
    };
  }, [usuario]);
  return receita;
}

export interface AvatarDaConversaProps {
  /** De quem é a metade: `meu` = a pessoa (a receita dela), `outro` = o avatar-intérprete. */
  dono: 'meu' | 'outro';
  estado: EstadoDoAvatar;
  fonteDaBoca: FonteDaBoca | null;
  tamanho: number;
  tier: TierDoAvatar;
  anunciar: boolean;
}

/**
 * UM AVATAR DA CONVERSA: o da pessoa (a receita salva, ou o primeiro da coleção se ela ainda não escolheu) ou o do
 * intérprete (um modelo da coleção curada diferente do dela). Emoção neutra: a emoção por frase é do marco M5.
 * É SÓ IMAGEM e fica ao lado do texto; quem lê e ouve a conversa nunca depende dele.
 */
export default function AvatarDaConversa({
  dono,
  estado,
  fonteDaBoca,
  tamanho,
  tier,
  anunciar,
}: AvatarDaConversaProps) {
  const { perfil } = usePerfil();
  const salva = useReceitaDaPessoa(perfil?.id);
  const padraoDaPessoa = modeloPadraoDaPessoa(IDS_DA_COLECAO);
  const idDaPessoa = salva ? (salva.base.origem === 'colecao' ? salva.base.id : null) : padraoDaPessoa;
  const receita = useMemo<ReceitaDeAvatar | null>(() => {
    if (dono === 'meu') {
      if (salva) return salva;
      return padraoDaPessoa
        ? receitaNova({ origem: 'colecao', id: padraoDaPessoa }, perfil?.displayName?.slice(0, 40) || t('Você'), 0)
        : null;
    }
    const id = modeloDoInterprete(idDaPessoa, IDS_DA_COLECAO);
    return id ? receitaNova({ origem: 'colecao', id }, t('Intérprete'), 0) : null;
  }, [dono, salva, idDaPessoa, padraoDaPessoa, perfil?.displayName]);
  if (!receita) return null;
  return (
    <AvatarFalante
      receita={receita}
      falando={estado === 'falando'}
      emocao="neutro"
      tamanho={tamanho}
      tier={tier}
      fonteDaBoca={fonteDaBoca}
      estadoEmSilencio={estado === 'falando' ? 'parado' : estado}
      anunciar={anunciar}
      usuarioId={dono === 'meu' ? perfil?.id : null}
    />
  );
}
