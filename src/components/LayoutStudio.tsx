import { comemorar } from '../lib/juice';
import React, { useEffect, useState } from 'react';
import {
  X, Palette, LayoutGrid, Sun, Moon, Sparkles, RotateCcw, Move,
  Eye, EyeOff, Check, SlidersHorizontal, ChevronDown,
  Home, Mic, Library as LibraryIcon, BarChart2, BookOpen, LineChart
} from 'lucide-react';
import { useLayout } from '../hooks/useLayout';
import { AppLayoutConfig, PanelConfig } from '../lib/layoutStore';
import { VIEWS_LABELS, PANEL_TITLES } from '../lib/panelMeta';
import {
  THEME_OPTIONS, PRESET_PALETTES, SIZE_PRESETS,
  type CustomColors, type ThemeType, readCustomColors
} from '../lib/appearance';
import { persistTheme } from '../lib/theme';
import { askConfirm } from './Toast';

interface LayoutStudioProps {
  isOpen: boolean;
  onClose: () => void;
  theme: ThemeType;
  setTheme: (theme: ThemeType) => void;
  darkMode: boolean;
  toggleDarkMode: () => void;
}

const SCREEN_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  hub: Home,
  capture: Mic,
  library: LibraryIcon,
  analysis: BarChart2,
  reading: BookOpen,
  metrics: LineChart
};

const CUSTOM_FIELDS: { key: keyof CustomColors; label: string }[] = [
  { key: 'accent', label: 'Destaque' },
  { key: 'canvas', label: 'Fundo' },
  { key: 'surface', label: 'Card' },
  { key: 'ink', label: 'Texto' }
];

const nearestSizeLabel = (heightPx: number): string => {
  let best = SIZE_PRESETS[0];
  for (const p of SIZE_PRESETS) {
    if (Math.abs(p.value - heightPx) < Math.abs(best.value - heightPx)) best = p;
  }
  return best.label;
};

export default function LayoutStudio({ isOpen, onClose, theme, setTheme, darkMode, toggleDarkMode }: LayoutStudioProps) {
  const { layout, updatePanel, applyIntelligentLayout, resetToDefault, toggleEditMode, editMode } = useLayout();

  const [tab, setTab] = useState<'aparencia' | 'layout'>('aparencia');
  const [activeScreen, setActiveScreen] = useState<keyof AppLayoutConfig>('hub');
  const [customColors, setCustomColors] = useState<CustomColors>(readCustomColors);
  const [advanced, setAdvanced] = useState(false);

  // Esc to close + lock background scroll while the studio is open.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // `persistTheme` aplica no DOM, grava no localStorage e MESCLA em settings.ui
  // (servidor). O `setTheme` do App faz o mesmo para o tema — daí a paleta ir
  // por aqui e o tema pelo callback do pai.
  const commitColor = (key: keyof CustomColors, value: string) => {
    const next = { ...customColors, [key]: value };
    setCustomColors(next);
    persistTheme({ customColors: next });
    if (theme !== 'custom') setTheme('custom');
  };

  const applyPreset = (preset: CustomColors) => {
    // As paletas prontas carregam um `name` que não faz parte da paleta em si.
    const colors: CustomColors = { canvas: preset.canvas, surface: preset.surface, ink: preset.ink, accent: preset.accent };
    setCustomColors(colors);
    persistTheme({ customColors: colors });
    setTheme('custom');
  };

  const editOnScreen = () => {
    if (!editMode) toggleEditMode();
    onClose();
  };

  const handleReset = async () => {
    const ok = await askConfirm({
      title: 'Restaurar a disposição padrão?',
      detail: 'Todos os painéis de todas as telas voltam ao tamanho, posição e visibilidade originais.',
      confirmLabel: 'Restaurar',
      danger: true,
    });
    if (ok) resetToDefault();
  };

  const screens = Object.keys(layout) as (keyof AppLayoutConfig)[];
  const panels = Object.entries(layout[activeScreen]) as [string, PanelConfig][];

  const seg = (active: boolean) =>
    `px-3.5 py-1.5 rounded-lg text-[12.5px] font-bold transition-all cursor-pointer ${
      active ? 'bg-accent text-white shadow-sm' : 'text-ink-muted hover:text-ink'
    }`;

  return (
    <div className="fixed inset-0 z-[110] bg-canvas flex flex-col animate-in fade-in duration-200">
      {/* Header */}
      <header className="shrink-0 border-b border-border-subtle bg-surface/80 backdrop-blur-md">
        <div className="max-w-5xl mx-auto w-full px-5 md:px-8 py-4 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            {/* O Estúdio é o item LENDÁRIO da Loja: o cabeçalho carrega a mesma linguagem de
                raridade, com a aura do accent atual pintada ao vivo. */}
            <div
              className="w-11 h-11 rounded-2xl text-white flex items-center justify-center shrink-0 shadow-btn"
              style={{ background: 'linear-gradient(135deg, var(--accent), var(--warn))' }}
            >
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-marca font-bold text-lg md:text-xl text-ink tracking-tight leading-none flex items-center gap-2">
                Estúdio de Personalização
                <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border border-warn bg-warn/10 text-warn-ink">Lendário</span>
              </h1>
              <p className="text-[12px] text-ink-muted mt-1">Cores, tema e a disposição das telas — do seu jeito, nos mínimos detalhes.</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl border border-border-subtle bg-canvas text-ink-muted hover:text-ink hover:border-ink transition-colors flex items-center justify-center cursor-pointer"
            title="Fechar (Esc)"
          >
            <X className="w-4.5 h-4.5" />
          </button>
        </div>
        {/* Tabs */}
        <div className="max-w-5xl mx-auto w-full px-5 md:px-8">
          <div className="inline-flex items-center gap-1 p-1 bg-canvas border border-border-subtle rounded-xl mb-4">
            <button onClick={() => setTab('aparencia')} className={`flex items-center gap-1.5 ${seg(tab === 'aparencia')}`}>
              <Palette className="w-4 h-4" /> Aparência
            </button>
            <button onClick={() => setTab('layout')} className={`flex items-center gap-1.5 ${seg(tab === 'layout')}`}>
              <LayoutGrid className="w-4 h-4" /> Layout
            </button>
          </div>
        </div>
      </header>

      {/* Body */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="max-w-5xl mx-auto w-full px-5 md:px-8 py-6 md:py-8">
          {tab === 'aparencia' ? (
            <div className="space-y-8">
              {/* Mode */}
              <section>
                <h2 className="text-[13px] font-bold uppercase tracking-wider text-ink-muted mb-3">Modo</h2>
                <div className="inline-flex items-center gap-1 p-1 bg-surface border border-border-subtle rounded-xl">
                  <button onClick={() => { if (darkMode) toggleDarkMode(); }} className={`flex items-center gap-1.5 ${seg(!darkMode)}`}>
                    <Sun className="w-4 h-4" /> Claro
                  </button>
                  <button onClick={() => { if (!darkMode) toggleDarkMode(); }} className={`flex items-center gap-1.5 ${seg(darkMode)}`}>
                    <Moon className="w-4 h-4" /> Escuro
                  </button>
                </div>
              </section>

              {/* Theme */}
              <section>
                <h2 className="text-[13px] font-bold uppercase tracking-wider text-ink-muted mb-3">Tema</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {THEME_OPTIONS.map((opt) => {
                    const sw = opt.id === 'custom' ? customColors : opt.swatches;
                    const selected = theme === opt.id;
                    return (
                      <button
                        key={opt.id}
                        onClick={() => setTheme(opt.id)}
                        className={`p-4 rounded-2xl border-2 text-left transition-all cursor-pointer ${
                          selected ? 'border-accent bg-accent-soft/20 shadow-sm' : 'border-border-subtle bg-surface hover:border-accent/60'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex -space-x-1.5">
                            {[sw.canvas, sw.surface, sw.accent, sw.ink].map((c, i) => (
                              <span key={i} className="w-6 h-6 rounded-full border-2 border-surface shadow-sm" style={{ backgroundColor: c }} />
                            ))}
                          </div>
                          {selected && <Check className="w-4 h-4 text-accent" />}
                        </div>
                        <div className="font-bold text-[13.5px] text-ink">{opt.name}</div>
                        <p className="text-[11.5px] text-ink-muted mt-0.5 leading-snug">{opt.desc}</p>
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* Custom palette */}
              <section>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-[13px] font-bold uppercase tracking-wider text-ink-muted">Cores personalizadas</h2>
                  {theme !== 'custom' && (
                    <button onClick={() => applyPreset(customColors)} className="text-[12px] font-bold text-accent hover:underline cursor-pointer">
                      Criar minha paleta →
                    </button>
                  )}
                </div>
                <div className={`rounded-2xl border border-border-subtle bg-surface p-5 transition-opacity ${theme === 'custom' ? '' : 'opacity-55'}`}>
                  {theme !== 'custom' && (
                    <p className="text-[12px] text-ink-muted mb-4">Selecione o tema <b className="text-ink">Customizado</b> (ou clique em “Criar minha paleta”) para editar as cores livremente.</p>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {CUSTOM_FIELDS.map(({ key, label }) => (
                      <div key={key} className="flex items-center gap-3">
                        <label className="relative w-11 h-11 rounded-xl overflow-hidden border border-border-subtle shrink-0 cursor-pointer" style={{ backgroundColor: customColors[key] }}>
                          <input
                            type="color"
                            value={customColors[key]}
                            onChange={(e) => commitColor(key, e.target.value)}
                            className="absolute inset-0 opacity-0 cursor-pointer"
                            aria-label={label}
                          />
                        </label>
                        <div className="flex-1 min-w-0">
                          <div className="text-[12px] font-bold text-ink">{label}</div>
                          <input
                            type="text"
                            value={customColors[key]}
                            onChange={(e) => commitColor(key, e.target.value)}
                            className="w-full bg-canvas border border-border-subtle rounded-lg px-2 py-1 text-[12px] font-mono text-ink outline-none focus:border-accent mt-0.5"
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-5">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-ink-muted mb-2">Galeria de paletas</div>
                    {/* Cards-mockup em vez de pílulas: cada paleta mostra COMO a interface fica
                        (barra, card, botão pintados com as cores dela) e marca a equipada. */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                      {PRESET_PALETTES.map((p) => {
                        const equipada = theme === 'custom'
                          && customColors.accent.toLowerCase() === p.accent.toLowerCase()
                          && customColors.canvas.toLowerCase() === p.canvas.toLowerCase();
                        return (
                          <button
                            key={p.name}
                            onClick={(e) => {
                              applyPreset(p);
                              comemorar('acerto', e.currentTarget, { texto: p.name + '!' });
                            }}
                            aria-pressed={equipada}
                            className={`text-left rounded-xl border-2 overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-card cursor-pointer ${
                              equipada ? 'border-accent' : 'border-border-subtle hover:border-accent/60'
                            }`}
                            title={p.name}
                          >
                            {/* O mini-mockup: título + card + botão, pintados com a paleta. */}
                            <span className="block p-2.5" style={{ backgroundColor: p.canvas }}>
                              <span className="block h-1.5 w-2/3 rounded-full mb-1.5" style={{ backgroundColor: p.ink, opacity: 0.85 }} />
                              <span className="block rounded-lg p-1.5 mb-1.5" style={{ backgroundColor: p.surface, border: `1px solid ${p.ink}22` }}>
                                <span className="block h-1 w-3/4 rounded-full mb-1" style={{ backgroundColor: p.ink, opacity: 0.55 }} />
                                <span className="block h-1 w-1/2 rounded-full" style={{ backgroundColor: p.ink, opacity: 0.35 }} />
                              </span>
                              <span className="inline-block h-3.5 px-3 rounded-md" style={{ backgroundColor: p.accent }} />
                            </span>
                            <span className="flex items-center justify-between px-2.5 py-1.5 bg-surface">
                              <span className="text-[11.5px] font-bold text-ink truncate">{p.name}</span>
                              {equipada && <Check className="w-3.5 h-3.5 text-accent shrink-0" />}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </section>

              {/* Live preview */}
              <section>
                <h2 className="text-[13px] font-bold uppercase tracking-wider text-ink-muted mb-3">Prévia</h2>
                <div className="rounded-2xl border border-border-subtle bg-surface p-5 shadow-sm">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <h3 className="font-display font-extrabold text-lg text-ink tracking-tight">Título de exemplo</h3>
                      <p className="text-[13px] text-ink-muted mt-1 max-w-md">Este é um texto de amostra para conferir a legibilidade e o contraste do tema atual.</p>
                    </div>
                    <button className="btn-solid text-[13px] shrink-0">Ação principal</button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 mt-4">
                    <span className="badge-tag bg-good-soft text-good-ink">Correto</span>
                    <span className="badge-tag bg-warn-soft text-warn-ink">Atenção</span>
                    <span className="badge-tag bg-error-soft text-error-ink">Erro</span>
                    <span className="badge-tag bg-rare-soft text-rare-ink">Raro</span>
                  </div>
                  <div className="flex items-end gap-2 mt-5 h-20">
                    {[['bg-accent', 70], ['bg-good', 45], ['bg-warn', 85], ['bg-rare', 30], ['bg-accent', 60]].map(([c, h], i) => (
                      <div key={i} className={`flex-1 rounded-t-md ${c as string}`} style={{ height: `${h}%` }} />
                    ))}
                  </div>
                </div>
              </section>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Screen selector */}
              <section>
                <h2 className="text-[13px] font-bold uppercase tracking-wider text-ink-muted mb-3">Escolha a tela</h2>
                <div className="flex flex-wrap gap-2">
                  {screens.map((s) => {
                    const Icon = SCREEN_ICONS[s] || LayoutGrid;
                    const active = activeScreen === s;
                    return (
                      <button
                        key={s}
                        onClick={() => setActiveScreen(s)}
                        className={`flex items-center gap-2 px-3.5 py-2 rounded-xl border text-[12.5px] font-bold transition-all cursor-pointer ${
                          active ? 'bg-accent-soft/30 border-accent text-accent-ink' : 'bg-surface border-border-subtle text-ink-muted hover:text-ink hover:border-accent/60'
                        }`}
                      >
                        <Icon className="w-4 h-4" /> {VIEWS_LABELS[s] || s}
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* Panels of the active screen */}
              <section>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-[13px] font-bold uppercase tracking-wider text-ink-muted">Painéis</h2>
                  <button onClick={() => setAdvanced((v) => !v)} className="flex items-center gap-1 text-[12px] font-bold text-ink-muted hover:text-ink cursor-pointer">
                    <SlidersHorizontal className="w-3.5 h-3.5" /> Avançado
                    <ChevronDown className={`w-3.5 h-3.5 transition-transform ${advanced ? 'rotate-180' : ''}`} />
                  </button>
                </div>
                <div className="space-y-2.5">
                  {panels.map(([panelKey, cfg]) => {
                    const activeSize = nearestSizeLabel(cfg.heightPx);
                    return (
                      <div key={panelKey} className={`rounded-2xl border bg-surface p-4 transition-colors ${cfg.show ? 'border-border-subtle' : 'border-border-subtle/60 opacity-70'}`}>
                        <div className="flex items-center justify-between gap-3 flex-wrap">
                          <div className="font-bold text-[13.5px] text-ink">{PANEL_TITLES[panelKey] || panelKey}</div>
                          <button
                            onClick={() => updatePanel(activeScreen, panelKey, { show: !cfg.show })}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-bold transition-colors cursor-pointer border ${
                              cfg.show ? 'bg-good-soft text-good-ink border-good/30' : 'bg-canvas text-ink-muted border-border-subtle hover:text-ink'
                            }`}
                          >
                            {cfg.show ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                            {cfg.show ? 'Visível' : 'Oculto'}
                          </button>
                        </div>

                        {cfg.show && (
                          <>
                            <div className="flex items-center gap-2 mt-3">
                              <span className="text-[11px] font-bold uppercase tracking-wider text-ink-muted mr-1">Tamanho</span>
                              <div className="inline-flex items-center gap-1 p-1 bg-canvas border border-border-subtle rounded-lg">
                                {SIZE_PRESETS.map((p) => (
                                  <button
                                    key={p.label}
                                    onClick={() => updatePanel(activeScreen, panelKey, { heightPx: p.value })}
                                    className={seg(activeSize === p.label)}
                                  >
                                    {p.label}
                                  </button>
                                ))}
                              </div>
                            </div>

                            {advanced && (
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4 pt-3 border-t border-border-subtle/60">
                                <div>
                                  <div className="flex items-center justify-between text-[11px] font-bold text-ink-muted mb-1">
                                    <span>Largura</span><span className="text-ink">{cfg.widthPercent}%</span>
                                  </div>
                                  <input
                                    type="range" min={10} max={100} value={cfg.widthPercent}
                                    onChange={(e) => updatePanel(activeScreen, panelKey, { widthPercent: Number(e.target.value) })}
                                    className="w-full accent-accent cursor-pointer"
                                  />
                                </div>
                                <div>
                                  <div className="flex items-center justify-between text-[11px] font-bold text-ink-muted mb-1">
                                    <span>Altura</span><span className="text-ink">{cfg.heightPx}px</span>
                                  </div>
                                  <input
                                    type="number" min={50} max={1500} value={cfg.heightPx}
                                    onChange={(e) => updatePanel(activeScreen, panelKey, { heightPx: Number(e.target.value) })}
                                    className="w-full bg-canvas border border-border-subtle rounded-lg px-2 py-1 text-[12px] text-ink outline-none focus:border-accent"
                                  />
                                </div>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* Actions */}
              <section className="flex flex-wrap items-center gap-2.5 pt-2">
                <button onClick={editOnScreen} className="btn-solid text-[13px]">
                  <Move className="w-4 h-4" /> Editar arrastando na tela
                </button>
                <button onClick={() => applyIntelligentLayout()} className="btn-outline text-[13px]">
                  <Sparkles className="w-4 h-4" /> Ajuste Inteligente
                </button>
                <button onClick={handleReset} className="btn-outline text-[13px]">
                  <RotateCcw className="w-4 h-4" /> Restaurar Padrão
                </button>
              </section>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <footer className="shrink-0 border-t border-border-subtle bg-surface/80 backdrop-blur-md">
        <div className="max-w-5xl mx-auto w-full px-5 md:px-8 py-3.5 flex justify-end">
          <button onClick={onClose} className="btn-solid text-[13px]">
            <Check className="w-4 h-4" /> Concluir
          </button>
        </div>
      </footer>
    </div>
  );
}
