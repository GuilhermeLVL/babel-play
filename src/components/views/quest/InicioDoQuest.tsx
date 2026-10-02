import { BookOpen, Flame, Gamepad2, Languages, Layers, Library, Mic } from 'lucide-react';
import React from 'react';

import type { AppMetrics } from '../../../data/api';
import { t, tp } from '../../../lib/i18n';
import type { DerivedProgress } from '../../../lib/progress';
import type { Recording } from '../../../types';

/** Uma sessão de revisão, não a fila inteira (a mesma conta do Início de sempre, `Hub.tsx`). */
const TAMANHO_DA_SESSAO = 20;

interface InicioDoQuestProps {
  onChangeView: (view: string, data?: { id?: string }) => void;
  recordings: Recording[];
  progress: DerivedProgress;
  metrics: AppMetrics | null;
  /**
   * Sem conta (e no site sem servidor), revisão, vocabulário e sessão salva abrem só o cartão "isto
   * precisa de conta". O Início não os oferece: o segundo caminho vira o Intérprete, que funciona.
   */
  semConta?: boolean;
}

const saudacao = (hora: number): string =>
  hora < 5 ? t('Boa noite') : hora < 12 ? t('Bom dia') : hora < 18 ? t('Boa tarde') : t('Boa noite');

/**
 * O INÍCIO NO META QUEST (maquete de 01/10/2026): três caminhos grandes no lugar do painel cheio de
 * números. O primeiro é sempre legendar, que é o que se faz com o headset na cabeça; o segundo muda
 * conforme há ou não palavras vencendo hoje; embaixo, a última sessão a um toque.
 *
 * Só apresentação: os números são os mesmos do Início de sempre (`metrics.dueToday`, a ofensiva de
 * `progress`) e os destinos são as mesmas telas.
 */
export default function InicioDoQuest({
  onChangeView,
  recordings,
  progress,
  metrics,
  semConta = false,
}: InicioDoQuestProps) {
  const vencidas = Math.min(metrics?.dueToday ?? 0, TAMANHO_DA_SESSAO);
  const ultima = semConta ? undefined : recordings[0];

  return (
    <div className="q-palco" data-testid="inicio-do-quest">
      <div className="q-cab">
        <div>
          <p className="q-sobre">{saudacao(new Date().getHours())}</p>
          <h1>{t('O que vamos fazer?')}</h1>
        </div>
        {progress.available && progress.streakDays > 0 && (
          <span className="q-chip">
            <Flame aria-hidden />
            {tp(progress.streakDays, '{n} dia seguido', '{n} dias seguidos')}
          </span>
        )}
      </div>

      <div className="q-grade g3 q-cresce">
        <button type="button" className="q-tile pri" onClick={() => onChangeView('capture')}>
          <span className="q-ic">
            <Mic aria-hidden />
          </span>
          <b>{t('Legendar agora')}</b>
          <span className="q-d">{t('Vídeo, jogo, aula ou conversa, com tradução ao vivo.')}</span>
        </button>
        {semConta ? (
          <button type="button" className="q-tile" onClick={() => onChangeView('interprete')}>
            <span className="q-ic">
              <Languages aria-hidden />
            </span>
            <b>{t('Conversar')}</b>
            <span className="q-d">{t('Intérprete frente a frente: cada pessoa fala no seu idioma.')}</span>
          </button>
        ) : vencidas > 0 ? (
          <button type="button" className="q-tile" onClick={() => onChangeView('study')}>
            <span className="q-ic">
              <Layers aria-hidden />
            </span>
            <b>{tp(vencidas, 'Revisar {n} palavra', 'Revisar {n} palavras')}</b>
            <span className="q-d">{t('As que estão para sair da memória hoje.')}</span>
          </button>
        ) : (
          <button type="button" className="q-tile" onClick={() => onChangeView('metrics')}>
            <span className="q-ic">
              <BookOpen aria-hidden />
            </span>
            <b>{t('Vocabulário')}</b>
            <span className="q-d">{t('Nada para revisar agora. Veja as palavras que você guardou.')}</span>
          </button>
        )}
        <button type="button" className="q-tile" onClick={() => onChangeView('play')}>
          <span className="q-ic">
            <Gamepad2 aria-hidden />
          </span>
          <b>{t('Jogar')}</b>
          <span className="q-d">{t('Jogos com as palavras das suas sessões.')}</span>
        </button>
      </div>

      {ultima && (
        <button type="button" className="q-linha" onClick={() => onChangeView('analysis', { id: ultima.id })}>
          <span className="q-ic">
            <Library aria-hidden />
          </span>
          <span>
            <b>{t('Continuar: {titulo}', { titulo: ultima.title })}</b>
            <small>
              {ultima.date}
              {ultima.durationStr ? ` · ${ultima.durationStr}` : ''}
            </small>
          </span>
          <span className="q-fim">{t('Abrir')}</span>
        </button>
      )}
    </div>
  );
}
