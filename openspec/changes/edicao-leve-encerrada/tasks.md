> **Entregue.** A pergunta 4 foi respondida pelo dono em 07/09: encerrar a edição leve e manter o
> modo sem conta. O que estava em jogo, e o porquê da decisão, estão em `design.md`.

## 1. O ranking sai do Cloudflare ANTES de a leve sair

- [x] 1.1 Tabela `rank` (migração 0027) sem `user_id`, sem `deleted_at` e sem `updated_at`: o placar é público e não tem dono, então ele fica fora de `TABELAS_DO_TITULAR` — e a conferência de cobertura da exclusão de conta só cobra tabelas com `user_id`.
- [x] 1.2 `server/db/repositories/rank.ts` e `server/routes/rank.ts`, montada ANTES do `authMiddleware` (como o health e o webhook): exigir token quebraria o ranking justamente no modo sem conta, para o qual ele foi feito. Ganha `writeLimiter` no modo público pela mesma razão do webhook — estando antes do auth, ficaria sem teto.
- [x] 1.3 O `ip` em claro que o D1 guardava virou `ip_hash` (SHA-256 com uma chave derivada do servidor, sal próprio). A trava de um envio por minuto é a mesma; o identificador de rede não fica. Um endereço guardado sem prazo e sem caminho de exclusão é dado pessoal dentro de uma tabela que se apresenta como anônima.
- [x] 1.4 A lista de jogos vem de `MINIGAME_IDS`, do core. A versão Cloudflare tinha um `Set` com os nove nomes escrito à mão, que envelheceria em silêncio: um jogo novo levaria 404 sem ninguém entender por quê.
- [x] 1.5 `tests/integration/ranking-no-servidor.test.ts`: ordena por pontos com desempate pelo mais antigo, uma linha por apelido, `manteve` quando a partida foi pior, tetos, 429 por origem, e a prova de que não existe coluna de endereço.
- [x] 1.6 O CLIENTE não mudou uma linha de chamada: `src/lib/ranking.ts` fala com as mesmas URLs. Só os textos mudaram — "vive na versão publicada" apontava para uma versão que nunca existiria.

## 2. A edição leve sai

- [x] 2.1 `EDICAO_LEVE` e `src/lib/edicao.ts` removidos; os 47 ramos em 12 arquivos passam ao comportamento da edição completa.
- [x] 2.2 `OnboardingLeve` removida: a onboarding completa passou a perguntar os dois idiomas na porta (mudança `idioma-alvo-e-ui-respeitados`), que era a única coisa que a leve fazia melhor.
- [x] 2.3 `TranscricaoLeve` removida: era um SEGUNDO controle para `ui.sttQuality`, que já tem seletor na tela de Captura — presente nas duas edições. Nada se perde.
- [x] 2.4 Infra do Cloudflare removida: `wrangler.toml`, `functions/`, `.env.leve`, `deploy-pages.yml`, `build:leve`. O deploy nunca foi armado (sem os dois secrets) e nunca foi disparado.
- [x] 2.5 A segunda lista de itens do menu (`LEVE`) saiu. O gate de conta por tela já responde, por tela e em tempo de execução, a pergunta que ela respondia em bloco e em tempo de build.
- [x] 2.6 `tests/edicao-leve.test.tsx` e o caso "na edição leve não há o que vender" removidos, com o porquê escrito no lugar deles.
- [x] 2.7 A prosa que restou sobre "edição leve" foi corrigida em oito arquivos. Comentário que descreve um comportamento que não existe mais é pior que comentário nenhum.

## 3. `vite.config.ts` tratar `mode === 'leve'`

- [x] 3.1 **Fechada por remoção, e é o resultado certo.** A tarefa 5.2 de `modo-anonimo-em-paridade` existia porque o build leve funcionava por convenção (`.env.leve`) sem o `vite.config.ts` saber do modo. Sem build leve, não há modo a tratar.
