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
