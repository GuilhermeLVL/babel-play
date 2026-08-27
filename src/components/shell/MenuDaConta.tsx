import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { User, Settings as SettingsIcon, LogOut, LogIn } from 'lucide-react';
import { usePerfil } from '../../lib/usePerfil';
import { authRequired } from '../../lib/supabase';
import { aoMudarIdentidade, estaAnonimo } from '../../lib/identidade';
import * as auth from '../../lib/auth';

/**
 * O MENU DA CONTA — quem eu sou, e como eu saio.
 *
 * O DEFEITO QUE ISTO CONSERTA, e ele é de dois tipos ao mesmo tempo.
 *
 * PRIMEIRO: a aplicação era anônima. `session.user` do Supabase era tipado como `unknown` no
 * `App.tsx` e NUNCA saía de lá — nenhuma tela sabia o e-mail ou o nome de quem estava logado. Uma
 * busca por `user.email` no `src/` inteiro devolvia zero resultados.
 *
 * SEGUNDO: dava para entrar e não dava para sair. O único botão de logout do app estava em
 * `Ajustes → aba "Conta e recomeço" → AccountSecuritySection → SecurityPanel → "Sair da conta"` —
 * quatro níveis de profundidade. Pior: `AccountSecuritySection` devolve `null` quando não há login
 * configurado, então em desenvolvimento a aba ficava VAZIA, e foi por isso que ninguém nunca
 * encontrou o botão.
 *
 * POR QUE AQUI, E NÃO NO MENU DE NAVEGAÇÃO. `MobileNav` renderiza `NAV_ITEMS` inteiro e o próprio
 * arquivo registra que com 6 itens cada um já fica com ~16% da largura da tela; um oitavo destino
 * derrubaria o alvo de toque. O `ControlCluster` é a única peça montada pelas quatro posições de
 * menu (topo, esquerda, direita, rodapé) E pela barra do celular — mesmo argumento que já tinha
 * levado a busca global para cá.
 *
 * "SAIR" É OMITIDO, NÃO DESABILITADO, no modo local: sem sessão não há o que encerrar, e um botão
 * cinza que não faz nada ensina que a interface mente.
 */

interface MenuDaContaProps {
  onIr: (view: string) => void;
  /** `column` (rail vertical) abre o painel ao lado; `row`, abaixo. */
  orientation: 'row' | 'column';
}

export default function MenuDaConta({ onIr, orientation }: MenuDaContaProps) {
  const { perfil, iniciais } = usePerfil();
  const [aberto, setAberto] = useState(false);
  // Sem conta o menu vira a porta de entrada: "Entrar" em vez de "Sair", e sem "Meu perfil".
  const [anonimo, setAnonimo] = useState(estaAnonimo);
  useEffect(() => aoMudarIdentidade(() => setAnonimo(estaAnonimo())), []);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const gatilho = useRef<HTMLButtonElement | null>(null);
  const painel = useRef<HTMLDivElement | null>(null);

  /* `fixed` com coordenadas MEDIDAS, e não `absolute`: a raiz do app é `overflow-hidden` e o rail
     vertical é um flex de altura total dentro dela, um popover absoluto ali seria recortado. E um
     `top` fixo abriria para baixo mesmo com o menu no rodapé, ou seja, fora da tela. É a mesma
     conta (e o mesmo motivo) do popover de aparência, três arquivos ao lado. */
  useEffect(() => {
    if (!aberto) return;
    const medir = () => {
      const r = gatilho.current?.getBoundingClientRect();
      if (!r) return;
      const LARGURA = 236, ALTURA = 210, FOLGA = 8, MARGEM = 8;

      const cabeAbaixo = window.innerHeight - r.bottom >= ALTURA + FOLGA;
      const top = cabeAbaixo ? r.bottom + FOLGA : Math.max(MARGEM, r.top - ALTURA - FOLGA);

      // Alinhado pela direita do gatilho, grampeado nas bordas da janela.
      let left = r.right - LARGURA;
      left = Math.min(left, window.innerWidth - LARGURA - MARGEM);
      left = Math.max(MARGEM, left);

      setCoords({ top, left });
    };
    medir();
    window.addEventListener('resize', medir);
    window.addEventListener('scroll', medir, true);
    return () => { window.removeEventListener('resize', medir); window.removeEventListener('scroll', medir, true); };
  }, [aberto, orientation]);

  // Fecha ao clicar fora e no Escape — um menu que só fecha no próprio botão prende quem errou o alvo.
  useEffect(() => {
    if (!aberto) return;
    const foraDaqui = (e: MouseEvent) => {
      const alvo = e.target as Node;
      if (!painel.current?.contains(alvo) && !gatilho.current?.contains(alvo)) setAberto(false);
    };
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberto(false); };
    document.addEventListener('mousedown', foraDaqui);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('mousedown', foraDaqui); document.removeEventListener('keydown', escape); };
  }, [aberto]);

  const nome = perfil?.displayName?.trim() || null;
  const email = perfil?.email?.trim() || null;

  const ir = (view: string) => { setAberto(false); onIr(view); };

  return (
    <>
      <button
        ref={gatilho}
        type="button"
        onClick={() => setAberto(a => !a)}
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-label={nome ? `Conta de ${nome}` : 'Sua conta'}
        title={nome ?? email ?? 'Sua conta'}
        className="w-9 h-9 shrink-0 rounded-full bg-accent-soft text-accent-ink font-display font-black text-[12px] flex items-center justify-center border border-border-subtle hover:border-accent transition-colors cursor-pointer"
      >
        {/* Sem nome nem e-mail, o ícone genérico — nunca uma letra inventada. */}
        {iniciais || <User className="w-4 h-4" aria-hidden />}
      </button>

      {aberto && coords && createPortal(
        <div
          ref={painel}
          role="menu"
          style={{ top: coords.top, left: coords.left }}
          className="fixed z-[60] w-[236px] card-panel bg-surface shadow-card p-1.5 animate-in fade-in zoom-in-95 duration-150"
        >
          {/* A IDENTIDADE, que não existia em lugar nenhum da interface. */}
          <div className="px-2.5 py-2 border-b border-border-subtle mb-1">
            <p className="font-bold text-[13px] text-ink truncate">{nome ?? 'Sua conta'}</p>
            {email
              ? <p className="text-[11.5px] text-ink-muted truncate" title={email}>{email}</p>
              /* Sem e-mail não se inventa um: o servidor não retém o e-mail do JWT, e dizer
                 "conta local" é a verdade sobre o que está acontecendo. */
              : <p className="text-[11.5px] text-ink-faint">{anonimo ? 'sem conta · dados só neste navegador' : authRequired ? 'sessão ativa' : 'conta local'}</p>}
          </div>

          {anonimo ? (
            <button role="menuitem" onClick={() => ir('login')} className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] text-accent-ink font-semibold hover:bg-accent-soft cursor-pointer">
              <LogIn className="w-4 h-4" aria-hidden /> Entrar ou criar conta
            </button>
          ) : (
            <button role="menuitem" onClick={() => ir('profile')} className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] text-ink hover:bg-surface-hover cursor-pointer">
              <User className="w-4 h-4 text-ink-muted" aria-hidden /> Meu perfil
            </button>
          )}
          <button role="menuitem" onClick={() => ir('settings')} className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] text-ink hover:bg-surface-hover cursor-pointer">
            <SettingsIcon className="w-4 h-4 text-ink-muted" aria-hidden /> Ajustes
          </button>

          {/* Só com login de verdade. Sem sessão não há o que encerrar. */}
          {authRequired && !anonimo && (
            <>
              <div className="h-px bg-border-subtle my-1" />
              <button
                role="menuitem"
                onClick={() => { setAberto(false); void auth.signOut(); }}
                className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] text-error-ink hover:bg-error-soft cursor-pointer"
              >
                <LogOut className="w-4 h-4" aria-hidden /> Sair da conta
              </button>
            </>
          )}
        </div>,
        document.body,
      )}
    </>
  );
}
