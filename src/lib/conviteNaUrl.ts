/**
 * O LINK DO CONVITE AO RESPONSÁVEL (`/responsavel?token=…`) — guardado antes do primeiro render.
 *
 * O responsável abre o link, quase sempre SEM estar logado. O login (e o OAuth, que sai do site e
 * volta) reescreve a URL, e o roteador do app trata `/responsavel` como caminho desconhecido. Então
 * o token é tirado da barra logo no boot (`main.tsx`), guardado na sessão da aba e a barra volta
 * para `/` — o token não fica no histórico nem vaza em `Referer`. Depois do login, o App o encontra
 * aqui e mostra a tela de aceite.
 */
const CHAVE = 'babel.convite.token';

export function capturarTokenDoConvite(): void {
  if (typeof window === 'undefined') return;
  try {
    if (window.location.pathname !== '/responsavel') return;
    const token = new URLSearchParams(window.location.search).get('token');
    if (token) sessionStorage.setItem(CHAVE, token);
    window.history.replaceState({}, '', '/');
  } catch {
    /* sem armazenamento: o link precisa ser aberto de novo depois do login */
  }
}

export function lerTokenDoConvite(): string | null {
  try {
    return sessionStorage.getItem(CHAVE);
  } catch {
    return null;
  }
}

export function esquecerTokenDoConvite(): void {
  try {
    sessionStorage.removeItem(CHAVE);
  } catch {
    /* nada a esquecer */
  }
}
