# Estado do lançamento — o que vale hoje

Atualizado em **2026-10-21** (a seção 0 resume o que mudou desde 18/10). Índice de uma página: cada linha aponta
para a fonte e não a repete. Se este documento e o código divergirem, **o código vence**
(`src/core/planos.ts`, `wrangler.jsonc`, `server/lib/config.ts`). O levantamento linha a linha, com arquivo e número
de linha, está em [auditoria/2026-10-21-lancamento-inventario.md](auditoria/2026-10-21-lancamento-inventario.md); o
plano em
[superpowers/plans/2026-10-21-lancamento-estado-3.md](superpowers/plans/2026-10-21-lancamento-estado-3.md).

## 0. O que mudou desde 18/10 (ramo `lancamento/estado-3`)

- **Recorte do lançamento (P1–P6 do plano):** Grátis, **Essencial** e **Premium** à venda (flag `venda_planos_v3`
  ligada); **Ao Vivo fora** (`stt_ao_vivo` desligada, o serviço de nuvem ao vivo não existe); `voz_natural` desligada;
  **anúncios prontos, mas a flag `anuncios` desligada** até o jurídico e a rede; produção sobe com
  `SIGNUP_ENABLED=0` e `CHECKOUT_ENABLED=0`, e `ANUAL_ENABLED` só depois do jurídico.
- **Cobrança por plano provada** (change 8.3): [`tests/integration/billing-por-plano.test.ts`](../tests/integration/billing-por-plano.test.ts).
- **Tela de Planos com 3–4 cartões** sem prometer Ao Vivo nem voz: `src/components/views/planos/quatroPlanos.ts`,
  `tests/planos-tela-v3.test.tsx`, `tests/e2e-publico/planos-v3.e2e.ts`.
- **Anúncios implementados e desligados:** consentimento (`src/components/anuncios/ConsentimentoDeAnuncios.tsx`);
  CSP só com `frame-src` quando a flag e `ANUNCIOS_ORIGEM` existem (`server/http/csp.ts`, sobreposição no
  `worker.ts` / `server/http/anunciosNoWorker.ts`); provedor por `<iframe credentialless>`
  (`src/lib/anuncios/provedores/iframe.tsx`); página de anúncios num **Worker próprio, `frasy-anuncios`**
  (`wrangler.anuncios.jsonc`, `anuncios/`, `scripts/anuncios/build.mjs`, `npm run anuncios:build`); recompensa do
  premiado creditada **no servidor**, com tetos (`server/routes/anuncios.ts`; constantes
  `LIMITE_DE_PREMIADOS_POR_DIA`, `LIMITE_DE_NUVEM_30_POR_DIA`, `DURACAO_MINIMA_DA_EXIBICAO_MS`,
  `LIMITE_DE_PREMIADOS_PENDENTES` e `TETO_GLOBAL_DE_PREMIADOS_POR_DIA` em `src/core/planos.ts`).
- **Política de privacidade e Termos atualizados** (`public/privacidade.html`, `public/termos.html`,
  `tests/politica-de-privacidade.test.ts`; RoPA T14 em `docs/lgpd/ropa.csv`): a hospedagem errada saiu da lista, a voz (DeepInfra /
  Workers AI) e os anúncios entraram. Os Termos §3–§4 seguem "texto a validar".
- **Pesquisas:** rede de anúncios ([recomendação: Google Ad Manager por origem própria](pesquisa/2026-10-21-rede-de-anuncios.md))
  e [vozes por nível](pesquisa/2026-10-21-vozes-por-nivel.md).
- **Procedimento de abrir a venda escrito:** [LANCAMENTO.md §11-bis](LANCAMENTO.md#11-bis-abrir-a-venda--passo-a-passo) e
  [runbook.md, "Abrir e fechar portas"](runbook.md#06-abrir-e-fechar-portas).
- **Do que já valia em 18/10:** IA hoje por **OpenRouter** (a Groq está sem créditos; nunca Gemini); teste de 14 dias
  que acaba por tempo **ou** pela franquia; segurança fechada na auditoria (2FA, `.docx`/PDF, nuvem só com data de
  nascimento, aceite do responsável, rastro do admin); tradução no aparelho (Bergamot) liga quando o dono publica os
  modelos ([LANCAMENTO.md §2](LANCAMENTO.md)); `feat/redesign-v3` e `feat/redesign-design-system-v3` não foram mescladas.
- **Ainda não provado em ambiente real:** login e pagamento reais, o deploy de **produção** no Worker (só o staging
  rodou), os E2E com conta real e o intérprete num Chrome real (item 8.6 de `modo-interprete`). Um anúncio real
  com o isolamento ligado também não (bancada, Task 6).

## 1. Decisões fixadas

| Decisão                                                                                                                                                               | Fonte                                                                                                                                                                                                                                    |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Matriz de quatro planos (**Grátis, Essencial, Premium, Ao Vivo**) em `PLAN_MATRIX`; no lançamento **vendem Essencial e Premium**. `pro` lê como `premium`.            | [ADR 0013](adr/0013-quatro-planos-por-nivel-de-servico.md) · `src/core/planos.ts` (`PLANOS_LEGADOS`)                                                                                                                                     |
| Preços: Essencial R$ 9,90/mês e R$ 79,90/ano; Premium R$ 19,90/mês e R$ 149,90/ano (à vista ou 12x só no cartão); Ao Vivo R$ 39,90 (**fora da venda**).               | `PLAN_MATRIX`, `PARCELAS_DO_ANUAL` · [monetizacao.md](monetizacao.md)                                                                                                                                                                    |
| Nuvem: Essencial 5 h/mês; Premium 20 h/mês (teto de 2 h por dia). Passou, a legenda segue no aparelho, sem venda (429, nunca 402).                                    | `PLAN_MATRIX` · [spec `matriz-de-planos`](../openspec/specs/matriz-de-planos/spec.md)                                                                                                                                                    |
| **Teste de 14 dias** sem cartão, um por pessoa, nunca cobra sozinho.                                                                                                  | `DIAS_DO_TESTE_PREMIUM` · `server/lib/testePremium.ts`                                                                                                                                                                                   |
| Quem concede o plano é o webhook do Asaas, **pelo valor pago**, mesmo de plano que não está à venda (o dinheiro entrou). Pix Automático desligado.                    | [LANCAMENTO.md §6](LANCAMENTO.md) · [spec `pagamento-nunca-perdido`](../openspec/specs/pagamento-nunca-perdido/spec.md)                                                                                                                  |
| Anúncios só no Grátis, por escolha e com a porta "Sem anúncios"; nunca para perfil protegido, headset, captura ativa, conta com menos de 3 dias ou sem consentimento. | [spec `anuncios-no-gratis`](../openspec/specs/anuncios-no-gratis/spec.md) · `src/core/anuncios/politicaDeAnuncio.ts`                                                                                                                     |
| Infra: Cloudflare Workers (Hyperdrive) + Postgres do Supabase em SP + R2 (mídia e backup semanal) + Resend + Sentry.                                                  | [LANCAMENTO.md](LANCAMENTO.md) · [ADR 0015](adr/0015-cloudflare-workers-no-lugar-do-fly.md) · ADRs [0006](adr/0006-sqlite-numa-maquina-ate-o-gatilho-de-postgres.md), [0009](adr/0009-audio-no-r2-com-retencao-e-varredura-de-orfaos.md) |
| IA: hoje **OpenRouter** (retenção zero; a Groq está sem créditos), o aparelho como piso. **Nunca Gemini.**                                                            | [ADR 0008](adr/0008-groq-principal-com-reserva-e-degradacao-local.md) · [LANCAMENTO.md §5](LANCAMENTO.md)                                                                                                                                |
| Público: **todas as idades**, com perfil protegido para menores (não compra, não recebe oferta nem anúncio).                                                          | `public/privacidade.html`, `public/termos.html` · [monetizacao.md §3](monetizacao.md)                                                                                                                                                    |
| Custo fixo: **≈ R$ 165/mês** (sem Langfuse).                                                                                                                          | [LANCAMENTO.md — Custo mensal](LANCAMENTO.md#custo-mensal) (a única fonte) · `scripts/custo/modelo.mjs`                                                                                                                                  |

## 2. O que está pronto

Evidência por frente do plano de 02/10 (o detalhe, com arquivo e linha, está no
[inventário](auditoria/2026-10-21-lancamento-inventario.md) §2):

| Frente | Item                                                                                         | Situação | Evidência                                                                                                                                                                                     |
| ------ | -------------------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0      | Vitrine local                                                                                | Feito    | `npm run vitrine`, [vitrine.md](vitrine.md)                                                                                                                                                   |
| 1      | Chargeback revoga; webhook sem dados pessoais; excluir conta com 12x; primeiro admin por CLI | Feito    | `server/lib/billingEventos.ts`, `server/lib/encerramentoDeAssinatura.ts`, `server/operacao/contas.ts`; `tests/integration/billing-webhook-eventos-que-derrubam.test.ts`, `contas-cli.test.ts` |
| 1      | Atraso, estorno e cancelamento no Asaas                                                      | Parcial  | Código e testes prontos; falta a prova no **sandbox** do Asaas (LANCAMENTO §10)                                                                                                               |
| 1      | Captcha no cadastro                                                                          | Parcial  | Cliente pronto (`src/lib/turnstile.ts`); falta site key no build, secret no Supabase e teste no staging                                                                                       |
| 2      | Cota da nuvem do site estático                                                               | Feito    | `functions/quest/stt.js`                                                                                                                                                                      |
| 3      | Telas de plano, medidor do uso do dia, tela de admin                                         | Feito    | `Planos.tsx`, `AvisoDoUsoDoDia.tsx`, `Admin.tsx` (aba Flags)                                                                                                                                  |
| 4      | Staging no Worker                                                                            | Feito    | [STAGING.md](STAGING.md). **Produção não implantada.**                                                                                                                                        |
| 6      | Desempenho                                                                                   | Parcial  | k6 no staging e HKDF feitos                                                                                                                                                                   |
| 7      | Saneamento dos documentos                                                                    | Feito    | este arquivo, `LANCAMENTO.md`, `runbook.md`, `flags.md`                                                                                                                                       |

Planos v3 e anúncios, na change [`planos-v3-e-rota-inteligente`](../openspec/changes/planos-v3-e-rota-inteligente/tasks.md):
grupos 1, 2, 3, 7 e 8 prontos; 9.1, 9.2 e 9.4 prontos; 11.2 a 11.5 com o código pronto (sobem desligados). A prova
de cobrança por plano e a tela de 3–4 cartões estão na seção 0. Abertos: 0.3, 9.3, 11.1, 11.6 e os grupos 4, 5, 6,
10 e Q (pós-lançamento, P2).

Também pronto: prontidão para produção
([RELATORIO-FINAL](../openspec/audits/2026-09-25-prontidao/RELATORIO-FINAL.md); aberta só a fila durável da
importação), furos P0 de 13/09 fechados, a migração para Cloudflare + Supabase até o portão G1 da Fase 5, o passo
a passo do dono ([LANCAMENTO.md](LANCAMENTO.md)) e a operação ([runbook.md](runbook.md), [deploy.md](deploy.md),
[escala.md](escala.md)).

**No ar hoje:** só a edição estática, sem conta nem cobrança ([edicao-estatica.md](edicao-estatica.md)). O servidor
(Worker da Cloudflare) roda só no staging; a produção ainda não foi implantada.

## 3. O que falta

### Código (assistente)

| Item                                                                                                                                                                                         | Onde                                                                  |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| **Task 6 — bancada de anúncios:** página de bancada e prova real com o isolamento ligado (change 11.1). Se a rede exigir domínio aprovado, registrar "aguardando".                           | plano, Task 6 · `docs/auditoria/2026-10-21-anuncios-bancada.md`       |
| **Task 10 — provas no staging:** checkout do Essencial e do Premium (mensal, anual, 12x), troca e arrependimento com a chave **sandbox** do Asaas; as caixas do §10 que cabem ao assistente. | plano, Task 10 · [LANCAMENTO.md §10](LANCAMENTO.md)                   |
| Task 8 (vozes): a recomendação está na [pesquisa](pesquisa/2026-10-21-vozes-por-nivel.md); `voz_natural` segue desligada (P5).                                                               | plano, Task 8                                                         |
| 9.3 (ofertas nos momentos do protótipo) e o texto fixo de `server/routes/billing.ts` ("esta conta já tem o Premium pago"), achado no inventário.                                             | [tasks.md](../openspec/changes/planos-v3-e-rota-inteligente/tasks.md) |
| Frente 5: bancada de qualidade e custo da IA (espera as chaves pagas).                                                                                                                       | `openspec/changes/bancada-multi-modelo`                               |
| Pós-lançamento: rota inteligente, transparência, nuvem ao vivo e qualidade no aparelho (grupos 4, 5, 6, 10 e Q).                                                                             | `tasks.md` da change                                                  |

### Dono

A lista completa e atualizada é a seção **"Você (dono)"** do plano
([superpowers/plans/2026-10-21-lancamento-estado-3.md](superpowers/plans/2026-10-21-lancamento-estado-3.md)); em resumo:

- **Bloco 1 (abre a produção):** Workers Paid e zona `frasy.com.br`; Environment `production` no GitHub;
  `.secrets.production.json`; Supabase Pro; Asaas (conta PJ, chave sandbox e de produção, webhook, e conferir que não há
  assinatura manual a R$ 39,90 nem R$ 179); chaves de IA pagas; Resend, Sentry, UptimeRobot, Turnstile; chaves S3 do R2;
  contador (ME no Simples; NFS-e nacional a partir de **01/11/2026**); DPAs aceitos
  ([operadores.md](lgpd/operadores.md): 11 linhas de operador hoje; o plano falava em 12, conferir) com razão
  social, CNPJ e contato para a política.
- **Bloco 2 (anúncios e planos que faltam):** escolher a rede e criar a conta com o domínio próprio; **consulta
  jurídica sobre ECA Digital**; decidir as vozes; decidir o serviço do Ao Vivo.
- **Bloco 3:** as 16 conferências do [LANCAMENTO.md §10](LANCAMENTO.md); depois, o procedimento
  [§11-bis, "Abrir a venda"](LANCAMENTO.md#11-bis-abrir-a-venda--passo-a-passo).

### Jurídico

- **Advogado: Termos §3–§4** (anual, 12x, teste, uso justo, cancelamento sem reembolso proporcional depois dos
  7 dias) — `public/termos.html` está marcado "texto a validar". Sem isso, não abrir a venda do anual.
  Por isso **o MVP sobe com `ANUAL_ENABLED` ausente ou `0`** (só `=1` abre o anual): vende só o mensal e o teste de
  14 dias; o anual, à vista e em 12x, some da tela e o servidor o recusa (503 `anual_indisponivel`). Quem já tem o
  anual não é afetado (`anualLigado` em `server/lib/config.ts`, [STAGING.md §5](STAGING.md)). O §4 ainda cita o
  limite antigo do Premium (2 h/dia e 40 h/mês); a matriz atual é 20 h/mês.
- **ECA Digital (Lei 15.211/2025, Decreto 12.880/2026) antes de ligar `anuncios`**, e o parágrafo de transferência
  internacional da política, afirmável só depois dos DPAs.

## 4. Decisões abertas do dono

| #   | Decisão                                                                                                                 | Onde está descrita                                                                        |
| --- | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 1   | E-mails de cobrança do Asaas ao cliente: **ligar ou deixar desligados**? Os dois docs se contradizem.                   | [asaas-notificacoes.md](asaas-notificacoes.md) × [operadores.md](lgpd/operadores.md)      |
| 2   | Existe assinatura manual a R$ 39,90 (hoje o preço do Ao Vivo) ou R$ 179 no Asaas? Conferir antes de abrir (change 0.3). | [`design.md`](../openspec/changes/planos-v3-e-rota-inteligente/design.md) §11, pergunta 3 |
| 3   | Rede de anúncios (recomendação: Google Ad Manager por origem própria), domínio `ads.` e jurídico.                       | [pesquisa](pesquisa/2026-10-21-rede-de-anuncios.md)                                       |
| 4   | Serviço do Ao Vivo (`stt_ao_vivo`): fora do lançamento; escolher por medição depois.                                    | `design.md` §11 · [flags.md](flags.md)                                                    |
| 5   | Vozes "básica" e "boa": adotar a recomendação da pesquisa ou manter `voz_natural` desligada.                            | [pesquisa](pesquisa/2026-10-21-vozes-por-nivel.md)                                        |
| 6   | Langfuse: ligar, e com que amostragem? Fora do custo fixo de hoje.                                                      | [LANCAMENTO.md — Custo mensal](LANCAMENTO.md#custo-mensal), nota ¹                        |
| 7   | Subir o compute do Supabase/Hyperdrive antes de ~100 simultâneos?                                                       | [escala.md](escala.md) · RELATORIO-FINAL §6.2                                             |
| 8   | O exercício de restauração pelo Actions é aceitável pela LGPD (o banco tem dados de menores)?                           | RELATORIO-FINAL §6.4 · [runbook.md §0.2](runbook.md)                                      |
| 9   | Quando ligar as flags `oferta_planos`, `nuvem_gratuita_alivio`, `nuvem_convidado` e `voz_natural`.                      | [flags.md](flags.md) · RELATORIO-FINAL §6.7                                               |
| 10  | Teto em dólar por conta nos planos pagos (`TETO_USD_MES_*`, estrutura pronta e desligada): escolher os números.         | [`.env.production.example`](../.env.production.example)                                   |

## 5. Documentos que não valem mais

Ficam em [`docs/historico/`](historico/) e têm o aviso "Documento histórico" no topo: `PROXIMOS-PASSOS.md`, `HANDOFF-PROXIMA-SESSAO.md`,
`lancamento-2026-09.md`, `roadmap-distribuicao.md`, `marco1-auth-multitenant.md`, `auth-flow-design.md`,
`auditoria/decisao-infraestrutura-v1.md`, `auditoria/viabilidade-producao-v1.md` e, em
`openspec/audits/2026-09-13-pre-deploy/`, `DEPLOY_GUIDE.md` e `LGPD_COMPLIANCE.md`. O ADR 0011 (um plano pago só)
foi substituído pelo [ADR 0013](adr/0013-quatro-planos-por-nivel-de-servico.md).
