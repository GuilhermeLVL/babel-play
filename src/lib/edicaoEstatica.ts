/// <reference types="vite/client" />

/**
 * A EDIÇÃO ESTÁTICA — o build que vai para o Cloudflare Pages SEM o servidor Node atrás
 * (`npm run build:estatica`, `docs/edicao-estatica.md`).
 *
 * Ligada por `VITE_EDICAO_ESTATICA=1` no build. Nela:
 *  - a identidade nasce `anonimo` e não muda (não há login a fazer);
 *  - `apiFetch` nunca vai à rede em `/api`: tudo é o servidor em memória (`data/efemero`), inclusive
 *    as rotas que no modo sem conta "passam direto" — lá não há servidor para onde passar, e o
 *    Pages devolveria o `index.html` (200) ou 404 no lugar do JSON;
 *  - o que depende de servidor (login, planos, checkout, IA de nuvem, importação pelo servidor,
 *    ranking) não aparece, e onde a tela não existe sem conta ela diz que o recurso está na versão
 *    completa, sem botão para um login que não existe.
 *
 * É uma FOLHA: não importa nada do app, para que `identidade`, `supabase`, o funil e o núcleo do
 * servidor em memória possam perguntar sem ciclo de importação.
 *
 * Lida a cada chamada (e não congelada numa constante) porque o teste liga e desliga a variável;
 * no build o Vite troca `import.meta.env.VITE_EDICAO_ESTATICA` pelo literal, então o custo é zero.
 */
export function edicaoEstatica(): boolean {
  /* `import.meta.env.X` LITERAL, sem cast: é a forma que o Vite substitui no build e que o
     `vi.stubEnv` alcança no teste (um cast sobre `import.meta` escapava das duas). */
  return import.meta.env?.VITE_EDICAO_ESTATICA === '1';
}
