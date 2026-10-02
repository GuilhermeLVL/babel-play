# Vitrine local

O app completo na sua máquina, no modo público de verdade (`AUTH_REQUIRED=1`), com login e cobrança de
mentira e uma conta pronta em cada estado de plano. Serve para **ver** as telas que a edição estática
não tem: Planos, checkout, Sua assinatura, Consumo do mês, avisos de limite, pagamento atrasado, perfil
de menor, conta de administrador.

```
npm run vitrine                 sobe e repõe cada conta no estado do rótulo
npm run vitrine -- --do-zero    apaga o banco da vitrine antes
npm run vitrine -- --com-ia     deixa as chaves de IA do seu .env valerem
```

Abra o **painel** em `http://127.0.0.1:4361`: cada linha é uma conta, o botão Entrar abre o app
(`http://localhost:4360`) já logado nela, e o segundo botão vai direto à tela do rótulo. Criar conta
pela tela de login também funciona, com qualquer e-mail e sem confirmação.

## O que roda

| Processo       | Arquivo                                 | Papel                                                 |
| -------------- | --------------------------------------- | ----------------------------------------------------- |
| Supabase falso | `tests/e2e-publico/_supabase-falso.mjs` | login, 2FA (código 123456), criar e excluir conta     |
| Asaas falso    | `scripts/vitrine/asaas-falso.mjs`       | API de cobrança, fatura de mentira, webhook, o painel |
| Semeador       | `scripts/vitrine/semear.ts`             | põe as contas de `contas.json` no estado do rótulo    |
| App            | `server.ts` em modo dev                 | o servidor real, banco em `data/vitrine/`             |

Tudo escuta só em 127.0.0.1. Toda variável do seu `.env` chega vazia ao servidor, então nenhum serviço
de verdade é tocado; `--com-ia` abre a exceção das chaves de IA.

## Cobrança de mentira

Assinar pelo app abre a "fatura de mentira" numa aba. O botão de pagar confirma a cobrança e manda ao
app o mesmo aviso que o Asaas mandaria (`/api/billing/webhook/asaas`, com o token). No painel, cada
cobrança tem botões para simular atraso, estorno, contestação no cartão e renovação.

## O que a vitrine não prova

- O comportamento real do Asaas (quantos avisos o 12x manda, prazos de estorno, recusas) e do Supabase
  (e-mail de confirmação, Google, captcha). Isso é do staging: `docs/LANCAMENTO.md`, seção 10.
- A nuvem de IA, a menos que você suba com `--com-ia`.
- Armazenamento quase cheio: não há conta nesse estado.
