import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { toast } from './Toast';
import { readAppearance, applyAppearance, APPEARANCE_ATTRS, type StyledElement } from '../lib/appearanceSync';

/**
 * "Relay" de legendas: renderiza os filhos numa janela Document Picture-in-Picture
 * — uma janela flutuante do navegador que fica SEMPRE NO TOPO, por cima de jogo,
 * vídeo ou reunião. Copia as folhas de estilo e o `data-theme` da janela principal
 * para os tokens do design system valerem lá dentro, e mantém tudo em sincronia
 * enquanto o tema muda. `backgroundColor: 'transparent'` = o "fundo mágico".
 *
 * A API só existe no Chromium (Chrome/Edge). Sem suporte, apenas não abre — quem
 * consome trata a ausência (o botão fica desabilitado com aviso).
 */
export function isDocumentPiPSupported(): boolean {
  return typeof window !== 'undefined' && 'documentPictureInPicture' in window;
}

interface DocumentPiPProps {
  isVisible: boolean;
  onClose: () => void;
  width?: number;
  height?: number;
  backgroundColor?: string;
  children: React.ReactNode;
}

export default function DocumentPiP({
  isVisible,
  onClose,
  width = 520,
  height = 340,
  backgroundColor = '#000000',
  children,
}: DocumentPiPProps) {
  const [pipWindow, setPipWindow] = useState<Window | null>(null);
  const pipContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (isVisible && !pipWindow) {
      const openPiP = async () => {
        if (!isDocumentPiPSupported()) {
          console.warn('Document Picture-in-Picture não suportado neste navegador.');
          onClose();
          return;
        }
        try {
          const win: Window = await (window as any).documentPictureInPicture.requestWindow({ width, height });

          // Copia as folhas de estilo (inclusive as geradas pelo Tailwind em runtime).
          for (const sheet of Array.from(document.styleSheets)) {
            try {
              if (sheet.href) {
                const link = win.document.createElement('link');
                link.rel = 'stylesheet';
                link.href = sheet.href;
                win.document.head.appendChild(link);
              } else if (sheet.cssRules) {
                const style = win.document.createElement('style');
                for (const rule of Array.from(sheet.cssRules)) {
                  style.appendChild(win.document.createTextNode(rule.cssText));
                }
                win.document.head.appendChild(style);
              }
            } catch {
              /* folha cross-origin sem cssRules — ignora */
            }
          }
          // Fontes e <style> inline vão junto.
          document.querySelectorAll('link[rel="stylesheet"], link[rel="preconnect"], style').forEach((node) => {
            win.document.head.appendChild(node.cloneNode(true));
          });

          // Espelha tema e classes do <html>/<body>.
          win.document.documentElement.setAttribute('data-theme', document.documentElement.getAttribute('data-theme') || 'babel');
          win.document.documentElement.className = document.documentElement.className;
          win.document.body.className = document.body.className;

          const container = win.document.createElement('div');
          container.className = 'w-screen h-screen overflow-hidden relative';
          // Sem isto o BODY da janelinha ganha scrollbar próprio (scroll duplicado com o
          // scroll interno do painel) e margem default que desalinha o layout.
          win.document.body.style.margin = '0';
          win.document.body.style.overflow = 'hidden';
          win.document.documentElement.style.overflow = 'hidden';
          win.document.body.style.backgroundColor = backgroundColor;
          win.document.body.appendChild(container);

          pipContainerRef.current = container;
          setPipWindow(win);

          // O usuário fechou a janela pelo X do navegador.
          win.addEventListener('pagehide', () => {
            setPipWindow(null);
            pipContainerRef.current = null;
            onClose();
          });
        } catch (error) {
          // Sem isto, a janela simplesmente não abria e o botão parecia quebrado.
          console.error('Falha ao abrir a janela PiP:', error);
          toast.error('Não foi possível abrir a janela flutuante de legendas.', { detail: error });
          onClose();
        }
      };
      void openPiP();
    } else if (!isVisible && pipWindow) {
      pipWindow.close();
      setPipWindow(null);
      pipContainerRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVisible, width, height]);

  // Cor de fundo dinâmica (inclui 'transparent') sem reabrir a janela.
  useEffect(() => {
    if (pipWindow?.document.body) {
      pipWindow.document.body.style.backgroundColor = backgroundColor;
    }
  }, [backgroundColor, pipWindow]);

  // Mantém o tema da janela PiP em sincronia com a principal.
  useEffect(() => {
    if (!pipWindow) return;
    const syncTheme = () => {
      // Espelha tema, classes, VARIÁVEIS INLINE (tema Customizado) e a escala de fonte — ver
      // `lib/appearanceSync`. As duas últimas faltavam, e é por isso que o tema Customizado
      // nunca chegava aqui: as cores dele vivem em `style` inline, não em atributo observado.
      const raiz = pipWindow.document.documentElement;
      const snap = readAppearance(
        document.documentElement as unknown as StyledElement,
        document.body as unknown as StyledElement,
      );
      // O conteúdo pode declarar tema PRÓPRIO desta janela (o overlay faz isso). Nesse caso o
      // espelho não impõe o tema do app — só as variáveis e a escala de fonte continuam vindo.
      if (raiz.hasAttribute('data-overlay-owns-theme')) {
        snap.theme = raiz.getAttribute('data-theme') || snap.theme;
        snap.rootClass = raiz.className;
      }
      applyAppearance(raiz as unknown as StyledElement, pipWindow.document.body as unknown as StyledElement, snap);
      pipWindow.document.body.style.backgroundColor = backgroundColor;
    };
    syncTheme();
    const observer = new MutationObserver(syncTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: [...APPEARANCE_ATTRS] });
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, [pipWindow, backgroundColor]);

  // Fecha a janela se o componente desmontar (ex.: sair da tela de captura).
  useEffect(() => {
    return () => {
      if (pipWindow) pipWindow.close();
    };
  }, [pipWindow]);

  if (!pipWindow || !pipContainerRef.current) return null;
  return createPortal(children, pipContainerRef.current);
}
