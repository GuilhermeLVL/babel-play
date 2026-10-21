# Fase 5 — verificação, aposentadoria do Fly e portão G1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fechar a migração para a Cloudflare: CI verde, scrypt frio resolvido, Fly/Litestream fora do repositório, backup e restauração do Postgres provados, carga medida contra o staging, relatório do portão G1 e merge da `cloudflare/migracao` na `main`.

**Architecture:** Nada de novo em runtime além de um KDF rápido para a chave de segredos. O resto é verificação (ensaios, drill, k6), remoção do mundo Fly (arquivos, jobs de CI, código morto, docs) e o relatório de aceite contra os critérios da spec. O staging (`https://frasy-staging.guigui-cruzeiro.workers.dev`) é o ambiente de prova; a produção continua dependendo do dono (zona, Workers Paid, Environment `production`).

**Tech Stack:** Node 22 + npm, TypeScript, vitest, Playwright, Cloudflare Workers (`wrangler -c wrangler.jsonc`), Postgres 17 (Docker/OrbStack e Supabase), k6 em container (`grafana/k6`), GitHub Actions, `gh`.

**Spec:** `docs/specs/2026-10-19-migracao-cloudflare.md` (seção "Plano de entrega", linha "5"; "Critérios de aceite"). Contexto da Fase 4 e do staging: `docs/auditoria/2026-10-19-spikes-cloudflare.md` ("Pendências para as Fases 3–5", "Depende do dono") e `docs/auditoria/2026-10-20-fase4-staging.md` (medições R9 e dívidas).

## Rulings de partida (o controlador decidiu; a spec foi escrita antes destes fatos)

- **R15 — Fly nunca foi implantado.** `https://babel-play.fly.dev/api/health` não responde (curl `000`); `docs/ESTADO-DO-LANCAMENTO.md` registra "o deploy no Fly (nunca feito)". Logo: (a) "k6 Fly × Cloudflare" vira **k6 contra o staging** comparado ao baseline do Node medido em `docs/slo.md`/`scripts/perf/suite/slo.json` (classes `leitura` p95 300 ms, `gravacao` p95 800 ms) e ao critério da spec (p50 ≤ 130 ms, p95 ≤ 250 ms do Brasil); (b) "Fly 14 dias como retorno" e "congelar escritas no Fly" não se aplicam: o corte é o **primeiro deploy de produção**, que depende do dono; (c) o ensaio de migração de dados roda sobre a **cópia local** `data/babel.db` (o banco de dev anterior à Fase 1, 2,4 MB), não sobre um banco de produção.
- **R16 — PITR é add-on pago do Supabase.** O drill que está nas nossas mãos é `pg_dump` → R2 → `pg_restore` em banco vazio com contagens iguais. O PITR fica em "Depende do dono" no relatório.
- **R17 — Docker fica para o self-host**, sem Litestream: `Dockerfile` enxuto (sem o estágio Go, sem `iniciar-container.sh`, entrypoint `node dist-server/server.cjs`), `docker-compose.yml` com o `postgres:17` que já tem. Os jobs `imagem-construir`/`imagem` do CI continuam (provam a imagem do self-host); `restauracao-litestream` sai.
- **R18 — KDF explícito por formato, sem variável nova.** `SECRET_KEY=hkdf:<64 hex>` deriva por HKDF-SHA256 (0,1 ms); qualquer outro valor segue no scrypt (20 ms em Node, 90–160 ms de CPU no Worker). Quem roda self-host não muda nada; staging/produção adotam o prefixo. Valor `hkdf:` malformado lança (nunca cai no scrypt em silêncio).
- **R19 — merge na `main` por fast-forward** (`git log cloudflare/migracao..main` está vazio) é o último passo, feito pelo controlador depois da revisão final e do relatório G1. Nenhum workflow da `main` faz deploy no push; a produção só sobe por `deploy-worker.yml` com `ambiente=production`, que exige o Environment do dono.

## Global Constraints

- Nunca gravar chaves, tokens ou senhas em arquivos versionados; `.secrets.*.json`, `.env`, `.dev.vars` são ignorados pelo git. Nunca imprimir tokens (um JWT de usuário descartável vai para arquivo 600 fora do repositório, nunca para o stdout).
- Nunca desligar verificação TLS (`sslmode=verify-full` com a CA `data/supabase-ca.crt`).
- Não enfraquecer testes: nenhum `expect` removido, nenhum `skip` novo, nenhum teste apagado sem substituto, salvo os que provam infraestrutura que deixa de existir (Litestream/snapshot SQLite), listados na Task 4.
- Gemini é PROIBIDO. Cotas e planos só em `src/core/planos.ts` (nada muda aqui).
- Textos de UI, comentários e docs em português do Brasil. Commits em inglês ou português, com `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Sempre `-c wrangler.jsonc`. Deploy do staging só pelo workflow: `gh workflow run deploy-worker.yml -R GuilhermeLVL/babel-play --ref cloudflare/migracao -f ambiente=staging -f ref=cloudflare/migracao` (R13: deploy manual de casa é inviável). Secrets do staging só por `npx tsx scripts/cloudflare/secrets.ts staging`.
- Os testes ignoram o `.env`; variável nova se define no próprio teste. PGlite é um processo por diretório.
- `npm run lint` com `--max-warnings 0` e `npx eslint --fix` para ordem de imports; `prettier` roda no `pre-commit`.
- Nada toca a `main` antes da Task 9 (exceção já registrada: R14, só `deploy-worker.yml`).
- Nada na `scripts/custo/modelo.mjs` (modelo de custo com números do Fly): fica como dívida no relatório, fora do escopo.

## Review Focus

1. `SECRET_KEY=hkdf:` com hex curto, ímpar ou não hex → deve lançar com mensagem clara, nunca derivar por scrypt. Teste na Task 1.
2. k6 com um único usuário contra o staging: o limitador de escrita por usuário devolve 429 e a latência medida vira a do limitador. Teste/garantia na Task 8 (N usuários, VU escolhe token por `__VU % N`, contador `erros_429` separado).
3. Drill de restauração apontado por engano para um banco com dados: tem de recusar antes do `pg_restore`. Teste na Task 6.
4. Imagem Docker sem Litestream com `DATABASE_URL` do Postgres: `/api/ready` 200 e `docker stop` sai 0. O job `imagem` do CI prova (Task 3).
5. `entrar()` do e2e público numa conta que já declarou a idade: o `PUT /api/me/idade` responde `nascimento_ja_informado` e o teste tem de seguir. Task 2.

---

### Task 1: KDF rápido para a chave de segredos (`SECRET_KEY=hkdf:<64 hex>`)

**Files:**

- Modify: `server/crypto.ts:80-103` (`obterChave`, `obterChaveDeHash`; cabeçalho do arquivo)
- Modify: `server/lib/config.ts:845-850` (texto de `paraQue` de `SECRET_KEY`)
- Modify: `docs/deploy.md:48-52` ("Gerar a SECRET_KEY") e `docs/deploy.md:227` (bloco do Worker)
- Modify: `.secrets.staging.json` (gitignored; só o valor de `SECRET_KEY`)
- Test: `tests/crypto-kdf.test.ts` (novo)

**Interfaces:**

- Produces: `obterChave(): Buffer` e `obterChaveDeHash(): string` com o mesmo contrato de hoje; nova função pura exportada `derivarChave(raw: string, info: 'babel-play-web:secrets' | 'babel-play-web:hash'): Buffer` em `server/crypto.ts` (é ela que as duas memoizadas chamam).

- [ ] **Step 1: Escrever o teste que falha**

```ts
// tests/crypto-kdf.test.ts
import { hkdfSync, scryptSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { derivarChave } from '../server/crypto';

const HEX = 'ab'.repeat(32);

describe('derivarChave', () => {
  it('hkdf:<64 hex> deriva por HKDF-SHA256 com o info como sal de uso', () => {
    const esperada = Buffer.from(
      hkdfSync('sha256', Buffer.from(HEX, 'hex'), '', 'babel-play-web:secrets', 32),
    );
    expect(derivarChave(`hkdf:${HEX}`, 'babel-play-web:secrets').equals(esperada)).toBe(true);
  });
  it('infos diferentes dão chaves diferentes (cifra ≠ hash)', () => {
    expect(
      derivarChave(`hkdf:${HEX}`, 'babel-play-web:secrets').equals(
        derivarChave(`hkdf:${HEX}`, 'babel-play-web:hash'),
      ),
    ).toBe(false);
  });
  it('sem o prefixo continua no scrypt (compatível com quem já cifrou)', () => {
    expect(
      derivarChave('frase-antiga', 'babel-play-web:secrets').equals(
        scryptSync('frase-antiga', 'babel-play-web:secrets', 32),
      ),
    ).toBe(true);
  });
  it.each(['hkdf:', 'hkdf:abc', `hkdf:${'zz'.repeat(32)}`, `hkdf:${HEX}0`])(
    'hkdf malformado lança (%s)',
    (raw) => {
      expect(() => derivarChave(raw, 'babel-play-web:secrets')).toThrow(/hkdf/);
    },
  );
  it('HKDF custa menos de 5 ms', () => {
    const t = performance.now();
    derivarChave(`hkdf:${HEX}`, 'babel-play-web:secrets');
    expect(performance.now() - t).toBeLessThan(5);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/crypto-kdf.test.ts`
Expected: FAIL — `derivarChave` não é exportada.

- [ ] **Step 3: Implementar `derivarChave` em `server/crypto.ts`**

`export function derivarChave(raw: string, info: 'babel-play-web:secrets' | 'babel-play-web:hash'): Buffer`. Se `raw` começa com `hkdf:`: o resto tem de casar `/^[0-9a-f]{64}$/i`, senão `throw new Error('SECRET_KEY com prefixo hkdf: precisa de 64 caracteres hexadecimais (openssl rand -hex 32)')`; devolve `Buffer.from(hkdfSync('sha256', Buffer.from(hex, 'hex'), '', info, 32))`. Caso contrário `scryptSync(raw, info, 32)`. `obterChave` e `obterChaveDeHash` passam a chamar `derivarChave(resolveRawKey(), …)`. Atualizar o comentário "PREGUIÇOSA" com a razão (90–160 ms de CPU por isolate no Worker, medido na Fase 4).

- [ ] **Step 4: Rodar os testes**

Run: `npx vitest run tests/crypto-kdf.test.ts tests/integration/audit-s11-crypto-migration.test.ts`
Expected: PASS nos dois.

- [ ] **Step 5: Documentar** — `server/lib/config.ts` (`paraQue` de `SECRET_KEY`: "… no Worker use `hkdf:` + 64 hex: dispensa o scrypt de 90–160 ms por isolate") e `docs/deploy.md` ("Gerar a SECRET_KEY": `echo "hkdf:$(openssl rand -hex 32)"` recomendado para o Worker; trocar a chave invalida os segredos cifrados na tabela `secrets`).

- [ ] **Step 6: Trocar a chave do staging** — no `.secrets.staging.json` (fora do git) colocar `SECRET_KEY` = `hkdf:` + `openssl rand -hex 32`; `npx tsx scripts/cloudflare/secrets.ts staging`. O staging não tem linha cifrada na tabela `secrets` (BYOK não usado), então nada se perde; registrar isso no relatório da Task 9.

- [ ] **Step 7: Commit**

```bash
git add server/crypto.ts server/lib/config.ts docs/deploy.md tests/crypto-kdf.test.ts
git commit -m "perf(crypto): SECRET_KEY=hkdf:<64 hex> deriva por HKDF (scrypt frio de 90–160 ms por isolate sai do boot do Worker)"
```

- [ ] **Step 8: Medir depois do deploy** (o deploy do staging acontece na Task 2, Step 9, junto com o resto; a medição fica na Task 9, Step 3).

---

### Task 2: CI verde — portões estáticos e e2e público

Falhas atuais (run 39531511563 do ramo; as marcadas † já falham na `main`): `typecheck:estrito`, `morto:arquivos`, `morto:ciclos`, `i18n:orfas`†, `cobertura dos catálogos`†, `piso de cobertura`† (o passo falha porque o script de órfãs sai 1, o piso em si está ok), `audit:gate`†, `ast-grep locale-cravado`†, `e2e-publico` (nuance, `idade_nao_informada`)†.

**Files:**

- Modify: `tsconfig.estrito.json` (`exclude` ganha `"scripts/spikes"`, igual ao `tsconfig.json`)
- Modify: `server/db/db.ts:88` (spread sobre `unknown[]` → `original.apply(null, args)` ou tipar `Consultar` como `(...args: unknown[])` com `apply`)
- Create: `src/lib/import/mammoth-browser.d.ts` (`declare module 'mammoth/mammoth.browser'` com `extractRawText(input: { arrayBuffer: ArrayBuffer }): Promise<{ value: string; messages: unknown[] }>` — conferir a assinatura usada em `extrairDocumento.ts:40`)
- Modify: `tests/integration/limpeza-transitoria.test.ts:61`, `tests/integration/schema-igual-ao-banco.test.ts:221` (tipos estritos; ver os erros exatos em `npm run typecheck:estrito`)
- Create: `.madgerc` → `{ "detectiveOptions": { "ts": { "skipTypeImports": true }, "tsx": { "skipTypeImports": true } } }` (os 4 ciclos têm um lado `import type`: `db.ts`↔`executor.ts`, `armazenamento.ts`↔`armazenamentoR2.ts`, `armazenamento.ts`↔`tetoDoR2.ts`, `extrairDocumento.ts`↔`pdfjsNoNavegador.ts`)
- Modify: `package.json` (remover devDependency `libsql`, sem uso; `vite` para `^6.4.5` por `npm install vite@^6.4.5` — `audit:gate` acusa HIGH `vite <=6.4.3` com correção); `package-lock.json`
- Modify: `src/i18n/*.json` ou onde moram `en.json`/`xx.json` (remover as 2 órfãs: `"iChat sintonizado com:"` e `"Suas {n} palavras já são cartões."`); regenerar `cobertura.json` com `node scripts/i18n/cobertura.mjs`
- Modify: `src/data/rotas/sessoes.ts:66` (regra `locale-cravado`: `new Intl.RelativeTimeFormat('pt', …)` no `catch` — é fallback quando o idioma da UI é inválido; a regra aceita locale fixo com comentário justificando na linha de cima. Colocar o comentário: `// locale fixo de propósito: fallback quando idiomaDaInterface() não é um locale válido para o Intl`.) Se o `ast-grep` ainda acusar, trocar o fallback por `relativo` sem locale (`new Intl.RelativeTimeFormat(undefined, …)`).
- Modify: `tests/e2e-publico/_nuance.ts:63-80` (`entrar`: depois de obter `authorization`, `await page.request.put('/api/me/idade', { headers: { authorization }, data: { nascimento: '1990-01-01' } })` e aceitar `200` ou corpo com `nascimento_ja_informado`; qualquer outro status lança com o status e o `code`)

**Interfaces:**

- Consumes: nada de tarefas anteriores.
- Produces: CI do ramo com `estatico`, `e2e-publico` verdes (os jobs de imagem ficam para a Task 3).

- [ ] **Step 1: Reproduzir localmente** — `npm run typecheck:estrito; npm run morto:arquivos; npm run morto:ciclos; npm run i18n:orfas; node scripts/i18n/cobertura.mjs --check; npm run audit:gate; ./node_modules/.bin/ast-grep scan -c sgconfig.yml src server server.ts` — todos saem 1 hoje.
- [ ] **Step 2: Aplicar as correções listadas em Files** (uma de cada vez, rodando o portão correspondente).
- [ ] **Step 3: Conferir os portões estáticos** — os mesmos comandos do Step 1 saem 0; `npm run typecheck`, `npm run lint`, `npm run build` seguem 0.
- [ ] **Step 4: Teste do e2e público** — `npx playwright test -c playwright.publico.config.ts tests/e2e-publico/nuance-gratis.e2e.ts tests/e2e-publico/nuance-alternativas.e2e.ts` → PASS (antes: 403 `idade_nao_informada` ao semear).
- [ ] **Step 5: `npm test`** inteiro → PASS (a troca do `vite` toca o build e o vitest).
- [ ] **Step 6: e2e-estatica Bao** — `npx playwright test -c playwright.estatica.config.ts --project=mobile-375 -g "Bao"` duas vezes. Passou nas duas: registrar como instável no CI (falhou só em 1 de 3 execuções). Falhou: `superpowers:systematic-debugging` antes de qualquer `retry`.
- [ ] **Step 7: Commit**

```bash
git add -A tsconfig.estrito.json .madgerc package.json package-lock.json server/db/db.ts src tests
git commit -m "ci: portões estáticos verdes (estrito sem scripts/spikes, ciclos só de tipo, vite 6.4.5, órfãs de i18n, locale do fallback) e idade declarada no e2e público"
```

- [ ] **Step 8: Push e CI** — `git push`; `gh run watch` da execução do ramo: `estatico` e `e2e-publico` verdes. Restantes vermelhos permitidos só os de imagem (Task 3).
- [ ] **Step 9: Deploy do staging** (leva a Task 1 junto): `gh workflow run deploy-worker.yml -R GuilhermeLVL/babel-play --ref cloudflare/migracao -f ambiente=staging -f ref=cloudflare/migracao`; esperar verde; `node scripts/cloudflare/fumaca-remota.mjs https://frasy-staging.guigui-cruzeiro.workers.dev <sha>` ok.

---

### Task 3: Aposentar o Fly — infraestrutura, CI e Dockerfile

**Files:**

- Delete: `fly.toml`, `fly.staging.toml`, `litestream.yml`, `scripts/iniciar-container.sh`, `.github/workflows/deploy.yml`, `.github/workflows/implantar-ambiente.yml`
- Modify: `Dockerfile` (sem o estágio `litestream`; sem `COPY litestream.yml`/`iniciar-container.sh`; sem `ENV DATABASE_URL=file:` e sem volume; `CMD ["node", "dist-server/server.cjs"]`; referência a `server/db/migrations` vira `server/db/migrations-pg`; manter `HEALTHCHECK`, `apt-get upgrade`, remoção do onnxruntime)
- Modify: `.github/workflows/ci.yml` (cabeçalho linhas 19-29 e 708-724; job `imagem`: tirar o passo `litestream version` e o texto "como o Fly sobe"; apagar o job `restauracao-litestream`; o job `imagem` sobe o container com `DATABASE_URL` de um `postgres:17` de serviço — como `postgres-real` já faz — e cobra `/api/ready` 200, API fechada, cabeçalhos, `docker stop` 0, Trivy)
- Modify: `.github/workflows/restauracao-drill.yml` — **apagar aqui**; a versão Postgres nasce na Task 6
- Modify: `docker-compose.yml:46` (comentário do HEALTHCHECK), `.dockerignore` (tirar entradas de litestream/fly se houver)
- Modify: `scripts/validar-workflows.mjs` se listar workflows por nome (conferir com `npm run workflows:validar`)
- Test: `tests/worker/wrangler.test.ts` ou novo `tests/ci-sem-fly.test.ts`: lê `.github/workflows/*.yml`, `Dockerfile`, `package.json` e exige que nenhum contenha `litestream`, `flyctl`, `fly.toml`, `registry.fly.io`, `superfly/`

- [ ] **Step 1: Escrever o teste `tests/ci-sem-fly.test.ts`** (lista de arquivos + `expect(conteudo).not.toMatch(/litestream|flyctl|fly\.toml|registry\.fly\.io|superfly\//i)` por arquivo; também exige que `fly.toml`, `fly.staging.toml`, `litestream.yml`, `scripts/iniciar-container.sh`, `.github/workflows/deploy.yml`, `.github/workflows/implantar-ambiente.yml` não existam).
- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run tests/ci-sem-fly.test.ts` → FAIL.
- [ ] **Step 3: Apagar e reescrever** os arquivos listados em Files.
- [ ] **Step 4: Conferir** — `npx vitest run tests/ci-sem-fly.test.ts` PASS; `npm run workflows:validar` 0; `docker build --build-arg VITE_SUPABASE_URL=https://x.supabase.co --build-arg VITE_SUPABASE_ANON_KEY=x -t frasy:local .` conclui; `docker run --rm -e NODE_ENV=production -e AUTH_REQUIRED=1 -e SECRET_KEY=hkdf:$(openssl rand -hex 32) -e SUPABASE_URL=https://x.supabase.co -e DATABASE_URL=postgres://postgres:teste@host.docker.internal:5433/postgres -p 3000:3000 frasy:local` com o Postgres de teste na 5433 (o de `npm run fumaca:worker`, `docker run -d --name pg-teste -e POSTGRES_PASSWORD=teste -p 5433:5432 postgres:17`) responde `GET /api/ready` 200.
- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore(infra): Fly e Litestream saem do repositório; Dockerfile só para o self-host (Postgres por DATABASE_URL); CI sem restauracao-litestream"
```

- [ ] **Step 6: Push; CI** — `imagem-construir` e `imagem` verdes (ou Trivy vermelho só por vulnerabilidade SEM correção, que a allowlist do job já trata; vulnerabilidade com correção é para corrigir).

---

### Task 4: Aposentar o Fly — código do snapshot SQLite, variáveis legadas e dependências

**Files:**

- Delete: `server/operacao/snapshot.ts`, `tests/integration/snapshot-indisponivel.test.ts`
- Modify: `server/operacao/cli.ts` (remover os comandos `snapshot`, `verificar`, `restaurar-snapshot`; se só sobrar o `--help`, manter o CLI com os comandos que restam e dizer no cabeçalho o que saiu)
- Modify: `server/lib/config.ts:293-315` (remover `BACKUP_DIARIO`, `BACKUP_HEARTBEAT_URL`, `BACKUP_HORA_UTC`; conferir se `BACKUP_S3_BUCKET` ainda tem leitor — `grep -rn BACKUP_S3_BUCKET server scripts` — e remover se não); `server/lib/config.ts:758` (`ORIGEM_SEGREDO`: texto sem "fly.dev"/"sondas do Fly"; variável fica, opcional); `:933` (`TRUST_PROXY`: "Cloudflare → Worker: 1"); `:509`, `:1158`, `:1167`, `:1539` (textos)
- Modify: `server/boot/jobs.ts:17-23` (remover o aviso de `BACKUP_DIARIO`), `server/http/metricas.ts:400-416, 647` (remover as três métricas do snapshot e o comentário), `server/lib/preflightProducao.ts:262-271` (remover o bloco `BACKUP_DIARIO`; `:141-146` texto do Fly)
- Modify: `server/routes/health.ts` e `server/lib/versao.ts`, `server/http/origemProtegida.ts`, `server/http/temposLimite.ts`, `server/http/app.ts`, `server/crypto.ts` (só comentários que citam Fly; `grep -rn -iE "\bfly\b|fly\.io|fly\.dev|litestream" server worker.ts`)
- Modify: `.env.production.example` (reescrever o cabeçalho e as seções: é o modelo do **self-host em Node/Docker com Postgres**; remover `LITESTREAM_*`, `BACKUP_*`, `ORIGEM_SEGREDO` do Fly, 9091; o Worker usa `.secrets.example.json` + `wrangler.jsonc`), `.env.example:28,244,259`
- Modify: `package.json` (`@libsql/client` de `dependencies` para `devDependencies`: só `scripts/migracao`, `scripts/db/fixture-anonimizada.mjs`, `tests/harness/sqliteLegado.ts` usam)
- Modify: testes que citam o que saiu: `tests/preflight-producao.test.ts`, `tests/integration/jobs-idempotentes.test.ts`, `tests/integration/alertas-e-painel.test.ts`, `tests/integration/metricas-fachada.test.ts`, `tests/integration/replica-sem-estado-local.test.ts` (se testa só `secret.key` no volume Fly, apagar; se testa "nenhum estado local" no Worker, manter), `scripts/perf/escala/carga-servidor.mjs`, `scripts/perf/ci-carga.mjs`, `scripts/perf/frontend.mjs`, `scripts/perf/telas/_servidores.mjs`, `scripts/perf/escala/upload-memoria.mjs` (variáveis `BACKUP_DIARIO=0` passadas ao servidor: remover)
- Modify: `ops/alertas/regras.yml` (regras `BabelBackupFalhou`/snapshot: remover ou apontar para `backup-pg-dump.yml`; `tests/integration/alertas-e-painel.test.ts` cobra a coerência com `docs/runbook.md` §13), `ops/dashboards/babel-play.json` (painéis do snapshot)

**Interfaces:**

- Produces: `npx knip` sem `@libsql/client` em `dependencies`; `tests/worker/bundle.test.ts` continua provando que o bundle do Worker não leva libsql.

- [ ] **Step 1: Mapear** — `grep -rn -iE "snapshot|BACKUP_DIARIO|BACKUP_HORA|BACKUP_HEARTBEAT|litestream|\bfly\b|fly\.(io|dev)" server worker.ts scripts ops tests .env*.example --include='*' | grep -v node_modules` e separar: código a remover × comentário a reescrever × teste a ajustar.
- [ ] **Step 2: Testes primeiro** — ajustar/remover os testes listados; `npx vitest run tests/preflight-producao.test.ts tests/integration/jobs-idempotentes.test.ts tests/integration/alertas-e-painel.test.ts tests/integration/metricas-fachada.test.ts` → FAIL nos que esperam o novo estado.
- [ ] **Step 3: Remover o código** e reescrever os textos.
- [ ] **Step 4: Conferir** — `npm run typecheck && npm run lint && npm test && npm run morto:arquivos && npm run worker:build && npx vitest run tests/worker` → 0.
- [ ] **Step 5: Commit** — `git commit -m "chore(servidor): snapshot SQLite, BACKUP_* e textos do Fly saem; @libsql/client só em devDependencies"`.

---

### Task 5: Aposentar o Fly — documentação e ADR 0015

**Files:**

- Create: `docs/adr/0015-cloudflare-workers-no-lugar-do-fly.md` (Contexto: ADR 0006 e 0014; o Fly nunca chegou a receber deploy. Decisão: Workers + Hyperdrive + Supabase SP, deploy por versões, backup `pg_dump` semanal no R2. Alternativas: ficar no Fly; Containers; D1. Consequências: sem disco, sem cluster, crons do Workers Paid, `scripts/cloudflare/`, limites de CPU; o self-host continua por Docker/Node.)
- Modify: `docs/deploy.md` (cabeçalho 1-6; seções "Definidas na imagem", "Checklist antes de expor", "O que fica desativado por design", "Escalar", "Migrar os dados do SQLite para o Postgres" (tirar o parágrafo "Ainda pendentes…"), "Tamanho da imagem", "Verificar a imagem", "Backup em produção (Fase 5): Litestream + snapshot…" → substituir por um parágrafo apontando "Backup semanal do Postgres no R2" e o drill da Task 6, "Mais de uma instancia", "Modo cluster (aposentado)" → remover ou reduzir a uma linha histórica)
- Modify: `docs/runbook.md` (§0.2 restaurar: só Postgres; §0.3 rollback: `wrangler versions deploy`/`deploy-worker.yml`; §0.4, §3, §6, §9, §10, §12, §13.3/13.4/13.5/13.13/13.14; linha 249 "Fly, Supabase e Sentry têm alerta de fatura" → "Cloudflare, Supabase e Sentry")
- Modify: `docs/STAGING.md` (reescrever: o staging é o Worker `frasy-staging`; como publicar, secrets, o que prova; apontar `docs/auditoria/2026-10-20-fase4-staging.md`)
- Modify: `docs/LANCAMENTO.md` (seção 8 "Fly.io — o app no ar" → "Cloudflare Workers — o app no ar": Workers Paid, zona, Environment `production`, `deploy-worker.yml`; seção 9 → "Domínio no Worker e a borda fechada"; "Custo mensal" sem o Fly; 10 e 11 sem `fly logs`/`fly secrets`)
- Modify: `docs/escala.md` (cabeçalho + "A escada": a escada agora é CPU-ms do Worker e Hyperdrive/Supabase; manter o histórico como "medido no Node em set/2026"), `docs/deploy-checklist.md`, `docs/CUSTOS-E-SERVICOS.md` (tabela: Cloudflare Workers Paid US$ 5 no lugar do Fly), `docs/ESTADO-DO-LANCAMENTO.md` (linhas 4, 15, 28, 45, 57, 62), `docs/slo.md:85`, `docs/arquitetura.md:72`, `docs/lgpd/operadores.md` (Fly sai da lista de operadores; Cloudflare já está), `docs/observabilidade-langfuse.md`, `docs/auth/EMAILS-E-PROVEDORES.md`, `docs/README.md`, `README.md:19,116` e os 4 READMEs traduzidos, `CONTRIBUTING.md`, `CHANGELOG.md` (entrada nova "Fase 5")
- Modify: `openspec/specs/banco-migracao-rollback-integridade/spec.md` (vocabulário SQLite → Postgres: `pg_restore --list` e contagens no lugar de `integrity_check`)
- Test: `tests/integration/alertas-e-painel.test.ts` (já cobra runbook §13 × `ops/alertas/regras.yml`); novo `tests/docs-sem-fly.test.ts`: para `docs/**/*.md` fora de `docs/auditoria`, `docs/historico`, `docs/specs`, `docs/superpowers`, `docs/prototipos`, `docs/pesquisa`, `docs/adr` e para `README*.md`, exige zero ocorrências de `/litestream|flyctl|fly\.toml|fly\.dev|\bFly\.io\b/`

- [ ] **Step 1: Teste `tests/docs-sem-fly.test.ts`** → FAIL (dezenas de arquivos).
- [ ] **Step 2: Reescrever** os documentos listados (ADR primeiro; o resto aponta para ele).
- [ ] **Step 3: Conferir** — `npx vitest run tests/docs-sem-fly.test.ts tests/integration/alertas-e-painel.test.ts` PASS; `npx prettier --check docs README*.md` 0.
- [ ] **Step 4: Commit** — `git commit -m "docs: ADR 0015 (Workers no lugar do Fly); deploy, runbook, staging, lançamento, escala e READMEs sem Fly/Litestream"`.

---

### Task 6: Drill de backup e restauração do Postgres

**Files:**

- Create: `scripts/backup/drill-restauracao.mjs` (CLI) e `scripts/backup/compararContagens.ts` (puro)
- Create: `.github/workflows/restauracao-drill.yml` (novo, Postgres)
- Modify: `docs/deploy.md` ("Backup semanal do Postgres no R2": subseção "Exercício de restauração"), `docs/runbook.md` §8 (apontar o script e o workflow; cadência mensal)
- Test: `tests/backup-drill.test.ts` (unitário de `compararContagens`) + ampliar `tests/backup-pg-dump.test.ts` (ou novo `tests/restauracao-drill-workflow.test.ts`) para o YAML novo

**Interfaces:**

- Produces: `compararContagens(origem: Record<string, number>, restaurado: Record<string, number>): { ok: boolean; divergentes: Array<{ tabela: string; origem: number; restaurado: number }>; faltantes: string[] }` em `scripts/backup/compararContagens.ts`.
- CLI: `node scripts/backup/drill-restauracao.mjs --origem <DATABASE_URL ou --dump <arquivo.dump>> --destino <DATABASE_URL vazio> [--manter]`. Sem `--dump`, faz `pg_dump --format=custom --schema=public --schema=drizzle` da origem (usa `montarPgDump` de `scripts/db/comando-pg-dump.mjs`); confere com `pg_restore --list`; **recusa** destino que já tenha qualquer tabela em `public` (Review Focus 3); `pg_restore --no-owner --schema=public --schema=drizzle`; conta `count(*)` de todas as tabelas de `server/db/schema.ts` + `drizzle.__drizzle_migrations` nos dois lados; imprime a tabela Markdown (contagens, não linhas) e sai 1 se `ok=false`; apaga o dump temporário salvo `--manter`.

- [ ] **Step 1: Teste de `compararContagens`** (`tests/backup-drill.test.ts`): iguais → `ok` true; uma tabela a menos no restaurado → `faltantes`; contagem diferente → `divergentes` com os dois números; tabela extra no restaurado não reprova. Run → FAIL.
- [ ] **Step 2: Implementar `compararContagens.ts`** → PASS.
- [ ] **Step 3: Implementar o CLI** `drill-restauracao.mjs` (credenciais só por `PG*` no ambiente do filho, nunca no argv — o padrão de `comando-pg-dump.mjs`).
- [ ] **Step 4: Rodar o drill de verdade** — origem: `DATABASE_URL_MIGRACAO` do staging (`.env`; pooler de sessão, `sslmode=verify-full`, `PGSSLROOTCERT=data/supabase-ca.crt`); destino: `postgres://postgres:teste@localhost:5433/drill` num `postgres:17` em Docker (`createdb drill` antes). Esperado: saída 0, 39 tabelas + `__drizzle_migrations` com contagens iguais. Guardar a tabela impressa (sem dados pessoais: só contagens) para o relatório da Task 9.
- [ ] **Step 5: Workflow `restauracao-drill.yml`** — `workflow_dispatch` (inputs `arquivo` opcional = chave no R2; vazio = o `semanal/*.dump` mais recente; `idade_maxima_dias` = 8), Environment `restauracao` (secrets `R2_S3_ENDPOINT`, `R2_LEITURA_ACCESS_KEY_ID`, `R2_LEITURA_SECRET_ACCESS_KEY`; var `BACKUP_BUCKET` = `frasy-backups`), service `postgres:17`, passos: segredos presentes (reprova nomeando), `aws s3 ls` + `cp` com `--endpoint-url` (aws-cli vem no runner), `node scripts/backup/drill-restauracao.mjs --dump … --destino …` com `--origem` ausente (só restaura e conta; sem origem para comparar, o passo exige `ok` das contagens > 0 e `__drizzle_migrations` ≥ 1), resumo em `GITHUB_STEP_SUMMARY`, nunca artefato, banco apagado no `if: always()`. Cabeçalho: "uma vez por mês; anote em `docs/runbook.md` §8".
- [ ] **Step 6: Teste do YAML** — lê o workflow e exige: `environment: restauracao`, ausência de `upload-artifact`, presença de `if: always()` no passo de limpeza, `services.postgres.image` começando com `postgres:17`. Run → PASS.
- [ ] **Step 7: Docs** (`docs/deploy.md`, `docs/runbook.md` §8) e `npm run workflows:validar` 0.
- [ ] **Step 8: Commit** — `git commit -m "feat(backup): drill de restauração do pg_dump (script com contagens por tabela e workflow mensal contra o R2)"`.

Nota para o relatório: o workflow só roda de verdade quando o dono criar o Environment `restauracao` (chaves S3 só de leitura do R2) e os secrets do `backup-pg-dump.yml`; ambos ficam em "Depende do dono".

---

### Task 7: Ensaio da migração de dados (SQLite legado → Postgres)

Só verificação; código muda apenas se o ensaio achar defeito.

**Files:**

- Read: `scripts/migracao/sqlite-para-postgres.ts`, `scripts/migracao/paridade.ts`, `tests/integration/migracao-sqlite-para-postgres.test.ts`, `docs/deploy.md` "Migrar os dados"
- Create (scratchpad, fora do repo): cópia de `data/babel.db` (`cp data/babel.db data/babel.db-wal <scratch>/`; o `-wal` precisa ir junto)

- [ ] **Step 1: Postgres de destino** — `docker run -d --name pg-ensaio -e POSTGRES_PASSWORD=teste -p 5434:5432 postgres:17`; `DATABASE_URL=postgres://postgres:teste@localhost:5434/postgres npm run db:migrate`.
- [ ] **Step 2: Checagem prévia de frações em colunas INTEGER** (pendência registrada na Fase 2): `sqlite3 <cópia> "SELECT name FROM sqlite_master WHERE type='table'"` e, para cada coluna declarada `INTEGER` no schema legado (`server/db/migrations-sqlite`), `SELECT count(*) FROM <t> WHERE typeof(<c>)='real'`; esperado 0 em todas. Se houver, o script tem de abortar antes de copiar (conferir que aborta; senão é defeito → corrigir com teste).
- [ ] **Step 3: Rodar** — `DATABASE_URL=postgres://postgres:teste@localhost:5434/postgres npx tsx scripts/migracao/sqlite-para-postgres.ts --origem file:<cópia>` → saída 0, relatório `ok: true`, todas as tabelas com contagem e checksum iguais (anotar quantas tabelas e quantas linhas no total).
- [ ] **Step 4: Idempotência** — rodar de novo com `--continuar` → 0 e mesmas contagens.
- [ ] **Step 5: Limpar** — `docker rm -f pg-ensaio`; apagar a cópia.
- [ ] **Step 6: Registrar** o resultado (tabela com nome, linhas, ok) no arquivo `<workspace SDD>/task-7-report.md` para a Task 9. Sem commit se nada mudou no código.

---

### Task 8: Carga k6 contra o staging

**Files:**

- Modify: `scripts/perf/carga.k6.js` (env `TOKENS` — lista separada por vírgula; cada VU usa `TOKENS[__VU % n]` no header `Authorization: Bearer …`; sem `TOKENS` o comportamento atual (self-host) fica igual; env `VUS` (padrão 50) escala os `stages`; `Counter('erros_429')` e tag; cabeçalho explica o uso remoto)
- Create: `scripts/perf/staging-usuarios.mjs` (cria `--n` usuários `carga-<i>@frasy-teste.dev` no Supabase Auth do staging pela admin API, senha aleatória, declara `PUT /api/me/idade` `1990-01-01`, faz login por senha e grava `BASE=…`, `TOKENS=…`, `VUS=…` num arquivo com modo 600 passado em `--saida`; `--apagar` remove os usuários. Reaproveitar `prepararUsuario`/login de `scripts/perf/staging-medicoes.mjs` movendo-os para `scripts/perf/_supabase-usuario.mjs` importado pelos dois.)
- Test: `tests/carga-k6.test.ts` — importa o k6 não dá (módulos `k6/*`); o teste lê o arquivo como texto e exige `__ENV.TOKENS`, `Authorization`, `erros_429`, e que `tests/perf`-style `node --check` passe (`node --input-type=module --check < arquivo` não resolve `k6/http`; usar `acorn`/`espree`? Mais simples: `expect(src).toMatch(/__ENV\.TOKENS/)` etc. e `node -e "new Function(src)"` NÃO serve por `import`. Ficar nas asserções textuais.)

**Interfaces:**

- Consumes: Task 1 (chave `hkdf:` já publicada no staging pela Task 2 Step 9).
- Produces: `scripts/perf/_supabase-usuario.mjs` com `export async function prepararUsuario(supa, chaveAdmin, email, senha): Promise<string>` e `export async function entrar(supa, anon, email, senha): Promise<string>` (JWT).

- [ ] **Step 1: Teste textual** `tests/carga-k6.test.ts` → FAIL.
- [ ] **Step 2: Alterar `carga.k6.js`** e extrair `_supabase-usuario.mjs`; `scripts/perf/staging-medicoes.mjs` passa a importar de lá (comportamento igual).
- [ ] **Step 3: `node scripts/perf/staging-usuarios.mjs --n 10 --saida <scratch>/k6.env`** (env: `STAGING_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` do `.env`). Arquivo criado com 600; nada impresso além de "10 usuários prontos".
- [ ] **Step 4: Rodar** — `docker run --rm -i --env-file <scratch>/k6.env -e VUS=20 -e RODADAS=5 grafana/k6 run --summary-export=<scratch>/k6-staging.json - < scripts/perf/carga.k6.js` (20 VUs: o plano Free do Workers e o Supabase Free aguentam; ~3 min, < 10 k requisições). Os `thresholds` do arquivo são catracas do Node local e podem reprovar: o que vale é a tabela p50/p95 por rota do `--summary-export`.
- [ ] **Step 5: Lado do servidor** — no mesmo minuto, os quantis de `workersInvocationsAdaptive` (GraphQL da Cloudflare, como na Fase 4, T9: CPU e wall p50/p95/p99 por minuto) para separar a rede de casa do Worker.
- [ ] **Step 6: Apagar os usuários** — `node scripts/perf/staging-usuarios.mjs --apagar --n 10`; `rm <scratch>/k6.env`.
- [ ] **Step 7: Registrar** em `task-8-report.md`: por rota (`me`, `para-jogo`, `perfil`, `rodada`, `review`, `xp`, `resultados`) p50/p95 vistos daqui, wall/CPU do servidor, taxa de 429 e 5xx; comparação com o critério da spec (p50 ≤ 130, p95 ≤ 250) e com `docs/slo.md` (`leitura` p95 300, `gravacao` p95 800).
- [ ] **Step 8: Commit** — `git commit -m "perf(k6): carga.k6.js contra o staging (tokens por VU, 429 contado) e criação de usuários de carga no Supabase"`.

---

### Task 9: Portão G1 — verificação completa, relatório e merge na `main`

Feita pelo controlador com o `verificador` e o `revisor-critico` (o SDD já despacha a revisão final de ramo inteiro; aqui ela cobre `main...cloudflare/migracao`).

**Files:**

- Create: `docs/auditoria/2026-10-21-fase5-portao-g1.md`
- Modify: `docs/auditoria/2026-10-19-spikes-cloudflare.md` ("Fase 5 concluída" + "Depende do dono" atualizado), `docs/auditoria/2026-10-20-fase4-staging.md` (linha do scrypt frio com o número novo)
- Modify: memória do projeto e `CHANGELOG.md` (já tocado na Task 5)

- [ ] **Step 1: Verificação completa local** — `npm run typecheck && npm run typecheck:core && npm run typecheck:estrito && npm run lint && npm test && npm run morto:arquivos && npm run morto:ciclos && npm run build && npm run worker:build && npx vitest run tests/worker && npm run fumaca:worker && npx playwright test && npx playwright test -c playwright.publico.config.ts && npx playwright test -c playwright.estatica.config.ts` — tudo 0 (o `fumaca:worker` precisa do Docker).
- [ ] **Step 2: CI do ramo verde de ponta a ponta** — `gh run list -b cloudflare/migracao -w ci.yml -L 1` com `success` (todos os jobs, inclusive `imagem`).
- [ ] **Step 3: scrypt frio medido** — depois do deploy da Task 2: CPU p50 dos 3–4 primeiros `/api/me` após um isolate novo (GraphQL `workersInvocationsAdaptive` por minuto, método da T9). Critério: < 50 ms. Anotar.
- [ ] **Step 4: Relatório** `docs/auditoria/2026-10-21-fase5-portao-g1.md` com: tabela dos critérios de aceite da spec (cada linha de "Critérios de aceite" com status ok / reprovado / não se aplica (R15/R16) / depende do dono, e a evidência: comando, run, arquivo); scrypt frio; k6 (Task 8) × Node (`docs/slo.md`); ensaio (Task 7); drill (Task 6); CI; ZAP/Lighthouse da Fase 4; dívidas (CORP nos estáticos, `scripts/custo/modelo.mjs`, upload 100 MB de rede boa, Supabase separado para o staging — R11, Bao instável se for o caso); e a lista "Depende do dono" para o corte: Workers Paid, zona `frasy.com.br`, Environment `production`, secrets de produção pelo script, chaves S3 do R2 (backup e drill), Turnstile, PITR, apagar o Worker `babel-play`, passeio manual no staging com o console aberto.
- [ ] **Step 5: Revisão final** (revisor no modelo mais capaz) de `main...cloudflare/migracao` com foco em segurança (`tests/seguranca/*`, CSP, AAL2 `/API/me` 404, webhook idempotente), dados e o que a Fase 5 mudou; uma rodada de correção; re-revisão escopada.
- [ ] **Step 6: Commit do relatório e push.**
- [ ] **Step 7: Merge** — `git checkout main && git pull --rebase && git merge --ff-only cloudflare/migracao && git push origin main`; `gh run watch` do CI na `main` até verde. Se o `--ff-only` falhar (alguém tocou a `main`), parar e relatar: merge com conflito é decisão do dono.
- [ ] **Step 8: Fechar** — memória do projeto (Fase 5 concluída, G1 fechado, o que depende do dono), apagar o workspace SDD, recap ao dono.
