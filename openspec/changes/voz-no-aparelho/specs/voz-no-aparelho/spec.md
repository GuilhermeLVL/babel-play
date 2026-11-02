## ADDED Requirements

### Requirement: A voz no aparelho entra pela porta de motores de voz

O motor Supertonic SHALL ser registrado como `neural-local` em `registrarMotorDeVoz` e SHALL ser criado pelo Narrador pelo
registro, sem caminho paralelo. A inferência SHALL rodar num Web Worker, nunca na thread principal.

#### Scenario: Motor pronto e escolhido

- **WHEN** a flag `voz_no_aparelho` está ligada, o perfil permite, o modelo está no aparelho e a pessoa escolheu a voz de
  alta qualidade para o idioma do livro
- **THEN** o "Ouvir" lê com o motor local e `speechSynthesis` não fala

#### Scenario: Flag desligada

- **WHEN** a flag está desligada
- **THEN** nenhum código do motor é carregado, nenhuma requisição vai a `VITE_VOZ_MODELO_URL` e o seletor não mostra a opção

### Requirement: O download é consentido, retomável e conferido

O modelo SHALL ser baixado só depois do toque da pessoa, com o tamanho dito antes. O download SHALL mostrar o progresso,
SHALL poder ser cancelado e retomado (`Range`) e SHALL conferir tamanho e sha256 de cada arquivo antes de marcá-lo pronto.
A pessoa SHALL poder apagar o modelo.

#### Scenario: Arquivo corrompido

- **WHEN** o sha256 de um arquivo baixado não confere
- **THEN** o arquivo é descartado e o motor não fica pronto

### Requirement: A narração com o motor local não fica em silêncio

O motor SHALL sintetizar até 2 frases à frente enquanto a atual toca, SHALL encerrar a frase pela duração real do áudio e
SHALL preparar o texto com `prepararTextoParaVoz`. Se uma frase falhar, a MESMA frase SHALL ser lida pela voz do aparelho,
com um aviso uma única vez.

#### Scenario: Falha numa frase

- **WHEN** a síntese de uma frase lança erro
- **THEN** a voz do aparelho lê a frase na hora e o aviso aparece uma vez

### Requirement: O portão por perfil é uma função pura

`ofertaDaVozNoAparelho` SHALL devolver `nao` para flag desligada, perfil protegido, iOS, celular, Quest, memória informada
abaixo de 4 GB, ausência de WebGPU e WASM, ou ausência de OPFS; `por-escolha` com aviso de memória para desktop de pouca
memória (sem isolamento de origem) ou com menos de 8 GB; e `padrao` nos demais.

#### Scenario: Safari no Mac

- **WHEN** desktop sem `crossOriginIsolated`, com WebGPU, sem memória informada
- **THEN** a oferta é `por-escolha` e a tela avisa "usa cerca de 2 a 3 GB enquanto lê"

#### Scenario: Celular

- **WHEN** o perfil é `celular-bom`
- **THEN** a oferta é `nao` e a tela mostra o motivo em uma linha

### Requirement: O elenco usa as vozes do motor

Com o motor ativo, o elenco SHALL distribuir F1–F5 e M1–M5 por `atribuirVozes` (determinístico, sem inferir gênero), e o
narrador SHALL usar a voz escolhida pela pessoa (padrão F1). Sem o motor, o elenco SHALL ficar como antes.

### Requirement: A "Automática" prefere a voz no aparelho quando ela já está pronta

Com a flag ligada, o portão (`ofertaDaVozNoAparelho`) permitindo, o idioma suportado pelo motor (pt, en, es) e o modelo JÁ
baixado e conferido neste aparelho, a opção "Automática" SHALL resolver para o motor `neural-local` desde a PRIMEIRA frase
(função pura `supertonicLe`). Uma escolha explícita por uma voz do sistema ou pela voz natural da nuvem SHALL sempre vencer.
Perfil protegido (menor ou idade não declarada) NUNCA resolve para o motor local.

#### Scenario: Modelo pronto e "Automática"

- **WHEN** a flag está ligada, o perfil permite, o modelo está no aparelho e a escolha do idioma é "Automática"
- **THEN** a primeira frase do "Ouvir" sai do motor local e `speechSynthesis.speak` não é chamado

#### Scenario: Escolha manual de uma voz do sistema

- **WHEN** a pessoa escolheu uma voz do sistema que existe neste aparelho
- **THEN** essa voz lê, mesmo com o modelo pronto

### Requirement: O convite no primeiro "Ouvir" não bloqueia nem surpreende

Só quando o portão permite, a flag está ligada, o idioma é suportado, o modelo NÃO está baixado, a escolha é "Automática" (ou a
voz no aparelho), o capítulo NÃO tem áudio pré-gerado em uso e não houve recusa nos últimos 30 dias, a barra do narrador SHALL
mostrar um cartão pequeno (`role="region"` rotulado, não modal, sem escurecer o fundo, sem pausar, sem roubar o foco) com
"Baixar e usar" e "Agora não". A leitura SHALL começar na hora com a melhor voz do sistema.

- "Baixar e usar": o download SHALL correr em segundo plano com progresso e cancelar; com o modelo pronto e carregado, a voz
  SHALL trocar no próximo limite de frase (a frase em curso termina com a voz antiga; nada é pulado nem repetido; o capítulo
  não recomeça) e a voz no aparelho SHALL virar a escolha da pessoa para o idioma.
- "Agora não": o convite NÃO SHALL voltar neste aparelho por 30 dias (`localStorage`, com try/catch); a opção segue no seletor.
- Falha de rede ou de espaço: uma mensagem curta com a saída ("A leitura continua com a voz do sistema. Tente baixar de novo
  em Voz e modo."), nunca silêncio.

#### Scenario: Celular, perfil protegido ou áudio gravado

- **WHEN** o aparelho é celular, tablet, iOS ou Quest, ou o perfil é protegido, ou a flag está desligada, ou o idioma não é
  suportado, ou o capítulo toca o áudio pré-gerado
- **THEN** não há cartão e nenhuma requisição vai ao endereço do modelo

#### Scenario: Troca no limite de frase

- **WHEN** o modelo fica pronto enquanto a frase N é lida pela voz do sistema
- **THEN** a frase N termina na voz do sistema e a frase N+1 sai do motor local
