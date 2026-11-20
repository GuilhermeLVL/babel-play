# Bancada dos anúncios com o isolamento ligado (estado 3, Task 6, change 11.1)

Data: 21/10/2026. Desenho dos rulings R32 e R35 (`docs/deploy.md` §Anúncios): a página de anúncios roda no
Worker próprio `frasy-anuncios` e o app a embute por `<iframe credentialless sandbox>`. Esta bancada prova o
caminho inteiro com o app **isolado** (COOP/COEP/DIP) num navegador de verdade, **sem código de rede**: nenhum
anúncio real foi pedido ao Google.

## Ambiente

| Item                               | Valor                                                                                                                                                                                                                                                                                                                               |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| App (staging)                      | `https://frasy-staging.guigui-cruzeiro.workers.dev`, versão `0.1.0+2e5036e` (contém `ff351135`)                                                                                                                                                                                                                                     |
| Página de anúncios (staging)       | `https://frasy-anuncios-staging.guigui-cruzeiro.workers.dev` (Worker `frasy-anuncios-staging`)                                                                                                                                                                                                                                      |
| Build da página                    | `APP_URL=<app staging>`, **sem** `VITE_ANUNCIOS_REDE_CONTA` (`config.js`: `{"rede":"","app":"https://frasy-staging.guigui-cruzeiro.workers.dev"}`). `APP_URL` aqui é variável de shell do `npm run anuncios:build` (vira o `config.js` e o `frame-ancestors` da página de anúncios); não é variável do GitHub nem do Worker do app. |
| App: `ANUNCIOS_ORIGEM`             | secret do Worker `frasy-staging` (via `scripts/cloudflare/secrets.ts staging`)                                                                                                                                                                                                                                                      |
| App: `VITE_ANUNCIOS_ORIGEM`        | variável do Environment `staging` no GitHub, lida pelo `deploy-worker.yml` no build do app.                                                                                                                                                                                                                                         |
| Flag `anuncios` no `frasy_staging` | LIGADA às **16:55:36Z**, DESLIGADA às **16:57:51Z** (UTC; `atualizado_por = cli`). Conferida desligada no fim                                                                                                                                                                                                                       |
| Conta de teste                     | `bancada-anuncios@frasy-teste.dev`, adulta (`PUT /api/me/idade`), Grátis sem teste; `users.created_at` recuado 4 dias para passar a regra dos 3 dias; apagada do Supabase Auth no fim                                                                                                                                               |

## 1. A página de anúncios (curl)

| Caminho                                            | Status                | COOP / COEP / DIP | CSP                                                                                                                                     | Outros                                                                                                                      |
| -------------------------------------------------- | --------------------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `/espaco.html`                                     | 200 `text/html`       | nenhum            | a da página: `script-src 'self' 'unsafe-inline'` + hosts do Google; `frame-ancestors https://frasy-staging.guigui-cruzeiro.workers.dev` | `x-content-type-options: nosniff`, `referrer-policy: strict-origin-when-cross-origin`, `cache-control: public, max-age=300` |
| `/config.js`                                       | 200 `text/javascript` | nenhum            | idem                                                                                                                                    | só a rede (vazia) e a origem do app; nenhum segredo                                                                         |
| `/espaco.js`                                       | 200                   | nenhum            | idem                                                                                                                                    |                                                                                                                             |
| `/espaco`, `/index.html`, `/_headers`, `/qualquer` | 404                   | nenhum            | idem                                                                                                                                    | o `_headers` não é servido                                                                                                  |

## 2. O app com a flag (curl, `Sec-Fetch-Dest: document`)

| Pedido                        | Flag desligada                                                  | Flag ligada (estável em todos os isolates)                                         |
| ----------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `GET /`                       | 200; CSP **sem** `frame-src`                                    | 200; `frame-src 'self' https://frasy-anuncios-staging.guigui-cruzeiro.workers.dev` |
| `GET /planos` (link profundo) | idem                                                            | idem                                                                               |
| `script-src`                  | `'self' 'wasm-unsafe-eval' blob:`                               | **o mesmo** (nenhum host do Google, nenhum da origem de anúncios)                  |
| COOP / COEP / DIP             | `same-origin` / `credentialless` / `isolate-and-credentialless` | os mesmos                                                                          |

**A pergunta do 304 (da revisão).** `GET /` com `If-None-Match: <etag>` responde **304 com a CSP inteira e os
cabeçalhos de isolamento**, e com a flag ligada a CSP do 304 **já vem sobreposta** (`frame-src` com a origem de
anúncios), tanto com `Sec-Fetch-Dest: document` quanto sem ele (o `ASSETS` manda `content-type: text/html` no
304, e o Worker trata como documento). Com a flag desligada, o 304 volta sem `frame-src`. O navegador atualiza os
cabeçalhos guardados com os do 304, então revalidar não prende uma CSP velha.

**A janela de 60 s.** Logo depois de ligar a flag, documentos seguidos alternaram com e sem `frame-src` por
alguns segundos (cada isolate tem o próprio cache de 60 s, `server/http/anunciosNoWorker.ts`); estabilizou em
menos de um minuto. É o custo aceito no R31.

## 3. Navegador de verdade (Playwright, Chromium headless, contra o staging)

Login pela porta do app com a conta de teste, flag ligada. Resultado:

- documento isolado: `crossOriginIsolated === true`, `'credentialless' in HTMLIFrameElement.prototype === true`;
- a **folha de consentimento** ("Anúncios no plano Grátis") apareceu no espaço do Início (`inicio-nativo`);
- depois do "Aceitar", entrou **um** `<iframe>` com `src = https://frasy-anuncios-staging…/espaco.html`
  (query `espaco, formato, tema, idioma, consentimento`), `credentialless` (atributo e propriedade) e
  `sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"`;
- `espaco.html`, `config.js` e `espaco.js` carregaram com **200**, sem COOP/COEP/DIP, com o `frame-ancestors` do app;
- **nenhum** `securitypolicyviolation` no documento do app e **nenhum** bloqueio de COEP/DIP no console;
- console do quadro: `frasy-anuncios: sem código da rede no build (VITE_ANUNCIOS_REDE_CONTA); nada é pedido.`;
- a página postou `{ tipo: 'frasy:anuncio', evento: 'vazio' }` com a origem de anúncios, e o espaço sumiu
  (zero `aside[data-ad]` no fim). Nenhum pedido a `doubleclick`/`googlesyndication`;
- fora do quadro, só ruído conhecido: `No available adapters.` (WebGPU no headless) e um 401 de uma rota antes do login.

Capturas (fora do repositório): a folha antes do "Aceitar" e a tela depois.

**Firefox: não executado aqui.** O Firefox do Playwright (`firefox-1555`) não abriu no sandbox desta máquina
(`Could not find profile folder`), e rodar fora dele não foi autorizado. O comportamento esperado ("sem provedor,
nada": sem `credentialless`, `disponivel()` é falso e o espaço não desenha nem a folha) está coberto por
`tests/anuncios-provedor-real.test.tsx`. Para fechar no navegador:
`node --env-file=.env <scratchpad>/bancada.mjs navegador firefox` com a flag ligada (o roteiro está descrito acima).

## 4. E2E local e determinístico

`tests/e2e-publico/bancada-anuncios.e2e.ts` (`npx playwright test -c playwright.publico.config.ts bancada-anuncios`):
a página de anúncios é gerada pelo mesmo `construir()` e servida em outra origem (`_anuncios-estatico.mjs`, com os
cabeçalhos do `_headers`), o app sobe isolado (COOP/COEP do Express) com `ANUNCIOS_ORIGEM`/`VITE_ANUNCIOS_ORIGEM`
apontados para ela. Como o Express não sobrepõe a CSP (só o Worker), o teste aplica a **mesma** `cspComAnuncios`
ao cabeçalho do documento. Prova: `frame-src` com a origem, a folha e depois o quadro `credentialless` com o
`sandbox`, nenhuma violação nem bloqueio de COEP vindos do quadro, o aviso "sem código da rede" e o `vazio`. O
segundo caso prova o contrário: sem a sobreposição, o navegador acusa `frame-src` e o espaço some.

## 5. O que fica aguardando

- **Aprovação do domínio e da rede:** sem `VITE_ANUNCIOS_REDE_CONTA` (código do Ad Manager) e sem o domínio
  `ads.<domínio>` aprovado, nenhum anúncio real foi pedido. Falta conferir no console, com a rede real, os hosts
  que o GPT usa (a lista de `scripts/anuncios/build.mjs` não é garantida pelo Google), o SafeFrame e o premiado.
- **Firefox** no navegador (acima).
- A página de anúncios do staging fica publicada (sem rede, ela só posta `vazio`); `ANUNCIOS_ORIGEM` e
  `VITE_ANUNCIOS_ORIGEM` ficam configurados no staging; com a flag desligada nada muda na CSP.
