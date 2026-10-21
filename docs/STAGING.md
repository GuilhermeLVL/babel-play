# Staging — o Worker `frasy-staging`

O staging do Frasy é o Worker `frasy-staging` na Cloudflare, em
`https://frasy-staging.guigui-cruzeiro.workers.dev`: o mesmo bundle da produção (o `env.staging` do
`wrangler.jsonc` repete `define` e bindings), com banco `frasy_staging` no MESMO Supabase de São Paulo, pelo
Hyperdrive `frasy-staging-sp`, bucket `frasy-midia-staging`, Analytics Engine `frasy_metricas_staging` e **nenhum
cron**. Como foi montado e os números medidos: [`docs/auditoria/2026-10-20-fase4-staging.md`](auditoria/2026-10-20-fase4-staging.md).
A decisão de hospedagem está no [ADR 0015](adr/0015-cloudflare-workers-no-lugar-do-fly.md).

**Regra de ouro dos segredos.** Chave, token e senha **nunca** vão para o chat, para o repositório nem para um
print. Eles ficam em `.secrets.staging.json` (ignorado pelo git) e seguem para o Worker pelo script abaixo.

## Publicar

```bash
gh workflow run deploy-worker.yml --ref cloudflare/migracao -f ambiente=staging -f ref=cloudflare/migracao
gh run watch   # escolha o run
```

O workflow (`.github/workflows/deploy-worker.yml`) faz build, migra o banco, sobe uma versão sem tráfego, roda a
fumaça, promove a 100 %, roda a fumaça de novo e faz `wrangler rollback` se a final falhar. O passo a passo e a
tabela completa estão em [`deploy.md`](deploy.md), "Publicar o Worker (CI)". `workflow_dispatch` só enxerga o
workflow que está na branch padrão; o `ref` é o que será publicado.

**GitHub Environment `staging`** (Settings → Environments): secrets `CLOUDFLARE_API_TOKEN`,
`CLOUDFLARE_ACCOUNT_ID`, `DATABASE_URL_MIGRACAO` (pooler de sessão do Supabase) e `SUPABASE_CA_PEM`; variáveis
`URL_DO_WORKER`, `VITE_PUBLIC_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_LOGIN_GOOGLE` e as demais
`VITE_*` (públicas por desenho: vão para o navegador). Falta algo, o workflow reprova dizendo o NOME.

## Secrets do Worker

```bash
cp .secrets.example.json .secrets.staging.json      # preencha; o arquivo não é versionado
npx tsx scripts/cloudflare/secrets.ts staging --dry-run   # só confere os nomes
npx tsx scripts/cloudflare/secrets.ts staging
```

`SECRET_KEY` do Worker é `hkdf:<64 hex>` (`deploy.md`, "Gerar a SECRET_KEY"). O primeiro run de um ambiente apenas
cria o Worker; depois dos secrets, um segundo run segue o fluxo por versões (`deploy.md`, "Primeiro deploy de cada
ambiente").

## Cadastro e venda no staging

`SIGNUP_ENABLED` e `CHECKOUT_ENABLED` entram no `.secrets.staging.json`. Mantenha-os fechados (`0`) até as
conferências que precisam de conta e de cobrança de mentira; no staging, o Asaas é o sandbox (`ASAAS_SANDBOX=1`,
`ASAAS_BASE_URL=https://api-sandbox.asaas.com/v3`). `ASAAS_SANDBOX` **nunca** vai para a produção. Para virar
admin de uma conta, o papel mora no banco do servidor: `node dist-server/operacao.cjs conta papel <e-mail> admin`
(`npm run build` gera o `operacao.cjs`; rode da sua máquina com a `DATABASE_URL` do `frasy_staging` no ambiente).

## O que o staging prova

- **O Worker de verdade**: Express no isolate, Hyperdrive até o Supabase, R2 e Analytics Engine, com a CPU por
  requisição medida pela Cloudflare (a vitrine local não mede nada disso).
- **A fumaça por versão**: `/api/ready` 200 e `/api/health` com `versao` terminando no sha implantado, antes e
  depois de virar o tráfego.
- **Cabeçalhos reais da SPA**: CSP, COOP/COEP (threads do WASM) e HSTS nos estáticos.
- **Webhooks do Asaas, e-mail do Supabase, Google, Turnstile e Resend** falando com o mundo de verdade (as
  conferências estão em [`LANCAMENTO.md` §10](LANCAMENTO.md#10-conferências-antes-de-abrir--30-min)).
- **ZAP e Lighthouse** contra um servidor de verdade.
- **A restauração do backup**: o `pg_dump` semanal e o `pg_restore` (runbook §0.2 e §8). Um backup que nunca foi
  restaurado ainda não é um backup.

**Só na produção** (o staging não substitui): cobrança real e estorno, os DPAs, o parecer do jurídico sobre os
Termos §3-§4 (sem ele, não abra a venda do anual) e os alertas de fatura.
