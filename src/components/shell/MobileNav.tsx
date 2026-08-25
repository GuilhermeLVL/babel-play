import React from 'react';
import type { ViewType } from '../../types';
import { NAV_ITEMS, navLabel, type AgeProfileType } from './navItems';

interface MobileNavProps {
  activeView: ViewType;
  onChangeView: (view: ViewType) => void;
  ageProfile: AgeProfileType;
}

/**
 * Dock inferior do celular.
 *
 * Ela existe porque, depois do redesign, a app ficou LITERALMENTE sem navegação abaixo de `md`:
 * o nav do topo é `hidden md:flex` e o Sidebar — que era o plano B — deixou de ser renderizado.
 * Cinco destinos; Ajustes (`secondary`) fica de fora e continua alcançável pelo Início.
 */
export default function MobileNav({ activeView, onChangeView, ageProfile }: MobileNavProps) {
  /**
   * F9 — "Ajustes" VOLTA para a dock.
   *
   * `NAV_ITEMS.filter(i => !i.secondary)` removia o único item marcado como secundário, e o
   * resultado era que no celular NÃO EXISTIA botão de Ajustes em lugar nenhum da navegação: a
   * tela existia e não tinha porta. O harness da auditoria bateu nisso — o passo `07 settings`
   * falhava só no viewport mobile, por não achar o botão.
   *
   * O motivo de `secondary` era caber na largura; com 6 itens cada um fica com ~16% da tela, o
   * que ainda respeita o alvo mínimo de toque. Perder o acesso é pior que apertar o espaço.
   */
  const items = NAV_ITEMS;

  return (
    <nav
      aria-label="Navegação principal"
      data-shell="dock"
      className="md:hidden shrink-0 w-full flex items-stretch border-t border-border-subtle/70 bg-surface/95 backdrop-blur-md z-30 pb-[env(safe-area-inset-bottom)]"
    >
      {items.map((item) => {
        const isActive = activeView === item.id;
        const Icon = item.icon;
        const label = navLabel(item, ageProfile, true);
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onChangeView(item.id)}
            aria-current={isActive ? 'page' : undefined}
            className={`flex-1 min-h-[56px] flex flex-col items-center justify-center gap-1 px-1 cursor-pointer transition-colors ${
              isActive ? 'text-accent-ink' : 'text-ink-muted'
            }`}
          >
            <span className="relative flex items-center justify-center">
              {isActive && <span aria-hidden className="absolute -inset-x-3 -inset-y-1.5 rounded-full bg-accent-soft" />}
              <Icon className="w-5 h-5 relative" aria-hidden />
            </span>
            <span className="text-[10px] font-bold leading-none truncate max-w-full">{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
