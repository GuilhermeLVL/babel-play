import { Users, X } from 'lucide-react';

import { t } from '../../../lib/i18n';

/**
 * A DICA DA PRIMEIRA VEZ (flag `avatar_elenco`): discreta, dispensável e fora do caminho da leitura (não rouba o foco,
 * não é alerta). Teclado e leitor de tela: região nomeada com dois botões comuns.
 */
export default function DicaDoElenco({
  personagens,
  aoAbrir,
  aoFechar,
}: {
  personagens: number;
  aoAbrir: () => void;
  aoFechar: () => void;
}) {
  return (
    <section className="leitor-dica" data-testid="dica-elenco" aria-label={t('Dica: elenco do livro')}>
      <Users aria-hidden className="leitor-dica-icone" />
      <p>
        {personagens === 1
          ? t('Este livro tem 1 personagem. Dê uma voz a ela.')
          : t('Este livro tem {n} personagens. Dê uma voz a cada uma.', { n: personagens })}
      </p>
      <button type="button" className="leitor-botao leitor-dica-acao" onClick={aoAbrir}>
        {t('Escolher as vozes')}
      </button>
      <button type="button" className="leitor-botao" aria-label={t('Dispensar a dica')} onClick={aoFechar}>
        <X aria-hidden />
      </button>
    </section>
  );
}
