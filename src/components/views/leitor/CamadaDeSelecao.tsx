/**
 * AS ALÇAS DA SELEÇÃO (flag `leitor_selecao_firme`, openspec `leitura-assistida`, Fatia A): duas alças desenhadas FORA do
 * documento do livro (por isso chegam ao app também no Safari, onde o iframe sem script não entrega eventos), que movem o
 * início e o fim da seleção de palavra em palavra. Só elas passam do bloco, de propósito. As teclas ← → movem a alça focada.
 *
 * Lê a seleção viva do barramento (`lib/leitor/barramentoDaSelecao.ts`) e devolve o novo trecho por `aoAjustar`.
 */
import '../../../styles/leitorSelecao.css';

import { useCallback, useEffect, useRef, useState } from 'react';

import { t } from '../../../lib/i18n';
import { barramentoDaSelecao, type SelecaoViva } from '../../../lib/leitor/barramentoDaSelecao';
import { alcaNoPonto, moverAlca } from '../../../lib/leitor/selecao';

type Ponta = 'ini' | 'fim';

interface Posicao {
  ini: { x: number; y: number };
  fim: { x: number; y: number };
  /** Altura de uma linha do trecho (o dedo toca na alça, abaixo da linha, e a palavra lida é a da linha). */
  linha: number;
}

/** Onde desenhar as alças (em pixels da janela): o canto de baixo do início e o do fim do trecho. */
function posicaoDas(v: SelecaoViva): Posicao | null {
  const moldura = v.doc.defaultView?.frameElement?.getBoundingClientRect();
  const caixas = Array.from(v.range.getClientRects()).filter((c) => c.width > 0 && c.height > 0);
  if (!moldura || caixas.length === 0) return null;
  const a = caixas[0];
  const b = caixas[caixas.length - 1];
  return {
    ini: { x: moldura.left + a.left, y: moldura.top + a.bottom },
    fim: { x: moldura.left + b.right, y: moldura.top + b.bottom },
    linha: b.height,
  };
}

const igual = (a: Posicao | null, b: Posicao | null) =>
  a === b ||
  (!!a &&
    !!b &&
    a.ini.x === b.ini.x &&
    a.ini.y === b.ini.y &&
    a.fim.x === b.fim.x &&
    a.fim.y === b.fim.y &&
    a.linha === b.linha);

export default function CamadaDeSelecao({
  idioma,
  aoAjustar,
}: {
  idioma: string;
  /** O trecho mudou pela alça: quem monta a tela atualiza a barra e publica no barramento (`origem: 'alca'`). */
  aoAjustar: (r: Range, indice: number) => void;
}) {
  const [viva, setViva] = useState<SelecaoViva | null>(() => barramentoDaSelecao.selecaoAtual());
  const [pos, setPos] = useState<Posicao | null>(null);
  const arrastando = useRef<Ponta | null>(null);

  useEffect(() => {
    const fora1 = barramentoDaSelecao.aoSelecionar(() => setViva(barramentoDaSelecao.selecaoAtual()));
    const fora2 = barramentoDaSelecao.aoLimpar(() => setViva(null));
    return () => {
      fora1();
      fora2();
    };
  }, []);

  /* O livro rola, pagina e muda de tamanho sem avisar: confere a posição enquanto houver trecho. */
  useEffect(() => {
    if (!viva) return setPos(null);
    const medir = () => {
      const p = posicaoDas(viva);
      setPos((antes) => (igual(antes, p) ? antes : p));
    };
    medir();
    const id = window.setInterval(medir, 150);
    return () => window.clearInterval(id);
  }, [viva]);

  const aplicar = useCallback(
    (r: Range | null) => {
      if (!r || !viva) return;
      const sel = viva.doc.defaultView?.getSelection?.();
      sel?.removeAllRanges();
      sel?.addRange(r);
      aoAjustar(r, viva.indice);
    },
    [viva, aoAjustar],
  );

  if (!viva || !pos) return null;

  const aoMover = (ponta: Ponta) => (e: React.PointerEvent<HTMLDivElement>) => {
    if (arrastando.current !== ponta) return;
    const moldura = viva.doc.defaultView?.frameElement?.getBoundingClientRect();
    if (!moldura) return;
    /* O dedo está na alça (abaixo da linha): a palavra lida é a da linha, acima do dedo. */
    const x = e.clientX - moldura.left;
    const y = e.clientY - moldura.top - 22 - pos.linha / 2;
    aplicar(alcaNoPonto(viva.doc, viva.range, ponta, x, y, idioma));
  };

  const alca = (ponta: Ponta) => {
    const p = pos[ponta];
    return (
      <div
        key={ponta}
        role="button"
        tabIndex={0}
        data-testid={`alca-${ponta === 'ini' ? 'inicio' : 'fim'}`}
        className="leitor-alca"
        data-ponta={ponta}
        aria-label={ponta === 'ini' ? t('Mover o início da seleção') : t('Mover o fim da seleção')}
        style={{ left: p.x, top: p.y }}
        onPointerDown={(e) => {
          e.preventDefault();
          e.currentTarget.setPointerCapture(e.pointerId);
          arrastando.current = ponta;
        }}
        onPointerMove={aoMover(ponta)}
        onPointerUp={() => (arrastando.current = null)}
        onPointerCancel={() => (arrastando.current = null)}
        onKeyDown={(e) => {
          const dir =
            e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
          if (!dir) return;
          e.preventDefault();
          aplicar(moverAlca(viva.range, ponta, dir, idioma));
        }}
      />
    );
  };

  return (
    <div className="leitor-alcas" aria-hidden={false}>
      {alca('ini')}
      {alca('fim')}
    </div>
  );
}
