# VLibras (governo federal): o que o widget faz de verdade (piloto só para adultos)

Data: 29/10/2026. Método: lemos o código que o servidor entrega (`vlibras-plugin.js`, `vlibras-plugin-app.js`, o
chunk inicial e os chunks da tela) e rodamos o widget numa página de teste em Chromium (Playwright 1.64), registrando
TODAS as requisições. Nada sensível foi salvo; a página de teste era uma página mínima servida por `page.route`.
`NC` = não confirmado.

## Decisão do dono

Piloto VLibras só para adultos: flag `libras_vlibras` (nasce desligada), só 18+ com consentimento explícito,
rotulado como serviço EXTERNO. Nunca "nosso" nem "tradução oficial". Texto fixo: "Sinais de apoio via VLibras
(serviço do governo federal). Não substitui intérprete de Libras." Produção segue fechada; ligar é ato do dono.

## Fatos confirmados

| Item                         | Resultado                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Script oficial               | `https://vlibras.gov.br/app/vlibras-plugin.js` (2,4 KB, loader). Versão no código: 7.12.2. Responde 302 para `cdn.jsdelivr.net/gh/spbgovbr-vlibras/vlibras-portal@v7.12.2/app/...` (o mesmo vale para o app, imagens e fontes).                                                                                                                                                                                                                                                                                      |
| Licença do código            | `LGPL-3.0-or-later` (`package.json` embutido no bundle e README do repositório `vlibras-web-browsers`).                                                                                                                                                                                                                                                                                                                                                                                                              |
| HTML mínimo                  | A versão 7.x NÃO usa mais `<div vw>`: o loader cria o próprio botão flutuante (Shadow DOM, `#vlibras-access-wrapper`). Basta o script e `new window.VLibras.Widget({ rootPath: 'https://vlibras.gov.br/app' })`. `window.VLibrasWidget.open()` abre o widget sem clicar no botão dele. O README do repositório NÃO traz snippet de instalação (só build). A doc de instalação: NC.                                                                                                                                   |
| Como traduz                  | Com o widget aberto, um CLIQUE em qualquer elemento com texto próprio (ou em botão, link, imagem com `alt`) traduz o texto do elemento; com texto SELECIONADO, traduz a seleção. `data-vlibras-gloss` no elemento envia a glosa direto, sem passar pelo serviço de tradução. Não existe "marcar como traduzível": o texto da própria página já é traduzível.                                                                                                                                                         |
| Efeito colateral dos cliques | Com o widget aberto ele captura os cliques da página (fase de captura, `preventDefault`) e, em botão/link, pede confirmação antes de repassar o clique. A UI do app fica "em modo tradução" enquanto o widget está aberto.                                                                                                                                                                                                                                                                                           |
| Avatar                       | Unity WebGL num `<iframe>` de `https://vlibras.gov.br/app/unity/index.html` (sandbox `allow-scripts allow-same-origin`). Avatares Ícaro, Hosana e Guga. Baixa `playerweb.*.unityweb` (wasm, framework, data).                                                                                                                                                                                                                                                                                                        |
| Texto vai a                  | `POST https://traducao2.vlibras.gov.br/translate` com corpo `{"text": "<texto clicado/selecionado>"}`. Depois os sinais vêm de `https://dicionario2.vlibras.gov.br/2018.3.1/WEBGL/<SINAL>` e `/static/BUNDLES/...` (pedidos feitos de dentro do iframe).                                                                                                                                                                                                                                                             |
| Outros endpoints no código   | `https://repositorio.vlibras.gov.br/api` (categorias do dicionário), `https://dicionario2.vlibras.gov.br/static/TREES/2018.3.1.json` (lista de sinais), `https://traducao2.vlibras.gov.br/review` (botão de avaliação "gostei", POST), `https://dicionario2.vlibras.gov.br/bundles`. `HEAD` em `vlibras.gov.br/app/unity/index.html` antes de montar o iframe.                                                                                                                                                       |
| Analytics                    | PostHog (`phc_...` no bundle, `api_host https://us.i.posthog.com`, `persistence: memory`). O código importa `posthog-js@1.404.0` de `cdn.jsdelivr.net/npm/...` e este carrega `us-assets.i.posthog.com` (config, surveys, dead-clicks). Há um evento `widget_initialized` (amostra de 7%, com `host` e `origin+pathname` da página) que NÃO depende do aceite do widget; os demais eventos só saem depois do "Aceitar" da pergunta do próprio widget ("Podemos coletar dados anônimos de uso...", vista na captura). |
| Armazenamento local          | `localStorage`: `@vlibras-widget` (aberto/opacidade) e `@vlibras/player` (velocidade, legenda, avatar). Nenhum cookie.                                                                                                                                                                                                                                                                                                                                                                                               |
| Funciona sob COEP?           | NÃO. Com `Cross-Origin-Embedder-Policy: credentialless` (o padrão do app) o iframe do avatar é bloqueado (`ERR_BLOCKED_BY_RESPONSE`), porque `vlibras.gov.br` não manda COEP. Com `Document-Isolation-Policy: isolate-and-credentialless` e SEM COEP (modo `CROSS_ORIGIN_ISOLATION=dip`) funciona. Ver "Consequência para o deploy".                                                                                                                                                                                 |

## Domínios por diretiva (confirmados no Chromium com uma CSP estreita)

CSP de teste: `script-src 'self' https://vlibras.gov.br https://cdn.jsdelivr.net/gh/spbgovbr-vlibras/`; `connect-src`
com os quatro hosts abaixo; `frame-src https://vlibras.gov.br`; `font-src` com `vlibras.gov.br` e o mesmo caminho do
jsdelivr; `img-src https:` (já é a regra do app). Resultado: widget abre, avatar carrega, tradução e sinais rodam.

| Diretiva      | Entra                                                                                                                                                                                             |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `script-src`  | `https://vlibras.gov.br` e `https://cdn.jsdelivr.net/gh/spbgovbr-vlibras/` (destino do 302; em redirecionamento o caminho da fonte é ignorado e só o host conta, em Chromium).                    |
| `connect-src` | `https://vlibras.gov.br`, `https://traducao2.vlibras.gov.br`, `https://dicionario2.vlibras.gov.br`, `https://repositorio.vlibras.gov.br`. (`cdn.jsdelivr.net` já está nas conexões fixas do app.) |
| `frame-src`   | `https://vlibras.gov.br`                                                                                                                                                                          |
| `font-src`    | `https://vlibras.gov.br` e `https://cdn.jsdelivr.net/gh/spbgovbr-vlibras/` (Rawline, pela mesma regra do redirecionamento).                                                                       |
| `img-src`     | nada (já `https:`).                                                                                                                                                                               |
| `media-src`   | nada (não vimos mídia).                                                                                                                                                                           |

O PostHog fica BLOQUEADO de propósito: como o caminho do jsdelivr é limitado a `/gh/spbgovbr-vlibras/`, o `import()`
direto de `cdn.jsdelivr.net/npm/posthog-js` viola a CSP (visto no console) e o widget segue funcionando sem analytics.
`us.i.posthog.com` e `us-assets.i.posthog.com` NÃO entram em nenhuma diretiva. Limite: a pergunta de aceite de analytics
do widget continua aparecendo (é do widget); aceitar não envia nada porque a biblioteca não carrega. Só provado no
Chromium: Safari e Firefox podem tratar o caminho em redirecionamento de outro jeito (NC).

## Consequência para o deploy (COEP)

O app roda isolado (COOP + COEP `credentialless` + DIP) para ter threads no WASM. Para o iframe do VLibras funcionar,
`VLIBRAS_ATIVO=1` troca o modo `completo` por `dip` (sem COEP), tanto no Express (`server/http/isolamento.ts`) quanto
no `dist/_headers`. Custo: o Firefox perde o isolamento (e as threads dos modelos locais); Chromium mantém pelo DIP;
Safari já não isolava. É o preço de ligar o piloto, e só acontece com a variável.

## Riscos e o que NÃO foi confirmado (NC)

- NC: licença do dicionário de sinais e do avatar (o LGPL cobre o código do widget; os ativos Unity e os pacotes de
  sinais não têm licença declarada no que vimos). Ver com o dono/jurídico antes de ligar.
- NC: termos de uso e política de privacidade do serviço de tradução, e termos para menores (por isso: só 18+).
- NC: retenção do texto enviado a `traducao2.vlibras.gov.br`, e se há logs por IP. O que sabemos: o texto vai em
  claro por HTTPS e o IP do aparelho chega ao governo (e ao jsdelivr pelo redirecionamento).
- NC: qualidade dos sinais (tradução automática por glosa; não revisada por pessoas surdas).
- Sem SRI: o script é um arquivo vivo do governo (mudou de `<div vw>` para o loader novo). Quem controla o
  `vlibras.gov.br` (e o jsdelivr) controla código na página. Mitigação: só 18+, só com consentimento, CSP por host,
  e o piloto fica desligado por padrão.
- A pergunta de analytics do widget e o `widget_initialized` (amostrado) saem do widget, não do app; o app não os
  controla além de bloquear a biblioteca PostHog pela CSP.
- Cliques: com o widget aberto a interface "vira modo tradução" (ver acima). O app avisa na tela.
