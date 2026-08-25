import React, { useState } from 'react';
import { useLayout } from '../hooks/useLayout';
import { Sparkles, RotateCcw, Check, Eye, EyeOff } from 'lucide-react';
import { PANEL_TITLES } from '../lib/panelMeta';

export default function LayoutEditorToolbar() {
  const { 
    editMode, 
    toggleEditMode, 
    applyIntelligentLayout, 
    resetToDefault,
    layout,
    updatePanel
  } = useLayout();

  const [showNotification, setShowNotification] = useState<string | null>(null);
  const [showHiddenMenu, setShowHiddenMenu] = useState(false);

  const triggerAction = (actionName: string, callback: () => void) => {
    callback();
    setShowNotification(actionName);
    setTimeout(() => {
      setShowNotification(null);
    }, 3000);
  };

  const hiddenItems: { view: string, panel: string, title: string }[] = [];
  Object.entries(layout).forEach(([viewKey, viewConfig]) => {
    Object.entries(viewConfig).forEach(([panelKey, panelConfig]) => {
      if (!(panelConfig as any).show) {
        hiddenItems.push({ view: viewKey, panel: panelKey, title: PANEL_TITLES[panelKey] || panelKey });
      }
    });
  });

  return (
    <>
      {editMode && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center justify-center pointer-events-none">
          <div className="bg-surface-hover/95 border border-border-subtle rounded-2xl p-2 flex items-center gap-2 shadow-2xl backdrop-blur-md pointer-events-auto">
            
            {/* Active Notification Pill */}
            {showNotification && (
              <div className="flex items-center gap-1.5 bg-accent-soft text-accent-ink px-3 py-1.5 rounded-xl text-[10px] font-bold font-mono animate-in fade-in zoom-in-95 duration-200">
                <Sparkles className="w-3 h-3 text-accent animate-pulse" />
                <span className="hidden sm:inline">{showNotification}</span>
              </div>
            )}

            <div className="flex items-center gap-2 animate-in fade-in zoom-in-95 duration-200">
              {/* Hidden Items Restore List (click to open, click-away to close) */}
              {hiddenItems.length > 0 && (
                <div className="relative flex items-center">
                  <button
                    onClick={() => setShowHiddenMenu(v => !v)}
                    className={`flex items-center gap-1.5 py-1.5 px-3 rounded-xl text-xs font-bold transition-colors border cursor-pointer ${
                      showHiddenMenu
                        ? 'bg-error-soft text-error border-error ring-2 ring-error/20'
                        : 'bg-error-soft text-error border-error/40 hover:bg-error/15'
                    }`}
                  >
                    <EyeOff className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">{hiddenItems.length} {hiddenItems.length === 1 ? 'Oculto' : 'Ocultos'}</span>
                  </button>
                  {showHiddenMenu && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setShowHiddenMenu(false)} />
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 bg-surface border border-border-subtle rounded-xl shadow-2xl overflow-hidden z-50 animate-in fade-in slide-in-from-bottom-1 duration-150">
                        <div className="p-2 text-[10px] font-bold text-ink-muted uppercase tracking-wider bg-canvas border-b border-border-subtle">
                          Restaurar Painéis
                        </div>
                        <div className="max-h-52 overflow-y-auto custom-scrollbar">
                          {hiddenItems.map((item, idx) => (
                            <button
                              key={idx}
                              onClick={() => updatePanel(item.view as any, item.panel, { show: true })}
                              className="w-full text-left px-3 py-2 text-xs font-semibold text-ink hover:bg-surface-hover flex items-center justify-between transition-colors cursor-pointer"
                            >
                              {item.title}
                              <Eye className="w-3.5 h-3.5 text-rare shrink-0 ml-2" />
                            </button>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Auto-Adjust Intelligent Layout Button */}
              <button
                onClick={() => triggerAction('Layout Otimizado', applyIntelligentLayout)}
                className="flex items-center gap-1.5 py-1.5 px-3 bg-accent hover:bg-accent-ink text-white rounded-xl text-xs font-bold transition-all cursor-pointer border border-accent"
                title="Ajuste Inteligente"
              >
                <Sparkles className="w-3.5 h-3.5 animate-pulse" />
                <span className="hidden sm:inline">Ajuste Inteligente</span>
              </button>

              {/* Reset Defaults Layout Button */}
              <button
                onClick={() => triggerAction('Layout Padrão', resetToDefault)}
                className="flex items-center gap-1.5 py-1.5 px-3 bg-canvas hover:bg-surface border border-border-subtle text-ink-muted hover:text-ink rounded-xl text-xs font-bold transition-colors cursor-pointer"
                title="Restaurar Padrão"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>

              {/* Divider */}
              <div className="w-px h-6 bg-border-subtle mx-1" />

              {/* Concluir/Exit Edit mode Button */}
              <button
                onClick={toggleEditMode}
                className="flex items-center gap-1 py-1.5 px-4 bg-ink text-surface hover:bg-ink-muted rounded-xl text-xs font-black transition-all cursor-pointer shadow-md"
              >
                <Check className="w-4 h-4" />
                <span>Concluir</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
