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
