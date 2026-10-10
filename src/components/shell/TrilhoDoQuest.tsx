/* O CSS das telas do Quest chega junto com o trilho (que só o headset baixa): fora do CSS inicial de
   todo mundo, e sempre presente quando as telas novas estão ligadas, porque o trilho está sempre montado. */
import '../../styles/quest.css';
/* E as medidas do headset sobre as peças de sempre (`.tela`, `.btn`, `<dialog>`, `.toast`…). */
import '../../styles/questBase.css';
/* E o movimento rico (molas, curvas), que só se aplica com `<html data-movimento="rico">`. */
import '../../styles/questMovimento.css';
/* E o que o protótipo tem por ser um clone do computador, repetido para a marca do celular. */
import '../../styles/polimentoCelular.css';

import {
  Activity,
  Bell,
  BellOff,
  ChevronRight,
  Ellipsis,
  Gauge,
  HardDrive,
  LifeBuoy,
  Lock,
  LogIn,
  LogOut,
  Moon,
  Search,
  Settings,
  Sparkles,
  Sun,
  Target,
  UserRound,
  Vibrate,
  VibrateOff,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import React, { useEffect, useState } from 'react';

import { tetoAnonimoDa } from '../../core/tetoAnonimo';
import { ehAdmin } from '../../lib/admin';
import * as auth from '../../lib/auth';
import { perfilDoDispositivo } from '../../lib/dispositivo/perfil';
import {
  guardarVibracaoDoQuest,
  useVibracaoDoQuest,
  type VibracaoDoQuest,
  VIBRACOES_DO_QUEST,
} from '../../lib/dispositivo/preferenciasDoQuest';
import { recursosDoAparelho } from '../../lib/dispositivo/recursos';
import { instalarRespostaAoApontar } from '../../lib/dispositivo/respostaAoApontar';
import { noHeadset } from '../../lib/dispositivo/telaNovaDoQuest';
import { edicaoEstatica } from '../../lib/edicaoEstatica';
import { getEntitlements } from '../../lib/entitlements';
import { useFlag } from '../../lib/flags';
import { t, tp } from '../../lib/i18n';
import { aoMudarIdentidade, estaAnonimo } from '../../lib/identidade';
import { instalarMarcaDeMovimento } from '../../lib/movimento/animar';
import { instalarOrigemDoToque } from '../../lib/movimento/revelar';
import { marcarLida, marcarTodasLidas, naoLidas, quando } from '../../lib/notificacoes';
import { instalarAgua } from '../../lib/polimento/agua';
import { instalarPolimento } from '../../lib/polimento/base';
import {
  instalarCelular,
  lembrarPratica,
  NO_MAIS_NO_CELULAR,
  PRATICAR,
  ultimaPratica,
  useBarraDeCinco,
} from '../../lib/polimento/celular';
import { instalarCursor } from '../../lib/polimento/cursor';
import { instalarDialogos } from '../../lib/polimento/dialogos';
import { instalarFolhas } from '../../lib/polimento/folha';
import { instalarMinis } from '../../lib/polimento/minis';
import { instalarPonteiro } from '../../lib/polimento/ponteiro';
import { pedirTela, precarregarNoOcioso } from '../../lib/polimento/precarga';
import { medirOPulso } from '../../lib/polimento/pulso';
import { instalarSentidos } from '../../lib/polimento/sentidos';
import { instalarTelas } from '../../lib/polimento/telas';
import { authRequired } from '../../lib/supabase';
import { usePerfil } from '../../lib/usePerfil';
import type { ViewType } from '../../types';
import { exigeConta } from '../conta/exigeConta';
import { useListaDeNotificacoes } from './CentralDeNotificacoes';
import { type AgeProfileType, ITEM_ADMIN, NAV_ITEMS, navLabel } from './navItems';
import { MarcaBabel } from './ShellBits';

/**
 * OS DESTINOS DO TRILHO: os seis da navegação A do protótipo dos cartões (`CT_NAV.a.itens`,
 * `cartoes3.js:14`), os mesmos para todo mundo. O conteúdo da pessoa (Biblioteca, Cartões) sobe para o
 * trilho; o acessório (Estatísticas, Personalizar) desce para o "Mais" (decisão do dono, 10/10/2026).
 * Antes eram Início, Capturar, Intérprete, Jogar, Estatísticas e Personalizar (`ROTAS`, `prototipo.js:87`).
 */
const NO_TRILHO: ViewType[] = ['hub', 'capture', 'interprete', 'library', 'cartoes', 'play'];

/** A ordem dos ladrilhos do "Mais" (`CT_NAV.a.mais`, `cartoes3.js:14`): o perfil e a ajuda entram no meio. */
const ANTES_DO_PERFIL: ViewType[] = ['estatisticas', 'loja', 'settings'];

interface TrilhoDoQuestProps {
  activeView: ViewType;
  onChangeView: (view: ViewType, dado?: Record<string, string>) => void;
  /** Abre a busca global (o trilho não tem o cabeçalho que a trazia). Ausente = sem o botão. */
  aoBuscar?: () => void;
  /** Abre a porta de login (só existe onde há login e a pessoa está sem conta). */
  aoEntrar?: () => void;
  ageProfile: AgeProfileType;
  /** Quem está sem conta: o que exige conta sai do trilho e fica em "Mais". */
  semConta?: boolean;
  darkMode: boolean;
  toggleDarkMode: () => void;
  soundEnabled: boolean;
  toggleSound: () => void;
  /** O Modo desempenho (sem animações, partículas, desfoque e sombras). Ausente = sem o botão. */
  performanceMode?: boolean;
  togglePerformanceMode?: () => void;
  /**
   * O número do dia no item Cartões (`ctSelo`, `cartoes3.js:61-65`): quantos cartões vencem agora.
   * Zero, nulo ou ausente = sem selo (em dia, sem cartões ou ainda carregando).
   */
  cartoesHoje?: number | null;
}

/**
 * O MENU NO META QUEST — um trilho de ícones no lugar do menu de 220 px com dez itens.
 *
 * Os destinos de uso frequente com alvo de 64 px e rótulo curto; o resto (Personalizar, Planos, Sobre,
 * Ajustes, perfil, ajuda, diagnóstico) e os dois interruptores que o rodapé do menu tinha
 * (claro/escuro e som) ficam num painel no centro da tela, aberto por "Mais". Nada abre por hover e
 * nada desliza pela lateral. Com a janela estreita (ao lado de um jogo), o trilho deita embaixo.
 *
 * O painel "Mais" também guarda o que o cabeçalho de sempre trazia e a primeira versão do trilho tinha
 * deixado de fora: a BUSCA, os AVISOS (o sino, com a contagem no próprio botão "Mais") e o que esta
 * edição é ("edição de demonstração", o texto do menu da conta). E a vibração do controle ao apontar.
 *
 * NO COMPUTADOR (o mesmo desenho fora do headset, 02/10/2026) o trilho é o mesmo, com o que é do
 * aparelho trocado: a vibração do controle e o diagnóstico (que a casca de sempre só lista no Quest,
 * `MenuDaConta.tsx`) não aparecem, e a busca ganha um lugar no próprio trilho, com o atalho à vista
 * (Ctrl/⌘+K), como no rodapé do menu de sempre. Quem decide é o aparelho (`noHeadset()`,
 * `recursosDoAparelho().tecladoFisico`), nunca a chave do desenho.
 */
/** A tecla do atalho da busca como este teclado a escreve (⌘ no Mac, Ctrl nos outros). */
const teclaDaBusca = (): string =>
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.platform ?? '') ? '⌘ K' : 'Ctrl K';

/** A frase da entrada "Planos e Premium": as duas do protótipo, com os dias que de fato restam do teste. */
const fraseDoPlano = (): string => {
  const { plan, teste } = getEntitlements();
  if (plan === 'free' || plan === 'anonimo') return t('Você está no Grátis · teste o Premium por 14 dias, sem cartão');
  if (!teste) return t('Você está no Premium');
  const dias = Math.max(1, Math.ceil((teste.terminaEm - Date.now()) / 86_400_000));
  return tp(dias, 'Premium em teste · {n} dia', 'Premium em teste · {n} dias');
};

const ROTULO_DA_VIBRACAO: Record<VibracaoDoQuest, () => string> = {
  desligada: () => t('Vibração ao apontar: desligada'),
  suave: () => t('Vibração ao apontar: suave'),
  forte: () => t('Vibração ao apontar: forte'),
};

export default function TrilhoDoQuest({
  activeView,
  onChangeView,
  aoBuscar,
  aoEntrar,
  ageProfile,
  semConta = false,
  darkMode,
  toggleDarkMode,
  soundEnabled,
  toggleSound,
  performanceMode = false,
  togglePerformanceMode,
  cartoesHoje = null,
}: TrilhoDoQuestProps) {
  const [maisAberto, setMaisAberto] = useState(false);
  const [aba, setAba] = useState<'destinos' | 'avisos'>('destinos');
  const avisos = useListaDeNotificacoes();
  const novos = naoLidas(avisos);
  const vibracao = useVibracaoDoQuest();
  /* O APARELHO (não muda com a página aberta): o headset tem o controle que vibra; o computador tem o
     teclado, e com ele o atalho da busca. */
  const [headset] = useState(noHeadset);
  const [temTeclado] = useState(() => recursosDoAparelho(perfilDoDispositivo()).tecladoFisico);
  /* FORA DO HEADSET o botão da busca existe no trilho, como no protótipo, que tem os oito botões em todo
     aparelho: a barra de cinco destinos (`celular.css:57-62`) conta os botões pela posição, e sem ele o
     "Mais" seria o sétimo, o que ela esconde. Na barra ele não aparece (a busca fica no "Mais"); no
     tablet acima de 720 px ele fica no pé do trilho, sem a tecla do atalho. */
  const buscaNoTrilho = !!aoBuscar && (temTeclado || !headset);
  /* A BARRA DE CINCO DESTINOS (janela até 720 px, com a camada ligada): Início, Praticar, Capturar,
     Intérprete, Mais (`CT_NAV.b.cel`, `cartoes3.js:15`; decisão do dono: o Intérprete não sai da barra).
     A Biblioteca sai da barra e vira o primeiro ladrilho do "Mais" (`ctArrumarMais`, `cartoes3.js:103`),
     e o destaque dela vai para o botão "Mais" (`marcarTrilho`, `cartoes3.js:73-75`). O quinto botão, o
     dos Cartões, vira o "Praticar": abre a última das duas telas (Cartões ou Jogar) e fica marcado nas
     duas (`cartoes3.js:72, 87`). O Jogar, sexto, some da barra (`cartoes.css:322-323`). */
  const cinco = useBarraDeCinco();
  const noMaisNoCelular = (id: ViewType) => cinco && (NO_MAIS_NO_CELULAR as readonly ViewType[]).includes(id);
  const ehDePraticar = (id: ViewType) => (PRATICAR as readonly ViewType[]).includes(id);
  /* Quem escolhe a posição dos botões na barra é o CSS do protótipo, pela variante da navegação. */
  useEffect(() => {
    document.documentElement.dataset.ctNav = 'b';
    return () => {
      delete document.documentElement.dataset.ctNav;
    };
  }, []);
  /* A última das duas telas de praticar: é para ela que o "Praticar" leva. */
  useEffect(() => {
    if (activeView === 'cartoes' || activeView === 'play') lembrarPratica(activeView);
  }, [activeView]);
  /* QUEM EU SOU: o que o menu da conta de sempre dizia (`MenuDaConta.tsx`): nome e e-mail, ou o estado
     real quando não há e-mail, e o aviso do convidado com os tetos. */
  const { perfil } = usePerfil();
  const [anonimo, setAnonimo] = useState(estaAnonimo);
  useEffect(() => aoMudarIdentidade(() => setAnonimo(estaAnonimo())), []);
  const convidado = useFlag('modo_convidado') && anonimo;
  const semServidor = edicaoEstatica();
  const nome = perfil?.displayName?.trim() || null;
  const email = perfil?.email?.trim() || null;
  const estadoDaConta = semServidor
    ? t('edição de demonstração · dados só neste navegador')
    : convidado
      ? t('Você está usando como convidado')
      : anonimo
        ? t('sem conta · dados só neste navegador')
        : authRequired
          ? t('sessão ativa')
          : t('conta local');
  /* A resposta ao apontar (pulso no controle, brilho que segue o ponteiro) vive enquanto o trilho
     vive: só no Quest com as telas novas, e sai junto se a chave for desligada em `/diagnostico`. */
  useEffect(() => instalarRespostaAoApontar(), []);
  /* A marca `data-movimento` (rico no computador e no celular, contido no headset e no modo leve)
     também vive enquanto o trilho vive. */
  useEffect(() => instalarMarcaDeMovimento(), []);
  /* E a pílula que desliza entre as abas, em todas as `.q-abas` da tela. */
  useEffect(() => instalarPolimento(), []);
  useEffect(() => instalarTelas(), []);
  useEffect(() => instalarFolhas(), []);
  useEffect(() => instalarPonteiro(), []);
  useEffect(() => instalarCursor(), []);
  /* A cascata da primeira visita de cada tela, e o ponto de onde a troca de tema se abre. */
  useEffect(() => instalarOrigemDoToque(), []);
  /* Os painéis (o "Mais", os diálogos) crescem a partir do botão que os abriu. */
  useEffect(() => instalarDialogos(), []);
  /* No celular a barra sai do caminho ao rolar e volta em toda troca de tela (`sentidos.js:279-304`). */
  useEffect(() => instalarCelular(), []);
  /* Os sons, as vibrações e o giroscópio do protótipo (`sentidos.js`). */
  useEffect(() => instalarSentidos(), []);
  /* A cena do tema Água: só monta (e só baixa o código) com o tema ligado. */
  useEffect(() => instalarAgua(), []);
  /* As miniaturas dos jogos que a rolagem ainda não trouxe ficam paradas (`polimento/minis.ts`). */
  useEffect(() => instalarMinis(), []);
  /* O PEDAÇO DE CADA TELA DESCE ANTES DE ELA SER PEDIDA (`polimento/precarga.ts`): no toque do item e,
     com o navegador ocioso, os destinos do menu. Só o que o toque abre de verdade: sem conta a Biblioteca
     e o perfil abrem o convite, e na edição sem servidor os Planos também. */
  const baixa = (id: ViewType) =>
    id !== 'hub' && !(semConta && (id === 'library' || id === 'profile')) && !(semServidor && id === 'planos');
  const pedir = (id: ViewType, palpite = false) => {
    if (baixa(id)) void pedirTela(id, palpite);
  };
  /* No ocioso, só os destinos do trilho: os do "Mais" descem no toque. Com os três do "Mais" junto, a
     pré-carga dobrava o que a primeira visita baixa e ainda ocupava o aparelho quando a pessoa já navegava
     (medido em 10/10/2026: `docs/auditoria/2026-10-10-desempenho-da-interface.md`, seção 10). */
  /* E do trilho, só Capturar e Jogar (os dois mais pesados e mais visitados): com o trilho inteiro a
     carga baixava 916 kB em vez de 484 em segundo plano; os outros descem no toque. */
  const destinosDoMenu = NO_TRILHO.filter((id) => (id === 'capture' || id === 'play') && baixa(id)).join(' ');
  useEffect(() => precarregarNoOcioso(destinosDoMenu.split(' ').filter(Boolean)), [destinosDoMenu]);
  const noTrilho = NO_TRILHO;
  const principais = noTrilho.map((id) => NAV_ITEMS.find((i) => i.id === id)).filter((i) => !!i);
  const foraDosSeis = NAV_ITEMS.filter((i) => !noTrilho.includes(i.id));
  /* OS LADRILHOS DO "MAIS", na ordem do protótipo (`CT_NAV.a.mais`, `cartoes3.js:14`): Estatísticas,
     Personalizar, Ajustes; depois o perfil e a ajuda (fixos, abaixo); por fim Sobre e o que mais houver. */
  const outros = [
    /* Só na barra de cinco: a Biblioteca, que ela não mostra, na frente (`maisCel`, `cartoes3.js:103`). */
    ...(cinco ? NO_MAIS_NO_CELULAR.map((id) => NAV_ITEMS.find((i) => i.id === id)).filter((i) => !!i) : []),
    ...ANTES_DO_PERFIL.map((id) => foraDosSeis.find((i) => i.id === id)).filter((i) => !!i),
  ];
  const depoisDaAjuda = [
    ...foraDosSeis.filter((i) => !ANTES_DO_PERFIL.includes(i.id)),
    ...(ehAdmin(perfil) ? [ITEM_ADMIN] : []),
  ];
  const foraDoTrilho = !noTrilho.includes(activeView) || noMaisNoCelular(activeView);
  /** Um ladrilho de destino do "Mais". Sem conta, o destino que só abriria o convite diz isso antes do toque. */
  const ladrilho = (item: (typeof NAV_ITEMS)[number]) => {
    const Icone = item.icon;
    return (
      <button
        key={item.id}
        type="button"
        className="q-tile em-linha"
        onClick={() => ir(item.id)}
        onPointerDown={() => pedir(item.id)}
        onFocus={() => pedir(item.id, true)}
        aria-current={activeView === item.id ? 'page' : undefined}
      >
        <span className="q-ic">
          <Icone aria-hidden />
        </span>
        {semConta && exigeConta(item.id) ? (
          <span>
            <b>{navLabel(item, ageProfile)}</b>
            <small className="q-d q-pede-conta">
              <Lock aria-hidden /> {avisoDeConta}
            </small>
          </span>
        ) : (
          <b>{navLabel(item, ageProfile)}</b>
        )}
      </button>
    );
  };

  useEffect(() => setMaisAberto(false), [activeView]);
  useEffect(() => {
    if (!maisAberto) setAba('destinos');
  }, [maisAberto]);
  useEffect(() => {
    if (!maisAberto) return;
    const aoTeclar = (e: KeyboardEvent) => e.key === 'Escape' && setMaisAberto(false);
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [maisAberto]);

  const ir = (id: ViewType, dado?: Record<string, string>) => {
    setMaisAberto(false);
    if (dado) onChangeView(id, dado);
    else onChangeView(id);
  };
  const avisoDeConta = semServidor ? t('Na versão completa') : t('Pede conta');
  const proximaVibracao = () =>
    guardarVibracaoDoQuest(VIBRACOES_DO_QUEST[(VIBRACOES_DO_QUEST.indexOf(vibracao) + 1) % VIBRACOES_DO_QUEST.length]);

  return (
    <>
      <nav className="q-trilho" data-shell="trilho-do-quest" aria-label={t('Navegação principal')}>
        <MarcaBabel className="q-logo" />
        {principais.map((item) => {
          /* NA BARRA DE CINCO o botão dos Cartões é o "Praticar" (`ctDestino`, `cartoes3.js:29`): um
             destino só para as duas telas, com o alvo no lugar das camadas. */
          const praticar = cinco && item.id === 'cartoes';
          const Icone = praticar ? Target : item.icon;
          const rotulo = praticar ? t('Praticar') : navLabel(item, ageProfile, true);
          /* O Jogar da barra de cinco está escondido atrás do "Praticar": não marca nem é achado. */
          const escondido = noMaisNoCelular(item.id) || (cinco && item.id === 'play');
          const marcado = praticar ? ehDePraticar(activeView) : activeView === item.id && !escondido;
          return (
            <button
              key={item.id}
              type="button"
              className="q-item"
              /* A camada de polimento acha o destino por aqui (a pílula responde no toque). Na barra de
                 cinco, a Biblioteca escondida não é achada: o toque no ladrilho dela marca o "Mais", como
                 `marcarTrilho` do protótipo faz no celular; e o "Praticar" responde também pelo Jogar. */
              data-px-rota={escondido ? undefined : item.id}
              data-px-tambem={praticar ? 'play' : undefined}
              onClick={() => ir(praticar ? ultimaPratica() : item.id)}
              /* O pedaço da tela é pedido já no toque (e no foco do teclado), antes de o clique terminar. */
              onPointerDown={() => pedir(praticar ? ultimaPratica() : item.id)}
              onFocus={() => pedir(praticar ? ultimaPratica() : item.id, true)}
              aria-current={marcado ? 'page' : undefined}
              /* O nome não depende do rótulo visível: na barra do celular o de Capturar some (`display: none`). */
              aria-label={rotulo}
            >
              <Icone aria-hidden />
              <span>{rotulo}</span>
              {/* O número do dia: some quando está em dia (`ctSelo`, `cartoes3.js:61-65`). */}
              {item.id === 'cartoes' && !!cartoesHoje && cartoesHoje > 0 && (
                <i
                  className="q-contagem ct-selo-do-dia"
                  /* O anel que pulsa cresce 10 px para cada lado: a camada dele precisa do tamanho do selo. */
                  ref={medirOPulso}
                  aria-label={tp(cartoesHoje, '{n} cartão para hoje', '{n} cartões para hoje')}
                >
                  {cartoesHoje}
                </i>
              )}
            </button>
          );
        })}
        {/* NO COMPUTADOR: a busca a um clique, com o atalho escrito (o rodapé do menu de sempre a trazia).
            Ela e o "Mais" ficam juntos no pé do trilho; com a janela estreita sobra só o ícone. */}
        {buscaNoTrilho && (
          <button
            type="button"
            className="q-item q-busca-botao"
            onClick={() => aoBuscar?.()}
            aria-label={temTeclado ? t('Buscar gravação, palavra ou tela (Ctrl+K)') : t('Buscar')}
            title={temTeclado ? t('Buscar gravação, palavra ou tela (Ctrl+K)') : undefined}
            aria-keyshortcuts={temTeclado ? 'Control+K Meta+K' : undefined}
            data-testid="busca-no-trilho"
          >
            <Search aria-hidden />
            <span>{t('Buscar')}</span>
            {temTeclado && (
              <span className="q-tecla" aria-hidden>
                {teclaDaBusca()}
              </span>
            )}
          </button>
        )}
        <button
          type="button"
          className="q-item q-mais-botao"
          aria-haspopup="dialog"
          aria-expanded={maisAberto}
          aria-current={foraDoTrilho ? 'page' : undefined}
          onClick={() => setMaisAberto((v) => !v)}
        >
          <Ellipsis aria-hidden />
          <span>{t('Mais')}</span>
          {novos > 0 && (
            <i className="q-contagem" ref={medirOPulso} aria-label={t('{n} não lidas', { n: novos })}>
              {novos}
            </i>
          )}
        </button>
      </nav>

      {maisAberto && (
        <div className="q-mais-fundo" onClick={(e) => e.target === e.currentTarget && setMaisAberto(false)}>
          <div className="q-mais" role="dialog" aria-modal="true" aria-label={t('Mais destinos')}>
            <div className="q-cab">
              <h2>{t('Mais')}</h2>
              {aoBuscar && (
                <button
                  type="button"
                  className="q-ctl"
                  title={temTeclado ? t('Buscar gravação, palavra ou tela (Ctrl+K)') : undefined}
                  aria-keyshortcuts={temTeclado ? 'Control+K Meta+K' : undefined}
                  onClick={() => {
                    setMaisAberto(false);
                    aoBuscar();
                  }}
                >
                  <Search aria-hidden />
                  {t('Buscar')}
                </button>
              )}
              <button type="button" className="q-ctl" onClick={() => setMaisAberto(false)} aria-label={t('Fechar')}>
                <X aria-hidden />
              </button>
            </div>
            <div className="q-abas" role="tablist" aria-label={t('O que mostrar')}>
              <button
                type="button"
                role="tab"
                className="q-aba"
                aria-selected={aba === 'destinos'}
                onClick={() => setAba('destinos')}
              >
                {t('Destinos')}
              </button>
              <button
                type="button"
                role="tab"
                className="q-aba"
                aria-selected={aba === 'avisos'}
                onClick={() => setAba('avisos')}
              >
                <Bell aria-hidden />
                {t('Avisos')}
                {novos > 0 && <span className="n">{novos}</span>}
              </button>
            </div>
            {aba === 'avisos' && (
              <div className="q-lista" role="tabpanel" aria-label={t('Avisos')} data-testid="avisos-no-quest">
                {avisos.length === 0 ? (
                  <div className="q-vazio" style={{ minHeight: 200 }}>
                    <span className="q-ic">
                      <BellOff aria-hidden />
                    </span>
                    <h3>{t('Nada por aqui')}</h3>
                    <p>{t('Avisos de revisão, conquistas e sessões salvas aparecem aqui.')}</p>
                  </div>
                ) : (
                  avisos.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      className="q-linha"
                      aria-pressed={!a.lida}
                      onClick={() => {
                        marcarLida(a.id);
                        ir(a.ir as ViewType, a.dado);
                      }}
                    >
                      <span className="q-ic">
                        <Bell aria-hidden />
                      </span>
                      <span>
                        <b>{a.titulo}</b>
                        <small>{a.detalhe}</small>
                      </span>
                      <span className="q-fim">{quando(a.em)}</span>
                    </button>
                  ))
                )}
                <div className="q-acoes">
                  {novos > 0 && (
                    <button type="button" className="q-ctl" onClick={() => marcarTodasLidas()}>
                      {t('Marcar todas como lidas')}
                    </button>
                  )}
                  <button type="button" className="q-ctl" onClick={() => ir('settings', { aba: 'notificacoes' })}>
                    <Settings aria-hidden />
                    {t('Preferências de notificação')}
                  </button>
                </div>
              </div>
            )}
            {aba === 'destinos' && (
              <div className="q-grade g3" role="tabpanel" aria-label={t('Destinos')}>
                {outros.map(ladrilho)}
                <button type="button" className="q-tile em-linha" onClick={() => ir('profile')}>
                  <span className="q-ic">
                    <UserRound aria-hidden />
                  </span>
                  {semConta ? (
                    <span>
                      <b>{t('Seu perfil')}</b>
                      <small className="q-d q-pede-conta">
                        <Lock aria-hidden /> {avisoDeConta}
                      </small>
                    </span>
                  ) : (
                    <b>{t('Seu perfil')}</b>
                  )}
                </button>
                <button type="button" className="q-tile em-linha" onClick={() => ir('ajuda')}>
                  <span className="q-ic">
                    <LifeBuoy aria-hidden />
                  </span>
                  <b>{t('Ajuda e suporte')}</b>
                </button>
                {depoisDaAjuda.map(ladrilho)}
                {/* Só no headset, como no menu da conta de sempre (`MenuDaConta.tsx`): é por ele que se
                    chega à chave das telas novas. No computador a página continua em `/diagnostico`. */}
                {headset && (
                  <button type="button" className="q-tile em-linha" onClick={() => ir('diagnostico')}>
                    <span className="q-ic">
                      <Activity aria-hidden />
                    </span>
                    <b>{t('Diagnóstico do aparelho')}</b>
                  </button>
                )}
              </div>
            )}
            {/* PLANOS E PREMIUM, entrada fixa (`telas2.js:119-124`): só na aba dos destinos, e não no site
                sem servidor, onde não há plano a assinar. */}
            {aba === 'destinos' && !semServidor && (
              <button
                type="button"
                className="q-linha px-entrada-premium"
                onClick={() => ir('planos')}
                data-testid="planos-no-mais"
              >
                <span className="q-ic">
                  <Sparkles aria-hidden />
                </span>
                <span>
                  <b>{t('Planos e Premium')}</b>
                  <small>{fraseDoPlano()}</small>
                </span>
                <span className="q-fim">
                  <ChevronRight aria-hidden />
                </span>
              </button>
            )}
            <div className="q-faixa q-faixa-do-mais" style={{ margin: 0 }}>
              <button type="button" className="q-ctl" onClick={toggleDarkMode}>
                {darkMode ? <Moon aria-hidden /> : <Sun aria-hidden />}
                {darkMode ? t('Tema escuro') : t('Tema claro')}
              </button>
              <button type="button" className="q-ctl" onClick={toggleSound}>
                {soundEnabled ? <Volume2 aria-hidden /> : <VolumeX aria-hidden />}
                {soundEnabled ? t('Som dos toques: ligado') : t('Som dos toques: desligado')}
              </button>
              {/* MODO DESEMPENHO (pedido do dono, 08/10/2026): os efeitos valem para todo mundo, e quem tem
                  aparelho fraco, ou prefere a tela parada, desliga tudo aqui, num toque. */}
              {togglePerformanceMode && (
                <button
                  type="button"
                  className="q-ctl"
                  onClick={togglePerformanceMode}
                  aria-pressed={performanceMode}
                  data-testid="modo-desempenho-no-mais"
                  title={t('Desliga animações, partículas, desfoque e sombras. Bom para aparelho fraco.')}
                >
                  <Gauge aria-hidden />
                  {performanceMode ? t('Modo desempenho: ligado') : t('Modo desempenho: desligado')}
                </button>
              )}
              {/* A vibração é do controle do headset: com mouse não há o que vibrar. */}
              {headset && (
                <button type="button" className="q-ctl" onClick={proximaVibracao} data-testid="vibracao-do-quest">
                  {vibracao === 'desligada' ? <VibrateOff aria-hidden /> : <Vibrate aria-hidden />}
                  {ROTULO_DA_VIBRACAO[vibracao]()}
                </button>
              )}
            </div>
            <div className="q-conta-do-mais" data-testid="conta-no-quest">
              <p className="q-rodape-do-mais">
                <HardDrive aria-hidden />
                <span>
                  {nome && <b>{nome} · </b>}
                  {email ?? estadoDaConta}
                  {convidado && (
                    <>
                      {' · '}
                      {t(
                        'Fica só neste aparelho, até {sessoes} gravações e {palavras} palavras. Loja, ranking, importação e sincronização pedem conta.',
                        tetoAnonimoDa({ edicaoEstatica: semServidor }),
                      )}
                    </>
                  )}
                </span>
              </p>
              {!semServidor && anonimo && aoEntrar && (
                <button
                  type="button"
                  className="q-ctl"
                  onClick={() => {
                    setMaisAberto(false);
                    aoEntrar();
                  }}
                >
                  <LogIn aria-hidden />
                  {t('Entrar ou criar conta')}
                </button>
              )}
              {authRequired && !anonimo && (
                <button
                  type="button"
                  className="q-ctl"
                  onClick={() => {
                    setMaisAberto(false);
                    void auth.signOut();
                  }}
                >
                  <LogOut aria-hidden />
                  {t('Sair')}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
