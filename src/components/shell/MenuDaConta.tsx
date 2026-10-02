import {
  Activity,
  ChartColumn,
  CreditCard,
  HardDrive,
  LifeBuoy,
  LogIn,
  LogOut,
  Settings as SettingsIcon,
  UserRound,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { tetoAnonimoDa } from '../../core/tetoAnonimo';
import * as auth from '../../lib/auth';
import { perfilDoDispositivo } from '../../lib/dispositivo/perfil';
import { edicaoEstatica } from '../../lib/edicaoEstatica';
import { useFlag } from '../../lib/flags';
import { useFotoDoPerfil } from '../../lib/fotoDoPerfil';
import { t } from '../../lib/i18n';
import { aoMudarIdentidade, estaAnonimo } from '../../lib/identidade';
import { authRequired } from '../../lib/supabase';
import { usePerfil } from '../../lib/usePerfil';
import { raizDoApp } from './raizDoApp';

/**
 * O MENU DA CONTA — `.menu-conta.cartao` do protótipo aprovado (`montarShell`).
 *
 * Quem eu sou (`.cab-menu`: nome e e-mail, ou o estado real quando não há e-mail) e os destinos da
 * conta: Meu perfil, Estatísticas, Ajustes, Planos, Ajuda e suporte e, separado, Sair.
 *
 * O painel é montado na raiz do app (portal): o CSS do protótipo o ancora no canto de baixo, acima
 * do rodapé do menu lateral, e no celular abaixo da barra do topo.
 *
 * "SAIR" SÓ COM LOGIN DE VERDADE: no modo local não há sessão a encerrar, e um "Sair" que não faz
 * nada ensina que a interface mente. Sem conta, o primeiro item vira "Entrar ou criar conta".
 */

interface MenuDaContaProps {
  onIr: (view: string) => void;
}

export default function MenuDaConta({ onIr }: MenuDaContaProps) {
  const { perfil, iniciais } = usePerfil();
  // A foto escolhida em Perfil → Você (guardada neste navegador) vira o avatar do botão.
  const foto = useFotoDoPerfil(perfil?.id);
  const [aberto, setAberto] = useState(false);
  const [anonimo, setAnonimo] = useState(estaAnonimo);
  useEffect(() => aoMudarIdentidade(() => setAnonimo(estaAnonimo())), []);
  /* MODO CONVIDADO (Fase 7): com a flag ligada, quem usa sem conta é "convidado", e o menu diz isso
     e o que fica de fora. Desligada, o menu é exatamente o de antes. */
  const modoConvidado = useFlag('modo_convidado');
  const convidado = anonimo && modoConvidado;
  const gatilho = useRef<HTMLButtonElement | null>(null);
  const painel = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!aberto) return;
    painel.current?.querySelector<HTMLElement>('[role=menuitem]')?.focus();
    const fora = (e: MouseEvent) => {
      const alvo = e.target as Node;
      if (!painel.current?.contains(alvo) && !gatilho.current?.contains(alvo)) setAberto(false);
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setAberto(false);
        gatilho.current?.focus();
        return;
      }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      const itens = [...(painel.current?.querySelectorAll<HTMLElement>('[role=menuitem]') ?? [])];
      if (!itens.length) return;
      e.preventDefault();
      const i = itens.indexOf(document.activeElement as HTMLElement);
      itens[(i + (e.key === 'ArrowDown' ? 1 : -1) + itens.length) % itens.length].focus();
    };
    document.addEventListener('mousedown', fora);
    document.addEventListener('keydown', tecla);
    return () => {
      document.removeEventListener('mousedown', fora);
      document.removeEventListener('keydown', tecla);
    };
  }, [aberto]);

  const nome = perfil?.displayName?.trim() || null;
  const email = perfil?.email?.trim() || null;
  /* Edição estática: não há conta, login nem plano. O menu diz o que ela é e leva só ao que existe. */
  const semServidor = edicaoEstatica();
  const estado = semServidor
    ? t('edição de demonstração · dados só neste navegador')
    : convidado
      ? t('Você está usando como convidado')
      : anonimo
        ? t('sem conta · dados só neste navegador')
        : authRequired
          ? t('sessão ativa')
          : t('conta local');

  const ir = (view: string) => {
    setAberto(false);
    onIr(view);
  };

  const alvo = raizDoApp();
  const item = (view: string, Icone: typeof UserRound, rotulo: string) => (
    <button type="button" role="menuitem" onClick={() => ir(view)}>
      <Icone aria-hidden />
      {rotulo}
    </button>
  );

  return (
    <>
      <button
        ref={gatilho}
        type="button"
        className={convidado ? 'conta convidado' : 'conta'}
        onClick={() => setAberto((a) => !a)}
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-label={
          convidado ? t('Você está usando como convidado') : nome ? t('Conta de {nome}', { nome }) : t('Sua conta')
        }
        title={convidado ? t('Você está usando como convidado') : (nome ?? email ?? t('Sua conta'))}
        style={iniciais ? { font: '900 12px var(--font-display)' } : undefined}
      >
        {/* Sem nome nem e-mail, o ícone genérico — nunca uma letra inventada. */}
        {foto ? (
          <img src={foto} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
        ) : (
          iniciais || <UserRound aria-hidden />
        )}
      </button>

      {aberto &&
        alvo &&
        createPortal(
          <div ref={painel} className="menu-conta cartao on" role="menu" aria-label={t('Sua conta')}>
            <div className="cab-menu">
              <b style={{ fontFamily: 'var(--font-display)' }}>
                {nome ?? (convidado ? t('Convidado') : t('Sua conta'))}
              </b>
              <p className="mut" style={{ fontSize: 12 }} title={email ?? undefined}>
                {email ?? estado}
              </p>
              {convidado && (
                <p className="mut aviso-convidado" style={{ fontSize: 12 }}>
                  <HardDrive aria-hidden />
                  {t(
                    'Fica só neste aparelho, até {sessoes} gravações e {palavras} palavras. Loja, ranking, importação e sincronização pedem conta.',
                    tetoAnonimoDa({ edicaoEstatica: semServidor }),
                  )}
                </p>
              )}
            </div>
            {semServidor
              ? null
              : anonimo
                ? item('login', LogIn, t('Entrar ou criar conta'))
                : item('profile', UserRound, t('Meu perfil'))}
            {item('estatisticas', ChartColumn, t('Estatísticas'))}
            {item('settings', SettingsIcon, t('Ajustes'))}
            {!semServidor && item('planos', CreditCard, t('Planos'))}
            {item('ajuda', LifeBuoy, t('Ajuda e suporte'))}
            {/* No headset com as telas novas DESLIGADAS, este menu é o único caminho de volta à chave
                (ela mora em `/diagnostico`, que só o painel "Mais" do desenho novo listava). */}
            {perfilDoDispositivo().tipo === 'quest' && item('diagnostico', Activity, t('Diagnóstico do aparelho'))}
            {authRequired && !anonimo && (
              <>
                <div className="sep-menu" />
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setAberto(false);
                    void auth.signOut();
                  }}
                >
                  <LogOut aria-hidden />
                  {t('Sair')}
                </button>
              </>
            )}
          </div>,
          alvo,
        )}
    </>
  );
}
