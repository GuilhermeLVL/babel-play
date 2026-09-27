import { useEffect, useRef } from 'react';

/**
 * AS TECLAS 1–9 ESCOLHEM A ALTERNATIVA — a mesma regra nos seis jogos de múltipla escolha (QA dos
 * jogos, 2026-09-26). A casca já tinha atalho para pausar (Esc/P); faltava o da jogada, e no Duelo
 * quem joga pelo teclado tabulava até a resposta contra o relógio.
 *
 * O número é a POSIÇÃO da alternativa na tela (1 = a primeira). Digitar num campo de texto nunca
 * dispara atalho, e tecla segurada (`repeat`) também não — um "1" preso responderia a pergunta
 * seguinte sozinho.
 */
export function useAtalhosDasAlternativas(quantas: number, escolher: (indice: number) => void, habilitado: boolean) {
  const escolherRef = useRef(escolher);
  escolherRef.current = escolher;
  useEffect(() => {
    if (!habilitado || quantas <= 0) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      const alvo = e.target as HTMLElement | null;
      if (alvo && (/^(INPUT|TEXTAREA|SELECT)$/.test(alvo.tagName) || alvo.isContentEditable)) return;
      if (!/^[1-9]$/.test(e.key)) return;
      const i = Number(e.key) - 1;
      if (i >= quantas) return;
      e.preventDefault();
      escolherRef.current(i);
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [quantas, habilitado]);
}

/** A alternativa `i` do grupo `[data-tour=grupo]` dentro de `raiz` (para os efeitos que pedem o botão). */
export function botaoDaAlternativa(raiz: ParentNode | null | undefined, grupo: string, i: number): HTMLButtonElement | null {
  return (raiz ?? document).querySelectorAll<HTMLButtonElement>(`[data-tour="${grupo}"] button`)[i] ?? null;
}
