## ADDED Requirements

### Requirement: O Moonshine do aparelho é o segundo motor local da leitura em voz alta

Com a flag `leitura_voz_local` ligada, quando o navegador não tem Web Speech com `processLocally` e o texto está em inglês,
a leitura em voz alta SHALL usar o Moonshine rodando no aparelho (tiny no celular fraco, no Quest e com economia de dados;
base nos demais). O Web Speech local SHALL continuar preferido onde existir. A flag SHALL nascer desligada e, desligada, a
leitura SHALL se comportar como antes.

#### Scenario: Safari sem reconhecimento local

- **GIVEN** o Safari, a flag `leitura_voz_local` ligada e o modelo do Moonshine pronto
- **WHEN** a pessoa abre a tela de antes de ler um texto em inglês
- **THEN** "Ler em voz alta" fica habilitado e a leitura usa o Moonshine do aparelho

#### Scenario: Chrome com reconhecimento local

- **GIVEN** o Chrome 139 ou mais novo com `processLocally`
- **WHEN** a pessoa lê em voz alta
- **THEN** o motor usado é o Web Speech local e nenhum modelo é baixado

#### Scenario: Flag desligada

- **WHEN** a flag `leitura_voz_local` está desligada e o navegador não tem reconhecimento local
- **THEN** "Ler em voz alta" aparece esmaecido com a explicação de hoje

### Requirement: Parcial por fala, sem mudar o cursor

O motor Moonshine SHALL entregar ao alinhador parciais da fala corrente enquanto a pessoa lê (a cada cerca de 0,7 s com o
worker ocioso) e um texto final ao fim de cada trecho de fala detectado por pausa. O texto SHALL passar por estabilizador
de prefixo antes de chegar ao alinhador, e o cursor SHALL continuar só avançando, na janela de até 6 palavras. Silêncio
SHALL NOT gerar texto nem avançar o cursor.

#### Scenario: Parcial que reescreve a cauda

- **GIVEN** o cursor depois de "picks" e o motor entregando "she picks six" e depois "she picks sit red"
- **WHEN** o segundo parcial chega
- **THEN** nenhuma palavra volta a `pendente` e o cursor não recua

#### Scenario: Silêncio

- **WHEN** a pessoa fica 5 s sem falar com o microfone ligado
- **THEN** nenhuma palavra muda de estado

### Requirement: A voz continua só no aparelho com o segundo motor

O motor Moonshine SHALL ficar na lista de motores locais e MUST NOT ter caminho de nuvem. O áudio SHALL ficar só em memória e
SHALL ser descartado ao fim de cada frase, ao pausar, ao sair e ao ir para segundo plano, sem fechar o modelo. O modelo SHALL
baixar só depois de a pessoa aceitar o tamanho, mostrado antes do pedido de microfone.

#### Scenario: Erro do modelo no meio da leitura

- **GIVEN** a leitura em voz alta com o Moonshine
- **WHEN** o modelo lança erro
- **THEN** a tela mostra "O microfone parou." com "Ligar de novo" e "Seguir em silêncio", nenhuma sessão de reconhecimento em
  nuvem é aberta e o progresso das frases fica

#### Scenario: Não aceitou o download

- **WHEN** a pessoa toca em "Agora não" no aviso do modelo
- **THEN** nenhuma requisição ao Hub é feita, o microfone não liga e "Ler em silêncio" e "Ouvir primeiro" seguem funcionando

#### Scenario: Fim de uma frase

- **WHEN** a pessoa termina a frase 2
- **THEN** os buffers de áudio e o estado do estabilizador são zerados e só o estado das palavras da frase 2 fica
