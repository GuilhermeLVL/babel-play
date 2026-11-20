## ADDED Requirements

### Requirement: O texto vira fonemas sem código GPL

O motor Kitten SHALL converter texto em fonemas com o fonetizador do próprio app (`src/core/voz/kitten/`), sem espeak-ng
nem outro código ou dado sob GPL. O inglês SHALL usar o léxico CMUdict no alfabeto do misaki que vem no repositório do
modelo. A saída SHALL usar só símbolos do `vocab.json` do modelo, com as vogais nasais em til combinante.

#### Scenario: Frase em português

- **WHEN** o texto "Eu amo você!" é fonetizado em `pt-BR`
- **THEN** a saída é `eʊ ˈɐ̃mʊ vosˈe!` e nenhum módulo do espeak é carregado

#### Scenario: Idioma fora do motor

- **WHEN** o texto é de um idioma fora de pt, en e es
- **THEN** o fonetizador recusa, e quem lê é a voz do sistema

### Requirement: A variante segue o aparelho

`ofertaDoKitten` SHALL devolver o mini para computador com isolamento de origem (`crossOriginIsolated`) e memória
informada de 4 GB ou mais (ou não informada), e o pico para celular, iOS, Quest, aparelho sem isolamento ou com pouca
memória. A oferta SHALL ser `não` com a flag `voz_kitten` desligada, sem WebAssembly ou sem OPFS, e SHALL NOT depender
do perfil protegido (a licença Apache-2.0 atende todos).

#### Scenario: Celular de criança

- **WHEN** a flag está ligada, o perfil é protegido e o aparelho é um celular
- **THEN** a oferta é a variante pico

#### Scenario: Safari no Mac

- **WHEN** o computador não tem isolamento de origem
- **THEN** a variante é o pico (o mini em 1 thread não acompanha a fala)

### Requirement: O download é por idioma, consentido e conferido

Os arquivos de um idioma SHALL ser baixados só depois do toque da pessoa, com o tamanho dito antes; acima do teto do
perfil (`confirmarDownloadAcimaDeMb`) a tela SHALL pedir confirmação. Cada arquivo SHALL ter tamanho e sha256 conferidos
antes de virar pronto, e o download SHALL ser cancelável e retomável. O que outro idioma já trouxe SHALL NOT ser contado
nem baixado de novo.

#### Scenario: Celular nos dados móveis

- **WHEN** a economia de dados está ligada e a pessoa toca "Baixar" no português
- **THEN** a tela pergunta antes, dizendo cerca de 10 MB

#### Scenario: Hash errado

- **WHEN** o sha256 de um arquivo não confere
- **THEN** nada é marcado como pronto e a tela oferece tentar de novo

### Requirement: Quem lê em voz alta

Com a flag `voz_kitten` ligada e a raiz dos pesos configurada, a ordem SHALL ser: a voz natural no aparelho (modelo do
idioma pronto, escolha automática ou `@kitten`) → a voz do sistema aceita (nem de efeito nem robótica) → nenhuma, com
`onError` e o texto na tela. Uma escolha explícita (voz do sistema, nuvem ou Supertonic) SHALL vencer. Com a flag
desligada, a decisão SHALL ser a de antes.

#### Scenario: Só voz robótica no aparelho

- **WHEN** o modelo do idioma não está baixado e o sistema só tem vozes robóticas ou de efeito para o idioma
- **THEN** a fala não sai e quem chamou recebe `onError`

#### Scenario: Voz natural pronta

- **WHEN** o modelo do pt está pronto e a escolha do pt é a automática
- **THEN** `speak()` em pt-BR sai pelo Kitten, num Web Worker, com a voz escolhida (padrão Beatriz no mini, Juliana no pico)

### Requirement: A síntese não fica em silêncio

O motor Kitten SHALL rodar num Web Worker, SHALL usar a fila de prioridade e a pré-busca do motor no aparelho, SHALL
encerrar a fala pela duração real do áudio e SHALL permitir cancelar. Se uma frase falhar, a MESMA frase SHALL ser lida
pela reserva. O WebGPU SHALL ser mantido só se o aquecimento sair em tempo real (RTF < 0,5); senão, WASM.

#### Scenario: WebGPU por software

- **WHEN** o adaptador WebGPU é por software e o aquecimento sai com RTF 17
- **THEN** a sessão é recriada no WASM e a fala segue

### Requirement: Os pesos ficam espelhados com sha256 fixado

Os arquivos SHALL ser servidos de `VITE_VOZ_KITTEN_URL` no layout `<raiz>/<variante>/<caminho>`, a origem SHALL entrar só
em `connect-src` da CSP, e o script de espelho SHALL baixar da revisão fixada do Hugging Face e recusar qualquer byte cujo
tamanho ou sha256 não bata com a lista. Sem a variável, a voz natural SHALL NOT aparecer e nenhum chunk do motor SHALL
ser carregado.

#### Scenario: Sem a variável

- **WHEN** `VITE_VOZ_KITTEN_URL` está vazia
- **THEN** a seção "Voz natural" não aparece e nenhuma requisição vai aos pesos
