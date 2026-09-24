import { Ellipsis, LifeBuoy, UserRound } from 'lucide-react';
import React, { useEffect, useState } from 'react';

import { t } from '../../lib/i18n';
import type { ViewType } from '../../types';
import { type AgeProfileType, NAV_ITEMS, navLabel } from './navItems';

interface MobileNavProps {
  activeView: ViewType;
  onChangeView: (view: ViewType) => void;
  ageProfile: AgeProfileType;
}

/**
 * Dock inferior do celular — marcação do protótipo aprovado (`.dock` + `.folha`): os cinco
 * destinos principais e "Mais", que abre a folha com os secundários (Personalizar, Sobre, Planos,
 * Ajustes) e o perfil. Todo destino continua com porta no celular — a auditoria F9 achou uma tela
 * sem porta quando os secundários simplesmente sumiam; aqui eles estão a um toque, na folha.
 */
export default function MobileNav({ activeView, onChangeView, ageProfile }: MobileNavProps) {
  const [maisAberto, setMaisAberto] = useState(false);
  const principais = NAV_ITEMS.filter((i) => !i.secondary);
  const secundarios = NAV_ITEMS.filter((i) => i.secondary);
  const secundarioAtivo =
    secundarios.some((i) => i.id === activeView) || activeView === 'profile' || activeView === 'ajuda';

  // Trocar de tela fecha a folha.
  useEffect(() => setMaisAberto(false), [activeView]);

  const ir = (id: ViewType) => {
    setMaisAberto(false);
    onChangeView(id);
  };

  return (
    <>
      <nav className="dock" data-shell="dock" aria-label={t('Navegação principal')}>
        {principais.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => ir(item.id)}
              aria-current={activeView === item.id ? 'page' : undefined}
            >
              <Icon aria-hidden />
              {navLabel(item, ageProfile, true)}
            </button>
          );
        })}
        <button
          type="button"
          aria-expanded={maisAberto}
          aria-controls="folha-mais"
          aria-current={secundarioAtivo ? 'page' : undefined}
          onClick={() => setMaisAberto((v) => !v)}
        >
          <Ellipsis aria-hidden />
          {t('Mais')}
        </button>
      </nav>
      <div id="folha-mais" className={`folha ${maisAberto ? 'on' : ''}`} role="region" aria-label={t('Mais destinos')}>
        <h2>{t('Mais')}</h2>
        {secundarios.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              className="item"
              onClick={() => ir(item.id)}
              aria-current={activeView === item.id ? 'page' : undefined}
              tabIndex={maisAberto ? 0 : -1}
            >
              <Icon aria-hidden />
              {navLabel(item, ageProfile)}
            </button>
          );
        })}
        <button
          type="button"
          className="item"
          onClick={() => ir('profile' as ViewType)}
          aria-current={activeView === 'profile' ? 'page' : undefined}
          tabIndex={maisAberto ? 0 : -1}
        >
          <UserRound aria-hidden />
          {t('Seu perfil')}
        </button>
        <button
          type="button"
          className="item"
          onClick={() => ir('ajuda' as ViewType)}
          aria-current={activeView === 'ajuda' ? 'page' : undefined}
          tabIndex={maisAberto ? 0 : -1}
        >
          <LifeBuoy aria-hidden />
          {t('Ajuda e suporte')}
        </button>
      </div>
    </>
  );
}
