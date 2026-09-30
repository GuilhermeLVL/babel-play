## ADDED Requirements

### Requirement: Progresso e streaming não inundam a thread principal

O progresso de carga dos modelos locais SHALL chegar à thread principal só quando a barra avança 1% ou quando passam
200 ms com byte novo. O primeiro evento e o de 100%/pronto SHALL sempre chegar. O streaming do decode SHALL mandar a
primeira palavra na hora e as seguintes com pelo menos 120 ms entre si. O texto retido SHALL ser postado antes do
resultado final. As atualizações de streaming e de progresso de um mesmo quadro SHALL virar um só `setState`, e um
parcial SHALL NOT cobrir o final.

#### Scenario: Modelo lido do cache

- **WHEN** a biblioteca chama o callback de progresso a cada chunk de um modelo que vem do Cache Storage
- **THEN** a tela recebe no máximo uma mensagem por ponto percentual ou por 200 ms, além da primeira e da de pronto

#### Scenario: O último update é o texto inteiro

- **WHEN** o decode termina com tokens ainda retidos pelo intervalo de 120 ms
- **THEN** esses tokens são postados antes do `result`, e o último texto na tela é o texto completo

### Requirement: A tela de captura não re-renderiza por causa do nível do áudio

As ondas do nível SHALL ser atualizadas sem estado React: elas leem o pico por ref e escrevem o estilo das barras
direto. A rolagem que segue o fim da conversa SHALL rodar só quando o número de falas ou o texto das duas últimas
cresce, e SHALL ler o layout dentro de um `requestAnimationFrame`.

#### Scenario: Silêncio com a captura ligada

- **WHEN** a captura está ativa e ninguém fala
- **THEN** as ondas continuam se mexendo sem re-renderizar a `LiveCapture`

### Requirement: Orçamento global de threads dos motores locais

Os motores locais SHALL dividir as threads do ONNX Runtime por um orçamento único que deixa um núcleo para a thread
principal. As regras:

- Whisper: `clamp(núcleos − 3, 1, 4)`, com teto 2 no modo leve;
- tradutor: 2 com 8 núcleos ou mais, senão 1;
- VAD e voz: 1;
- sem `crossOriginIsolated`, todo motor SHALL receber 1 thread.

O VAD SHALL rodar com 1 thread e SIMD.

#### Scenario: Desktop de 8 núcleos isolado

- **WHEN** o aparelho informa 8 núcleos, `crossOriginIsolated` é `true` e o perfil não é leve
- **THEN** o Whisper recebe 4 threads, o tradutor 2, e o VAD e a voz 1 cada

#### Scenario: Sem isolamento de origem

- **WHEN** `crossOriginIsolated` é `false`
- **THEN** todo motor recebe 1 thread

### Requirement: Parciais só onde o aparelho acompanha

A captura SHALL perguntar ao pipeline se ele quer o parcial antes de copiar o áudio da fala. Ela SHALL NOT montar o
parcial quando a resposta é não: modo desempenho escolhido pela pessoa, parciais cortados pelo regulador, microfone
com a aba escondida ou motor local só de reserva. No aparelho leve, os parciais SHALL vir a cada 2,2 s, contra 1,1 s
nos outros, e o final especulativo SHALL NOT rodar. A tradução do parcial SHALL usar beam 1 com teto de 128; a do
final SHALL continuar em beam 2 com teto de 256.

#### Scenario: Modo desempenho escolhido

- **WHEN** a pessoa ligou o modo desempenho e chega o tique do parcial
- **THEN** o áudio da fala não é copiado e nenhum decode de parcial acontece

### Requirement: O regulador reage à tela travada

O regulador de desempenho da captura SHALL descer um degrau quando a thread principal fica bloqueada por 400 ms ou
mais numa janela de 10 s. Também SHALL descer já no primeiro final quando o RTF do trecho passa de 1,5 com fila. No
aparelho leve, SHALL descer com 2 trechos ruins e 6 s entre degraus.

O vigia SHALL NOT contar o quadro que começa dentro da abertura do VAD (`MicVAD.new`), nem nada anterior ao início da
sessão. Um travamento durante a sessão SHALL continuar cortando os parciais.

#### Scenario: A abertura do VAD

- **WHEN** a primeira sessão do ORT da página instancia o WASM na thread principal e produz um quadro longo dentro do
  intervalo marcado da abertura do VAD
- **THEN** o regulador não corta os parciais por causa desse quadro

#### Scenario: Travamento de verdade

- **WHEN** durante a sessão a thread principal soma 400 ms ou mais de bloqueio em 10 s
- **THEN** o regulador aplica o gatilho `travamento` e o motivo aparece no console

### Requirement: Modo desempenho automático com um parcial por fala

No aparelho leve, o modo desempenho SHALL vir ligado de fábrica, e esse valor automático SHALL NOT ser gravado como
preferência. No modo automático, o pipeline SHALL pedir um único parcial por fala, quando ela já tem 1,5 s. No modo
que a pessoa liga, SHALL NOT haver parcial nenhum. Ligado sozinho, o interruptor SHALL descrever o que o modo
automático faz.

#### Scenario: Notebook fraco sem escolha salva

- **WHEN** um aparelho leve começa a captura sem `ui.perfMode` salvo
- **THEN** o modo desempenho está ligado, cada fala recebe uma prévia com 1,5 s dela e depois o final, e salvar
  qualquer outro ajuste não grava `perfMode`

#### Scenario: A pessoa liga o modo

- **WHEN** a pessoa liga o interruptor do modo desempenho
- **THEN** a legenda sai só no fim de cada frase, como a descrição promete

### Requirement: Um modelo de cada vez e modelos soltos ao sair

O STT e o tradutor locais SHALL carregar juntos só no desktop com GPU e 8 GB ou mais; `deviceMemory` ausente conta
como 8. Nos outros aparelhos, o tradutor SHALL esperar o STT ficar pronto. O pré-aquecimento SHALL aquecer só o
sentido de tradução que a preparação carrega. O worker do tradutor SHALL guardar no máximo dois opus-mt, soltando o
que sai antes da próxima carga, e SHALL carregar um de cada vez. Ao sair da captura, os modelos SHALL ser soltos
depois de 90 s; voltar antes cancela. No aparelho de pouca memória, SHALL ser soltos na hora.

#### Scenario: Desktop sem GPU

- **WHEN** a captura prepara o Whisper e o opus-mt num desktop sem GPU
- **THEN** o opus-mt só começa a carregar depois que o Whisper fica pronto

#### Scenario: Terceiro tradutor

- **WHEN** a captura pede um terceiro par de tradução com dois já carregados
- **THEN** o menos recente é solto antes de a carga do novo começar

### Requirement: A bancada vigia o desempenho da captura

O repositório SHALL ter uma bancada que mede na edição estática, nos perfis `desktop` e `fraco`:

- frames longos;
- tempo até a 1ª legenda;
- RTF p50/p95;
- memória de pico;
- CPU no silêncio;
- renders/s.

A bancada SHALL rodar no CI em PR que toca a captura e sob demanda. SHALL reprovar quando uma métrica piora além da
tolerância do ambiente, e SHALL só relatar quando o ambiente não tem linha de base. A linha de base SHALL ser gravada
pelo workflow e commitada por uma pessoa: o workflow SHALL NOT escrever no repositório.

#### Scenario: PR que mexe na captura

- **WHEN** um PR altera `src/lib/captura/**` e o ambiente `ci-ubuntu` tem linha de base
- **THEN** o job `desempenho` compara a mediana das rodadas com o `slo-captura.json` e falha se alguma métrica passar
  da tolerância

#### Scenario: Ambiente sem base

- **WHEN** o `slo-captura.json` não tem o ambiente `ci-ubuntu`
- **THEN** o job publica a tabela e o artefato sem reprovar
