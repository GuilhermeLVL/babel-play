# Babel Play

App web para aprender idioma com o que a pessoa já assiste e conversa: transcrição e tradução ao vivo de
áudio (rodando no navegador quando possível) viram jogos de vocabulário e repetição espaçada. Atende
menores de idade (retenção zero, ECA Digital/LGPD). Front React + Vite, servidor Express, Postgres (PGlite em dev/testes, `pg` em produção).

## Mapa de camadas

- `src/core/`: lógica pura, sem React, sem rede, sem DOM. Não importa de `src/gateway`, `src/components`
  nem `src/lib` (regra de ESLint). Cotas e planos: `src/core/planos.ts`.
- `src/gateway/`: adaptadores (motores locais, provedores, perfis de capacidade) que implementam o core.
- `src/components/`: telas e peças de UI. `src/styles/`: CSS. `src/hooks/`: hooks compartilhados.
- `src/lib/`: utilitários de app (áudio, dispositivo, polimento, captura, auth). Pode usar core e gateway.
- `src/data/`: acesso a dados e clientes das rotas da API (`src/data/rotas/`), trilha de conteúdo.
- `server/`: Express (`routes/`, `ai/` com proxies e núcleo de IA, `db/` com migrações Drizzle em `migrations-pg/`, `lib/`).
  `server/lib/config.ts` lista as variáveis de ambiente; `.env.production.example` é o modelo de produção.
  `server/boot/`: passos do boot que o `server.ts` orquestra (validar, preparar, jobs) e o portão do Worker; nenhum módulo lê env ou disco ao ser importado.
- `worker.ts`: ponto de entrada do Cloudflare Worker (o par do `server.ts`): `/api/*` pelo mesmo Express, resto pelos assets, cron.
  `wrangler.jsonc` configura o Worker; o `wrangler.toml` é o projeto Pages da edição estática, então SEMPRE `-c wrangler.jsonc`.
- `tests/` (vitest e e2e Playwright), `scripts/` (operação, perf, i18n), `ops/` (provedores, alertas), `docs/`, `openspec/`.

## Comandos

- `npm run dev`: servidor + Vite (`tsx server.ts`). `npm run dev:local`: sobe sem login (`scripts/subir-dev.mjs`).
- `npm run typecheck`: `tsc --noEmit`.
- `npm run lint`: ESLint com `--max-warnings 0` (também ordena imports; use `npx eslint --fix`).
- `npm test`: `vitest run` (um arquivo: `npx vitest run tests/<arquivo>`).
- `npm run build`: Vite + bundle do servidor. `npx knip`: exports e arquivos sem uso.
- `npm run worker:dev`: o app no `wrangler dev` local. `npm run worker:build`: bundle do Worker + tamanho.
  `npm run fumaca:worker` (ou `WRANGLER_FUMACA=1`): fumaça do Worker com Postgres em Docker. Ver `docs/deploy.md`.
- `npm run limpar`: encerra processos órfãos deixados por testes (hook `SessionEnd`; skill `/limpar-processos`).
- Gerenciador: npm (`package-lock.json`).

## Convenções

- Textos de UI, comentários e docs em português do Brasil; identificadores novos seguem o padrão da pasta.
- Mudança de comportamento em sistema existente: OpenSpec (`/opsx:propose`), specs em `openspec/`.
- Hooks husky: `pre-commit` roda `lint-staged`. Typecheck, testes e portões de i18n ficam na CI.
- IA: provedores declarados em `ops/ia-provedores*.json` (ou `IA_PROVEDORES`), registro em
  `server/ai/registroDeProvedores.ts`. Gemini é PROIBIDO (termos vedam uso por menores). Cotas e planos
  só em `src/core/planos.ts`. Antes de mexer em modelo, custo ou plano, leia `docs/alternativas-de-custo-e-eficiencia.md`.
- Segredos só em `.env`/secrets do host, nunca versionados.

## Armadilhas conhecidas

- `ui.captureSourceLang` (idioma da pessoa) também define o idioma da interface enquanto `ui.uiLang` não
  foi escolhido (`src/lib/langConfig.ts`): trocar um muda o outro.
- No Worker, trabalho depois da resposta (o `finally` que estorna, envio de telemetria) tem de passar por
  `emSegundoPlano` ou pelo executor da requisição (`capturarAssincrono` já registra o handler): promessa solta
  morre, e o `Client` fecha. E nenhuma promessa criada numa requisição pode ser esperada por outra.
- Os testes ignoram o `.env` (`tests/setup-db-isolada.ts` aponta o dotenv para um arquivo inexistente e
  usa banco isolado): variável nova precisa ser definida no próprio teste.
- `data/pg/` é o banco de dev (PGlite); os testes usam `pglite://memory`. PGlite aceita um processo por
  diretório. Testes de concorrência/multiprocesso só rodam com `TESTE_POSTGRES_URL` (Postgres real).
- `pglite:<dir>` é de um processo só: `db.ts` grava `<dir>/.babel-lock` e recusa um segundo processo vivo
  (trava de pid morto é sobrescrita). Script que abre o diretório com `new PGlite()` direto não passa pela trava.
- `git pull --rebase` antes de `git push`: há mais de uma frente de trabalho na `main`.
- `docs/prototipos/*-src/`, `docs/prototipos/_comum/` e `public/` ficam fora do lint.
