import { Pin } from 'lucide-react';
import { type FormEvent, useId, useState } from 'react';

import type { FalhaDaNuance } from '../../../../data/apiDaNuance';
import { t } from '../../../../lib/i18n';

/** Os tetos do servidor (`server/ai/glossario.ts`): quem chama esconde o botão quando o termo não cabe. */
export const MAX_TERMO = 80;
export const MAX_TRADUCAO = 120;

export const cabeNoGlossario = (termo: string): boolean => {
  const n = termo.trim().length;
  return n > 0 && n <= MAX_TERMO;
};

function fraseDaFalha(m: FalhaDaNuance): string {
  switch (m) {
    case 'glossario_cheio':
      return t('Seu glossário chegou a 500 entradas. Apague alguma em Ajustes para fixar outra.');
    case 'exige_nuance':
      return t('O glossário faz parte da Tradução Nuance.');
    case 'sem_conta':
      return t('Entre na sua conta para guardar o glossário.');
    case 'invalido':
      return t('Não deu para fixar esta tradução. Confira o texto.');
    default:
      return t('Não deu para fixar agora. Tente de novo em instantes.');
  }
}

/**
 * "SEMPRE TRADUZIR ASSIM" (D3 da Fase D): a pessoa confirma (ou corrige) a tradução e ela entra no
 * glossário pessoal — a partir daí a Tradução Nuance usa a escolha dela sempre que o termo aparecer.
 * O campo já vem com a tradução da tela; o servidor saneia e confere os tetos de novo.
 */
export default function FixarNoGlossario({
  termo,
  traducaoInicial,
  origem,
  destino,
}: {
  termo: string;
  traducaoInicial: string;
  origem: string;
  destino: string;
}) {
  const id = useId();
  const [valor, setValor] = useState(traducaoInicial);
  const [gravando, setGravando] = useState(false);
  const [status, setStatus] = useState('');

  const fixar = async (e: FormEvent) => {
    e.preventDefault();
    const traducao = valor.trim();
    if (!traducao || gravando) return;
    setGravando(true);
    const { fixarNoGlossario } = await import('../../../../data/apiDaNuance');
    const r = await fixarNoGlossario({ termo: termo.trim(), traducao, origem, destino });
    setGravando(false);
    setStatus(
      r.ok === false
        ? fraseDaFalha(r.motivo)
        : t('Pronto: "{termo}" vai sair sempre como "{traducao}".', {
            termo: r.valor.termo,
            traducao: r.valor.traducao,
          }),
    );
  };

  return (
    <form className="nuance-glossario" onSubmit={(e) => void fixar(e)} style={{ display: 'grid', gap: 8 }}>
      <label className="folha-rotulo" htmlFor={id}>
        {t('Traduzir sempre como')}
      </label>
      <input
        id={id}
        className="campo"
        value={valor}
        maxLength={MAX_TRADUCAO}
        onChange={(e) => setValor(e.target.value)}
        autoComplete="off"
      />
      <button type="submit" className="folha-acao pri" disabled={!valor.trim() || gravando}>
        <Pin aria-hidden /> {t('Fixar no glossário')}
      </button>
      {status && (
        <p className="folha-status" role="status">
          {status}
        </p>
      )}
    </form>
  );
}
