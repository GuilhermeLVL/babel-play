/**
 * Campo de senha com toggle de visibilidade (olho). Reutilizado em login/criar/redefinir. O botão é
 * acessível por teclado (tab + enter/space), com aria-label dinâmico. O input ganha `pr-11` para o
 * ícone não sobrepor o texto nem interferir no caret.
 */
import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

export default function PasswordField(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const [mostrar, setMostrar] = useState(false);
  const { className, type: _t, ...rest } = props;
  return (
    <div className="relative">
      <input
        {...rest}
        type={mostrar ? 'text' : 'password'}
        className={`field-input pr-11 ${className ?? ''}`}
      />
      <button
        type="button"
        onClick={() => setMostrar((s) => !s)}
        aria-label={mostrar ? 'Ocultar senha' : 'Mostrar senha'}
        aria-pressed={mostrar}
        className="absolute inset-y-0 right-0 flex items-center rounded-r-xl px-3 text-ink-faint transition-colors hover:text-ink focus-visible:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft/40"
      >
        {mostrar ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
      </button>
    </div>
  );
}
