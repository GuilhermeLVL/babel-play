## ADDED Requirements

### Requirement: O que está à venda tem endereço
Cada tela de compra SHALL ter uma URL própria que a abra diretamente.

#### Scenario: Link para os créditos
- **WHEN** alguém abre `/creditos`
- **THEN** a tela de comprar Créditos aparece

#### Scenario: O plural também vale
- **WHEN** alguém digita `/planos`
- **THEN** vê a tela de planos, e não o Hub

### Requirement: O que está à venda está na navegação
Planos SHALL ser alcançável pela navegação principal, não só por atalhos.

#### Scenario: Procurando onde assinar
- **WHEN** alguém percorre o menu do app
- **THEN** encontra Planos sem precisar saber que ele está no menu do avatar

### Requirement: Preço vem de um lugar só
Todo preço exibido SHALL derivar da matriz de planos ou do catálogo de créditos.

#### Scenario: Preço mudou na matriz
- **WHEN** o preço de um plano muda em `PLAN_MATRIX`
- **THEN** toda tela que o mostra passa a mostrar o novo, sem edição em outro arquivo

### Requirement: Sem cobrança configurada, a tela diz
Quando não há processador de pagamento configurado, a tela de compra SHALL dizer isso.

#### Scenario: Self-host abrindo a compra
- **WHEN** alguém abre a compra numa instalação sem cobrança
- **THEN** lê que ali não há o que vender, em vez de encontrar a tela vazia

### Requirement: A página Sobre leva ao que ela anuncia
Quando a página Sobre cita algo à venda, SHALL dizer o preço e oferecer o caminho.

#### Scenario: O Passe citado no Sobre
- **WHEN** a página cita o Passe de Temporada
- **THEN** mostra quanto custa e leva à tela que o vende
