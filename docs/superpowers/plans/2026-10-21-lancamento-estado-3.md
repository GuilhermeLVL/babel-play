# Lançamento no estado 3 — planos v3 à venda, anúncios no Grátis, IA em nuvem — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (com implementadores em worktrees paralelos quando os arquivos não se cruzam) para executar as tarefas "Eu". Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Colocar o Frasy em produção com Grátis + Essencial (R$ 9,90) + Premium (R$ 19,90) à venda, anúncios no Grátis prontos para ligar, IA em nuvem com chaves pagas, e o Ao Vivo (R$ 39,90) visível só quando o serviço existir.

**Architecture:** Nada de arquitetura nova: a matriz v3 (ADR 0013), o webhook por valor pago, a troca de plano e a tela de 3–4 cartões já existem atrás das flags `venda_planos_v3`/`stt_ao_vivo`; a política de anúncios, os 6 encaixes e o provedor de demonstração existem atrás da flag `anuncios`. O trabalho é fechar o que falta entre esses pontos e a rua: provas de cobrança por plano, telas e textos, consentimento + CSP por configuração + provedor real de anúncios, recompensa do premiado no servidor, política de privacidade, e o procedimento de abrir a venda. O que só o dono pode fazer está na seção "Você".

**Tech Stack:** o do repositório (React + Vite, Express no Worker, Postgres/Drizzle, Asaas, Supabase Auth, vitest, Playwright). Skills obrigatórias por tarefa: `copy-br-etica` (qualquer texto de plano/oferta/anúncio), `custo-de-ia` (vozes, provedores).

**Spec:** `openspec/changes/planos-v3-e-rota-inteligente/` (`design.md` §7–§11; `specs/anuncios-no-gratis/spec.md`, `specs/matriz-de-planos/spec.md`) e ADR 0013. O estado real do código está em `docs/auditoria/2026-10-21-lancamento-inventario.md` (gerado junto com este plano). Decisões do dono delegadas em 09/10 (`design.md` §11): valem os padrões.

## Pressupostos declarados (o dono pode derrubar qualquer um)

- **P1 — O que abre no lançamento:** Grátis, Essencial e Premium. O **Ao Vivo não é vendido** (serviço de nuvem ao vivo não existe, decisão 12 em aberto); fica fora dos cartões até `stt_ao_vivo`.
- **P2 — Rota inteligente, transparência e nuvem ao vivo** (grupos 4, 5, 6, 10 e Q da change) **não bloqueiam a venda**: o Essencial vende "nuvem sob demanda, 5 h/mês" com a rota de hoje (entitlements + cotas). Ficam para depois do lançamento.
- **P3 — Anúncios sobem DESLIGADOS** e prontos: consentimento, política, CSP por configuração, provedor real e recompensa do premiado implementados e provados numa página de bancada. Ligar é ato do dono após a consulta jurídica (ECA Digital) e a aprovação da rede.
- **P4 — Rede de anúncios:** até o dono decidir, o adaptador é escrito para o **Google AdSense** (nativo/display) com o **premiado** só se a rede aprovar o formato na web; a pesquisa da Task 0 confirma ou troca antes de codar o adaptador.
- **P5 — Voz neural ("básica"/"boa")** continua atrás de `voz_natural`; a copy dos cartões não promete voz neural enquanto a flag estiver desligada.
- **P6 — Produção sobe com `SIGNUP_ENABLED=0` e `CHECKOUT_ENABLED=0`** e abre depois das conferências; `ANUAL_ENABLED` só depois do jurídico.

## Global Constraints

- Nunca gravar chaves/tokens em arquivos versionados; nunca imprimir tokens; TLS sempre verificado.
- Gemini PROIBIDO; provedores com retenção zero; cotas e planos SÓ em `src/core/planos.ts`; ler `docs/alternativas-de-custo-e-eficiencia.md` antes de mexer em modelo/custo/plano.
- Textos de produto em pt-BR pela skill `copy-br-etica`: linguagem de benefício, sem "qualidade"/"%"/"mais precisa", sem manipulação; perfil protegido nunca recebe oferta nem anúncio.
- Com a flag `anuncios` desligada, **nenhum byte de terceiro** é pedido e a CSP continua sem host externo (`tests/seguranca/csp-estreita.test.ts`).
- Anúncio nunca para perfil protegido, headset, captura ativa, conta com menos de 3 dias, ou sem consentimento (`politicaDeAnuncio.ts`); todo anúncio tem a porta "Sem anúncios".
- Não enfraquecer testes; `npm run lint` com zero avisos; i18n: toda string de UI por `t()` nos 4 catálogos (`node scripts/i18n/orfas.mjs`, `cobertura.mjs --check`, `pseudo.mjs --check`).
- Mudança de comportamento segue a change OpenSpec existente; ao concluir cada grupo, marcar o item em `openspec/changes/planos-v3-e-rota-inteligente/tasks.md`.
- Deploy só pelo `deploy-worker.yml`; staging é o ambiente de prova; produção só com as "Você" do bloco 1 feitas.
- Ramo de trabalho: `lancamento/estado-3` a partir da `main`; worktrees por tarefa quando paralelas; merge na `main` só com CI verde e revisão.

## Review Focus

1. Valor pago de um plano que não está à venda (ex.: R$ 39,90 com `stt_ao_vivo` desligada): o webhook deve conceder pelo valor mesmo assim (o dinheiro entrou) e registrar o motivo. Teste na Task 2.
2. Flag `anuncios` ligada no banco mas sem consentimento: nenhum script carregado, nenhuma requisição de rede. Teste na Task 4.
3. Perfil protegido (menor) com flag e consentimento: zero anúncio e zero oferta de "ver anúncio para ganhar nuvem". Teste na Task 5.
4. Recompensa do premiado chamada duas vezes com o mesmo id de exibição: credita uma vez (idempotente) e respeita os tetos por pessoa e global. Teste na Task 5.
5. Tela de Planos com 3 cartões: a comparação não cita "Ao Vivo" nem voz neural quando as flags estão desligadas; textos não dizem "Grátis ou Premium" como se fossem só dois. Teste na Task 3.

---

## Você (dono) — o que só você pode fazer

Bloco 1 (abre a produção; comece hoje, os prazos são externos):

- [ ] Cloudflare: assinar **Workers Paid**; criar a zona `frasy.com.br`; domínio no Worker.
- [ ] GitHub Environment `production` com `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `DATABASE_URL_MIGRACAO`, `SUPABASE_CA_PEM` e as vars `VITE_*` (`docs/LANCAMENTO.md` §8).
- [ ] `.secrets.production.json` (fora do git) preenchido e enviado por `npx tsx scripts/cloudflare/secrets.ts production`.
- [ ] Supabase Pro; Site URL e Redirects; "Allow new users to sign up" desligado até abrir; PITR (opcional); projeto separado para o staging.
- [ ] **Asaas**: conta PJ aprovada; chave de **sandbox** (para o staging) e de produção; webhook apontando para o domínio; confirmar que não existe assinatura manual a R$ 39,90 nem R$ 179 (decisão 3).
- [ ] Chaves de IA pagas: OpenRouter (nova) e Groq Developer; `IA_PROVEDORES` de produção.
- [ ] Resend (SPF/DKIM/DMARC), Sentry, UptimeRobot (`HEALTH_URL`), Turnstile (site key no build + "CAPTCHA protection" no Supabase).
- [ ] Chaves S3 do R2: escrita (`backup-pg-dump.yml`) e leitura (Environment `restauracao`).
- [ ] Contador: ME no Simples; NFS-e nacional a partir de 01/11/2026.
- [ ] Advogado: Termos §3–§4 (anual, 12x, teste, uso justo, cancelamento) — até lá `ANUAL_ENABLED=0`.
- [ ] 12 DPAs aceitos e marcados em `docs/lgpd/operadores.md`; razão social, CNPJ e contato para a política de privacidade.
- [ ] Decisão #1 (e-mails de cobrança do Asaas ligados ou não), #4 (compute do Supabase), #5 (drill de restauração pelo Actions é aceitável pela LGPD).

Bloco 2 (anúncios e os planos que faltam):

- [ ] Escolher a **rede de anúncios** (a Task 0 entrega a recomendação) e criar a conta/propriedade com o domínio próprio.
- [ ] **Consulta jurídica sobre ECA Digital** (Lei 15.211/2025, Decreto 12.880/2026) antes de ligar `anuncios`.
- [ ] Decidir as **vozes** "básica" e "boa" com a medição da Task 8 (ou manter `voz_natural` desligada no lançamento).
- [ ] Decidir o serviço do **Ao Vivo** (fica fora do lançamento por P1).

Bloco 3 (as conferências antes de abrir — `docs/LANCAMENTO.md` §10): as 16 caixas; eu executo as que cabem no staging e no `gh` (Task 10) e deixo marcadas as que são só suas (cobrança real de R$ 5, Sentry no painel, alertas de fatura, caixa de e-mail do convite).

---

## Eu (assistente) — tarefas

### Task 0: Inventário e pesquisa da rede de anúncios (paralela a tudo)

**Files:**

- Create: `docs/auditoria/2026-10-21-lancamento-inventario.md` (o estado real: Frentes 1–3 feitas com evidência; v3 e anúncios: feito × aberto, por arquivo e linha; `ESTADO-DO-LANCAMENTO.md` será reescrito na Task 9)
- Create: `docs/pesquisa/2026-10-21-rede-de-anuncios.md` (pelo subagente `pesquisador`)

- [ ] **Step 1:** Escrever o inventário a partir dos dois relatórios de levantamento (os textos estão no ledger deste plano).
- [ ] **Step 2:** Pesquisa (subagente `pesquisador`, com fontes): redes que funcionam numa SPA com COOP `same-origin` + COEP `credentialless`/DIP, com público que inclui menores (sem anúncio personalizado), no Brasil, com formato **premiado** na web (AdSense "rewarded ads for web"/H5 Games Ads, Ad Manager, alternativas), exigências de domínio e aprovação, receita típica (CPM BR), e o que cada uma exige na CSP (hosts de `script-src`, `frame-src`, `img-src`, `connect-src`). Saída: tabela comparativa + recomendação + lista de hosts da CSP da rede recomendada.
- [ ] **Step 3:** Registrar a recomendação em "Você — Bloco 2"; a Task 4 usa os hosts.

### Task 1: Ramo, flags no staging e prova da tela com 3 cartões

**Files:**

- Modify: nenhum arquivo versionado além do ledger; operação no staging
- Test: `tests/e2e-publico/planos-v3.e2e.ts` (novo, Task 3 cria; aqui só a conferência manual por Playwright no scratchpad)

- [ ] **Step 1:** `git checkout -b lancamento/estado-3 main`.
- [ ] **Step 2:** Ligar `venda_planos_v3` no banco do staging pelo CLI (`operacao.cjs` não tem comando de flag: usar `psql` pelo pooler: `UPDATE flags SET ligada = true WHERE nome = 'venda_planos_v3'` — conferir o nome das colunas em `server/db/schema.ts`), `stt_ao_vivo` e `anuncios` continuam desligadas.
- [ ] **Step 3:** Playwright ad hoc contra o staging (config do scratchpad): a tela Planos mostra 3 cartões (Grátis, Essencial, Premium), sem "Ao Vivo"; `GET /api/billing/status` devolve `planosAVenda: ['essencial','premium']`. Foto para o ledger.
- [ ] **Step 4:** Registrar no ledger o que a tela mostra de errado (textos "Grátis ou Premium", comparação, voz) para a Task 3.

### Task 2: Cobrança por plano provada (change 8.3)

**Files:**

- Create: `tests/integration/billing-por-plano.test.ts`
- Modify: `server/routes/billing.ts:419` (mensagem fixa "esta conta já tem o Premium pago" → o nome do plano atual via `PLAN_MATRIX[plano].nome`), outros textos fixos "Premium" em `server/routes/billing.ts` e `server/lib/billingEventos.ts` (grep `'Premium'`)
- Modify: `openspec/changes/planos-v3-e-rota-inteligente/tasks.md` (8.3 → `[x]` quando concluída a parte de testes; a "conferência no sandbox" fica na Task 10)

**Interfaces:**

- Consumes: `planoPeloPagamento(valor, { parcelas })`, `valoresDasParcelas(anual, 12)`, `PLAN_MATRIX` de `src/core/planos.ts`; `aplicarEvento` de `server/lib/billingEventos.ts`; `billingEventsRepo.marcarSeNovo`.
- Produces: tabela de testes por plano × ciclo × evento.

- [ ] **Step 1: Teste que falha** — `tests/integration/billing-por-plano.test.ts` com `describe.each` sobre `[['essencial', 9.9, 79.9], ['premium', 19.9, 149.9], ['aovivo', 39.9, null]]`: (a) `PAYMENT_CONFIRMED` com o valor mensal concede o plano e `ciclo: 'mensal'`; (b) com o valor anual (quando existe) concede `ciclo: 'anual'` com fim ≥ 365 dias; (c) 12 parcelas do anual (`valoresDasParcelas`) concedem na 1ª parcela e não encurtam o período nas seguintes; (d) `PAYMENT_CHARGEBACK_REQUESTED` derruba o plano; (e) valor de um plano **fora de venda** (R$ 39,90 com flags desligadas) concede mesmo assim e grava o motivo (Review Focus 1); (f) `POST /api/billing/trocar` de essencial→premium grava `trocaPara` e o webhook com o valor novo conclui a troca; premium→essencial idem; `aovivo` é recusado com `plano_fora_de_venda` quando `stt_ao_vivo` está desligada; (g) a mensagem de "já tem o plano pago" cita o nome do plano atual.
- [ ] **Step 2:** `npx vitest run tests/integration/billing-por-plano.test.ts` → FAIL nos casos (g) e no que mais faltar.
- [ ] **Step 3:** Corrigir o mínimo em `billing.ts`/`billingEventos.ts` (texto pelo nome do plano; qualquer ramo que assuma só `premium`).
- [ ] **Step 4:** `npx vitest run tests/integration/billing-por-plano.test.ts tests/integration/billing-*.test.ts tests/planos-matriz.test.ts tests/planos-n-pagos.test.ts` → PASS.
- [ ] **Step 5:** Commit `test(billing): cobrança por plano (essencial/premium/aovivo × mensal/anual/12x × webhook/troca/chargeback)`.

### Task 3: Tela de Planos e textos para 3–4 planos (change 9.1, 9.4; 9.2/9.3 conferidos)

**Files:**

- Modify: `src/components/views/Planos.tsx`, `src/components/views/planos/quatroPlanos.ts` (comparação e perguntas com as horas da matriz; nada de "Ao Vivo" nem voz neural com as flags desligadas — P1/P5), `src/components/views/planos/SuaAssinatura.tsx`, `src/components/views/admin/PainelCobranca.tsx` (textos "Grátis ou Premium" → genéricos pelo nome do plano), `src/components/views/captura/niveis/*` (seletor com cadeado, 9.2: conferir e corrigir)
- Modify: catálogos `public/i18n/{pt-BR,en,es,ar,xx}.json` (ou onde `scripts/i18n` apontar) para as chaves novas
- Test: `tests/planos-tela-v3.test.tsx` (novo; componente com `prova.aVenda` = `['essencial','premium']` e flags) e `tests/e2e-publico/planos-v3.e2e.ts` (novo: liga a flag no PGlite do e2e via API de admin ou semente, abre Planos, vê 3 cartões, abre o checkout do Essencial até a tela de pagamento simulado)

**Interfaces:**

- Consumes: `planosAVenda`, `PLAN_MATRIX`, `useFlag('venda_planos_v3')`, `useFlag('stt_ao_vivo')`, `useFlag('voz_natural')`.
- Produces: nenhuma nova.

- [ ] **Step 1:** Skill `copy-br-etica` carregada; ler `docs/ofertas.md` e `design.md` §9.
- [ ] **Step 2: Testes que falham** — `tests/planos-tela-v3.test.tsx`: com `['essencial','premium']` renderiza 3 cartões na ordem Grátis, Essencial, Premium com "5 h/mês" e "20 h/mês"; não contém "Ao Vivo"; com `voz_natural` desligada não contém "voz neural"; com `['essencial','premium','aovivo']` renderiza 4; a comparação não contém "Grátis ou Premium". Run → FAIL.
- [ ] **Step 3:** Implementar; `grep -rn "Grátis ou Premium\|Premium\b" src/components/views/planos src/components/views/Planos.tsx src/components/views/admin` e trocar o que é texto de 2 planos.
- [ ] **Step 4:** `npx vitest run tests/planos-tela-v3.test.tsx tests/planos*.test.ts* && node scripts/i18n/orfas.mjs && node scripts/i18n/cobertura.mjs --check && node scripts/i18n/pseudo.mjs --check` → 0.
- [ ] **Step 5:** `npx playwright test -c playwright.publico.config.ts tests/e2e-publico/planos-v3.e2e.ts` → PASS.
- [ ] **Step 6:** Commit `feat(planos): tela e textos para 3–4 planos à venda (v3), sem prometer o que a flag não dá`.

### Task 4: Anúncios — consentimento, CSP por configuração e provedor real (change 11.2–11.4)

**Files:**

- Create: `src/components/anuncios/ConsentimentoDeAnuncios.tsx` (folha única: o que é mostrado, "sem anúncio personalizado", o que é coletado, botões "Aceitar"/"Agora não"; grava `consentimentos.anuncios`; nunca aparece para perfil protegido; aberta a partir de Ajustes → Privacidade e no primeiro espaço elegível com a flag ligada)
- Modify: `src/lib/preferencias.ts` (já tem `anuncios` no `Consentimento`; só a tela), `src/components/views/Ajustes*` (entrada "Anúncios" com o estado e a porta "Sem anúncios")
- Create: `src/lib/anuncios/provedores/adsense.ts` (ou o nome da rede recomendada): `ProvedorDeAnuncios` que carrega o script da rede **sob demanda, só depois do consentimento e com a flag ligada**, uma vez, com `data-ad-client` de `VITE_ANUNCIOS_CLIENTE`; desenha `nativo` em `<ins>`; `premiado` só se a rede suportar (Task 0), senão o espaço premiado fica sem provedor
- Modify: `src/lib/anuncios/ligar.ts` (registra o provedor real em produção quando `VITE_ANUNCIOS_REDE` e `VITE_ANUNCIOS_CLIENTE` existem; a demonstração continua só em DEV)
- Modify: `server/http/csp.ts` (hosts da rede entram em `script-src`, `frame-src`, `img-src`, `connect-src` **só** quando `ANUNCIOS_HOSTS` (lista separada por vírgula) está definida E a flag `anuncios` está ligada no banco — a CSP é por requisição no Express; no `_headers` estático (`scripts/vite/cabecalhos.ts`) a CSP é fixa no build, então o Worker precisa servir o `index.html` com a CSP dinâmica quando os anúncios estão ligados: decidir com o revisor a forma mais simples (um cabeçalho `Content-Security-Policy` sobreposto pelo Worker em `worker.ts` para `text/html` quando a flag está ligada) — registrar a decisão no ledger)
- Modify: `server/lib/config.ts` (`ANUNCIOS_HOSTS`, `VITE_ANUNCIOS_REDE`, `VITE_ANUNCIOS_CLIENTE` documentadas), `.env.production.example`, `docs/flags.md:210` (o que "ligar" passa a exigir), `docs/deploy.md`
- Test: `tests/seguranca/csp-estreita.test.ts` (continua passando com a flag desligada), `tests/seguranca/csp-anuncios.test.ts` (novo: com `ANUNCIOS_HOSTS` e flag ligada os hosts aparecem só nas diretivas certas; com a flag desligada, não), `tests/anuncios-consentimento-tela.test.tsx` (novo), `tests/anuncios-provedor-real.test.tsx` (novo: sem consentimento → nenhum `<script>` inserido e nenhum `fetch`; com consentimento + flag → o script é inserido uma vez; perfil protegido → nada — Review Focus 2 e 3)

**Interfaces:**

- Consumes: `podeMostrar`, `registrarProvedorDeAnuncios`, `lerPreferencias().consentimentos.anuncios`, `diretivasDeCsp(env)`.
- Produces: variáveis `ANUNCIOS_HOSTS`, `VITE_ANUNCIOS_REDE`, `VITE_ANUNCIOS_CLIENTE`; evento `babel:consentimento-anuncios` para os espaços reavaliarem.

- [ ] **Step 1:** Testes acima → FAIL.
- [ ] **Step 2:** Implementar (copy pela skill `copy-br-etica`; os textos nos 4 catálogos).
- [ ] **Step 3:** `npx vitest run tests/seguranca/csp-estreita.test.ts tests/seguranca/csp-anuncios.test.ts tests/anuncios-*.test.ts* tests/politicaDeAnuncio.test.ts tests/espacoDeAnuncio.test.tsx` → PASS; `npm run lint`; i18n 0.
- [ ] **Step 4:** Commit `feat(anuncios): consentimento, CSP por configuração e provedor da rede (desligado por padrão)`.

**Ruling R32 (pesquisa `docs/pesquisa/2026-10-21-rede-de-anuncios.md`, 21/10):** o GPT/AdSense do Google não suporta COEP e exige CSP por nonce. Desenho adotado: uma **origem de anúncios própria** (`ads.<domínio>`; no staging um caminho `/anuncios/espaco.html` servido pelo mesmo Worker sem COOP/COEP e com CSP própria larga) que carrega o GPT e desenha o espaço; o app embute essa página por `<iframe credentialless>` (Chrome/Edge; sem suporte = sem provedor = nada aparece) e a CSP do app só abre `frame-src https://ads.<domínio>` com a flag ligada. Recompensa do premiado: a página de anúncios manda `postMessage` com um token assinado pelo servidor (`exibicaoId`), e a Task 5 credita com teto diário — não existe SSV do Google na web. Logo: `ANUNCIOS_HOSTS` vira `ANUNCIOS_ORIGEM` (uma origem), o provedor é `src/lib/anuncios/provedores/iframe.ts`, e a página de anúncios fica em `public/anuncios/espaco.html` + regras no `worker.ts`/`_headers` para servi-la sem isolamento. Custo se errado: Firefox sem anúncios (aceito) e uma origem a mais para o dono configurar.

### Task 5: Anúncios — recompensa do premiado no servidor (spec "O premiado é sempre escolha")

**Files:**

- Create: `server/routes/anuncios.ts` (`POST /api/anuncios/premiado` `{ espaco, exibicaoId }` → credita a recompensa do espaço: `nuvem-30` = 30 min de amostra de nuvem no mês (`FRANQUIA_DE_ALIVIO` vira recompensa quando a flag está ligada), `loja-seeds`/`fim-premiado`/`ajuda-premiada`/`tema-24h` = Seeds ou tema conforme `design.md`; idempotente por `(userId, exibicaoId)`; tetos: por pessoa/dia (`LIMITE_DE_PREMIADOS` = 5) e global/dia (`TETO_GLOBAL_DE_PREMIADOS_POR_DIA`, em `src/core/planos.ts` ao lado das cotas, valor inicial 2 000) → 429 `teto_do_dia`; perfil protegido → 403)
- Create: migration Drizzle `server/db/migrations-pg/00NN_anuncios_premiados.sql` + tabela `anuncios_premiados (user_id, exibicao_id, espaco, dia, criado_em)` com unique `(user_id, exibicao_id)` e índice por `dia`
- Modify: `server/http/app.ts` (montar a rota; limitador de escrita), `src/lib/anuncios/pedido.ts`/`EspacoDeAnuncio.tsx` (o provedor chama `aoRecompensar(exibicaoId)` ao fim do premiado → `POST`), `src/core/planos.ts` (constantes dos tetos; nada de preço muda)
- Test: `tests/integration/anuncios-premiado.test.ts` (idempotência, tetos por pessoa e global, perfil protegido 403, flag desligada 404/503, crédito de nuvem aparece em `/api/me/uso` — Review Focus 3 e 4), `tests/contratos/*` se houver snapshot de rotas (`npm run contrato:api`)

- [ ] **Step 1:** Testes → FAIL. **Step 2:** Implementar. **Step 3:** `npx vitest run tests/integration/anuncios-premiado.test.ts tests/integration/limpeza-*.test.ts && npm run contrato:api && node scripts/testes/rotas-sem-caracterizacao.mjs` → 0. **Step 4:** Commit `feat(anuncios): recompensa do premiado creditada pelo servidor com tetos por pessoa e global`.

### Task 6: Página de bancada e prova real com o isolamento ligado (change 11.1)

**Files:**

- Create: `public/bancada-anuncios.html` (só em staging/dev: uma página com COOP/COEP/DIP iguais aos do app que carrega o provedor real com o cliente de teste da rede e um `nativo` + um `premiado`; sem conta; a flag não importa aqui — é bancada) ou, se a rede exigir domínio aprovado, documentar o resultado "aguardando aprovação do domínio"
- Create: `tests/e2e-publico/bancada-anuncios.e2e.ts` (a página carrega sem erro de CSP/COEP no console quando `ANUNCIOS_HOSTS` está definido; com ele vazio, nenhum script externo)
- Modify: `docs/auditoria/2026-10-21-anuncios-bancada.md` (o que foi provado, com e sem `CROSS_ORIGIN_ISOLATION=dip`)

- [ ] Steps: teste → implementar → `npx playwright test -c playwright.publico.config.ts tests/e2e-publico/bancada-anuncios.e2e.ts` → publicar no staging (`gh workflow run deploy-worker.yml …`) e abrir no Chrome real (console sem violação) → relatório → commit.

### Task 7: Política de privacidade e termos (change 11.3 + saneamento)

**Files:**

- Modify: `public/privacidade.html` (Fly.io → Cloudflare Workers (app) + Supabase (banco), linha 154; seção "Anúncios" (o que é mostrado, sem personalização, consentimento, sem anúncio para menores, como desligar); DeepInfra/Workers AI condicionados à voz natural; parágrafo de transferência internacional com marcador `<!-- DONO: cláusulas-padrão após os DPAs -->`; razão social/CNPJ/contato como marcadores `[DONO]`)
- Modify: `docs/lgpd/operadores.md` (coerência), `public/termos.html` (menção aos planos Essencial/Premium e ao Ao Vivo "quando disponível"; manter as marcações "a validar")
- Test: `tests/politica-de-privacidade.test.ts` (novo: cada operador da tabela de `docs/lgpd/operadores.md` aparece em `privacidade.html`; `Fly` não aparece; a seção de anúncios existe; nenhum `[DONO]` sobra quando `process.env.LANCAMENTO_FINAL=1` — guarda para o dia do corte)

- [ ] Steps: teste → implementar (copy pela skill) → `npx vitest run tests/politica-de-privacidade.test.ts tests/fontes-no-html.test.ts` → commit `docs(lgpd): política com Workers/Supabase, anúncios e voz; termos com os planos v3`.

### Task 8: Vozes "básica" e "boa" — medir antes de prometer (decisão 10)

**Files:**

- Create: `docs/auditoria/2026-10-21-vozes-por-nivel.md` (skill `custo-de-ia`: custo por 1 000 caracteres e latência de 3 candidatos por nível com retenção zero — Workers AI, DeepInfra, outros já no registro — sobre 20 frases pt/en/es; recomendação por nível)
- Modify: nada de código nesta tarefa (a escolha é do dono; `voz_natural` segue desligada — P5)

- [ ] Steps: bancada existente (`scripts/eval-fala/bancada/`) ou script curto no scratchpad com as chaves do `.env` → tabela → recomendação em "Você — Bloco 2".

### Task 9: Documentos de lançamento e procedimento de abertura

**Files:**

- Rewrite: `docs/ESTADO-DO-LANCAMENTO.md` (datado de hoje; "o que está pronto" com as Frentes 1–3 feitas e evidência; "o que falta" = este plano; decisões abertas atualizadas)
- Modify: `docs/LANCAMENTO.md` (§8 passo "flags do lançamento": `venda_planos_v3` ligada, `anuncios` desligada; §10 ganha as caixas: "3 cartões na produção", "checkout do Essencial no sandbox", "anúncio: página de bancada sem violação"; §11 "abrir a venda": procedimento passo a passo — `SIGNUP_ENABLED`/`CHECKOUT_ENABLED` por `wrangler secret put`, cadastro no Supabase, `ANUAL_ENABLED` depois do jurídico, `anuncios` depois do jurídico + rede aprovada)
- Modify: `docs/runbook.md` (§"Abrir e fechar portas": cadastro, venda, anual, anúncios, IA), `docs/flags.md` (`venda_planos_v3`, `anuncios` com o que "ligar" exige)
- Modify: `openspec/changes/planos-v3-e-rota-inteligente/{proposal,tasks}.md` (estado real; 0.1 `[x]` com referência ao §11; itens feitos marcados), e **sincronizar** `specs/anuncios-no-gratis/spec.md` para `openspec/specs/anuncios-no-gratis/spec.md` (`openspec` CLI, sem arquivar a change: os grupos 4–6, 10 e Q continuam)
- Test: `tests/docs-sem-fly.test.ts` continua verde; `tests/integration/alertas-e-painel.test.ts` idem

- [ ] Steps: escrever → `npx prettier --check` nos tocados → commit `docs(lancamento): estado real, procedimento de abrir a venda e flags do lançamento`.

### Task 10: Prova no staging e conferências que cabem a mim (§10)

**Files:**

- Modify: `docs/LANCAMENTO.md` §10 (marcar as caixas provadas com data e run), `docs/auditoria/2026-10-21-lancamento-inventario.md` (seção "Provado no staging")

- [ ] **Step 1:** Deploy do ramo no staging (`gh workflow run deploy-worker.yml --ref lancamento/estado-3 -f ambiente=staging -f ref=lancamento/estado-3`); `venda_planos_v3` ligada no banco do staging.
- [ ] **Step 2:** Com a chave **sandbox do Asaas** (Você, bloco 1) em `.secrets.staging.json`: checkout do Essencial mensal, do Premium mensal e anual em 12x com o cartão de teste; webhook do sandbox concede; troca essencial→premium; arrependimento de 7 dias (caixas 9 e 10 do §10). Sem a chave: registrar "aguardando chave sandbox".
- [ ] **Step 3:** `crossOriginIsolated === true` no staging (caixa 4); ZAP baseline (caixa 7); chaves de emergência `AI_ENABLED=0`, `CHECKOUT_ENABLED=0`, `SIGNUP_ENABLED=0` (caixa 16); erro de teste no Sentry do staging se DSN houver (caixa 12); teste de 14 dias numa conta nova (caixa 10).
- [ ] **Step 4:** E2E da porta e dos planos (Task 3) contra o staging real.
- [ ] **Step 5:** Registrar; commit.

### Task 11: Portão e merge

- [ ] Verificação completa (`typecheck`×3, `lint`, `npm test`, `morto:*`, `build`, `worker:build`, `tests/worker`, `fumaca:worker`, os 3 Playwright pelo CI).
- [ ] Revisão final (opus) do ramo `main..lancamento/estado-3` com foco em cobrança, anúncios/CSP, menores e LGPD.
- [ ] Merge `--ff-only` na `main` com CI verde; deploy do staging da `main`.
- [ ] Recap ao dono com a lista "Você" atualizada: o que falta para apertar o botão.

## Ordem e paralelismo

- Paralelas desde o início (arquivos disjuntos, worktrees): **Task 0** (pesquisa), **Task 2** (server/billing + tests), **Task 3** (src/components/views/planos), **Task 7** (public/\*.html + docs/lgpd), **Task 8** (medição, sem código).
- Depois: **Task 4** (depende da rede da Task 0 só para os hosts; o resto pode começar), **Task 5** (server/routes novo; paralela à 4), **Task 6** (depende de 4), **Task 9** (depende de 2–7 para dizer a verdade), **Task 10** (depende do deploy e da chave sandbox), **Task 11**.
- Estimativa de calendário: 1 semana de código com agentes em paralelo; o lançamento em si depende do Bloco 1 (Asaas PJ e Workers Paid são os prazos longos) e, para os anúncios ligados, do Bloco 2 (rede + jurídico).
