## ADDED Requirements

### Requirement: Toda tela tem um único cabeçalho, na mesma hierarquia

Cada tela SHALL abrir com exatamente um `h1`, renderizado por `CabecalhoDeTela`, com kicker e
subtítulo opcionais e as ações da tela à direita. O tamanho e o peso do título SHALL vir de
`.titulo-de-tela`, nunca de classes por tela.

#### Scenario: Tela migrada

- **WHEN** uma tela passa a usar `CabecalhoDeTela`
- **THEN** `getAllByRole('heading', { level: 1 })` devolve um elemento e os botões de ação continuam
  encontráveis pelo nome acessível
