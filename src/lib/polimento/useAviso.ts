/**
 * O AVISO (toast) — porte de `prototipo.js:681-751`: a vida do aviso, a pausa com o ponteiro em cima
 * e o arrasto para dispensar. A entrada e a saída pela borda de cima são do CSS trazido do protótipo
 * (`polimento.css:227-260`, `efeitos.css:199-204`).
 *
 * Itens da lista `fidelidade/casca-e-telas.md`: B31–B33.
 */
import { type PointerEvent as PonteiroDoReact, type RefObject, useEffect, useMemo, useRef } from 'react';

import { polido, reduz } from './base';
import { elastico } from './folha';

/** Depois de parar em cima ou de soltar sem dispensar, o aviso fica mais este tempo (`prototipo.js:703`). */
const RESTO_MS = 1500;
/** Solto além disto, ou mais rápido que isto, o aviso sai (`prototipo.js:735`). */
const DISTANCIA = 45;
const VELOCIDADE = 0.11; /* px/ms */

interface Arrasto {
  id: number;
  x: number;
  y: number;
  t: number;
  eixo: 'x' | 'y' | null;
  dx: number;
  dy: number;
}

/**
 * Liga a vida e o arrasto do aviso `chave` na caixa `ref`. `ms` é quanto ele fica (0 = até ser
 * dispensado). `aoSair` tira o aviso do app.
 */
export function useAviso(
  ref: RefObject<HTMLElement | null>,
  chave: string | number | undefined,
  ms: number,
  aoSair: () => void,
) {
  const sair = useRef(aoSair);
  sair.current = aoSair;
  const relogio = useRef(0);
  const arr = useRef<Arrasto | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (chave === undefined || !el) return;
    /* `toast()` de `prototipo.js:688-697`: o aviso novo não herda o arrasto do anterior. */
    el.style.transform = '';
    el.style.opacity = '';
    const marcar = (quanto: number) => {
      window.clearTimeout(relogio.current);
      if (ms) relogio.current = window.setTimeout(() => sair.current(), quanto);
    };
    marcar(ms);
    const aoMudarVisao = () => {
      if (document.hidden) window.clearTimeout(relogio.current);
      else marcar(RESTO_MS);
    };
    document.addEventListener('visibilitychange', aoMudarVisao);
    return () => {
      window.clearTimeout(relogio.current);
      document.removeEventListener('visibilitychange', aoMudarVisao);
      arr.current = null;
      el.classList.remove('px-arrastando');
    };
  }, [ref, chave, ms]);

  const gestos = useMemo(() => {
    const retomar = () => {
      window.clearTimeout(relogio.current);
      if (ms) relogio.current = window.setTimeout(() => sair.current(), RESTO_MS);
    };
    const soltar = (e: PonteiroDoReact<HTMLElement>) => {
      const a = arr.current;
      const el = e.currentTarget;
      if (!a || e.pointerId !== a.id) return;
      arr.current = null;
      el.classList.remove('px-arrastando');
      const dist = a.eixo === 'x' ? a.dx : -a.dy;
      const vel = Math.abs(dist) / (performance.now() - a.t);
      if (a.eixo && dist > 0 && (dist >= DISTANCIA || vel > VELOCIDADE)) {
        window.clearTimeout(relogio.current);
        el.style.transform = a.eixo === 'x' ? 'translateX(calc(100% + 40px))' : 'translateY(calc(-100% - 24px))';
        el.style.opacity = '0';
        window.setTimeout(() => {
          sair.current();
          el.style.transform = '';
          el.style.opacity = '';
        }, 230);
      } else {
        el.style.transform = '';
        if (!el.matches(':hover')) retomar();
      }
    };
    return {
      onPointerEnter: () => window.clearTimeout(relogio.current),
      onPointerLeave: () => {
        if (!arr.current) retomar();
      },
      onPointerDown: (e: PonteiroDoReact<HTMLElement>) => {
        if (!polido() || arr.current || reduz()) return;
        /* O toque num botão de dentro do aviso é do botão (no protótipo o aviso não tem botões). */
        if ((e.target as Element).closest('button, a')) return;
        e.currentTarget.setPointerCapture?.(e.pointerId);
        arr.current = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), eixo: null, dx: 0, dy: 0 };
      },
      onPointerMove: (e: PonteiroDoReact<HTMLElement>) => {
        const a = arr.current;
        if (!a || e.pointerId !== a.id) return;
        const dx = e.clientX - a.x;
        const dy = e.clientY - a.y;
        if (!a.eixo) {
          if (Math.hypot(dx, dy) < 6) return;
          a.eixo = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
          e.currentTarget.classList.add('px-arrastando');
        }
        /* Para a direita e para cima segue o dedo 1:1; no sentido contrário, resiste. */
        a.dx = a.eixo === 'x' ? (dx > 0 ? dx : elastico(dx)) : 0;
        a.dy = a.eixo === 'y' ? (dy < 0 ? dy : elastico(dy)) : 0;
        e.currentTarget.style.transform = `translate(${a.dx}px, ${a.dy}px)`;
      },
      onPointerUp: soltar,
      onPointerCancel: soltar,
    };
  }, [ms]);

  return gestos;
}
