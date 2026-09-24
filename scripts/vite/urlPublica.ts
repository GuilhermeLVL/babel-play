/**
 * URL PÚBLICA NO `index.html` — canonical, og:url e as imagens de compartilhamento.
 *
 * O `index.html` cravava `https://babel-play.pages.dev/` — o endereço da edição leve no Cloudflare
 * Pages, que foi encerrada. Em produção isso diria ao buscador que a página canônica é OUTRO site, e
 * todo link compartilhado mostraria a miniatura de lá. O endereço agora vem de `VITE_PUBLIC_URL`, no
 * build; sem ela (dev, self-host, staging sem domínio) as marcações que exigem URL ABSOLUTA saem do
 * HTML — nenhuma marcação é melhor do que uma que aponta para o lugar errado.
 */

/** A marca que o `index.html` usa no lugar do endereço. */
export const MARCA_DA_URL = '%URL_PUBLICA%';

/**
 * Troca a marca pela URL (sem barra final), ou remove as linhas que a contêm quando não há URL.
 * Uma URL que não seja `https://` é tratada como ausente: canonical em http é pior que nenhum.
 */
export function aplicarUrlPublica(html: string, url: string | undefined): string {
  const limpa = (url ?? '').trim().replace(/\/+$/, '');
  let valida: boolean;
  try {
    valida = limpa !== '' && new URL(limpa).protocol === 'https:';
  } catch {
    valida = false;
  }
  if (valida) return html.split(MARCA_DA_URL).join(limpa);
  return html
    .split('\n')
    .filter((linha) => !linha.includes(MARCA_DA_URL))
    .join('\n');
}
