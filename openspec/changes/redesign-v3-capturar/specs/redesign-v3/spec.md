## ADDED Requirements

### Requirement: O hero de Capturar veste o painel escuro sem mudar o contrato

O hero SHALL manter os mesmos nomes acessíveis e comportamentos (Iniciar/Continuar/Parar & Salvar,
switch do microfone, Legendas flutuantes, chip e gaveta de idiomas, Foco Cheio, Bingo, avisos) ao
adotar `card-panel escuro` e os tokens `panel-*`.

#### Scenario: Os avisos continuam legíveis no painel escuro

- **WHEN** os dois idiomas da sessão são o mesmo
- **THEN** o aviso "Os dois idiomas são o mesmo" aparece dentro do hero, em chip `warn-soft`/`warn-ink`,
  com o botão "trocar um dos dois" funcionando
