import React, { Suspense, useEffect, useMemo, useState } from 'react';

import { langMatches, LANGUAGES } from '../lib/languages';
import { lazyComRecarga } from '../lib/lazyComRecarga';

/* A apresentação do headset (gatilho de 60 px e a lista num diálogo no centro). Por `import()`: este
   seletor mora em várias telas, e só o Quest com as telas novas baixa o desenho e o CSS dele. */
const SeletorDeIdiomaDoQuest = lazyComRecarga(() => import('./views/ajustes/quest/SeletorDeIdiomaDoQuest'));

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
  /**
   * Restringe a lista a estes códigos (BCP-47 ou base). Usado pelo seletor de idioma DA INTERFACE:
   * lá a lista não é "todo idioma que existe" e sim "todo idioma cuja tradução está pronta" — ver
   * `IDIOMAS_DA_INTERFACE` em `lib/i18n.ts`, que sai da cobertura medida de cada catálogo.
   */
  somente?: readonly string[];
  /** id do gatilho — para `<label htmlFor>`. */
  id?: string;
  ariaLabel?: string;
  className?: string;
}

const AUTO_KEY = '__auto__';

export default function LangPicker({
  value,
  auto = false,
  allowAuto = false,
  autoLabel = 'Detectar automaticamente',
  onPick,
  accent = false,
  block = false,
  somente,
  id,
  ariaLabel,
  className = '',
}: LangPickerProps) {
  // A lista abre num diálogo no centro (`SeletorDeIdiomaDoQuest`); o estado mora aqui.
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  /** Opções visíveis: "automático" (quando permitido) + idiomas filtrados pela busca. */
  const options = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base: Array<{ key: string; label: string; code?: string; isAuto?: boolean }> = [];
    if (allowAuto && (!q || `${autoLabel.toLowerCase()} automatico auto`.includes(q))) {
      base.push({ key: AUTO_KEY, label: autoLabel, isAuto: true });
    }
    const permitido = somente ? new Set(somente.map((c) => c.toLowerCase().split('-')[0])) : null;
    for (const l of LANGUAGES) {
      if (permitido && !permitido.has(l.code.toLowerCase().split('-')[0])) continue;
      // `langMatches` casa pelo rótulo nativo, pelo NOME EM PORTUGUÊS e pelo código, tudo sem
      // acento: sem isso, buscar "japonês" não achava 日本語 (o rótulo está no idioma nativo).
      if (langMatches(l, q)) base.push({ key: l.code, label: l.label, code: l.code });
    }
    return base;
  }, [query, allowAuto, autoLabel, somente]);

  const selectedKey = auto ? AUTO_KEY : value;
  const selectedLabel = auto ? autoLabel : (LANGUAGES.find((l) => l.code === value)?.label ?? value);

  // Ao abrir: destaque já na opção atual (não no topo da lista).
  useEffect(() => {
    if (!open) return;
    setQuery('');
    const idx = options.findIndex((o) => o.key === selectedKey);
    setActiveIdx(idx >= 0 ? idx : 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Filtrar move o destaque para o primeiro resultado (senão o Enter escolhe algo fora da vista).
  useEffect(() => {
    if (open) setActiveIdx(0);
  }, [query, open]);

  const choose = (opt: { key: string; code?: string; isAuto?: boolean }) => {
    onPick(opt.isAuto ? { auto: true } : { auto: false, code: opt.code });
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, options.length - 1));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
      return;
    }
    if (e.key === 'Home') {
      e.preventDefault();
      setActiveIdx(0);
      return;
    }
    if (e.key === 'End') {
      e.preventDefault();
      setActiveIdx(options.length - 1);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const opt = options[activeIdx];
      if (opt) choose(opt);
    }
  };

  return (
    <Suspense
      fallback={<span aria-hidden className={block ? 'block w-full' : 'inline-block'} style={{ minHeight: 60 }} />}
    >
      <SeletorDeIdiomaDoQuest
        id={id}
        ariaLabel={ariaLabel}
        block={block}
        accent={accent}
        auto={auto}
        value={value}
        rotuloEscolhido={selectedLabel}
        chaveEscolhida={selectedKey}
        aberto={open}
        aoAbrir={() => setOpen(true)}
        aoFechar={() => setOpen(false)}
        busca={query}
        aoBuscar={setQuery}
        opcoes={options}
        indiceAtivo={activeIdx}
        aoTeclar={onKeyDown}
        aoEscolher={choose}
        className={className}
      />
    </Suspense>
  );
}
