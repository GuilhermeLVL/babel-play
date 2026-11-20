## ADDED Requirements

### Requirement: O cartão do tradutor nativo fecha quando não há o que esperar

O cartão de preparo SHALL tirar o tradutor nativo da conta quando o par falha, quando o disjuntor do tradutor nativo abre ou
quando o par passa 20 s sem progresso. Quando o tradutor local entrega a primeira tradução da sessão, o cartão MUST NOT
mostrar mais o tradutor nativo como pendente.

#### Scenario: Um par falha e o outro fica parado (COMP-03)

- **WHEN** a captura prepara os pares en|pt e pt|en no nativo, en|pt falha e pt|en nunca informa progresso
- **THEN** em até 20 s o cartão "Tradutor do navegador" some
- **AND** numa sessão de 10 min (`computador/medir.mjs` com `LOOP_MIN=10`), a captura aos 601 s não mostra o cartão (a
  auditoria o mostrou preso em 0%)

#### Scenario: Tradutor local assumiu

- **WHEN** a primeira fala é traduzida pelo tradutor local
- **THEN** o cartão do tradutor nativo some no mesmo quadro

### Requirement: O cartão de preparo não cobre a legenda

O cartão de preparo MUST ficar fora da área da lista de falas. A primeira fala SHALL ficar visível inteira enquanto o cartão
estiver aberto, em 375×667, 412×915 e 1280×800.

#### Scenario: Primeira fala com o cartão aberto

- **WHEN** o cartão de preparo está aberto e chega a primeira fala
- **THEN** o retângulo da primeira fala não se sobrepõe ao do cartão (teste e2e que compara `getBoundingClientRect` nas três
  janelas)

### Requirement: O aviso de voz não é escondido pelo preparo

No intérprete, a instrução de instalar a voz do idioma SHALL ter prioridade sobre o progresso de preparo de um pacote nativo.

#### Scenario: Aparelho sem voz em inglês (CONV-06)

- **WHEN** o aparelho não tem voz em inglês e o pacote nativo do tradutor está em preparo
- **THEN** o aviso "Este aparelho não tem voz em inglês… Gerenciar vozes" continua visível durante a sessão (a auditoria o
  viu trocado em 2 s, `conversa/rodadas/desktop-sem-voz-en/tela.json`)
