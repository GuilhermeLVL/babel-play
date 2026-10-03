import { type EstadoDasMissoes, estimativaDeMinutos, rotuloDeDuracao } from '@core';
import {
  ArrowRight,
  Eye,
  FileText,
  Gamepad2,
  Headphones,
  History,
  Mic,
  Sparkles,
  Sprout,
  Target,
  Upload,
  Youtube,
} from 'lucide-react';
import React, { useEffect, useState } from 'react';

import { type AppMetrics, fetchExerciseResults } from '../../data/api';
import { edicaoEstatica } from '../../lib/edicaoEstatica';
import { numero, t, tp } from '../../lib/i18n';
import { type DerivedProgress } from '../../lib/progress';
import { Recording } from '../../types';
import CardDePlanos from '../CardDePlanos';
import AvisoDeConta from '../conta/AvisoDeConta';
import EditablePanel from '../EditablePanel';
import FaixaDeProgresso from '../progress/FaixaDeProgresso';
import MissoesDoDia from '../progress/MissoesDoDia';
import { Abas, CabecalhoDeTela, IconeEmBloco, Tela, TituloDeSecao, Vazio } from '../ui';

type AgeProfile = 'kids' | 'pro' | 'senior';

interface HubProps {
  onChangeView: (view: string, data?: any) => void;
  recordings: Recording[];
  ageProfile?: AgeProfile;
  /** Progresso derivado das métricas reais (ver lib/progress.ts). Vem do App. */
  progress: DerivedProgress;
  metrics: AppMetrics | null;
  /** As missões do dia, do servidor (`GET /api/metrics/missoes`). `null` = ainda não chegaram. */
  missoes?: EstadoDasMissoes | null;
  /** A lista de sessões ainda não respondeu: o vazio "Nenhuma sessão ainda" não pode piscar antes dela (CLS). */
  carregandoSessoes?: boolean;
  /** As missões ainda não responderam: reserva o lugar do cartão para o que vem abaixo não pular (CLS). */
  missoesPendentes?: boolean;
}

export default function Hub({
  onChangeView,
  recordings,
  ageProfile = 'pro',
  progress,
  metrics,
  missoes = null,
  carregandoSessoes = false,
  missoesPendentes = false,
}: HubProps) {
  const ir = (view: string, data?: unknown) => onChangeView(view, data as never);
  const [filterCategory, setFilterCategory] = useState<'all' | 'video' | 'audio' | 'document'>('all');

  /**
   * Os tempos JÁ MEDIDOS por item, só para o card de revisão poder dizer quanto leva.
   *
   * Buscado aqui e não recebido por prop porque nenhum ancestral tem esse dado — e o custo é uma
   * chamada que já existe (`GET /api/exercises/results`), disparada uma vez por montagem. Falhar é
   * inofensivo: sem amostras, `estimativaDeMinutos` devolve `null` e a linha vira "rodada curta".
   */
  const [temposMedidos, setTemposMedidos] = useState<number[]>([]);

  /**
   * QUANTAS O CARD OFERECE AGORA — uma sessão, não a fila inteira.
   *
   * A primeira versão prometia todas as vencidas, e no baralho real isso deu "2057 palavras · leva
   * uns 152 minutos". A conta estava certa e o card, inútil: ninguém revisa duas horas e meia, e um
   * número desses não convida a começar — afasta. O acúmulo é justamente o estado em que a ajuda
   * mais importa, e era nele que o card falhava.
   *
   * 20 é o tamanho de uma sessão que cabe num intervalo (uns 4 minutos, no ritmo medido). A fila
   * inteira continua escrita na linha de baixo: o que muda é qual dos dois números é o convite.
   */
  const TAMANHO_DA_SESSAO = 20;
  const agora = Math.min(metrics?.dueToday ?? 0, TAMANHO_DA_SESSAO);
  useEffect(() => {
    let vivo = true;
    fetchExerciseResults()
      .then((linhas) => {
        if (vivo) setTemposMedidos(linhas.map((l) => l.ms).filter((ms): ms is number => typeof ms === 'number'));
      })
      .catch(() => {
        /* sem medição: o rótulo cai para "rodada curta" */
      });
    return () => {
      vivo = false;
    };
  }, []);
  const filteredRecs = recordings.filter((r) => filterCategory === 'all' || r.type === filterCategory).slice(0, 6);
  return (
    <Tela largura="larga">
      {/* Cabeçalho — a linguagem muda por perfil; a estrutura, não. O protótipo aprovado
          (23/09/2026) devolve ao perfil `pro` o rótulo "Seu estudo" e a frase de apoio: com eles
          o Início abre igual às outras telas (sobrancelha, título, apoio). */}
      <CabecalhoDeTela
        icone={ageProfile === 'kids' ? Gamepad2 : ageProfile === 'senior' ? Eye : Sparkles}
        sobrancelha={
          ageProfile === 'kids'
            ? t('Central do jogador')
            : ageProfile === 'senior'
              ? t('Aprendizado fácil')
              : t('Seu estudo')
        }
        titulo={
          ageProfile === 'kids'
            ? t('Pronto para os desafios?')
            : ageProfile === 'senior'
              ? t('Bem-vindo ao Babel Play')
              : t('O que você quer fazer?')
        }
        sub={
          ageProfile === 'kids'
            ? t('Três frentes para evoluir: gravar, praticar e cultivar palavras.')
            : t('Escolha um dos três passos. Cada um leva a uma tela só, com o que precisa.')
        }
      />

      {/* Marcação do protótipo aprovado (`T.inicio`), o "Figma" do app: os três passos em `.g3`, a
          peça de progresso com a faixa de revisão colada embaixo, e o link de estatísticas. */}
      <EditablePanel
        viewKey="hub"
        panelKey="quickActions"
        title={t('Ações Rápidas')}
        canResizeWidth={false}
        canResizeHeight={false}
        defaultHeight={0}
      >
        <section className="g3" aria-label={t('Três passos')}>
          {PILLARS.map((pillar) => (
            <PillarCard
              key={pillar.id}
              pillar={pillar}
              ageProfile={ageProfile}
              palavrasNovas={progress.palavrasNovas}
              progressAvailable={progress.available}
              onChangeView={onChangeView}
            />
          ))}
        </section>
      </EditablePanel>

      <FaixaDeProgresso
        progress={progress}
        ageProfile={ageProfile}
        className="secao"
        style={{ marginTop: 24 }}
        destaque={!!metrics && metrics.dueToday > 0}
      >
        {/* A faixa de revisão só existe quando há o que revisar (sem vencidas ela some inteira,
            em vez de um "0 palavras" no lugar mais nobre da tela). Enquanto as métricas não
            chegaram, o espaço fica reservado para a tela não pular (CLS, achado F0-02). */}
        {metrics === null && (
          <div className="faixa-rev animate-pulse" aria-hidden>
            <span className="contador" />
            <span style={{ flex: 1, height: 20, borderRadius: 8, background: 'var(--surface-hover)' }} />
          </div>
        )}
        {metrics && metrics.dueToday > 0 && (
          <div className="faixa-rev">
            <span className="contador">{agora}</span>
            <p style={{ flex: 1, minWidth: 180 }}>
              <b>
                {ageProfile === 'kids'
                  ? t('Você está quase esquecendo estas {n}', { n: agora })
                  : ageProfile === 'senior'
                    ? tp(agora, '{n} palavra está na hora de rever', '{n} palavras estão na hora de rever')
                    : tp(agora, '{n} palavra pronta para revisar', '{n} palavras prontas para revisar')}
              </b>{' '}
              <span className="mut">
                · {rotuloDeDuracao(estimativaDeMinutos(agora, temposMedidos))}
                {metrics.dueToday > agora && <> {t('· {n} no total', { n: numero(metrics.dueToday) })}</>}
              </span>
            </p>
            <button type="button" className="btn btn-solid" onClick={() => ir('study')}>
              {ageProfile === 'kids'
                ? t('Bora!')
                : ageProfile === 'senior'
                  ? t('Começar a revisão')
                  : t('Revisar agora')}
            </button>
            <button type="button" className="link" onClick={() => onChangeView('play')}>
              {t('escolher outro jogo')}
            </button>
          </div>
        )}
      </FaixaDeProgresso>

      {/* AS MISSÕES DO DIA (recompensas v2, onda 5): substituem as "missões" antigas, que eram as
          três frentes do app. Mesmo desenho de cartão; ponto de parada explícito quando fecham. */}
      <MissoesDoDia estado={missoes} className="secao" style={{ marginTop: 14 }} />
      {missoesPendentes && !missoes && <div className="missoes-reserva" style={{ marginTop: 14 }} aria-hidden="true" />}

      {/* "Ver estatísticas detalhadas" leva à tela Estatísticas (decisão do dono, 24/09). O bloco
          inline que abria aqui saiu; a meta de nível foi junto para Estatísticas. */}
      <div style={{ marginTop: 14 }}>
        <button type="button" className="link" onClick={() => onChangeView('estatisticas')}>
          {t('Ver estatísticas detalhadas')} <ArrowRight aria-hidden />
        </button>
      </div>

      {/* DESCOBRIBILIDADE DO PLANO, segunda rodada (spec planos-visiveis): a linha discreta da
          auditoria anterior informava mas não tinha o peso de card que o dono pediu. O componente
          carrega TODAS as regras (só Grátis/anônimo, nunca na leve, dispensável, preço da
          matriz) — aqui só se diz onde ele fica. */}
      {/* O AVISO POR MARCO DE USO (mudança porta-de-entrada). Vem ANTES do card de planos porque
          é mais urgente: um fala de guardar o que já existe, o outro de comprar mais. Só aparece
          sem conta, com motivo concreto, e some para sempre quando dispensado. */}
      <AvisoDeConta metrics={metrics} onEntrar={() => onChangeView('login')} />

      {/* Edição estática: não há plano a vender. */}
      {!edicaoEstatica() && <CardDePlanos onVerPlanos={() => onChangeView('planos')} />}

      {/* Sessões recentes — marcação do protótipo: título de seção, abas em pílula por tipo e as
          sessões como `.sessao-mini`. */}
      <EditablePanel
        viewKey="hub"
        panelKey="recentRecordings"
        title={t('Sessões recentes')}
        canResizeWidth={false}
        canResizeHeight={false}
        defaultHeight={0}
      >
        {/* A margem vai explícita: dentro do EditablePanel a seção é "primeiro filho", e o CSS do
            protótipo zera a margem de `.secao:first-child`. */}
        <section className="secao" style={{ marginTop: 36 }}>
          <TituloDeSecao
            icone={History}
            titulo={t('Sessões recentes')}
            desc={t('Estudos e mídias salvos, organizados por tipo de arquivo.')}
            direita={
              <button type="button" className="link" onClick={() => onChangeView('library')}>
                {t('Ver biblioteca completa')} <ArrowRight aria-hidden />
              </button>
            }
          />
          <Abas
            variante="pilula"
            rotuloDoGrupo={t('Tipo de mídia')}
            ativo={filterCategory}
            aoTrocar={(id) => setFilterCategory(id as typeof filterCategory)}
            itens={[
              { id: 'all', rotulo: t('Tudo'), contagem: recordings.length },
              {
                id: 'video',
                rotulo: 'YouTube',
                icone: <Youtube aria-hidden />,
                contagem: recordings.filter((r) => r.type === 'video').length,
              },
              {
                id: 'audio',
                rotulo: t('Áudio'),
                icone: <Headphones aria-hidden />,
                contagem: recordings.filter((r) => r.type === 'audio').length,
              },
              {
                id: 'document',
                rotulo: t('Documentos'),
                icone: <FileText aria-hidden />,
                contagem: recordings.filter((r) => r.type === 'document').length,
              },
            ]}
          />

          <div role="tabpanel" id={`painel-${filterCategory}`} aria-labelledby={`aba-${filterCategory}`}>
            {filteredRecs.length === 0 && carregandoSessoes ? null : filteredRecs.length === 0 ? (
              <Vazio
                className="mt-3.5"
                icone={<Headphones className="w-7 h-7" />}
                titulo={recordings.length === 0 ? t('Nenhuma sessão ainda') : t('Nada nesta categoria')}
                explicacao={
                  recordings.length === 0
                    ? t('Capture sua primeira sessão ou importe uma mídia pela Biblioteca, ela aparecerá aqui.')
                    : t(
                        'Nenhuma sessão salva com este tipo de arquivo. Escolha outra categoria ou capture uma nova sessão.',
                      )
                }
                acao={{
                  rotulo: (
                    <>
                      <Mic className="w-4 h-4" /> {t('Nova captura')}
                    </>
                  ),
                  aoClicar: () => onChangeView('capture'),
                }}
                acaoSecundaria={
                  /* Edição estática: a importação é feita pelo SERVIDOR (YouTube, web, documentos) e
                     a Biblioteca só existe na versão completa — sem o atalho. */
                  recordings.length === 0 && edicaoEstatica()
                    ? undefined
                    : recordings.length === 0
                      ? {
                          rotulo: (
                            <>
                              <Upload className="w-4 h-4" /> {t('Importar mídia')}
                            </>
                          ),
                          aoClicar: () => onChangeView('library'),
                        }
                      : { rotulo: t('Ver todas as categorias'), aoClicar: () => setFilterCategory('all') }
                }
              />
            ) : (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 340px))',
                  gap: 14,
                  marginTop: 14,
                }}
              >
                {filteredRecs.map((rec) => (
                  <button
                    key={rec.id}
                    type="button"
                    className="cartao clicavel sessao-mini"
                    style={{ width: '100%', textAlign: 'left' }}
                    onClick={() => onChangeView('analysis', { id: rec.id })}
                  >
                    <IconeEmBloco
                      icone={rec.type === 'video' ? Youtube : rec.type === 'document' ? FileText : Headphones}
                      tom="rare"
                    />
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <b
                        style={{
                          display: 'block',
                          fontFamily: 'var(--font-display)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {rec.title}
                      </b>
                      <span className="meta">
                        {rec.date} ·{' '}
                        <span className="label-mono">
                          {rec.type === 'video' ? 'YouTube' : rec.type === 'document' ? t('Documento') : t('Áudio')}
                        </span>
                        {/* O estado só aparece quando muda o que dá para fazer: sem transcrição
                            ainda, abrir a sessão leva a uma tela pela metade. */}
                        {rec.status !== 'Processado' && (
                          <> · {ageProfile === 'kids' ? t('lendo ainda') : t('processando')}</>
                        )}
                      </span>
                    </span>
                    <ArrowRight aria-hidden style={{ width: 16, height: 16, color: 'var(--ink-muted)' }} />
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>
      </EditablePanel>
    </Tela>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   OS TRÊS PILARES
   ═══════════════════════════════════════════════════════════════════════════ */

type PillarId = 'capture' | 'practice' | 'vocabulary';

interface PillarDef {
  id: PillarId;
  view: string;
  icon: typeof Mic;
  /** Cor semântica do pilar — usada em fundo suave, nunca como preenchimento com texto branco. */
  tone: 'accent' | 'warn' | 'good';
  title: Record<AgeProfile, string>;
  body: Record<AgeProfile, string>;
  cta: Record<AgeProfile, string>;
}

const PILLARS: PillarDef[] = [
  {
    id: 'capture',
    view: 'capture',
    icon: Mic,
    tone: 'accent',
    title: {
      kids: 'Gravar jogo e vídeos',
      pro: 'Escutar e traduzir',
      senior: 'Traduzir som ou voz',
    },
    /* O texto do perfil `pro` é de UMA LINHA (referência de design): quem escolheu densidade
       alta lê o cartão de relance, não um parágrafo. Kids e sênior mantêm a frase inteira —
       nesses perfis a explicação é o que faz o cartão funcionar. */
    body: {
      kids: 'Grave o som do Roblox, do YouTube ou do Discord e veja a legenda aparecer na hora.',
      pro: 'Áudio do sistema ou do microfone, em tempo real.',
      senior: 'Grave o áudio do computador ou a sua própria voz. As frases aparecem traduzidas enquanto você ouve.',
    },
    cta: { kids: 'Começar a gravar', pro: 'Iniciar captura', senior: 'Abrir o gravador' },
  },
  {
    id: 'practice',
    view: 'study',
    icon: Target,
    tone: 'warn',
    title: {
      kids: 'Desafios de pronúncia',
      pro: 'Exercícios',
      senior: 'Praticar frases salvas',
    },
    body: {
      kids: 'Fale no microfone, acerte os desafios e ganhe pontos de pronúncia.',
      pro: 'Shadowing, ditado, reescrita, roleplay.',
      senior: 'Exercícios de repetição simples, no seu ritmo e sem cronômetro.',
    },
    cta: { kids: 'Iniciar desafio', pro: 'Abrir exercícios', senior: 'Ver exercícios' },
  },
  {
    id: 'vocabulary',
    view: 'metrics',
    icon: Sprout,
    tone: 'good',
    title: {
      kids: 'Jardim de palavras',
      pro: 'Vocabulário',
      senior: 'Minhas palavras',
    },
    body: {
      kids: 'Regue as palavras do seu deck para elas não murcharem, e colha Seeds.',
      pro: 'Deck com repetição espaçada.',
      senior: 'Seu caderno de palavras, com tradução e pronúncia em áudio.',
    },
    cta: { kids: 'Regar palavras', pro: 'Abrir vocabulário', senior: 'Ver minhas palavras' },
  },
];

interface PillarCardProps {
  pillar: PillarDef;
  ageProfile: AgeProfile;
  palavrasNovas: number;
  progressAvailable: boolean;
  onChangeView: (view: string, data?: any) => void;
}

const PillarCard: React.FC<PillarCardProps> = ({ pillar, ageProfile, palavrasNovas, progressAvailable, onChangeView }) => {
  /* Marcação do protótipo (`article.cartao.pilar`): a ação primária (capturar) é o cartão escuro
     com botão cheio; os outros dois são claros com botão de contorno. A linha `.extra` só existe
     no pilar de vocabulário, com a fila real de palavras novas. */
  const escuro = pillar.id === 'capture';
  const extra =
    pillar.id === 'vocabulary' && progressAvailable
      ? palavrasNovas > 0
        ? tp(palavrasNovas, '{n} palavra nova esperando', '{n} palavras novas esperando')
        : t('Tudo revisado hoje')
      : null;
  return (
    <article className={`cartao pilar ${escuro ? 'escuro' : ''}`}>
      <IconeEmBloco icone={pillar.icon} tom={escuro ? 'accent' : pillar.tone} />
      <h3>{t(pillar.title[ageProfile])}</h3>
      <p className="mut">{t(pillar.body[ageProfile])}</p>
      {extra && <p className="extra">{extra}</p>}
      <div className="espaco" />
      <button
        type="button"
        className={`btn ${escuro ? 'btn-solid' : 'btn-outline'} bloco`}
        onClick={() => onChangeView(pillar.view)}
      >
        {t(pillar.cta[ageProfile])} <ArrowRight aria-hidden />
      </button>
    </article>
  );
};

/**
 * Faixa de progresso. Nível, XP e Seeds são função pura das métricas (lib/progress.ts) —
 * não há contador paralelo nem número escrito à mão. Sem métricas, mostra esqueleto.
 */
