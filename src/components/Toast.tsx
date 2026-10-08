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
import type { LucideIcon } from 'lucide-react';
import { VolumeX, X } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';

import { t } from '../lib/i18n';
import { langLabelNaUI } from '../lib/languages';
import { useAviso } from '../lib/polimento/useAviso';
import { play } from '../lib/soundFx';
import { aoFaltarVoz } from '../lib/tts';
import { DialogoBase } from './ui/Dialogo';

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
  /** Ícone à esquerda da mensagem (lucide). Opcional — a maioria dos avisos é só texto. */
  icone?: LucideIcon;
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
  icone?: LucideIcon;
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
    icone: opts.icone,
    // Erro fica até o usuário dispensar: se some sozinho, volta a ser invisível — que é o bug que
    // este módulo existe para corrigir.
    /* 3400 ms: a vida do aviso no protótipo (`prototipo.js:688`). */
    duration: opts.duration ?? (kind === 'error' ? 0 : 3400),
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

/* O TTS não fala com voz de outro idioma (ver `falar` em lib/tts.ts): quando falta a voz, este é o
   aviso — discreto (info, some sozinho) e uma vez por idioma. */
aoFaltarVoz((lang) => {
  push(
    'info',
    t(
      'Sem voz de {idioma} neste aparelho, a leitura foi pulada. Instale uma voz nas configurações de fala do sistema.',
      {
        idioma: langLabelNaUI(lang),
      },
    ),
    { icone: VolumeX, duration: 5000 },
  );
});

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

/**
 * O AVISO — `.toast` do protótipo aprovado (`toast()`): a pílula escura no alto, à direita (no
 * celular, a faixa de largura inteira), com a barra que mostra o tempo que falta. Um de cada vez,
 * como no protótipo: o próximo entra quando o atual sai. Erro fica até ser dispensado (tem o "x").
 */
function AvisoAtual({ item }: { item: ToastItem | undefined }) {
  const caixa = useRef<HTMLDivElement>(null);
  /* A vida do aviso, a pausa com o ponteiro em cima e o arrasto para dispensar são os do protótipo
     (`src/lib/polimento/useAviso.ts`, porte de `prototipo.js:681-751`). */
  const gestos = useAviso(caixa, item?.id, item?.duration ?? 0, () => item && dismissToast(item.id));

  return (
    <div
      ref={caixa}
      className={`toast ${item ? 'on' : ''}`}
      role={item?.kind === 'error' ? 'alert' : 'status'}
      aria-live="polite"
      {...gestos}
    >
      {item && (
        <>
          {item.icone && <item.icone size={14} aria-hidden style={{ flex: 'none' }} />}
          <span>
            {item.message}
            {item.detail && (
              <small style={{ display: 'block', opacity: 0.75, fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                {item.detail}
              </small>
            )}
          </span>
          {item.action && (
            <button
              type="button"
              className="link"
              style={{ color: 'inherit' }}
              onClick={() => {
                item.action?.onClick();
                dismissToast(item.id);
              }}
            >
              {item.action.label}
            </button>
          )}
          {!item.duration && (
            <button
              type="button"
              className="link"
              style={{ color: 'inherit', display: 'grid', placeItems: 'center' }}
              aria-label="Fechar aviso"
              onClick={() => dismissToast(item.id)}
            >
              <X size={14} aria-hidden />
            </button>
          )}
        </>
      )}
    </div>
  );
}

/** A confirmação — o `<dialog>` do protótipo (`.dlg-cab` + `.dlg-pe`). Esc cancela. */
function ConfirmDialog({ req }: { req: PendingConfirm }) {
  const idTitulo = useId();
  return (
    <DialogoBase rotuloId={idTitulo} aoFechar={() => closeConfirm(false)}>
      <div className="dlg-cab">
        <div style={{ minWidth: 0 }}>
          <h2 id={idTitulo}>{req.title}</h2>
          {req.detail && (
            <p className="mut" style={{ fontSize: 13 }}>
              {req.detail}
            </p>
          )}
        </div>
      </div>
      <div className="dlg-pe">
        <button type="button" className="btn btn-outline" onClick={() => closeConfirm(false)}>
          {req.cancelLabel ?? 'Cancelar'}
        </button>
        <button
          type="button"
          data-autofocus
          className={`btn ${req.danger ? 'perigo-solid' : 'btn-solid'}`}
          onClick={() => closeConfirm(true)}
        >
          {req.confirmLabel ?? 'Confirmar'}
        </button>
      </div>
    </DialogoBase>
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

  // O mais recente aparece; ao sair, o anterior (ainda válido) volta — nada se perde.
  return (
    <>
      {confirmReq && <ConfirmDialog key={confirmReq.title} req={confirmReq} />}
      <AvisoAtual item={list[list.length - 1]} />
    </>
  );
}
