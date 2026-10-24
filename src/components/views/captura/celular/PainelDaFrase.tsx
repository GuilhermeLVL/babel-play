import '../../../../styles/painelDaFrase.css';

import { X } from 'lucide-react';
import { type ReactNode, type RefObject, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { t } from '../../../../lib/i18n';
import { comMovimento } from '../../../../lib/polimento/captura';
import { zoomDoCorpo } from '../../../../lib/zoomDoCorpo';

/**
 * A partir desta largura de JANELA o painel fica ao lado da legenda. Medido no layout real (24/10/2026): o
 * trilho do computador tem 108 px, então 1024 de janela dão 916 de tela — o primeiro tamanho em que os
 * 380 px do painel deixam à legenda mais de 500 px (uma fala grande em 2–3 linhas). Abaixo disto (tablet
 * em pé, celular), a folha baixa.
 */
const JANELA_DO_PAINEL_AO_LADO = 1024;
/**
 * Com a janela até esta altura (celular deitado), a folha baixa deixaria à legenda menos de 150 px: o
 * painel não cabe, e a frase abre na folha modal de antes.
 */
const ALTURA_EM_QUE_O_PAINEL_NAO_CABE = 459;

/** Arrastar a alça mais que isto (px) para baixo recolhe ou fecha; para cima, expande. */
const ARRASTO_QUE_FECHA_PX = 80;
const ARRASTO_QUE_EXPANDE_PX = 40;

type ModoDoPainel = 'lado' | 'baixo' | 'nao-cabe';

const casa = (q: string) => (typeof window !== 'undefined' && window.matchMedia?.(q).matches) || false;

function lerModo(): ModoDoPainel {
  if (casa(`(min-width: ${JANELA_DO_PAINEL_AO_LADO}px)`)) return 'lado';
  if (casa(`(max-height: ${ALTURA_EM_QUE_O_PAINEL_NAO_CABE}px)`)) return 'nao-cabe';
  return 'baixo';
}

/** O modo do painel nesta janela, acompanhando a troca de tamanho (girar o tablet, redimensionar). */
export function useModoDoPainel(): ModoDoPainel {
  const [modo, setModo] = useState(lerModo);
  useEffect(() => {
    const ver = () => setModo(lerModo());
    window.addEventListener('resize', ver);
    return () => window.removeEventListener('resize', ver);
  }, []);
  return modo;
}

/* COMO A FRASE FOI ABERTA. O foco só vai para o painel quando a pessoa abriu pelo teclado (Tab + Enter):
   no toque e no clique, ele fica na legenda, onde ela está tocando. Ouvido desde que o módulo carrega. */
let ultimaEntradaFoiTeclado = false;
if (typeof document !== 'undefined') {
  document.addEventListener(
    'keydown',
    (e) => {
      if (!e.metaKey && !e.ctrlKey && !e.altKey) ultimaEntradaFoiTeclado = true;
    },
    true,
  );
  document.addEventListener('pointerdown', () => (ultimaEntradaFoiTeclado = false), true);
}

/** Um `<dialog>` modal ou uma camada `aria-modal` está aberta por cima: o Esc é dela. */
function haCamadaModal(painel: HTMLElement): boolean {
  for (const d of document.querySelectorAll<HTMLElement>('dialog[open], [aria-modal="true"]')) {
    if (!painel.contains(d)) return true;
  }
  return false;
}

const editavel = (el: Element | null) =>
  !!el && (el.matches('input, textarea, select') || (el as HTMLElement).isContentEditable);

/** A frase escolhida na legenda: quem chama a marca com `data-frase-escolhida`. */
const fraseNaLegenda = () => document.querySelector<HTMLElement>('[data-frase-escolhida]');

/**
 * O PAINEL DA FRASE — a frase tocada SEM modal (pedido do dono, 24/10/2026). A folha modal cobria a tela
 * inteira com fundo escuro e impedia usar a legenda atrás; aqui a legenda segue à vista, rolando e tocável.
 *
 *   - Computador (`lado`): fixo à direita da tela, e a tela encolhe para dar lugar (`html[data-painel-da-frase]`,
 *     `painelDaFrase.css`): nada da legenda fica por baixo.
 *   - Celular e tablet em pé (`baixo`): folha baixa (~45% da altura útil, acima da barra do app), sem fundo;
 *     a alça leva a ~85% e, arrastada para baixo, recolhe ou fecha. A legenda ganha folga embaixo para a
 *     frase escolhida poder rolar para cima da folha.
 *
 * Tocar noutra frase troca o conteúdo deste MESMO painel (quem chama troca os filhos). × e Esc fecham (o Esc
 * só quando nenhuma camada modal o usa, nem um campo de texto fora do painel). Aberto pelo teclado, o foco
 * vem para o painel; ao fechar, volta para a frase.
 */
export default function PainelDaFrase({
  rotulo,
  modo,
  chave,
  aoFechar,
  refDoPainel,
  classe = '',
  children,
}: {
  rotulo: string;
  modo: Exclude<ModoDoPainel, 'nao-cabe'>;
  /** Muda quando muda a frase (ou a palavra): rola a frase para a vista e guarda a volta do foco. */
  chave: string;
  aoFechar: () => void;
  refDoPainel?: RefObject<HTMLElement | null>;
  classe?: string;
  children: ReactNode;
}) {
  const proprio = useRef<HTMLElement>(null);
  const painel = refDoPainel ?? proprio;
  const [cheia, setCheia] = useState(false);
  const fechar = useRef(aoFechar);
  fechar.current = aoFechar;
  /* A frase de onde a pessoa veio: o foco volta para ela ao fechar. */
  const origem = useRef<HTMLElement | null>(null);
  const arrasto = useRef<{ y0: number; dy: number; moveu: boolean } | null>(null);
  const acabouDeArrastar = useRef(false);

  /* A casca abre espaço para o painel (a tela encolhe ou a legenda ganha folga embaixo). */
  useLayoutEffect(() => {
    const raiz = document.documentElement;
    raiz.dataset.painelDaFrase = modo;
    return () => {
      delete raiz.dataset.painelDaFrase;
    };
  }, [modo]);
  useLayoutEffect(() => {
    const raiz = document.documentElement;
    if (cheia && modo === 'baixo') raiz.dataset.painelCheio = '';
    else delete raiz.dataset.painelCheio;
    return () => {
      delete raiz.dataset.painelCheio;
    };
  }, [cheia, modo]);

  /* Aberto pelo teclado: o foco vem para o painel. E a volta do foco, ao fechar. */
  useLayoutEffect(() => {
    const el = painel.current;
    if (ultimaEntradaFoiTeclado && el && !el.contains(document.activeElement)) el.focus({ preventScroll: true });
    return () => {
      const ativo = document.activeElement;
      const voltar = !ativo || ativo === document.body || !!el?.contains(ativo);
      if (voltar && origem.current?.isConnected) origem.current.focus({ preventScroll: true });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só ao abrir e ao fechar
  }, []);

  /* A frase escolhida: guarda a volta do foco e, se ela saiu da vista (o painel abriu por cima dela, a
     legenda encolheu), rola até ela. */
  useEffect(() => {
    const alvo = fraseNaLegenda();
    if (alvo) origem.current = alvo;
    else if (document.activeElement instanceof HTMLElement && !painel.current?.contains(document.activeElement))
      origem.current = document.activeElement;
    if (!alvo || typeof alvo.scrollIntoView !== 'function') return;
    const id = requestAnimationFrame(() =>
      alvo.scrollIntoView({ block: 'nearest', behavior: comMovimento() ? 'smooth' : 'auto' }),
    );
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a frase e o modo mudam o que está à vista
  }, [chave, modo, cheia]);

  /* Esc fecha, desde que nada mais o use: uma camada modal por cima, um campo de texto fora do painel, ou
     um controle que já tratou a tecla (`preventDefault`). */
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      const el = painel.current;
      if (e.key !== 'Escape' || e.defaultPrevented || !el) return;
      if (haCamadaModal(el)) return;
      const ativo = document.activeElement;
      if (!el.contains(ativo) && editavel(ativo)) return;
      e.preventDefault();
      fechar.current();
    };
    document.addEventListener('keydown', aoTeclar);
    return () => document.removeEventListener('keydown', aoTeclar);
  }, [painel]);

  /* A ALÇA (celular): arrastar para cima expande, para baixo recolhe ou fecha; o toque alterna. */
  const soltar = () => {
    const a = arrasto.current;
    arrasto.current = null;
    const el = painel.current;
    if (el) el.style.transform = '';
    if (!a || !a.moveu) return;
    acabouDeArrastar.current = true;
    if (a.dy <= -ARRASTO_QUE_EXPANDE_PX) setCheia(true);
    else if (a.dy >= ARRASTO_QUE_FECHA_PX) {
      if (cheia) setCheia(false);
      else fechar.current();
    }
  };

  return (
    <aside
      ref={painel as RefObject<HTMLElement>}
      className={`painel-da-frase ${classe}`}
      aria-label={rotulo}
      tabIndex={-1}
      data-modo={modo}
      data-altura={modo === 'baixo' ? (cheia ? 'cheia' : 'meia') : undefined}
    >
      <div className="pf-topo">
        {modo === 'baixo' && (
          <button
            type="button"
            className="pf-pega"
            aria-label={cheia ? t('Recolher') : t('Expandir')}
            aria-expanded={cheia}
            title={t('Arraste para baixo para fechar')}
            onClick={() => {
              if (acabouDeArrastar.current) {
                acabouDeArrastar.current = false;
                return;
              }
              setCheia((c) => !c);
            }}
            onPointerDown={(e) => {
              acabouDeArrastar.current = false;
              arrasto.current = { y0: e.clientY, dy: 0, moveu: false };
              e.currentTarget.setPointerCapture?.(e.pointerId);
            }}
            onPointerMove={(e) => {
              const a = arrasto.current;
              if (!a) return;
              a.dy = (e.clientY - a.y0) / zoomDoCorpo(); // px da janela → px do body
              if (Math.abs(a.dy) > 6) a.moveu = true;
              if (painel.current && a.dy > 0) painel.current.style.transform = `translateY(${a.dy}px)`;
            }}
            onPointerUp={soltar}
            onPointerCancel={soltar}
          >
            <span aria-hidden />
          </button>
        )}
        <button type="button" className="q-ctl pf-fechar" aria-label={t('Fechar')} onClick={() => fechar.current()}>
          <X aria-hidden />
        </button>
      </div>
      <div className="folha-corpo">{children}</div>
    </aside>
  );
}
