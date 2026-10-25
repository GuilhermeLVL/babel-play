/**
 * QUE JANELA FLUTUANTE ESTE NAVEGADOR DÁ, e como abrir a Document Picture-in-Picture no gesto.
 *
 * Três caminhos, do melhor para o último recurso:
 *  - `documento`: Document PiP (Chrome, Edge). Uma janela de verdade, sempre no topo, com botões;
 *  - `video`: PiP de vídeo (Safari no Mac). As legendas desenhadas num canvas viram um vídeo que fica
 *    por cima de tudo; só leitura, com pausar (e, onde o navegador mostra, "próxima" = salvar a frase);
 *  - `painel`: nenhum dos dois (Firefox, celulares). O painel que flutua dentro da página.
 *
 * ABRIR NO GESTO: `requestWindow` exige ativação do usuário. Antes, o clique mudava um estado, o React
 * renderizava e um efeito pedia a janela depois; agora o pedido é a PRIMEIRA coisa do clique.
 */
import { type Formato, normalizarTamanhos, type Tamanho } from '../../core/legendas/janelaFlutuante';
import { classesQueAtravessam } from '../appearanceSync';

export type CaminhoDaJanela = 'documento' | 'video' | 'painel';

interface EscopoDaJanela {
  documentPictureInPicture?: { requestWindow: (o: { width: number; height: number }) => Promise<Window> };
  document?: { pictureInPictureEnabled?: boolean };
  HTMLCanvasElement?: { prototype: { captureStream?: unknown } };
  HTMLVideoElement?: { prototype: { requestPictureInPicture?: unknown } };
}

/** O PiP de vídeo com um canvas como fonte: precisa das duas APIs e do PiP ligado no navegador. */
export function suportaPiPDeVideo(escopo: unknown = globalThis): boolean {
  const g = (escopo ?? {}) as EscopoDaJanela;
  return (
    g.document?.pictureInPictureEnabled === true &&
    typeof g.HTMLCanvasElement?.prototype.captureStream === 'function' &&
    typeof g.HTMLVideoElement?.prototype.requestPictureInPicture === 'function'
  );
}

export function caminhoDaJanela(escopo: unknown = globalThis): CaminhoDaJanela {
  const g = (escopo ?? {}) as EscopoDaJanela;
  if (g.documentPictureInPicture) return 'documento';
  if (suportaPiPDeVideo(escopo)) return 'video';
  return 'painel';
}

/**
 * Pede a janela JÁ (chame direto no clique ou na tecla, antes de qualquer `setState`) e a prepara com
 * as folhas de estilo, o tema e a margem zero. Rejeita se o navegador recusar (sem gesto, outra PiP).
 */
export function abrirJanelaDocumento(tamanho: Tamanho): Promise<Window> {
  const api = (window as unknown as EscopoDaJanela).documentPictureInPicture;
  if (!api) return Promise.reject(new Error('Document Picture-in-Picture indisponível'));
  return api.requestWindow({ width: Math.round(tamanho.largura), height: Math.round(tamanho.altura) });
}

/** Copia uma folha (ou nó de estilo) para o documento da janela. */
function copiarNo(no: Node, destino: Document): Node | null {
  if (!(no instanceof HTMLElement)) return null;
  const tag = no.tagName;
  if (tag === 'STYLE' || (tag === 'LINK' && /stylesheet|preconnect/.test(no.getAttribute('rel') ?? ''))) {
    const copia = destino.importNode(no, true);
    destino.head.appendChild(copia);
    return copia;
  }
  return null;
}

/**
 * Leva as folhas de estilo e o tema para a janela, e CONTINUA levando: estilos injetados depois
 * (o CSS de um componente carregado sob demanda, o HMR do Vite) chegavam só na janela principal.
 * Devolve quem desliga a observação.
 */
export function prepararJanela(win: Window): () => void {
  const doc = win.document;
  /* As regras criadas em tempo de execução (insertRule) não estão no texto do <style>: vão uma a uma. */
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const dono = sheet.ownerNode as HTMLElement | null;
      if (sheet.href || !sheet.cssRules || (dono && dono.textContent?.trim())) continue;
      const style = doc.createElement('style');
      for (const rule of Array.from(sheet.cssRules)) style.appendChild(doc.createTextNode(rule.cssText));
      doc.head.appendChild(style);
    } catch {
      /* folha cross-origin sem cssRules — o <link> abaixo cuida dela */
    }
  }
  const copias = new Map<Node, Node>();
  document.head.querySelectorAll('link[rel="stylesheet"], link[rel="preconnect"], style').forEach((no) => {
    const copia = copiarNo(no, doc);
    if (copia) copias.set(no, copia);
  });

  doc.documentElement.setAttribute('data-theme', document.documentElement.getAttribute('data-theme') || 'babel');
  /* Menos a do cursor do app: a janela não o tem, e o ponteiro do sistema precisa aparecer nela. */
  doc.documentElement.className = classesQueAtravessam(document.documentElement.className);
  doc.body.className = document.body.className;
  /* Sem isto o BODY da janelinha ganha scrollbar próprio e margem padrão que desalinha o layout. */
  doc.body.style.margin = '0';
  doc.body.style.overflow = 'hidden';
  doc.documentElement.style.overflow = 'hidden';

  const obs = new MutationObserver((mudancas) => {
    for (const m of mudancas) {
      if (m.target === document.head) {
        m.addedNodes.forEach((no) => {
          const copia = copiarNo(no, doc);
          if (copia) copias.set(no, copia);
        });
        m.removedNodes.forEach((no) => {
          const copia = copias.get(no);
          if (copia) (copia as ChildNode).remove();
          copias.delete(no);
        });
      } else {
        /* O texto de um <style> trocou (HMR): a cópia acompanha. */
        const estilo = (m.target.nodeType === Node.TEXT_NODE ? m.target.parentNode : m.target) as Node | null;
        const copia = estilo ? copias.get(estilo) : undefined;
        if (copia && estilo) copia.textContent = estilo.textContent;
      }
    }
  });
  obs.observe(document.head, { childList: true, subtree: true, characterData: true });
  return () => obs.disconnect();
}

/** O último tamanho de cada formato, guardado neste navegador. */
export const CHAVE_DOS_TAMANHOS = 'babel.legendasFlutuantes.tamanhos';
/** "Abrir a legenda flutuante ao começar a legendar" (Ajustes da captura). */
export const CHAVE_ABRIR_AO_COMECAR = 'babel.legendasFlutuantes.abrirAoComecar';

export function lerTamanhos(): Partial<Record<Formato, Tamanho>> {
  try {
    return normalizarTamanhos(JSON.parse(localStorage.getItem(CHAVE_DOS_TAMANHOS) || '{}'));
  } catch {
    return {};
  }
}

export function guardarTamanho(formato: Formato, tamanho: Tamanho): void {
  try {
    const todos = { ...lerTamanhos(), [formato]: tamanho };
    localStorage.setItem(CHAVE_DOS_TAMANHOS, JSON.stringify(normalizarTamanhos(todos)));
  } catch {
    /* disco cheio ou bloqueado: abre no tamanho de fábrica da próxima vez */
  }
}

export function lerAbrirAoComecar(): boolean {
  try {
    return localStorage.getItem(CHAVE_ABRIR_AO_COMECAR) === '1';
  } catch {
    return false;
  }
}

export function guardarAbrirAoComecar(ligado: boolean): void {
  try {
    localStorage.setItem(CHAVE_ABRIR_AO_COMECAR, ligado ? '1' : '0');
  } catch {
    /* best-effort */
  }
}

/**
 * Redimensiona a janela aberta para o tamanho INTERNO pedido (`resizeTo` conta a moldura). Só funciona
 * dentro de um gesto da pessoa (o clique na própria janela): uma troca automática muda só o layout.
 */
export function redimensionarJanela(win: Window, tamanho: Tamanho): void {
  try {
    const mx = Math.max(0, win.outerWidth - win.innerWidth);
    const my = Math.max(0, win.outerHeight - win.innerHeight);
    win.resizeTo(Math.round(tamanho.largura + mx), Math.round(tamanho.altura + my));
  } catch {
    /* sem gesto, o navegador recusa: o layout se adapta ao tamanho que ficou */
  }
}
