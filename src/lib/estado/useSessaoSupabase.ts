import { useEffect, useState } from 'react';

import { precisaDoSegundoFator } from '../auth';
import { clearAuthCallbackUrl, isOnAuthCallback } from '../authCallback';
import { ehSessaoAnonima } from '../convidado';
import { limparEntitlements } from '../entitlements';
import { armarIdentidade, definirIdentidade } from '../identidade';
import { authRequired, carregarSupabase } from '../supabase';

export interface EstadoDaSessaoSupabase {
  session: { user?: unknown } | null | undefined;
  recovery: boolean;
  setRecovery: (v: boolean) => void;
  processingCallback: boolean;
  /** Conta com 2FA e sessão ainda `aal1`: o App mostra o desafio do código antes de entrar. */
  segundoFatorPendente: boolean;
  /** Reconfere o nível da sessão (depois de o código ser aceito). */
  reconferirSegundoFator: () => void;
}

/**
 * Sessão do Supabase e identidade — o mesmo bloco que morava no topo do `App`, palavra por
 * palavra. Mantido como hook único para que a ordem dos efeitos continue a mesma.
 */
/**
 * A SESSÃO ANÔNIMA NÃO É CONTA (Fase 7 — modo convidado). O convidado com nuvem tem uma sessão do
 * Supabase (`signInAnonymously`, `user.is_anonymous`), mas para o app ele continua SEM conta: os
 * dados ficam no aparelho e a identidade é `anonimo`. Quando ele converte (`updateUser`/
 * `linkIdentity`, mesmo id), o `USER_UPDATED` traz o usuário não-anônimo e aí sim vira `conta` — e o
 * `ModalDeMigracao` sobe o que estava no aparelho, como em qualquer login.
 */
function sessaoDeConta<S extends { user?: unknown }>(s: S | null | undefined): S | null {
  return s && !ehSessaoAnonima(s) ? s : null;
}

export function useSessaoSupabase(): EstadoDaSessaoSupabase {
  // Marco 1: sessão Supabase — só relevante no modo público (authRequired). No local fica null.
  const [session, setSession] = useState<{ user?: unknown } | null | undefined>(authRequired ? undefined : null);
  // Marco 1: fluxo de recuperação. O link do e-mail dispara PASSWORD_RECOVERY (com sessão temporária);
  // enquanto ativo, a tela de redefinir senha tem precedência sobre a porta de login e o app.
  const [recovery, setRecovery] = useState(false);
  // OAuth/recuperação voltam em /auth/callback: mostra um spinner até a sessão resolver e limpa a URL.
  const [processingCallback, setProcessingCallback] = useState(authRequired && isOnAuthCallback());
  // Fase 6 — 2FA de verdade: senha/Google dão sessão aal1; com fator ativo, falta o código.
  const [segundoFatorPendente, setSegundoFatorPendente] = useState(false);
  const [conferencia, setConferencia] = useState(0);
  useEffect(() => {
    if (!authRequired || !session) {
      setSegundoFatorPendente(false);
      return;
    }
    let vivo = true;
    void precisaDoSegundoFator().then((p) => {
      if (vivo) setSegundoFatorPendente(p);
    });
    return () => {
      vivo = false;
    };
  }, [session, conferencia]);
  /**
   * O pacote do Supabase agora chega por `import()` (ver lib/supabase — ele era 96% código não
   * executado no arranque de quem não usa login). Isso custa um `await` aqui, porque
   * `onAuthStateChange` não pode mais ser chamado na hora.
   *
   * A TELA NÃO MUDA: enquanto `session` é `undefined` o App já pintava "Carregando…" — a espera
   * pelo `getSession()`, que é uma ida ao servidor. Agora essa mesma espera cobre também o
   * download do pacote, que acontece antes e é a parte curta. Nada de piscada de login: o gate
   * `session === undefined` é testado ANTES do `!session` que monta a porta de login.
   *
   * `vivo` cobre a desmontagem no meio da carga, e a inscrição é desfeita mesmo que ela chegue
   * depois — senão um StrictMode em desenvolvimento deixaria um listener órfão por montagem.
   */
  useEffect(() => {
    if (!authRequired) return;
    armarIdentidade();
    let vivo = true;
    let inscricao: { unsubscribe: () => void } | null = null;
    // Sem resposta do Supabase a identidade é `anonimo`, não `carregando`: ficar carregando para
    // sempre deixaria todo `apiFetch` pendurado.
    const semSessao = () => {
      if (vivo) {
        setSession(null);
        definirIdentidade('anonimo');
      }
    };
    void (async () => {
      try {
        const sb = await carregarSupabase();
        if (!sb || !vivo) {
          if (!sb) semSessao();
          return;
        }
        sb.auth
          .getSession()
          .then(({ data }) => {
            if (!vivo) return;
            const conta = sessaoDeConta(data.session);
            setSession(conta);
            definirIdentidade(conta ? 'conta' : 'anonimo');
            clearAuthCallbackUrl();
            setProcessingCallback(false);
          })
          .catch(semSessao);
        const { data: sub } = sb.auth.onAuthStateChange((event, s) => {
          if (event === 'PASSWORD_RECOVERY') setRecovery(true);
          const conta = sessaoDeConta(s);
          setSession(conta);
          if (conta) definirIdentidade('conta');
          else if (event === 'SIGNED_OUT' || ehSessaoAnonima(s)) {
            definirIdentidade('anonimo');
            limparEntitlements();
          }
        });
        if (!vivo) {
          sub.subscription.unsubscribe();
          return;
        }
        inscricao = sub.subscription;
      } catch {
        semSessao();
      }
    })();
    return () => {
      vivo = false;
      inscricao?.unsubscribe();
    };
  }, []);

  return {
    session,
    recovery,
    setRecovery,
    processingCallback,
    segundoFatorPendente,
    reconferirSegundoFator: () => setConferencia((n) => n + 1),
  };
}
