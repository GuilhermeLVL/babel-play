import type { LucideIcon } from 'lucide-react';
import { X } from 'lucide-react';
import { useEffect, useId, useRef } from 'react';

import { t } from '../../lib/i18n';

/**
 * O CARTÃO DE OFERTA — o banner discreto (não modal) e o aviso de cota.
 *
 * O DESENHO É O DO `AvisoDeConta` (Hub), de propósito: a mesma borda de acento, o mesmo fundo
 * `bg-accent-soft`, o ícone lucide à esquerda, título `font-display` e os botões `btn-solid` /
 * `btn-outline` do app. A única diferença é o lugar: flutua embaixo, centrado (o canto direito é
 * do botão do iChat), acima da dock no celular, e não empurra o conteúdo da tela.
 *
 * NÃO BLOQUEIA NADA: não prende o foco, não escurece a tela, e a tela de baixo continua clicável.
 * Anuncia-se como `status` (educado, sem interromper o leitor de tela). Esc com o foco dentro dele
 * dispensa, como o X e o "Agora não". "Não mostrar novamente" é o terceiro caminho, sempre visível.
 *
 * `aviso_cota` usa o tom de alerta (a cota é um fato da conta, não um anúncio); banner e
 * comparação usam o acento.
 */
export interface PropsDoCartaoDeOferta {
  tom: 'acento' | 'alerta';
  icone: LucideIcon;
  titulo: string;
  texto: string;
  cta: string;
  /** Selo pequeno sob o texto (ex.: o plano sugerido e o preço). */
  selo?: string;
  aoAgir: () => void;
  aoDispensar: () => void;
  aoNaoMostrar: () => void;
}

export default function CartaoDeOferta({
  tom,
  icone: Icone,
  titulo,
  texto,
  cta,
  selo,
  aoAgir,
  aoDispensar,
  aoNaoMostrar,
}: PropsDoCartaoDeOferta) {
  const idTitulo = useId();
  const ref = useRef<HTMLElement>(null);
  const alerta = tom === 'alerta';

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        aoDispensar();
      }
    };
    el.addEventListener('keydown', aoTeclar);
    return () => el.removeEventListener('keydown', aoTeclar);
  }, [aoDispensar]);

  return (
    <section
      ref={ref}
      role="status"
      aria-labelledby={idTitulo}
      data-testid="cartao-de-oferta"
      /* Acima da dock e da barra inferior (`--shell-inset-bottom`, a mesma variável do iChat). */
      style={{ bottom: 'calc(22px + var(--shell-inset-bottom, 0px))' }}
      className={`fixed left-4 right-4 md:left-1/2 md:right-auto md:-translate-x-1/2 md:w-[440px] z-[var(--z-pop)] rounded-2xl border-2 p-4 flex items-start gap-3 shadow-lg ${
        alerta ? 'border-warn/40 bg-warn-soft' : 'border-accent/40 bg-accent-soft'
      }`}
    >
      <Icone className={`w-5 h-5 shrink-0 mt-0.5 ${alerta ? 'text-warn' : 'text-accent'}`} aria-hidden />
      <div className="flex-1 min-w-0">
        <p id={idTitulo} className="font-display font-black text-[14.5px] text-ink">
          {titulo}
        </p>
        <p className="text-[12.5px] text-ink-muted mt-1 leading-relaxed">{texto}</p>
        {selo && <span className="badge acc mt-2">{selo}</span>}
        <div className="flex flex-wrap items-center gap-2 mt-3">
          <button type="button" onClick={aoAgir} className="btn-solid !py-2 !text-[12.5px]">
            {cta}
          </button>
          <button type="button" onClick={aoDispensar} className="btn-outline !py-2 !text-[12.5px]">
            {t('Agora não')}
          </button>
          <button type="button" onClick={aoNaoMostrar} className="link text-[12px]">
            {t('Não mostrar novamente')}
          </button>
        </div>
      </div>
      <button
        type="button"
        onClick={aoDispensar}
        aria-label={t('Dispensar aviso')}
        className="shrink-0 text-ink-faint hover:text-ink cursor-pointer"
      >
        <X className="w-4 h-4" aria-hidden />
      </button>
    </section>
  );
}
