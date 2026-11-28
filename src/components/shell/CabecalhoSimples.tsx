import '../../styles/navegacaoSimples.css';

import {
  Activity,
  Bell,
  BellOff,
  ChevronLeft,
  Gauge,
  Languages,
  LifeBuoy,
  Lock,
  LogIn,
  LogOut,
  Mic,
  Moon,
  Search,
  Settings,
  Sparkles,
  UserRound,
  Volume2,
  X,
} from 'lucide-react';
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { FLAG_LEITURA_ATIVA } from '../../core/planos';
import { tetoAnonimoDa } from '../../core/tetoAnonimo';
import { ehAdmin } from '../../lib/admin';
import * as auth from '../../lib/auth';
import { perfilDoDispositivo } from '../../lib/dispositivo/perfil';
import { recursosDoAparelho } from '../../lib/dispositivo/recursos';
import { noHeadset } from '../../lib/dispositivo/telaNovaDoQuest';
import { edicaoEstatica } from '../../lib/edicaoEstatica';
import { onPlanChange } from '../../lib/entitlements';
import { useFlag } from '../../lib/flags';
import { t } from '../../lib/i18n';
import { aoMudarIdentidade, estaAnonimo } from '../../lib/identidade';
import { marcarLida, marcarTodasLidas, naoLidas, quando } from '../../lib/notificacoes';
import { comNomeDoPlano, planoDeEntradaAgora } from '../../lib/planoDeEntrada';
import { useJanelaEstreita } from '../../lib/polimento/celular';
import { pedirTela } from '../../lib/polimento/precarga';
import { authRequired } from '../../lib/supabase';
import { usePerfil } from '../../lib/usePerfil';
import type { ViewType } from '../../types';
import { exigeConta } from '../conta/exigeConta';
import { useListaDeNotificacoes } from './CentralDeNotificacoes';
import { type DestinoAoVivo, guardarUltimaAoVivo } from './EscolhaAoVivo';
import { fraseDoPlano, veConviteDoPremium } from './fraseDoPlano';
import {
  type AgeProfileType,
  ITEM_ADMIN,
  ITEM_AO_VIVO,
  ITEM_LEITURA_ATIVA,
  NAV_ITEMS,
  type NavItemDef,
  navLabel,
} from './navItems';
import { MarcaBabel } from './ShellBits';

/**
 * A NAVEGAÇÃO "O INÍCIO É O MENU" (flag `navegacao_simples`; openspec `navegacao-mais-simples`, opção 3, decisão do dono
 * de 27/11/2026). No lugar do trilho, do painel "Mais" e da barra de baixo do celular, um cabeçalho só:
 *
 * - no Início: a marca, a busca larga ("Buscar ou ir para…", Ctrl/⌘+K), o sino e o avatar; a grade de destinos é a
 *   própria tela (`InicioMenu`);
 * - em toda outra tela: "‹ Início", o nome da tela, a busca, o sino e o avatar. No Ao vivo, o seletor
 *   Legendar | Conversar mora aqui, dentro da tela, no lugar do submenu de antes.
 *
 * O sino abre direto a lista de avisos (a de sempre, `useListaDeNotificacoes`), com o número preso a ele. O avatar abre o
 * menu curto da conta (o que morava no "Mais"). Os dois são painéis ancorados no computador e folhas de baixo no celular;
 * Esc fecha e devolve o foco a quem abriu. As rotas não mudam: este arquivo só troca a porta.
 */

/** A tecla do atalho da busca como este teclado a escreve (⌘ no Mac, Ctrl nos outros). */
const teclaDaBusca = (): string =>
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.platform ?? '') ? '⌘K' : 'Ctrl K';
const teclaDosAjustes = (): string =>
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.platform ?? '') ? '⌘,' : 'Ctrl+,';

const AO_VIVO: ViewType[] = ['capture', 'interprete'];

const item = (id: ViewType): NavItemDef | undefined => NAV_ITEMS.find((i) => i.id === id);

/** O nome da tela no cabeçalho fino, com o rótulo do perfil quando o destino é do menu. */
function nomeDaTela(view: ViewType, perfil: AgeProfileType): string | null {
  if (AO_VIVO.includes(view)) return navLabel(ITEM_AO_VIVO, perfil);
  if (view === 'admin') return navLabel(ITEM_ADMIN, perfil);
  if (view === 'leituraAtiva') return navLabel(ITEM_LEITURA_ATIVA, perfil);
  const doMenu = item(view);
  if (doMenu) return navLabel(doMenu, perfil);
  const outros: Partial<Record<ViewType, () => string>> = {
    profile: () => t('Seu perfil'),
    ajuda: () => t('Ajuda e suporte'),
    diagnostico: () => t('Diagnóstico do aparelho'),
    diario: () => t('Diário'),
  };
  return outros[view]?.() ?? null;
}

interface Props {
  activeView: ViewType;
  onChangeView: (view: ViewType, dado?: Record<string, string>) => void;
  aoBuscar?: () => void;
  aoEntrar?: () => void;
  ageProfile: AgeProfileType;
  semConta?: boolean;
  darkMode: boolean;
  toggleDarkMode: () => void;
  soundEnabled: boolean;
  toggleSound: () => void;
  performanceMode?: boolean;
  togglePerformanceMode?: () => void;
}

type Aberto = 'avisos' | 'conta' | null;

/**
 * O PAINEL ANCORADO: o cartão da escolha do Ao vivo (`.q-vivo`) embaixo do botão que o abriu, alinhado à direita; na
 * janela estreita, a folha que sobe da borda (`.q-vivo-folha`, com fundo). Esc fecha e devolve o foco ao botão; tocar
 * fora fecha. No computador não é modal (Ctrl+, e Ctrl+K continuam valendo); a folha do celular é, e prende o Tab.
 */
function Painel({
  ancora,
  folha,
  rotulo,
  aoFechar,
  children,
  testid,
}: {
  ancora: HTMLElement | null;
  folha: boolean;
  rotulo: string;
  aoFechar: () => void;
  children: React.ReactNode;
  testid: string;
}) {
  const caixa = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ right: number; top: number } | null>(null);

  useLayoutEffect(() => {
    if (folha || !ancora) return;
    const r = ancora.getBoundingClientRect();
    setPos({ right: Math.max(8, window.innerWidth - r.right), top: r.bottom + 8 });
  }, [ancora, folha]);

  /* O foco entra no primeiro alvo do painel (o teclado continua de onde a pessoa estava). */
  useEffect(() => {
    const c = caixa.current;
    (
      c?.querySelector<HTMLElement>('[data-primeiro]') ??
      c?.querySelector<HTMLElement>('.q-vivo-opcao') ??
      c?.querySelector<HTMLElement>('button:not([disabled])')
    )?.focus();
  }, []);

  const fechar = () => {
    aoFechar();
    ancora?.focus();
  };

  useEffect(() => {
    const aoApontar = (e: PointerEvent) => {
      const alvo = e.target as Node | null;
      if (!alvo || caixa.current?.contains(alvo) || ancora?.contains(alvo)) return;
      aoFechar();
      /* Na folha, o toque fora cai no fundo escuro: o foco volta a quem abriu (no computador, fica onde se clicou). */
      if (folha) ancora?.focus();
    };
    /* Esc fecha com o foco em qualquer lugar (um clique numa área sem alvo do painel leva o foco ao `body`). */
    const aoTeclarFora = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      e.preventDefault();
      aoFechar();
      ancora?.focus();
    };
    document.addEventListener('pointerdown', aoApontar, true);
    document.addEventListener('keydown', aoTeclarFora);
    return () => {
      document.removeEventListener('pointerdown', aoApontar, true);
      document.removeEventListener('keydown', aoTeclarFora);
    };
  }, [ancora, aoFechar, folha]);

  const aoTeclar = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      fechar();
      return;
    }
    if (e.key !== 'Tab' || !folha) return;
    const alvos = Array.from(caixa.current?.querySelectorAll<HTMLElement>('button:not([disabled])') ?? []);
    if (!alvos.length) return;
    const primeiro = alvos[0];
    const ultimo = alvos[alvos.length - 1];
    if (e.shiftKey && document.activeElement === primeiro) {
      e.preventDefault();
      ultimo.focus();
    } else if (!e.shiftKey && document.activeElement === ultimo) {
      e.preventDefault();
      primeiro.focus();
    }
  };

  /* No computador, o foco que sai do painel (Tab para fora) fecha: um painel aberto atrás do foco seria um alvo perdido. */
  const aoPerderFoco = (e: React.FocusEvent) => {
    if (folha) return;
    const para = e.relatedTarget as Node | null;
    if (!para || caixa.current?.contains(para) || ancora?.contains(para)) return;
    aoFechar();
  };

  const miolo = (
    <div
      ref={caixa}
      className={folha ? 'q-vivo q-vivo-folha ns-painel' : 'q-vivo ns-painel'}
      role="dialog"
      aria-modal={folha ? 'true' : undefined}
      aria-label={rotulo}
      onKeyDown={aoTeclar}
      onBlur={aoPerderFoco}
      style={!folha && pos ? { right: pos.right, top: pos.top } : undefined}
      data-testid={testid}
    >
      {children}
    </div>
  );
  return createPortal(
    folha ? (
      <div className="q-vivo-fundo" onClick={(e) => e.target === e.currentTarget && fechar()}>
        {miolo}
      </div>
    ) : (
      miolo
    ),
    document.body,
  );
}

export default function CabecalhoSimples({
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
}: Props) {
  const [aberto, setAberto] = useState<Aberto>(null);
  const botaoAvisos = useRef<HTMLButtonElement>(null);
  const botaoConta = useRef<HTMLButtonElement>(null);
  const estreita = useJanelaEstreita();
  const [headset] = useState(noHeadset);
  const [temTeclado] = useState(() => recursosDoAparelho(perfilDoDispositivo()).tecladoFisico);
  const avisos = useListaDeNotificacoes();
  const novos = naoLidas(avisos);
  const { perfil } = usePerfil();
  const [anonimo, setAnonimo] = useState(estaAnonimo);
  useEffect(() => aoMudarIdentidade(() => setAnonimo(estaAnonimo())), []);
  const convidado = useFlag('modo_convidado') && anonimo;
  const leituraAtiva = useFlag(FLAG_LEITURA_ATIVA);
  const semServidor = edicaoEstatica();
  /* O plano muda (assinatura, fim do teste): o convite e o "Seu plano" acompanham. */
  const [, setVersaoDoPlano] = useState(0);
  useEffect(() => onPlanChange(() => setVersaoDoPlano((v) => v + 1)), []);
  const convite = !semServidor && veConviteDoPremium();
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

  const noInicio = activeView === 'hub';
  const noAoVivo = AO_VIVO.includes(activeView);

  /* Trocar de tela fecha o que estiver aberto. */
  useEffect(() => setAberto(null), [activeView]);
  /* O "ÚLTIMO MODO" do Ao vivo é o último em que a pessoa esteve, por qualquer porta (bloco, busca, endereço). */
  useEffect(() => {
    if (activeView === 'capture' || activeView === 'interprete') guardarUltimaAoVivo(activeView);
  }, [activeView]);

  const ir = (id: ViewType, dado?: Record<string, string>) => {
    setAberto(null);
    if (dado) onChangeView(id, dado);
    else onChangeView(id);
  };
  const fechar = () => setAberto(null);
  const alternar = (qual: Exclude<Aberto, null>) => setAberto((a) => (a === qual ? null : qual));

  const busca = aoBuscar && (
    <button
      type="button"
      className={noInicio ? 'q-chip ns-busca larga' : 'q-chip ns-busca'}
      onClick={aoBuscar}
      aria-label={noInicio ? undefined : t('Buscar')}
      aria-keyshortcuts="Control+K Meta+K"
      title={t('Buscar gravação, palavra ou tela (Ctrl+K)')}
      data-testid="busca-no-cabecalho"
    >
      <Search aria-hidden />
      <span className="ns-busca-texto">{noInicio ? t('Buscar ou ir para…') : t('Buscar')}</span>
      {temTeclado && <kbd aria-hidden="true">{teclaDaBusca()}</kbd>}
    </button>
  );

  const sino = (
    <button
      ref={botaoAvisos}
      type="button"
      className="q-ctl ns-sino"
      aria-haspopup="dialog"
      aria-expanded={aberto === 'avisos'}
      aria-label={novos > 0 ? t('Avisos') + ', ' + t('{n} não lidas', { n: novos }) : t('Avisos')}
      onClick={() => alternar('avisos')}
      data-testid="sino"
    >
      <Bell aria-hidden />
      {novos > 0 && <i className="q-contagem" data-n={novos > 99 ? '99+' : novos} aria-hidden />}
    </button>
  );

  const inicial = (nome ?? email ?? '').trim().charAt(0).toLocaleUpperCase();
  const avatar = (
    <button
      ref={botaoConta}
      type="button"
      className="ns-avatar"
      aria-haspopup="dialog"
      aria-expanded={aberto === 'conta'}
      aria-label={t('Sua conta')}
      onClick={() => alternar('conta')}
      data-testid="avatar-da-conta"
    >
      {inicial ? <span aria-hidden="true">{inicial}</span> : <UserRound aria-hidden />}
    </button>
  );

  /* O SELETOR DO AO VIVO (dentro da tela, no lugar do submenu): troca entre a mesma captura aberta para legendar e para
     conversar, e lembra a escolha para o bloco do Início. */
  const trocarModo = (d: DestinoAoVivo) => {
    if (d === activeView) return;
    guardarUltimaAoVivo(d);
    ir(d);
  };
  const seletorDoAoVivo = noAoVivo && (
    <div className="q-abas q-seg ns-modo" role="group" aria-label={navLabel(ITEM_AO_VIVO, ageProfile)}>
      <button
        type="button"
        className="q-aba"
        aria-pressed={activeView === 'capture'}
        onClick={() => trocarModo('capture')}
        onPointerDown={() => void pedirTela('capture')}
        data-testid="modo-legendar"
      >
        <Mic aria-hidden />
        {t('Legendar')}
      </button>
      <button
        type="button"
        className="q-aba"
        aria-pressed={activeView === 'interprete'}
        onClick={() => trocarModo('interprete')}
        onPointerDown={() => void pedirTela('interprete')}
        data-testid="modo-conversar"
      >
        <Languages aria-hidden />
        {t('Conversar')}
      </button>
    </div>
  );
  const nomeAqui = noInicio ? null : nomeDaTela(activeView, ageProfile);
  const avisoDeConta = semServidor ? t('Na versão completa') : t('Pede conta');

  const linhaDeDestino = (
    id: ViewType,
    Icone: React.ComponentType<{ 'aria-hidden'?: boolean }>,
    rotulo: string,
    extra?: React.ReactNode,
    sub?: string,
  ) => (
    <button
      key={id}
      type="button"
      className="q-vivo-opcao"
      aria-current={activeView === id ? 'page' : undefined}
      onClick={() => ir(id)}
      onPointerDown={() => void pedirTela(id)}
      data-destino={id}
    >
      <span className="q-ic">
        <Icone aria-hidden />
      </span>
      <span className="q-vivo-texto">
        <b>{rotulo}</b>
        {sub && <small>{sub}</small>}
        {semConta && exigeConta(id) && (
          <small className="q-pede-conta">
            <Lock aria-hidden style={{ width: 14, height: 14, verticalAlign: -2 }} /> {avisoDeConta}
          </small>
        )}
      </span>
      {extra}
    </button>
  );
  const doMenu = (id: ViewType) => {
    const i = item(id);
    return i ? linhaDeDestino(id, i.icon, navLabel(i, ageProfile)) : null;
  };
  const interruptor = (
    rotulo: string,
    Icone: React.ComponentType<{ 'aria-hidden'?: boolean }>,
    ligado: boolean,
    alternarIt: () => void,
    testid?: string,
  ) => (
    <div className="ns-interruptor">
      <Icone aria-hidden />
      <span>{rotulo}</span>
      <button
        type="button"
        className="q-interruptor"
        role="switch"
        aria-checked={ligado}
        aria-label={rotulo}
        onClick={alternarIt}
        data-testid={testid}
      />
    </div>
  );

  const painelDeAvisos = aberto === 'avisos' && (
    <Painel
      ancora={botaoAvisos.current}
      folha={estreita}
      rotulo={t('Avisos')}
      aoFechar={fechar}
      testid="painel-de-avisos"
    >
      <div className="ns-painel-cab">
        <div>
          <h2>{t('Avisos')}</h2>
          {novos > 0 && <small>{t('{n} não lidas', { n: novos })}</small>}
        </div>
        <button
          type="button"
          className="q-ctl"
          onClick={() => (fechar(), botaoAvisos.current?.focus())}
          aria-label={t('Fechar')}
        >
          <X aria-hidden />
        </button>
      </div>
      {avisos.length === 0 ? (
        <div className="ns-vazio">
          <BellOff aria-hidden style={{ width: 28, height: 28 }} />
          <b>{t('Nada por aqui')}</b>
          {t('Avisos de revisão, conquistas e sessões salvas aparecem aqui.')}
        </div>
      ) : (
        avisos.map((a, i) => (
          <button
            key={a.id}
            type="button"
            className={a.lida ? 'q-vivo-opcao lida' : 'q-vivo-opcao'}
            data-primeiro={i === 0 ? '' : undefined}
            data-ultima={a.lida ? undefined : 'true'}
            onClick={() => {
              marcarLida(a.id);
              ir(a.ir as ViewType, a.dado);
            }}
          >
            <span className="q-ic">
              <Bell aria-hidden />
            </span>
            <span className="q-vivo-texto">
              <b>{a.titulo}</b>
              <small>{a.detalhe}</small>
            </span>
            <span className="q-fim">{quando(a.em)}</span>
          </button>
        ))
      )}
      <div className="ns-acoes">
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
    </Painel>
  );

  const painelDaConta = aberto === 'conta' && (
    <Painel
      ancora={botaoConta.current}
      folha={estreita}
      rotulo={t('Sua conta')}
      aoFechar={fechar}
      testid="painel-da-conta"
    >
      <div className="ns-painel-cab">
        <div>
          <h2>{nome ?? t('Sua conta')}</h2>
          <small data-testid="estado-da-conta">{email ?? estadoDaConta}</small>
          {convidado && (
            <small>
              {t(
                'Fica só neste aparelho, até {sessoes} gravações e {palavras} palavras. Loja, ranking, importação e sincronização pedem conta.',
                tetoAnonimoDa({ edicaoEstatica: semServidor }),
              )}
            </small>
          )}
        </div>
        <button
          type="button"
          className="q-ctl"
          onClick={() => (fechar(), botaoConta.current?.focus())}
          aria-label={t('Fechar')}
        >
          <X aria-hidden />
        </button>
      </div>
      {convite && (
        <button
          type="button"
          className="q-vivo-opcao"
          data-ultima="true"
          data-primeiro=""
          onClick={() => ir('planos')}
          data-testid="seja-premium-na-conta"
        >
          <span className="q-ic">
            <Sparkles aria-hidden />
          </span>
          <span className="q-vivo-texto">
            <b>{comNomeDoPlano(t('Seja Premium'), planoDeEntradaAgora())}</b>
            <small>{fraseDoPlano()}</small>
          </span>
        </button>
      )}
      {doMenu('estatisticas')}
      {doMenu('loja')}
      {linhaDeDestino(
        'settings',
        Settings,
        navLabel(item('settings')!, ageProfile),
        <kbd className="q-fim" aria-hidden="true">
          {teclaDosAjustes()}
        </kbd>,
      )}
      {linhaDeDestino('profile', UserRound, t('Seu perfil'))}
      {linhaDeDestino('ajuda', LifeBuoy, t('Ajuda e suporte'))}
      {doMenu('sobre')}
      {headset && linhaDeDestino('diagnostico', Activity, t('Diagnóstico do aparelho'))}
      {leituraAtiva &&
        linhaDeDestino('leituraAtiva', ITEM_LEITURA_ATIVA.icon, navLabel(ITEM_LEITURA_ATIVA, ageProfile))}
      {!semServidor &&
        !convite &&
        item('planos') &&
        linhaDeDestino('planos', item('planos')!.icon, t('Seu plano'), undefined, fraseDoPlano())}
      {ehAdmin(perfil) && linhaDeDestino('admin', ITEM_ADMIN.icon, navLabel(ITEM_ADMIN, ageProfile))}
      <div className="ns-sep" role="separator" />
      {interruptor(t('Tema escuro'), Moon, darkMode, toggleDarkMode, 'interruptor-tema')}
      {interruptor(t('Som dos toques'), Volume2, soundEnabled, toggleSound, 'interruptor-som')}
      {togglePerformanceMode &&
        interruptor(t('Modo desempenho'), Gauge, performanceMode, togglePerformanceMode, 'interruptor-desempenho')}
      <div className="ns-sep" role="separator" />
      {!semServidor && anonimo && aoEntrar && (
        <button
          type="button"
          className="q-vivo-opcao"
          onClick={() => {
            fechar();
            aoEntrar();
          }}
        >
          <span className="q-ic">
            <LogIn aria-hidden />
          </span>
          <span className="q-vivo-texto">
            <b>{t('Entrar ou criar conta')}</b>
          </span>
        </button>
      )}
      {authRequired && !anonimo && (
        <button
          type="button"
          className="q-vivo-opcao"
          onClick={() => {
            fechar();
            void auth.signOut();
          }}
        >
          <span className="q-ic">
            <LogOut aria-hidden />
          </span>
          <span className="q-vivo-texto">
            <b>{t('Sair')}</b>
          </span>
        </button>
      )}
    </Painel>
  );

  return (
    <>
      <header
        className={noInicio ? 'ns-cab ns-cab-inicio' : 'ns-cab'}
        data-shell="navegacao-simples"
        data-testid="cabecalho-simples"
      >
        {noInicio ? (
          <span className="ns-marca">
            <MarcaBabel />
            <span>Frasy</span>
          </span>
        ) : (
          <>
            <button type="button" className="q-chip ns-voltar" onClick={() => ir('hub')} data-testid="voltar-ao-inicio">
              <ChevronLeft aria-hidden />
              {navLabel(item('hub')!, ageProfile)}
            </button>
            {nomeAqui && <span className="ns-onde">{nomeAqui}</span>}
            {seletorDoAoVivo}
          </>
        )}
        {noInicio && busca}
        <span className="ns-espaco" />
        {!noInicio && busca}
        {sino}
        {avatar}
      </header>
      {painelDeAvisos}
      {painelDaConta}
    </>
  );
}
