import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

import { t } from '../../../lib/i18n';

/**
 * T2b — O AVISO DO MICROFONE (spec `leitura-ativa-voz-alta`). Vem ANTES do pedido de permissão do navegador: o
 * microfone só liga no toque em "Ligar o microfone". "Agora não" volta à escolha de modo sem pedir nada. No perfil
 * protegido o texto é o infantil e o aviso aparece a cada sessão. Folha no celular, diálogo no computador.
 */
export default function AvisoDoMicrofone(props: {
  protegido: boolean;
  aoLigar: () => void;
  aoRecusar: () => void;
  /** Só no motor local (flag `leitura_voz_local`): o tamanho do modelo que vai ser baixado antes de ouvir. */
  downloadMb?: number;
}) {
  const primeiro = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    primeiro.current?.focus();
    const f = (e: KeyboardEvent) => {
      if (e.key === 'Escape') props.aoRecusar();
    };
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  /* No `body`: a tela vive numa camada com contexto próprio, e a barra do celular ficaria por cima da folha. */
  return createPortal(
    <div className="la-veu la">
      <div
        className="la-dialogo"
        role="dialog"
        aria-modal="true"
        aria-labelledby="la-aviso-titulo"
        aria-describedby="la-aviso-corpo"
        data-testid="aviso-do-microfone"
      >
        <h2 id="la-aviso-titulo">{t('O Frasy vai ouvir você ler')}</h2>
        <p id="la-aviso-corpo">
          {props.protegido
            ? t('Sua voz não sai deste aparelho e não fica guardada. Você pode desligar o microfone quando quiser.')
            : t(
                'Sua voz fica só neste aparelho. Nada é gravado nem enviado. O Frasy só guarda quais palavras você já leu.',
              )}
        </p>
        {props.downloadMb !== undefined && (
          <p data-testid="aviso-do-download">
            {props.protegido
              ? t('Para ouvir você, o Frasy baixa um ajudante de {mb} MB uma vez. Ele fica neste aparelho.', {
                  mb: props.downloadMb,
                })
              : t(
                  'Para ouvir você neste navegador, o Frasy baixa um modelo de {mb} MB uma vez. Ele roda neste aparelho e a sua voz não sai dele.',
                  { mb: props.downloadMb },
                )}
          </p>
        )}
        <div className="q-acoes">
          <button ref={primeiro} type="button" className="q-ctl pri" onClick={props.aoLigar}>
            {props.downloadMb !== undefined ? t('Baixar e ligar o microfone') : t('Ligar o microfone')}
          </button>
          <button type="button" className="q-ctl" onClick={props.aoRecusar}>
            {t('Agora não')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
