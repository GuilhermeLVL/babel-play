import '../../styles/questVocabulario.css';
import '../../styles/questRevisao.css';
import '../../styles/cartoesDoApp.css';

import { FILTRO_PADRAO } from '@core';
import {
  ArrowLeftRight,
  BookOpen,
  Brain,
  CalendarCheck,
  Layers,
  type LucideIcon,
  Plus,
  RotateCcw,
  Settings2,
  TriangleAlert,
} from 'lucide-react';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { ResumoDosCartoes } from '../../core/learning/resumoDosCartoes';
import { type AppMetrics, fetchDeck, lerResumoDosCartoes } from '../../data/api';
import { hojeDosCartoes } from '../../lib/cartoes/estadoDeHoje';
import type { EstudoAberto } from '../../lib/estado/useNavegacao';
import { gravarFiltro } from '../../lib/filtroDaPratica';
import { numero, t, tp } from '../../lib/i18n';
import { useLangConfig } from '../../lib/langConfig';
import { baseLang } from '../../lib/languages';
import { lazyComRecarga } from '../../lib/lazyComRecarga';
import type { AgeProfileType } from '../../lib/profile';
import {
  gravarOpcoesDaRevisao,
  lerOpcoesDaRevisao,
  OPCOES_PADRAO,
  type OpcoesDaRevisao,
} from '../../lib/revisao/preferencias';
import { type AbaDeCartoes, ABAS_DE_CARTOES } from '../../lib/rotas';
import type { PracticeSeed } from '../../lib/sentences';
import { haVozPara } from '../../lib/voz/haVoz';
import type { Recording, VocabCard } from '../../types';
import AbasDePraticar from '../shell/AbasDePraticar';
import { toast } from '../Toast';
import Baralhos from './cartoes/Baralhos';
import Hoje, { type PedidoDeEstudo } from './cartoes/Hoje';
import Memoria from './cartoes/Memoria';
import TrazerELevar, { type FormatoDeLevar } from './cartoes/TrazerELevar';
import { OpcoesDaRevisaoNoQuest } from './revisao/quest/RevisaoDoQuest';

/* O que só desce quando a pessoa pede: a rodada de revisão, o catálogo de palavras (com os gráficos
   dele), a tela de gerenciar baralhos do Anki e o diálogo de exportar. Abrir "Hoje" não baixa nenhum. */
const Study = lazyComRecarga(() => import('./Study'));
const Metrics = lazyComRecarga(() => import('./Metrics'));
const BaralhoAnki = lazyComRecarga(() => import('./BaralhoAnki'));
const ExportarVocabulario = lazyComRecarga(() => import('./vocab/ExportarVocabulario'));

/**
 * CARTÕES — a casa da revisão, dos baralhos e do catálogo de palavras (`/cartoes`).
 *
 * Porte de `ctTela`, `ctCab` e `ctAbas` (`cartoes.js:180-192, 576-583`), com as cinco abas do
 * protótipo: Hoje, Baralhos, Palavras, Trazer e levar, Memória. A aparência é a do protótipo
 * (`styles/polimento/cartoes.css`, copiado dele); o dado e o comportamento são os do app.
 *
 * UMA LEITURA SÓ: `GET /api/vocab/resumo`, poucos KB com tudo o que Hoje, Baralhos e Memória contam.
 * O baralho inteiro (`GET /api/vocab`, 2 MB numa conta grande) só desce quando a pessoa abre a aba
 * "Palavras", a rodada de revisão ou a exportação, que precisam dele de verdade.
 *
 * A REVISÃO MORA AQUI: `estudo` abre `Study` (a tela que já existia, sem redesenho nesta fatia) no
 * lugar das abas, e o voltar dela devolve a "Hoje".
 *
 * SEM CONTA a tela abre no estado vazio (decisão do dono): não há leitura do servidor, e o que pede
 * conta (importar, revisar) chama o convite de sempre.
 */

const ICONE_DA_ABA: Record<AbaDeCartoes, LucideIcon> = {
  hoje: CalendarCheck,
  baralhos: Layers,
  palavras: BookOpen,
  trazer: ArrowLeftRight,
  memoria: Brain,
};

type Leitura = { fase: 'carregando' } | { fase: 'erro' } | { fase: 'pronta'; resumo: ResumoDosCartoes };

export default function Cartoes({
  aba,
  aoTrocarAba,
  estudo,
  recordings,
  metrics,
  onChangeView,
  ageProfile = 'pro',
  semConta = false,
  practiceSeed = null,
  onSeedConsumed,
}: {
  aba: AbaDeCartoes;
  aoTrocarAba: (aba: AbaDeCartoes) => void;
  /** A rodada de revisão aberta (`/cartoes/estudar`), ou `null`. */
  estudo: EstudoAberto | null;
  recordings: Recording[];
  /** O perfil que o App já carregou: a ofensiva e a maior sequência da aba Memória vêm dele. */
  metrics: AppMetrics | null | undefined;
  onChangeView: (view: string, data?: any) => void;
  ageProfile?: AgeProfileType;
  semConta?: boolean;
  practiceSeed?: PracticeSeed | null;
  onSeedConsumed?: () => void;
}) {
  const langCfg = useLangConfig();
  const idioma = baseLang(langCfg.studying);
  const idiomaNativo = baseLang(langCfg.mine);

  /* O RESUMO: lido ao abrir, ao voltar da rodada e quando uma aba muda o baralho (`versao`). */
  const [leitura, setLeitura] = useState<Leitura>({ fase: 'carregando' });
  const [versao, setVersao] = useState(0);
  const estudando = !!estudo;
  useEffect(() => {
    if (semConta || estudando) return;
    let vivo = true;
    void lerResumoDosCartoes().then((resumo) => {
      if (vivo) setLeitura(resumo ? { fase: 'pronta', resumo } : { fase: 'erro' });
    });
    return () => {
      vivo = false;
    };
  }, [semConta, estudando, versao]);
  const recarregar = useCallback(() => setVersao((v) => v + 1), []);

  const [opcoes, setOpcoes] = useState<OpcoesDaRevisao>(lerOpcoesDaRevisao);
  /* As opções podem ter mudado dentro da rodada: ao voltar dela, vale o que ficou gravado. */
  useEffect(() => {
    if (!estudando) setOpcoes(lerOpcoesDaRevisao());
  }, [estudando]);
  const [ajustando, setAjustando] = useState(false);

  const resumo = !semConta && leitura.fase === 'pronta' ? leitura.resumo : null;
  const dia = useMemo(() => hojeDosCartoes(resumo, opcoes), [resumo, opcoes]);

  /* O baralho inteiro, só para o que precisa dele (exportar, gerenciar o Anki). */
  const [deck, setDeck] = useState<VocabCard[] | null>(null);
  const [levando, setLevando] = useState<FormatoDeLevar | null>(null);
  const [gerenciando, setGerenciando] = useState(false);
  const pedirDeck = async (): Promise<boolean> => {
    try {
      setDeck(await fetchDeck());
      return true;
    } catch (e) {
      toast.error(t('Não consegui carregar as palavras.'), { detail: e });
      return false;
    }
  };
  const levar = async (formato: FormatoDeLevar) => {
    if (await pedirDeck()) setLevando(formato);
  };
  const gerenciarAnki = async () => {
    if (await pedirDeck()) setGerenciando(true);
  };

  /* "+ Palavra" abre o diálogo que mora no catálogo: a aba Palavras abre com o pedido. */
  const [pedidoDeAdicionar, setPedidoDeAdicionar] = useState(0);
  useEffect(() => {
    if (aba !== 'palavras') setPedidoDeAdicionar(0);
  }, [aba]);

  const estudar = (pedido: PedidoDeEstudo = {}) => onChangeView('study', pedido);
  const jogarComATrilha = () => {
    gravarFiltro({ ...FILTRO_PADRAO, fontes: ['trilha'] });
    onChangeView('play');
  };
  const jogarComBaralho = (deckId: string) => {
    gravarFiltro({ ...FILTRO_PADRAO, fontes: ['baralho'], baralhos: [deckId] });
    onChangeView('play');
  };

  /* A pílula das abas acompanha a escolhida quando elas rolam de lado (`aoMostrar.cartoes`, `cartoes.js:630-635`). */
  const abas = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const g = abas.current;
    const sel = g?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (g && sel && g.scrollWidth > g.clientWidth)
      g.scrollLeft = sel.offsetLeft - (g.clientWidth - sel.offsetWidth) / 2;
  }, [aba]);

  // ── A rodada de revisão ────────────────────────────────────────────────────
  if (estudo) {
    const sessao = estudo.sessionId ? recordings.find((r) => r.id === estudo.sessionId) : undefined;
    return (
      <Suspense
        fallback={
          <div className="carregando-da-tela flex-1 flex items-center justify-center text-ink-muted text-sm">
            {t('Carregando…')}
          </div>
        }
      >
        <Study
          key={`${estudo.sessionId ?? 'tudo'}:${estudo.limite ?? ''}:${estudo.soNovas ? 'novas' : ''}:${estudo.praticar ? `p:${estudo.praticar.rotulo}:${estudo.praticar.ids?.length ?? ''}` : ''}`}
          gravacoes={recordings}
          praticar={estudo.praticar}
          recording={sessao}
          onChangeView={onChangeView}
          practiceSeed={practiceSeed}
          onSeedConsumed={onSeedConsumed}
          ageProfile={ageProfile}
          rodada={{ limite: estudo.limite, soNovas: estudo.soNovas }}
        />
      </Suspense>
    );
  }

  // ── Gerenciar os baralhos do Anki: a tela que já existia, com o voltar para cá ──
  if (gerenciando && deck) {
    return (
      <Suspense fallback={null}>
        <BaralhoAnki
          deck={deck}
          idioma={idioma}
          idiomaNativo={idiomaNativo}
          ageProfile={ageProfile}
          rotuloVoltar="Cartões"
          abaInicial="baralhos"
          onVoltar={() => {
            setGerenciando(false);
            recarregar();
          }}
          onImportou={recarregar}
          onMudouBaralhos={recarregar}
          onJogarCom={jogarComBaralho}
          onJogarSoCom={jogarComBaralho}
        />
      </Suspense>
    );
  }

  const carregando = !semConta && leitura.fase === 'carregando';
  const comErro = !semConta && leitura.fase === 'erro';
  const sobre =
    carregando || comErro
      ? t('Sua memória')
      : !resumo || dia.estado === 'vazio'
        ? t('Sua memória · nenhum cartão ainda')
        : [
            ...(dia.estado === 'primeiro' ? [t('Sua memória')] : []),
            tp(resumo.total, '{n} cartão', '{n} cartões', { n: numero(resumo.total) }),
            tp(resumo.idiomas, '{n} idioma', '{n} idiomas'),
            ...(dia.estado === 'primeiro' ? [] : [t('meta de retenção {n}%', { n: opcoes.retencao })]),
          ].join(' · ');

  const rotuloDaAba: Record<AbaDeCartoes, string> = {
    hoje: t('Hoje'),
    baralhos: t('Baralhos'),
    palavras: t('Palavras'),
    trazer: t('Trazer e levar'),
    memoria: t('Memória'),
  };

  const espera = (
    <>
      <div className="q-esqueleto" style={{ minHeight: 148 }} role="status" aria-label={t('Carregando…')} />
      <div className="q-esqueleto" style={{ minHeight: 260 }} aria-hidden />
    </>
  );
  const erro = (
    <div className="q-aviso" role="alert">
      <span className="qv-aviso-texto">
        <TriangleAlert aria-hidden />
        <span>{t('Não consegui carregar os seus cartões. A conexão pode ter caído.')}</span>
      </span>
      <button
        type="button"
        className="q-ctl"
        onClick={() => {
          setLeitura({ fase: 'carregando' });
          recarregar();
        }}
      >
        <RotateCcw aria-hidden /> {t('Tentar de novo')}
      </button>
    </div>
  );

  let painel: React.ReactNode;
  if (aba === 'palavras') {
    /* O catálogo que já existia (busca, filtros, ordenação, a folha da palavra), dentro da tela nova.
       Sem conta, o estado vazio do protótipo (`cartoes.js:419-420`). */
    painel = semConta ? (
      <div className="q-vazio">
        <span className="q-ic">
          <BookOpen aria-hidden />
        </span>
        <h2>{t('Seu caderno está vazio')}</h2>
        <p>{t('Capture uma sessão ou toque numa palavra durante a leitura para começar.')}</p>
      </div>
    ) : (
      <Suspense fallback={espera}>
        <Metrics
          embutida
          recordings={recordings}
          onChangeView={onChangeView}
          ageProfile={ageProfile}
          metrics={metrics}
          pedidoDeAdicionar={pedidoDeAdicionar}
        />
      </Suspense>
    );
  } else if (aba === 'trazer') {
    painel = (
      <TrazerELevar
        idioma={idioma}
        idiomaNativo={idiomaNativo}
        total={resumo?.total ?? null}
        aoIrAba={aoTrocarAba}
        aoMudou={recarregar}
        aoLevar={(formato) => void levar(formato)}
      />
    );
  } else if (carregando) {
    painel = espera;
  } else if (comErro) {
    painel = erro;
  } else if (aba === 'baralhos') {
    painel = (
      <Baralhos
        resumo={resumo}
        sessoes={recordings}
        aoEstudar={estudar}
        aoIrAba={aoTrocarAba}
        aoNavegar={onChangeView}
        aoGerenciarAnki={() => void gerenciarAnki()}
        aoMudou={recarregar}
      />
    );
  } else if (aba === 'memoria') {
    painel = (
      <Memoria
        resumo={resumo}
        metaDeRetencao={opcoes.retencao}
        sequencia={metrics?.streakDays ?? null}
        maiorSequencia={metrics?.maiorSequenciaPresenca ?? null}
        aoIrAba={aoTrocarAba}
        aoAjustes={() => setAjustando(true)}
      />
    );
  } else {
    painel = (
      <Hoje
        resumo={resumo}
        dia={dia}
        metaDeRetencao={opcoes.retencao}
        sessoes={recordings}
        aoEstudar={estudar}
        aoIrAba={aoTrocarAba}
        aoNavegar={onChangeView}
        aoTrilha={jogarComATrilha}
      />
    );
  }

  return (
    <div className="q-palco qv ct" data-testid="cartoes" data-ct-aba-atual={aba} data-ct-hoje={dia.estado}>
      <AbasDePraticar qual="cartoes" />
      <header className="q-cab">
        <div>
          <p className="q-sobre">{sobre}</p>
          <h1>{t('Cartões')}</h1>
        </div>
        {!semConta && (
          <button
            type="button"
            className="q-ctl"
            onClick={() => {
              setPedidoDeAdicionar((n) => n + 1);
              aoTrocarAba('palavras');
            }}
          >
            <Plus aria-hidden /> {t('Palavra')}
          </button>
        )}
        <button type="button" className="q-ctl" onClick={() => setAjustando(true)}>
          <Settings2 aria-hidden /> {t('Ajustes')}
        </button>
      </header>

      <div ref={abas} className="q-abas ct-abas" role="tablist" aria-label={t('Seções de Cartões')}>
        {ABAS_DE_CARTOES.map((id) => {
          const Icone = ICONE_DA_ABA[id];
          return (
            <button
              key={id}
              type="button"
              role="tab"
              id={`ct-aba-${id}`}
              className="q-aba"
              aria-selected={id === aba}
              aria-controls="ct-painel"
              onClick={() => aoTrocarAba(id)}
            >
              <Icone aria-hidden />
              {rotuloDaAba[id]}
              {id === 'palavras' && resumo && <span className="n">{numero(resumo.total)}</span>}
            </button>
          );
        })}
      </div>

      <div className="qv-painel ct-painel" role="tabpanel" id="ct-painel" aria-labelledby={`ct-aba-${aba}`}>
        {painel}
      </div>

      {ajustando && (
        <OpcoesDaRevisaoNoQuest
          valores={opcoes}
          padrao={OPCOES_PADRAO}
          temVoz={haVozPara(idioma)}
          aoTrocar={(mudou) => {
            gravarOpcoesDaRevisao(mudou);
            setOpcoes((o) => ({ ...o, ...mudou }));
          }}
          aoFechar={() => setAjustando(false)}
        />
      )}
      {levando && deck && (
        <Suspense fallback={null}>
          <ExportarVocabulario
            cartoes={deck}
            metrics={metrics ?? null}
            idioma={idioma}
            filtro={null}
            formatoInicial={levando}
            aoFechar={() => setLevando(null)}
          />
        </Suspense>
      )}
    </div>
  );
}
