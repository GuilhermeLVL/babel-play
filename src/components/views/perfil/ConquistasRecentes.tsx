import { CONQUISTAS } from '@core';
import { ArrowRight, Award, Target } from 'lucide-react';

import { conquistasDesbloqueadas, dataDaConquista } from '../../../lib/conquistasPosse';
import { data, t } from '../../../lib/i18n';
import { irPara } from '../../../lib/irPara';
import { iconeDaConquista } from '../../iconesDaConquista';

/**
 * CONQUISTAS RECENTES — a seção de Perfil → Progresso do protótipo aprovado: as últimas
 * desbloqueadas, com data e recompensa, e "Ver todas" para Personalizar → Desafios. Sem nenhuma, o
 * vazio do protótipo com "Revisar agora".
 *
 * A posse vem de `lib/conquistasPosse` (a mesma que Desafios usa para marcar "Feita").
 */

function quando(ts: number | null): string {
  if (!ts) return 'desbloqueada';
  const d = new Date(ts);
  return d.toDateString() === new Date().toDateString() ? 'hoje' : data(d, { day: '2-digit', month: 'short' });
}

export default function ConquistasRecentes() {
  const feitas = conquistasDesbloqueadas();
  const recentes = CONQUISTAS.filter((c) => feitas.has(c.id))
    .map((c) => ({ c, em: dataDaConquista(c.id) }))
    .sort((a, b) => (b.em ?? 0) - (a.em ?? 0))
    .slice(0, 4);

  /* QUEST: as mesmas quatro últimas, uma por linha, com "Ver todas"; sem nenhuma, o vazio com o único
     passo para sair dele. */
  return (
    <section className="q-secao">
      <header>
        <div>
          <h2>{t('Conquistas recentes')}</h2>
        </div>
        <button type="button" className="q-ctl" onClick={() => irPara({ view: 'loja', lojaTab: 'conquistas' })}>
          {t('Ver todas')} <ArrowRight aria-hidden />
        </button>
      </header>
      {recentes.length ? (
        <ul className="qc-pilha" data-testid="conquistas-recentes">
          {recentes.map(({ c, em }) => {
            const Icone = iconeDaConquista(c.id);
            return (
              <li key={c.id} className="q-ajuste qc-com-icone">
                <span className="q-ic">
                  <Icone aria-hidden />
                </span>
                <div>
                  <b>{c.nome}</b>
                  <small>
                    {quando(em)} · +{c.recompensa.seeds} Seeds · +{c.recompensa.xp} XP
                  </small>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="q-vazio">
          <span className="q-ic">
            <Award aria-hidden />
          </span>
          <h3>{t('Nenhuma conquista ainda')}</h3>
          <p>{t('Revise suas primeiras palavras ou grave uma sessão: a primeira sai na hora.')}</p>
          <button type="button" className="q-ctl pri" onClick={() => irPara({ view: 'analysis', subTab: 'study' })}>
            <Target aria-hidden /> {t('Revisar agora')}
          </button>
        </div>
      )}
    </section>
  );
}
