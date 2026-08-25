import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Sparkles, Search, Check } from 'lucide-react';
import { LANGUAGES, langMatches } from '../lib/languages';
import { usePosicaoFlutuante } from '../lib/posicaoFlutuante';
import { LangFlag } from './LangFlag';

/**
 * SELETOR DE IDIOMA com bandeira NA LISTA.
 *
 * Por que não é um `<select>`: a `<option>` nativa aceita SÓ TEXTO — nenhuma imagem, ícone ou SVG
 * entra ali. A única forma de "bandeira" num select é o emoji, que no Windows não renderiza (vira
 * as letras "BR"/"US"), que é justamente o motivo de usarmos SVG. De quebra, o popup nativo é
 * desenhado pelo sistema: fica com a lista branca do Windows por cima do tema escuro do app.
 *
 * Esta lista é nossa: bandeira em cada linha, cores do tema, e busca por digitação — com 32
 * idiomas, rolar até "Українська" era pior do que digitar "ucr".
 *
 * Acessibilidade (padrão combobox+listbox da WAI-ARIA): o gatilho é `role="combobox"` com
 * `aria-expanded`/`aria-controls`; a lista é `role="listbox"` com `aria-activedescendant` seguindo
 * a opção destacada. Teclado: ↑/↓ navega, Enter/Espaço escolhe, Esc fecha (devolvendo o foco ao
 * gatilho), Home/End vão às pontas, e digitar filtra. O foco NUNCA sai do campo de busca enquanto
 * aberto — é o que permite navegar e filtrar sem trocar de mão.
 */

export interface LangPickerProps {
  /** BCP-47 selecionado. Ignorado quando `auto` é true. */
  value: string;
  /** Modo "detectar automaticamente" ativo. */
  auto?: boolean;
  /** Oferece a opção "automático" no topo. */
  allowAuto?: boolean;
  /** Texto dessa opção — na Leitura ela significa "segue o modo", não "detecta o idioma". */
  autoLabel?: string;
  onPick: (v: { auto: boolean; code?: string }) => void;
  /** Caixa destacada (usada no idioma do conteúdo/estudo). */
  accent?: boolean;
  /** Ocupa toda a largura (telas de configuração) em vez de encolher ao conteúdo. */
  block?: boolean;
  /** id do gatilho — para `<label htmlFor>`. */
  id?: string;
  ariaLabel?: string;
  className?: string;
}

const AUTO_KEY = '__auto__';

export default function LangPicker({
  value, auto = false, allowAuto = false, autoLabel = 'Detectar automaticamente',
  onPick, accent = false, block = false, id, ariaLabel, className = '',
}: LangPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const listboxId = `${id || 'lang'}-listbox`;
  const popupRef = useRef<HTMLDivElement | null>(null);

  /**
   * ONDE O POPUP ABRE — e por que ele mora no `body`.
   *
   * DOIS DEFEITOS, um dentro do outro. O primeiro: a posição horizontal era `right-0` cravada,
   * porque "estes seletores ficam à direita do cabeçalho". Era verdade onde ele nasceu e deixou
   * de ser quando o mesmo componente foi parar no canto ESQUERDO da tela de jogos — a lista abria
   * em `left: -110px`, cortada pela metade.
   *
   * O segundo, e o pior: mesmo bem posicionada, a lista era RECORTADA. Ela ficava dentro de um
   * `.card-panel`, que tem `overflow: hidden`, e um popup de 293px era espremido nos 56px da
   * barra. Nenhum ajuste de coordenada resolve isso: o problema é o ancestral.
   *
   * Daí o portal. No `body`, com `position: fixed`, não há ancestral que recorte — e a conta da
   * posição mora em `lib/posicaoFlutuante`, compartilhada com os outros menus do app, porque este
   * defeito apareceu duas vezes em telas diferentes.
   */
  const caixa = usePosicaoFlutuante(open, triggerRef, {
    largura: block ? 'ancora' : 288, // 288 = w-72
    alturaEstimada: 300,
  });

  /** Opções visíveis: "automático" (quando permitido) + idiomas filtrados pela busca. */
  const options = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base: Array<{ key: string; label: string; code?: string; isAuto?: boolean }> = [];
    if (allowAuto && (!q || `${autoLabel.toLowerCase()} automatico auto`.includes(q))) {
      base.push({ key: AUTO_KEY, label: autoLabel, isAuto: true });
    }
    for (const l of LANGUAGES) {
      // `langMatches` casa pelo rótulo nativo, pelo NOME EM PORTUGUÊS e pelo código, tudo sem
      // acento: sem isso, buscar "japonês" não achava 日本語 (o rótulo está no idioma nativo).
      if (langMatches(l, q)) base.push({ key: l.code, label: l.label, code: l.code });
    }
    return base;
  }, [query, allowAuto, autoLabel]);

  const selectedKey = auto ? AUTO_KEY : value;
  const selectedLabel = auto
    ? autoLabel
    : (LANGUAGES.find(l => l.code === value)?.label ?? value);

  // Ao abrir: foco na busca e destaque já na opção atual (não no topo da lista).
  useEffect(() => {
    if (!open) return;
    setQuery('');
    const idx = options.findIndex(o => o.key === selectedKey);
    setActiveIdx(idx >= 0 ? idx : 0);
    // rAF: o input só existe depois da pintura.
    const r = requestAnimationFrame(() => searchRef.current?.focus());
    return () => cancelAnimationFrame(r);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Filtrar move o destaque para o primeiro resultado (senão o Enter escolhe algo fora da vista).
  useEffect(() => { if (open) setActiveIdx(0); }, [query, open]);

  // Mantém a opção destacada visível durante a navegação por teclado.
  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLElement>('[data-active="true"]')
      ?.scrollIntoView({ block: 'nearest' });
  }, [activeIdx, open]);

  // Clique fora / perda de foco fecha (sem engolir cliques dentro do popup).
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const alvo = e.target as Node;
      // O popup vive no `body`, então NÃO é descendente da raiz: sem checá-lo também, clicar
      // dentro da própria lista a fecharia antes de a escolha acontecer.
      if (rootRef.current?.contains(alvo) || popupRef.current?.contains(alvo)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const choose = (opt: { key: string; code?: string; isAuto?: boolean }) => {
    onPick(opt.isAuto ? { auto: true } : { auto: false, code: opt.code });
    setOpen(false);
    triggerRef.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(true); }
      return;
    }
    if (e.key === 'Escape') { e.preventDefault(); setOpen(false); triggerRef.current?.focus(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, options.length - 1)); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); return; }
    if (e.key === 'Home') { e.preventDefault(); setActiveIdx(0); return; }
    if (e.key === 'End') { e.preventDefault(); setActiveIdx(options.length - 1); return; }
    if (e.key === 'Enter') {
      e.preventDefault();
      const opt = options[activeIdx];
      if (opt) choose(opt);
    }
  };

  return (
    <div ref={rootRef} className={`relative ${block ? 'w-full' : 'inline-block'} ${className}`}>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        onClick={() => setOpen(o => !o)}
        onKeyDown={onKeyDown}
        className={`flex items-center gap-1.5 border rounded-lg cursor-pointer transition-colors outline-none focus-visible:border-accent ${
          block ? 'w-full justify-between px-3 py-2.5 text-[13px]' : 'px-2 py-1 text-[11px]'
        } ${accent ? 'bg-accent-soft/50 border-accent/30 text-accent-ink' : 'bg-canvas border-border-subtle text-ink'} ${
          auto ? 'ring-1 ring-accent/40' : ''
        } ${open ? 'border-accent' : ''}`}
      >
        <span className="flex items-center gap-1.5 min-w-0">
          {auto
            ? <Sparkles className="w-3.5 h-3.5 text-accent shrink-0" aria-hidden />
            : <LangFlag code={value} className="w-4 h-3" />}
          <span className="font-bold truncate">{selectedLabel}</span>
        </span>
        <ChevronDown className={`w-3.5 h-3.5 shrink-0 opacity-60 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>

      {open && caixa && createPortal(
        <div
          ref={popupRef}
          // `w-72` (288px) porque "Detectar automaticamente" não cabia em 240 e vinha cortado.
          // `fixed` + portal no `body`: ver `posicionar` — dentro da árvore, um `.card-panel`
          // com `overflow: hidden` recortava a lista inteira.
          style={{ top: caixa.top, left: caixa.left, width: caixa.largura }}
          className="fixed z-[70] bg-surface border border-border-subtle rounded-xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150"
        >
          <div className="flex items-center gap-1.5 px-2.5 py-2 border-b border-border-subtle">
            <Search className="w-3.5 h-3.5 text-ink-faint shrink-0" aria-hidden />
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Buscar idioma…"
              aria-label="Buscar idioma"
              aria-controls={listboxId}
              aria-activedescendant={options[activeIdx] ? `${listboxId}-${options[activeIdx].key}` : undefined}
              className="flex-1 min-w-0 bg-transparent text-[12px] text-ink outline-none placeholder-ink-faint"
            />
          </div>
          <ul
            ref={listRef}
            id={listboxId}
            role="listbox"
            aria-label={ariaLabel || 'Idiomas'}
            className="max-h-64 overflow-y-auto custom-scrollbar py-1"
          >
            {options.length === 0 && (
              <li className="px-3 py-2 text-[12px] text-ink-faint">Nenhum idioma encontrado.</li>
            )}
            {options.map((o, i) => {
              const isSelected = o.key === selectedKey;
              const isActive = i === activeIdx;
              return (
                <li
                  key={o.key}
                  id={`${listboxId}-${o.key}`}
                  role="option"
                  aria-selected={isSelected}
                  data-active={isActive}
                  onMouseEnter={() => setActiveIdx(i)}
                  onClick={() => choose(o)}
                  className={`flex items-center gap-2 px-3 py-1.5 text-[12.5px] cursor-pointer ${
                    isActive ? 'bg-accent-soft text-accent-ink' : 'text-ink'
                  } ${isSelected ? 'font-bold' : 'font-medium'}`}
                >
                  {o.isAuto
                    ? <Sparkles className="w-4 h-3 text-accent shrink-0" aria-hidden />
                    : <LangFlag code={o.code!} className="w-4 h-3" />}
                  <span className="flex-1 truncate">{o.label}</span>
                  {isSelected && <Check className="w-3.5 h-3.5 shrink-0 text-accent" aria-hidden />}
                </li>
              );
            })}
          </ul>
        </div>,
        document.body,
      )}
    </div>
  );
}
