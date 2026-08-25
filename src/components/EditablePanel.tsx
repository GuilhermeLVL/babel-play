import React, { useRef, useState } from 'react';
import { useLayout } from '../hooks/useLayout';
import { EyeOff } from 'lucide-react';
import { AppLayoutConfig } from '../lib/layoutStore';
import { ThemeType } from '../lib/appearance';

interface EditablePanelProps {
  viewKey: keyof AppLayoutConfig;
  panelKey: string;
  title: string;
  children: React.ReactNode;
  canResizeWidth?: boolean;
  canResizeHeight?: boolean;
  resizeHandlePosition?: 'left' | 'right';
  className?: string;
  /**
   * Utilitário de posicionamento do wrapper. Default `relative` — é o que ancora os overlays do
   * modo de edição (o rótulo e as alças de resize, ambos `absolute`).
   *
   * Painéis que precisam se ancorar no viewport (o Analista de Vocabulário: `fixed` no celular,
   * `sticky` no desktop) trocam este valor. É uma PROP e não um `className` a mais porque o
   * Tailwind emite `.relative` depois de `.fixed`: mandar `fixed` pelo `className` perderia a
   * disputa para o default e não pareceria erro nenhum — só não funcionaria. `fixed`/`sticky`
   * também estabelecem bloco de contenção, então os overlays de edição continuam ancorados.
   */
  positionClass?: string;
  // Fallbacks if not configured yet
  defaultWidth?: number;
  defaultHeight?: number;
}

export default function EditablePanel({
  viewKey,
  panelKey,
  title,
  children,
  canResizeWidth = false,
  canResizeHeight = true,
  resizeHandlePosition = 'right',
  className = '',
  positionClass = 'relative',
  defaultWidth = 100,
  defaultHeight = 400
}: EditablePanelProps) {
  // Use windowSize to dynamically respond to screen resizes
  const { layout, editMode, updatePanel, windowSize } = useLayout();
  const panelRef = useRef<HTMLDivElement>(null);

  // Retrieve current panel layout parameters safely
  const viewConfig = layout[viewKey] as any;
  const panelConfig = viewConfig?.[panelKey] || { show: true, widthPercent: defaultWidth, heightPx: defaultHeight };

  const { show, widthPercent, heightPx, theme } = panelConfig;
  // `data-theme` re-escopa as variáveis CSS (--surface, --radius-card,
  // --border-width-card, …) para os filhos do painel — é assim que a mescla de
  // tema por painel renderiza. O wrapper em si é um container estrutural
  // transparente: nunca pinta um segundo card em volta do conteúdo.
  //
  // Só emitimos o atributo quando há override. Sem override, o painel HERDA o
  // tema do <html>. (O fork lia `localStorage.app_theme` aqui e o congelava no
  // render, então trocar o tema global não repintava os painéis.)
  const activeTheme: ThemeType | undefined = theme;

  // Local state for smooth dragging
  const [localWidth, setLocalWidth] = useState<number | null>(null);
  const [localHeight, setLocalHeight] = useState<number | null>(null);

  const currentWidth = localWidth !== null ? localWidth : widthPercent;
  const currentHeight = localHeight !== null ? localHeight : heightPx;

  // Handle visibility toggle
  const toggleVisibility = (e: React.MouseEvent) => {
    e.stopPropagation();
    updatePanel(viewKey, panelKey, { show: !show });
  };

  // Drag Handlers
  const handlePointerDownRight = (e: React.PointerEvent) => {
    if (!editMode || !canResizeWidth) return;
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startWidthPercent = currentWidth;

    const parent = panelRef.current?.parentElement;
    const parentWidth = parent ? parent.getBoundingClientRect().width : window.innerWidth;

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const deltaX = moveEvent.clientX - startX;
      // If the handle is on the left, moving left (negative delta) increases the width of the panel.
      const adjustedDeltaX = resizeHandlePosition === 'left' ? -deltaX : deltaX;
      const deltaPercent = (adjustedDeltaX / parentWidth) * 100;
      let newPercent = startWidthPercent + deltaPercent;
      newPercent = Math.max(10, Math.min(100, newPercent)); // Clamp between 10% and 100%
      setLocalWidth(newPercent);
    };

    const handlePointerUp = (upEvent: PointerEvent) => {
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerUp);
      
      const deltaX = upEvent.clientX - startX;
      const adjustedDeltaX = resizeHandlePosition === 'left' ? -deltaX : deltaX;
      const deltaPercent = (adjustedDeltaX / parentWidth) * 100;
      let newPercent = startWidthPercent + deltaPercent;
      newPercent = Math.max(10, Math.min(100, newPercent));
      setLocalWidth(null);
      updatePanel(viewKey, panelKey, { widthPercent: newPercent });
    };

    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerup', handlePointerUp);
  };

  const handlePointerDownBottom = (e: React.PointerEvent) => {
    if (!editMode || !canResizeHeight) return;
    e.preventDefault();
    e.stopPropagation();
    const startY = e.clientY;
    const startHeightPx = currentHeight;

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const deltaY = moveEvent.clientY - startY;
      let newHeight = startHeightPx + deltaY;
      newHeight = Math.max(50, Math.min(2000, newHeight)); // Clamp
      setLocalHeight(newHeight);
    };

    const handlePointerUp = (upEvent: PointerEvent) => {
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerUp);
      
      const deltaY = upEvent.clientY - startY;
      let newHeight = startHeightPx + deltaY;
      newHeight = Math.max(50, Math.min(2000, newHeight));
      setLocalHeight(null);
      updatePanel(viewKey, panelKey, { heightPx: newHeight });
    };

    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerup', handlePointerUp);
  };


  // If the panel is hidden, we render nothing (even in edit mode) 
  // so the layout flows naturally. It can be restored via the Toolbar.
  if (!show) {
    return null;
  }

  const widthStyle = canResizeWidth ? `${currentWidth}%` : '100%';
  const isDragging = localWidth !== null || localHeight !== null;

  // On small screens, always use 100% width to prevent squished layouts
  const isDesktop = windowSize.width >= 1024;
  const responsiveWidthStyle = !isDesktop ? '100%' : widthStyle;
  // When width is user-controlled, the percentage must win over any `flex-1`
  // utility on the panel; otherwise flex-grow overrides it and drag does nothing.
  const lockFlexBasis = canResizeWidth && isDesktop;

  return (
    <div
      ref={panelRef}
      data-theme={activeTheme}
      className={`${positionClass} transition-all ${isDragging ? 'duration-0' : 'duration-300'} ${
        editMode
          ? 'rounded-3xl border-2 border-dashed border-rare/60 bg-rare-soft/5 shadow-lg ring-4 ring-rare/5'
          : ''
      } ${className}`}
      style={{
        width: responsiveWidthStyle,
        flexGrow: lockFlexBasis ? 0 : undefined,
        flexShrink: lockFlexBasis ? 0 : undefined,
      }}
    >
      {/* Overlay Title & Hide Button in Edit Mode */}
      {editMode && (
        <div className="absolute -top-3 left-4 z-40 bg-ink text-surface rounded-lg px-3 py-1 flex items-center gap-2 shadow-xl border border-ink-muted/40 animate-in fade-in zoom-in-95 duration-200">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-rare animate-pulse" />
            <span className="text-[10px] font-display font-black tracking-widest uppercase text-surface">
              {title}
            </span>
          </div>

          {/* Theme Mixing Selector */}
          <select
            value={theme || ''}
            onChange={(e) => {
              const selectedTheme = e.target.value ? (e.target.value as ThemeType) : undefined;
              updatePanel(viewKey, panelKey, { theme: selectedTheme });
            }}
            onClick={(e) => e.stopPropagation()} // Prevent selecting parent card click
            className="ml-2 bg-canvas text-ink text-[9px] font-bold px-1.5 py-0.5 rounded outline-none border border-border-subtle cursor-pointer focus:border-accent"
            title="Mesclar Tema do Painel"
          >
            <option value="">Tema Padrão</option>
            <option value="babel">Babel</option>
            <option value="linear">Linear</option>
            <option value="vercel">Vercel</option>
            <option value="mochi">Mochi</option>
            <option value="notion">Notion</option>
            <option value="custom">Customizado</option>
          </select>

          <button
            onClick={toggleVisibility}
            className="ml-2 flex items-center gap-1 text-[9px] font-bold text-error-ink hover:brightness-110 transition-colors cursor-pointer border-none bg-transparent"
            title="Ocultar do Layout"
          >
            <EyeOff className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Resize Handles */}
      {editMode && canResizeWidth && (
        <div 
          className={`absolute ${resizeHandlePosition === 'left' ? '-left-2 rounded-l-3xl' : '-right-2 rounded-r-3xl'} top-0 bottom-0 w-4 cursor-col-resize z-50 hover:bg-rare/20 flex flex-col justify-center items-center group`}
          onPointerDown={handlePointerDownRight}
        >
          <div className="h-8 w-1 bg-rare/40 rounded-full group-hover:bg-rare transition-colors" />
        </div>
      )}

      {editMode && canResizeHeight && (
        <div 
          className="absolute -bottom-2 left-0 right-0 h-4 cursor-row-resize z-50 hover:bg-rare/20 rounded-b-3xl flex justify-center items-center group"
          onPointerDown={handlePointerDownBottom}
        >
          <div className="w-8 h-1 bg-rare/40 rounded-full group-hover:bg-rare transition-colors" />
        </div>
      )}

      {/* Content wrapper. Height is a floor (min-height), never a hard cap:
          the panel grows with its content and the page scrolls as one, so a
          resized panel keeps its size without trapping content behind a second
          inner scrollbar. Panels that need their own scroll region manage it
          on their inner content. */}
      <div
        style={{
          minHeight: canResizeHeight && currentHeight > 0 ? `${currentHeight}px` : undefined,
        }}
        className={`h-full flex flex-col flex-1 min-h-0 ${editMode ? 'mt-4 mb-2 mx-2' : ''}`}
      >
        {children}
      </div>
    </div>
  );
}
