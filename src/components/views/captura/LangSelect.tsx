import React from 'react';
import LangPicker from '../../LangPicker';

/**
 * Rótulo + <LangPicker/>: uma escolha só (o "Detectar automaticamente" é a primeira opção da
 * lista), com bandeira TAMBÉM na lista — o que a `<option>` nativa não permite (só aceita texto).
 */
export default function LangSelect({ id, label, icon, value, auto = false, allowAuto = false, accent = false, block = false, onPick }: {
  id: string;
  label: string;
  icon?: React.ReactNode;
  /** BCP-47 selecionado (mostrado quando NÃO está no automático). */
  value: string;
  auto?: boolean;
  allowAuto?: boolean;
  /** Caixa destacada (o idioma do conteúdo/estudo). */
  accent?: boolean;
  /** Ocupa a largura toda — a forma da gaveta, onde os campos são empilhados. */
  block?: boolean;
  onPick: (v: { auto: boolean; code?: string }) => void;
}) {
  return (
    <div className={`flex flex-col items-start gap-0.5 ${block ? 'w-full' : ''}`}>
      <span className="text-[8px] font-bold uppercase tracking-wider text-ink-faint flex items-center gap-1">
        {icon} {label}
      </span>
      <LangPicker
        id={id}
        ariaLabel={label}
        value={value}
        auto={auto}
        allowAuto={allowAuto}
        accent={accent}
        block={block}
        onPick={onPick}
      />
    </div>
  );
}
