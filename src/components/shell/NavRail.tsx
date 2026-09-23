import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { t } from '../../lib/i18n';
import type { DerivedProgress } from '../../lib/progress';
import type { ViewType } from '../../types';
import ControlCluster, { type ControlClusterProps } from './ControlCluster';
import { type AgeProfileType, NAV_ITEMS, navLabel } from './navItems';
import { MarcaBabel } from './ShellBits';

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

  // Recolhido: o CSS do protótipo (`.rail-recolhido …`) esconde os rótulos e mostra a dica com
  // o nome (`[data-rot]::after`) no hover e no foco por teclado.
  useEffect(() => {
    document.body.classList.toggle('rail-recolhido', collapsed);
    document.body.classList.toggle('shell-rail-right', side === 'right');
    document.body.classList.toggle('shell-rail-collapsed', collapsed);
    return () => {
      document.body.classList.remove('rail-recolhido', 'shell-rail-right', 'shell-rail-collapsed');
    };
  }, [side, collapsed]);

  /* A pílula do item ativo DESLIZA de um item para o outro (`moverIndicador` do protótipo): ela e
     o marcador são peças da navegação posicionadas sobre o item com `aria-current`. */
  const navRef = useRef<HTMLElement>(null);
  const pilulaRef = useRef<HTMLSpanElement>(null);
  const indicadorRef = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const nav = navRef.current,
      pil = pilulaRef.current,
      ind = indicadorRef.current;
    if (!nav || !pil || !ind) return;
    const ativo = nav.querySelector<HTMLElement>('[aria-current="page"]');
    if (!ativo) {
      pil.style.opacity = '0';
      ind.style.opacity = '0';
      return;
    }
    const top = ativo.offsetTop,
      h = ativo.offsetHeight;
    pil.style.opacity = '1';
    ind.style.opacity = '1';
    pil.style.top = `${top}px`;
    pil.style.height = `${h}px`;
    ind.style.top = `${top + 11}px`;
    ind.style.height = `${h - 22}px`;
  }, [activeView, collapsed, ageProfile]);

  const renderItem = (item: (typeof NAV_ITEMS)[number]) => {
    const Icon = item.icon;
    const label = navLabel(item, ageProfile);
    return (
      <button
        key={item.id}
        type="button"
        className="item"
        data-rot={label}
        /* Recolhido, o CSS do protótipo zera o tamanho do texto, e o navegador tira do nome acessível
           o texto de tamanho zero: sem este rótulo o item ficaria mudo para o leitor de tela. */
        aria-label={label}
        onClick={() => onChangeView(item.id)}
        aria-current={activeView === item.id ? 'page' : undefined}
      >
        <Icon aria-hidden />
        {label}
      </button>
    );
  };

  // Marcação do protótipo aprovado (`.rail`): topo com a marca e o botão de recolher, a navegação
  // com o grupo "Mais", e o rodapé com o cluster de utilitários.
  return (
    <aside
      id="menu-lateral"
      data-shell="rail"
      className="rail"
      aria-label={t('Menu lateral')}
      style={{ width: collapsed ? 72 : 220, flexShrink: 0, transition: 'width .25s var(--ease)' }}
    >
      <div className="rail-topo">
        <div className="marca" title="Babel Play">
          <MarcaBabel className="" />
          <span>
            Babel<b>Play</b>
          </span>
        </div>
        <button
          type="button"
          className="item"
          style={{ width: 36, minHeight: 36, padding: 0, justifyContent: 'center' }}
          onClick={toggle}
          aria-label={collapsed ? t('Expandir o menu lateral (Ctrl+B)') : t('Recolher o menu lateral (Ctrl+B)')}
          aria-expanded={!collapsed}
          aria-controls="menu-lateral"
        >
          {collapsed ? (
            <PanelLeftOpen aria-hidden className={side === 'right' ? 'rotate-180' : ''} />
          ) : (
            <PanelLeftClose aria-hidden className={side === 'right' ? 'rotate-180' : ''} />
          )}
        </button>
      </div>

      <nav aria-label={t('Navegação principal')} ref={navRef}>
        <span className="pilula-ativa" ref={pilulaRef} aria-hidden />
        <span className="indicador" ref={indicadorRef} aria-hidden />
        {NAV_ITEMS.filter((item) => !item.secondary).map(renderItem)}
        <div className="grupo-nav" aria-hidden>
          {t('Mais')}
        </div>
        {NAV_ITEMS.filter((item) => item.secondary).map(renderItem)}
      </nav>

      <div className="rail-pe">
        <ControlCluster {...controls} orientation="column" />
      </div>
    </aside>
  );
}
