## ADDED Requirements

### Requirement: O cartão pode ter o clipe da fala de onde nasceu

Com a flag `cartao_com_audio` ligada e a pessoa não tendo escolhido "Não guardar", o app SHALL guardar, ao salvar uma palavra
nascida de uma fala capturada, um clipe de 1 a 8 segundos dessa fala, com 150 ms de folga, em Ogg Opus mono (ou WAV onde o
navegador não codifica Opus).

#### Scenario: Palavra salva da legenda

- **GIVEN** a flag ligada e o destino "Só neste aparelho"
- **WHEN** a pessoa salva uma palavra de uma fala de 3 s
- **THEN** existe um clipe de 3,3 s, mais ou menos 50 ms, ligado ao cartão, com no máximo 4 KB por segundo

#### Scenario: Flag desligada

- **WHEN** a flag está desligada
- **THEN** nada é cortado, nada é guardado e a revisão se comporta como antes

#### Scenario: Fala longa

- **WHEN** a fala tem 14 s
- **THEN** o clipe tem no máximo 8 s, centrado na palavra

### Requirement: A revisão toca o clipe do cartão antes de qualquer outra fonte

A "Fala original" do verso SHALL tocar o clipe do cartão quando existe; sem clipe, o trecho da gravação da sessão; sem ele, a
voz do aparelho. Havendo clipe, o app MUST NOT baixar o áudio da sessão.

#### Scenario: Cartão com clipe

- **WHEN** a pessoa toca "Fala original" num cartão com clipe
- **THEN** o clipe toca e nenhuma requisição a `/api/sessions/:id/audio` é feita

#### Scenario: Cartão sem clipe e sessão com áudio

- **WHEN** o cartão não tem clipe e a sessão tem áudio
- **THEN** toca o trecho da sessão, como hoje

#### Scenario: Cartão do Anki sem áudio nem sessão

- **WHEN** não há clipe nem sessão
- **THEN** toca a voz do aparelho no idioma da frase, ou fica em silêncio se não houver voz

### Requirement: Perfil protegido guarda o áudio só no aparelho

Para o perfil protegido (menor de 18 ou idade não declarada, inclusive sem conta), o clipe SHALL ficar apenas no aparelho. O app
MUST NOT oferecer o destino "Na minha conta" e o servidor SHALL recusar o envio de clipe com 403.

#### Scenario: Menor tenta enviar clipe

- **GIVEN** uma conta de 14 anos
- **WHEN** um cliente adulterado faz `PUT /api/vocab/:id/audio`
- **THEN** o servidor responde 403, não grava nada e não reserva armazenamento

#### Scenario: Adulto escolhe a conta

- **GIVEN** um adulto declarado com conta
- **WHEN** escolhe "Na minha conta"
- **THEN** os clipes novos sobem como anexo do cartão e contam no teto da conta

### Requirement: O clipe nunca vai a provedor de IA nem a lugar público

O clipe MUST NOT ser enviado a nenhum provedor de IA, MUST NOT ter URL pública e SHALL ser lido só pelo dono do cartão.

#### Scenario: Leitura por outra conta

- **WHEN** outra conta pede `GET /api/vocab/:id/audio`
- **THEN** recebe 404

### Requirement: Apagar é apagar

Excluir o cartão, excluir a sessão de origem (quando o clipe é da conta), "Apagar todos os áudios" e excluir a conta SHALL
remover os clipes correspondentes, e a exportação de dados SHALL incluí-los.

#### Scenario: Exclusão de conta

- **WHEN** a conta é excluída
- **THEN** nenhum objeto de clipe da conta resta no armazenamento

#### Scenario: Trocar de conta no aparelho

- **WHEN** outra pessoa entra no mesmo aparelho
- **THEN** os clipes locais da conta anterior foram apagados

### Requirement: Os clipes têm teto

O armazenamento local SHALL ter teto por aparelho (200 MB) e o da conta, teto por conta; ao atingir, o mais antigo SHALL sair
com aviso, e o cartão MUST seguir funcionando pelo caminho de queda.

#### Scenario: Teto local atingido

- **WHEN** um clipe novo não cabe no teto local
- **THEN** o clipe mais antigo é removido, a pessoa vê o aviso uma vez, e o cartão sem clipe toca pela sessão ou pela voz
