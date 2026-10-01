## ADDED Requirements

### Requirement: No Quest a captura usa só o microfone

No perfil `quest` a captura SHALL usar só o microfone, exista ou não `getDisplayMedia` no navegador. O app
MUST NOT chamar `getDisplayMedia` ao iniciar a captura no Quest, e o microfone SHALL nascer ligado.

#### Scenario: Quest com compartilhamento de tela disponível

- **WHEN** a captura abre num Meta Quest Browser que tem `getDisplayMedia`
- **THEN** a tela diz que a legenda vem do microfone, o Iniciar está habilitado, e iniciar não pede o
  compartilhamento de tela

### Requirement: No Quest a carga local cabe no que o headset dá ao app

No perfil `quest` cada motor local (transcrição, tradução) SHALL usar uma thread. A captura MUST NOT rodar o
microbenchmark do aparelho ao iniciar, e MUST NOT pedir transcrições parciais.

#### Scenario: Início da captura no Quest

- **WHEN** a captura prepara os modelos num Quest que anuncia 6 ou 8 núcleos
- **THEN** o Whisper e o tradutor carregam com 1 thread cada, a sonda roda sem o microbenchmark, e nenhuma
  fala gera parcial

### Requirement: Só microfone, o modelo segue o idioma da fala

Quando a captura é só o microfone e ele vai ao modelo local, a rota SHALL escolher o modelo pelo idioma da
fala, e não pelo idioma de destino. Com a fala em inglês e sem detecção automática, o modelo SHALL ser o
Moonshine: o tiny no Quest, no celular fraco e com economia de dados; o base nos demais.

#### Scenario: Vídeo em inglês legendado para português, pelo microfone do Quest

- **WHEN** a fala é inglês, o destino é português e a captura é só o microfone
- **THEN** o modelo carregado é o Moonshine tiny, e não o Whisper base

### Requirement: Diagnóstico do aparelho

O app SHALL ter a página `/diagnostico`, que mostra o que o navegador entrega e mede, a pedido: o nível do
microfone com e sem tratamento de voz, o compartilhamento de tela (áudio junto, áudio sem vídeo, travadas) e
a velocidade de cada modelo de transcrição. A página MUST NOT medir nem baixar nada sem um toque, e MUST NOT
mudar a rota da captura. O resultado SHALL ficar legível na tela e num JSON copiável.

#### Scenario: Abrir o diagnóstico

- **WHEN** a pessoa abre `/diagnostico`
- **THEN** os sinais do aparelho aparecem, nenhum modelo é baixado, e o JSON do resultado traz os sinais
