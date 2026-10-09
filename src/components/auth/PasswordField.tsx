/**
 * Campo de senha com toggle de visibilidade (olho). Reutilizado em login/criar/redefinir. O botão é
 * acessível por teclado (tab + enter/space), com aria-label dinâmico. O input ganha `pe-11` para o
 * ícone não sobrepor o texto nem interferir no caret.
 */
import '../../styles/questEntrada.css';

import { Eye, EyeOff } from 'lucide-react';
import React, { useState } from 'react';

import { t } from '../../lib/i18n';

export default function PasswordField(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const [mostrar, setMostrar] = useState(false);
  /* Caps Lock ligado é a causa mais comum de "senha incorreta": o campo avisa enquanto a pessoa digita. */
  const [caps, setCaps] = useState(false);
  const { className, type: _t, ...resto } = props;
  const rest = {
    ...resto,
    onKeyUp: (e: React.KeyboardEvent<HTMLInputElement>) => {
      setCaps(typeof e.getModifierState === 'function' && e.getModifierState('CapsLock'));
      resto.onKeyUp?.(e);
    },
    onBlur: (e: React.FocusEvent<HTMLInputElement>) => {
      setCaps(false);
      resto.onBlur?.(e);
    },
  };
  const avisoDeCaps = caps && (
    <p className="qen-caps" role="status">
      {t('Caps Lock está ligado.')}
    </p>
  );

  /* QUEST: o campo de 60 px e o olho de 56, dentro dele (`.qen-senha` em `questEntrada.css`). */
  return (
    <>
      <div className="qen-senha">
        <input {...rest} type={mostrar ? 'text' : 'password'} className={className} />
        <button
          type="button"
          className="qen-olho"
          onClick={() => setMostrar((s) => !s)}
          aria-label={mostrar ? t('Ocultar senha') : t('Mostrar senha')}
          aria-pressed={mostrar}
        >
          {mostrar ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
        </button>
      </div>
      {avisoDeCaps}
    </>
  );
}
