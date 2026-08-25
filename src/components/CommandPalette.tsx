import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Search, CornerDownLeft } from 'lucide-react';

/**
 * PALETA DE COMANDOS (Ctrl/⌘ + K).
 *
 * Existe porque a queixa central da Central de Exercícios era "sempre é um desafio encontrar as
 * funcionalidades". Navegar por abas e cards é uma busca visual; digitar o nome é uma busca direta.
 * Este é o gesto que torna a tela MEMORÁVEL: você não precisa lembrar ONDE fica um exercício, só
 * COMO ele se chama.
 *
 * Componente genérico — recebe os comandos de quem monta. Não conhece exercício nenhum.
 */
export interface Command {
  id: string;
  label: string;
  /** Linha secundária: no que o comando roda ("34 frases desta sessão"). Deve ser um dado REAL. */
  hint?: string;
  icon?: React.ReactNode;
  /** Palavras extras que também encontram este comando. */
  keywords?: string;
  /** Quando presente, o comando aparece desabilitado com este motivo (honesto, não some da lista). */
  disabledReason?: string;
  /**
   * Cabeçalho sob o qual o comando aparece ("suas gravações", "suas palavras", "ir para").
   *
   * Existe porque a busca global mistura coisas de naturezas diferentes: uma gravação, uma palavra
   * do caderno e um destino de navegação são três respostas para "chav" e não se leem como lista
   * única. A ordem dos grupos é a de PRIMEIRA APARIÇÃO na lista de comandos — assim quem monta a
   * busca controla a prioridade sem um campo de peso para manter em sincronia.
   */
  grupo?: string;
  run: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  commands: Command[];
  placeholder?: string;
}

export default function CommandPalette({ open, onClose, commands, placeholder = 'Buscar exercício…' }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setCursor(0);
      // O foco tem de esperar o elemento existir no DOM.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter(c =>
      c.label.toLowerCase().includes(q) ||
      (c.hint ?? '').toLowerCase().includes(q) ||
      (c.keywords ?? '').toLowerCase().includes(q)
    );
  }, [commands, query]);

  // Mantém o cursor dentro dos resultados quando a busca muda.
  useEffect(() => { setCursor(0); }, [query]);

  // Rola o item selecionado para a vista (navegação por teclado tem de funcionar de verdade).
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${cursor}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [cursor]);

  if (!open) return null;

  const runAt = (i: number) => {
    const cmd = results[i];
    if (!cmd || cmd.disabledReason) return; // desabilitado continua visível, mas não executa
    onClose();
    cmd.run();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor(c => Math.min(c + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor(c => Math.max(c - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); runAt(cursor); }
    else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
  };

  return (
    <div
      /* z-[100] fica acima de TODA a pilha do app (dock 30 · partida 35 · partículas 38 · score 40 ·
         ComoSeJoga 90 · tour 95). A busca é sempre deliberada — alguém apertou ⌘K — e um diálogo de
         digitação escondido atrás de uma cortina é pior do que um que cobre a cortina: este último
         sai com Esc, o primeiro engole o que se digita sem dar sinal. */
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[12vh] px-4 bg-black/40 animate-in fade-in duration-150"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-lg bg-surface border border-border-subtle rounded-2xl shadow-card overflow-hidden animate-in zoom-in-95 slide-in-from-top-2 duration-150">
        <div className="flex items-center gap-2.5 px-4 border-b border-border-subtle">
          <Search className="w-4 h-4 text-ink-faint shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            className="flex-1 bg-transparent py-3.5 text-sm text-ink placeholder-ink-faint outline-none"
          />
          <kbd className="text-[10px] font-mono text-ink-faint border border-border-subtle rounded px-1.5 py-0.5">esc</kbd>
        </div>

        <div ref={listRef} className="max-h-[46vh] overflow-y-auto custom-scrollbar py-1.5">
          {results.length === 0 ? (
            <p className="px-4 py-8 text-center text-xs text-ink-muted">
              Nada encontrado para "<span className="font-bold text-ink">{query}</span>".
            </p>
          ) : (
            results.map((c, i) => {
              const disabled = !!c.disabledReason;
              /* Cabeçalho quando o grupo muda. Como `results` preserva a ordem dos comandos, isto
                 basta para agrupar — sem uma segunda estrutura de dados que possa sair de sincronia
                 com o índice do cursor, que é o que a navegação por teclado usa. */
              const abreGrupo = c.grupo && c.grupo !== results[i - 1]?.grupo;
              return (
                <React.Fragment key={c.id}>
                {abreGrupo && (
                  <div className="label-mono px-4 pt-3 pb-1.5 text-ink-faint">{c.grupo}</div>
                )}
                <button
                  data-idx={i}
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => runAt(i)}
                  disabled={disabled}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                    disabled ? 'opacity-45 cursor-not-allowed' : 'cursor-pointer'
                  } ${i === cursor && !disabled ? 'bg-accent-soft' : ''}`}
                >
                  {c.icon && (
                    <span className={`shrink-0 ${i === cursor && !disabled ? 'text-accent' : 'text-ink-muted'}`}>{c.icon}</span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-bold text-ink leading-tight">{c.label}</span>
                    {/* Motivo do bloqueio vence a dica: é a informação que o usuário precisa. */}
                    <span className={`block text-[11px] leading-tight ${disabled ? 'text-warn-ink' : 'text-ink-faint'}`}>
                      {c.disabledReason ?? c.hint}
                    </span>
                  </span>
                  {i === cursor && !disabled && <CornerDownLeft className="w-3.5 h-3.5 text-accent shrink-0" />}
                </button>
                </React.Fragment>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * ⌘K/Ctrl+K TEM UM DONO SÓ POR VEZ — e é o mais recente.
 *
 * O DEFEITO QUE ISTO EVITA. A versão anterior instalava um `keydown` no `window` por instância. Com
 * uma paleta só (a do Study) isso funcionava. No instante em que a busca global subiu para o shell,
 * passaram a existir DUAS: as duas ouviam a mesma tecla, as duas alternavam, e o resultado visível
 * era o atalho não fazer nada — uma abria enquanto a outra fechava. É o tipo de defeito que não
 * aparece em teste de unidade nenhum e que ninguém liga ao commit que o causou.
 *
 * A REGRA: a paleta de MAIOR PRIORIDADE atende; entre iguais, a que montou por último.
 *
 * A prioridade é explícita e não "quem montou depois" porque ordem de montagem não é confiável
 * aqui: o React roda os efeitos dos FILHOS antes dos do pai. Numa carga direta em `/revisar` o
 * Study registraria primeiro e o shell depois — e a busca global sequestraria o ⌘K de dentro da
 * tela de exercícios, exatamente o inverso do desejado. Hoje isso não acontece só porque o Study é
 * `lazy` e cai num commit posterior; é uma coincidência de empacotamento, não uma garantia.
 *
 * O listener é ÚNICO e vive enquanto houver pelo menos um interessado — não um por instância.
 *
 * @param ativo `false` retira esta paleta da disputa sem desmontá-la.
 * @param prioridade 0 é o shell (busca global). Uma tela com busca própria usa 1 e assume enquanto
 *   estiver montada.
 */
type DonoDoAtalho = { alternar: () => void; prioridade: number };
const donosDoAtalho: DonoDoAtalho[] = [];
let ouvinteInstalado: ((e: KeyboardEvent) => void) | null = null;

function aoTeclarAtalho(e: KeyboardEvent) {
  if (!((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k')) return;
  // `>=` faz o último a registrar vencer os empates, que é a leitura certa para telas irmãs.
  let dono: DonoDoAtalho | null = null;
  for (const d of donosDoAtalho) if (!dono || d.prioridade >= dono.prioridade) dono = d;
  if (!dono) return;
  e.preventDefault();
  dono.alternar();
}

export function useCommandPalette(ativo = true, prioridade = 0): [boolean, (v: boolean) => void] {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!ativo) return;
    const dono: DonoDoAtalho = { alternar: () => setOpen(o => !o), prioridade };
    donosDoAtalho.push(dono);
    if (!ouvinteInstalado) {
      ouvinteInstalado = aoTeclarAtalho;
      window.addEventListener('keydown', ouvinteInstalado);
    }
    return () => {
      const i = donosDoAtalho.indexOf(dono);
      if (i >= 0) donosDoAtalho.splice(i, 1);
      if (!donosDoAtalho.length && ouvinteInstalado) {
        window.removeEventListener('keydown', ouvinteInstalado);
        ouvinteInstalado = null;
      }
    };
  }, [ativo, prioridade]);

  // Suspender fecha o que estiver aberto: deixar a paleta na tela sem atalho para fechá-la seria pior.
  useEffect(() => { if (!ativo) setOpen(false); }, [ativo]);

  return [open, setOpen];
}
