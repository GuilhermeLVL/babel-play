import { useEffect, useMemo, useState } from 'react';

import { receitaNova } from '../../core/avatar/edicao';
import type { EmocaoDoAvatar, EstadoDoAvatar } from '../../core/avatar/estados';
import { modeloDoInterprete, modeloPadraoDaPessoa } from '../../core/avatar/interprete';
import type { ReceitaDeAvatar } from '../../core/avatar/receita';
import type { TierDoAvatar } from '../../core/avatar/tiers';
import { COLECAO_CURADA } from '../../data/avatar/colecao';
import { assinarMeuAvatar, lerMeuAvatar, lerMeuAvatarLocal } from '../../lib/avatar/meuAvatar';
import type { SessaoDeAvatar } from '../../lib/avatar/motor';
import type { FonteDaBoca, JanelaDoMotor } from '../../lib/avatar/renderer';
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
  /** A emoção da fala em curso (M5: o elenco do leitor). Ausente = neutra, como na conversa. */
  emocao?: EmocaoDoAvatar;
  /** A janela do canvas, quando não é a página (o Document PiP). */
  janela?: JanelaDoMotor;
  /** A sessão aberta (ou `null` ao fechar): a ponte do PiP de vídeo liga o `aoQuadro` do motor aqui. */
  aoSessao?: (sessao: SessaoDeAvatar | null) => void;
}

/**
 * UM AVATAR DA CONVERSA: o da pessoa (a receita salva, ou o primeiro da coleção se ela ainda não escolheu) ou o do
 * intérprete (um modelo da coleção curada diferente do dela). Emoção neutra: a emoção por frase é do marco M5.
 * É SÓ IMAGEM e fica ao lado do texto; quem lê e ouve a conversa nunca depende dele.
 */
/** A receita do avatar de um dono: a da pessoa (`meu`) ou a do avatar-intérprete (`outro`). `null` sem coleção. */
export function useReceitaDoDono(dono: 'meu' | 'outro'): ReceitaDeAvatar | null {
  const { perfil } = usePerfil();
  const salva = useReceitaDaPessoa(perfil?.id);
  const padraoDaPessoa = modeloPadraoDaPessoa(IDS_DA_COLECAO);
  const idDaPessoa = salva ? (salva.base.origem === 'colecao' ? salva.base.id : null) : padraoDaPessoa;
  return useMemo<ReceitaDeAvatar | null>(() => {
    if (dono === 'meu') {
      if (salva) return salva;
      return padraoDaPessoa
        ? receitaNova({ origem: 'colecao', id: padraoDaPessoa }, perfil?.displayName?.slice(0, 40) || t('Você'), 0)
        : null;
    }
    const id = modeloDoInterprete(idDaPessoa, IDS_DA_COLECAO);
    return id ? receitaNova({ origem: 'colecao', id }, t('Intérprete'), 0) : null;
  }, [dono, salva, idDaPessoa, padraoDaPessoa, perfil?.displayName]);
}

export default function AvatarDaConversa({
  dono,
  estado,
  fonteDaBoca,
  tamanho,
  tier,
  anunciar,
  emocao = 'neutro',
  janela,
  aoSessao,
}: AvatarDaConversaProps) {
  const { perfil } = usePerfil();
  const receita = useReceitaDoDono(dono);
  const pecasDaReceita = useMemo(
    () =>
      dono === 'meu' && receita && receita.pecas.length > 0
        ? { ids: receita.pecas, cores: receita.coresDasPecas }
        : undefined,
    [dono, receita],
  );
  if (!receita) return null;
  return (
    <AvatarFalante
      receita={receita}
      falando={estado === 'falando'}
      emocao={emocao}
      tamanho={tamanho}
      tier={tier}
      fonteDaBoca={fonteDaBoca}
      estadoEmSilencio={estado === 'falando' ? 'parado' : estado}
      anunciar={anunciar}
      usuarioId={dono === 'meu' ? perfil?.id : null}
      modo="rosto"
      {...(pecasDaReceita ? { pecas: pecasDaReceita } : {})}
      {...(janela ? { janela } : {})}
      {...(aoSessao ? { aoSessao } : {})}
    />
  );
}
