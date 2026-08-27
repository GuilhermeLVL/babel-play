import React, { useState, useEffect } from 'react';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import type { ViewType } from '../../types';
import { NAV_ITEMS, navLabel, type AgeProfileType } from './navItems';
import ControlCluster, { type ControlClusterProps } from './ControlCluster';
import { Brand } from './ShellBits';
import type { DerivedProgress } from '../../lib/progress';

const COLLAPSE_KEY = 'babel.rail_collapsed';

interface NavRailProps {
  activeView: ViewType;
  onChangeView: (view: ViewType) => void;
  ageProfile: AgeProfileType;
  progress: DerivedProgress;
  side: 'left' | 'right';
  controls: Omit<ControlClusterProps, 'orientation'>;
}

/**
 * Rail vertical — a "barra lateral" de verdade.
 *
 * A versão anterior era a barra horizontal torcida com ternários: sem recolher, sem rolagem
 * própria, com `border-r` mesmo quando o menu estava à DIREITA, e sem o `hidden md:` que o
 * layout antigo tinha — no celular ela tomava a tela inteira. Cada um desses pontos está
 * resolvido aqui, e a largura é em `px` para não inflar junto com a escala de fonte.
 */
export default function NavRail({ activeView, onChangeView, ageProfile, side, controls }: NavRailProps) {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSE_KEY) === 'true');

  const toggle = () => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(COLLAPSE_KEY, String(next));
      return next;
    });
  };

  const width = collapsed ? 'w-[68px]' : 'w-[232px]';
  const border = side === 'right' ? 'border-l' : 'border-r';

  // Publica o recuo para os elementos `fixed` (botão flutuante do iChat) — ver index.css.
  useEffect(() => {
    document.body.classList.toggle('shell-rail-right', side === 'right');
    document.body.classList.toggle('shell-rail-collapsed', collapsed);
    return () => {
      document.body.classList.remove('shell-rail-right', 'shell-rail-collapsed');
    };
  }, [side, collapsed]);

  return (
    <aside
      data-shell="rail"
      className={`hidden md:flex ${width} ${border} border-border-subtle/70 h-full flex-col bg-surface/80 backdrop-blur-sm z-20 shrink-0 select-none transition-[width] duration-200`}
    >
      {/* Marca + recolher, na mesma linha de base do conteúdo */}
      <div className={`h-[60px] shrink-0 flex items-center gap-2 border-b border-border-subtle/70 ${collapsed ? 'justify-center px-2' : 'px-4'}`}>
        <Brand compact={collapsed} />
        {!collapsed && (
          <button
            type="button"
            onClick={toggle}
            title="Recolher o menu lateral"
            aria-label="Recolher o menu lateral"
            aria-expanded
            className="ml-auto w-8 h-8 rounded-lg flex items-center justify-center text-ink-muted hover:text-ink hover:bg-surface-hover transition-colors cursor-pointer shrink-0"
          >
            <PanelLeftClose className={`w-4 h-4 ${side === 'right' ? 'rotate-180' : ''}`} aria-hidden />
          </button>
        )}
      </div>

      {/* Navegação — com rolagem própria: com a fonte no XL, seis itens já não cabiam. */}
      <nav aria-label="Navegação principal" className="flex-1 min-h-0 overflow-y-auto custom-scrollbar py-3 px-2 space-y-1">
        {NAV_ITEMS.map((item) => {
          const isActive = activeView === item.id;
          const Icon = item.icon;
          const label = navLabel(item, ageProfile);
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onChangeView(item.id)}
              title={collapsed ? label : undefined}
              aria-label={label}
              aria-current={isActive ? 'page' : undefined}
              className={`relative w-full min-h-[44px] flex items-center gap-3 rounded-xl font-display font-bold text-[13.5px] cursor-pointer transition-colors ${
                collapsed ? 'justify-center px-0' : 'px-3'
              } ${isActive ? 'bg-accent-soft text-accent-ink' : 'text-ink-muted hover:text-ink hover:bg-surface-hover'}`}
            >
              {isActive && (
                <span
                  aria-hidden
                  className={`absolute top-2 bottom-2 w-1 bg-accent ${
                    side === 'right' ? 'right-0 rounded-l-full' : 'left-0 rounded-r-full'
                  }`}
                />
              )}
              <Icon className="w-5 h-5 shrink-0" aria-hidden />
              {!collapsed && <span className="truncate">{label}</span>}
            </button>
          );
        })}
      </nav>

      {/* Rodapé ancorado: utilitários */}
      <div className={`shrink-0 border-t border-border-subtle/70 py-3 space-y-2 ${collapsed ? 'px-2' : 'px-3'}`}>
        {/* Sempre `column` (= quebra em linhas): oito controles de 36px somam ~300px e não cabem
            nos 232px do rail expandido, em `row` eles vazavam por fora da borda. */}
        <ControlCluster {...controls} orientation="column" />
        {collapsed && (
          <button
            type="button"
            onClick={toggle}
            title="Expandir o menu lateral"
            aria-label="Expandir o menu lateral"
            aria-expanded={false}
            className="w-full min-h-[40px] rounded-lg flex items-center justify-center text-ink-muted hover:text-ink hover:bg-surface-hover transition-colors cursor-pointer"
          >
            <PanelLeftOpen className={`w-4 h-4 ${side === 'right' ? 'rotate-180' : ''}`} aria-hidden />
          </button>
        )}
      </div>
    </aside>
  );
}
