import { CornerDownLeft, Search, SearchX } from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';

import { DialogoBase, IconeEmBloco } from './ui';

/**
 * PALETA DE COMANDOS (Ctrl/⌘ + K) — a busca `paletaCmd()` do protótipo aprovado.
 *
 * Existe porque a queixa central da Central de Exercícios era "sempre é um desafio encontrar as
 * funcionalidades". Navegar por abas e cards é uma busca visual; digitar o nome é uma busca direta.
 *
 * Marcação do protótipo (`dialog.paleta-cmd` > `.cmd` > `.cmd-busca`, `.cmd-lista`, `.cmd-pe`): o
 * `<dialog>` nativo dá o Esc e o foco preso; UM destaque (`.cmd-item.foco`) anda pelas setas, com
 * volta do fim para o começo, e o mouse o arrasta junto. O trecho digitado vem marcado (`<mark>`).
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
   * Cabeçalho sob o qual o comando aparece ("Gravações", "Palavras", "Ir para").
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
  /**
   * O que mostrar ANTES de digitar. Sem isto, a lista vazia mostra todos os comandos. A busca
   * global passa as sugestões do protótipo (revisar, continuar, capturar, as primeiras telas);
   * digitando, a busca corre sobre `commands`.
   */
  sugestoes?: Command[];
}

/** Sem acento e em minúsculas: "vocabulario" acha "Vocabulário", como no protótipo. */
const normalizar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** O trecho que casou, marcado — `marca()` do protótipo. */
function Marcado({ texto, termo }: { texto: string; termo: string }) {
  if (!termo) return <>{texto}</>;
  // Letra a letra, para o índice no texto sem acento valer no texto original.
  const base = texto
    .split('')
    .map((ch) => normalizar(ch)[0] ?? ch)
    .join('');
  const i = base.indexOf(normalizar(termo));
  if (i < 0) return <>{texto}</>;
  return (
    <>
      {texto.slice(0, i)}
      <mark>{texto.slice(i, i + termo.length)}</mark>
      {texto.slice(i + termo.length)}
    </>
  );
}

export default function CommandPalette(props: CommandPaletteProps) {
  if (!props.open) return null;
  return <Paleta {...props} />;
}

function Paleta({ onClose, commands, placeholder = 'Buscar exercício…', sugestoes }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const termo = query.trim();
  const results = useMemo(() => {
    if (!termo) return sugestoes ?? commands;
    const q = normalizar(termo);
    return commands.filter((c) => normalizar(`${c.label} ${c.hint ?? ''} ${c.keywords ?? ''}`).includes(q));
  }, [commands, sugestoes, termo]);

  // O destaque volta ao topo quando a busca muda, e nunca aponta para fora da lista.
  useEffect(() => setCursor(0), [termo]);
  const foco = Math.min(cursor, Math.max(0, results.length - 1));

  // Rola o item destacado para a vista (navegação por teclado tem de funcionar de verdade).
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${foco}"]`)?.scrollIntoView?.({ block: 'nearest' });
  }, [foco]);

  const runAt = (i: number) => {
    const cmd = results[i];
    if (!cmd || cmd.disabledReason) return; // desabilitado continua visível, mas não executa
    onClose();
    cmd.run();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const n = Math.max(1, results.length);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor((foco + 1) % n);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor((foco - 1 + n) % n);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      runAt(foco);
    }
  };

  return (
    <DialogoBase classe="paleta-cmd" rotulo="Busca" aoFechar={onClose} fecharNoFundo>
      {/* Esc fecha também por aqui, sem esperar o `cancel` nativo: em alguns navegadores ele não
          dispara quando o diálogo abriu sem gesto do teclado ou do mouse (atalho, foco no corpo). */}
      <div
        className="cmd"
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
          }
        }}
      >
        <div className="cmd-busca">
          <Search aria-hidden />
          <label className="sr" htmlFor="cmd-q">
            Buscar
          </label>
          <input
            id="cmd-q"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            autoComplete="off"
            autoFocus
            role="combobox"
            aria-expanded="true"
            aria-controls="cmd-l"
            aria-activedescendant={results.length ? `cmd-${foco}` : undefined}
          />
          <kbd>Esc</kbd>
        </div>

        <div ref={listRef} className="cmd-lista" id="cmd-l" role="listbox" aria-label="Resultados">
          {results.length === 0 ? (
            <div className="cmd-vazio">
              <IconeEmBloco icone={SearchX} />
              <b>Nada encontrado para “{termo}”</b>
              <span>Tente uma palavra do caderno, o nome de uma gravação ou de uma tela.</span>
            </div>
          ) : (
            results.map((c, i) => {
              const desabilitado = !!c.disabledReason;
              /* Cabeçalho quando o grupo muda. Como `results` preserva a ordem dos comandos, isto
                 basta para agrupar, sem uma segunda estrutura de dados que possa sair de sincronia
                 com o índice do destaque, que é o que a navegação por teclado usa. */
              const abreGrupo = c.grupo && c.grupo !== results[i - 1]?.grupo;
              const ativo = i === foco;
              const meta = c.disabledReason ?? c.hint;
              return (
                <React.Fragment key={c.id}>
                  {abreGrupo && (
                    <div className="cmd-grupo" role="presentation">
                      {c.grupo}
                    </div>
                  )}
                  <button
                    type="button"
                    role="option"
                    id={`cmd-${i}`}
                    data-idx={i}
                    className={`cmd-item ${ativo ? 'foco' : ''}`}
                    aria-selected={ativo}
                    aria-disabled={desabilitado || undefined}
                    style={desabilitado ? { opacity: 0.55, cursor: 'not-allowed' } : undefined}
                    onPointerMove={() => i !== foco && setCursor(i)}
                    onClick={() => runAt(i)}
                  >
                    <span className="cmd-ico">{c.icon}</span>
                    <span className="cmd-t">
                      <Marcado texto={c.label} termo={termo} />
                    </span>
                    {meta && <span className="cmd-meta">{meta}</span>}
                    {ativo && (
                      <span className="cmd-enter" aria-hidden>
                        <CornerDownLeft />
                      </span>
                    )}
                  </button>
                </React.Fragment>
              );
            })
          )}
        </div>

        <div className="cmd-pe">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> navegar
          </span>
          <span>
            <kbd>Enter</kbd> abrir
          </span>
          <span>
            <kbd>Esc</kbd> fechar
          </span>
        </div>
      </div>
    </DialogoBase>
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
    const dono: DonoDoAtalho = { alternar: () => setOpen((o) => !o), prioridade };
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
  useEffect(() => {
    if (!ativo) setOpen(false);
  }, [ativo]);

  return [open, setOpen];
}
