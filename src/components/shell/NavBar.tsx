import React from 'react';
import type { ViewType } from '../../types';
import { NAV_ITEMS, navLabel, type AgeProfileType } from './navItems';
import ControlCluster, { type ControlClusterProps } from './ControlCluster';
import { Brand } from './ShellBits';
import type { DerivedProgress } from '../../lib/progress';

interface NavBarProps {
  activeView: ViewType;
  onChangeView: (view: ViewType) => void;
  ageProfile: AgeProfileType;
  progress: DerivedProgress;
  /** `bottom` inverte a borda e some no celular (lá quem manda é a dock + a barra do topo). */
  edge: 'top' | 'bottom';
  controls: Omit<ControlClusterProps, 'orientation'>;
}

/**
 * Barra horizontal (topo ou rodapé).
 *
 * Altura fixa em `px`, não em `rem`: a escala de fonte do usuário deve crescer o TEXTO da app,
 * não a moldura em volta dela. Com `h-16` (4rem) a barra inflava para 86px no XL e comia a tela
 * de quem mais precisa de espaço — justamente o público sênior.
 */
export default function NavBar({ activeView, onChangeView, ageProfile, edge, controls }: NavBarProps) {
  return (
    <header
      /* `data-shell` marca a MOLDURA. O Modo Desempenho precisa tornar estas superfícies opacas
         (sem desfoque, a transparência só suja) — e antes ele fazia isso mirando a TAG `header`,
         que a app inteira usa em blocos de título. Ver a regra em index.css. */
      data-shell="bar"
      className={`h-[60px] w-full items-center gap-3 px-3 md:px-5 bg-surface/90 backdrop-blur-md z-20 shrink-0 select-none ${
        edge === 'bottom'
          ? 'hidden md:flex border-t border-border-subtle/70'
          : 'flex border-b border-border-subtle/70'
      }`}
    >
      <Brand compact />

      <nav aria-label="Navegação principal" className="hidden md:flex items-center gap-0.5 min-w-0 flex-1 justify-center">
        {NAV_ITEMS.map((item) => {
          const isActive = activeView === item.id;
          const Icon = item.icon;
          // UM rótulo, o do perfil. Ter `aria-label="Praticar"` num botão escrito "Sessão" deixa o
          // leitor de tela contando uma história diferente da tela — e fazia o perfil Kids perder
          // a adaptação justamente na navegação. Aparece a partir de `xl`, onde os seis cabem sem
          // espremer os controles; abaixo disso é ícone com nome acessível correto.
          const label = navLabel(item, ageProfile);
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onChangeView(item.id)}
              aria-current={isActive ? 'page' : undefined}
              aria-label={label}
              title={label}
              className={`h-9 flex items-center gap-2 px-3 rounded-lg text-[12.5px] font-bold whitespace-nowrap cursor-pointer transition-colors ${
                isActive ? 'bg-accent-soft text-accent-ink' : 'text-ink-muted hover:text-ink hover:bg-surface-hover'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" aria-hidden />
              <span className="hidden xl:inline">{label}</span>
            </button>
          );
        })}
      </nav>

      {/* Empurra os controles para a direita quando o nav está escondido (celular). */}
      <div className="flex-1 md:hidden" />

      <div className="flex items-center gap-2 shrink-0">
        <ControlCluster {...controls} orientation="row" />
      </div>
    </header>
  );
}
