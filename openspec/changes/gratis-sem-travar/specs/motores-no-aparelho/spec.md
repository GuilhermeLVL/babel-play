## ADDED Requirements

### Requirement: O modelo grande de transcrição só com GPU provada

O roteador de STT SHALL escolher o whisper-small no desktop só com GPU provada, ou seja, com as quatro condições:

- a sonda viu um adaptador WebGPU real;
- a GPU nunca caiu naquele aparelho;
- o benchmark, quando existe, não põe a GPU abaixo de 1,5× a CPU;
- a economia de dados está desligada.

O adaptador WebGPU de reserva (de software) SHALL contar como sem GPU. As telas que estimam o download SHALL usar a
mesma sonda guardada que a rota real usa.

#### Scenario: Só o adaptador de software

- **WHEN** o navegador expõe apenas o adaptador WebGPU de reserva (`isFallbackAdapter`)
- **THEN** o perfil é `desktop-sem-gpu`, a rota não escolhe o whisper-small e a tela não anuncia 589 MB

### Requirement: O tradutor do navegador responde antes de o opus-mt aquecer

Com a Translator API presente, o pré-aquecimento do opus-mt SHALL esperar:

- a preparação do clique, quando ela existe;
- sem ela, a pergunta que diz se o par já está no disco (`available`), feita uma vez por par na sessão, com prazo de
  1,5 s.

A pergunta SHALL NOT criar o tradutor nem mudar o que a sessão sabe do par. Com o par `available`, o opus-mt SHALL
NOT aquecer. Sem a Translator API, o opus-mt SHALL aquecer na hora. Com o par `downloadable`, ou sem resposta no
prazo, ele SHALL aquecer como antes.

#### Scenario: Chrome que já traduz o par

- **WHEN** a tela de captura abre num Chrome cujo pacote do par está no disco
- **THEN** o opus-mt não carrega, e a legenda é traduzida pelo tradutor do navegador

### Requirement: Legenda sem baixar nada no desktop fraco

No desktop sem GPU provada, com o reconhecedor do navegador capaz de transcrever no aparelho (`processLocally`) o
idioma do vídeo, a captura SHALL oferecer a escolha do idioma do vídeo antes de começar. Escolhido o idioma, o áudio
da aba SHALL ir ao reconhecedor do navegador, e o Whisper SHALL NOT carregar nem aquecer para esse áudio. O selo SHALL
dizer que a transcrição é do navegador. Celular e Quest SHALL ficar fora da oferta.

#### Scenario: Idioma escolhido na oferta

- **WHEN** a pessoa, num desktop sem GPU com a Web Speech local e a Translator API com o par no disco, toca no idioma
  sugerido e inicia a captura
- **THEN** a legenda chega transcrita pelo navegador e traduzida pelo nativo, sem nenhum pedido aos pesos do Hub nem
  aos workers do Whisper e do opus-mt

### Requirement: Bergamot no pt→en, servido do próprio domínio e conferido

A tradução local pt→en SHALL usar o Bergamot, com o opus-mt de reserva. A en→pt SHALL continuar no opus-mt.

O build SHALL baixar os modelos do par, conferir o sha256 de cada arquivo contra `modelosDoBergamot.json` e servi-los
do próprio domínio com cache `immutable`. O motor (WASM e cola) SHALL sempre sair do próprio domínio. O worker SHALL
conferir o sha256 do conteúdo descomprimido antes de usar o modelo. Sem os arquivos, ou com `BERGAMOT_BAIXAR=0`, o
build SHALL marcar o Bergamot como não oferecido, e o app SHALL seguir no opus-mt.

Enquanto o Bergamot carrega, o opus-mt SHALL NOT baixar junto. Uma falha de carga, integridade ou tradução SHALL
começar a carga do opus-mt. Soltar os modelos SHALL cancelar a tradução em voo sem cair no opus-mt.

#### Scenario: Build sem rede

- **WHEN** o build não consegue baixar os modelos do Bergamot
- **THEN** o build termina, `__BERGAMOT_PT_EN__` é `false`, e o pt→en vai ao opus-mt sem anunciar o download do
  Bergamot

#### Scenario: Arquivo adulterado

- **WHEN** o sha256 de um modelo baixado não confere com o fixado
- **THEN** o Bergamot não carrega, e a carga do opus-mt começa na hora

#### Scenario: en→pt

- **WHEN** a captura traduz do inglês para o português
- **THEN** o tradutor local é o opus-mt, mesmo com o Bergamot disponível

### Requirement: Uma cópia só do onnxruntime-web

O lockfile SHALL ter uma única instalação do `onnxruntime-web`, e o `overrides` do VAD SHALL apontar para a mesma
versão que o `@huggingface/transformers` traz.

#### Scenario: Atualização do transformers

- **WHEN** alguém atualiza o `@huggingface/transformers` e esquece o override do VAD
- **THEN** `tests/ort-uma-copia.test.ts` falha
