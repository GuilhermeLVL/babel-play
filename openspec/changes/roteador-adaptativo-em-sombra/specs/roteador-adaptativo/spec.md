## ADDED Requirements

### Requirement: O roteador adaptativo estende a política de rota existente

A decisão adaptativa SHALL viver em `src/core/rota/` e SHALL compor `decidirRota`: a guarda (privado, protegido, consentimento,
plano, cota, rede) SHALL rodar antes e o adaptativo SHALL escolher só entre degraus que ela permitiu. `PedidoDeRota` SHALL ganhar
`sessao?` opcional (RTF, fila, ms de MT, confiança do STT) e, ausente, a decisão SHALL ser idêntica à de hoje.

#### Scenario: Sem sessão

- **WHEN** o pedido não traz `sessao`
- **THEN** `decidirRota` devolve exatamente a decisão de antes, e o teste de equivalência com `routeStt`/`routeMt` segue verde

#### Scenario: Guarda primeiro

- **WHEN** a nuvem foi descartada pela guarda (sem consentimento, plano, cota, perfil protegido sem responsável)
- **THEN** o roteador adaptativo nunca a sugere, por pior que sejam RTF e fila

### Requirement: Em sombra a rota real nunca muda

Com `roteador_adaptativo_sombra` ligada, o app SHALL calcular a decisão adaptativa por trecho e registrá-la ao lado da rota efetiva,
e SHALL NOT alterar motor, modelo, nuvem ou tradutor efetivos. A flag SHALL nascer DESLIGADA, sem regra de plano (migrações
provisórias PG 0027 e SQLite 0069, conferidas no PR).

#### Scenario: Flag ligada

- **WHEN** a flag está ligada e uma fala é processada
- **THEN** a rota usada é a mesma que seria com a flag desligada, e a decisão que o roteador tomaria é registrada

#### Scenario: Flag desligada

- **WHEN** a flag está desligada
- **THEN** nada é calculado, registrado ou enviado, e o código da sombra só carrega por `import()`

### Requirement: O registro é agregado, anônimo e só de perfil não protegido

O registro SHALL conter só contagens por classe de aparelho, idioma-base, decisão que tomaria, decisão efetiva e motivo de lista
fechada, com sinais em baldes, no campo `roteador` do lote `v: 2` da telemetria do laboratório. SHALL NOT conter texto, áudio,
id de conta, sessão ou fala, hora exata, IP ou valor bruto de sinal. SHALL respeitar a porta de `rum_latencia` e SHALL NOT sair para perfil
protegido (os números ficam em memória).

#### Scenario: Perfil protegido

- **WHEN** o perfil é de menor ou de idade não declarada
- **THEN** nada é enviado e nada persiste além da sessão

#### Scenario: Forma do lote

- **WHEN** um lote com `roteador` é montado
- **THEN** o teste de contrato confirma só chaves e valores de lista fechada ou numéricos em baldes

### Requirement: O roteador consome as medições de STT, não as duplica

Para o inglês, o roteador SHALL ler `medicoesDeStt` (change `stt-ingles-volume-e-rota`) e SHALL NOT manter outra tabela de WER ou de
vencedor. Se a medição disser que a nuvem não vence o local com IC, a confiança baixa SHALL NOT sugerir nuvem sozinha.

#### Scenario: Nuvem não vence

- **WHEN** `medicoesDeStt` do idioma indica empate ou derrota da nuvem
- **THEN** a decisão adaptativa só sugere nuvem por RTF ou fila, nunca por confiança isolada

### Requirement: A decisão não oscila

A decisão SHALL usar histerese por contagem de falas (subir e descer com condições distintas), e o registro SHALL permitir contar
trocas por minuto.

#### Scenario: RTF ruidoso

- **WHEN** o RTF alterna em torno do limiar a cada fala
- **THEN** a decisão não muda mais de uma vez dentro da janela de histerese

### Requirement: A decisão tem custo de CPU desprezível

`decidirAdaptativo` SHALL ser pura, sem relógio, rede ou DOM, com p99 ≤ 0,05 ms por decisão, e SHALL ser coberta por microbench em teste.

#### Scenario: Microbench

- **WHEN** 10 000 decisões rodam no teste
- **THEN** o p99 fica dentro da meta com folga e o teste falha se estourar

### Requirement: O critério de saída da sombra é escrito antes da coleta

O critério do E-005 SHALL ser registrado em `docs/auditoria/` antes da primeira rodada: precisão ≥ 80% contra a melhor rota a posteriori,
≤ 2 trocas/min e custo simulado ≤ US$ 0,058/h. Se qualquer um falhar, a sombra SHALL NOT ser promovida.

#### Scenario: Critério falha

- **WHEN** a precisão medida é 74%
- **THEN** o relatório conclui "não sair da sombra" e propõe recalibrar ou arquivar
