# Inventário do lançamento — MVP feito, planos v3 e anúncios: feito × aberto (2026-10-21)

Status: levantamento · Autor: Guilherme (com o assistente)

Levantamento do código em 21/10/2026, na branch `lancamento/estado-3`. Caminhos a partir da raiz do repositório.
Registra fatos (feito, parcial, aberto) com arquivo:linha; as propostas ficam no plano
`docs/superpowers/plans/2026-10-21-lancamento-estado-3.md`. Onde código e documento divergem, vale o código.

## 1. Resumo em cinco linhas

1. As Frentes 0–3 do MVP estão no código; a Frente 1 tem uma lacuna de prova (Asaas real) e o captcha só falta configurar.
2. Produção não foi implantada: só o staging roda; login e pagamento reais nunca foram provados.
3. Planos v3 (matriz, webhook por valor, troca, tela) existem atrás de `venda_planos_v3`; faltam provas por plano (8.3) e telas/textos (9.x) para vender.
4. Anúncios têm política, 15 espaços, 6 encaixes e provedor de demonstração (só DEV); faltam consentimento, CSP, provedor real, recompensa no servidor, bancada e jurídico.
5. A política de privacidade já nomeia a maioria dos operadores, mas lista o Fly.io (errado) e omite voz (DeepInfra/Workers AI); os Termos §3–§4 seguem "a validar".

## 2. MVP (Grátis + Premium): o que está feito

O documento-fonte do "plano de 02/10" não existe; a única lista é a tabela de `docs/ESTADO-DO-LANCAMENTO.md` §3.

| Frente | Item                                  | Situação | Evidência                                                                                                                                                                                                                                                                          |
| ------ | ------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0      | Vitrine local                         | Feito    | `package.json:66`, `docs/vitrine.md`, `scripts/vitrine/` (asaas-falso, semear, contas.json)                                                                                                                                                                                        |
| 1      | Chargeback revoga                     | Feito    | `server/lib/billingEventos.ts:423-425`, `:642-660`; `AWAITING_CHARGEBACK_REVERSAL` não reativa (:426-435); `tests/integration/billing-webhook-eventos-que-derrubam.test.ts`, `billing-trocar-plano.test.ts`                                                                        |
| 1      | Conferir atraso/estorno/cancelamento  | Parcial  | Código: `conferirPagamento`, `STATUS_DE_*` (`billingEventos.ts:552-557`), OVERDUE :397, DELETED :496. Falta a prova no sandbox/Asaas real (LANCAMENTO §10)                                                                                                                         |
| 1      | Excluir conta com 12x                 | Feito    | `server/routes/me.ts:302-304`; `server/lib/encerramentoDeAssinatura.ts:24-32,140-161`                                                                                                                                                                                              |
| 1      | Primeiro admin por CLI                | Feito    | `server/operacao/contas.ts:1-24`, `server/operacao/cli.ts:12,28-30,46`, `tests/integration/contas-cli.test.ts`, `docs/STAGING.md:51-52`                                                                                                                                            |
| 1      | Captcha no cadastro                   | Parcial  | Cliente pronto (Turnstile): `src/lib/turnstile.ts:26`, `src/components/auth/CaptchaDaPorta.tsx`, `src/components/Login.tsx:93,122-210`. Quem confere é o Supabase. Falta widget, site key no build, secret no Supabase, teste no staging (`.env.production.example:310` comentado) |
| 1      | Webhook sem dados pessoais            | Feito    | `server/db/repositories/billingEvents.ts:14,114`, `server/db/schema.ts:837`, `server/routes/billing.ts:1109-1115`                                                                                                                                                                  |
| 2      | Cota da nuvem do site estático        | Feito    | `functions/quest/stt.js:9-61` (IP/dia 15 min, cota do site, freio; 429 `cota_do_dia`/`cota_do_site`/`devagar`; vale para stt/mt/tts)                                                                                                                                               |
| 3      | Telas de plano, avisos, pop-ups       | Parcial  | Existem: `src/components/views/Planos.tsx` (abas :699), `views/planos/*`, `conta/AvisoDePagamentoAtrasado.tsx`, avisos de fim do teste (80 %/100 %). "Revisado" não é verificável pelo código                                                                                      |
| 3      | Medidor do uso do dia                 | Feito    | `src/components/views/captura/AvisoDoUsoDoDia.tsx` (`LiveCapture.tsx:1909`), `src/lib/avisoDoUsoDoDia.ts`, `Planos.tsx:753`                                                                                                                                                        |
| 3      | Tela de admin                         | Feito    | `src/components/views/Admin.tsx`, `views/admin/` (PainelContas, Flags, Resumo, Erros, Cobranca)                                                                                                                                                                                    |
| 4      | Staging com cadastro e venda fechados | Parcial  | Staging feito (`docs/STAGING.md:45-52`); produção não implantada (`LANCAMENTO.md:307`). Nunca provados: login/pagamento reais, E2E com conta real, intérprete em Chrome real (ESTADO:15)                                                                                           |
| 5      | Bancada de IA                         | Aberto   | Existe `openspec/changes/bancada-multi-modelo`; espera chaves pagas                                                                                                                                                                                                                |
| 6      | Desempenho                            | Parcial  | k6 no staging e HKDF feitos; resto não                                                                                                                                                                                                                                             |
| 7      | Saneamento dos documentos             | Parcial  | O próprio `ESTADO-DO-LANCAMENTO.md` está defasado (seção 8)                                                                                                                                                                                                                        |

Dois pontos de decisão do dono ainda sem resposta: e-mails de cobrança do Asaas (`docs/asaas-notificacoes.md:6-9` manda ligar;
`docs/lgpd/operadores.md:88-93` manda desligar; o app não os envia e o webhook marca `past_due` sem eles) e o serviço do Ao Vivo.

## 3. Planos v3

### 3.1 O que existe

- **Matriz** (`src/core/planos.ts`, 733 linhas): `PlanoDeAssinatura` em :65; legado só `pro`→`premium` (:78); `NIVEIS_DA_NUVEM` :183; `PARCELAS_DO_ANUAL = 12` :91; `DIAS_DO_TESTE_PREMIUM = 14` :98; `PLANO_DO_TESTE = 'premium'` :605.

| Plano     | Linha | Mensal | Anual  | `flagsDeVenda`                   | Nuvem                                                         |
| --------- | ----- | ------ | ------ | -------------------------------- | ------------------------------------------------------------- |
| free      | :210  | —      | —      | —                                | 0                                                             |
| essencial | :240  | 9,90   | 79,90  | `venda_planos_v3`                | 5 h/mês (18 000 s), 6 500 chamadas, 750 000 tokens            |
| premium   | :273  | 19,90  | 149,90 | —                                | 20 h/mês (72 000 s), 26 000 chamadas, 3 M tokens; dia 7 200 s |
| aovivo    | :317  | 39,90  | —      | `venda_planos_v3`, `stt_ao_vivo` | 20 h + 10 h ao vivo                                           |
| selfhost  | :354  | —      | —      | —                                | sem teto                                                      |

- **Flags** `venda_planos_v3` e `stt_ao_vivo` (:206-207) nascem desligadas (`migrations-pg/0001_triggers_e_flags.sql:147,153`). `planosAVenda(flagLigada)` (:594): tudo desligado → só Premium. `stt_ao_vivo` não gateia rota de nuvem ao vivo (não existe), só venda e textos.
- **Webhook por valor** (`server/routes/billing.ts:1077`; `server/lib/billingEventos.ts`): concede por `planoPeloPagamento(valor, {parcelas})` (`planos.ts:655`, `billingEventos.ts:241-242,313`); 12 parcelas via `valoresDasParcelas` (:685); valor vence a intenção (:357-359); validade `dueDate`+5 d, nunca encurta (:364-376). Cobre 9,90/79,90, 19,90/149,90, 39,90. Unicidade em `planos-n-pagos.test.ts`, `planos-matriz.test.ts`.
- **Assinar** (`billing.ts:359`): exige `planosAVendaPara` (:377) e `anualLigado()` (:385); só intenção. **Troca** (`/trocar` :587, `/trocar/cancelar` :667): próximo ciclo sem pro-rata, `alterarValorDaAssinatura` (`asaas.ts:349`), migração `0050_troca_de_plano.sql`, `recusaDaTroca` :515.
- **Tela** (`Planos.tsx` 1277 linhas + `views/planos/`): cartões = Grátis + `status.planosAVenda` + plano atual (:266-285); 2 cartões (flags desligadas), 3 (`venda_planos_v3`), 4 (+`stt_ao_vivo`); `DialogoTrocar`; aba de consumo por nível (`/api/me/uso` `porNivel`); `src/components/views/captura/niveis/` (medidor, cadeado) cobre parte do 9.2.

### 3.2 O que falta (`openspec/changes/planos-v3-e-rota-inteligente/tasks.md`)

O `tasks.md` está atrasado em relação ao código: 9.x e 11.2–11.5 constam `[ ]` mas há código (não conferido item a item).
Feitos: grupos 1, 2, 3, 7, 0.2 (ADR 0013), 8.1, 8.2. Abertos 0.1 e 0.3.

- **Vende-sem (precisam ficar prontos para abrir a venda):**
  - 8.3: testes de webhook/anual/12x/troca/chargeback por plano e conferência no sandbox (cobertura por plano não verificada).
  - 9.1 quatro cartões, comparação e perguntas com as horas; 9.2 medidor de nuvem em Ajustes e na captura, seletor com cadeado; 9.3 ofertas nos momentos do protótipo; 9.4 telas da assinatura, admin e textos "Grátis ou Premium".
  - Bug de texto: `billing.ts:419` fixa "esta conta já tem o Premium pago".
- **Pós-lançamento:** 4.1–4.3 (política de rota, `src/core/rota/politicaDeRota.ts`); 5.1–5.5 (selo de três etiquetas, motivo, aviso de rota, consentimentos, 4 catálogos); 6.1–6.4 (flag `rota_inteligente`, pipeline, e2e, rollout); 10.1–10.4 (nuvem ao vivo); Q.1–Q.8 (qualidade no aparelho).
- Do dono (design.md §11, itens 3, 12, 13): confirmar que não há assinatura manual no Asaas a R$ 39,90 ou R$ 179; serviço do Ao Vivo; rede de anúncios, domínio e jurídico; abrir a venda. As demais 14 decisões foram delegadas em 09/10 (padrões valem; `design.md:270-303`). `tasks.md` 0.1 e `proposal.md:3` ("nada implementado") estão desatualizados.

## 4. Anúncios

### 4.1 O que existe

- **Política** `src/core/anuncios/politicaDeAnuncio.ts` (190 linhas), `podeMostrar` (:147-190) nega, em ordem: flag desligada; espaço/formato inválido; edição estática; `semAnuncios` ou `emTeste`; `perfilProtegido`; headset ou sem rede; captura/intérprete/rodada ativa; conta < 3 dias (`IDADE_MINIMA_DA_CONTA_MS`); sem consentimento `anuncios`; intersticial < 5 min. 15 espaços (:34-50), 3 formatos (nativo, premiado, intersticial; :54, :61-77).
- **Componente** `src/components/anuncios/EspacoDeAnuncio.tsx` (88): sem provedor → `null`; porta "Sem anúncios" → `{view:'planos'}`. Encaixes: `FimDaRodada.tsx:194` (`fim-premiado`) e `:232` (`fim-bloco`); `Play.tsx:3470`; `BibliotecaDoQuest.tsx:485`; `InicioDoQuest.tsx:489`; `LojaDoPrototipo.tsx:231`.
- **Provedor** `src/lib/anuncios/provedor.ts` (52): estado de fábrica `null`. Demonstração (`components/anuncios/demonstracao/*`): só `import.meta.env.DEV` + `localStorage['babel.px.anunciosDeProva']='1'`; `FluxoDoPremiado.tsx` (`LIMITE_DE_PREMIADOS = 5`); `ligar.ts` remove o import do build.
- **Dados**: `server/routes/me.ts:527,549` devolve `contaCriadaEm`; `src/lib/preferencias.ts:46` tem `'anuncios'` em `Consentimento` (padrão false, :101). Flag `anuncios` desligada (`docs/flags.md:210`).
- **Testes**: `politicaDeAnuncio`, `espacoDeAnuncio`, `anuncios-encaixes`, `anuncios-consentimento-e-conta`, `flags-anuncios`.
- A spec `anuncios-no-gratis` só existe dentro da change (`specs/anuncios-no-gratis/spec.md`); não foi sincronizada para `openspec/specs/`.

### 4.2 O que falta

- **Consentimento (11.3):** não há tela; nada de anúncios na política de privacidade.
- **CSP (11.4):** `server/http/csp.ts:112-128` só admite script próprio; `frameSrc` só com Turnstile (:134); `imgSrc` já `https:` (:123); `tests/seguranca/csp-estreita.test.ts:62,90-91` exige `script-src` sem host externo. Falta CSP por configuração, ativa só com a flag.
- **Provedor real (11.2/11.5):** nenhum adaptador de rede; rede não escolhida. AdSense exige domínio próprio e páginas públicas; premiado na web é programa com inscrição (design §7, l.201-202). COEP: `server/http/isolamento.ts:80,82`, modo `dip`, `config.ts:353`.
- **Recompensa do premiado no servidor:** endpoint não existe (spec: Seeds creditadas pelo servidor; amostra de nuvem com teto diário por pessoa e global). Sem a flag, `FRANQUIA_DE_ALIVIO` segue (`planos.ts:515`).
- **Bancada (11.1):** teste real com isolamento ligado em página de bancada, não feito.
- **Jurídico (11.6):** consulta ECA Digital não feita. Dono: rede, domínio, jurídico.

## 5. LGPD e termos

- **Política** (`public/privacidade.html`, 205 linhas; operadores em ~:150, itens :154-163). **Já nomeia:** Supabase (:111), Asaas (:118), OpenRouter (:85-88), Langfuse (:146), Google Web Speech (:75), Cloudflare/R2/Turnstile (:156-159), Resend (:160), Sentry (:162).
- **Errado:** :154 lista **Fly.io** ("servidor e banco, SP"); a hospedagem é Cloudflare Workers (app) + Supabase (banco).
- **Falta:** DeepInfra/Workers AI (voz natural do intérprete e do Quest); razão social, CNPJ e contato (dono); parágrafo de transferência internacional (LGPD art. 33), afirmável só após os DPAs; suboperadores atrás da OpenRouter (DeepInfra, Groq, Together, Cloudflare, Parasail); anúncios (4.2).
- **DPAs:** `docs/lgpd/operadores.md` (100 linhas) com cláusulas-padrão ANPD (Res. 19/2024); nenhuma linha marcada como aceita. Não há teste do conteúdo de operadores (`tests/fontes-no-html.test.ts` e a11y/rotas apenas).
- **Termos** (`public/termos.html`, "TEXTO A VALIDAR COM O JURÍDICO"): :55, :103 (§3: anual, 12x, teste, uso justo, cancelamento sem reembolso proporcional após 7 dias) e :150 (§4: uso justo 2 h/dia e 40 h/mês; a matriz v3 muda o Premium para 20 h/mês).
- **`ANUAL_ENABLED`:** `server/lib/config.ts:214` e :1493-1506 (`anualLigado`, só `=== '1'` abre); `billing.ts:54,382-385` (503 `anual_indisponivel`); `.env.production.example:222-224`. Hoje fechado até a validação dos Termos.

## 6. Portas e como abrir

| Porta              | Código                                           | Efeito                                                                                                                                    |
| ------------------ | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `SIGNUP_ENABLED`   | `config.ts:851-856`, `cadastroLigado` :1486-1490 | Ausente = aberto; `=0` → 403 `cadastro_fechado` e esconde "Criar conta". Supabase: "Allow new users to sign up" (`docs/runbook.md:41-45`) |
| `CHECKOUT_ENABLED` | `config.ts:300-305`, `checkoutLigado` :1477      | `=0` → 503 ao assinar/comprar; quem paga segue; força `vender_planos` desligada                                                           |
| `ANUAL_ENABLED`    | `config.ts:214,1493-1506`                        | Só `=1` abre o anual (à vista e 12x)                                                                                                      |
| `venda_planos_v3`  | flag de banco                                    | Liga Essencial (3 cartões); `+stt_ao_vivo` liga o Ao Vivo (4)                                                                             |
| `anuncios`         | flag de banco, `docs/flags.md:210`               | Antes de ligar: domínio próprio, rede, CSP, consulta jurídica                                                                             |

Produção sobe com `SIGNUP_ENABLED=0` e `CHECKOUT_ENABLED=0` via secrets do Worker (`LANCAMENTO.md:307`). Não há lista de espera nem
convite obrigatório, e **não há procedimento "abrir" escrito**: só o de fechar.

## 7. As 16 conferências do LANCAMENTO §10 (linhas 333-369)

Quem: D = só o dono; A = assistente; parcial = assistente prova no staging/sandbox e o dono fecha no real.

| #   | Conferência                                                                              | Quem                                     |
| --- | ---------------------------------------------------------------------------------------- | ---------------------------------------- |
| 1   | `/api/ready` 200 e origem direta 403                                                     | Parcial (após o deploy do dono)          |
| 2   | Conta de teste, e-mail pelo Resend, 2FA, sair/entrar                                     | Dono; parcial no staging                 |
| 3   | Sessão curta → áudio no `frasy-midia`                                                    | Dono no real; parcial no staging         |
| 4   | `crossOriginIsolated === true`                                                           | Assistente                               |
| 5   | `semanal/<data>.dump` no `frasy-backups`                                                 | Parcial (após produção); dono na segunda |
| 6   | Restaurar o dump                                                                         | Parcial (drill); decisão LGPD do dono    |
| 7   | ZAP Baseline                                                                             | Assistente                               |
| 8   | Cobrança real de R$ 5 e estorno                                                          | Dono                                     |
| 9   | Três ciclos no sandbox (mensal, anual, 12x), fim do período, arrependimento              | Parcial (com chave sandbox)              |
| 10  | Teste de 14 dias numa conta nova; recriar não renova                                     | Parcial (staging)                        |
| 11  | Termos §3–§4 pelo jurídico                                                               | Dono                                     |
| 12  | Erro de teste no Sentry sem e-mail/IP                                                    | Parcial (staging); dono no painel        |
| 13  | DPAs aceitos + política atualizada                                                       | Dono aceita; assistente edita            |
| 14  | Alertas de fatura Cloudflare/Supabase/Sentry                                             | Dono                                     |
| 15  | Convite ao responsável por e-mail, SPF/DKIM/DMARC                                        | Dono; parcial (`wrangler tail`)          |
| 16  | Chaves de emergência `AI_ENABLED=0`, `CHECKOUT_ENABLED=0`, `SIGNUP_ENABLED=0` no staging | Assistente; painel do Supabase é do dono |

## 8. O que está defasado em `docs/ESTADO-DO-LANCAMENTO.md`

Linhas do arquivo atual (atualizado em 18/10):

- :21-22, :24: "dois planos" (ADR 0011), Premium R$ 179/ano e "2 h/dia e 40 h/mês": a matriz atual tem Grátis, Essencial, Premium e Ao Vivo (ADR 0013), Premium R$ 149,90/ano e 20 h/mês (`planos.ts:273`).
- :25: "`essencial`/`pro` são lidos como `premium`": hoje `essencial` é plano próprio; o legado é só `pro` (`planos.ts:78`).
- :26: copy "Tradução rápida ao vivo"/"Tradução Nuance" do `planos-v2`: a tela v3 usa cartões por plano.
- :35-36: "Planos v2 inteiros, 0 caixas abertas": a change vigente é `planos-v3-e-rota-inteligente`.
- :53-60 (Frentes 0–7, "plano aprovado em 02/10"): sem estado por frente; seção 2 deste inventário traz Feito/Parcial/Aberto.
- :62-63: diz que a política não nomeia Cloudflare/R2, Resend, Sentry: nomeia desde 17/10 (`privacidade.html:156-162`); o que falta é voz (DeepInfra/Workers AI), suboperadores e remover Fly.io.
- :71: "12 DPAs": `operadores.md` tem 11 linhas de operador (conferir o número ao reescrever).
- :76-79: Termos e `ANUAL_ENABLED`: correto, mas sem o ajuste de §4 (20 h/mês) e sem os planos novos.
- :87: decisão #1 (e-mails do Asaas) segue aberta; #2 (assinaturas Pro a R$ 39,90) mudou: R$ 39,90 é hoje o preço do Ao Vivo, e há a pergunta 3 do design v3 (assinatura manual a 39,90/179).
- Não menciona: planos v3 e flags `venda_planos_v3`/`stt_ao_vivo`, anúncios (flag `anuncios`, política, demonstração), `SIGNUP_ENABLED`/`CHECKOUT_ENABLED` como portas de produção, captcha Turnstile (falta só configurar), branch `cloudflare/migracao` e portão G1 da Fase 5, nome Frasy.
- :44-45: "No ar hoje: só a edição estática" e "produção ainda não implantada": conferir antes da reescrita.

## 9. Provado no staging (21/10/2026)

Staging `https://frasy-staging.guigui-cruzeiro.workers.dev` na versão `0.1.0+2e5036e` (o ramo `lancamento/estado-3`
só tem testes e docs a mais), banco `frasy_staging`. Flag `venda_planos_v3` **ligada** às 17:07:03Z (fica ligada: é o
estado do lançamento); `anuncios` segue desligada. Horários em UTC. Contas descartáveis criadas pela Admin API do
Supabase e apagadas pela própria exclusão do app (`DELETE /api/me`, que também remove o login), conferido no fim:
nenhuma linha em `users` e nenhum usuário no Auth.

| Caixa do §10                     | Resultado                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 4. `crossOriginIsolated`         | **Provada (Chromium).** HeadlessChrome 156: `crossOriginIsolated === true`, `SharedArrayBuffer` disponível. `curl -sI /`: `cross-origin-embedder-policy: credentialless`, `cross-origin-opener-policy: same-origin`, `document-isolation-policy: isolate-and-credentialless`. Firefox: fica com o dono (o Firefox do Playwright não abre neste sandbox, ver `2026-10-21-anuncios-bancada.md`).                                                                          |
| 7. ZAP baseline                  | **Provada.** Run [39640692221](https://github.com/GuilhermeLVL/babel-play/actions/runs/39640692221): 0 FAIL, 7 WARN, 61 PASS (a anterior, 39530307523, tinha 8 WARN; o HSTS dos estáticos agora passa). Triagem abaixo.                                                                                                                                                                                                                                                 |
| 9. Os três ciclos no sandbox     | **Provada** (19:39–19:58Z, staging `0b82814`): mensal +35 d, anual à vista e 12x +370 d, arrependimento estornando o ano e o parcelamento inteiro. Ver "Cobrança provada no sandbox" abaixo.                                                                                                                                                                                                                                                                            |
| 10. Teste de 14 dias             | **Provada.** Conta nova adulta: `status.teste = disponivel`; um toque em "Testar 14 dias grátis" → selo "Premium · em teste" e "Seu teste termina em 14 dias" (17:10Z); entitlements `premium` com `teste.terminaEm`; nenhum pedido ao Asaas (navegador e `subscriptions`/`billing_events` vazios). Conta apagada pelo app (17:13:42Z) e recriada com o mesmo e-mail: `teste.estado = indisponivel` (`marca_usada`) e `POST /api/billing/teste` → 409 `teste_ja_usado`. |
| 12. Sentry sem e-mail nem IP     | **Não testável:** sem DSN no staging (`SENTRY_DSN` fora dos secrets do Worker e `VITE_SENTRY_DSN` fora das variáveis do Environment `staging`).                                                                                                                                                                                                                                                                                                                         |
| 16. Chaves de emergência         | **Provada**, uma por vez, cada uma restaurada antes da próxima (ver a tabela seguinte). O painel do Supabase ("Allow new users to sign up") fica com o dono.                                                                                                                                                                                                                                                                                                            |
| 3 cartões                        | **Provada no staging** (falta repetir na produção): `GET /api/billing/status` → `planosAVenda: ["essencial","premium"]`; Chromium logado numa conta Grátis: 3 cartões `gratis`, `essencial`, `premium`, sem "Ao vivo" nem "neural". E2E `planos-v3` verde contra o staging.                                                                                                                                                                                             |
| Checkout do Essencial no sandbox | **Provada**, menos a virada da troca pelo pagamento novo (o sandbox não gerou a fatura seguinte). Ver abaixo.                                                                                                                                                                                                                                                                                                                                                           |
| Anúncio: bancada sem violação    | **Provada** pela Task 6 em Chromium (`2026-10-21-anuncios-bancada.md`). Conferido de novo às 17:18Z com a flag desligada: zero origem de terceiros pedida em `/`, `/plano` e `/jogar`.                                                                                                                                                                                                                                                                                  |

**Chaves de emergência** (secret posto com `scripts/cloudflare/secrets.ts staging` e retirado com
`wrangler secret delete … --env staging`: o `secret bulk` só cria ou atualiza, então tirar a chave do arquivo e
reenviar **não** apaga o secret do Worker).

| Chave                | Ligada (UTC) | Efeito medido                                                                                                                     | Restaurada (UTC) | De volta                                                              |
| -------------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------- | ---------------- | --------------------------------------------------------------------- |
| `AI_ENABLED=0`       | 17:14:39     | `POST /api/ai/mt` (conta em teste) → 503 `ia_desligada`, 3 de 3 entre 17:14:45 e 17:14:54                                         | 17:15:07         | 17:15:12 `POST /api/ai/mt` → 200                                      |
| `CHECKOUT_ENABLED=0` | 17:15:24     | `POST /api/billing/assinar` → 503 `checkout_desligado`; `/api/abertura` `checkout:false`                                          | 17:15:33         | `/assinar` volta ao 501 (sem chave do Asaas); `checkout:true`         |
| `SIGNUP_ENABLED=0`   | 17:15:49     | conta nova (só no Auth) → 403 `cadastro_fechado`; conta existente segue (200); porta de login sem "Criar uma conta" e com o aviso | 17:16:23         | a mesma conta nova → 200; "Criar uma conta" de volta; `cadastro:true` |

Fim: `wrangler secret list --env staging` com os mesmos 8 nomes de antes, e `.secrets.staging.json` igual ao de antes.

**Triagem do ZAP (run 39640692221).** Nenhum FAIL. Os 7 WARN são os da Fase 4, todos aceitos:

- 10055 CSP: `img-src 'self' https: data: blob:` e `style-src 'unsafe-inline'`: aceitos (imagens de dicionário e
  Openverse; estilos inline do React).
- 90004 CORP ausente nos estáticos: já registrado (Fase 4, avaliar `same-origin` sem quebrar a imagem `og`).
- 10015/10049 cache: estáticos com hash são imutáveis de propósito; o HTML sai `max-age=0, must-revalidate` e `/api/flags` `private, max-age=30` (público, sem dado de conta).
- 10027 comentários e 10094 Base64 nos bundles: ruído de bundle minificado.
- 90005 `Sec-Fetch-*` ausentes: é sobre o pedido do próprio ZAP, não sobre o app.

**E2E da porta e dos planos contra o staging** (17:17:43–17:17:54Z, sem `webServer`, `baseURL` = staging): `login-pseudo` e
`planos-v3` verdes; os 6 de `acessibilidade-porta` seguem `fixme` (contraste dos links `.qen-link`, `VIOLAM_HOJE`, já
conhecido). O `planos-v3` precisou da conta `e2e@babel.test` no Auth do staging: criada antes e apagada pelo app depois.

**Limpeza.** A linha órfã `users` `770fd93f…` (sobra da Task 6, sem usuário no Auth) foi apagada pelo caminho do app:
usuário recriado no Auth com o MESMO id, login e `DELETE /api/me` (17:13:55Z, 200, `users: 1`). Ficam, por desenho,
duas marcas em `marcas_de_teste` (HMAC dos e-mails descartáveis; poda em 730 dias).

### Cobrança provada no sandbox (21/10/2026)

Staging `0.1.0+0b82814` (com a correção do `User-Agent`, `f1d347af`), `ASAAS_API_KEY` (sandbox) e
`ASAAS_WEBHOOK_TOKEN` nos secrets, webhook `frasy-staging` do sandbox apontado para `/api/billing/webhook/asaas`. Horários
em UTC. Cada fluxo numa conta descartável adulta, iniciado **pelo app** (`POST /api/billing/assinar`); a fatura foi paga
com o cartão de teste do Asaas pela API (`POST /v3/payments/{id}/payWithCreditCard`, o que o pagador faria na página
do Asaas — nenhum navegador automatizado). O plano conferido por `GET /api/billing/status` e
`GET /api/me/entitlements` antes (sempre `free`, `assinatura: null`) e depois; o webhook, pelo `billing_events` do staging.

**O defeito que bloqueava** (achado na 1ª rodada, 19:14Z, versão `25533fd`): no Worker toda chamada ao Asaas caía em
400 `user_agent_not_informed` — o `fetch` do Node manda `User-Agent`, o do Worker não. `/assinar` respondia 502 e a
conferência do webhook 500 (nenhum pagamento concederia plano). Corrigido em `f1d347af`, publicado pelo `deploy-worker.yml`
(run 39662874240).

| Prova                         | Resultado                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Essencial mensal              | **Provada.** `/assinar` → 200, `sub_sp26feko862y6i2s` (R$ 9,90, `trialing` até pagar). `pay_w244uytbzq9zxxbq` pago 19:39Z → `PAYMENT_CONFIRMED` `aplicado` às 19:41:53 → `essencial`, `active`, `valeAte` 26/11/2026 12:00 (vencimento 22/10 + 35 d), `renovacaoAutomatica: true`; entitlements `plan: essencial`.                                                                                                                                                                                                                                                    |
| `PAYMENT_REFUNDED` revoga     | **Provada.** Estorno do `pay_w244…` no sandbox (19:42:40) → `PAYMENT_REFUNDED` `aplicado` às 19:42:43 → `canceled`, `valeAte` = agora, entitlements `free`.                                                                                                                                                                                                                                                                                                                                                                                                           |
| Premium mensal                | **Provada.** `/assinar` → 200, `sub_rh7s2n0p01jogex5`; `pay_4d6k55aqsu0cs6zb` (R$ 19,90) pago 19:44:46 → `aplicado` 19:46:18 → `premium`, `active`, `valeAte` 26/11, `proximaCobranca` 22/11.                                                                                                                                                                                                                                                                                                                                                                         |
| Troca Premium → Essencial     | **Provada até o Asaas; a virada não.** `/trocar {essencial}` → 200 `trocaPendente {essencial, aPartirDe: 2026-11-22}`; a assinatura no Asaas foi a R$ 9,90 / "Frasy Essencial", o plano pago seguiu `premium`. `/trocar {premium}` → 409 `mesmo_plano`; `/trocar/cancelar` → 200 e a assinatura voltou a R$ 19,90; pedida de novo → 200. O sandbox **não gerou a fatura seguinte** (nem trazendo o `nextDueDate` para 23/10, desfeito em seguida): a concessão do Essencial pelo pagamento novo não rodou de ponta a ponta (segue em `billing-trocar-plano.test.ts`). |
| Anual fechado                 | **Provada.** Sem `ANUAL_ENABLED`: à vista e 12x → 503 `anual_indisponivel` (19:27Z; de novo às 19:59:49 depois de retirar a chave).                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Premium anual à vista         | **Provada** (com `ANUAL_ENABLED=1` das 19:48 às 19:59Z). `sub_qw7pph14y4dkrb8m` `YEARLY` R$ 149,90, `nextDueDate` 22/10/2027. Pago 19:56:55 (a 1ª tentativa deu 500 `unknow.error` do sandbox) → `aplicado` 19:56:58 → `premium`, `anual`, `valeAte` 27/10/2027 12:00 (+370 d), `proximaCobranca` 22/10/2027. `/cancelar` → 200 `arrependimento {valor: 149.9, estornado: true}`; pagamento `REFUNDED`, assinatura removida; `free`.                                                                                                                                  |
| Premium anual em 12x          | **Provada.** `/assinar {parcelamento}` → 200, parcelamento `be7e7d90-c35f-4aeb-9782-49b75875cccb`: 11 × R$ 12,49 + R$ 12,51, todas `CREDIT_CARD`. 1ª paga 19:57:33 → as 12 `CONFIRMED`, **12 `PAYMENT_CONFIRMED` `aplicado`** entre 19:57:35 e 19:57:42, todos ancorados no mesmo fim: `premium`, `anual`, `meio: parcelamento`, `valeAte` 27/10/2027, `renovacaoAutomatica: false`.                                                                                                                                                                                  |
| Arrependimento do 12x         | **Provada.** `/cancelar` (19:58:07) → 200 `arrependimento {valor: 149.9, estornado: true, protocolo: arrependimento:parcelamento:be7e…}`; as 12 parcelas `REFUNDED`; 12 `PAYMENT_REFUNDED` `aplicado` até 19:58:15; `free`.                                                                                                                                                                                                                                                                                                                                           |
| Arrependimento do mensal      | **Provada** pela exclusão da conta do Premium (20:00:20): `DELETE /api/me` → `assinatura {cancelada: true, arrependimento {valor: 19.9, estornado: true}}`.                                                                                                                                                                                                                                                                                                                                                                                                           |
| Entrega, token e idempotência | **Provada** (1ª rodada): eventos do sandbox chegam ao staging em segundos a ~2,5 min; token errado → 401; o mesmo evento duas vezes → `ignorado` e depois `repetido: true`, uma linha só.                                                                                                                                                                                                                                                                                                                                                                             |

**Limpeza.** Contas apagadas por `DELETE /api/me` (20:00:16–20:00:26, todas 200, Auth 404 depois; a exclusão cancelou
no Asaas as assinaturas que restavam). Clientes do sandbox criados hoje removidos (`cus_000009611362`, `…611397`, `…611903`,
`…612568`, `…613560`; o `…611362` era órfão: a 1ª tentativa do Essencial às 19:38:26 deu 502 depois de criar o cliente,
sem log — a 2ª deu 200 e criou outro). Nenhuma assinatura de hoje sobrou no sandbox. `ANUAL_ENABLED` retirado com
`wrangler secret delete` (`secret list` com os 9 nomes de antes) e `.secrets.staging.json` restaurado. Ficam no
`billing_events` do staging **32 linhas `ignorado`** das provas (27 sem usuário das sondagens e 5 de eventos de remoção
que chegaram depois de as contas serem apagadas): o `DELETE` delas foi negado ao agente e fica para o dono.

**Visto de passagem (fora do escopo):** o aviso "Nova versão disponível" aparece na primeira visita de todo
navegador limpo ao staging (já anotado pela Task 6).

### Dívidas reveladas pelas provas de cobrança (21/10/2026)

- **Checkout que falha depois de criar o cliente no Asaas duplica o cliente**: o 1º `/assinar` do Essencial deu 502 intermitente após o cliente ser criado, e a linha local só é gravada no sucesso; repetir o checkout cria um 2º cliente. Corrigir: gravar/reusar o `customerId` pelo e-mail ou `externalReference` antes de criar a cobrança.
- **Espera do checkout na tela**: o webhook do Asaas chegou entre ~3 s e ~2,5 min; a tela precisa esperar (ou consultar `/api/billing/status`) por pelo menos 3 min antes de dizer que algo deu errado.
- **Estorno pelo painel não cancela a assinatura**: `PAYMENT_REFUNDED` revoga o plano, mas a assinatura segue ACTIVE no Asaas e cobraria de novo; decidir se o webhook cancela a assinatura no estorno ou se o runbook manda cancelar à mão.
- **Pagamento "recebido em dinheiro"** (`RECEIVED_IN_CASH`) não concede plano (só `CONFIRMED`/`RECEIVED`): registrar no runbook para o operador não usar esse botão.
- 32 linhas `ignorado` das sondagens ficaram em `billing_events` do staging (inofensivas; apagar só com decisão do dono).
