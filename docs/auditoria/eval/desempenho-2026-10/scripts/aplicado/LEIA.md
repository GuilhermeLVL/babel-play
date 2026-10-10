# Medidas de antes × depois dos consertos de lógica e dados (10/10/2026)

Os scripts desta pasta medem o build de PRODUÇÃO local, servido pelo próprio servidor do app, com uma
conta semeada (3.000 cartões, 5 sessões, 500 falas, 5.000 revisões e 5.000 exercícios:
`scripts/perf/suite/preparar.mjs`). O método é o da auditoria (`../lib.mjs`, `../traco.mjs`,
`../tracoNav.mjs`, `../capturar.mjs`): Playwright dirigindo o `chrome-headless-shell` por CDP, CPU
limitada, trace sem laço de quadros do medidor. `lib.mjs` e `traco.mjs` daqui são cópias com duas
mudanças: o endereço vem de `URL0` e o navegador espera a vez (um por máquina).

| Arquivo | O que faz |
|---|---|
| `construir.sh` | Build a partir de uma ÁRVORE ISOLADA (o commit de antes exportado com `git archive`, com ou sem os arquivos do conserto por cima). É o que separa o efeito deste conserto do de outro trabalho em curso na mesma árvore. |
| `ambiente.mjs` | Sobe `server.cjs` em modo produção, numa porta 43xx, com o banco restaurado do modelo a cada subida (antes e depois partem do mesmo estado). |
| `aquecer.mjs` | Primeira abertura da conta semeada: credita as conquistas, fecha as comemorações e guarda banco e `localStorage` como modelo ("quem já usa o app"). |
| `jogar.mjs` | Entrar no Jogar, abrir a Memória, último par (fim da rodada), do fim ao saguão, sair da rodada. Trace por passo. |
| `perfil.mjs` | Perfil de CPU por nome de função, num build sem minificar. |
| `passadas.mjs` | Quantas vezes a triagem, a composição e o gate rodam por passo (`lib/passadasDoPipeline`). |
| `captura.mjs` | 200 falas simuladas (`window.__simFalas`): custo por fala, nós do DOM, script, estilo e layout. |
| `capturaTraco.mjs` | Trace de 20 falas sobre N já na tela; aceita apagar regras de CSS por expressão (experimento do `:has()`) e agrupar as falas em blocos à mão. |
| `pedidos.mjs` | Pedidos a `/api` e bytes ao abrir o app, ao abrir Cartões e ao abrir Palavras. |
| `gravando.mjs` | A faixa de baixo da captura gravando em 360, 375, 390 e 412 px, no app e no protótipo. |
| `servidorE2e.mjs` | O mesmo servidor com banco vazio, para as suítes e2e (`BASE_URL`). |
| `campanha.sh` | A campanha inteira: antes e depois alternados, nos três perfis. |

Os caminhos dentro dos scripts são os da máquina em que a medida foi feita (pasta de rascunho da
sessão e `%TEMP%\e2e-babel`). O `server.cjs` de cada build fica em `node_modules/.cache/perf-cli/`:
empacotado com `--packages=external`, ele precisa achar as dependências do repositório, e fora dele o
Node acha primeiro um `node_modules` mais acima no disco.

Resultados: `../../dados/aplicado/` e a seção "Aplicado em 10/10: lógica e dados" de
`docs/auditoria/2026-10-10-desempenho-da-interface.md`.
