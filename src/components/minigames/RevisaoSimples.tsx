import { useState } from 'react';

import { reviewCard } from '../../data/rotas/vocabulario';
import { t } from '../../lib/i18n';
import type { VocabCard } from '../../types';

interface Props {
  itens: VocabCard[];
  aoFechar: () => void;
  /** Injetável nos testes; no app é a rota de revisão que já grava a memória (FSRS). */
  revisar?: typeof reviewCard;
}

/**
 * REVISÃO SIMPLES: frente, "lembrei" ou "não lembrei", e a nota vai para a memória como qualquer
 * outra. Sem mecânica de jogo: é o piso para o item que nenhum jogo atende (tarefa 4.3).
 */
export default function RevisaoSimples({ itens, aoFechar, revisar = reviewCard }: Props) {
  const [i, setI] = useState(0);
  const [erro, setErro] = useState(false);
  const atual = itens[i];

  const nota = async (grade: 1 | 3) => {
    if (!atual) return;
    setErro(false);
    try {
      await revisar(atual.id, grade, undefined, { origem: 'revisao', formato: 'lembrar' });
      setI((n) => n + 1);
    } catch {
      setErro(true);
    }
  };

  if (!atual) {
    return (
      <div className="qj-nota" role="status" data-testid="so-revisao">
        <p>{t('Revisão concluída.')}</p>
        <button type="button" onClick={aoFechar}>
          {t('Fechar')}
        </button>
      </div>
    );
  }

  return (
    <div className="qj-nota" data-testid="so-revisao">
      <p>{t('{atual} de {total}', { atual: i + 1, total: itens.length })}</p>
      <p>
        <b data-testid="so-revisao-palavra">{atual.word}</b>
      </p>
      <p>{t('Você lembra o que significa?')}</p>
      <button type="button" onClick={() => void nota(3)}>
        {t('Lembrei')}
      </button>{' '}
      <button type="button" onClick={() => void nota(1)}>
        {t('Não lembrei')}
      </button>{' '}
      <button type="button" onClick={aoFechar}>
        {t('Fechar')}
      </button>
      {erro && <p role="alert">{t('Não deu para salvar esta nota. Tente de novo.')}</p>}
    </div>
  );
}
