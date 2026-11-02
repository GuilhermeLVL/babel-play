# Leitor: como testar tradução, explicar e parceiro de leitura

Spec: `docs/specs/2026-10-28-leitor-ia-visivel.md`. Este guia é para o dono ver e usar tudo, no seu computador e no
staging.

## O que existe, em uma tabela

| Ferramenta                    | Onde fica                                                                                                 | Roda onde                                                 | Custo              |
| ----------------------------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ------------------ |
| Traduzir um trecho            | Selecione texto, botão "Traduzir"                                                                         | aparelho (`gateway`)                                      | sem cobrança extra |
| Traduzir este capítulo        | Botão "IA" no topo, "Traduzir este capítulo", "Traduzir tudo"                                             | aparelho (nuvem só se ele não der conta e você autorizou) | sem cobrança extra |
| Explicar o trecho             | Selecione texto, botão "Explicar" (flag `ia_de_estudo`)                                                   | nuvem (`/api/ai/explicar`)                                | ver abaixo         |
| Parceiro de leitura (6 modos) | Botão "IA" no topo, "Parceiro de leitura"; ou "Perguntar" na barra do trecho (flag `parceiro_de_leitura`) | nuvem (`/api/ai/leitura/parceiro`)                        | ver abaixo         |

As quatro aparecem SEMPRE no painel "IA". Se uma não dá para usar, o painel diz o motivo: "Em breve" (flag desligada),
"Entre na sua conta", "Faz parte dos planos pagos", "Fica disponível quando um responsável liberar a sua conta",
"Você usou as de hoje; volta amanhã" ou "Precisa de internet". Na barra do trecho, Explicar e Perguntar ficam
visíveis mesmo assim; tocar neles mostra a razão.

## No seu computador (sem login)

1. No repositório: `npm run dev:local` (porta 3100; `PORT=3120 npm run dev:local` para outra). Deixe o terminal aberto.
   O comando liga sozinho as flags `ia_de_estudo` e `parceiro_de_leitura` só nesta execução (variável
   `FLAGS_LIGADAS_NO_DEV`, em `scripts/subir-dev.mjs`). Em produção e no staging essa variável não faz nada
   (exige `AUTH_REQUIRED=0` e `NODE_ENV` diferente de `production`; teste em `tests/flags-ligadas-no-dev.test.ts`).
   Para subir SEM ligá-las: `FLAGS_LIGADAS_NO_DEV= npm run dev:local`.
2. Chaves de IA no `.env` (nunca no git): `OPENROUTER_API_KEY` e `IA_PROVEDORES_ARQUIVO=ops/ia-provedores.openrouter.json`.
   Esse arquivo declara o OpenRouter com `retencao: "zdr"` (retenção zero), exigida para explicar e parceiro.
   Sem chave, ou sem provedor com retenção zero, a rota responde "indisponível" e a tela mostra "Não deu para
   responder agora"; a retenção zero NÃO é contornada em lugar nenhum (nem em dev, nem para menores).
3. Para ler um livro que abre direto da fonte, abra `http://localhost:3100/livros`, escolha um da Standard Ebooks
   (por exemplo "Alice's Adventures in Wonderland") ou da Wikisource e toque em "Começar a ler". Os do Gutenberg abrem
   de `https://livros.frasy.com.br` quando `VITE_LIVROS_URL=https://livros.frasy.com.br` está no ambiente do `dev:local`.
4. O que clicar:
   - **"IA"** (topo, ao lado de "Ouvir"): abre a lista das quatro ferramentas.
   - **Traduzir este capítulo**: "Abrir", "Traduzir tudo". Na PRIMEIRA vez o tradutor do aparelho baixa um modelo
     (aparece "Preparando o tradutor do aparelho", pode levar até um minuto). Depois mostra original e tradução lado a
     lado, com barra de progresso e "Parar". "Traduzir este parágrafo" traduz só um. O livro não é alterado. Se o livro
     já está no seu idioma, o painel avisa em vez de repetir o texto.
   - **Parceiro de leitura**: selecione um trecho, toque em "Perguntar" na barra (ou abra pelo painel). Escolha o modo
     (Explicar, Analogia, Perguntar, Curiosidade, Para discutir, O que observar). "Perguntar" tem um campo de pergunta.
     Na primeira vez pede "Autorizar IA de nuvem". A resposta vem com citações do texto e o aviso "Gerado por IA";
     "Guardar o trecho como cartão" leva o trecho ao deck.
   - **Explicar**: selecione um trecho, toque em "Explicar", depois em "Explicar esta frase".
5. No `dev:local` o plano é `selfhost` (sem teto: `parceiroDia: null` em `src/core/planos.ts`), então nenhuma cota
   recusa. Para ver as mensagens de "indisponível", suba com `FLAGS_LIGADAS_NO_DEV=` (vazio): o painel mostra "Em
   breve".

## Quanto custa cada chamada (estimativa, não medida)

Preços de tabela em `ops/ia-provedores.openrouter.json` (entrada/saída por milhão de tokens): explicação usa
`deepseek-v4.1-flash` (US$ 0,15 / 0,65); o parceiro cai nos modelos de tutor (`llama-3.3-70b`: US$ 0,10 / 0,32).
Um pedido do parceiro manda até 8.000 caracteres (cerca de 2.500 tokens) e recebe até 900: em torno de US$ 0,0005 a
0,001 (menos de R$ 0,01). Uma explicação de frase é menor: cerca de US$ 0,0003. Respostas do cache compartilhado do
livro de domínio público saem de graça. Os tetos de custo do projeto (`AI_BUDGET_USD_DAY`/`MONTH`, `npm run ia:custo`)
valem do mesmo jeito. Contexto: `docs/alternativas-de-custo-e-eficiencia.md`.

## No staging (`frasy-staging.guigui-cruzeiro.workers.dev`)

Hoje o banco `frasy_staging` NÃO tem a migração PG 0014 (o cache do parceiro e a flag `parceiro_de_leitura`):
sem ela a flag nem existe, então a rota responde 404 e o painel mostra "Em breve". A `ia_de_estudo` (0009) já está
ligada lá. Para aplicar sem fazer nada à mão:

1. Faça o merge desta branch na `main` e rode o workflow manual **deploy-worker** (Actions → deploy-worker → Run
   workflow, `ambiente: staging`). O passo 3 dele roda `npm run db:migrate` contra o `frasy_staging`, que aplica a 0014
   e semeia a flag **desligada**.
2. Ligue a flag no staging (ato do dono): `node dist-server/operacao.cjs flags ligar parceiro_de_leitura` com o
   `DATABASE_URL` do staging (ver `docs/flags.md`; sem regra de plano: quem pode é o plano).
3. No staging há login: o Grátis e o convidado recebem "Faz parte dos planos pagos" no parceiro (o Grátis explica com a
   amostra de 5 por dia). Para ver o parceiro funcionando use uma conta de plano pago ou o teste de 14 dias.

Nada disso foi executado por este trabalho.
