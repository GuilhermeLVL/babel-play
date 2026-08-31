## ADDED Requirements

### Requirement: O plano pago é descobrível sem procurar
Um usuário no plano Grátis SHALL ver, sem abrir menus, que existem planos pagos e a partir de
que preço.

#### Scenario: Usuário grátis no Hub
- **WHEN** um usuário `free` abre o Início
- **THEN** um card visível informa "planos a partir de R$ 9,90/mês" com caminho para a tela
  Planos

#### Scenario: Assinante não vê anúncio
- **WHEN** um usuário com assinatura ativa (ou self-host) navega pelo app
- **THEN** nenhum card ou banner de venda aparece
