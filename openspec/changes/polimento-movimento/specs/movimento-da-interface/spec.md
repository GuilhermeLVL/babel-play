## ADDED Requirements

### Requirement: O movimento rico tem chave própria

O app SHALL aplicar o movimento rico (molas, painéis que seguem o dedo, cascatas) somente quando o
aparelho não é o headset, não está no modo leve e a pessoa não pediu menos movimento, e SHALL marcar
essa decisão em `<html data-movimento="rico|contido">` enquanto a casca do desenho novo estiver
montada (`src/lib/movimento/animar.ts:21`, `src/lib/movimento/animar.ts:35`).

#### Scenario: No headset nada muda

- **WHEN** o desenho novo roda no headset
- **THEN** a marca é `contido` e nenhuma regra da camada de movimento rico se aplica

#### Scenario: A pessoa desliga as animações

- **WHEN** o interruptor de animações é desligado com a casca montada
- **THEN** a marca passa a `contido` sem recarregar a página

#### Scenario: O Modo desempenho é ligado

- **WHEN** a escolha manual do Modo desempenho muda
- **THEN** a marca acompanha

### Requirement: Animar por código passa por uma porta só

Toda animação feita por código na camada de movimento rico SHALL passar por `animar`, que devolve
`null` e não toca no elemento quando o movimento rico não vale
(`src/lib/movimento/animar.ts:65`). Cancelar uma animação SHALL NOT deixar promessa rejeitada sem
tratamento (`src/lib/movimento/animar.ts:83`).

#### Scenario: Movimento reduzido

- **WHEN** `animar` é chamado com o movimento rico desligado
- **THEN** devolve `null` e o elemento fica no estado que quem chamou já aplicou

### Requirement: As molas do CSS e do código são as mesmas

As curvas `--q-mola` e `--q-mola-suave` de `src/styles/questMovimento.css` SHALL ser exatamente as
que `curvaDeMola` gera (`src/lib/movimento/mola.ts:27`), e o arquivo SHALL valer só no desenho novo.

#### Scenario: Alguém muda a mola num lugar só

- **WHEN** a curva do código e a do CSS divergem
- **THEN** `tests/movimento.test.ts` falha

### Requirement: A inclinação vem do sensor ou do ponteiro

O app SHALL entregar a inclinação do aparelho como um par entre -1 e 1, relativo ao jeito de
segurar, vindo do giroscópio quando ele existe e do ponteiro quando não existe, e SHALL NOT
entregar nada a quem pediu menos movimento (`src/lib/dispositivo/inclinacao.ts:43`,
`src/lib/dispositivo/inclinacao.ts:113`).

#### Scenario: O jeito de segurar é o zero

- **WHEN** chega a primeira leitura do sensor
- **THEN** a inclinação é zero, e só a diferença para ela conta dali em diante

#### Scenario: Celular com sensor

- **WHEN** o sensor começa a entregar
- **THEN** o ponteiro deixa de valer como inclinação

### Requirement: O celular vibra no que acontece, com chave própria

O app SHALL ter um padrão de vibração por tipo de acontecimento e SHALL vibrar somente em aparelho
de toque com motor, com a chave `babel.vibracao` ligada (de fábrica, ligada)
(`src/lib/dispositivo/tato.ts:30`, `src/lib/dispositivo/tato.ts:82`).

#### Scenario: A pessoa desliga a vibração

- **WHEN** a chave está em `nao`
- **THEN** nenhum acontecimento vibra

#### Scenario: Reduzir movimento não desliga o tato

- **WHEN** a pessoa pediu menos movimento
- **THEN** a vibração continua, porque não é movimento na tela
