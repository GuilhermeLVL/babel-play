## Why

O R2 foi ativado na conta Cloudflare em 19/10/2026 e a Cloudflare **não tem teto de gasto que
bloqueie o uso**: o nível gratuito (10 GB guardados, 1 milhão de operações de classe A e 10 milhões
de classe B por mês, saída grátis) só dispara um alerta de orçamento, por e-mail, depois que a conta
já passou dele. O servidor hoje controla a cota **por usuário** (`server/lib/storageQuota.ts`, metric
`storage_bytes`), mas ninguém soma o total da conta nem conta operações. Um laço de cliente, um
import de Anki com muita mídia ou uma varredura de retenção descalibrada podem ultrapassar o grátis
sem que nada do nosso lado recuse.

O dono pediu: travar no nível da Cloudflare (alerta) **e** no app, por variável de ambiente, para
ligar, ajustar e reverter sem mudar código.

## What Changes

- **Teto global de armazenamento** no R2: `R2_TETO_MB` (padrão 9 216 MB = 90 % dos 10 GB). A reserva
  de cota por usuário passa a conferir também a soma da conta; acima do teto o upload é recusado
  com `507` e mensagem clara, e a retenção/varredura continua apagando normalmente.
- **Teto mensal de operações** no R2: `R2_TETO_OPS_A_MES` (padrão 900 000) e `R2_TETO_OPS_B_MES`
  (padrão 9 000 000). O adaptador S3 conta cada operação (A: PUT/DELETE/LIST; B: GET/HEAD) num
  contador mensal e recusa a operação quando o teto do mês está batido.
- **Aviso a 80 %** de qualquer teto (log `r2_teto_alerta_80` e métrica), no mesmo espírito de
  `ia_orcamento_diario_alerta_80`.
- **Reversão por variável:** o valor `ilimitado` desliga o teto correspondente; `0` fecha (kill
  switch). Ausente = padrão acima. Tudo declarado em `server/lib/config.ts` e no
  `.env.production.example`.
- **Alerta de orçamento na Cloudflare** (fora do código): o dono cria um Budget Alert de US$ 1 no
  painel do R2. Fica registrado em `docs/deploy.md` como passo do ambiente.

## Impact

- `server/lib/storageQuota.ts` (reserva global), `server/lib/armazenamento.ts` (contagem de
  operações no adaptador S3), `server/lib/config.ts` (variáveis), `server/http/metricas.ts`
  (métrica), `.env.production.example`, `docs/deploy.md`.
- Sem mudança de schema: o total da conta é `SUM(count)` da metric `storage_bytes` já existente; as
  operações usam `usage_counters` com metric `r2_ops_a`/`r2_ops_b` e janela `YYYY-MM`.
- Com armazenamento em disco (sem S3) nada muda: os tetos só valem quando o adaptador é o S3.
- Branch: `cloudflare/migracao` (o adaptador S3 e o R2 são o caminho da Fase 3).
