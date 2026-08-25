/**
 * NOTIFICAÇÕES — o canal que a app não tinha.
 *
 * POR QUE ISTO EXISTE. Até aqui a app tinha exatamente duas formas de falar com o usuário quando algo
 * dava errado, e as duas eram ruins:
 *
 *   1. `console.error` (14 ocorrências). O usuário clica em "gravar", o `getUserMedia` estoura
 *      `NotAllowedError`, e a tela **não muda em nada**. Não há erro, não há aviso, não há pista. O
 *      usuário conclui que o botão está quebrado — e, do ponto de vista dele, está.
 *   2. `alert()`/`confirm()` nativos (6 ocorrências). Bloqueiam a thread, ignoram os 6 temas do projeto
 *      e dizem "localhost:5173 diz:" antes da mensagem.
 *
 * FORMATO. Um store de módulo com pub/sub, não um Context. É de propósito: metade dos erros que
 * precisam aparecer acontece FORA da árvore de componentes — dentro de `recognition.onerror`, do
 * `catch` de um `getUserMedia`, de um handler do MediaRecorder. Um `useToast()` não alcança esses
 * lugares sem que cada um deles passe a receber o hook por prop. Uma função importável, sim.
 *
 * `askConfirm()` devolve `Promise<boolean>` — é o substituto honesto do `confirm()` nativo, que os
 * toasts não podem substituir (um toast não espera resposta; uma exclusão precisa esperar).
 */
import React, { useEffect, useState, useCallback } from 'react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { play } from '../lib/soundFx';

export type ToastKind = 'error' | 'warn' | 'ok' | 'info';

interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
  /** Detalhe técnico (o `err.message` real). Nunca inventado — se não houver, não aparece. */
  detail?: string;
  action?: ToastAction;
  /** ms até sumir. `0` = fica até o usuário fechar (é o padrão para erro). */
  duration: number;
}

type Listener = (items: ToastItem[]) => void;

let items: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<Listener>();

function emit() {
  const snapshot = items;
  listeners.forEach((l) => l(snapshot));
}

function dismissToast(id: number) {
  items = items.filter((t) => t.id !== id);
  emit();
}

interface ToastOptions {
  detail?: unknown;
  action?: ToastAction;
  duration?: number;
}

/** Extrai a mensagem REAL do erro. Sem `String(err)` cru ("[object Object]") e sem inventar texto. */
function detailOf(detail: unknown): string | undefined {
  if (detail == null) return undefined;
  if (detail instanceof Error) return detail.message || detail.name;
  if (typeof detail === 'string') return detail.trim() || undefined;
  return undefined;
}

function push(kind: ToastKind, message: string, opts: ToastOptions = {}): number {
  const id = nextId++;
  const item: ToastItem = {
    id,
    kind,
    message,
    detail: detailOf(opts.detail),
    action: opts.action,
    // Erro fica até o usuário dispensar: se some sozinho, volta a ser invisível — que é o bug que
    // este módulo existe para corrigir.
    duration: opts.duration ?? (kind === 'error' ? 0 : 4000),
  };
  items = [...items, item];
  emit();
  /* SOM DO ERRO — aqui, no `push`, e não em cada `catch` da app.
     Todo erro visível ao usuário passa por esta função; ligar o som neste ponto cobre os ~40
     chamadores de uma vez e garante que nenhum erro futuro nasça mudo. `ok` também soa, porque
     confirmação de sucesso é o par natural. `warn`/`info` ficam silenciosos de propósito: são
     frequentes demais para virarem barulho. */
  if (kind === 'error') play('error');
  else if (kind === 'ok') play('success');
  return id;
}

export const toast = {
  error: (message: string, opts?: ToastOptions) => push('error', message, opts),
  warn: (message: string, opts?: ToastOptions) => push('warn', message, opts),
  ok: (message: string, opts?: ToastOptions) => push('ok', message, opts),
  info: (message: string, opts?: ToastOptions) => push('info', message, opts),
};

/* ─────────────────────────────── Confirmação ─────────────────────────────── */

export interface ConfirmRequest {
  title: string;
  detail?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Ação destrutiva (exclusão) — pinta o botão com o token de erro. */
  danger?: boolean;
}

interface PendingConfirm extends ConfirmRequest {
  resolve: (ok: boolean) => void;
}

let pendingConfirm: PendingConfirm | null = null;
const confirmListeners = new Set<(c: PendingConfirm | null) => void>();

/** Substitui o `confirm()` nativo. Devolve `true` só se o usuário confirmar de fato. */
export function askConfirm(req: ConfirmRequest): Promise<boolean> {
  return new Promise((resolve) => {
    // Se já havia um diálogo aberto, o anterior é cancelado (nunca confirmado no chute).
    if (pendingConfirm) pendingConfirm.resolve(false);
    pendingConfirm = { ...req, resolve };
    confirmListeners.forEach((l) => l(pendingConfirm));
  });
}

function closeConfirm(ok: boolean) {
  const p = pendingConfirm;
  pendingConfirm = null;
  confirmListeners.forEach((l) => l(null));
  p?.resolve(ok);
}

/* ─────────────────────────────────── UI ──────────────────────────────────── */

const STYLE: Record<ToastKind, { icon: typeof Info; ring: string; tint: string }> = {
  error: { icon: XCircle, ring: 'text-error', tint: 'bg-error-soft text-error-ink' },
  warn: { icon: AlertTriangle, ring: 'text-warn', tint: 'bg-warn-soft text-warn-ink' },
  ok: { icon: CheckCircle2, ring: 'text-good', tint: 'bg-good-soft text-good-ink' },
  info: { icon: Info, ring: 'text-accent', tint: 'bg-accent-soft text-accent-ink' },
};

function ToastCard({ item }: { item: ToastItem }) {
  const { icon: Icon, ring, tint } = STYLE[item.kind];

  useEffect(() => {
    if (!item.duration) return;
    const t = window.setTimeout(() => dismissToast(item.id), item.duration);
    return () => window.clearTimeout(t);
  }, [item.id, item.duration]);

  return (
    <div
      role={item.kind === 'error' ? 'alert' : 'status'}
      className="babel-toast card-panel flex w-80 items-start gap-3 p-3 shadow-lg"
    >
      <span className={`grid size-7 shrink-0 place-items-center rounded-md ${tint}`}>
        <Icon size={15} className={ring} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm leading-snug text-ink">{item.message}</p>
        {item.detail && (
          <p className="mt-1 break-words font-mono text-[11px] leading-snug text-ink-faint">{item.detail}</p>
        )}
        {item.action && (
          <button
            type="button"
            onClick={() => {
              item.action?.onClick();
              dismissToast(item.id);
            }}
            className="btn-ink mt-2 text-xs"
          >
            {item.action.label}
          </button>
        )}
      </div>
      <button
        type="button"
        aria-label="Fechar aviso"
        onClick={() => dismissToast(item.id)}
        className="shrink-0 rounded p-1 text-ink-faint transition-colors hover:bg-surface-hover hover:text-ink"
      >
        <X size={14} />
      </button>
    </div>
  );
}

function ConfirmDialog({ req }: { req: PendingConfirm }) {
  // Esc cancela. Um diálogo modal sem saída pelo teclado é uma armadilha.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeConfirm(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-black/40 p-4">
      <div
        role="alertdialog"
        aria-modal="true"
        className="babel-toast card-panel w-full max-w-sm p-5 shadow-xl"
      >
        <h2 className="text-base font-semibold text-ink">{req.title}</h2>
        {req.detail && <p className="mt-2 text-sm leading-relaxed text-ink-muted">{req.detail}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={() => closeConfirm(false)} className="btn-outline text-sm">
            {req.cancelLabel ?? 'Cancelar'}
          </button>
          <button
            type="button"
            autoFocus
            onClick={() => closeConfirm(true)}
            className={`btn-solid text-sm ${req.danger ? 'bg-error text-white hover:opacity-90' : ''}`}
          >
            {req.confirmLabel ?? 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Host único. Montado uma vez no `App`; sem ele, `toast()` e `askConfirm()` não têm onde aparecer. */
export default function Toaster() {
  const [list, setList] = useState<ToastItem[]>(items);
  const [confirmReq, setConfirmReq] = useState<PendingConfirm | null>(pendingConfirm);

  const onToasts = useCallback((next: ToastItem[]) => setList(next), []);

  useEffect(() => {
    listeners.add(onToasts);
    confirmListeners.add(setConfirmReq);
    return () => {
      listeners.delete(onToasts);
      confirmListeners.delete(setConfirmReq);
    };
  }, [onToasts]);

  return (
    <>
      {confirmReq && <ConfirmDialog req={confirmReq} />}
      <div
        aria-live="polite"
        className="pointer-events-none fixed bottom-4 right-4 z-[90] flex flex-col items-end gap-2"
      >
        {list.map((item) => (
          <div key={item.id} className="pointer-events-auto">
            <ToastCard item={item} />
          </div>
        ))}
      </div>
    </>
  );
}
