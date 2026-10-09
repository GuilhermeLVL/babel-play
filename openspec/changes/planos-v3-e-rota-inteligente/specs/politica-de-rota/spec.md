## ADDED Requirements

### Requirement: Uma política única decide a rota da fala

O app SHALL decidir onde transcrever, traduzir, falar e explicar por uma função pura
`decidirRota(pedido)`, que recebe tarefa, fonte, idioma, aparelho, capacidades do plano e estado, e
devolve a rota, as reservas, o que foi descartado e o motivo. Nenhum outro ponto do cliente SHALL
decidir entre aparelho e nuvem por conta própria.

#### Scenario: Toda decisão tem motivo e reserva local

- **WHEN** a política decide qualquer tarefa em qualquer aparelho e plano
- **THEN** a decisão traz um motivo da lista fechada e as reservas terminam num degrau do aparelho

#### Scenario: A política decide pela capacidade, não pelo nome do plano

- **WHEN** dois planos concedem as mesmas capacidades e o mesmo restante de cota
- **THEN** a decisão é idêntica para os dois

### Requirement: O que nunca sai do aparelho

A tradução parcial, o perfil privado e o perfil protegido sem autorização do responsável SHALL ser
atendidos só por degraus do aparelho. Sem consentimento registrado para um degrau que envia áudio, a
política SHALL descartá-lo com o motivo `sem-consentimento`.

#### Scenario: Perfil protegido

- **WHEN** a pessoa é menor, não declarou idade ou está sem conta, e não há autorização do responsável
- **THEN** a rota é `modelo-no-aparelho` ou `navegador-no-aparelho`, em qualquer plano

#### Scenario: Parcial de tradução

- **WHEN** a tarefa é `mt-parcial`
- **THEN** a rota fica no aparelho com o motivo `parcial-nunca-sai`

### Requirement: Aparelho primeiro, navegador depois, nossa nuvem por último

Na preferência automática, a política SHALL escolher o aparelho quando ele acompanha (fator de tempo
real medido até 0,5 na média móvel) e o idioma é bem servido localmente; SHALL preferir o recurso do
navegador processado no aparelho ao que envia áudio; e SHALL usar a nuvem do Babel só quando o plano
inclui, há cota, a nuvem não está pausada e ela compensa.

#### Scenario: Pagante com computador capaz, em inglês

- **WHEN** o plano inclui nuvem por trechos, a placa de vídeo está provada e o idioma é inglês
- **THEN** a rota é `modelo-no-aparelho` com o motivo `aparelho-da-conta` e a nuvem fica de reserva

#### Scenario: Quest com plano que inclui nuvem

- **WHEN** o aparelho é o Quest, o idioma é português e a nuvem foi consentida
- **THEN** a rota é `nuvem-por-trechos` com o motivo `aparelho-nao-acompanha`

#### Scenario: Grátis no celular, fora do inglês

- **WHEN** o plano não inclui nuvem e o modelo local não acompanha
- **THEN** a política oferece a fala do navegador com a etiqueta própria, e só a usa com aceite

### Requirement: Cota esgotada não bloqueia

Quando o restante do mês ou do dia do nível pedido é zero, a política SHALL cair para o aparelho com o
motivo `cota-do-mes` ou `cota-do-dia` e a ação `ver-consumo`.

#### Scenario: Premium com o mês esgotado

- **WHEN** o restante de segundos por trechos do mês é zero
- **THEN** a captura segue no aparelho e a tela pode mostrar o consumo

### Requirement: Entrada em modo sombra e atrás de flag

A política SHALL primeiro rodar ao lado da decisão atual, registrando divergência só em
desenvolvimento, e SHALL passar a valer apenas com a flag `rota_inteligente` ligada.

#### Scenario: Flag desligada

- **WHEN** `rota_inteligente` está desligada
- **THEN** a rota efetiva é a mesma de antes desta change em todos os casos de caracterização

### Requirement: O servidor confere o nível

O servidor SHALL recusar um pedido de nível que o plano não concede ou cuja cota acabou, com os mesmos
códigos de hoje (402 para o mês, 429 para o dia), independentemente do que o cliente decidiu.

#### Scenario: Cliente pede "ao vivo" sem o direito

- **WHEN** chega um pedido de transcrição ao vivo de uma conta sem `sttAoVivo`
- **THEN** o servidor recusa e nenhuma cota é consumida
