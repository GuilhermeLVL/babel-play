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

## Decisão de arquitetura (revisão de segurança, 29/10/2026): o widget NÃO roda no app

A primeira versão abria `vlibras.gov.br` e o jsdelivr no `script-src` do app. A revisão apontou (médio) que isso
enfraquece a CSP do app inteiro: um script de terceiro no documento enxerga o DOM, o `localStorage` e a sessão do
Frasy, e restringir por caminho no jsdelivr não é confiável (o caminho não vale em redirecionamento, e o CDN serve
repositórios de qualquer pessoa). Decisão:

1. O `script-src` (e toda a CSP) do app é IDÊNTICO com e sem `VLIBRAS_ATIVO` (teste). Nenhum host de terceiro.
2. O widget roda em `public/vlibras-ponte.html`, servida por nós, num `<iframe sandbox="allow-scripts">` SEM
   `allow-same-origin`: origem opaca, sem acesso ao DOM, cookies nem `localStorage` do Frasy (teste do atributo; o
   `referrerpolicy` é `no-referrer` e `allow=""`).
3. A ponte tem CSP PRÓPRIA (`diretivasDaPonteDoVLibras`, só ela, em cabeçalho no Express e bloco `/vlibras-ponte.html` do
   `dist/_headers`; o `!` tira a CSP herdada para não valerem duas). Sem `VLIBRAS_ATIVO=1`: `default-src 'none'`.
4. O app e a ponte só falam por `postMessage` com esquema estrito (`lerMensagemParaAPonte` / `lerMensagemDaPonte`): o app
   só aceita mensagem cujo `event.source` é o iframe e sem carga extra; a ponte só aceita do `window.parent`, texto
   com teto de 2000 caracteres, e escreve com `textContent`. Limite do navegador: para um iframe de origem opaca o único
   `targetOrigin` possível é `'*'`; por isso as mensagens do app levam só `iniciar` ou o trecho que a pessoa escolheu
   enviar, e as da ponte não levam dado nenhum.
5. O `frame-src` do app continua `'self'` (a ponte é da mesma origem). Nada de terceiro.
6. SRI: não se aplica. O script oficial é um arquivo vivo do governo (já mudou de formato entre versões) e o
   `vlibras-plugin.js` busca outros arquivos; SRI não cobriria o conteúdo mutável que ele carrega. A contenção é o
   sandbox da ponte, a CSP da ponte e o consentimento 18+.
7. Provado em Chromium (Playwright, rede real): dentro do sandbox opaque o widget abre, o avatar carrega, o texto vai a
   `traducao2` e os sinais vêm de `dicionario2`. O `localStorage` do widget fica indisponível (só avisos do zustand).
   Com COEP em qualquer ponto da cadeia o avatar é bloqueado: por isso `VLIBRAS_ATIVO=1` ainda troca `completo` por
   `dip` no app (a ponte também fica sem COEP).

### Risco residual (a CSP e o sandbox NÃO resolvem)

- O widget continua enviando o texto ao serviço do governo (`traducao2.vlibras.gov.br`), e o IP do aparelho chega a
  `vlibras.gov.br`, ao jsdelivr (redirecionamento) e ao `dicionario2`. Só o consentimento 18+ mitiga isso.
- O PostHog do widget é bloqueado pela CSP da ponte (o `import()` do `cdn.jsdelivr.net/npm/posthog-js` viola o caminho
  `/gh/spbgovbr-vlibras/`), mas o `widget_initialized` amostrado e a pergunta de analytics são do widget. Se o
  navegador tratar o caminho de outra forma (Safari/Firefox, NC), a biblioteca poderia carregar DENTRO do sandbox: o
  que ela enxerga é só a página da ponte (a frase enviada e `host`/`origin` opaco).
- O jsdelivr entra em `script-src` e `font-src` da ponte pelo host (redirecionamento): outro repositório do mesmo CDN
  poderia ser carregado por um script que já esteja rodando na ponte. O dano fica no sandbox (sem DOM/sessão do app),
  limitado ao `connect-src` da ponte.
- Código remoto mutável (o governo pode mudar o widget a qualquer hora).

## Domínios por diretiva (confirmados em Chromium; valem para a CSP da PONTE, não do app)

Teste: `script-src 'self' https://vlibras.gov.br https://cdn.jsdelivr.net/gh/spbgovbr-vlibras/`, `connect-src` com os quatro
hosts, `frame-src https://vlibras.gov.br`, fontes pelos mesmos hosts, `img-src https:`. Widget abre, avatar carrega,
tradução e sinais funcionam.

| Diretiva (da ponte) | Entra                                                                                                                                                 |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `script-src`        | `'self'` (a ponte), `https://vlibras.gov.br` e `https://cdn.jsdelivr.net/gh/spbgovbr-vlibras/` (destino do 302; só o host conta no redirecionamento). |
| `connect-src`       | `https://vlibras.gov.br`, `https://traducao2.vlibras.gov.br`, `https://dicionario2.vlibras.gov.br`, `https://repositorio.vlibras.gov.br`.             |
| `frame-src`         | `https://vlibras.gov.br` (o avatar Unity).                                                                                                            |
| `font-src`          | `'self'`, `data:`, `https://vlibras.gov.br` e o mesmo caminho do jsdelivr (Rawline, pelo redirecionamento).                                           |
| `img-src`           | `https:`, `data:`, `blob:` (a ponte; o app já é `https:`).                                                                                            |
| `media-src`         | `'self'`, `blob:`, `data:` (não vimos mídia).                                                                                                         |
| nunca               | `us.i.posthog.com`, `us-assets.i.posthog.com`, `cdn.jsdelivr.net` inteiro, `unsafe-eval`, `*`.                                                        |

## Consequência para o deploy (COEP)

O app roda isolado (COOP + COEP `credentialless` + DIP) para ter threads no WASM. O avatar do VLibras é um iframe de outra
origem que não manda COEP, e sob COEP o navegador o bloqueia (`ERR_BLOCKED_BY_RESPONSE`, visto também com a ponte no
meio). `VLIBRAS_ATIVO=1` troca o modo `completo` por `dip` (sem COEP) no Express (`server/http/isolamento.ts`) e no
`dist/_headers`. Custo: o Firefox perde o isolamento e as threads dos modelos locais; Chromium mantém pelo DIP; Safari
já não isolava. O script da ponte sai com `Cross-Origin-Resource-Policy: cross-origin` no Express (origem opaca conta
como outra origem). A regra `!` do `_headers` (tirar a CSP herdada na ponte) não foi provada no Workers Static Assets:
conferir com `curl -I` (ver `docs/runbooks/vlibras-piloto.md`).

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
