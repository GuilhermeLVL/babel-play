import { Languages, Mic, PictureInPicture2 } from 'lucide-react';
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { t } from '../../lib/i18n';

/** As duas portas do "Ao vivo": a mesma captura, aberta na tela de legendar ou na de conversar. */
export type DestinoAoVivo = 'capture' | 'interprete';
type Opcao = DestinoAoVivo | 'flutuante';

export const CHAVE_ULTIMA_AO_VIVO = 'babel.aoVivo.ultima';

/** A última porta escolhida (padrão: legendar). Nunca lança: o armazenamento pode estar bloqueado. */
export function lerUltimaAoVivo(): DestinoAoVivo {
  try {
    return localStorage.getItem(CHAVE_ULTIMA_AO_VIVO) === 'interprete' ? 'interprete' : 'capture';
  } catch {
    return 'capture';
  }
}

export function guardarUltimaAoVivo(d: DestinoAoVivo): void {
  try {
    localStorage.setItem(CHAVE_ULTIMA_AO_VIVO, d);
  } catch {
    /* sem armazenamento: só não lembra */
  }
}

interface Props {
  /** O botão do trilho que abriu a escolha: dele sai a posição e para ele volta o foco. */
  ancora: HTMLElement | null;
  /** Janela estreita (barra de baixo): a escolha vira uma folha que sobe da borda. */
  folha: boolean;
  /** "Legenda flutuante" (Alt+L) só aparece com a captura rodando e a janela disponível. */
  comFlutuante: boolean;
  aoEscolher: (destino: DestinoAoVivo) => void;
  aoAbrirFlutuante: () => void;
  aoFechar: () => void;
}

/**
 * A ESCOLHA RÁPIDA DO "AO VIVO": um cartão ao lado do trilho (ou folha embaixo, no celular) com as portas
 * Legendar e Intérprete. A última usada vem destacada e com o foco: Enter abre. Setas movem, Esc fecha e
 * devolve o foco ao botão do trilho, clicar fora fecha.
 */
export function EscolhaAoVivo({ ancora, folha, comFlutuante, aoEscolher, aoAbrirFlutuante, aoFechar }: Props) {
  const [ultima] = useState(lerUltimaAoVivo);
  const opcoes: Opcao[] = comFlutuante ? ['capture', 'interprete', 'flutuante'] : ['capture', 'interprete'];
  const [ativa, setAtiva] = useState<Opcao>(ultima);
  const cartao = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    if (folha || !ancora) return;
    const r = ancora.getBoundingClientRect();
    const altura = cartao.current?.offsetHeight ?? 180;
    const top = Math.max(8, Math.min(r.top, window.innerHeight - altura - 8));
    setPos({ left: r.right + 10, top });
  }, [ancora, folha]);

  useEffect(() => {
    cartao.current?.querySelector<HTMLElement>(`[data-opcao="${ativa}"]`)?.focus();
  }, [ativa]);

  const fechar = () => {
    aoFechar();
    ancora?.focus();
  };

  useEffect(() => {
    const aoApontar = (e: PointerEvent) => {
      const alvo = e.target as Node | null;
      if (!alvo || cartao.current?.contains(alvo) || ancora?.contains(alvo)) return;
      aoFechar();
    };
    document.addEventListener('pointerdown', aoApontar, true);
    return () => document.removeEventListener('pointerdown', aoApontar, true);
  }, [ancora, aoFechar]);

  const aoTeclar = (e: React.KeyboardEvent) => {
    const i = opcoes.indexOf(ativa);
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      fechar();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
      e.preventDefault();
      setAtiva(opcoes[(i + 1) % opcoes.length]);
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      e.preventDefault();
      setAtiva(opcoes[(i - 1 + opcoes.length) % opcoes.length]);
    } else if (e.key === 'Home') {
      e.preventDefault();
      setAtiva(opcoes[0]);
    } else if (e.key === 'End') {
      e.preventDefault();
      setAtiva(opcoes[opcoes.length - 1]);
    } else if (e.key === 'Tab') {
      e.preventDefault();
      fechar();
    }
  };

  const escolher = (o: Opcao) => {
    if (o === 'flutuante') aoAbrirFlutuante();
    else {
      guardarUltimaAoVivo(o);
      aoEscolher(o);
    }
  };

  const linha = (o: Opcao, Icone: typeof Mic, titulo: string, sub: string, dica?: string) => (
    <button
      key={o}
      type="button"
      role="menuitem"
      className="q-vivo-opcao"
      data-opcao={o}
      data-ultima={o === ultima ? 'true' : undefined}
      tabIndex={o === ativa ? 0 : -1}
      aria-keyshortcuts={o === 'flutuante' ? 'Alt+L' : undefined}
      onClick={() => escolher(o)}
      onFocus={() => setAtiva(o)}
    >
      <span className="q-ic">
        <Icone aria-hidden />
      </span>
      <span className="q-vivo-texto">
        <b>{titulo}</b>
        <small>{sub}</small>
      </span>
      {dica && <kbd className="q-tecla">{dica}</kbd>}
    </button>
  );

  const miolo = (
    <div
      ref={cartao}
      className={folha ? 'q-vivo q-vivo-folha' : 'q-vivo'}
      role="menu"
      aria-label={t('Ao vivo: escolha o que fazer')}
      aria-orientation="vertical"
      onKeyDown={aoTeclar}
      style={!folha && pos ? { left: pos.left, top: pos.top } : undefined}
      data-testid="escolha-ao-vivo"
    >
      {linha('capture', Mic, t('Legendar'), t('vídeo, jogo, aula, reunião'))}
      {linha('interprete', Languages, t('Intérprete'), t('conversa frente a frente'))}
      {comFlutuante &&
        linha('flutuante', PictureInPicture2, t('Legenda flutuante'), t('por cima de outros apps'), 'Alt+L')}
    </div>
  );

  return createPortal(folha ? <div className="q-vivo-fundo">{miolo}</div> : miolo, document.body);
}
