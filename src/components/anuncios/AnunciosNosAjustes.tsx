import { useState } from 'react';

import { FLAG_ANUNCIOS } from '../../core/anuncios/politicaDeAnuncio';
import { useFlag } from '../../lib/flags';
import { t } from '../../lib/i18n';
import { usePreferencias } from '../../lib/preferencias';
import { perfilProtegido } from '../../lib/protecaoDoMenor';
import { navegarPara } from '../../lib/rotas';
import ConsentimentoDeAnuncios from './ConsentimentoDeAnuncios';

/**
 * AJUSTES → PRIVACIDADE → ANÚNCIOS: o estado do consentimento, a folha para rever a resposta e a porta
 * "Sem anúncios" (os planos). Só existe com a flag `anuncios` ligada e nunca para o perfil protegido:
 * desligada, a tela de Privacidade fica como era.
 */
export default function AnunciosNosAjustes() {
  const ligada = useFlag(FLAG_ANUNCIOS);
  const p = usePreferencias();
  const [aberta, setAberta] = useState(false);
  if (!ligada || perfilProtegido()) return null;
  const aceitou = p.consentimentos.anuncios;
  return (
    <section className="q-secao">
      <header>
        <div>
          <h2>{t('Anúncios')}</h2>
          <p>{t('No plano Grátis, alguns lugares do app podem mostrar anúncios não personalizados.')}</p>
        </div>
      </header>
      <div className="q-ajuste">
        <div>
          <b>{aceitou ? t('Você aceitou ver anúncios no plano Grátis.') : t('Você não aceitou anúncios.')}</b>
          <small>{t('Sem a sua resposta "Aceitar", nenhum anúncio aparece.')}</small>
        </div>
        <button type="button" className="q-ctl" aria-expanded={aberta} onClick={() => setAberta((a) => !a)}>
          {t('Rever')}
        </button>
        <button type="button" className="q-ctl" onClick={() => navegarPara({ view: 'planos' })}>
          {t('Sem anúncios')}
        </button>
      </div>
      {aberta && <ConsentimentoDeAnuncios aoResponder={() => setAberta(false)} />}
    </section>
  );
}
