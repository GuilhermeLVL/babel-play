import type { EstadoDasMissoes } from '@core';
import {
  ChartColumn,
  CheckCircle2,
  ChevronRight,
  FileText,
  Gamepad2,
  Headphones,
  Languages,
  Layers,
  ListChecks,
  Mic,
  Snowflake,
  Sparkles,
  Sprout,
  Upload,
  Youtube,
} from 'lucide-react';
import React, { useState } from 'react';

import type { AppMetrics } from '../../../data/api';
import { contagemDaFonte,type Conteudo } from '../../../lib/conteudo/estado';
import { useConteudo } from '../../../lib/conteudo/loja';
import { useContagensDeConteudo } from '../../../lib/conteudo/useContagens';
import { noCelular } from '../../../lib/dispositivo/telaNovaDoQuest';
import { edicaoEstatica } from '../../../lib/edicaoEstatica';
import { getEntitlements } from '../../../lib/entitlements';
import { proximaRecompensa } from '../../../lib/galeria/progressao';
import { numero, t, tp } from '../../../lib/i18n';
import type { AgeProfileType } from '../../../lib/profile';
import type { DerivedProgress } from '../../../lib/progress';
import { perfilProtegido } from '../../../lib/protecaoDoMenor';
import type { Recording } from '../../../types';
import EspacoDeAnuncio from '../../anuncios/EspacoDeAnuncio';
import CardDePlanos from '../../CardDePlanos';
import AvisoDeConta from '../../conta/AvisoDeConta';
import { idiomaNaFicha, nomeCurtoDaFonte } from '../../conteudo/fontes';
import { ICONE_DA_MISSAO, rotuloDaMissao } from '../../progress/MissoesDoDia';

/**
 * O QUE O LADRILHO DOS CARTÕES DIZ — os estados de `ctLadrilhoDoInicio` (`cartoes3.js:138-144`), com o
 * perfil que o App já carregou (nenhum pedido a mais): o que vence agora, o tamanho do caderno e se já
 * houve revisão. O protótipo detalha "a rever, aprendendo e novas" e o tempo; o perfil não traz essa
 * divisão, e o tempo da revisão não é medido, então a frase fica na que o Início já dizia.
 */
function ladrilhoDosCartoes(metrics: AppMetrics | null | 'sem-conta'): { titulo: string; frase: string } {
  if (metrics === null) return { titulo: t('Cartões'), frase: t('Suas palavras, de volta na hora certa.') };
  if (metrics === 'sem-conta' || metrics.deckSize === 0)
    return {
      titulo: t('Cartões'),
      frase: t('Guarde palavras e o app traz cada uma de volta na hora certa.'),
    };
  if (metrics.reviews === 0)
    return {
      titulo: metrics.deckSize > 10 ? t('Cartões: comece por 10') : t('Cartões: comece agora'),
      frase: tp(metrics.deckSize, 'Sua {n} palavra já é cartão.', 'Suas {n} palavras já são cartões.', {
        n: numero(metrics.deckSize),
      }),
    };
  if (metrics.dueToday > 0)
    return {
      titulo: t('Cartões: {n} para hoje', { n: numero(metrics.dueToday) }),
      frase: t('As que estão para sair da memória hoje.'),
    };
  return { titulo: t('Cartões: tudo em dia'), frase: t('Nada vence agora.') };
}

/**
 * O LADRILHO SEGUE O CONTEÚDO ESCOLHIDO (`ctLadrilhoDoInicio()`, `cartoes3.js:143-158`): com outro conteúdo
 * que não "Tudo", o número do título é o DELE, a frase diz qual é e o total da conta vem ao lado ("Reunião
 * de produto: … No total, 26."). O selo do trilho continua com o total. Tocar leva aos Cartões sem trocar
 * a escolha.
 *
 * Componente à parte para a leitura das contagens (`GET /api/vocab/conteudo`) só acontecer quando há um
 * conteúdo escolhido: com "Tudo", o Início continua sem pedido a mais. Enquanto a leitura não chega (ou se
 * a fonte sumiu), vale o texto geral.
 */
function TextoDoLadrilhoDaFonte({
  conteudo,
  total,
  geral,
}: {
  conteudo: Conteudo;
  /** O que vence hoje na conta inteira (o número do selo). */
  total: number;
  geral: { titulo: string; frase: string };
}) {
  const { contagens } = useContagensDeConteudo(conteudo.idioma);
  const linha = contagens ? contagemDaFonte(conteudo.fonte, contagens) : null;
  if (!linha) return <TextoDoLadrilho {...geral} />;
  const idioma = idiomaNaFicha(conteudo, contagens);
  /* `quem` de `cartoes3.js:148`. */
  const fonte = idioma
    ? t('{nome} em {idioma}', { nome: nomeCurtoDaFonte(conteudo.fonte), idioma: idioma.toLocaleLowerCase() })
    : nomeCurtoDaFonte(conteudo.fonte);
  const noTotal = linha.paraHoje !== total && total > 0 ? ` ${t('No total, {n}.', { n: numero(total) })}` : '';
  return linha.paraHoje > 0 ? (
    <TextoDoLadrilho
      titulo={t('Cartões: {n} para hoje', { n: numero(linha.paraHoje) })}
      frase={`${t('{fonte}: as que estão para sair da memória hoje.', { fonte })}${noTotal}`}
    />
  ) : (
    <TextoDoLadrilho
      titulo={t('Cartões: tudo em dia')}
      frase={`${t('{fonte}: nada vence agora.', { fonte })}${noTotal}`}
    />
  );
}

function TextoDoLadrilho({ titulo, frase }: { titulo: string; frase: string }) {
  return (
    <>
      <b>{titulo}</b>
      <span className="q-d">{frase}</span>
    </>
  );
}

/** Quantas sessões recentes cabem sem virar a Biblioteca (as mesmas seis do Início de sempre). */
const RECENTES = 6;
type TipoDeSessao = 'all' | Recording['type'];

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
  /** O perfil de exibição (kids, pro, sênior): muda a linguagem do cabeçalho, como no Início de sempre. */
  ageProfile?: AgeProfileType;
  /** A lista de sessões ainda não respondeu: o vazio "Nenhuma sessão ainda" não pode piscar antes dela (CLS). */
  carregandoSessoes?: boolean;
  /** As missões ainda não responderam: reserva o lugar do bloco para o que vem abaixo não pular (CLS). */
  missoesPendentes?: boolean;
}

const saudacao = (hora: number): string =>
  hora < 5 ? t('Boa noite') : hora < 12 ? t('Bom dia') : hora < 18 ? t('Boa tarde') : t('Boa noite');

/** O que o selo do plano diz: os dois textos do protótipo, e "Premium" para quem já assina. */
const rotuloDoPlano = (): string => {
  const { plan, teste } = getEntitlements();
  if (plan === 'free' || plan === 'anonimo') return t('Grátis · Ver planos');
  return teste ? t('Premium · em teste') : t('Premium');
};

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
  ageProfile = 'pro',
  carregandoSessoes = false,
  missoesPendentes = false,
}: InicioDoQuestProps) {
  const cartoes = ladrilhoDosCartoes(semConta ? 'sem-conta' : metrics);
  /* O conteúdo escolhido no app (um só, o mesmo da ficha de Cartões, Jogar e Biblioteca). */
  const conteudo = useConteudo();
  const comFonte =
    !semConta && !!metrics && metrics.deckSize > 0 && metrics.reviews > 0 && conteudo.fonte.tipo !== 'tudo';
  const [tipo, setTipo] = useState<TipoDeSessao>('all');
  const sessoes = semConta ? [] : recordings;
  const recentes = sessoes.filter((r) => tipo === 'all' || r.type === tipo).slice(0, RECENTES);
  const quantas = (qual: TipoDeSessao) =>
    qual === 'all' ? sessoes.length : sessoes.filter((r) => r.type === qual).length;
  /* A frase da ofensiva e a próxima recompensa: as mesmas da faixa de progresso de sempre. */
  const simples = ageProfile === 'senior';
  const proxima = simples ? null : proximaRecompensa(progress.level);
  const fraseDaOfensiva = progress.practicedToday
    ? tp(progress.streakDays, 'Você revisou hoje, ofensiva de {n} dia.', 'Você revisou hoje, ofensiva de {n} dias.')
    : progress.streakDays > 0
      ? tp(
          progress.streakDays,
          'Uma revisão ou rodada hoje mantém a ofensiva de {n} dia.',
          'Uma revisão ou rodada hoje mantém a ofensiva de {n} dias.',
        )
      : t('Uma revisão hoje começa a sua ofensiva.');
  const congelamentos = missoes && !perfilProtegido() ? missoes.congelamentos : 0;
  const listaDeMissoes = missoes?.missoes ?? [];
  const feitas = listaDeMissoes.filter((m) => m.atual >= m.alvo).length;

  return (
    <div className="q-palco" data-testid="inicio-do-quest">
      <div className="q-cab">
        <div>
          <p className="q-sobre">{saudacao(new Date().getHours())}</p>
          <h1>
            {ageProfile === 'kids'
              ? t('Pronto para os desafios?')
              : ageProfile === 'senior'
                ? t('Bem-vindo ao Babel Play')
                : t('O que vamos fazer?')}
          </h1>
        </div>
        {/* O SELO DO PLANO (`telas2.js:136-139`): quem quer ver os planos não depende de uma oferta
            aparecer. No site sem servidor não há plano a assinar, e o selo não aparece. */}
        {!edicaoEstatica() && (
          <button
            type="button"
            className="q-chip px-plano-chip"
            onClick={() => onChangeView('planos')}
            data-testid="plano-no-inicio"
          >
            <Sparkles aria-hidden /> {rotuloDoPlano()}
          </button>
        )}
      </div>

      <div className="q-grade g3 q-cresce ct-g4">
        <button type="button" className="q-tile pri" onClick={() => onChangeView('capture')}>
          <span className="q-ic">
            <Mic aria-hidden />
          </span>
          <b>{t('Legendar agora')}</b>
          <span className="q-d">{t('Vídeo, jogo, aula ou conversa, com tradução ao vivo.')}</span>
        </button>
        {/* O LADRILHO DOS CARTÕES É FIXO (`ctLadrilhoDoInicio`, `cartoes3.js:134-156`): antes a revisão só
            aparecia aqui com palavra vencendo, e tomava o lugar do "Conversar". Agora está sempre, logo
            depois de "Legendar agora", com o número do dia; sem conta ou sem cartões, leva ao estado
            vazio da tela. */}
        <button
          type="button"
          className="q-tile ct-ladrilho"
          onClick={() => onChangeView('cartoes')}
          data-testid="cartoes-no-inicio"
        >
          <span className="q-ic">
            <Layers aria-hidden />
          </span>
          {comFonte ? (
            <TextoDoLadrilhoDaFonte conteudo={conteudo} total={metrics.dueToday} geral={cartoes} />
          ) : (
            <TextoDoLadrilho {...cartoes} />
          )}
        </button>
        <button type="button" className="q-tile" onClick={() => onChangeView('interprete')}>
          <span className="q-ic">
            <Languages aria-hidden />
          </span>
          <b>{t('Conversar')}</b>
          <span className="q-d">{t('Intérprete frente a frente: cada pessoa fala no seu idioma.')}</span>
        </button>
        <button type="button" className="q-tile" onClick={() => onChangeView('play')}>
          <span className="q-ic">
            <Gamepad2 aria-hidden />
          </span>
          <b>{t('Jogar')}</b>
          <span className="q-d">{t('Jogos com as palavras das suas sessões.')}</span>
        </button>
      </div>

      {/* O PROGRESSO numa linha só: nível, XP até o próximo e Seeds. Toca, abre as Estatísticas.
          Enquanto as métricas não chegam, a forma da linha (nunca um "Nível 1 · 0 XP" falso). */}
      {!progress.available && <div className="q-esqueleto" style={{ minHeight: 92 }} aria-hidden />}
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
              {fraseDaOfensiva} {t('Faltam {n} XP', { n: progress.xpForLevel - progress.xpIntoLevel })}
              {proxima && (
                <>
                  {' · '}
                  {t('próximo:')}{' '}
                  <b style={{ display: 'inline', font: 'inherit', fontWeight: 800 }}>{proxima.destaque.nome}</b>
                </>
              )}
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
      {missoesPendentes && !semConta && !missoes && <div className="q-missoes-reserva" aria-hidden="true" />}
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
          {/* No celular a grade rola de lado: quem usa teclado precisa conseguir parar nela para rolar. */}
          <div className="q-grade g3" tabIndex={noCelular() ? 0 : undefined}>
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
          {congelamentos > 0 && (
            <p className="q-rodape-do-mais">
              <Snowflake aria-hidden />
              {tp(
                congelamentos,
                '{n} congelamento guardado: um dia sem prática não quebra a ofensiva.',
                '{n} congelamentos guardados: um dia sem prática não quebra a ofensiva.',
              )}
            </p>
          )}
        </section>
      )}

      {/* O AVISO POR MARCO DE USO (sem conta, com motivo concreto) e o convite aos planos: os mesmos
          componentes do Início de sempre, com as regras deles (quando aparecem, quando somem). */}
      <AvisoDeConta metrics={metrics} onEntrar={() => onChangeView('login')} />
      {!edicaoEstatica() && <CardDePlanos onVerPlanos={() => onChangeView('planos')} />}

      {/* AS SESSÕES RECENTES: as seis últimas, com o filtro por tipo; o resto, na Biblioteca. */}
      {!semConta && !carregandoSessoes && sessoes.length === 0 && (
        <section className="q-secao" aria-label={t('Sessões recentes')} data-testid="recentes-no-inicio">
          <div className="q-vazio" style={{ minHeight: 200 }}>
            <span className="q-ic">
              <Headphones aria-hidden />
            </span>
            <h2>{t('Nenhuma sessão ainda')}</h2>
            <p>{t('Capture sua primeira sessão ou importe uma mídia pela Biblioteca, ela aparecerá aqui.')}</p>
            <div className="q-acoes" style={{ justifyContent: 'center' }}>
              <button type="button" className="q-ctl pri" onClick={() => onChangeView('capture')}>
                <Mic aria-hidden /> {t('Nova captura')}
              </button>
              {!edicaoEstatica() && (
                <button type="button" className="q-ctl" onClick={() => onChangeView('library')}>
                  <Upload aria-hidden /> {t('Importar mídia')}
                </button>
              )}
            </div>
          </div>
        </section>
      )}
      {sessoes.length > 0 && (
        <section className="q-secao" aria-label={t('Sessões recentes')} data-testid="recentes-no-inicio">
          <header>
            <div>
              <h2>{t('Sessões recentes')}</h2>
            </div>
            <button type="button" className="q-chip" onClick={() => onChangeView('library')}>
              {t('Ver biblioteca completa')}
            </button>
          </header>
          <div className="q-abas q-seg" role="group" aria-label={t('Tipo de mídia')}>
            {(
              [
                ['all', t('Tudo')],
                ['video', 'YouTube'],
                ['audio', t('Áudio')],
                ['document', t('Documentos')],
              ] as const
            ).map(([id, rotulo]) => (
              <button key={id} type="button" className="q-aba" aria-pressed={tipo === id} onClick={() => setTipo(id)}>
                {rotulo}
                <span className="n">{quantas(id)}</span>
              </button>
            ))}
          </div>
          {recentes.length === 0 && (
            <div className="q-aviso">
              <span>
                {t(
                  'Nenhuma sessão salva com este tipo de arquivo. Escolha outra categoria ou capture uma nova sessão.',
                )}
              </span>
              <button type="button" className="q-ctl" onClick={() => setTipo('all')}>
                {t('Ver todas as categorias')}
              </button>
            </div>
          )}
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
                    <b>{i === 0 && tipo === 'all' ? t('Continuar: {titulo}', { titulo: rec.title }) : rec.title}</b>
                    <small>
                      {rec.type === 'video' ? 'YouTube' : rec.type === 'document' ? t('Documento') : t('Áudio')} ·{' '}
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

      {/* O ESPAÇO DE ANÚNCIO DO INÍCIO (flag `anuncios`, desligada de fábrica; sem provedor não desenha
          nada). No protótipo é o último cartão de uma seção "Para continuar", que o app não tem: o espaço
          fica onde ela ficaria, no fim da tela, abaixo das três ações, das missões e das sessões. */}
      <EspacoDeAnuncio espaco="inicio-nativo" formato="nativo" aoSemAnuncios={() => onChangeView('planos')} />
    </div>
  );
}
