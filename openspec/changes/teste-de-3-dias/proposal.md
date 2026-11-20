## Why

O negócio não banca teste longo agora (decisão do dono, 14/11/2026). O teste do Premium dava 14 dias e 3 h de nuvem, sem
cartão: barato por pessoa (≤ US$ 0,20), mas o abuso que importa é outro. Como não há cartão, repetir o teste custa só um
e-mail novo, e o servidor confiava no painel do Supabase ("Confirm email") para que esse e-mail existisse de verdade.

## What Changes

- **3 dias em vez de 14** (`DIAS_DO_TESTE_PREMIUM`, `src/core/planos.ts`). Tela, site, termos e o servidor leem daqui.
- **1 h de nuvem em vez de 3 h** (`FRANQUIA_DO_TESTE`): 3.600 s, 150 mil tokens, 1.400 chamadas, 10.000 caracteres de voz.
  Encolhe na proporção do prazo; ≤ US$ 0,07 por teste.
- **O aviso de fim do teste passa de D-3 para D-1** (`faseDoFimDoTeste`, gatilho `funcional_fim_do_teste_d1`). Num teste de 3
  dias, o D-3 cairia no próprio dia em que ele começa.
- **O freio contra a fábrica de contas** em `POST /api/billing/teste`, depois da marca do e-mail:
  - e-mail de caixa descartável (lista curta, sem dependência nova): 409 `teste_email_descartavel`; o `/status` já mostra
    `indisponivel` com `motivo: 'email_descartavel'`;
  - a marca já usada responde antes de qualquer consulta à rede (409 `teste_ja_usado`, como antes);
  - e-mail NÃO confirmado no Supabase (Admin API, `email_confirmed_at`): 403 `teste_email_nao_confirmado`; a consulta falhou:
    503 `teste_indisponivel_agora` (fechado);
  - mais de `TESTES_PREMIUM_POR_IP_DIA` (padrão 5, `0` desliga) testes começados pelo mesmo IP pseudonimizado no dia:
    429 `teste_limite_por_ip`. Só o teste que começa conta.
- Textos: trilho ("Grátis · teste {dias} dias", agora com o número interpolado), aviso D-1, termos (3.5), política de
  privacidade (teste, confirmação do e-mail, IP pseudonimizado), site público (1 hora), READMEs, docs vivas, ROPA (T12).

## Non-Goals

- Captcha no cadastro (Turnstile) e exigir cartão: decisões de produto à parte.
- Lista completa de domínios descartáveis (dezenas de milhares, muda toda semana) ou serviço externo de reputação.
- Limite por dispositivo (fingerprint): mais dado pessoal do que o problema pede agora.
- Mudar quem pode testar: adulto declarado, ou o responsável vinculado pelo menor (já existia).
- Testes já começados: valem até o `terminaEm` gravado (14 dias para quem começou antes do deploy).

## Impact

- Código: `src/core/planos.ts`, `src/core/ofertas.ts`, `src/lib/ofertas/fimDoTeste.ts`, `src/components/shell/TrilhoDoQuest.tsx`,
  `src/components/views/planos/FaixaDaConta.tsx`, `src/lib/assinatura.ts`, `server/lib/testePremium.ts`,
  `server/lib/dominiosDescartaveis.ts` (novo), `server/lib/config.ts`, `server/routes/billing.ts`, `scripts/site/paginas.ts`.
- Sem migração: o contador por IP usa `usage_counters` (métrica `teste_premium:ip`, janela = dia UTC).
- Nova variável opcional: `TESTES_PREMIUM_POR_IP_DIA` (`.env.production.example`).
- Custo: uma chamada à Admin API do Supabase por início de teste (raro), nunca no `/status`.
- Textos legais mudam (`public/termos.html`, `public/privacidade.html`): continuam marcados "a validar com o jurídico".
- Risco: CGNAT (muita gente atrás do mesmo IP) pode bater no teto de 5 por dia; o teto é configurável e a recusa diz o que
  fazer. Sem `SUPABASE_SERVICE_ROLE_KEY` o servidor não confere a confirmação (avisa no log) e o freio volta a ser o painel.
