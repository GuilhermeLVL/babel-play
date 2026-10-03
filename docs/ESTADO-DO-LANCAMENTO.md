# Estado do lançamento — o que vale hoje

Atualizado em **2026-10-02**. Índice de uma página: cada linha aponta para a fonte e não a repete. Se
este documento e o código divergirem, **o código vence** (`src/core/planos.ts`, `fly.toml`,
`server/lib/config.ts`).

## 1. Decisões fixadas

| Decisão                                                                                                              | Fonte                                                                                                                                                                                    |
| -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dois planos: **Grátis** e **Premium** (um plano pago só). Um 3º nível "Ao vivo" (streaming) só depois do lançamento. | [ADR 0011](adr/0011-um-plano-pago-com-uso-justo-diario.md) (aceito em 02/10) · `src/core/planos.ts`                                                                                      |
| Premium **R$ 19,90/mês**, **R$ 179/ano** à vista, ou **R$ 179 em 12x só no cartão** (não renova).                    | `PLAN_MATRIX`, `PARCELAS_DO_ANUAL` · [monetizacao.md §3](monetizacao.md)                                                                                                                 |
| **Teste de 14 dias** sem cartão, um por pessoa, nunca cobra sozinho.                                                 | `DIAS_DO_TESTE_PREMIUM` · `server/lib/testePremium.ts`                                                                                                                                   |
| **Uso justo**: 2 h/dia e 40 h/mês de nuvem; passou, a legenda segue no aparelho, sem venda (429, nunca 402).         | `PLAN_MATRIX.premium.quotas` · [spec `matriz-de-planos`](../openspec/specs/matriz-de-planos/spec.md)                                                                                     |
| Nomes antigos `essencial`/`pro` são lidos como `premium`.                                                            | `PLANOS_LEGADOS`, `normalizarPlano`                                                                                                                                                      |
| Na tela: Grátis = "Tradução rápida ao vivo", Premium = "Tradução Nuance". Proibido "qualidade", "%", "mais precisa". | [change `planos-v2`](../openspec/changes/planos-v2/tasks.md) (C7) · [ofertas.md](ofertas.md)                                                                                             |
| Pagamento: **Asaas**; quem concede o plano é o webhook, pelo valor pago. Pix Automático desligado.                   | [LANCAMENTO.md §6](LANCAMENTO.md) · [spec `pagamento-nunca-perdido`](../openspec/specs/pagamento-nunca-perdido/spec.md)                                                                  |
| Infra: Fly.io GRU (1 máquina) + SQLite/Litestream → R2 + Supabase (login) + Cloudflare + Resend + Sentry.            | [LANCAMENTO.md](LANCAMENTO.md) · `fly.toml` · ADRs [0006](adr/0006-sqlite-numa-maquina-ate-o-gatilho-de-postgres.md), [0009](adr/0009-audio-no-r2-com-retencao-e-varredura-de-orfaos.md) |
| IA: Groq principal, OpenRouter (retenção zero) de reserva, o aparelho como piso. **Nunca Gemini.**                   | [ADR 0008](adr/0008-groq-principal-com-reserva-e-degradacao-local.md) · [LANCAMENTO.md §5](LANCAMENTO.md)                                                                                |
| Público: **todas as idades**, com perfil protegido para menores (não compra, não recebe oferta).                     | `public/privacidade.html`, `public/termos.html` · [monetizacao.md §3](monetizacao.md)                                                                                                    |
| Custo fixo: **≈ R$ 199/mês** (sem Langfuse).                                                                         | [LANCAMENTO.md — Custo mensal](LANCAMENTO.md#custo-mensal) (a única fonte) · `scripts/custo/modelo.mjs`                                                                                  |

## 2. O que está pronto

- **Planos v2** inteiros (matriz, migração, uso justo por dia, anual e 12x, teste de 14 dias, tela de
  Planos, ofertas, Termos v5): [`planos-v2/tasks.md`](../openspec/changes/planos-v2/tasks.md), 0 caixas abertas.
- **Prontidão para produção** (8 fases: escala, custo, carga, observabilidade, deploy com rollback, convidado,
  ofertas): [RELATORIO-FINAL](../openspec/audits/2026-09-25-prontidao/RELATORIO-FINAL.md). Aberta só a fila
  durável da importação ([tasks](../openspec/changes/prontidao-producao/tasks.md)).
- **Furos P0 da auditoria de 13/09** fechados e arquivados em 02/10: assinar não concede plano, guard de SSRF,
  travas de produção (`openspec/changes/archive/2026-10-02-*`).
- **Passo a passo do dono** escrito: [LANCAMENTO.md](LANCAMENTO.md); operação em [runbook.md](runbook.md),
  [deploy.md](deploy.md), [escala.md](escala.md).
- **No ar hoje:** só a edição estática, sem conta nem cobrança ([edicao-estatica.md](edicao-estatica.md)). O
  servidor (Fly.io) ainda não foi implantado.

## 3. O que falta

### Código — plano aprovado em 02/10

| Frente | O quê                                                                                                                                                                                               |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0      | Vitrine local (`npm run vitrine`): o app completo com login de mentira e contas semeadas em cada estado.                                                                                            |
| 1      | Furos de cobrança e conta: chargeback revoga; conferir atraso/estorno/cancelamento na API do Asaas; excluir conta com 12x; primeiro admin por CLI; captcha no cadastro; webhook sem dados pessoais. |
| 2      | Cota da nuvem do site estático.                                                                                                                                                                     |
| 3      | Telas de plano, avisos e pop-ups revisados; medidor do uso do dia; tela de admin.                                                                                                                   |
| 4      | Staging no Fly, com cadastro e venda **fechados** até as conferências do [LANCAMENTO.md §10](LANCAMENTO.md).                                                                                        |
| 5      | Bancada de qualidade e custo da IA (espera as chaves pagas).                                                                                                                                        |
| 6      | Desempenho.                                                                                                                                                                                         |
| 7      | Saneamento dos documentos (este arquivo).                                                                                                                                                           |

Também de código, achado no saneamento: `public/privacidade.html` ainda não nomeia Fly.io, Cloudflare/R2,
Resend, Sentry nem a voz (DeepInfra/Workers AI) — ver [operadores.md](lgpd/operadores.md).

### Dono

- **Chaves de IA pagas** (Groq Developer; chave nova da OpenRouter) — sem elas a IA atende ~8 assinantes
  ([RELATORIO-FINAL §6](../openspec/audits/2026-09-25-prontidao/RELATORIO-FINAL.md)).
- **Contas e painéis** do [LANCAMENTO.md](LANCAMENTO.md) §1–§9 e as conferências do §10.
- **Contador:** abrir a ME no Simples; NFS-e no padrão nacional a partir de **01/11/2026**.
- **12 DPAs** a aceitar e guardar: [operadores.md](lgpd/operadores.md) (nenhuma linha marcada).

### Jurídico

- **Advogado: Termos §3–§4** (anual, 12x, teste, uso justo, cancelamento sem reembolso proporcional depois dos
  7 dias) — `public/termos.html` está marcado "texto a validar". Sem isso, não abrir a venda do anual.
- Política de privacidade com a lista completa de operadores (item de código acima) e as cláusulas-padrão da
  ANPD nos DPAs ([operadores.md](lgpd/operadores.md)).

## 4. Decisões abertas do dono

| #   | Decisão                                                                                               | Onde está descrita                                                                           |
| --- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| 1   | E-mails de cobrança do Asaas ao cliente: **ligar ou deixar desligados**? Os dois docs se contradizem. | [asaas-notificacoes.md](asaas-notificacoes.md) × [operadores.md](lgpd/operadores.md)         |
| 2   | Assinaturas antigas do Pro a R$ 39,90: baixar o valor no Asaas ou manter?                             | [`planos-v2/design.md`](../openspec/changes/planos-v2/design.md) · ADR 0011, "Consequências" |
| 3   | Langfuse: ligar, e com que amostragem? Fora do custo fixo de hoje.                                    | [LANCAMENTO.md — Custo mensal](LANCAMENTO.md#custo-mensal), nota ¹                           |
| 4   | `performance-1x` antes de ~100 simultâneos?                                                           | [escala.md](escala.md) · RELATORIO-FINAL §6.2                                                |
| 5   | O exercício de restauração pelo Actions é aceitável pela LGPD (o banco tem dados de menores)?         | RELATORIO-FINAL §6.4 · [runbook.md §0.2](runbook.md)                                         |
| 6   | Quando ligar as flags `oferta_planos`, `nuvem_gratuita_alivio`, `nuvem_convidado` e `voz_natural`.    | [flags.md](flags.md) · RELATORIO-FINAL §6.7                                                  |

## 5. Documentos que não valem mais

Têm o aviso "Documento histórico" no topo: `PROXIMOS-PASSOS.md`, `HANDOFF-PROXIMA-SESSAO.md`,
`lancamento-2026-09.md`, `roadmap-distribuicao.md`, `marco1-auth-multitenant.md`, `auth/auth-flow-design.md`,
`auditoria/decisao-infraestrutura-v1.md`, `auditoria/viabilidade-producao-v1.md` e, em
`openspec/audits/2026-09-13-pre-deploy/`, `DEPLOY_GUIDE.md` e `LGPD_COMPLIANCE.md`.
