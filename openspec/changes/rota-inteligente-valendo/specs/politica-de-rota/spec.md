## ADDED Requirements

### Requirement: A política só decide com a flag ligada

A política SHALL decidir a rota somente quando a flag `rota_inteligente` estiver ligada; desligada, SHALL valer a decisão de hoje e a
conferência SHALL registrar zero divergência.

#### Scenario: Flag desligada

- **WHEN** `rota_inteligente` está desligada
- **THEN** o pipeline segue a decisão atual e `conferenciaDaRota` não aponta divergência

#### Scenario: Flag ligada

- **WHEN** `rota_inteligente` está ligada e o pedido é de uma conta de plano pago em aparelho com WebGPU
- **THEN** a decisão vem de `decidirRota` e o selo mostra o motivo dela

### Requirement: A política conhece o aparelho primeiro e os parciais

A política SHALL tratar a decisão de `stt_aparelho_primeiro` (áudio difícil) como estado de entrada, não como divergência, e SHALL
considerar `parciais_parakeet` e `parciais_vivos` ao classificar uma tarefa como parcial. Tradução parcial SHALL continuar só no aparelho.

#### Scenario: Áudio difícil

- **WHEN** `audioDificil` recomenda a nuvem e a conta tem direito e cota
- **THEN** a política escolhe a nuvem com o motivo `audio-dificil`, sem registrar divergência

#### Scenario: Parcial vivo

- **WHEN** a flag `parciais_vivos` está ligada e a tarefa é `mt-parcial`
- **THEN** a rota fica no aparelho com o motivo `parcial-nunca-sai`

### Requirement: Abertura gradual e reversível

A abertura SHALL ser por percentual de contas, acompanhando as quedas de rota, e desligar a flag SHALL devolver a decisão de hoje sem
deploy. Perfil protegido SHALL ficar no aparelho em qualquer percentual.

#### Scenario: Reversão

- **WHEN** a flag volta a desligada com sessões abertas
- **THEN** a próxima fala segue a decisão de hoje e nenhum áudio passa a sair sem consentimento
