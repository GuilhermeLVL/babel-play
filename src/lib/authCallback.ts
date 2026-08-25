/**
 * OAuth / link de recuperação voltam para /auth/callback. O supabase-js processa a URL sozinho
 * (detectSessionInUrl) disparando SIGNED_IN / PASSWORD_RECOVERY; aqui só limpamos a URL depois, para
 * não deixar tokens no histórico nem a app presa nessa rota. Sem router: navegação é por estado no App.
 */
export const AUTH_CALLBACK_PATH = '/auth/callback'

export function isOnAuthCallback(): boolean {
  return typeof window !== 'undefined' && window.location.pathname === AUTH_CALLBACK_PATH
}

export function clearAuthCallbackUrl(): void {
  if (isOnAuthCallback()) window.history.replaceState({}, '', '/')
}
