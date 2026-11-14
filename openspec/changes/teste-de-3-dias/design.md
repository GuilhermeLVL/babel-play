## Context

- **O teste do Premium (C6, `planos-v2`)** começa com um toque em `POST /api/billing/teste`, sem cartão e sem Asaas, e grava
  `testes_premium` (início, fim, plano) e a marca `marcas_de_teste` (HMAC-SHA256 do e-mail normalizado, 730 dias, sobrevive
  à exclusão). A ordem das recusas está no comentário da rota em `server/routes/billing.ts`.
- **A normalização da marca já existia** (`normalizarEmailDaMarca`): caixa baixa, espaços fora, `+etiqueta` fora em qualquer
  domínio, pontos fora e `googlemail.com` → `gmail.com` só no Gmail. Faltava teste unitário com o caso pedido
  (`a.b+x@GoogleMail.com` = `ab@gmail.com`); o de integração cobria parte.
- **Adulto/perfil já existia**: `ehAdultoDeclarado` — sem idade declarada, 403 `idade_nao_informada`; menor, 403
  `teste_pelo_responsavel`; o responsável vinculado ativa pelo menor (`paraUsuario`).
- **E-mail confirmado NÃO era conferido no servidor.** O e-mail vem do claim `email` do JWT; a confirmação dependia do
  "Confirm email" ligado no painel do Supabase (`docs/auditoria/2026-10-15-prontidao-producao.md`, D2). O claim
  `user_metadata.email_verified` do JWT não serve: o `user_metadata` é editável pela própria pessoa.
- **Limitador por IP**: `criarLimitadorDeFalhas` chaveia por usuário quando há `req.userId` (o caso desta rota) e conta
  falhas; o convidado tem `ipPseudonimo` (HMAC com o dia) e contadores diários em `usage_counters`.
- **A franquia do teste** (`FRANQUIA_DO_TESTE`, change `teste-por-uso`) usa os contadores do plano com o menor teto.

## Goals / Non-Goals

**Goals:**

- Teste de 3 dias e 1 h de nuvem, com todos os textos coerentes.
- O servidor confere o que antes só o painel garantia (e-mail confirmado), e freia a criação de contas em série sem cartão.
- Tudo testável sem rede: a consulta ao Supabase é injetável.

**Non-Goals:**

- Captcha, cartão, fingerprint, lista completa de descartáveis (ver `proposal.md`).

## Decisions

### 1. O número mora em `src/core/planos.ts`; a tela interpola

`DIAS_DO_TESTE_PREMIUM = 3`. As duas frases do trilho que tinham "14" escrito passam a `{dias}` (`t(..., { dias })`): a
próxima mudança de prazo não órfã a tradução. O site já lia os dois números; só ganhou o singular ("1 hora").

### 2. 1 h, na proporção do prazo

3 h para 14 dias → 1 h para 3 dias (3.600 s; tokens a 150 mil por hora; chamadas 1 h ÷ 6 s × 2 = 1.200, com folga até
1.400; voz 10.000 caracteres). O uso justo do dia (2 h) deixa de morder no teste: a franquia acaba antes.

### 3. Aviso de fim em D-1

Com 3 dias, D-3 é o dia do início. O aviso funcional passa a ser a véspera (`d1`, "termina amanhã") e o último dia (`d0`).
O id do gatilho muda (`funcional_fim_do_teste_d1`); o histórico de frequência do antigo fica órfão no navegador, sem efeito.

### 4. E-mail confirmado pela Admin API, só no início do teste

`GET /auth/v1/admin/users/:id` → `email_confirmed_at` (a mesma API de `aal.ts`). Só em `POST /teste`, depois de todas as
recusas baratas (inclusive a marca já usada, que agora responde antes da rede). Erro da API → 503, fechado. Sem
`SUPABASE_SERVICE_ROLE_KEY` → libera com aviso no log (self-host/dev; o inventário de config já acusa a chave ausente). O
`/status` NÃO consulta (o checkout o sonda a cada 5 s): a tela pode oferecer o teste a quem ainda não confirmou, e o toque
explica o que falta.

### 5. Caixa descartável: lista curta no código

~45 domínios dos provedores mais conhecidos, em `server/lib/dominiosDescartaveis.ts`, casando o domínio e os subdomínios.
Sem dependência nova nem download. Barra só o TESTE; a conta e o Grátis seguem abertos. Vale também no `/status`
(`motivo: 'email_descartavel'`), porque é de graça.

### 6. Teto por IP com contador próprio, não com o limitador de falhas

O limitador existente conta falhas e chaveia pelo usuário; aqui a régua é "testes que COMEÇARAM por IP no dia". Contador em
`usage_counters` (métrica `teste_premium:ip`, janela `AAAA-MM-DD` UTC), chave = HMAC do IP com a chave do servidor e o dia
(IPv6 agrupado por `ipKeyGenerator`), igual ao convidado. Lê antes de gravar, conta depois de `iniciado`, poda os dias
passados ao contar. Ler-e-depois-contar não é atômico: numa rajada simultânea o teto pode passar pelo número de pedidos em
voo — aceito, como no limitador de falhas. Padrão 5 por dia (uma casa com dois adultos e filhos vinculados); `0` desliga.

## Risks / Trade-offs

- **CGNAT**: operadoras móveis põem muita gente atrás do mesmo IP. Com 5 por dia, o risco é baixo na escala de hoje; o teto
  é configurável sem deploy de código e a mensagem orienta.
- **Admin API fora do ar** bloqueia o início do teste (503) — preferido a liberar sem confirmar.
- **Lista de descartáveis incompleta**: é uma barreira de custo, não uma garantia. O freio real é e-mail confirmado + IP.
- **Quem já está no teste de 14 dias** segue até o `terminaEm` gravado; a franquia nova (1 h) passa a valer para ele também,
  porque o teto é lido na hora (quem já gastou mais de 1 h fica sem nuvem até o fim do teste, com o aviso `uso_acabou`).

## Migration Plan

Sem migração de banco. Deploy normal; a variável `TESTES_PREMIUM_POR_IP_DIA` é opcional. Conferir que
`SUPABASE_SERVICE_ROLE_KEY` está nos secrets do Worker de produção (já é usada pelo AAL2 e pela exclusão de conta).
Rollback: reverter o PR (nenhum dado novo além do contador diário, que se poda sozinho).

## Open Questions

- O jurídico precisa validar a nova redação do item 3.5 dos termos e do parágrafo do teste na política de privacidade.
- Vale uma lista maior de descartáveis (ex.: atualizada por script no build) se o abuso aparecer nos números?
