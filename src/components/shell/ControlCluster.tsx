import React, { useState, useRef, useEffect, useCallback } from 'react';
import { EDICAO_LEVE } from '../../lib/edicao';
import {
  Bot,
  Sliders,
  Palette,
  Sun,
  Moon,
  Plus,
  Minus,
  Volume2,
  VolumeX,
  Search,
  Gauge,
  Sparkles,
  Eye,
  Gamepad2,
  Zap,
  PanelLeft,
  PanelRight,
  PanelTop,
  PanelBottom,
  Check, Type } from 'lucide-react';
import { THEME_OPTIONS, type ThemeType, FONTE_OPTIONS, type FonteType } from '../../lib/appearance';
import type { AgeProfileType, MenuPositionType } from './navItems';
import MenuDaConta from './MenuDaConta';

export type FontScale = 'sm' | 'md' | 'lg' | 'xl';

export interface ControlClusterProps {
  theme: ThemeType;
  setTheme: (theme: ThemeType) => void;
  darkMode: boolean;
  toggleDarkMode: () => void;
  onOpenStudio: () => void;
  ageProfile: AgeProfileType;
  setAgeProfile: (profile: AgeProfileType) => void;
  onToggleChat: () => void;
  fontScale: FontScale;
  increaseFontScale: () => void;
  decreaseFontScale: () => void;
  menuPosition: MenuPositionType;
  setMenuPosition: (pos: MenuPositionType) => void;
  fonte: FonteType;
  setFonte: (f: FonteType) => void;
  soundEnabled: boolean;
  toggleSound: () => void;
  animationsEnabled: boolean;
  toggleAnimations: () => void;
  performanceMode: boolean;
  togglePerformanceMode: () => void;
  /** `column` empilha os controles no rail vertical; `row` é a barra horizontal. */
  orientation: 'row' | 'column';
  /**
   * Abre a busca global. Mora AQUI, e não na `NavBar`, porque este cluster é a única peça montada
   * pelas quatro posições de menu (topo, esquerda, direita, embaixo) e também pela barra do celular.
   * Pendurar o gatilho na `NavBar` daria busca só a quem deixou o menu no topo.
   */
  onOpenSearch: () => void;
  /** Navega para uma view — o menu da conta leva a "Meu perfil" e a "Ajustes". */
  onChangeView: (view: string) => void;
}

const FONT_SCALE_LABEL: Record<FontScale, string> = { sm: 'A', md: 'A', lg: 'A', xl: 'A' };
const FONT_SCALE_ORDER: FontScale[] = ['sm', 'md', 'lg', 'xl'];

/**
 * Botão utilitário do shell. 36px de alvo (era 28px — abaixo de qualquer mínimo defensável);
 * o perfil sênior sobe para 44px pela regra `.age-senior` do index.css.
 */
function IconButton({
  onClick,
  title,
  active,
  tone,
  children
}: {
  onClick: () => void;
  title: string;
  active?: boolean;
  tone?: 'accent' | 'warn' | 'good';
  children: React.ReactNode;
}) {
  const activeTone =
    tone === 'warn'
      ? 'bg-warn-soft text-warn-ink'
      : tone === 'good'
      ? 'bg-good-soft text-good-ink'
      : 'bg-accent-soft text-accent-ink';
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      aria-pressed={active}
      className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 cursor-pointer transition-colors ${
        active ? activeTone : 'text-ink-muted hover:text-ink hover:bg-surface-hover'
      }`}
    >
      {children}
    </button>
  );
}

export default function ControlCluster(props: ControlClusterProps) {
  const {
    theme,
    setTheme,
    darkMode,
    toggleDarkMode,
    onOpenStudio,
    ageProfile,
    setAgeProfile,
    onToggleChat,
    fontScale,
    increaseFontScale,
    decreaseFontScale,
    menuPosition,
    setMenuPosition,
  fonte,
  setFonte,
    soundEnabled,
    toggleSound,
    animationsEnabled,
    toggleAnimations,
    performanceMode,
    togglePerformanceMode,
    orientation,
    onOpenSearch,
    onChangeView
  } = props;

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);

  /**
   * O painel é `position: fixed` com coordenadas calculadas, NÃO `absolute`.
   *
   * A raiz da app é `overflow-hidden` e o rail vertical é um flex de altura total dentro dela:
   * um popover absoluto ali era recortado. E o `top-11` fixo da versão anterior abria o painel
   * PARA BAIXO mesmo com o menu no rodapé — ou seja, fora da viewport. Aqui a posição é medida
   * a partir do gatilho e depois grampeada dentro da janela, então funciona nas quatro posições.
   */
  const place = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const PANEL_W = 288; // w-72
    const PANEL_MAX_H = Math.min(window.innerHeight * 0.8, 620);
    const GAP = 8;
    const MARGIN = 8;

    // Abre para baixo se couber; senão, para cima.
    const spaceBelow = window.innerHeight - rect.bottom;
    const top =
      spaceBelow >= PANEL_MAX_H + GAP
        ? rect.bottom + GAP
        : Math.max(MARGIN, rect.top - PANEL_MAX_H - GAP);

    // Alinha pela direita do gatilho e grampeia nas bordas da janela.
    let left = rect.right - PANEL_W;
    left = Math.min(left, window.innerWidth - PANEL_W - MARGIN);
    left = Math.max(MARGIN, left);

    setCoords({ top, left });
  }, []);

  useEffect(() => {
    if (!isMenuOpen) return;
    place();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsMenuOpen(false);
    };
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (panelRef.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      setIsMenuOpen(false);
    };
    const onReflow = () => place();

    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onPointerDown);
    window.addEventListener('resize', onReflow);
    window.addEventListener('scroll', onReflow, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('resize', onReflow);
      window.removeEventListener('scroll', onReflow, true);
    };
  }, [isMenuOpen, place]);

  /* O som saiu daqui: o listener delegado (lib/sfxDelegate) já toca `click` em qualquer <button>,
     e `toggleOn`/`toggleOff` nos que declaram `aria-pressed`, que é o caso destes. Manter a
     chamada manual tocaria em dobro. */
  const click = (fn: () => void) => () => { fn(); };

  const scaleIndex = FONT_SCALE_ORDER.indexOf(fontScale);

  return (
    <div
      className={`flex items-center gap-0.5 bg-surface-hover/40 border border-border-subtle/60 p-1 rounded-xl ${
        orientation === 'column' ? 'flex-wrap justify-center w-full' : ''
      }`}
    >
      {/* ── BUSCA GLOBAL ─────────────────────────────────────────────────────────────────────
          Na barra horizontal vira uma pílula larga com o atalho impresso: um ⌘K que ninguém vê não
          é um atalho, é um segredo. No rail vertical o espaço não comporta a pílula, e ela encolhe
          para o mesmo alvo de 36px dos outros controles, o `title` continua ensinando a tecla. */}
      <button
        type="button"
        onClick={() => onOpenSearch()}
        title="Buscar gravação, palavra ou tela (Ctrl+K)"
        aria-label="Buscar gravação, palavra ou tela"
        aria-keyshortcuts="Control+K Meta+K"
        className={`flex items-center gap-2 rounded-lg text-ink-muted hover:text-ink hover:bg-surface-hover transition-colors cursor-pointer shrink-0 ${
          orientation === 'column'
            ? 'w-9 h-9 justify-center'
            : 'h-9 pl-2.5 pr-2 border border-border-subtle/60 bg-surface'
        }`}
      >
        <Search className="w-4 h-4 shrink-0" />
        {orientation === 'row' && (
          <>
            <span className="hidden lg:inline text-[12.5px] font-semibold">Buscar</span>
            <kbd className="hidden xl:inline text-[10px] font-mono border border-border-subtle rounded px-1.5 py-0.5">
              Ctrl K
            </kbd>
          </>
        )}
      </button>

      <div className={orientation === 'column' ? 'hidden' : 'w-px h-5 bg-border-subtle/70 mx-1'} />

      {/* Escala de fonte — o indicador é o próprio "A" mudando de tamanho, não uma sigla a decifrar */}
      <div className="flex items-center gap-0.5 shrink-0">
        <IconButton onClick={click(decreaseFontScale)} title="Diminuir o tamanho do texto">
          <Minus className="w-4 h-4" />
        </IconButton>
        <span
          className="w-6 text-center font-display font-black text-ink select-none leading-none"
          style={{ fontSize: `${11 + scaleIndex * 2}px` }}
          aria-hidden
        >
          {FONT_SCALE_LABEL[fontScale]}
        </span>
        <IconButton onClick={click(increaseFontScale)} title="Aumentar o tamanho do texto">
          <Plus className="w-4 h-4" />
        </IconButton>
      </div>

      <div className={orientation === 'column' ? 'hidden' : 'w-px h-5 bg-border-subtle/70 mx-1'} />

      {/* Som de interface */}
      <IconButton
        onClick={() => toggleSound()}
        title={soundEnabled ? 'Silenciar os sons da interface' : 'Ativar os sons da interface'}
        active={soundEnabled}
        tone="good"
      >
        {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
      </IconButton>

      {/* Animações e efeitos */}
      <IconButton
        onClick={click(toggleAnimations)}
        title={animationsEnabled ? 'Parar as animações e os efeitos' : 'Ativar as animações e os efeitos'}
        active={animationsEnabled}
        tone="accent"
      >
        <Sparkles className={`w-4 h-4 ${animationsEnabled ? '' : 'opacity-50'}`} />
      </IconButton>

      {/* Modo desempenho */}
      <IconButton
        onClick={click(togglePerformanceMode)}
        title={
          performanceMode
            ? 'Modo desempenho ligado, visual simplificado para PCs modestos'
            : 'Ligar o modo desempenho (visual simplificado, app mais leve)'
        }
        active={performanceMode}
        tone="warn"
      >
        <Gauge className="w-4 h-4" />
      </IconButton>

      <div className={orientation === 'column' ? 'hidden' : 'w-px h-5 bg-border-subtle/70 mx-1'} />

      {/* Tutor — depende de /api/gemini/chat; na edição leve não há API. */}
      {!EDICAO_LEVE && <button
        type="button"
        onClick={click(onToggleChat)}
        title="Abrir o tutor BabelBot"
        aria-label="Abrir o tutor BabelBot"
        className="w-9 h-9 rounded-lg text-accent-ink hover:bg-surface-hover flex items-center justify-center transition-colors relative cursor-pointer shrink-0"
      >
        <Bot className="w-4 h-4" />
        <span aria-hidden className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-good rounded-full" />
      </button>}

      {/* Claro / escuro */}
      <IconButton onClick={click(toggleDarkMode)} title={darkMode ? 'Mudar para o modo claro' : 'Mudar para o modo escuro'}>
        {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
      </IconButton>

      {/* Aparência */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsMenuOpen((v) => !v)}
        title="Aparência: tema, perfil e posição do menu"
        aria-label="Aparência: tema, perfil e posição do menu"
        aria-haspopup="dialog"
        aria-expanded={isMenuOpen}
        className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors cursor-pointer shrink-0 ${
          isMenuOpen ? 'bg-accent-soft text-accent-ink' : 'text-ink-muted hover:text-ink hover:bg-surface-hover'
        }`}
      >
        <Palette className="w-4 h-4" />
      </button>

      {/* ── A CONTA ────────────────────────────────────────────────────────────────────────────
          Último da fileira porque é o item de MAIS ALTO nível: os outros ajustam a tela, este
          responde "quem sou eu e como saio". Mora aqui, e não em `NAV_ITEMS`, porque este cluster
          é a única peça que as quatro posições de menu e a barra do celular compartilham,
          `MobileNav` renderiza a lista de navegação INTEIRA e já está no limite de largura. */}
      {!EDICAO_LEVE && <div className={orientation === 'column' ? 'hidden' : 'w-px h-5 bg-border-subtle/70 mx-1'} />}
      {!EDICAO_LEVE && <MenuDaConta onIr={onChangeView} orientation={orientation} />}

      {isMenuOpen && coords && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Aparência"
          className="fixed w-72 bg-surface border border-border-subtle rounded-2xl shadow-2xl z-50 overflow-y-auto custom-scrollbar"
          style={{ top: coords.top, left: coords.left, maxHeight: 'min(80vh, 620px)' }}
        >
          <div className="p-3 space-y-4">
            {/* Posição do menu */}
            <section>
              <h3 className="label-mono mb-2 px-1">Posição do menu</h3>
              <div className="grid grid-cols-4 gap-1 p-1 bg-surface-hover/70 border border-border-subtle rounded-xl">
                {(
                  [
                    { id: 'top', icon: PanelTop, label: 'Topo' },
                    { id: 'left', icon: PanelLeft, label: 'Esquerda' },
                    { id: 'right', icon: PanelRight, label: 'Direita' },
                    { id: 'bottom', icon: PanelBottom, label: 'Baixo' }
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={click(() => setMenuPosition(opt.id))}
                    aria-pressed={menuPosition === opt.id}
                    className={`py-2 px-1 rounded-lg font-bold text-[10px] flex flex-col items-center gap-1 cursor-pointer transition-colors ${
                      menuPosition === opt.id ? 'bg-accent text-accent-contrast' : 'text-ink-muted hover:text-ink hover:bg-surface'
                    }`}
                  >
                    <opt.icon className="w-4 h-4" />
                    {opt.label}
                  </button>
                ))}
              </div>
            </section>

            {/* Perfil de exibição */}
            <section>
              <h3 className="label-mono mb-2 px-1">Perfil de exibição</h3>
              <div className="grid grid-cols-3 gap-1 p-1 bg-surface-hover/70 border border-border-subtle rounded-xl">
                {(
                  [
                    { id: 'kids', icon: Gamepad2, label: 'Kids' },
                    { id: 'pro', icon: Zap, label: 'Pro' },
                    { id: 'senior', icon: Eye, label: 'Sênior' }
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={click(() => setAgeProfile(opt.id))}
                    aria-pressed={ageProfile === opt.id}
                    className={`py-2 px-2 rounded-lg font-bold text-[11px] flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                      ageProfile === opt.id ? 'bg-accent text-accent-contrast' : 'text-ink-muted hover:text-ink hover:bg-surface'
                    }`}
                  >
                    <opt.icon className="w-3.5 h-3.5" />
                    {opt.label}
                  </button>
                ))}
              </div>
            </section>

            {/* Fonte da interface */}
            <section>
              <h3 className="label-mono mb-2 px-1">Fonte</h3>
              <div className="grid grid-cols-2 gap-1 p-1 bg-surface-hover/70 border border-border-subtle rounded-xl">
                {FONTE_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={click(() => setFonte(opt.id))}
                    aria-pressed={fonte === opt.id}
                    title={opt.desc}
                    className={`py-2 px-2 rounded-lg font-bold text-[11px] flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                      fonte === opt.id ? 'bg-accent text-accent-contrast' : 'text-ink-muted hover:text-ink hover:bg-surface'
                    }`}
                  >
                    {opt.id === 'pixel' ? <Gamepad2 className="w-3.5 h-3.5" /> : <Type className="w-3.5 h-3.5" />}
                    {opt.name}
                  </button>
                ))}
              </div>
            </section>

            {/* Temas */}
            <section>
              <h3 className="label-mono mb-2 px-1">Tema</h3>
              <div className="space-y-0.5">
                {THEME_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={click(() => setTheme(opt.id))}
                    className={`w-full text-left px-3 py-2 rounded-xl flex items-center justify-between font-bold text-xs cursor-pointer transition-colors ${
                      theme === opt.id ? 'bg-accent-soft text-accent-ink' : 'hover:bg-surface-hover text-ink-muted hover:text-ink'
                    }`}
                  >
                    <span>{opt.name}</span>
                    {theme === opt.id && <Check className="w-3.5 h-3.5 shrink-0" />}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => {
                  onOpenStudio();
                  setIsMenuOpen(false);
                }}
                className="w-full text-left px-3 py-2 mt-2 rounded-xl flex items-center gap-2 font-bold text-xs text-accent-ink hover:bg-accent-soft transition-colors border-t border-border-subtle pt-3"
              >
                <Sliders className="w-3.5 h-3.5" /> Customizar cores e layout
              </button>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
