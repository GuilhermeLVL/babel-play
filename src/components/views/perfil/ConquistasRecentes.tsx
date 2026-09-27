import { CONQUISTAS } from '@core';
import { ArrowRight, Award, Target } from 'lucide-react';

import { conquistasDesbloqueadas, dataDaConquista } from '../../../lib/conquistasPosse';
import { data } from '../../../lib/i18n';
import { irPara } from '../../../lib/irPara';
import { iconeDaConquista } from '../../iconesDaConquista';
import { IconeEmBloco, TituloDeSecao } from '../../ui';

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

  return (
    <section className="secao">
      <TituloDeSecao
        icone={Award}
        titulo="Conquistas recentes"
        direita={
          <button type="button" className="link" onClick={() => irPara({ view: 'loja', lojaTab: 'conquistas' })}>
            Ver todas <ArrowRight aria-hidden />
          </button>
        }
      />
      <div className="cartao">
        {recentes.length ? (
          <div className="p5 pilha">
            {recentes.map(({ c, em }) => (
              <div key={c.id} className="linha">
                <IconeEmBloco icone={iconeDaConquista(c.id)} tom="good" />
                <div>
                  <b>{c.nome}</b>
                  <p className="mut" style={{ fontSize: 12.5 }}>
                    {quando(em)} · +{c.recompensa.seeds} Seeds · +{c.recompensa.xp} XP
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="vazio">
            <IconeEmBloco icone={Award} />
            <h3>Nenhuma conquista ainda</h3>
            <p>Revise suas primeiras palavras ou grave uma sessão: a primeira sai na hora.</p>
            <button
              type="button"
              className="btn btn-solid"
              onClick={() => irPara({ view: 'analysis', subTab: 'study' })}
            >
              <Target aria-hidden /> Revisar agora
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
