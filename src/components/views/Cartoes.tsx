import '../../styles/questVocabulario.css';
import '../../styles/questRevisao.css';
import '../../styles/questBiblioteca.css';
import '../../styles/cartoesDoApp.css';

import { FILTRO_PADRAO } from '@core';
import {
  ArrowLeft,
  BookOpen,
  CalendarCheck,
  Ellipsis,
  type LucideIcon,
  RotateCcw,
  SlidersHorizontal,
  TriangleAlert,
} from 'lucide-react';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { ResumoDosCartoes } from '../../core/learning/resumoDosCartoes';
import { type AppMetrics, fetchDeck, lerResumoDosCartoes } from '../../data/api';
import { ativarNotasDoBaralho, type BaralhoAnkiResumo, listarBaralhosAnki } from '../../data/apiAnki';
import { hojeDosCartoes } from '../../lib/cartoes/estadoDeHoje';
import { cartoesDoConteudo, hojeDaFonte } from '../../lib/conteudo/cartoes';
import { chaveDaFonte, type Conteudo, type FonteDeConteudo } from '../../lib/conteudo/estado';
import { conteudoAtual, escolherConteudo, mudarIdiomaDoConteudo, useConteudo } from '../../lib/conteudo/loja';
import { useContagensDeConteudo } from '../../lib/conteudo/useContagens';
import type { EstudoAberto } from '../../lib/estado/useNavegacao';
import { gravarFiltro } from '../../lib/filtroDaPratica';
import { numero, t, tp } from '../../lib/i18n';
import { useLangConfig } from '../../lib/langConfig';
import { baseLang } from '../../lib/languages';
import { lazyComRecarga } from '../../lib/lazyComRecarga';
import { useBarraDeCinco } from '../../lib/polimento/celular';
import type { AgeProfileType } from '../../lib/profile';
import type { RecorteDaPratica } from '../../lib/revisao/pratica';
import {
  gravarOpcoesDaRevisao,
  lerOpcoesDaRevisao,
  OPCOES_PADRAO,
  type OpcoesDaRevisao,
} from '../../lib/revisao/preferencias';
import { type AbaDeCartoes, navegarPara } from '../../lib/rotas';
import type { PracticeSeed } from '../../lib/sentences';
import { haVozPara } from '../../lib/voz/haVoz';
import type { Recording, VocabCard } from '../../types';
import { CabecalhoComFicha } from '../conteudo/FichaDeConteudo';
import { iconeDaFonte, idiomaNaFicha, nomeCurtoDaFonte } from '../conteudo/fontes';
import { type ControleDoSeletor, SeletorDeConteudo } from '../conteudo/SeletorDeConteudo';
import { toast } from '../Toast';
import { AjustesDaMemoria, FolhaDoResto, MenuDaFonte, MenuDeCartoes } from './cartoes/Folhas';
import Hoje, { type PedidoDeEstudo } from './cartoes/Hoje';
import Memoria from './cartoes/Memoria';
import TrazerELevar, { ARQUIVOS_DO_ANKI, FluxoDoAnki } from './cartoes/TrazerELevar';

/* O que só desce quando a pessoa pede: a rodada de revisão, a lista de palavras, a tela de gerenciar
   baralhos do Anki e o diálogo de exportar. Abrir "Hoje" não baixa nenhum. */
const Study = lazyComRecarga(() => import('./Study'));
const Metrics = lazyComRecarga(() => import('./Metrics'));
const BaralhoAnki = lazyComRecarga(() => import('./BaralhoAnki'));
const ExportarVocabulario = lazyComRecarga(() => import('./vocab/ExportarVocabulario'));

/**
 * CARTÕES — a casa da revisão e das palavras (`/cartoes`), na VERSÃO ENXUTA aprovada pelo dono.
 *
 * Porte de `ctTela`, `ctCab` e `ctAbas` (`cartoes.js:197-211, 566-580` de `cartoes-enxuto-src`): o
 * cabeçalho numa linha (o título, a FICHA DE CONTEÚDO no lugar fixo, as abas "Hoje" e "Palavras" e o
 * "…"); a Memória é tela de dentro, com voltar; "Trazer e levar", os Ajustes da memória e exportar são
 * folhas do "…". A aparência é a do protótipo (`styles/polimento/cartoes.css`, copiado dele); o dado e o
 * comportamento são os do app.
 *
 * A ABA "BARALHOS" SAIU: o conteúdo é escolhido na ficha, e o catálogo que ela abre faz esse papel de
 * qualquer tela. As ações que moravam nos Baralhos estão no painel da fonte (Revisar, Praticar, Jogar,
 * Ver palavras) e no "…" dela (abrir a sessão, ativar mais notas, gerenciar o baralho do Anki, exportar).
 *
 * TUDO RESPEITA O CONTEÚDO ESCOLHIDO (`lib/conteudo`): os números de "Hoje", a lista de "Palavras" e a
 * fila da revisão.
 *
 * DUAS LEITURAS PEQUENAS ao abrir: `GET /api/vocab/resumo` e `GET /api/vocab/conteudo`, poucos KB cada.
 * O baralho inteiro (`GET /api/vocab`, 2 MB numa conta grande) só desce quando a pessoa abre "Palavras",
 * a rodada de revisão ou a exportação.
 *
 * SEM CONTA a tela abre no estado vazio (decisão do dono): não há leitura do resumo, e o que pede conta
 * (trazer, revisar) chama o convite de sempre.
 */

const ABAS: Array<[Exclude<AbaDeCartoes, 'memoria'>, LucideIcon]> = [
  ['hoje', CalendarCheck],
  ['palavras', BookOpen],
];

type Leitura = { fase: 'carregando' } | { fase: 'erro' } | { fase: 'pronta'; resumo: ResumoDosCartoes };

type Folha = null | 'menu' | 'ajustes' | 'trazer' | 'resto';

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
  /** O perfil que o App já carregou: a sequência da faixa de estado e da Memória vem dele. */
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
  const cinco = useBarraDeCinco();

  /* O CONTEÚDO ESCOLHIDO (um só, para o app inteiro) e as contagens por fonte. */
  const conteudo = useConteudo();
  const { contagens, recarregar: recarregarContagens } = useContagensDeConteudo(conteudo.idioma);
  const controleDoSeletor = useRef<ControleDoSeletor | null>(null);

  /* O RESUMO: lido ao abrir, ao voltar da rodada e quando algo muda o baralho (`versao`). */
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
  const recarregar = useCallback(() => {
    setVersao((v) => v + 1);
    void recarregarContagens();
  }, [recarregarContagens]);
  /* Ao voltar da rodada as contagens do catálogo também mudaram. */
  const jaEstudou = useRef(false);
  useEffect(() => {
    if (estudando) jaEstudou.current = true;
    else if (jaEstudou.current) {
      jaEstudou.current = false;
      void recarregarContagens();
    }
  }, [estudando, recarregarContagens]);

  const [opcoes, setOpcoes] = useState<OpcoesDaRevisao>(lerOpcoesDaRevisao);
  /* As opções podem ter mudado dentro da rodada: ao voltar dela, vale o que ficou gravado. */
  useEffect(() => {
    if (!estudando) setOpcoes(lerOpcoesDaRevisao());
  }, [estudando]);
  const trocarOpcoes = (mudou: Partial<OpcoesDaRevisao>) => {
    gravarOpcoesDaRevisao(mudou);
    setOpcoes((o) => ({ ...o, ...mudou }));
  };

  const resumo = !semConta && leitura.fase === 'pronta' ? leitura.resumo : null;
  const daFonte = useMemo(
    () =>
      resumo
        ? hojeDaFonte(resumo, conteudo, contagens)
        : { total: 0, fila: { novas: 0, aprendendo: 0, revisar: 0 }, porFase: true },
    [resumo, conteudo, contagens],
  );
  const dia = useMemo(() => hojeDosCartoes(resumo, opcoes, daFonte.fila), [resumo, opcoes, daFonte]);

  /* AS FOLHAS: uma por vez. */
  const [folha, setFolha] = useState<Folha>(null);
  const [menuDaFonte, setMenuDaFonte] = useState<FonteDeConteudo | null>(null);
  const [doAnki, setDoAnki] = useState<BaralhoAnkiResumo[] | null>(null);
  const [arquivoDoAnki, setArquivoDoAnki] = useState<File | null>(null);
  const entradaDoAnki = useRef<HTMLInputElement>(null);
  const escolherArquivoDoAnki = () => entradaDoAnki.current?.click();

  /* O baralho inteiro, só para o que precisa dele (exportar, gerenciar o Anki). */
  const [deck, setDeck] = useState<VocabCard[] | null>(null);
  const [levando, setLevando] = useState<{ cartoes: VocabCard[] } | null>(null);
  const [gerenciando, setGerenciando] = useState(false);
  const pedirDeck = async (): Promise<VocabCard[] | null> => {
    try {
      const d = await fetchDeck();
      setDeck(d);
      return d;
    } catch (e) {
      toast.error(t('Não consegui carregar as palavras.'), { detail: e });
      return null;
    }
  };
  /** Exportar: o caderno inteiro, ou só os cartões de uma fonte. */
  const levar = async (fonte?: FonteDeConteudo) => {
    const d = await pedirDeck();
    if (!d) return;
    setLevando({ cartoes: fonte ? cartoesDoConteudo(d, { idioma: conteudoAtual().idioma, fonte }) : d });
  };
  const gerenciarAnki = async () => {
    if (await pedirDeck()) setGerenciando(true);
  };

  /* "Palavra nova" abre o diálogo que mora na lista: a aba Palavras abre com o pedido. */
  const [pedidoDeAdicionar, setPedidoDeAdicionar] = useState(0);
  useEffect(() => {
    if (aba !== 'palavras') setPedidoDeAdicionar(0);
  }, [aba]);
  const palavraNova = () => {
    setPedidoDeAdicionar((n) => n + 1);
    aoTrocarAba('palavras');
  };

  /* A Memória é tela de dentro: o voltar devolve à aba de onde a pessoa veio (`CT.voltaDaMemoria`). */
  const voltaDaMemoria = useRef<AbaDeCartoes>('hoje');
  useEffect(() => {
    if (aba !== 'memoria') voltaDaMemoria.current = aba;
  }, [aba]);
  const abrirMemoria = () => aoTrocarAba('memoria');

  /** O conteúdo que recorta a rodada: o da ficha, com a fonte pedida no lugar quando há. */
  const conteudoDe = (fonte?: FonteDeConteudo): Conteudo => {
    const atual = conteudoAtual();
    return { idioma: atual.idioma, fonte: fonte ?? atual.fonte };
  };
  const estudar = ({ fonte, limite, soNovas }: PedidoDeEstudo = {}) => {
    const c = conteudoDe(fonte);
    onChangeView('study', {
      ...(limite ? { limite } : {}),
      ...(soNovas ? { soNovas } : {}),
      conteudo: c,
      /* A sessão vai também no endereço (`/cartoes/estudar/<sessão>`): recarregar mantém o recorte. */
      ...(c.fonte.tipo === 'sessao' ? { id: c.fonte.id } : {}),
    });
  };
  const praticar = (rotulo: string, origem: RecorteDaPratica['origem'], fonte?: FonteDeConteudo) => {
    const c = conteudoDe(fonte);
    onChangeView('study', {
      praticar: {
        origem,
        rotulo,
        ...(c.fonte.tipo === 'sessao' ? { sessionId: c.fonte.id } : {}),
      } satisfies RecorteDaPratica,
      conteudo: c,
    });
  };
  const jogarComATrilha = () => {
    gravarFiltro({ ...FILTRO_PADRAO, fontes: ['trilha'] });
    onChangeView('play');
  };
  const jogarComBaralho = (deckId: string) => {
    gravarFiltro({ ...FILTRO_PADRAO, fontes: ['baralho'], baralhos: [deckId] });
    onChangeView('play');
  };

  /* O "…" de uma fonte lê os baralhos do Anki na hora (o "Ativar mais N" precisa do que falta ativar). */
  const abrirMenuDaFonte = (fonte: FonteDeConteudo) => {
    setMenuDaFonte(fonte);
    if (fonte.tipo === 'anki')
      void listarBaralhosAnki()
        .then(setDoAnki)
        .catch(() => setDoAnki([]));
  };
  const ativarMais = async (id: string, nome: string, quantas: number) => {
    try {
      const r = await ativarNotasDoBaralho(id, quantas);
      toast.ok(
        tp(r.ativadas, '{n} nota de “{nome}” entrou como nova.', '{n} notas de “{nome}” entraram como novas.', {
          nome,
        }),
      );
      recarregar();
    } catch (e) {
      toast.error(t('Não consegui ativar as notas.'), { detail: e });
    }
  };

  /* O conteúdo que a rodada aberta usa: o pedido; senão a sessão do endereço; senão o da ficha. Com a
     identidade estável, para a fila da revisão não ser refeita a cada render. */
  const chaveDoEstudo = estudo
    ? estudo.conteudo
      ? `${estudo.conteudo.idioma}|${chaveDaFonte(estudo.conteudo.fonte)}`
      : estudo.sessionId
        ? `|sessao:${estudo.sessionId}`
        : `${conteudo.idioma}|${chaveDaFonte(conteudo.fonte)}`
    : '';
  const conteudoDoEstudo = useMemo<Conteudo | null>(() => {
    if (!estudo) return null;
    if (estudo.conteudo) return estudo.conteudo;
    if (estudo.sessionId) return { idioma: '', fonte: { tipo: 'sessao', id: estudo.sessionId, nome: '' } };
    return conteudoAtual();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chaveDoEstudo]);

  // ── A rodada de revisão ────────────────────────────────────────────────────
  if (estudo) {
    const idDaSessao =
      estudo.sessionId ?? (conteudoDoEstudo?.fonte.tipo === 'sessao' ? conteudoDoEstudo.fonte.id : null);
    const sessao = idDaSessao ? recordings.find((r) => r.id === idDaSessao) : undefined;
    return (
      <Suspense
        fallback={
          <div className="carregando-da-tela flex-1 flex items-center justify-center text-ink-muted text-sm">
            {t('Carregando…')}
          </div>
        }
      >
        <Study
          key={`${chaveDoEstudo}:${estudo.limite ?? ''}:${estudo.soNovas ? 'novas' : ''}:${estudo.praticar ? `p:${estudo.praticar.rotulo}:${estudo.praticar.ids?.length ?? ''}` : ''}`}
          gravacoes={recordings}
          praticar={estudo.praticar}
          recording={sessao}
          conteudo={conteudoDoEstudo}
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
  const dentro = aba === 'memoria';

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

  /* O nome do conteúdo ao lado da contagem de Palavras (`ctQuantas`, `cartoes.js:465-468`): vazio quando é
     "Tudo" de um idioma só. */
  const idiomaDaFicha = idiomaNaFicha(conteudo, contagens);
  const rotuloDoConteudo =
    conteudo.fonte.tipo === 'tudo' && !idiomaDaFicha
      ? ''
      : idiomaDaFicha
        ? t('{nome} em {idioma}', {
            nome: nomeCurtoDaFonte(conteudo.fonte),
            idioma: idiomaDaFicha.toLocaleLowerCase(),
          })
        : nomeCurtoDaFonte(conteudo.fonte);

  let painel: React.ReactNode;
  if (aba === 'palavras') {
    /* A lista de palavras (busca presa no alto, estados, filtros, a palavra aberta). Sem conta, o estado
       vazio do protótipo (`cartoes.js:497-498`). */
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
          conteudo={conteudo}
          rotuloDoConteudo={rotuloDoConteudo}
        />
      </Suspense>
    );
  } else if (carregando) {
    painel = espera;
  } else if (comErro) {
    painel = erro;
  } else if (dentro) {
    painel = (
      <Memoria
        resumo={resumo}
        metaDeRetencao={opcoes.retencao}
        sequencia={metrics?.streakDays ?? null}
        maiorSequencia={metrics?.maiorSequenciaPresenca ?? null}
        aoHoje={() => aoTrocarAba('hoje')}
        aoVerDificeis={() => {
          escolherConteudo({ tipo: 'dificeis' });
          aoTrocarAba('palavras');
        }}
      />
    );
  } else {
    painel = (
      <Hoje
        resumo={resumo}
        dia={dia}
        daFonte={daFonte}
        conteudo={conteudo}
        contagens={contagens}
        opcoes={opcoes}
        sequencia={metrics?.streakDays ?? null}
        aoEstudar={estudar}
        aoPraticar={praticar}
        aoMemoria={abrirMemoria}
        aoAjustes={() => setFolha('ajustes')}
        aoResto={() => setFolha('resto')}
        aoNavegar={onChangeView}
        aoTrilha={jogarComATrilha}
        aoTrazerDoAnki={escolherArquivoDoAnki}
        aoMudarIdioma={mudarIdiomaDoConteudo}
      />
    );
  }

  /* O "…" da fonte: o que ela aceita. */
  const baralhoDoMenu =
    menuDaFonte?.tipo === 'anki' ? (doAnki?.find((b) => b.id === menuDaFonte.id) ?? null) : null;
  const porAtivar = baralhoDoMenu
    ? Math.max(0, baralhoDoMenu.total - baralhoDoMenu.ativas - baralhoDoMenu.descartadas - baralhoDoMenu.ausentes)
    : 0;
  const tipoDaSessaoDe = (f: FonteDeConteudo) =>
    f.tipo === 'sessao' ? contagens?.sessoes.find((s) => s.id === f.id)?.tipo : null;
  const fonteDaFicha = conteudo.fonte;
  const comOpcoes = fonteDaFicha.tipo === 'sessao' || fonteDaFicha.tipo === 'anki' || fonteDaFicha.tipo === 'trilha';

  const seletor = (
    <SeletorDeConteudo
      conteudo={conteudo}
      contagens={contagens}
      aoRecarregar={recarregarContagens}
      controle={controleDoSeletor}
      aoRevisar={(f) => estudar({ fonte: f })}
      aoPraticar={(f) => praticar(nomeCurtoDaFonte(f), 'baralho', f)}
      aoJogar={(f) => onChangeView('play', f.tipo === 'sessao' ? { id: f.id } : undefined)}
      aoVerPalavras={() => aoTrocarAba('palavras')}
      aoMais={
        semConta
          ? undefined
          : (f, gatilho) => {
              /* O catálogo sai antes de a folha da fonte entrar (`ctAbrir`, `cartoes.js:171`). */
              gatilho.closest('dialog')?.close();
              abrirMenuDaFonte(f);
            }
      }
      aoCapturar={() => onChangeView('capture')}
    />
  );
  const abas = !dentro && (
    <div className="q-abas ct-abas" role="tablist" aria-label={t('Seções de Cartões')}>
      {ABAS.map(([id, Icone]) => (
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
          {id === 'hoje' ? t('Hoje') : t('Palavras')}
          {id === 'palavras' && resumo && <span className="n">{numero(daFonte.total)}</span>}
        </button>
      ))}
    </div>
  );
  /* No celular, Cartões e Jogos dividem o botão "Praticar" da barra: o seletor das duas telas vai no
     cabeçalho, ao lado da ficha (`ctSegPraticar`, `cartoes3.js:100-104`, navegação "d"). */
  const cartoesOuJogos = cinco && (
    <div
      className="q-abas ct-praticar ct-so-celular"
      role="tablist"
      aria-label={t('Praticar')}
      data-testid="abas-de-praticar"
    >
      <button type="button" role="tab" className="q-aba" aria-selected>
        {t('Cartões')}
      </button>
      <button
        type="button"
        role="tab"
        className="q-aba"
        aria-selected={false}
        onClick={() => navegarPara({ view: 'play' })}
      >
        {t('Jogos')}
      </button>
    </div>
  );

  return (
    <div
      className={`q-palco qv ct ${dentro ? 'ct-dentro' : ''}`.trim()}
      data-testid="cartoes"
      data-ct-aba-atual={aba}
      data-ct-hoje={dia.estado}
      data-ct-resumo="faixa"
    >
      {dentro ? (
        <header className="q-cab ct-cab ct-cab-dentro">
          <button
            type="button"
            className="q-ctl q-voltar"
            aria-label={t('Voltar para Cartões')}
            onClick={() => aoTrocarAba(voltaDaMemoria.current)}
          >
            <ArrowLeft aria-hidden />
            <span>{t('Voltar')}</span>
          </button>
          <h1>{t('Memória')}</h1>
          <span className="q-espaco" />
          <button
            type="button"
            className="q-ctl"
            aria-label={t('Ajustes da memória')}
            onClick={() => setFolha('ajustes')}
          >
            <SlidersHorizontal aria-hidden />
            <span>{t('Ajustes')}</span>
          </button>
        </header>
      ) : (
        <CabecalhoComFicha
          titulo={t('Cartões')}
          classe="ct-cab"
          antesDaFicha={cartoesOuJogos}
          ficha={
            <>
              {seletor}
              {abas}
            </>
          }
        >
          <button
            type="button"
            className="q-ctl ct-so-icone"
            aria-haspopup="dialog"
            aria-label={t('Mais opções: palavra nova, trazer e levar, ajustes da memória, memória')}
            title={t('Palavra nova, trazer e levar, ajustes da memória, memória')}
            data-testid="mais-de-cartoes"
            onClick={() => setFolha('menu')}
          >
            <Ellipsis aria-hidden />
          </button>
        </CabecalhoComFicha>
      )}

      <div
        className="qv-painel ct-painel"
        role="tabpanel"
        id="ct-painel"
        aria-labelledby={dentro ? undefined : `ct-aba-${aba}`}
        aria-label={dentro ? t('Memória') : undefined}
      >
        {painel}
      </div>

      {/* O campo de arquivo do Anki é da tela: "Trazer do Anki" (Hoje) e a folha "Trazer e levar" o abrem. */}
      {!semConta && (
        <input
          ref={entradaDoAnki}
          type="file"
          hidden
          accept={ARQUIVOS_DO_ANKI}
          aria-label={t('Arquivo do baralho')}
          data-testid="anki-arquivo"
          onChange={(e) => {
            const arquivo = e.target.files?.[0];
            e.target.value = '';
            if (!arquivo) return;
            setFolha(null);
            setArquivoDoAnki(arquivo);
          }}
        />
      )}

      {folha === 'menu' && (
        <MenuDeCartoes
          opcoes={opcoes}
          fonte={
            comOpcoes && !semConta
              ? {
                  Icone: iconeDaFonte(fonteDaFicha, tipoDaSessaoDe(fonteDaFicha)),
                  nome: nomeCurtoDaFonte(fonteDaFicha),
                  detalhe:
                    fonteDaFicha.tipo === 'sessao'
                      ? t('Abrir a sessão, exportar')
                      : fonteDaFicha.tipo === 'anki'
                        ? t('Gerenciar, ativar mais notas, exportar')
                        : t('Exportar'),
                  acao: () => abrirMenuDaFonte(fonteDaFicha),
                }
              : null
          }
          aoPalavraNova={semConta ? undefined : palavraNova}
          aoTrazerELevar={semConta ? undefined : () => setFolha('trazer')}
          aoAjustes={() => setFolha('ajustes')}
          aoMemoria={abrirMemoria}
          aoExportar={semConta || !resumo?.total ? undefined : () => void levar()}
          aoFechar={() => setFolha((f) => (f === 'menu' ? null : f))}
        />
      )}
      {folha === 'trazer' && (
        <TrazerELevar
          total={resumo?.total ?? null}
          entrada={entradaDoAnki}
          aoPalavraNova={palavraNova}
          aoExportar={() => void levar()}
          aoFechar={() => setFolha((f) => (f === 'trazer' ? null : f))}
        />
      )}
      {folha === 'ajustes' && (
        <AjustesDaMemoria
          valores={opcoes}
          padrao={OPCOES_PADRAO}
          temVoz={haVozPara(idioma)}
          aoTrocar={trocarOpcoes}
          aoFechar={() => setFolha((f) => (f === 'ajustes' ? null : f))}
        />
      )}
      {folha === 'resto' && resumo && (
        <FolhaDoResto
          opcoes={opcoes}
          vencem={dia.vencem}
          /* A previsão do resumo é a da conta inteira: só vale como "a semana" com "Tudo" de um idioma só. */
          previsao={conteudo.fonte.tipo === 'tudo' && !contagens?.idioma ? resumo.previsao : null}
          inicioDoDia={resumo.inicioDoDia}
          aoTrocar={trocarOpcoes}
          aoFechar={() => setFolha((f) => (f === 'resto' ? null : f))}
        />
      )}
      {menuDaFonte && (
        <MenuDaFonte
          Icone={iconeDaFonte(menuDaFonte, tipoDaSessaoDe(menuDaFonte))}
          nome={nomeCurtoDaFonte(menuDaFonte)}
          aoAbrirASessao={
            menuDaFonte.tipo === 'sessao' && recordings.some((r) => r.id === menuDaFonte.id)
              ? () => onChangeView('analysis', { id: menuDaFonte.id })
              : undefined
          }
          ativar={
            menuDaFonte.tipo === 'anki' && baralhoDoMenu
              ? {
                  quantas: Math.min(20, porAtivar),
                  ativas: baralhoDoMenu.ativas,
                  total: baralhoDoMenu.total,
                  acao: () => void ativarMais(menuDaFonte.id, baralhoDoMenu.nome, Math.min(20, porAtivar)),
                }
              : null
          }
          aoGerenciar={menuDaFonte.tipo === 'anki' ? () => void gerenciarAnki() : undefined}
          aoExportar={() => void levar(menuDaFonte)}
          aoFechar={() => setMenuDaFonte(null)}
        />
      )}
      {arquivoDoAnki && (
        <FluxoDoAnki
          arquivo={arquivoDoAnki}
          idioma={idioma}
          idiomaNativo={idiomaNativo}
          aoMudou={recarregar}
          aoTrouxe={async (fonte) => {
            const k = await recarregarContagens();
            escolherConteudo(fonte, k?.idioma ?? '');
          }}
          aoVerNoCatalogo={() => controleDoSeletor.current?.abrir()}
          aoFechar={() => setArquivoDoAnki(null)}
        />
      )}
      {levando && (
        <Suspense fallback={null}>
          <ExportarVocabulario
            cartoes={levando.cartoes}
            metrics={metrics ?? null}
            idioma={idioma}
            filtro={null}
            aoFechar={() => setLevando(null)}
          />
        </Suspense>
      )}
    </div>
  );
}
