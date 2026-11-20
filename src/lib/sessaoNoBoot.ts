/**
 * O BOOT PRECISA DO SDK DO SUPABASE? (carga-rapida-no-celular, 2.1)
 *
 * Só quando há sessão guardada (`sb-*-auth-token`, inclusive a anônima do convidado) ou quando a URL é a volta do
 * login (callback, `?code=` do PKCE, tokens ou erro no `#`), que o `detectSessionInUrl` precisa ler. O visitante
 * sem conta não baixa os 61 KB do `vendor-supabase` antes de o Início pintar: medido na auditoria de 17/11/2026,
 * eles seguravam o LCP do `/app` no 4G lento. Ele baixa quando alguém pedir (a porta de login chama
 * `carregarSupabase`), e quem espera a sessão (`useSessaoSupabase`) ouve `EVENTO_SUPABASE_PEDIDO`.
 *
 * Módulo à parte de `lib/supabase` (sem importar nada dele): a identidade e o efeito de sessão leem a regra daqui.
 */

/** `lib/supabase` avisa (no `window`) quando o pacote é pedido pela primeira vez. */
export const EVENTO_SUPABASE_PEDIDO = 'babel:supabase-pedido';

/** A regra, pura. */
export function precisaDoSupabaseNoBoot(p: {
  chaves: string[];
  caminho: string;
  busca: string;
  hash: string;
}): boolean {
  if (p.chaves.some((k) => k.startsWith('sb-') && k.endsWith('-auth-token'))) return true;
  if (p.caminho.replace(/\/+$/, '') === '/auth/callback') return true;
  if (/[?&]code=/.test(p.busca)) return true;
  return /(?:^#|&)(access_token|refresh_token|error_code|error)=/.test(p.hash);
}

/**
 * A regra com o que este navegador tem AGORA (sessão guardada, URL). Fora do navegador (sem `window` ou sem
 * `localStorage`) não há como saber: vale o caminho de sempre, com o SDK.
 */
export function haSessaoOuVoltaDoLogin(): boolean {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') return true;
  let chaves: string[] = [];
  try {
    chaves = Object.keys(window.localStorage);
  } catch {
    /* sem storage: sem sessão guardada */
  }
  const { pathname, search, hash } = window.location;
  return precisaDoSupabaseNoBoot({ chaves, caminho: pathname, busca: search, hash });
}
