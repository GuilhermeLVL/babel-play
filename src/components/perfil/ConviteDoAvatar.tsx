import { Smile } from 'lucide-react';
import { useEffect, useState } from 'react';

import { convidarParaCriarAvatar } from '../../core/avatar/descoberta';
import { CONVITE_DO_PERFIL, useDicaUmaVez } from '../../lib/avatar/descoberta';
import { assinarMeuAvatar, lerMeuAvatar, lerMeuAvatarLocal } from '../../lib/avatar/meuAvatar';
import { t } from '../../lib/i18n';
import { usePerfil } from '../../lib/usePerfil';

/** Há um avatar salvo para esta pessoa (espelho local na hora, IndexedDB logo depois)? */
function useTemAvatarSalvo(usuario: string | null | undefined): boolean {
  const [tem, setTem] = useState(() => !!lerMeuAvatarLocal(usuario));
  useEffect(() => {
    let vivo = true;
    const reler = () => {
      setTem(!!lerMeuAvatarLocal(usuario));
      void lerMeuAvatar(usuario).then((r) => vivo && r && setTem(true));
    };
    reler();
    const soltar = assinarMeuAvatar(reler);
    return () => {
      vivo = false;
      soltar();
    };
  }, [usuario]);
  return tem;
}

/**
 * O CONVITE "CRIE SEU AVATAR", no topo do Perfil: só com a flag `avatar_3d`, sem avatar salvo e enquanto a pessoa não
 * pulou. Um toque abre a aba Avatar; "Pular" some para sempre neste aparelho. É opcional e nunca é recompensa.
 */
export default function ConviteDoAvatar({ flag, aoCriar }: { flag: boolean; aoCriar: () => void }) {
  const { perfil } = usePerfil();
  const temAvatar = useTemAvatarSalvo(perfil?.id);
  const convite = useDicaUmaVez(CONVITE_DO_PERFIL);
  if (!convidarParaCriarAvatar({ flag, temAvatar, dispensado: !convite.visivel })) return null;
  return (
    <section className="qc-convite" aria-labelledby="qc-convite-titulo" data-testid="convite-do-avatar">
      <Smile aria-hidden />
      <div className="qc-convite-txt">
        <h2 id="qc-convite-titulo">{t('Crie seu avatar')}</h2>
        <p>{t('Escolha um rosto para te representar na conversa. É opcional e fica só neste aparelho.')}</p>
      </div>
      <div className="qc-convite-acoes">
        <button
          type="button"
          className="q-ctl pri"
          onClick={() => {
            convite.dispensar();
            aoCriar();
          }}
          data-testid="convite-criar-avatar"
        >
          {t('Criar meu avatar')}
        </button>
        <button type="button" className="q-ctl" onClick={convite.dispensar} data-testid="convite-pular">
          {t('Pular')}
        </button>
      </div>
    </section>
  );
}
