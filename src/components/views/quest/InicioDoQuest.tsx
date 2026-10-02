import type { EstadoDasMissoes } from '@core';
import {
  BookOpen,
  ChartColumn,
  CheckCircle2,
  ChevronRight,
  FileText,
  Flame,
  Gamepad2,
  Headphones,
  Languages,
  Layers,
  ListChecks,
  Mic,
  Sprout,
  Youtube,
} from 'lucide-react';
import React from 'react';

import type { AppMetrics } from '../../../data/api';
import { numero, t, tp } from '../../../lib/i18n';
import type { DerivedProgress } from '../../../lib/progress';
import type { Recording } from '../../../types';
import { ICONE_DA_MISSAO, rotuloDaMissao } from '../../progress/MissoesDoDia';

/** Uma sessão de revisão, não a fila inteira (a mesma conta do Início de sempre, `Hub.tsx`). */
const TAMANHO_DA_SESSAO = 20;
/** Quantas sessões recentes cabem sem virar a Biblioteca. */
const RECENTES = 3;

interface InicioDoQuestProps {
  onChangeView: (view: string, data?: { id?: string }) => void;
  recordings: Recording[];
  progress: DerivedProgress;
  metrics: AppMetrics | null;
  /** As missões do dia, do servidor. `null` = ainda não chegaram (o bloco não aparece). */
  missoes?: EstadoDasMissoes | null;
  /**
   * Sem conta (e no site sem servidor), revisão, vocabulário e sessão salva abrem só o cartão "isto
   * precisa de conta". O Início não os oferece: o segundo caminho vira o Intérprete, que funciona.
   */
  semConta?: boolean;
}

const saudacao = (hora: number): string =>
  hora < 5 ? t('Boa noite') : hora < 12 ? t('Bom dia') : hora < 18 ? t('Boa tarde') : t('Boa noite');

const iconeDaSessao = (tipo: Recording['type']) =>
  tipo === 'video' ? Youtube : tipo === 'document' ? FileText : Headphones;

/**
 * O INÍCIO NO META QUEST (maquete de 01/10/2026): três caminhos grandes no lugar do painel cheio de
 * números. O primeiro é sempre legendar, que é o que se faz com o headset na cabeça; o segundo muda
 * conforme há ou não palavras vencendo hoje.
 *
 * Abaixo dos caminhos, o que o Início de sempre mostrava e a primeira versão desta tela tinha deixado
 * de fora (pedido do dono: nada se perde): o progresso (nível, XP, Seeds), que leva às Estatísticas, as
 * missões do dia e as sessões recentes. Só apresentação: os números são os do Início de sempre
 * (`metrics.dueToday`, `progress`, `missoes`) e os destinos são as mesmas telas.
 */
export default function InicioDoQuest({
  onChangeView,
  recordings,
  progress,
  metrics,
  missoes = null,
  semConta = false,
}: InicioDoQuestProps) {
  const vencidas = Math.min(metrics?.dueToday ?? 0, TAMANHO_DA_SESSAO);
  const recentes = semConta ? [] : recordings.slice(0, RECENTES);
  const listaDeMissoes = missoes?.missoes ?? [];
  const feitas = listaDeMissoes.filter((m) => m.atual >= m.alvo).length;

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
            <span className="q-d">
              {(metrics?.dueToday ?? 0) > vencidas
                ? t('As que estão para sair da memória hoje. São {n} no total.', { n: numero(metrics?.dueToday ?? 0) })
                : t('As que estão para sair da memória hoje.')}
            </span>
          </button>
        ) : (
          <button type="button" className="q-tile" onClick={() => onChangeView('metrics')}>
            <span className="q-ic">
              <BookOpen aria-hidden />
            </span>
            <b>{t('Vocabulário')}</b>
            <span className="q-d">
              {progress.palavrasNovas > 0
                ? tp(
                    progress.palavrasNovas,
                    '{n} palavra nova esperando a primeira revisão.',
                    '{n} palavras novas esperando a primeira revisão.',
                  )
                : t('Nada para revisar agora. Veja as palavras que você guardou.')}
            </span>
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

      {/* O PROGRESSO numa linha só: nível, XP até o próximo e Seeds. Toca, abre as Estatísticas. */}
      {progress.available && (
        <button
          type="button"
          className="q-linha"
          onClick={() => onChangeView('estatisticas')}
          data-testid="progresso-no-inicio"
        >
          <span className="q-ic">
            <ChartColumn aria-hidden />
          </span>
          <span>
            <b>
              {t('Nível {nivel}', { nivel: progress.level })} · {numero(progress.xp)} XP
            </b>
            <span
              className="q-barra"
              style={{ display: 'block', margin: '8px 0 6px' }}
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(progress.levelPct)}
              aria-label={t('{atual} de {alvo} XP para o próximo nível', {
                atual: numero(progress.xpIntoLevel),
                alvo: numero(progress.xpForLevel),
              })}
            >
              <span style={{ width: `${Math.max(0, Math.min(100, progress.levelPct))}%` }} />
            </span>
            <small>
              {t('{atual} de {alvo} XP para o próximo nível', {
                atual: numero(progress.xpIntoLevel),
                alvo: numero(progress.xpForLevel),
              })}
            </small>
          </span>
          <span className="q-chip" style={{ flex: 'none' }}>
            <Sprout aria-hidden />
            {numero(progress.seeds)} Seeds
          </span>
          <span className="q-fim">
            {t('Estatísticas')} <ChevronRight aria-hidden style={{ width: 16, height: 16, verticalAlign: -3 }} />
          </span>
        </button>
      )}

      {/* AS MISSÕES DO DIA: o progresso que o servidor contou. Fechadas as três, é o ponto de parada. */}
      {listaDeMissoes.length > 0 && missoes && (
        <section className="q-secao" aria-label={t('Missões do dia')} data-testid="missoes-no-inicio">
          <header>
            <div>
              <h2>{missoes.metaConcluida ? t('Meta do dia concluída') : t('Missões do dia')}</h2>
              <p>
                {missoes.metaConcluida
                  ? t('+{seeds} Seeds e +{xp} XP. Por hoje é isso: amanhã chegam missões novas.', missoes.recompensa)
                  : t('Feche as três para ganhar +{seeds} Seeds e +{xp} XP.', missoes.recompensa)}
              </p>
            </div>
            <span className="q-chip">
              <ListChecks aria-hidden />
              {feitas}/{listaDeMissoes.length}
            </span>
          </header>
          <div className="q-grade g3">
            {listaDeMissoes.map((m) => {
              const feita = m.atual >= m.alvo;
              const atual = Math.min(m.atual, m.alvo);
              const Icone = feita ? CheckCircle2 : ICONE_DA_MISSAO[m.tipo];
              return (
                <div key={m.id} className="q-cartao" data-missao={m.tipo} data-feita={feita || undefined}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span className="q-ic">
                      <Icone aria-hidden />
                    </span>
                    <b style={{ font: '800 17px/1.25 var(--font-display, inherit)' }}>{rotuloDaMissao(m)}</b>
                  </div>
                  <span
                    className="q-barra"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={m.alvo}
                    aria-valuenow={atual}
                    aria-label={t('{atual} de {alvo}', { atual, alvo: m.alvo })}
                  >
                    <span style={{ width: `${(atual / m.alvo) * 100}%` }} />
                  </span>
                  <span className="q-rotulo">
                    {atual}/{m.alvo}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* AS SESSÕES RECENTES: as três últimas a um toque; o resto, na Biblioteca. */}
      {recentes.length > 0 && (
        <section className="q-secao" aria-label={t('Sessões recentes')} data-testid="recentes-no-inicio">
          <header>
            <div>
              <h2>{t('Sessões recentes')}</h2>
            </div>
            <button type="button" className="q-chip" onClick={() => onChangeView('library')}>
              {t('Ver biblioteca completa')}
            </button>
          </header>
          <div className="q-lista">
            {recentes.map((rec, i) => {
              const Icone = iconeDaSessao(rec.type);
              return (
                <button
                  key={rec.id}
                  type="button"
                  className="q-linha"
                  onClick={() => onChangeView('analysis', { id: rec.id })}
                >
                  <span className="q-ic">
                    <Icone aria-hidden />
                  </span>
                  <span>
                    <b>{i === 0 ? t('Continuar: {titulo}', { titulo: rec.title }) : rec.title}</b>
                    <small>
                      {rec.date}
                      {rec.durationStr ? ` · ${rec.durationStr}` : ''}
                      {rec.status !== 'Processado' ? ` · ${t('processando')}` : ''}
                    </small>
                  </span>
                  <span className="q-fim">{t('Abrir')}</span>
                </button>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
