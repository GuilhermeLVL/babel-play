import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';

import { t } from '../../lib/i18n';
import type { DerivedProgress } from '../../lib/progress';
import type { ViewType } from '../../types';
import ControlCluster, { type ControlClusterProps } from './ControlCluster';
import { type AgeProfileType, NAV_ITEMS, navLabel } from './navItems';
import { Brand } from './ShellBits';

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
 * própria, com `border-e` mesmo quando o menu estava à DIREITA, e sem o `hidden md:` que o
 * layout antigo tinha — no celular ela tomava a tela inteira. Cada um desses pontos está
 * resolvido aqui, e a largura é em `px` para não inflar junto com a escala de fonte.
 */
export default function NavRail({ activeView, onChangeView, ageProfile, side, controls }: NavRailProps) {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSE_KEY) === 'true');

  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(COLLAPSE_KEY, String(next));
      return next;
    });
  }, []);

  /* Ctrl/⌘+B recolhe e expande, como nos editores. Fica quieto dentro de campos de texto, onde
     Ctrl+B é "negrito" para quem escreve. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey || e.key.toLowerCase() !== 'b') return;
      const alvo = e.target as HTMLElement | null;
      if (alvo && (alvo.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(alvo.tagName))) return;
      e.preventDefault();
      toggle();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle]);

  /* Dica com o nome do item quando o menu está recolhido. Só `title` não bastava: demora a
     aparecer, não aparece no foco por teclado e some em telas de toque. É `fixed` porque a
     navegação tem rolagem própria, e um balão posicionado dentro dela seria cortado. */
  const [dica, setDica] = useState<{ rotulo: string; top: number; left: number } | null>(null);
  const mostrarDica = (rotulo: string) => (e: React.SyntheticEvent<HTMLElement>) => {
    if (!collapsed) return;
    const r = e.currentTarget.getBoundingClientRect();
    setDica({ rotulo, top: r.top + r.height / 2, left: side === 'right' ? r.left - 8 : r.right + 8 });
  };
  useEffect(() => setDica(null), [collapsed]);

  const width = collapsed ? 'w-[68px]' : 'w-[232px]';
  const border = side === 'right' ? 'border-s' : 'border-e';

  // Publica o recuo para os elementos `fixed` (botão flutuante do iChat) — ver index.css.
  useEffect(() => {
    document.body.classList.toggle('shell-rail-right', side === 'right');
    document.body.classList.toggle('shell-rail-collapsed', collapsed);
    return () => {
      document.body.classList.remove('shell-rail-right', 'shell-rail-collapsed');
    };
  }, [side, collapsed]);

  const renderItem = (item: (typeof NAV_ITEMS)[number]) => {
    const isActive = activeView === item.id;
    const Icon = item.icon;
    const label = navLabel(item, ageProfile);
    return (
      <button
        key={item.id}
        type="button"
        onClick={() => onChangeView(item.id)}
        onMouseEnter={mostrarDica(label)}
        onMouseLeave={() => setDica(null)}
        onFocus={mostrarDica(label)}
        onBlur={() => setDica(null)}
        aria-label={label}
        aria-current={isActive ? 'page' : undefined}
        className={`group relative w-full min-h-[42px] flex items-center gap-3 rounded-xl font-display font-bold text-[13.5px] cursor-pointer transition-colors ${
          collapsed ? 'justify-center px-0' : 'px-3'
        } ${
          isActive
            ? 'bg-accent-soft text-accent-ink shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--accent)_16%,transparent)]'
            : 'text-ink-muted hover:text-ink hover:bg-surface-hover'
        }`}
      >
        {isActive && (
          <span
            aria-hidden
            className={`absolute top-[11px] bottom-[11px] w-[3px] bg-accent shadow-[0_0_8px_color-mix(in_srgb,var(--accent)_60%,transparent)] ${
              side === 'right' ? '-right-2 rounded-s-[3px]' : '-left-2 rounded-e-[3px]'
            }`}
          />
        )}
        <Icon
          className="w-[18px] h-[18px] shrink-0 transition-transform duration-200 group-hover:translate-x-px"
          aria-hidden
        />
        {!collapsed && <span className="truncate">{label}</span>}
      </button>
    );
  };

  return (
    <aside
      id="menu-lateral"
      data-shell="rail"
      className={`hidden md:flex ${width} ${border} border-border-subtle/70 h-full flex-col bg-[linear-gradient(180deg,var(--surface)_0%,color-mix(in_srgb,var(--surface)_70%,var(--canvas))_100%)] z-20 shrink-0 select-none transition-[width] duration-200`}
    >
      {/* Marca + recolher, na mesma linha de base do conteúdo */}
      <div
        className={`h-[60px] shrink-0 flex items-center gap-2 border-b border-border-subtle/70 ${collapsed ? 'justify-center px-2' : 'px-4'}`}
      >
        <Brand compact={collapsed} />
        {!collapsed && (
          <button
            type="button"
            onClick={toggle}
            title="Recolher o menu lateral (Ctrl+B)"
            aria-label="Recolher o menu lateral"
            aria-expanded
            aria-controls="menu-lateral"
            className="ms-auto w-8 h-8 rounded-lg flex items-center justify-center text-ink-muted hover:text-ink hover:bg-surface-hover transition-colors cursor-pointer shrink-0"
          >
            <PanelLeftClose className={`w-4 h-4 ${side === 'right' ? 'rotate-180' : ''}`} aria-hidden />
          </button>
        )}
      </div>

      {/* Navegação — com rolagem própria: com a fonte no XL, seis itens já não cabiam. */}
      <nav
        aria-label="Navegação principal"
        className="flex-1 min-h-0 overflow-y-auto overflow-x-visible custom-scrollbar py-2.5 px-2 flex flex-col gap-0.5"
      >
        {NAV_ITEMS.filter((item) => !item.secondary).map(renderItem)}
        {/* "Mais": separa as telas de uso das de descoberta e conta, como no protótipo aprovado.
            Recolhido, o rótulo vira um fio. */}
        <div
          aria-hidden
          className={
            collapsed
              ? 'mx-2 my-2.5 h-px bg-border-subtle'
              : 'label-mono text-[9.5px] text-ink-muted px-3 pt-3.5 pb-1.5'
          }
        >
          {!collapsed && t('Mais')}
        </div>
        {NAV_ITEMS.filter((item) => item.secondary).map(renderItem)}
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
            title="Expandir o menu lateral (Ctrl+B)"
            aria-label="Expandir o menu lateral"
            aria-expanded={false}
            aria-controls="menu-lateral"
            className="w-full min-h-[40px] rounded-lg flex items-center justify-center text-ink-muted hover:text-ink hover:bg-surface-hover transition-colors cursor-pointer"
          >
            <PanelLeftOpen className={`w-4 h-4 ${side === 'right' ? 'rotate-180' : ''}`} aria-hidden />
          </button>
        )}
      </div>

      {dica && (
        <span
          role="tooltip"
          style={{ top: dica.top, left: dica.left }}
          className={`fixed z-50 -translate-y-1/2 ${side === 'right' ? '-translate-x-full' : ''} pointer-events-none whitespace-nowrap rounded-lg bg-ink text-ink-contrast px-2.5 py-1.5 text-[12.5px] font-display font-bold shadow-lift`}
        >
          {dica.rotulo}
        </span>
      )}
    </aside>
  );
}
