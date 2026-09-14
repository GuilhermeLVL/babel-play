## ADDED Requirements

### Requirement: Produção falha fechada sem autenticação
Quando `NODE_ENV` é `production`, o servidor SHALL exigir `AUTH_REQUIRED=1` e SHALL abortar o boot se
a variável estiver ausente ou desligada. Um warning de log SHALL NOT ser considerado suficiente.

#### Scenario: Imagem de produção sem AUTH_REQUIRED
- **WHEN** o servidor sobe com `NODE_ENV=production` e `AUTH_REQUIRED` ausente ou `0`
- **THEN** o processo aborta o boot com erro explícito, sem servir requisições

#### Scenario: Self-host continua livre
- **WHEN** o servidor sobe fora de produção (self-host/local) com `AUTH_REQUIRED=0`
- **THEN** o modo sem login funciona normalmente

### Requirement: O limiter usa o IP real atrás do proxy
Quando o servidor roda atrás de um proxy reverso, o rate-limit e o `ip_hash` SHALL chavear pelo IP
real do cliente, configurado por `TRUST_PROXY` de acordo com o alvo de deploy.

#### Scenario: Tentativas de auth de um IP não derrubam todos
- **WHEN** um atacante estoura o limite de falha de autenticação atrás de um proxy
- **THEN** apenas o IP do atacante é limitado, não todos os clientes que compartilham o IP do proxy

#### Scenario: Ranking registra o IP correto
- **WHEN** um post de ranking chega atrás do proxy
- **THEN** o `ip_hash` deriva do IP real do cliente, não do IP do proxy
