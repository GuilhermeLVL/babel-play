/* O CSS das telas do Quest chega junto com o trilho (que só o headset baixa): fora do CSS inicial de
   todo mundo, e sempre presente quando as telas novas estão ligadas, porque o trilho está sempre montado. */
import '../../styles/quest.css';
/* E as medidas do headset sobre as peças de sempre (`.tela`, `.btn`, `<dialog>`, `.toast`…). */
import '../../styles/questBase.css';
/* E o movimento rico (molas, curvas), que só se aplica com `<html data-movimento="rico">`. */
import '../../styles/questMovimento.css';

import {
  Activity,
  Bell,
  BellOff,
  Ellipsis,
  HardDrive,
  LifeBuoy,
  Lock,
  LogIn,
  LogOut,
  Moon,
  Search,
  Settings,
  Sun,
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
import { useFlag } from '../../lib/flags';
import { t } from '../../lib/i18n';
import { aoMudarIdentidade, estaAnonimo } from '../../lib/identidade';
import { instalarMarcaDeMovimento } from '../../lib/movimento/animar';
import { instalarPilulaDasAbas } from '../../lib/movimento/pilulaDasAbas';
import { marcarLida, marcarTodasLidas, naoLidas, quando } from '../../lib/notificacoes';
import { authRequired } from '../../lib/supabase';
import { usePerfil } from '../../lib/usePerfil';
import type { ViewType } from '../../types';
import { exigeConta } from '../conta/exigeConta';
import { useListaDeNotificacoes } from './CentralDeNotificacoes';
import { type AgeProfileType, ITEM_ADMIN, NAV_ITEMS, navLabel } from './navItems';
import { MarcaBabel } from './ShellBits';

/**
 * OS DESTINOS DO TRILHO. A maquete de 01/10/2026 tinha cinco; o dono pediu mais (02/10): o que se usa
 * toda semana fica a um toque, sem passar pelo painel "Mais". São sete, que é o que cabe na altura
 * padrão da janela (670 px) com alvos de 64 px: os quatro de fazer (Início, Capturar, Intérprete,
 * Jogar), os dois de guardar (Biblioteca, Vocabulário) e o de acompanhar (Estatísticas).
 */
const NO_TRILHO: ViewType[] = ['hub', 'capture', 'interprete', 'play', 'library', 'metrics', 'estatisticas'];
/**
 * SEM CONTA (e no site sem servidor), Biblioteca e Vocabulário abrem só o cartão "isto precisa de
 * conta": no trilho seriam destinos de primeira linha que não funcionam. Continuam no menu, em "Mais"
 * (a regra da casa é mostrar e explicar, nunca esconder), e o lugar deles fica com o que roda inteiro
 * no aparelho: Estatísticas e Personalizar.
 */
const NO_TRILHO_SEM_CONTA: ViewType[] = ['hub', 'capture', 'interprete', 'play', 'estatisticas', 'loja'];

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
  const buscaNoTrilho = !!aoBuscar && temTeclado;
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
  useEffect(() => instalarPilulaDasAbas(), []);
  const noTrilho = semConta ? NO_TRILHO_SEM_CONTA : NO_TRILHO;
  const principais = noTrilho.map((id) => NAV_ITEMS.find((i) => i.id === id)).filter((i) => !!i);
  const outros = [...NAV_ITEMS.filter((i) => !noTrilho.includes(i.id)), ...(ehAdmin(perfil) ? [ITEM_ADMIN] : [])];
  const foraDoTrilho = !noTrilho.includes(activeView);

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
          const Icone = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              className="q-item"
              onClick={() => ir(item.id)}
              aria-current={activeView === item.id ? 'page' : undefined}
            >
              <Icone aria-hidden />
              <span>{navLabel(item, ageProfile, true)}</span>
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
            aria-label={t('Buscar gravação, palavra ou tela (Ctrl+K)')}
            title={t('Buscar gravação, palavra ou tela (Ctrl+K)')}
            aria-keyshortcuts="Control+K Meta+K"
            data-testid="busca-no-trilho"
          >
            <Search aria-hidden />
            <span>{t('Buscar')}</span>
            <span className="q-tecla" aria-hidden>
              {teclaDaBusca()}
            </span>
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
            <i className="q-contagem" aria-label={t('{n} não lidas', { n: novos })}>
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
                {outros.map((item) => {
                  const Icone = item.icon;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className="q-tile em-linha"
                      onClick={() => ir(item.id)}
                      aria-current={activeView === item.id ? 'page' : undefined}
                    >
                      <span className="q-ic">
                        <Icone aria-hidden />
                      </span>
                      {/* Sem conta, o destino abre o cartão "pede conta": dito aqui, antes do toque. */}
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
                })}
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
            <div className="q-faixa q-faixa-do-mais" style={{ margin: 0 }}>
              <button type="button" className="q-ctl" onClick={toggleDarkMode}>
                {darkMode ? <Moon aria-hidden /> : <Sun aria-hidden />}
                {darkMode ? t('Tema escuro') : t('Tema claro')}
              </button>
              <button type="button" className="q-ctl" onClick={toggleSound}>
                {soundEnabled ? <Volume2 aria-hidden /> : <VolumeX aria-hidden />}
                {soundEnabled ? t('Som dos toques: ligado') : t('Som dos toques: desligado')}
              </button>
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
