## ADDED Requirements

### Requirement: A cena só é guardada por ação explícita e depois de a pessoa ver a imagem

Com a flag `cartao_com_cena` ligada e uma faixa de vídeo compartilhada, o app SHALL oferecer "Guardar a cena" e SHALL mostrar a
imagem em pré-visualização, com "Cobrir um pedaço" e "Descartar", antes de gravar qualquer coisa. O app MUST NOT tirar ou
guardar quadro sem esse gesto.

#### Scenario: Guardar a cena

- **GIVEN** a flag ligada e uma aba compartilhada
- **WHEN** a pessoa toca em "Guardar a cena" e depois em "Guardar" na pré-visualização
- **THEN** uma imagem de no máximo 480 px de largura e 40 KB fica ligada ao cartão, no aparelho

#### Scenario: Descartar

- **WHEN** a pessoa toca em "Descartar"
- **THEN** nada é gravado e nenhuma cópia da imagem permanece em memória além da pré-visualização

#### Scenario: Palavra salva em massa

- **WHEN** a pessoa salva dez palavras de uma sessão
- **THEN** nenhum quadro é tirado

#### Scenario: Cobrir um pedaço

- **WHEN** a pessoa cobre um retângulo e confirma
- **THEN** o arquivo gravado tem o retângulo opaco, e o conteúdo coberto não pode ser recuperado dele

### Requirement: A imagem nunca sai do aparelho

O app MUST NOT enviar a imagem da cena ao servidor do Frasy, a provedor de IA ou a terceiros. O servidor MUST NOT ter rota que
aceite imagem de cartão.

#### Scenario: Cliente adulterado

- **WHEN** um cliente tenta enviar uma imagem de cena a qualquer rota de `/api/vocab`
- **THEN** o servidor recusa, e nada é gravado

#### Scenario: Teste de rede

- **WHEN** o fluxo completo de guardar e rever a cena roda no navegador de teste
- **THEN** nenhuma requisição leva corpo de imagem

### Requirement: Perfil protegido não tem a função na primeira versão

Para o perfil protegido (menor de 18 ou idade não declarada, inclusive sem conta), o app SHALL esconder "Guardar a cena" e MUST
NOT acessar a faixa de vídeo para esse fim.

#### Scenario: Menor de 14 anos

- **GIVEN** uma conta de 14 anos com a flag ligada
- **WHEN** abre o painel da frase numa captura de aba
- **THEN** o botão não existe e `getVideoTracks` não é chamado para tirar quadro

### Requirement: Tela inteira pede confirmação extra

Quando a superfície compartilhada é a tela inteira, o app SHALL pedir confirmação ("Isto guarda tudo o que está na tela agora")
antes de mostrar a pré-visualização.

#### Scenario: Tela inteira

- **WHEN** `superficieCompartilhada()` devolve `monitor` e a pessoa toca em "Guardar a cena"
- **THEN** a confirmação aparece antes da pré-visualização

### Requirement: O compartilhamento volta ao mínimo

Depois de tirar o quadro, ou de falhar, o app SHALL devolver a faixa de vídeo a 1 quadro/s e até 640x360 e MUST NOT pedir o
compartilhamento de novo.

#### Scenario: Falha no desenho

- **WHEN** o desenho do quadro lança erro
- **THEN** as constraints da faixa voltam ao mínimo e a captura de áudio segue sem interrupção

### Requirement: Exportar leva a imagem só se a pessoa marcar

A exportação `.apkg` SHALL incluir as imagens das cenas somente com "Levar as imagens" marcado, e o padrão SHALL ser desmarcado.

#### Scenario: Exportação padrão

- **WHEN** a pessoa exporta sem marcar "Levar as imagens"
- **THEN** o arquivo não contém nenhuma imagem de cena
