## ADDED Requirements

### Requirement: O modo frase por frase só existe com a flag e só em mídia do Frasy

O player da Análise e o reprodutor do audiolivro SHALL oferecer o modo "Frase por frase" somente quando a flag
`frase_por_frase` estiver ligada para a pessoa. A flag SHALL nascer desligada. O modo SHALL atuar só em áudio gravado ou
importado da sessão, na narração por voz sintetizada e no capítulo do audiolivro; o Frasy MUST NOT prometer controle sobre
mídia de outra aba ou aplicativo.

#### Scenario: Flag desligada

- **WHEN** a flag `frase_por_frase` está desligada
- **THEN** o player da sessão se comporta como antes e nenhum controle do modo aparece

#### Scenario: Mídia externa

- **WHEN** a pessoa captura o som de outra aba pela captura do sistema
- **THEN** o modo não é oferecido sobre essa captura e a tela não sugere que pausará a outra aba

### Requirement: Repetir e pausar por frase automaticamente

Com o modo ligado, ao fim de cada frase o player SHALL repetir a frase até o número de vezes escolhido (1, 2 ou 3), esperar
a pausa de repetir (de 0,5 a 2 vezes a duração da frase, padrão 1) e então seguir para a frase seguinte, sem toque. Com
"Parar no fim", SHALL parar até a pessoa tocar em "Próxima". Na última frase SHALL parar.

#### Scenario: Repetir duas vezes e seguir

- **GIVEN** o modo com repetir 2x e pausa 1x
- **WHEN** a frase 3 termina
- **THEN** o player toca a frase 3 de novo, espera o tempo da duração dela e passa à frase 4

#### Scenario: Parar no fim

- **GIVEN** o modo com "Parar no fim"
- **WHEN** a frase termina
- **THEN** a reprodução para e só segue com "Próxima"

#### Scenario: Última frase

- **WHEN** a última frase termina a última repetição
- **THEN** a reprodução para e "Próxima" fica desabilitada

### Requirement: Só com tempos confiáveis

O modo SHALL ser oferecido apenas quando as falas têm `startTime` crescente e duração entre 0,5 s e 15 s. Do contrário a
tela SHALL dizer que a sessão não tem tempos bons para o modo e MUST NOT cortar a mídia por tempos duvidosos.

#### Scenario: Legenda importada com tempos fora da faixa

- **GIVEN** uma sessão importada com uma frase de 40 s
- **WHEN** a pessoa abre o seletor de modo
- **THEN** "Frase por frase" aparece indisponível com o motivo

### Requirement: A prática abre sem sair do fluxo e nada novo é guardado

No fim da pausa, a pessoa SHALL poder abrir a sombra ou o ditado da frase em foco sem trocar de tela; ao fechar, o modo SHALL
seguir da frase seguinte. O modo MUST NOT gravar áudio, texto da fala nem preferência fora do aparelho; a escolha de
repetições e pausa fica só em `localStorage`, e a tela SHALL funcionar sem armazenamento.

#### Scenario: Sombra no meio do modo

- **WHEN** a pessoa toca em "Repetir em voz alta" durante a pausa e fecha a folha
- **THEN** o player segue da frase seguinte e nenhum dado saiu do aparelho

#### Scenario: Sem armazenamento

- **WHEN** `localStorage` lança erro
- **THEN** o modo funciona na visita com os valores padrão
