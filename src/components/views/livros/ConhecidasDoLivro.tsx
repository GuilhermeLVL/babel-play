import { useEffect, useState } from 'react';

import { useSnapshotDasEtiquetas } from '../../../lib/etiquetas/indiceDeEtiquetas';
import { t } from '../../../lib/i18n';
import { idDoCatalogo } from '../../../lib/livros/abrir';
import { estante } from '../../../lib/livros/armazem';

/**
 * A % DE PALAVRAS CONHECIDAS DO LIVRO na página dele, ANTES de abrir (flag `leitor_destaque_vocab`; tarefa C4). Calculada
 * no aparelho, com o vocabulário da pessoa, sobre a cópia que já está na estante. Sem cópia no aparelho (livro nunca
 * aberto ou formato de texto), não mostra nada: o servidor não guarda o texto, e baixar o livro só para contar não vale.
 */
export default function ConhecidasDoLivro({ livroId, idioma }: { livroId: string; idioma: string }) {
  const s = useSnapshotDasEtiquetas();
  const [pct, setPct] = useState<number | null>(null);

  useEffect(() => {
    if (!idioma || s.caderno === null) return;
    let cancelado = false;
    const fonte = { caderno: s.caderno, forcas: s.forcas, marcadas: s.marcadas };
    const espera = window.setTimeout(() => {
      void (async () => {
        const guardado = await estante.livro(idDoCatalogo(livroId));
        if (!guardado || guardado.formato !== 'epub' || cancelado) return;
        const [{ makeBook }, { MotorDoLeitor }, { conhecidasDoLivro }] = await Promise.all([
          import('../../../lib/leitor/foliate/view.js'),
          import('../../../lib/leitor/motor'),
          import('../../../lib/leitor/conhecidasDoSumario'),
        ]);
        const arquivo = new File([guardado.arquivo], guardado.nomeDoArquivo, { type: guardado.arquivo.type });
        const livro = await makeBook(arquivo);
        try {
          MotorDoLeitor.blindar(livro);
          const p = await conhecidasDoLivro({ livro, idioma, fonte, cancelado: () => cancelado });
          if (!cancelado) setPct(p);
        } finally {
          livro.destroy?.();
        }
      })().catch(() => {
        /* sem número, sem aviso: a página do livro não depende disto */
      });
    }, 300);
    return () => {
      cancelado = true;
      window.clearTimeout(espera);
    };
  }, [livroId, idioma, s.caderno, s.forcas, s.marcadas]);

  if (pct === null) return null;
  return (
    <div data-testid="livro-conhecidas">
      <dt>{t('Palavras que você já conhece')}</dt>
      <dd>
        {t('cerca de {n}%', { n: pct })}
        <small>{t('Contado neste aparelho, com o seu vocabulário. Nada disso sai daqui.')}</small>
      </dd>
    </div>
  );
}
