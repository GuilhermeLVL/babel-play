## ADDED Requirements

### Requirement: Fechar a fala pelo conteúdo, não só pelo silêncio

Com a chave `babel.interprete.fimInteligente` ligada e o idioma coberto, o app SHALL decidir o fim da fala combinando o
silêncio e um modelo de turno sobre o áudio. Ao detectar um silêncio candidato, o app MUST consultar o modelo com os
últimos 8 s de áudio. Se o modelo indicar fala completa, o app MUST fechar a fala imediatamente. Se indicar incompleta,
o app MUST continuar ouvindo até o teto de silêncio. O app MUST fechar a fala no teto de qualquer jeito.

#### Scenario: Frase completa fecha cedo

- **WHEN** a pessoa termina uma frase com entonação final e faz ~300 ms de silêncio
- **THEN** a fala fecha sem esperar os 800 ms

#### Scenario: Pausa para pensar

- **WHEN** a pessoa para no meio de uma frase por 600 ms e o modelo indica fala incompleta
- **THEN** a fala continua aberta e a continuação entra na mesma fala

#### Scenario: Teto de silêncio

- **WHEN** o modelo indica incompleta e o silêncio chega ao teto
- **THEN** a fala fecha

### Requirement: Queda segura para o silêncio fixo

Se o modelo não carregou, falhou ou o idioma não está na lista aprovada, o app SHALL usar o silêncio fixo de 800 ms.
O app MUST registrar o motivo da queda no medidor, sem texto. O app MUST NOT travar a conversa por falha do modelo.

#### Scenario: Idioma fora da lista

- **WHEN** a conversa usa um idioma que o modelo não cobre
- **THEN** o app fecha a fala em 800 ms de silêncio e o medidor registra "idioma fora da lista"

#### Scenario: Falha na inferência

- **WHEN** a inferência do modelo dá erro
- **THEN** a fala fecha como "completa" e a conversa segue

### Requirement: Piso de silêncio que acompanha a pessoa

O silêncio mínimo SHALL acompanhar as pausas da própria pessoa por média móvel, sempre entre 250 ms e 600 ms, e MUST
reiniciar a cada sessão.

#### Scenario: Quem fala devagar

- **WHEN** as pausas dentro das falas de uma pessoa têm em média 500 ms
- **THEN** o piso sobe, sem passar de 600 ms

#### Scenario: Nova sessão

- **WHEN** a pessoa abre uma nova conversa
- **THEN** o piso volta ao valor inicial de 300 ms

### Requirement: Portão de qualidade antes de virar padrão

O fim de fala inteligente MUST permanecer desligado por padrão até a bancada mostrar, com intervalo de confiança de 95%
pareado, que o erro de palavras não é pior, os fragmentos por fala não são mais, o custo de nuvem é no máximo 1,08× o
de 800 ms e o p50 até a voz é pelo menos 400 ms menor.

#### Scenario: Bancada reprova

- **WHEN** a bancada mostra erro de palavras pior
- **THEN** a chave continua desligada por padrão e o resultado é registrado no relatório da bancada
