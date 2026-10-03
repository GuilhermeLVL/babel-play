import { useEffect, useRef, useState } from 'react';

import { t } from '../../../../lib/i18n';

/**
 * CORRIGIR O QUE FOI RECONHECIDO (Intérprete v3, Fase 1): o texto da fala numa caixa, para a pessoa
 * arrumar a palavra que o reconhecimento errou. Confirmar refaz a tradução; cancelar não muda nada.
 */
export default function FolhaDeEdicao({
  texto,
  lang,
  aoConfirmar,
  aoCancelar,
}: {
  texto: string;
  lang: string;
  aoConfirmar: (novo: string) => void;
  aoCancelar: () => void;
}) {
  const [valor, setValor] = useState(texto);
  const campo = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    campo.current?.focus();
    campo.current?.select();
  }, []);
  const limpo = valor.trim();
  const confirmar = () => {
    if (limpo && limpo !== texto.trim()) aoConfirmar(limpo);
    else aoCancelar();
  };
  return (
    <div className="int-folha" role="dialog" aria-modal="true" aria-label={t('Corrigir a fala')} data-testid="int-edicao">
      <div className="int-folha-corpo">
        <label className="int-folha-rotulo" htmlFor="int-edicao-texto">
          {t('O que foi dito')}
        </label>
        <textarea
          id="int-edicao-texto"
          ref={campo}
          lang={lang}
          value={valor}
          rows={3}
          onChange={(e) => setValor(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              aoCancelar();
            } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              confirmar();
            }
          }}
        />
        <div className="int-folha-acoes">
          <button type="button" className="int-ib" onClick={aoCancelar}>
            {t('Cancelar')}
          </button>
          <button type="button" className="int-ib int-ib-pri" onClick={confirmar} disabled={!limpo}>
            {t('Corrigir e traduzir')}
          </button>
        </div>
      </div>
    </div>
  );
}
