import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { APPEARANCE_ATTRS, applyAppearance, readAppearance, type StyledElement } from '../lib/appearanceSync';
import { prepararJanela } from '../lib/legendas/janelaDoNavegador';

/**
 * "Relay" de legendas: renderiza os filhos numa janela Document Picture-in-Picture — uma janela
 * flutuante do navegador que fica SEMPRE NO TOPO, por cima de jogo, vídeo ou reunião.
 *
 * QUEM ABRE A JANELA É O CLIQUE (`abrirJanelaDocumento`, em `lib/legendas/janelaDoNavegador`), não
 * este componente: pedir a janela num efeito, depois do render, perdia o gesto e, quando a janela
 * mudava, a limpeza do efeito chegava a reabri-la. Aqui só se monta o conteúdo na janela recebida,
 * se mantêm estilos e tema em sincronia e se avisa quando a pessoa fecha pelo X do navegador.
 *
 * A API só existe no Chromium (Chrome/Edge). Sem ela, quem consome usa o PiP de vídeo ou o painel
 * (`caminhoDaJanela`, em `lib/legendas/janelaDoNavegador`).
 */
interface DocumentPiPProps {
  /** A janela já aberta (no gesto). `null` = nada a mostrar. */
  janela: Window | null;
  /** A janela fechou (X do navegador, ou foi fechada por fora). */
  aoFechar: () => void;
  backgroundColor?: string;
  children: React.ReactNode;
}

export default function DocumentPiP({ janela, aoFechar, backgroundColor = '#141210', children }: DocumentPiPProps) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  /* O `aoFechar` mais recente: o ouvinte do `pagehide` vive tanto quanto a janela, e o closure velho
     chamava a versão do primeiro render. */
  const aoFecharRef = useRef(aoFechar);
  aoFecharRef.current = aoFechar;
  const fundoRef = useRef(backgroundColor);
  fundoRef.current = backgroundColor;

  useEffect(() => {
    if (!janela) return;
    const desligarEstilos = prepararJanela(janela);
    janela.document.body.style.backgroundColor = fundoRef.current;
    const div = janela.document.createElement('div');
    div.className = 'w-screen h-screen overflow-hidden relative';
    janela.document.body.appendChild(div);
    setContainer(div);

    let fechou = false;
    const aoSair = () => {
      if (fechou) return;
      fechou = true;
      setContainer(null);
      aoFecharRef.current();
    };
    janela.addEventListener('pagehide', aoSair);

    /* Tema, classes, VARIÁVEIS INLINE (tema Customizado) e escala de fonte, sempre em dia
       (`lib/appearanceSync`). O conteúdo pode declarar tema próprio (`data-overlay-owns-theme`). */
    const sincronizarTema = () => {
      const raiz = janela.document.documentElement;
      const snap = readAppearance(
        document.documentElement as unknown as StyledElement,
        document.body as unknown as StyledElement,
      );
      if (raiz.hasAttribute('data-overlay-owns-theme')) {
        snap.theme = raiz.getAttribute('data-theme') || snap.theme;
        snap.rootClass = raiz.className;
      }
      applyAppearance(raiz as unknown as StyledElement, janela.document.body as unknown as StyledElement, snap);
    };
    sincronizarTema();
    const obs = new MutationObserver(sincronizarTema);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: [...APPEARANCE_ATTRS] });
    obs.observe(document.body, { attributes: true, attributeFilter: ['class'] });

    return () => {
      obs.disconnect();
      desligarEstilos();
      janela.removeEventListener('pagehide', aoSair);
      /* Desmontou (saiu da captura) ou trocou de janela: esta fecha. Nunca reabre. */
      fechou = true;
      setContainer(null);
      if (!janela.closed) janela.close();
    };
  }, [janela]);

  // Cor de fundo dinâmica sem reabrir a janela.
  useEffect(() => {
    if (janela?.document.body) janela.document.body.style.backgroundColor = backgroundColor;
  }, [backgroundColor, janela]);

  if (!janela || !container) return null;
  return createPortal(children, container);
}
