# Checklist de deploy

Para cada ida à produção. O workflow (`.github/workflows/deploy.yml` → `implantar-ambiente.yml`)
automatiza o que dá; esta lista é o que ainda depende de uma pessoa olhando. Política de versão,
API e migrations: [`docs/versionamento.md`](versionamento.md). Rollback: [`docs/runbook.md` §0.3](runbook.md).

**Custo aceito da estratégia.** Uma máquina + volume (ADR 0006) não admite blue-green nem rolling:
o deploy é `--strategy immediate`, e o serviço fica **fora do ar por alguns segundos** (~20 s
medidos: a máquina para, sobe com a imagem nova e roda as migrations). Por isso: deploy fora do
horário de pico (o pico é à noite, horário de Brasília), e nunca dois seguidos sem necessidade.

## Antes

- [ ] O commit está no `main` e o **CI está verde** para ele (o workflow recusa sem isso).
- [ ] `CHANGELOG.md` → `[Unreleased]` descreve o que muda; se for release, `npm run release -- <tipo>`
      foi rodado, o diff revisado, o commit `chore(release)` e a tag `vX.Y.Z` criados (docs/versionamento.md §1).
- [ ] **Migrations novas** (`server/db/migrations/` a partir da 0030):
  - [ ] são **expand** (só acrescentam) — o job `migracoes` do CI confere;
  - [ ] se houver `-- CONTRATO:`, ela vem **sozinha** neste deploy e o código que parou de usar o que
        ela remove já está em produção há pelo menos um deploy;
  - [ ] o `REVERSAO:` de cada uma foi lido e é executável.
- [ ] **API**: nenhuma rota removida fora do prazo (o CI confere `tests/contratos/api-contrato.json`);
      campo de resposta removido/renomeado? Não pode (docs/versionamento.md §2).
- [ ] Variáveis/segredos novos que o código exige já estão no Fly (`fly secrets list --app <app>`); o boot
      aborta sem as obrigatórias (`server/lib/config.ts`) — e o rollback automático volta a imagem, mas
      o downtime acontece.
- [ ] Backup em dia: o heartbeat do backup diário no UptimeRobot está verde (runbook §0.1, alerta 2).
- [ ] Mudança de risco (billing, auth, dados de menor, migration grande)? Avise antes e deixe à mão as
      chaves de emergência (`CHECKOUT_ENABLED`, `SIGNUP_ENABLED`, `AI_ENABLED`).

## Durante

- [ ] Actions → **Deploy (Fly.io)** → destino `staging-e-producao` (ou `staging` agora e `producao`
      depois). Produção só aceita um commit com o selo `deploy/staging` = verde.
- [ ] Em staging, antes de aprovar a produção (o environment `production` pede revisor): abrir a URL de
      staging, entrar, fazer uma rodada, conferir o fluxo que o deploy mudou.
- [ ] Acompanhar o resumo da execução: imagem anterior registrada → snapshot do volume pedido →
      implantação → fumaça (`/api/ready` 200 e versão terminando no sha).
- [ ] Se aparecer **ROLLBACK AUTOMÁTICO executado**: a imagem voltou sozinha; o job fica vermelho de
      propósito. Ler os logs (`fly logs --app <app>`) antes de tentar de novo.

## Depois (primeiros 30 min)

- [ ] `curl -s https://<domínio>/api/health | jq .versao` mostra a versão nova (`X.Y.Z+<sha7>`).
- [ ] `fly logs --app babel-play`: nenhum `ABORTADO`, nenhum `boot_*_falhou`; migrations aplicadas.
- [ ] Sentry: nenhuma issue nova com a release deste sha.
- [ ] Métricas (runbook §3): latência e taxa de 5xx no patamar de antes.
- [ ] Uma aba aberta ANTES do deploy mostra o aviso "nova versão disponível" e segue funcionando até
      recarregar (é o que a política de API aditiva garante).
- [ ] Algo errado que a fumaça não pegou → rollback de imagem (runbook §0.3, passo 1). Dado estragado →
      runbook §0.3, passos 2 e 3.
- [ ] Anotar no CHANGELOG/issue do deploy: sha, hora, quem, e qualquer desvio desta lista.
