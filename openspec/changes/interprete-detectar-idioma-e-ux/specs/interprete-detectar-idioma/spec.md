## ADDED Requirements

### Requirement: Idioma da outra pessoa detectado

O diálogo de idiomas do intérprete SHALL oferecer "Detectar automaticamente" no lado "A outra pessoa fala" para
quem tem o modo automático no plano. Com essa opção ligada, a conversa MUST correr no modo automático. A primeira
fala medida em um idioma diferente do meu MUST definir o idioma da outra pessoa para as falas seguintes.

#### Scenario: A outra pessoa fala primeiro

- **WHEN** "Detectar" está ligado, eu falo português e a primeira fala ouvida é em inglês
- **THEN** a fala vai para a metade da outra pessoa, é traduzida para o português e lida em português, e a metade dela passa a mostrar "Inglês · detectado"

#### Scenario: Eu respondo depois da detecção

- **WHEN** o inglês já foi detectado e eu falo em português
- **THEN** a minha fala é traduzida para o inglês e lida em inglês

#### Scenario: Eu falo antes da detecção

- **WHEN** "Detectar" está ligado e ninguém falou em outro idioma ainda
- **THEN** a minha fala fica só transcrita, sem tradução e sem voz, e a tela diz que a outra pessoa precisa falar primeiro

#### Scenario: A outra pessoa troca de idioma

- **WHEN** o inglês foi detectado e a outra pessoa passa a falar espanhol
- **THEN** a regra do terceiro idioma passa a traduzir de e para o espanhol

### Requirement: Detectar exige o automático

Com "Detectar" ligado, o modo por toque MUST NOT ficar disponível. Tocar no botão do modo MUST explicar que o modo
por toque precisa do idioma da outra pessoa escolhido. Quem não tem o automático no plano MUST NOT ver a opção.

#### Scenario: Tentar o toque

- **WHEN** "Detectar" está ligado e a pessoa toca em "Automático"
- **THEN** o modo continua automático e a faixa mostra "Para falar por toque, escolha o idioma da outra pessoa."
