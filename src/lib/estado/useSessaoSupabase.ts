import { useEffect, useState } from 'react';

import { clearAuthCallbackUrl,isOnAuthCallback } from '../authCallback';
import { limparEntitlements } from '../entitlements';
import { armarIdentidade, definirIdentidade } from '../identidade';
import { authRequired,carregarSupabase } from '../supabase';

export interface EstadoDaSessaoSupabase {
  session: { user?: unknown } | null | undefined;
  recovery: boolean;
  setRecovery: (v: boolean) => void;
  processingCallback: boolean;
}

/**
 * Sessão do Supabase e identidade — o mesmo bloco que morava no topo do `App`, palavra por
 * palavra. Mantido como hook único para que a ordem dos efeitos continue a mesma.
 */
export function useSessaoSupabase(): EstadoDaSessaoSupabase {
  // Marco 1: sessão Supabase — só relevante no modo público (authRequired). No local fica null.
  const [session, setSession] = useState<{ user?: unknown } | null | undefined>(authRequired ? undefined : null);
  // Marco 1: fluxo de recuperação. O link do e-mail dispara PASSWORD_RECOVERY (com sessão temporária);
  // enquanto ativo, a tela de redefinir senha tem precedência sobre a porta de login e o app.
  const [recovery, setRecovery] = useState(false);
  // OAuth/recuperação voltam em /auth/callback: mostra um spinner até a sessão resolver e limpa a URL.
  const [processingCallback, setProcessingCallback] = useState(authRequired && isOnAuthCallback());
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
    const semSessao = () => { if (vivo) { setSession(null); definirIdentidade('anonimo'); } };
    void (async () => {
      try {
        const sb = await carregarSupabase();
        if (!sb || !vivo) { if (!sb) semSessao(); return; }
        sb.auth.getSession().then(({ data }) => {
          if (!vivo) return;
          setSession(data.session);
          definirIdentidade(data.session ? 'conta' : 'anonimo');
          clearAuthCallbackUrl();
          setProcessingCallback(false);
        }).catch(semSessao);
        const { data: sub } = sb.auth.onAuthStateChange((event, s) => {
          if (event === 'PASSWORD_RECOVERY') setRecovery(true);
          setSession(s);
          if (s) definirIdentidade('conta');
          else if (event === 'SIGNED_OUT') { definirIdentidade('anonimo'); limparEntitlements(); }
        });
        if (!vivo) { sub.subscription.unsubscribe(); return; }
        inscricao = sub.subscription;
      } catch {
        semSessao();
      }
    })();
    return () => { vivo = false; inscricao?.unsubscribe(); };
  }, []);

  return { session, recovery, setRecovery, processingCallback };
}
