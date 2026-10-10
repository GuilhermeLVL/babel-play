import '../../../../styles/questJogar.css';
import '../../../../styles/questJogarFiel.css';

import {
  ArrowDown,
  ArrowLeftRight,
  ArrowUp,
  ArrowUpDown,
  ChevronRight,
  CircleHelp,
  LayoutGrid,
  ListChecks,
  type LucideIcon,
  Map as MapIcon,
  Play,
  Search,
  Settings2,
  Shuffle,
  SlidersHorizontal,
  Sparkles,
  Star,
  Trophy,
  Zap,
} from 'lucide-react';
import React, { type ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { perfilDoDispositivo } from '../../../../lib/dispositivo/perfil';
import { type RecursosDoAparelho, recursosDoAparelho } from '../../../../lib/dispositivo/recursos';
import { noHeadset } from '../../../../lib/dispositivo/telaNovaDoQuest';
import { numero, t, tp } from '../../../../lib/i18n';
import { telasEnxutas } from '../../../../lib/polimento/base';
import { celular } from '../../../../lib/polimento/captura';
import { entrarSecao, entraSuave, trocarSugestao } from '../../../../lib/polimento/enxuto';
import type { AgeProfileType } from '../../../../lib/profile';
import { aoMudarIdiomasDaVozDoQuest } from '../../../../lib/voz/vozDoQuest';
import { FAMILIAS, tomDoJogo } from '../../../minigames/ArteDosJogos';
import MiniDoJogo from '../../../minigames/polimento/MiniDoJogo';
import AbasDePraticar from '../../../shell/AbasDePraticar';
import { descricaoDoJogo, type JogoUI, tituloDoJogo } from '../jogos';
import {
  entrarOQueAbriu,
  fotoDaTela,
  type JogoParaOQuest,
  type TileDoQuest,
  tilesDoQuest,
  type VozParaOQuest,
} from './jogosNoQuest';
import { fecharPainelDe, InterruptorDoQuest, OpcoesDoQuest, PainelDoQuest } from './pecasDoQuest';

/** O jogo como `Play.tsx` já o tem: a apresentação (`JOGOS`) mais o estado real dele neste recorte. */
type JogoDoLobby = JogoUI & JogoParaOQuest;

export type CategoriaDoLobby = 'todos' | 'classicos' | 'favoritos';
export type HabilidadeDoLobby = 'todas' | 'vocab' | 'escuta_fala' | 'frase_gramatica';

/** A sugestão para hoje, como `Play.tsx` a calcula (`sugestao`). */
export interface SugestaoDoLobby<J> {
  jogo: J;
  titulo: string;
  porque: ReadonlyArray<readonly [LucideIcon, string]>;
}

interface LobbyDoQuestProps<J extends JogoDoLobby> {
  /**
   * Na ordem do usuário e JÁ FILTRADOS por aba, habilidade e busca (`jogosClassicosFiltrados`): os
   * prontos primeiro, depois os que esperam material. O filtro continua sendo de `Play.tsx`.
   */
  jogos: readonly J[];
  ageProfile: AgeProfileType;
  /** A fonte é a trilha: três jogos mudam de natureza e de descrição (`descricaoNaTrilha`). */
  naTrilha: boolean;
  /** Quantas palavras a fonte escolhida tem prontas. */
  palavras: number;
  /** A fonte em uso, numa linha ("Inglês · Minhas palavras"). */
  fonte: string;
  /** O pé da carta de sempre: a conta da rodada quando o jogo abre, o que falta quando não abre. */
  notaDoBloqueio: (jogo: J) => string;
  /** O mesmo clique da carta de sempre: monta a rodada e abre a antessala. */
  aoJogar: (jogo: J) => void;
  /** Abre "O que você vai praticar" (a gaveta da fonte). Ausente quando só há uma fonte. */
  aoTrocarFonte?: () => void;
  /** Mostra a tela de sempre nesta visita (fica em Opções: o lobby do headset já traz tudo). */
  aoVerTelaCompleta: () => void;
  /**
   * Um aviso com o que houve, o detalhe (quanto falta) e as saídas: acervo pequeno demais, baralho que
   * não carregou. `acao`/`aoAgir` é a forma curta de uma saída só.
   */
  aviso?: AvisoDoLobby;
  /** O que o aparelho tem. Só os testes passam: a tela lê do perfil. */
  recursos?: Pick<RecursosDoAparelho, 'vozDeLeitura' | 'reconhecimentoDoNavegador' | 'tecladoFisico'>;
  /** A voz de leitura para o idioma do baralho (`fonte.lang`): decide se os jogos falados abrem. */
  voz?: VozParaOQuest;

  /** Sorteia um jogo pronto e abre (o botão principal da tela). */
  aoPartidaRapida?: () => void;
  /** As abas Todos / Clássicos / Favoritos, com a contagem de cada uma. */
  categoria?: CategoriaDoLobby;
  aoTrocarCategoria?: (categoria: CategoriaDoLobby) => void;
  contagens?: Record<CategoriaDoLobby, number>;
  /** Busca por nome ou mecânica e o filtro de habilidade. */
  busca?: string;
  aoBuscar?: (texto: string) => void;
  habilidade?: HabilidadeDoLobby;
  aoTrocarHabilidade?: (habilidade: HabilidadeDoLobby) => void;
  /** Tira busca, habilidade e aba de uma vez (o "Limpar filtros e busca" da tela de sempre). */
  aoLimparFiltros?: () => void;
  /** Os jogos fixados (a estrela) e o clique que fixa ou solta. */
  favoritos?: readonly string[];
  aoFavoritar?: (jogo: J) => void;
  /** Abre "Como se joga" do jogo (o "?" da carta). */
  aoComoSeJoga?: (jogo: J) => void;
  /** "Prévia antes de começar": desligada, o clique começa a rodada direto. */
  previa?: boolean;
  aoTrocarPrevia?: (ligada: boolean) => void;
  /**
   * Organizar: todos os jogos, a ordem que a pessoa já escolheu (`OrdemDosJogos.ordem`) e o passo que
   * move um deles. `visiveis` é a lista como o painel a mostra: a seta troca com o vizinho que se vê.
   */
  ordem?: readonly J[];
  ordemEscolhida?: readonly string[];
  aoMover?: (jogo: J, direcao: -1 | 1, visiveis: string[]) => void;
  /** A sugestão para hoje e o "Outra sugestão". */
  sugestao?: SugestaoDoLobby<J> | null;
  aoOutraSugestao?: () => void;
  aoVerRecordes?: () => void;
  aoVerMapa?: () => void;
  /** Curadoria: só quando a fonte inclui um baralho de fora; `n` é o que ficou de fora. */
  curadoria?: { n: number; aoAbrir: () => void };
  /** Diagnóstico do material: o interruptor e os números que ele mostra. */
  diagnostico?: {
    ligado: boolean;
    aoTrocar: () => void;
    /** `explicacao`: o que o número quer dizer (na tela de sempre mora na dica ao parar o ponteiro). */
    itens: ReadonlyArray<{ icone: LucideIcon; texto: string; explicacao?: string }>;
  };
  /** A saída de um jogo bloqueado ("Jogar em inglês", "Escolher gravação"), quando existe. */
  portaDoJogo?: (jogo: J) => { rotulo: string; aoAbrir: () => void } | null;
  /** O placar da corrente que acabou de encerrar (sair no meio não o apaga em silêncio). */
  correnteEncerrada?: { rodadas: number; pontos: number; precisao: number } | null;
  /** O painel da trilha (`PainelTrilha`, já no desenho do headset), quando a fonte é a trilha. */
  trilha?: ReactNode;
}

export interface AvisoDoLobby {
  texto: string;
  detalhe?: string;
  acao?: string;
  aoAgir?: () => void;
  acoes?: ReadonlyArray<{ rotulo: string; aoAgir: () => void }>;
}

const CATEGORIAS: readonly CategoriaDoLobby[] = ['todos', 'classicos', 'favoritos'];

/** Uma seção do painel "Buscar e organizar" (`SECOES` de `enxuto.js:302-306`): um dos painéis de sempre. */
interface SecaoDoPainel {
  id: 'filtros' | 'ordem' | 'opcoes';
  /** O nome inteiro (o `aria-label` da aba) e o curto, que se lê nela. */
  nome: string;
  curto: string;
  icone: LucideIcon;
  sub: string;
  miolo: ReactNode;
  pe?: ReactNode;
}

const HABILIDADES: ReadonlyArray<{ id: HabilidadeDoLobby; rotulo: string }> = [
  { id: 'todas', rotulo: 'Todas' },
  { id: 'vocab', rotulo: 'Vocabulário' },
  { id: 'escuta_fala', rotulo: 'Escuta & fala' },
  { id: 'frase_gramatica', rotulo: 'Sintaxe & frases' },
];

/**
 * JOGAR NO META QUEST (maquete de 01/10/2026, tela 5, completa na segunda rodada): uma grade de
 * cartões grandes, com a etiqueta dizendo COMO se joga antes de entrar. Na frente, os favoritos e a
 * ordem que a pessoa montou; no que ela nunca ordenou, primeiro o que funciona apontando, depois o
 * que usa áudio e por último o que pede digitação. O que o headset não consegue abrir aparece
 * apagado, no fim, com o motivo, em vez de falhar depois do clique.
 *
 * NENHUMA FUNÇÃO DO LOBBY DE SEMPRE FICA DE FORA: partida rápida no alto, as abas, a sugestão para
 * hoje, a saída de cada jogo bloqueado embaixo do cartão dele, e três painéis que abrem no centro:
 * "Buscar e filtrar" (busca e habilidade), "Favoritos e ordem" (a estrela, mover e o "como se joga"
 * de cada jogo) e "Opções" (prévia, diagnóstico, recordes, mapa, curadoria e a tela de sempre). O
 * cartão continua sendo UM alvo inteiro: nada de botão pequeno dentro dele.
 *
 * Só apresentação: quais jogos existem, o nome, a descrição, a ordem, o filtro, o que falta a cada
 * um e o clique que abre a rodada vêm todos de `Play.tsx`.
 *
 * A TELA ENXUTA (protótipo `telas-enxutas`, `enxugarJogar()` de `enxuto.js:207-343`; no computador e no
 * celular, não no headset): as mesmas funções, com menos coisas à vista. O cartão "Sugestão para hoje"
 * sobe para logo abaixo do título, com "Começar" como único botão cheio; "Partida rápida" vira o link
 * "Sortear um jogo" dentro dele, e "Por que este?" e "Outra sugestão" viram links de texto (`.ex-lig`);
 * as abas ficam coladas na grade; os três painéis viram um, "Buscar e organizar", com as três seções.
 */
export default function LobbyDoQuest<J extends JogoDoLobby>({
  jogos,
  ageProfile,
  naTrilha,
  palavras,
  fonte,
  notaDoBloqueio,
  aoJogar,
  aoTrocarFonte,
  aoVerTelaCompleta,
  aviso,
  recursos,
  voz,
  aoPartidaRapida,
  categoria = 'todos',
  aoTrocarCategoria,
  contagens,
  busca = '',
  aoBuscar,
  habilidade = 'todas',
  aoTrocarHabilidade,
  aoLimparFiltros,
  favoritos = [],
  aoFavoritar,
  aoComoSeJoga,
  previa,
  aoTrocarPrevia,
  ordem,
  ordemEscolhida,
  aoMover,
  sugestao,
  aoOutraSugestao,
  aoVerRecordes,
  aoVerMapa,
  curadoria,
  diagnostico,
  portaDoJogo,
  correnteEncerrada,
  trilha,
}: LobbyDoQuestProps<J>) {
  const doAparelho = useMemo(() => recursos ?? recursosDoAparelho(perfilDoDispositivo()), [recursos]);
  /* O desenho também liga no computador: a frase que fala em headset, toque ou "lobby do computador" é
     do aparelho. */
  const noHeadsetAqui = noHeadset();
  /* `enxuta()` de `enxuto.js:27`: a arrumação enxuta vale fora do headset. */
  const enxuta = telasEnxutas();
  const temFiltros = !!(aoBuscar || aoTrocarHabilidade);
  const temOrdem = !!ordem && !!(aoFavoritar || aoMover || aoComoSeJoga);
  /* SETAS NAS ABAS (como as `<Abas>` da tela de sempre): ←/→ andam, Home/End vão às pontas. Só faz
     diferença onde há teclado físico. */
  const aoTeclarNaAba = (e: React.KeyboardEvent<HTMLButtonElement>, atual: CategoriaDoLobby) => {
    const i = CATEGORIAS.indexOf(atual);
    const alvo =
      e.key === 'ArrowRight'
        ? CATEGORIAS[(i + 1) % CATEGORIAS.length]
        : e.key === 'ArrowLeft'
          ? CATEGORIAS[(i - 1 + CATEGORIAS.length) % CATEGORIAS.length]
          : e.key === 'Home'
            ? CATEGORIAS[0]
            : e.key === 'End'
              ? CATEGORIAS[CATEGORIAS.length - 1]
              : null;
    if (!alvo || !aoTrocarCategoria) return;
    e.preventDefault();
    aoTrocarCategoria(alvo);
    document.getElementById(`aba-${alvo}`)?.focus();
  };
  const [painel, setPainel] = useState<null | 'filtros' | 'opcoes' | 'ordem'>(null);
  const [porQueAberto, setPorQueAberto] = useState(false);
  /* O porquê abre na própria tela: só as linhas novas entram animadas (`telas2.js:527-543, 613`). */
  const antesDoPorQue = useRef<Set<string> | null>(null);
  const palco = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (porQueAberto) entrarOQueAbriu(antesDoPorQue.current);
    antesDoPorQue.current = null;
    /* `alternarEstado` de `enxuto.js:284`: na tela enxuta as linhas do porquê sobem em cascata. */
    if (porQueAberto && enxuta) entraSuave([...(palco.current?.querySelectorAll('.qj-porque li') ?? [])]);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `enxuta` é do aparelho, não muda
  }, [porQueAberto]);

  const alternarPorQue = () => {
    antesDoPorQue.current = porQueAberto ? null : fotoDaTela();
    setPorQueAberto((v) => !v);
  };

  /* "Outra sugestão" (`outraSugestao()` de `enxuto.js:286-293`): o texto novo entra depois de pedido. */
  const pediuOutra = useRef(false);
  const idDaSugestao = sugestao ? `${sugestao.jogo.id}|${sugestao.titulo}` : '';
  useLayoutEffect(() => {
    if (!pediuOutra.current) return;
    pediuOutra.current = false;
    trocarSugestao(palco.current?.querySelector('.qj-sugestao-texto') ?? null);
  }, [idDaSugestao]);

  /* "Buscar e organizar": trocar de seção com o painel aberto volta ao topo e anima o miolo
     (`por(d, i, true)` de `enxuto.js:323-330`). Abrir não: a entrada do painel já pega as linhas. */
  const organizar = useRef<HTMLDialogElement>(null);
  const secaoDeAntes = useRef<typeof painel>(null);
  useLayoutEffect(() => {
    const antes = secaoDeAntes.current;
    secaoDeAntes.current = painel;
    if (!enxuta || !painel || !antes || antes === painel) return;
    const corpo = organizar.current?.querySelector('.dlg-corpo');
    if (corpo) corpo.scrollTop = 0;
    entrarSecao(organizar.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `enxuta` é do aparelho, não muda
  }, [painel]);

  /* A lista de idiomas da voz do site chega depois (um GET): os cartões que dependem dela se refazem. */
  const [, refazer] = useState(0);
  useEffect(() => aoMudarIdiomasDaVozDoQuest(() => refazer((n) => n + 1)), []);

  /* A ordem é a do usuário: os favoritos na frente e a ordem escolhida valem na grade inteira. */
  const preferencia = { fixados: favoritos, ordem: ordemEscolhida };
  const tiles = tilesDoQuest(jogos, doAparelho, notaDoBloqueio, voz, preferencia);
  /* "Favoritos e ordem" lista TODOS os jogos como a grade os mostra sem filtro. */
  const naOrdemDaGrade = ordem ? tilesDoQuest(ordem, doAparelho, notaDoBloqueio, voz, preferencia) : [];
  const idsNaOrdemDaGrade = naOrdemDaGrade.map((tile) => tile.jogo.id as string);
  const saidasDoAviso = aviso
    ? (aviso.acoes ?? (aviso.acao && aviso.aoAgir ? [{ rotulo: aviso.acao, aoAgir: aviso.aoAgir }] : []))
    : [];
  const abrem = tiles.filter((tile) => tile.grupo !== 'material');
  const semMaterial = tiles.filter((tile) => tile.grupo === 'material');
  /* O nome do idioma vem em minúscula (`langLabelNaUI`); abrindo a linha, ganha a maiúscula. */
  const rotuloDaFonte = fonte.charAt(0).toLocaleUpperCase() + fonte.slice(1);
  const buscando = busca.trim() !== '';
  const filtrado = buscando || habilidade !== 'todas' || categoria !== 'todos';
  const filtrosLigados = Number(buscando) + Number(habilidade !== 'todas');

  const cartao = ({ jogo, grupo, tag, apagado, nota }: TileDoQuest<J>) => {
    const titulo = tituloDoJogo(jogo, ageProfile);
    const fixado = favoritos.includes(jogo.id);
    const porta = !jogo.estado.ok ? portaDoJogo?.(jogo) : null;
    return (
      <div key={jogo.chave} className="qj-jogo" data-grupo={grupo}>
        <button
          type="button"
          className={`q-tile px-com-mini${apagado ? ' apagado' : ''}`}
          data-jogo={jogo.id}
          data-grupo={grupo}
          disabled={apagado}
          onClick={() => aoJogar(jogo)}
        >
          {/* A MINIATURA do protótipo (`minis.js:37-50`): a cena do jogo no alto do cartão, na cor do grupo. */}
          <MiniDoJogo jogo={jogo.id} cor={tomDoJogo(jogo.id)} />
          <span className="qj-jogo-topo">
            <i className="qj-ponto" style={{ background: tomDoJogo(jogo.id) }} aria-hidden />
            <span className={`q-tag${apagado || grupo === 'teclado' ? ' off' : ''}`}>{tag}</span>
            {fixado && (
              <span className="qj-favorito" role="img" aria-label={t('Favorito')}>
                <Star aria-hidden />
              </span>
            )}
          </span>
          <b>{titulo}</b>
          <span className="q-d">{nota ?? descricaoDoJogo(jogo, ageProfile, naTrilha)}</span>
          {/* A conta da rodada e o recorde, como no pé da carta de sempre (só no jogo que abre). */}
          {jogo.estado.ok && !apagado && <span className="qj-conta">{notaDoBloqueio(jogo)}</span>}
        </button>
        {porta && (
          <button type="button" className="q-ctl qj-porta" data-porta={jogo.id} onClick={porta.aoAbrir}>
            {porta.rotulo} <ChevronRight aria-hidden />
          </button>
        )}
      </div>
    );
  };

  /* OS TRÊS PAINÉIS — o miolo e o pé de cada um. No headset cada um abre no seu painel, como sempre; na
     tela enxuta os três são as seções de UM painel, "Buscar e organizar" (`abrirOrganizar()` de
     `enxuto.js:300-343`: "o miolo de cada seção é o dos três painéis de produção, sem tirar nem pôr"). */
  const peDosFiltros = (
    <>
      {aoLimparFiltros && (
        <button type="button" className="q-ctl" onClick={aoLimparFiltros}>
          {t('Limpar filtros e busca')}
        </button>
      )}
      <button type="button" className="q-ctl pri" onClick={(e) => fecharPainelDe(e.currentTarget)}>
        {tp(tiles.length, 'Ver {n} jogo', 'Ver {n} jogos')}
      </button>
    </>
  );
  const mioloDosFiltros = (
    <>
      {aoBuscar && (
        <label className="q-campo">
          <span>{t('Buscar jogo')}</span>
          <input
            type="search"
            /* `enxuto.js:342`: na tela enxuta o painel abre com a busca em foco (não no celular,
                   onde o teclado cobriria a folha). */
            data-autofocus={enxuta && !celular() ? '' : undefined}
            value={busca}
            onChange={(e) => aoBuscar(e.target.value)}
            placeholder={t('Buscar por nome ou mecânica')}
          />
        </label>
      )}
      {aoTrocarHabilidade && (
        <div className="q-secao">
          <p className="q-rotulo">{t('Filtrar por habilidade')}</p>
          <OpcoesDoQuest
            rotulo={t('Filtrar por habilidade')}
            exclusiva
            valor={[habilidade]}
            aoTrocar={(id) => aoTrocarHabilidade(id as HabilidadeDoLobby)}
            opcoes={HABILIDADES.map((h) => ({ id: h.id, rotulo: t(h.rotulo) }))}
          />
        </div>
      )}
    </>
  );
  const mioloDasOpcoes = (
    <>
      {aoTrocarPrevia && previa !== undefined && (
        <div className="q-ajuste">
          <div>
            <b>{ageProfile === 'kids' ? t('Ver antes de jogar') : t('Prévia antes de começar')}</b>
            <small>
              {noHeadsetAqui
                ? t('Mostra o que vai cair antes de a rodada começar. Desligada, o toque já começa o jogo.')
                : t('Mostra o que vai cair antes de a rodada começar. Desligada, o clique já começa o jogo.')}
            </small>
          </div>
          <InterruptorDoQuest
            ligado={previa}
            aoTrocar={aoTrocarPrevia}
            rotulo={ageProfile === 'kids' ? t('Ver antes de jogar') : t('Prévia antes de começar')}
          />
        </div>
      )}
      {diagnostico && (
        <div className="q-ajuste">
          <div>
            <b>{t('Diagnóstico do material')}</b>
            <small>{t('Mostra no alto quantas palavras servem aos jogos, e por que as outras ficaram de fora.')}</small>
          </div>
          <InterruptorDoQuest
            ligado={diagnostico.ligado}
            aoTrocar={diagnostico.aoTrocar}
            rotulo={t('Diagnóstico do material')}
          />
        </div>
      )}
      <div className="q-lista">
        {(
          [
            aoVerRecordes && [Trophy, t('Recordes'), t('Seus melhores resultados e o ranking.'), aoVerRecordes],
            aoVerMapa && [
              MapIcon,
              t('Mapa do conteúdo'),
              t('O que já caiu, o que vence e o que nunca apareceu.'),
              aoVerMapa,
            ],
            curadoria && [
              ListChecks,
              t('Curadoria'),
              tp(curadoria.n, '{n} palavra ficou de fora dos jogos.', '{n} palavras ficaram de fora dos jogos.', {
                n: numero(curadoria.n),
              }),
              curadoria.aoAbrir,
            ],
            [
              LayoutGrid,
              t('Tela de sempre'),
              noHeadsetAqui
                ? t('O lobby do computador, só nesta visita.')
                : t('O lobby de antes do desenho novo, só nesta visita.'),
              aoVerTelaCompleta,
            ],
          ] as Array<false | undefined | [LucideIcon, string, string, () => void]>
        )
          .filter((l): l is [LucideIcon, string, string, () => void] => !!l)
          .map(([Icone, titulo, apoio, agir]) => (
            <button
              key={titulo}
              type="button"
              className="q-linha"
              onClick={(e) => {
                /* Sai do painel antes de abrir o destino: ao voltar, a pessoa cai no lobby. O painel
                       FECHA pelo `close` nativo, que avisa o `aoFechar`, como no "x": tirado da tela
                       ainda aberto, a camada de polimento o segurava para a saída e ele ficava preso,
                       aberto e sem toque, por cima do destino. */
                fecharPainelDe(e.currentTarget);
                agir();
              }}
            >
              <span className="q-ic" aria-hidden>
                <Icone />
              </span>
              <span>
                <b>{titulo}</b>
                <small>{apoio}</small>
              </span>
              <span className="q-fim" aria-hidden>
                <ChevronRight />
              </span>
            </button>
          ))}
      </div>
    </>
  );
  const peDaOrdem = (
    <button type="button" className="q-ctl pri" onClick={(e) => fecharPainelDe(e.currentTarget)}>
      {t('Pronto')}
    </button>
  );
  const mioloDaOrdem = ordem ? (
    <ol className="qj-ordem">
      {naOrdemDaGrade.map(({ jogo, apagado }) => {
        const titulo = tituloDoJogo(jogo, ageProfile);
        const fixado = favoritos.includes(jogo.id);
        /* A seta move DENTRO do grupo (favoritos entre si, o resto entre si), como em `mover`. */
        const doGrupo = idsNaOrdemDaGrade.filter((id) => favoritos.includes(id) === fixado);
        const i = doGrupo.indexOf(jogo.id);
        return (
          <li key={jogo.chave} className="q-ajuste" data-ordem={jogo.id}>
            <div>
              <b>{titulo}</b>
              {(fixado || apagado) && (
                <small>
                  {[
                    fixado ? t('Favorito: fica no topo') : null,
                    apagado ? t('Não abre agora: fica no fim da grade') : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </small>
              )}
            </div>
            <span className="q-acoes">
              {aoComoSeJoga && (
                <button
                  type="button"
                  className="q-ctl"
                  aria-haspopup="dialog"
                  aria-label={`${t('Como se joga')}: ${titulo}`}
                  onClick={() => aoComoSeJoga(jogo)}
                >
                  <CircleHelp aria-hidden />
                </button>
              )}
              {aoMover && (
                <>
                  <button
                    type="button"
                    className="q-ctl"
                    disabled={i === 0}
                    aria-label={`${t('Mover para antes')}: ${titulo}`}
                    onClick={() => aoMover(jogo, -1, idsNaOrdemDaGrade)}
                  >
                    <ArrowUp aria-hidden />
                  </button>
                  <button
                    type="button"
                    className="q-ctl"
                    disabled={i === doGrupo.length - 1}
                    aria-label={`${t('Mover para depois')}: ${titulo}`}
                    onClick={() => aoMover(jogo, 1, idsNaOrdemDaGrade)}
                  >
                    <ArrowDown aria-hidden />
                  </button>
                </>
              )}
              {aoFavoritar && (
                <button
                  type="button"
                  className="q-ctl qj-estrela"
                  aria-pressed={fixado}
                  aria-label={`${fixado ? t('Tirar dos favoritos') : t('Favoritar')}: ${titulo}`}
                  onClick={() => aoFavoritar(jogo)}
                >
                  <Star aria-hidden />
                </button>
              )}
            </span>
          </li>
        );
      })}
    </ol>
  ) : null;

  const SUB_DOS_FILTROS = t('Por nome, por mecânica ou pelo que o jogo treina.');
  const SUB_DAS_OPCOES = t('A rodada, o seu material e a ordem dos jogos.');
  const SUB_DA_ORDEM = t('Fixe os favoritos no topo, mude a ordem dos cartões e veja como cada jogo se joga.');
  /* `SECOES` de `enxuto.js:302-306`: só entram as que este lobby tem. */
  const secoes: SecaoDoPainel[] = [
    ...(temFiltros
      ? [
          {
            id: 'filtros' as const,
            nome: t('Buscar e filtrar'),
            curto: t('Buscar'),
            icone: Search,
            sub: SUB_DOS_FILTROS,
            miolo: mioloDosFiltros,
            pe: peDosFiltros,
          },
        ]
      : []),
    ...(temOrdem
      ? [
          {
            id: 'ordem' as const,
            nome: t('Favoritos e ordem'),
            curto: t('Favoritos e ordem'),
            icone: Star,
            sub: SUB_DA_ORDEM,
            miolo: mioloDaOrdem,
            pe: peDaOrdem,
          },
        ]
      : []),
    {
      id: 'opcoes',
      nome: t('Opções'),
      curto: t('Opções'),
      icone: Settings2,
      sub: SUB_DAS_OPCOES,
      miolo: mioloDasOpcoes,
    },
  ];
  const secaoAberta = secoes.find((x) => x.id === painel) ?? null;

  /* O CARTÃO DA SUGESTÃO. Na tela enxuta ele sobe para logo abaixo do título (`enxuto.js:246-268`). */
  const cartaoDaSugestao = sugestao && (
    <section className="q-cartao qj-sugestao" aria-labelledby="qj-sugestao-t">
      <div className="qj-sugestao-linha">
        <span className="q-ic" aria-hidden>
          <Sparkles />
        </span>
        <div className="qj-sugestao-texto">
          <p className="q-rotulo">{t('Sugestão para hoje')}</p>
          <b id="qj-sugestao-t">{sugestao.titulo}</b>
          <small>
            {t('Com')} {tituloDoJogo(sugestao.jogo, ageProfile)} · {t('rodada curta')}
          </small>
        </div>
        {enxuta ? (
          <>
            {/* `enxuto.js:259-264`: três links discretos e UM botão cheio. */}
            <span className="ex-ligs">
              <button
                type="button"
                className="ex-lig"
                data-ex="porque"
                aria-expanded={porQueAberto}
                onClick={alternarPorQue}
              >
                <CircleHelp aria-hidden />
                {porQueAberto ? t('Esconder o porquê') : t('Por que este?')}
              </button>
              {aoOutraSugestao && (
                <button
                  type="button"
                  className="ex-lig"
                  data-ex="outra"
                  onClick={() => {
                    pediuOutra.current = true;
                    aoOutraSugestao();
                  }}
                >
                  <Shuffle aria-hidden />
                  {t('Outra sugestão')}
                </button>
              )}
              {aoPartidaRapida && (
                <button
                  type="button"
                  className="ex-lig"
                  data-ex="sortear"
                  title={t('Sorteia um jogo aleatório dentre os disponíveis e inicia imediatamente')}
                  onClick={aoPartidaRapida}
                >
                  <Zap aria-hidden />
                  {t('Sortear um jogo')}
                </button>
              )}
            </span>
            <button
              type="button"
              className="q-ctl pri"
              data-ex="comecar"
              data-sugestao={sugestao.jogo.id}
              onClick={() => aoJogar(sugestao.jogo)}
            >
              <Play aria-hidden />
              {t('Começar')}
            </button>
          </>
        ) : (
          <div className="q-acoes">
            <button type="button" className="q-ctl" aria-expanded={porQueAberto} onClick={alternarPorQue}>
              <CircleHelp aria-hidden />
              {porQueAberto ? t('Esconder o porquê') : t('Por que este?')}
            </button>
            {aoOutraSugestao && (
              <button type="button" className="q-ctl" onClick={aoOutraSugestao}>
                <Shuffle aria-hidden />
                {t('Outra sugestão')}
              </button>
            )}
            <button
              type="button"
              className="q-ctl"
              data-sugestao={sugestao.jogo.id}
              onClick={() => aoJogar(sugestao.jogo)}
            >
              <Play aria-hidden />
              {t('Começar')}
            </button>
          </div>
        )}
      </div>
      {porQueAberto && (
        <ul className="qj-porque">
          {sugestao.porque.map(([Icone, texto]) => (
            <li key={texto}>
              <Icone aria-hidden />
              <span>{texto}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );

  return (
    <div ref={palco} className={`q-palco qj quest-jogar${enxuta ? ' ex-jogar' : ''}`} data-testid="lobby-do-quest">
      {/* Na barra de cinco do celular, Cartões e Jogar são as duas abas do "Praticar" (`cartoes3.js:162-166`). */}
      <AbasDePraticar qual="jogar" />
      <div className="q-cab">
        <div>
          <p className="q-sobre">
            {palavras > 0
              ? tp(palavras, '{n} palavra pronta', '{n} palavras prontas', { n: numero(palavras) })
              : t('Nenhuma palavra pronta')}
          </p>
          <h1>{t('Jogar')}</h1>
        </div>
        {aoTrocarFonte ? (
          <button
            type="button"
            className="q-chip"
            onClick={aoTrocarFonte}
            aria-haspopup="dialog"
            aria-label={`${t('Trocar')}: ${rotuloDaFonte}`}
          >
            <ArrowLeftRight aria-hidden />
            {/* `enxuto.js:226-230`: o nome da fonte num `span`, para encolher com reticências. */}
            {enxuta ? <span className="ex-fonte-txt">{rotuloDaFonte}</span> : rotuloDaFonte}
          </button>
        ) : (
          fonte && <span className="q-chip">{rotuloDaFonte}</span>
        )}
        {/* `enxuto.js:238-239`: na tela enxuta a "Partida rápida" é o link "Sortear um jogo" do cartão. */}
        {!enxuta && aoPartidaRapida && (
          <button
            type="button"
            className="q-ctl pri"
            onClick={aoPartidaRapida}
            /* A mesma dica da tela de sempre, para quem para o ponteiro em cima (no computador). */
            title={t('Sorteia um jogo aleatório dentre os disponíveis e inicia imediatamente')}
          >
            <Zap aria-hidden />
            {t('Partida rápida')}
          </button>
        )}
      </div>

      {/* `enxuto.js:266-268`: o cartão logo abaixo do título e, com a fonte Trilha, a linha dela em seguida. */}
      {enxuta && cartaoDaSugestao}
      {/* Sem sugestão (nenhum jogo pronto) não há cartão: o sorteio continua à mão, e avisa que não há jogo. */}
      {enxuta && !sugestao && aoPartidaRapida && (
        <span className="ex-ligs">
          <button
            type="button"
            className="ex-lig"
            data-ex="sortear"
            title={t('Sorteia um jogo aleatório dentre os disponíveis e inicia imediatamente')}
            onClick={aoPartidaRapida}
          >
            <Zap aria-hidden />
            {t('Sortear um jogo')}
          </button>
        </span>
      )}
      {enxuta && trilha}

      <div className="qj-ferramentas">
        {aoTrocarCategoria && (
          <div className="q-abas" role="tablist" aria-label={t('Categorias de jogos')}>
            {(
              [
                ['todos', t('Todos'), Sparkles],
                ['classicos', t('Clássicos'), Zap],
                ['favoritos', t('Favoritos'), Star],
              ] as const
            ).map(([id, rotulo, Icone]) => (
              <button
                key={id}
                type="button"
                role="tab"
                id={`aba-${id}`}
                className="q-aba"
                aria-selected={categoria === id}
                onClick={() => aoTrocarCategoria(id)}
                onKeyDown={(e) => aoTeclarNaAba(e, id)}
              >
                <Icone aria-hidden />
                {rotulo}
                {contagens && <span className="n">{contagens[id]}</span>}
              </button>
            ))}
          </div>
        )}
        <span className="q-espaco" />
        {enxuta ? (
          /* `enxuto.js:241-244`: três chips viram um. Abre na primeira seção (a busca). */
          <button
            type="button"
            className="q-chip ex-organizar"
            aria-haspopup="dialog"
            data-ex="organizar"
            aria-label={t('Buscar e organizar os jogos')}
            title={t('Buscar e filtrar, favoritos e ordem, opções')}
            onClick={() => setPainel(secoes[0].id)}
          >
            <Search aria-hidden />
            <span>{t('Buscar e organizar')}</span>
            {/* Dado do app: quantos filtros estão ligados (no celular o chip é só o ícone). */}
            {filtrosLigados > 0 && <span className="qj-n">{filtrosLigados}</span>}
          </button>
        ) : (
          <>
            {temFiltros && (
              <button type="button" className="q-chip" aria-haspopup="dialog" onClick={() => setPainel('filtros')}>
                <Search aria-hidden />
                {t('Buscar e filtrar')}
                {filtrosLigados > 0 && <span className="qj-n">{filtrosLigados}</span>}
              </button>
            )}
            {temOrdem && (
              <button type="button" className="q-chip" aria-haspopup="dialog" onClick={() => setPainel('ordem')}>
                <Star aria-hidden />
                {t('Favoritos e ordem')}
              </button>
            )}
            <button type="button" className="q-chip" aria-haspopup="dialog" onClick={() => setPainel('opcoes')}>
              <Settings2 aria-hidden />
              {t('Opções')}
            </button>
          </>
        )}
      </div>

      {aviso && (
        <div className="q-aviso" role="status">
          <span>
            {aviso.texto}
            {aviso.detalhe && <small className="qj-aviso-detalhe">{aviso.detalhe}</small>}
          </span>
          {saidasDoAviso.map((saida) => (
            <button key={saida.rotulo} type="button" className="q-ctl" onClick={saida.aoAgir}>
              {saida.rotulo}
            </button>
          ))}
        </div>
      )}

      {correnteEncerrada && correnteEncerrada.rodadas > 1 && (
        <div className="q-aviso" data-corrente>
          <span>
            {t('Sequência encerrada: {rodadas} rodadas, {pontos} pontos, {n}% de acerto no conjunto.', {
              rodadas: correnteEncerrada.rodadas,
              pontos: numero(correnteEncerrada.pontos),
              n: correnteEncerrada.precisao,
            })}
          </span>
        </div>
      )}

      {diagnostico?.ligado && (
        <ul className="qj-diag" role="status" aria-label={t('Diagnóstico do material')}>
          {diagnostico.itens.map(({ icone: Icone, texto, explicacao }) => (
            <li key={texto}>
              <Icone aria-hidden />
              <span>
                <b>{texto}</b>
                {explicacao && <small>{explicacao}</small>}
              </span>
            </li>
          ))}
        </ul>
      )}

      {!enxuta && trilha}

      {!enxuta && cartaoDaSugestao}

      {/* A aba escolhida já se vê nas abas; busca e habilidade moram num painel, então são ditas aqui. */}
      {filtrosLigados > 0 && (
        <div className="q-aviso" data-filtro>
          <span>
            {tp(tiles.length, '{n} jogo com este filtro', '{n} jogos com este filtro')}
            {buscando ? ` · “${busca.trim()}”` : ''}
            {habilidade !== 'todas' ? ` · ${t(HABILIDADES.find((h) => h.id === habilidade)?.rotulo ?? '')}` : ''}
          </span>
          {aoLimparFiltros && (
            <button type="button" className="q-ctl" onClick={aoLimparFiltros}>
              {t('Limpar filtros e busca')}
            </button>
          )}
        </div>
      )}

      <div
        id="grade-de-jogos"
        role={aoTrocarCategoria ? 'tabpanel' : undefined}
        aria-labelledby={aoTrocarCategoria ? `aba-${categoria}` : undefined}
      >
        {abrem.length > 0 ? (
          <div className="q-grade g4">{abrem.map(cartao)}</div>
        ) : (
          <div className="q-vazio">
            <span className="q-ic" aria-hidden>
              <Search />
            </span>
            <h2>
              {filtrado ? t('Nenhum jogo pronto com esse filtro') : t('Nenhum jogo abre só com este material ainda')}
            </h2>
            <p>
              {filtrado
                ? t('Troque o filtro ou busque por outra mecânica.')
                : t('Os jogos abaixo dizem o que falta para abrir.')}
            </p>
            {/* Com busca ou habilidade ligada, o "Limpar" já está na faixa de aviso logo acima. */}
            {filtrado && filtrosLigados === 0 && aoLimparFiltros && (
              <button type="button" className="q-ctl" onClick={aoLimparFiltros}>
                {t('Limpar filtros e busca')}
              </button>
            )}
          </div>
        )}

        {semMaterial.length > 0 && (
          <section className="q-secao qj-presos">
            <header>
              <div>
                <h2>{t('Precisam de outro material')}</h2>
                <p>{t('Não estão quebrados: pedem algo que este recorte não tem. Cada um diz o que falta.')}</p>
              </div>
            </header>
            <div className="q-grade g4">{semMaterial.map(cartao)}</div>
          </section>
        )}
      </div>

      {tiles.length > 0 && (
        <p className="qj-legenda" aria-label={t('A cor diz o que o jogo treina')}>
          <span>{t('A cor diz o que o jogo treina')}:</span>
          {FAMILIAS.map((f) => (
            <span key={f.rotulo}>
              <i className="qj-ponto" style={{ background: f.tom }} aria-hidden />
              {t(f.rotulo)}
            </span>
          ))}
        </p>
      )}

      {!enxuta && painel === 'filtros' && (
        <PainelDoQuest
          icone={SlidersHorizontal}
          titulo={t('Buscar e filtrar')}
          sub={SUB_DOS_FILTROS}
          aoFechar={() => setPainel(null)}
          pe={peDosFiltros}
        >
          {mioloDosFiltros}
        </PainelDoQuest>
      )}

      {!enxuta && painel === 'opcoes' && (
        <PainelDoQuest icone={Settings2} titulo={t('Opções')} sub={SUB_DAS_OPCOES} aoFechar={() => setPainel(null)}>
          {mioloDasOpcoes}
        </PainelDoQuest>
      )}

      {!enxuta && painel === 'ordem' && ordem && (
        <PainelDoQuest
          largo
          icone={ArrowUpDown}
          titulo={t('Favoritos e ordem')}
          sub={SUB_DA_ORDEM}
          aoFechar={() => setPainel(null)}
          classe="qj-organizar"
          pe={peDaOrdem}
        >
          {mioloDaOrdem}
        </PainelDoQuest>
      )}

      {/* "BUSCAR E ORGANIZAR" (`abrirOrganizar()` de `enxuto.js:313-343`): um painel só, com as três seções
          dos painéis de sempre, uma por vez. O painel fica montado enquanto a seção troca. */}
      {enxuta && secaoAberta && (
        <PainelDoQuest
          largo
          icone={SlidersHorizontal}
          titulo={t('Buscar e organizar')}
          sub={secaoAberta.sub}
          classe="ex-organizar-dlg"
          refDoPainel={organizar}
          aoFechar={() => setPainel(null)}
          abas={
            <div className="ex-org-abas">
              <div className="q-abas q-seg" role="tablist" aria-label={t('Seções')}>
                {secoes.map(({ id, nome, curto, icone: Icone }, i) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    className="q-aba"
                    aria-selected={id === secaoAberta.id}
                    data-ex-secao={i}
                    aria-label={nome}
                    onClick={() => setPainel(id)}
                  >
                    <Icone aria-hidden />
                    <span>{curto}</span>
                  </button>
                ))}
              </div>
            </div>
          }
          pe={secaoAberta.pe}
        >
          {secaoAberta.miolo}
        </PainelDoQuest>
      )}
    </div>
  );
}
