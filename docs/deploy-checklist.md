# Checklist de deploy

Para cada ida à produção. O workflow (`.github/workflows/deploy-worker.yml`)
automatiza o que dá; esta lista é o que ainda depende de uma pessoa olhando. Política de versão,
API e migrations: [`docs/versionamento.md`](versionamento.md). Rollback: [`docs/runbook.md` §0.3](runbook.md).

**Como o deploy troca a versão.** O Worker publica por **versões** (`wrangler versions upload` e depois
`versions deploy @100%`, ADR 0015): a versão nova sobe sem tráfego, passa pela fumaça e só então recebe 100 %, sem
janela fora do ar. Mesmo assim, evite deploy no pico (à noite, horário de Brasília) e dois seguidos sem necessidade.

## Antes

- [ ] O commit está no `main` e o **CI está verde** para ele (o workflow recusa sem isso).
- [ ] `CHANGELOG.md` → `[Unreleased]` descreve o que muda; se for release, `npm run release -- <tipo>`
      foi rodado, o diff revisado, o commit `chore(release)` e a tag `vX.Y.Z` criados (docs/versionamento.md §1).
- [ ] **Migrations novas** (`server/db/migrations-pg/`):
  - [ ] são **expand** (só acrescentam) — o job `migracoes` do CI confere;
  - [ ] se houver `-- CONTRATO:`, ela vem **sozinha** neste deploy e o código que parou de usar o que
        ela remove já está em produção há pelo menos um deploy;
  - [ ] o `REVERSAO:` de cada uma foi lido e é executável.
- [ ] **API**: nenhuma rota removida fora do prazo (o CI confere `tests/contratos/api-contrato.json`);
      campo de resposta removido/renomeado? Não pode (docs/versionamento.md §2).
- [ ] Variáveis/segredos novos que o código exige já estão nos secrets do Worker (`npx wrangler secret list -c wrangler.jsonc`; no staging, `--env staging`);
      o boot aborta sem as obrigatórias (`server/lib/config.ts`) — e o rollback automático volta a versão, mas
      a fumaça já terá reprovado.
- [ ] Backup em dia: o último `backup-pg-dump.yml` está verde e o `semanal/AAAA-MM-DD.dump` no `frasy-backups` tem
      menos de 8 dias (runbook §0.1, alerta 2).
- [ ] Mudança de risco (billing, auth, dados de menor, migration grande)? Avise antes e deixe à mão as
      chaves de emergência (`CHECKOUT_ENABLED`, `SIGNUP_ENABLED`, `AI_ENABLED`).

## Durante

- [ ] Actions → **deploy-worker** → `ambiente=staging` (e depois `production`, com o `ref` já validado em
      staging). Quem pode publicar qual ref é decidido pelo Environment (`deploy.md`).
- [ ] Em staging, antes de aprovar a produção (o environment `production` pede revisor): abrir a URL de
      staging, entrar, fazer uma rodada, conferir o fluxo que o deploy mudou.
- [ ] Acompanhar a execução: build → migrações → `versions upload` → fumaça na preview → `versions deploy` →
      fumaça final (`/api/ready` 200 e versão terminando no sha) → `triggers deploy`.
- [ ] Se o job rodar `wrangler rollback` (fumaça final reprovada): a versão anterior voltou sozinha; o job fica
      vermelho de propósito. Ler os logs (`npx wrangler tail -c wrangler.jsonc`) antes de tentar de novo.

## Depois (primeiros 30 min)

- [ ] `curl -s https://<domínio>/api/health | jq .versao` mostra a versão nova (`X.Y.Z+<sha7>`).
- [ ] `npx wrangler tail -c wrangler.jsonc`: nenhum `ABORTADO`, nenhum `boot_*_falhou`; migrations aplicadas.
- [ ] Sentry: nenhuma issue nova com a release deste sha.
- [ ] Métricas (runbook §3): latência e taxa de 5xx no patamar de antes.
- [ ] Uma aba aberta ANTES do deploy mostra o aviso "nova versão disponível" e segue funcionando até
      recarregar (é o que a política de API aditiva garante).
- [ ] Algo errado que a fumaça não pegou → rollback da versão (runbook §0.3, passo 1). Dado estragado →
      runbook §0.3, passo 2.
- [ ] Anotar no CHANGELOG/issue do deploy: sha, hora, quem, e qualquer desvio desta lista.
