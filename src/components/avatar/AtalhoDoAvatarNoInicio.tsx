import { Smile, X } from 'lucide-react';

import { mostrarAtalhoDoInicio } from '../../core/avatar/descoberta';
import { ATALHO_DO_INICIO, useDicaUmaVez } from '../../lib/avatar/descoberta';
import { t } from '../../lib/i18n';

/**
 * O ATALHO "SEU AVATAR" NO INÍCIO, para quem não passa pelo Perfil nem pelo Intérprete: um cartão discreto, só com a flag
 * `avatar_3d`. "Conversar com avatar" abre o Intérprete (os avatares já aparecem antes de falar); "Meu avatar" abre
 * Perfil › Avatar. O X some com ele para sempre neste aparelho. É opcional e nunca é recompensa.
 */
export default function AtalhoDoAvatarNoInicio({
  flag,
  aoConversar,
  aoEscolherAvatar,
}: {
  flag: boolean;
  aoConversar: () => void;
  aoEscolherAvatar: () => void;
}) {
  const dica = useDicaUmaVez(ATALHO_DO_INICIO);
  if (!mostrarAtalhoDoInicio({ flag, dispensado: !dica.visivel })) return null;
  return (
    <section className="qc-convite" aria-labelledby="qc-inicio-avatar" data-testid="avatar-no-inicio">
      <Smile aria-hidden />
      <div className="qc-convite-txt">
        <h2 id="qc-inicio-avatar">{t('Seu avatar')}</h2>
        <p>{t('Veja um avatar na conversa e escolha o seu. É opcional e fica só neste aparelho.')}</p>
      </div>
      <div className="qc-convite-acoes">
        <button
          type="button"
          className="q-ctl pri"
          onClick={() => {
            dica.dispensar();
            aoConversar();
          }}
          data-testid="avatar-no-inicio-conversar"
        >
          {t('Conversar com avatar')}
        </button>
        <button
          type="button"
          className="q-ctl"
          onClick={() => {
            dica.dispensar();
            aoEscolherAvatar();
          }}
          data-testid="avatar-no-inicio-meu"
        >
          {t('Meu avatar')}
        </button>
        <button
          type="button"
          className="q-ctl"
          aria-label={t('Dispensar o atalho do avatar')}
          onClick={dica.dispensar}
          data-testid="avatar-no-inicio-dispensar"
        >
          <X aria-hidden />
        </button>
      </div>
    </section>
  );
}
