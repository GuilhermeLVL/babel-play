## ADDED Requirements

### Requirement: Falhas de preparo aparecem em pt-BR com a ação certa

Em produção, a tela MUST NOT mostrar texto técnico de falha ("Failed to fetch", "Worker error", "protobuf",
"ERROR_CODE", "Can't create a session", "npm install") nem prefixos técnicos ("Erro na captura do sistema:"). Cada falha de
preparo SHALL aparecer como texto em pt-BR (traduzido pelo `t()`) com uma ação ("Baixar de novo", "Tentar de novo",
"Recarregar", "Escolher de novo"). A instrução de "npm install" PODE aparecer só em dev e no self-host.

#### Scenario: Varredura dos cenários da auditoria (DISP-03)

- **WHEN** os cenários `download-cortado-amplo`, `download-cortado-hf-abort`, `download-cortado-hf-trunc`, `offline`,
  `envenenado-2-reaberto` e `tela-negada` de `disponibilidade/cenario.mjs` rodam contra o staging
- **THEN** o texto visível capturado em cada fase tem 0 ocorrências de
  `/Failed to fetch|Worker error|protobuf|ERROR_CODE|Can't create|npm install|Erro na captura do sistema/`

#### Scenario: Mapa completo

- **WHEN** o teste de unidade passa ao classificador cada classe de erro conhecida (`TypeError` de fetch, sessão ONNX,
  worker, VAD, `NotAllowedError`) e um erro desconhecido
- **THEN** cada uma recebe texto em pt-BR e uma ação, e o desconhecido recebe a mensagem genérica

### Requirement: O erro não some sem rastro

A falha que impediu a captura de começar SHALL ficar num aviso persistente junto ao botão Iniciar até a próxima tentativa,
com um toast só.

#### Scenario: Compartilhamento negado (DISP-04)

- **WHEN** `getDisplayMedia` é rejeitado e a tela é vista em +1,5 s, +5 s e +30 s
- **THEN** em +30 s o aviso com a ação ainda está junto ao Iniciar
- **AND** apareceu 1 toast, não 2

### Requirement: As falhas do visitante são contadas sem conteúdo

Se o dono aprovar o contador, o app SHALL enviar, para cada tipo de falha de preparo, no máximo um evento por página com
apenas `tipo`, `aparelho` e `modelo`, de listas fechadas, sem identificador de pessoa, pathname, texto ou IP gravado. O
servidor MUST rejeitar qualquer outro campo e SHALL expor a contagem agregada por tipo.

#### Scenario: Visitante sem conta com modelo corrompido

- **WHEN** um visitante sem conta passa pela cura do cache (requisito de `modelos-locais-confiaveis`)
- **THEN** o servidor recebe 1 evento `{tipo: 'modelo-corrompido', aparelho, modelo}`
- **AND** a métrica `cliente_falha_total{tipo="modelo-corrompido"}` sobe 1

#### Scenario: Campo extra

- **WHEN** o corpo do evento traz um campo fora da lista (por exemplo `texto`)
- **THEN** o servidor responde 400 e não conta

### Requirement: O console de produção não tem erro de CSP do próprio app

Abrir `/` e `/app` em produção MUST NOT gerar violação de CSP no console por script injetado pela própria zona.

#### Scenario: Lighthouse

- **WHEN** o Lighthouse roda em `https://frasy.com.br/` e `/app` (mobile e desktop)
- **THEN** `consoleErros` não traz `static.cloudflareinsights.com` (a auditoria trouxe nas quatro corridas,
  `linha-de-base/lighthouse-detalhe.json`)
