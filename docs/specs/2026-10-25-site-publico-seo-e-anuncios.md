# Site público, SEO e anúncios para menores

Status: aprovado (decisões do dono em 25/10/2026) · Data: 2026-10-25 · Autor: Guilherme

## Problema

Auditoria de 25/10 (código + Lighthouse no staging + pesquisa):

- O app é uma tela só renderizada no navegador (`useState<ViewType>`, `src/App.tsx:147`); o robô recebe `<div id="root">` vazio.
  Não há páginas públicas com URL (planos, sobre, contato, ajuda, guias). O AdSense reprova por "conteúdo de pouco valor".
- Soft 404: `assets.not_found_handling: "single-page-application"` devolve 200 com a home para qualquer caminho
  (`/sitemap.xml`, `/ads.txt`, `/nao-existe`). Não há `sitemap.xml` nem `ads.txt`; `robots.txt` só tem `Allow: /`.
- Staging indexável (sem `X-Robots-Tag`), canonical apontando para o staging; sem `www`→apex.
- `public/privacidade.html` tem `[DONO: …]` e diz que não mostra anúncios e nunca a menores; contraste 4,15 (< 4,5) em `.kicker` e no `mailto:`.
- Home: LCP 6,2 s no celular (texto só depois do JS).

## Decisões do dono (25/10/2026)

1. **Site público na raiz, app em `/app`.** `frasy.com.br/`, `/planos`, `/sobre`, `/contato`, `/ajuda`, `/guias/…` são HTML estático pré-renderizado.
2. **Guias:** o Claude rascunha 12 guias em pt-BR; o dono revisa antes de publicar (só `revisado: true` entra no build e no sitemap).
3. **Anúncios para menores:** comuns (contextuais, sem personalização, marcação de idade do Google) SIM para menores;
   o premiado ("assista e ganhe") continua só para adultos (18+).

## Fora do escopo

Anúncio AdSense nas páginas públicas (só depois da aprovação e do código `pub-`); i18n das páginas públicas (só pt-BR agora, sem hreflang);
ligar a flag `anuncios`; parecer jurídico (recomendado, decisão do dono).

## Design

### Site público (Tarefa 1)

- Build: depois do `vite build`, um passo de pré-renderização gera `dist/<rota>/index.html` (React `renderToStaticMarkup` ou templates)
  com layout comum (cabeçalho com Planos, Guias, Ajuda, Sobre, Entrar → `/app`; rodapé com Sobre, Contato, Ajuda, Privacidade, Termos, Guias),
  `<title>`, `meta description`, canonical e OG por página, JSON-LD `Organization` + `WebSite` (home) e `WebApplication` com `offers` (planos).
  Páginas leves: sem o bundle do app; CSS próprio pequeno. Preços de `src/core/planos.ts` (nunca à mão).
- Guias: `content/guias/<slug>.md` com frontmatter `titulo`, `descricao`, `slug`, `publicado` (AAAA-MM-DD), `revisado` (bool), `palavrasChave`.
  Índice `/guias` e página por guia; só `revisado: true` é publicado.
- Gerados no build: `sitemap.xml` (só páginas públicas publicadas), `robots.txt` (`Disallow: /api/`, `Disallow: /app`, `Sitemap:`),
  `ads.txt` só quando `ADSENSE_PUB_ID` estiver definido no build; página `404.html`.
- Worker: `/app` e `/app/*` → `index.html` do app (SPA); `/auth/callback` continua funcionando (rota do app); páginas públicas pelo ASSETS;
  caminho desconhecido → `404.html` com status 404; `www.` → apex 301; host ≠ produção → `X-Robots-Tag: noindex, nofollow` e robots com `Disallow: /`.
- App: links e redirecionamentos para `/` passam a `/app` (ErroDaTela, retorno do Asaas, PWA `start_url`, etc.).

### Guias (Tarefa 2)

12 rascunhos originais, úteis, ligados ao uso do Frasy (aprender com séries, podcasts, reuniões, gírias, repetição espaçada…), 900–1500 palavras,
exemplos reais e corretos, sem promessas enganosas (skill `copy-br-etica`), `revisado: false`.

### Anúncios para menores e privacidade (Tarefa 3)

- `src/core/anuncios/politicaDeAnuncio.ts`: perfil protegido deixa de negar tudo; nega só o premiado (motivo próprio). A idade vai à página de anúncios
  como tratamento de idade do Google (menor de 13 ou idade desconhecida → criança; 13–17 → adolescente), sempre sem personalização.
- `anuncios/espaco.js`: aplicar o tratamento de idade (TFAT/equivalente vigente do GPT), mantendo `childDirectedTreatment`/`nonPersonalizedAds`.
- `public/privacidade.html`: seção de anúncios reescrita (Google como fornecedor, cookies/identificadores, contextual para menores, links do Google),
  contraste ≥ 4,5, cabeçalho/rodapé iguais aos do site; `[DONO]` ficam listados para o dono. `public/termos.html`: contraste e navegação. ROPA T14 e `docs/flags.md`.

## Critérios de aceite

- [ ] `curl` sem JS em `/`, `/planos`, `/sobre`, `/contato`, `/ajuda`, `/guias` devolve 200 com o texto da página no HTML, title/description/canonical próprios.
- [ ] `/nao-existe` → 404 com a página 404; `/sitemap.xml` → XML; `/robots.txt` com Sitemap; `/ads.txt` 404 sem `ADSENSE_PUB_ID`.
- [ ] `/app` abre o app como hoje; login, callback de e-mail/OAuth e retorno do checkout voltam ao app.
- [ ] Staging responde `X-Robots-Tag: noindex`; produção não.
- [ ] Lighthouse celular na home pública: desempenho ≥ 90, acessibilidade/boas práticas/SEO = 100; Privacidade/Termos a11y = 100.
- [ ] Perfil protegido recebe anúncio comum e nunca o premiado; a página de anúncios recebe o tratamento de idade; testes cobrem os três casos.
- [ ] Guias com `revisado: false` não aparecem no build nem no sitemap.
