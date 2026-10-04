/**
 * OAuth / link de recuperação voltam para /auth/callback. O supabase-js processa a URL sozinho
 * (detectSessionInUrl) disparando SIGNED_IN / PASSWORD_RECOVERY; aqui só limpamos a URL depois, para
 * não deixar tokens no histórico nem a app presa nessa rota. Sem router: navegação é por estado no App.
 */
export const AUTH_CALLBACK_PATH = '/auth/callback'

/**
 * LINK VENCIDO OU JÁ USADO: o Supabase devolve a pessoa com `error_code` na URL (no `#` e na busca) e
 * sem sessão. Antes a URL era limpa e a porta abria muda; agora o código fica guardado até a porta ler
 * (`authPorta.consumirErroDoLink`). Lido na carga do módulo, antes de qualquer limpeza da URL.
 */
export const CHAVE_DO_ERRO_DO_LINK = 'babel.auth.erroDoLink'

function guardarErroDoLink(): void {
  try {
    const noHash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    const naBusca = new URLSearchParams(window.location.search)
    const code =
      noHash.get('error_code') ?? naBusca.get('error_code') ?? noHash.get('error') ?? naBusca.get('error')
    if (code) sessionStorage.setItem(CHAVE_DO_ERRO_DO_LINK, code)
  } catch {
    /* sem armazenamento: a porta abre sem o aviso */
  }
}
if (typeof window !== 'undefined') guardarErroDoLink()

export function isOnAuthCallback(): boolean {
  return typeof window !== 'undefined' && window.location.pathname === AUTH_CALLBACK_PATH
}

export function clearAuthCallbackUrl(): void {
  if (isOnAuthCallback()) window.history.replaceState({}, '', '/')
}
