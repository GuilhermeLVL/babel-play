# Auditoria de prontidão para produção — 15/10/2026

**Auditoria de produção: 55/100, arriscado.** O código está perto de pronto: o webhook confere o pagamento na API do Asaas, é idempotente, o rollback de imagem é automático e o backup é duplo. Mas nada foi provado num ambiente real (o staging está fora do ar e nenhum item da §10 do LANCAMENTO foi marcado). O SMTP embutido do Supabase trava o cadastro e a recuperação de senha. E há um furo de cobrança: quem cancela uma assinatura paga no cartão volta a ser Premium para sempre quando chega o `PAYMENT_RECEIVED` atrasado.

Faixa: **Arriscado (50–69)**, ou seja, só como beta pequeno e fechado (cadastro por convite ou de poucos adultos, venda fechada) depois do staging verde. Pela regra da skill, a nota fica limitada a 84 porque o caminho crítico não foi testado de ponta a ponta e o status do CI deste commit não foi conferido. Em espírito, fica limitada também a 69: a idempotência existe, mas o efeito de um evento fora de ordem concede acesso não pago.

Escopo: sair da edição estática (Cloudflare Pages) para o servidor no Fly.io (`server.ts`, Express, SQLite + Litestream), com login no Supabase Auth e cobrança no Asaas (Grátis + Premium R$ 19,90/mês, teste de 14 dias, MVP com `ANUAL_ENABLED=0`). A auditoria foi **somente leitura**, no `main` em `4dc9e253`, em dia com `origin/main` e com a árvore limpa. Não houve deploy, chamada a serviço externo nem e2e.

---

## Bloqueios

### Código (o Claude faz)

**B1. O `PAYMENT_RECEIVED` atrasado reativa a assinatura cancelada, e `active` concede para sempre.**

- Cancelar depois dos 7 dias grava `status: 'canceled'`, `cancelAtPeriodEnd: 1` e o fim do período (`server/lib/encerramentoDeAssinatura.ts:289-294`).
- No cartão, o Asaas confirma (`PAYMENT_CONFIRMED`) e só marca `RECEIVED` quando o dinheiro cai, cerca de 30 dias depois. Esse prazo precisa ser conferido no sandbox.
- O `PAYMENT_RECEIVED` atrasado passa na conferência da API, porque o status é mesmo `RECEIVED` e a assinatura é a registrada. Aí ele faz `upsert` com `status: 'active', cancelAtPeriodEnd: 0` (`server/lib/billingEventos.ts:335-343`).
- `subConcede` devolve `true` para `active` **sem olhar `currentPeriodEnd`** (`server/lib/entitlements.ts:46-47`). A assinatura já foi removida no Asaas, então nenhum `PAYMENT_OVERDUE` vai chegar. Resultado: Premium vitalício de graça, e a tela diz "renova".
- O mesmo `status: 'active'` sem fim vale para o **12x** (`billingEventos.ts:668`). O parcelamento não renova e nenhum evento chega depois da 12ª parcela, então todo comprador do 12x fica Premium para sempre. Hoje isso está fora do MVP (`ANUAL_ENABLED=0`), mas bloqueia ligar o anual.
- Nenhum teste cobre estes casos. Em `tests/integration/billing-*.test.ts` não há "RECEIVED depois do cancelamento" nem "12x depois do ano".
- **Correção:** é pequena, com TDD.
  1. Em `subConcede`, uma assinatura com `provider = 'asaas'` passa a exigir `currentPeriodEnd > agora` também quando está `active`. Plano dado pelo admin, sem período, continua como está.
  2. No ramo `PAYMENT_CONFIRMED/RECEIVED`, uma linha `canceled` com `cancelAtPeriodEnd = 1` mantém o status e o `cancelAtPeriodEnd` quando o pagamento é da assinatura já cancelada.
  3. Dois testes de integração cobrem os dois cenários.

**B2. O guia manda ligar o _Bot Fight Mode_ da Cloudflare, e ele pode barrar o webhook do Asaas** (`docs/LANCAMENTO.md:318-319`).

- Segundo a documentação da Cloudflare (o dono precisa conferir), o Bot Fight Mode do plano Free não pode ser pulado por regra de WAF para um caminho. O POST do Asaas em `/api/billing/webhook/asaas` receberia um desafio.
- Com 15 falhas seguidas, o Asaas para a fila, e aí nenhum pagamento concede plano.
- **Correção no doc:** não ligar o Bot Fight Mode no MVP. Se ligar, conferir no painel do Asaas (Webhooks → histórico) que a entrega segue com 200 logo depois. Os limites do servidor e a regra de rate limit da Cloudflare já cobrem o abuso.

**B3. A política de privacidade não nomeia quem trata os dados.**

- `public/privacidade.html` (seções em 68-91 e 106-147) ainda não cita:
  - o **Fly.io**, que hospeda todo o banco;
  - a **Cloudflare**: a borda, o R2 com o áudio e os backups, e o Turnstile;
  - o **Resend**, que recebe o e-mail do responsável e o do login;
  - o **Sentry**.
- Falta também a cláusula de **transferência internacional** (LGPD art. 33): Groq, OpenRouter, Sentry e Resend estão nos EUA, como `docs/lgpd/operadores.md:23-36` registra.
- Falta a **identificação do controlador** (razão social e CNPJ; LGPD art. 9º, II). O contato público é um Gmail pessoal (`privacidade.html:181`).
- **Correção:** o Claude redige a partir de `docs/lgpd/operadores.md`; o advogado valida.

**B4. O anual nasce À VENDA se a variável faltar.**

- `anualLigado` trata "ausente" como aberto. O preflight só **AVISA** (`server/lib/preflightProducao.ts:228-235`), e o `fly.toml` não fixa `ANUAL_ENABLED`.
- Se o dono esquecer a variável no `fly secrets`, sobem juntos:
  - o anual com os Termos §3–§4 ainda não validados;
  - o 12x vitalício do B1.
- **Correção:** fail-safe. Ou o padrão vira fechado (só `ANUAL_ENABLED=1` abre), ou o `[env]` do `fly.toml` passa a ter `ANUAL_ENABLED = "0"`.

### Dono (contas e decisões)

**D1. Cartão no Fly e o staging de volta no ar, com as conferências.**

- Hoje nada foi provado no mundo real (`docs/STAGING.md:281-299` lista o que só o staging prova):
  - o e-mail de confirmação;
  - o webhook real do Asaas;
  - o R2;
  - a restauração do backup;
  - as threads do WASM;
  - a borda;
  - o Sentry sem dados pessoais.
- O portão de produção exige o selo `deploy/staging` (`.github/workflows/deploy.yml:138-161`).
- Custo baixo: o `fly.staging.toml` já tem `auto_stop_machines = "stop"`, `min_machines_running = 0` e 512 MB (linhas 74-99). Dá para destruir o app depois das conferências.

**D2. SMTP próprio no Supabase antes de abrir o cadastro.**

- O SMTP embutido manda cerca de 2 e-mails por hora no projeto inteiro (`docs/auth/EMAILS-E-PROVEDORES.md` §4). Com ele, o cadastro e a recuperação de senha param na terceira pessoa da hora.
- **Não desligue o _Confirm email_ para contornar.** O teste de 14 dias é "um por e-mail" (HMAC), e sem confirmação qualquer um cria testes infinitos com e-mails inventados, queimando o orçamento de IA.
- Caminho com menos fornecedor: um domínio `.com.br` (R$ 40/ano) e o **Resend grátis** (3.000/mês, 100/dia). Ele já é o canal do convite ao responsável (`server/lib/conviteDoResponsavel.ts`), então um fornecedor cobre os dois usos. Paliativo sem domínio: Brevo grátis (300/dia).

**D3. CNPJ, a conta PJ do Asaas aprovada e a NFS-e no padrão nacional a partir de 01/11/2026** (`docs/LANCAMENTO.md:58-61` e `230-240`). Sem isso não há chave `$aact_prod_` nem venda.

**D4. Jurídico.**

- `public/termos.html` traz "versão para revisão jurídica" (linha 24) e três blocos `TEXTO A VALIDAR` (linhas 55, 103 e 150). A política também está em revisão (linha 26).
- O público é **todas as idades** sob a Lei 15.211/2025 (ECA Digital) e o LGPD art. 14.
- Pontos para o advogado olhar:
  - a idade autodeclarada como único meio;
  - o vínculo com o responsável;
  - o **baú com sorteio** (75/25), que é gratuito e não se compra com Créditos (`docs/economia-v2.md:40-53`). É preciso confirmar que não conta como _loot box_;
  - os anúncios, que nascem desligados e cuja migração (`0051_flag_anuncios.sql`) já condiciona a uma consulta jurídica.
- Sem o Resend configurado, menor de 16 não libera a nuvem (`docs/LANCAMENTO.md:355-358`: "não abra para menores").
- **Decisão do dono:** abrir o beta só para adultos até o parecer chegar.

**D5. Chave paga da Groq com retenção zero** (`docs/ESTADO-DO-LANCAMENTO.md` §3). Sem ela a nuvem atende cerca de 8 assinantes.

- A reserva da OpenRouter está vencida. O boot avisa `ia_sem_reserva` e o app cai para os modelos do aparelho.
- Para o MVP com poucos fornecedores, ficar sem reserva é aceitável, desde que seja uma decisão escrita.

**D6. Os DPAs.** Nenhuma linha de `docs/lgpd/operadores.md` está marcada como aceita.

---

## Correções de alto valor

### Código (o Claude faz) — correções

1. **Alerta quando o webhook falha.**
   - `billing_webhook_token_invalido` é `warn` e não está em `AVISOS_QUE_ALERTAM` (`server/lib/logger.ts:117-124`). Um token errado ou uma troca de token mal feita derruba a fila do Asaas em silêncio.
   - O corpo "fora da forma" responde 200 **sem log e sem registro** (`server/routes/billing.ts:1059-1063`). Se o Asaas mudar o payload, os eventos somem sem rastro. Esse caso deveria virar `log('error')`, que chega ao Sentry.
2. **A fila parada no runbook.** O runbook não descreve as 15 falhas que param a fila nem como reativá-la no painel do Asaas.
   - A troca do `ASAAS_WEBHOOK_TOKEN` (`docs/runbook.md:403`) gera 401 na janela da troca, e cada 401 conta para as 15 falhas.
   - Com a API do Asaas fora do ar, todo webhook responde 500, porque a conferência é obrigatória (`billingEventos.ts:220-230`; `asaas.ts:43` dá 15 s de prazo). Isso também para a fila.
   - Falta escrever o procedimento: conferir o histórico, reativar a fila e usar a fila do admin (`GET /api/admin/billing/pendentes`).
3. **Trava de sandbox em produção.**
   - Sem `ASAAS_BASE_URL`, o padrão é o sandbox (`server/lib/asaas.ts:21`). Chave e base do sandbox juntas em produção só geram um **AVISA** no preflight manual (`preflightProducao.ts:186-195`). O boot não diz nada.
   - Com as variáveis do staging copiadas para a produção, qualquer pessoa assina com o cartão de teste e ganha o Premium.
   - **Correção:** o boot registra um erro (que vai ao Sentry), ou aborta quando `NODE_ENV=production` aponta para o sandbox sem um `ASAAS_SANDBOX=1` explícito, que só o staging declara.
4. **O build do Actions difere do build do staging local.**
   - `implantar-ambiente.yml:103-111` não passa `VITE_LOGIN_GOOGLE`, `VITE_DESENHO_NOVO_PADRAO` nem `VITE_BERGAMOT_MODELOS_URL`. O deploy local do staging passa as duas primeiras (`docs/STAGING.md:47`).
   - Pelo Actions, a produção sai com o botão do Google à mostra (`src/lib/auth.ts:129`) mesmo com o provedor desligado no Supabase, e sem o desenho novo como padrão.
   - **Correção:** passar essas três como `vars.*` do Environment.
5. **Conciliação diária das assinaturas.** Hoje uma assinatura `active` depende só de chegar o `PAYMENT_OVERDUE`. Não há rotina que confira, contra a API do Asaas, as linhas `active` com `currentPeriodEnd` vencido. A correção B1 cobre o caso grave; a conciliação fecha o resto (evento perdido com a fila parada).
6. **Documentos desalinhados com a decisão do MVP**, que é Supabase **grátis** e poucos fornecedores.
   - `docs/LANCAMENTO.md:4`, `:28` e `:105` assumem o **Supabase Pro** (US$ 25, o custo fixo de R$ 199).
   - Nele, a _leaked password protection_ da linha 111 é exclusiva do Pro, e o grátis **pausa o projeto parado** (o próprio guia cita "sem pausa" como motivo do Pro) e não tem backup do Auth. Isso pede uma sonda grátis na saúde do Auth do Supabase (no `uptime.yml` ou no UptimeRobot) e o custo refeito.
   - Outros pontos:
     - `docs/ESTADO-DO-LANCAMENTO.md` é de 02/10;
     - `docs/STAGING.md:55` manda `cd C:\Users\Guilh\dev\ei-quest`, mas o projeto está em `C:\dev\babel-play`;
     - o staging divide o projeto Supabase com a produção (`STAGING.md:78-81`), então um token de produção vale no staging. Isso é aceitável no MVP, mas deveria estar escrito.
7. **O contato da política e dos Termos.** Trocar o Gmail pessoal por `contato@<domínio>` com o **Cloudflare Email Routing**, que é grátis, usa a conta que já existe e encaminha para o Gmail.
8. **Teste instável sob carga.** `tests/integration/billing-anual-desligado.test.ts` falhou no `beforeAll` rodando junto com outros 7 arquivos e passou sozinho (7/7).

### Dono (contas e decisões) — correções

- **Fornecedores do MVP:**
  - pago: Fly;
  - por transação: Asaas;
  - por uso: Groq;
  - grátis: Supabase grátis, Cloudflare (DNS, R2 já configurado com cerca de US$ 0, Turnstile) e Resend grátis;
  - domínio: R$ 40/ano.
- **O que dá para dispensar no começo:**
  - o **UptimeRobot**: o `uptime.yml` já vigia o `/api/health` pelo Actions sem conta nova; o alerta do backup pode ser `backup_diario_falhou` no Sentry;
  - o **Langfuse**: desligado;
  - a **OpenRouter**: decisão do D5.
- O Sentry grátis compensa: é o único destino dos `log('error')` fora do disco.
- Fixar `ANUAL_ENABLED=0`, `SIGNUP_ENABLED=0` e `CHECKOUT_ENABLED=0` no `.env` da produção e rodar `npm run preflight` antes de cada `fly secrets import`.
- O exercício de restauração pelo Actions leva dados de menores para o runner (decisão aberta nº 5 do `ESTADO-DO-LANCAMENTO.md`). Até decidir, usar o caminho manual no Fly (`docs/runbook.md` §0.2-C), em que o dado não sai da produção.

---

## Evidência conferida

#### Comandos

- `git status --short --branch`: `main...origin/main`, árvore limpa.
- `git log --oneline -20`: HEAD `4dc9e253`.
- `npx vitest run` nos 8 arquivos de cobrança e webhook (`tests/integration/billing-webhook*.test.ts`, `billing-anual-*`, `billing-cancelar-e-arrependimento`, `billing-assinar-nao-concede`): **86 passaram**. Um arquivo falhou no `beforeAll` sob carga e passou sozinho, 7/7.
- `npx tsc --noEmit`: saída 0, sem erros.

#### Webhook e cobrança

- `server/routes/billing.ts`:
  - `:1006-1011`: o token é comparado em tempo constante.
  - `:1034-1043`: limitador de 30 tokens errados por 15 min por IP e corpo de 100 kb.
  - `:1046-1057`: 501 sem segredo e 401 com token errado.
  - `:1073`: a marca de idempotência vem antes do efeito.
  - `:1101-1110`: em falha nossa, desmarca e responde 500.
- `server/lib/billingEventos.ts`:
  - `:203-239`: o `PAYMENT_CONFIRMED/RECEIVED` é conferido na API (GAP-011).
  - `:244-253`: o ramo da parcela do 12x.
  - `:335-343`: o `upsert` com `active` (B1).
  - `:356-500`: atraso, estorno, chargeback e assinatura removida, todos conferidos na API e na linha registrada.
  - `:668`: o 12x grava `active` (B1).
- `server/lib/entitlements.ts:46-51`: `active` concede sem período (B1).
- `server/lib/encerramentoDeAssinatura.ts:178-235` (12x) e `:241-294` (assinatura): arrependimento em 7 dias, com marca antes do estorno; fora disso, cancela só a renovação.
- `server/lib/asaas.ts:21`: o sandbox é o padrão. `:43`: prazo de 15 s. `:425-432`: um 404 vira `null`, um 5xx sobe.
- `server/http/app.ts`:
  - `:336-337`: o webhook fica fora do auth, com o `writeLimiter` (120 por minuto por IP).
  - `:431-443`: limitador de falhas de autenticação.
  - `:445-533`: auth, AAL2, menores e limitadores de escrita e leitura.

#### Auth e segredos

- `server/lib/auth.ts`: JWKS ES256/RS256 declarados, `aud`, `iss` e `exp` exigidos. Em produção, auth desligada aborta o boot (GAP-003).
- `server.ts:75-111`: travas de boot (multi-réplica, auth, `TRUST_PROXY`, métricas, registro de IA).
- `server.ts:224-231`: as migrações rodam no boot, e falha nelas é fatal.
- `Dockerfile:30-73`: só `VITE_*` (públicas) entram no bundle, e o build falha sem elas.
- `vite.config.ts`: nenhum segredo vai para o `define`.
- `src/`: nenhuma referência a chave de servidor.

#### Deploy, migração, saúde e backup

- `fly.toml`:
  - `:24-27`: sem `release_command`, de propósito.
  - `:65-73`: máquina sempre ligada.
  - `:85-90`: sonda em `/api/ready`.
  - `:103-105`: `/metrics` só na porta interna.
- `server/routes/health.ts:197`: pronto = banco no ar, boot ok e migrações em dia.
- `.github/workflows/implantar-ambiente.yml`:
  - `:122-132`: snapshot do volume antes do deploy.
  - `:142-160`: fumaça (ready + versão).
  - `:162-188`: rollback automático da imagem; o banco não volta.
- `scripts/migracoes/conferir.mjs`: portão expand/contract com `REVERSAO:` obrigatória a partir da 0030.
- `.github/workflows/deploy.yml:109-161`: portões do CI e do staging.
- `litestream.yml`: réplica a cada 10 s e snapshot de 7 dias.
- `scripts/iniciar-container.sh`: restaura sozinho quando o volume está vazio.
- `docs/runbook.md`: `§0.2` (`:78-155`) traz as fontes A, B e C de restauração; `§0.3` traz o rollback.
- `.github/workflows/restauracao-drill.yml` e `uptime.yml`.

#### Preflight e documentos

- `server/lib/preflightProducao.ts:167-235`: chave × base sandbox/produção, portas de cadastro e venda, anual.
- `docs/LANCAMENTO.md` (§3, §4, §6, §9 e §10 em `:326-361`), `docs/STAGING.md`, `docs/deploy.md`, `docs/auth/EMAILS-E-PROVEDORES.md`, `docs/ESTADO-DO-LANCAMENTO.md`, `docs/lgpd/operadores.md:23-36`.
- `public/privacidade.html` e `public/termos.html`.
- `server/db/migrations/0051_flag_anuncios.sql` e `docs/economia-v2.md:40-53`.
- `openspec/changes/prontidao-producao/tasks.md`: uma caixa aberta, a fila durável da importação, que não bloqueia.

## Evidência faltando

- **CI do commit `4dc9e253`:** não consultei a API do GitHub (vedado chamar serviço externo). O portão de deploy cobra esse status de qualquer forma.
- **Nenhum ambiente no ar:** o staging está fora do ar e nenhuma conferência da §10 foi feita. Sem isso não há prova de:
  - e-mail;
  - webhook real;
  - R2;
  - restauração;
  - borda;
  - `crossOriginIsolated`;
  - Sentry sem dados pessoais.
- **Comportamento real do Asaas a medir no sandbox:**
  - o intervalo `CONFIRMED`→`RECEIVED` do cartão, que confirma o cenário do B1;
  - quantos webhooks o 12x manda;
  - o prazo de resposta que o Asaas espera do webhook, comparado aos 15 s da nossa conferência;
  - por quantos dias os eventos ficam retidos com a fila parada.
- **O B1 foi provado por leitura do código, não por teste executado.** O teste é o primeiro passo da correção.
- **A configuração do Supabase:** SMTP, Confirm email, JWT ES256, Redirect URLs, captcha. Fica no painel, fora do repositório.
- **O parecer jurídico** sobre os Termos §3–§4, a política e o ECA Digital.
- **O e2e não foi rodado**, por instrução.

## Próxima ação

**Código:** corrigir o B1 com TDD. Primeiro dois testes de integração:

1. `PAYMENT_RECEIVED` chega 30 dias depois do cancelamento e **não** reativa;
2. o 12x **expira** depois de 370 dias.

Depois, `subConcede` passa a exigir período para assinatura do Asaas, e o ramo do pagamento preserva o `canceled`. São um commit e os testes de cobrança afetados. Junto, no mesmo commit, vai o B4 (`ANUAL_ENABLED` fechado por padrão).

**Dono:** pôr o cartão no Fly e subir o staging seguindo `docs/STAGING.md`, com o SMTP próprio (D2) já ligado no Supabase.
