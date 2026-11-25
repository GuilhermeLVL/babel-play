## ADDED Requirements

### Requirement: A pessoa escreve livremente e o rascunho fica só no aparelho

Com a flag `diario` ligada, a tela `/diario` SHALL aceitar uma entrada de 20 a 200 palavras no idioma-alvo da pessoa. O rascunho
e o histórico SHALL ficar apenas no aparelho, e o servidor MUST NOT guardar o texto.

#### Scenario: Texto curto demais

- **WHEN** a pessoa escreveu 12 palavras
- **THEN** o botão de retorno fica desativado com "20 palavras ou mais para pedir retorno"

#### Scenario: Rascunho preservado

- **GIVEN** um rascunho de 30 palavras
- **WHEN** a pessoa sai e volta à tela
- **THEN** o rascunho está lá, e nenhuma requisição levou o texto ao servidor

#### Scenario: Flag desligada

- **WHEN** a flag `diario` está desligada
- **THEN** a rota cai no início, nenhum cartão "Escreva sobre o seu dia" aparece e `POST /api/ai/diario` responde 404 `recurso_indisponivel`

### Requirement: O retorno de IA tem custo declarado, cota do plano e retenção zero

`POST /api/ai/diario` SHALL devolver 1 elogio e de 0 a 3 pontos com `trecho` exato, `tipo`, `dica` em português e `exemplo`, só
nos planos pagos, contando a cota mensal de escritas e os tokens do plano. O servidor MUST usar apenas provedor com retenção
zero, MUST NOT usar Gemini e MUST NOT guardar texto da pessoa nem da IA.

#### Scenario: Retorno válido

- **GIVEN** a IA simulada devolve 1 elogio e 3 pontos cujos trechos existem no texto
- **WHEN** a pessoa pede retorno
- **THEN** a tela marca as 3 frases e a cota do mês diminui em 1

#### Scenario: Trecho que não existe no texto

- **GIVEN** a IA simulada devolve um ponto cujo trecho não aparece na entrada
- **WHEN** o servidor valida a resposta
- **THEN** esse ponto é descartado

#### Scenario: Resposta inválida

- **GIVEN** a IA simulada devolve texto fora do esquema
- **WHEN** a pessoa pede retorno
- **THEN** recebe 502 `resposta_invalida`, vê "Não deu para ler seu texto agora." e a cota é estornada

#### Scenario: Sem perna de retenção zero

- **GIVEN** nenhum provedor com `retencao: 'zdr'` para a função
- **WHEN** a pessoa pede retorno
- **THEN** o servidor responde 501 e não chama provedor

#### Scenario: Plano grátis

- **WHEN** a pessoa do Grátis abre o diário
- **THEN** vê "Conferir sozinho" e nenhuma requisição de IA sai

### Requirement: Dados pessoais e sinais de risco nunca chegam à IA

O app SHALL bloquear o envio de e-mail, telefone, @usuário, endereço web e nome de escola, e o servidor SHALL repetir o filtro
(422 `dado_pessoal`, sem reservar cota). O app SHALL detectar localmente sinais de risco (automutilação, violência, abuso) e, com
sinal, MUST NOT enviar o texto à IA nem registrá-lo.

#### Scenario: Telefone no texto

- **WHEN** a entrada traz "(11) 98765-4321"
- **THEN** o envio é bloqueado e o trecho é sublinhado; um cliente adulterado recebe 422 e a cota não é reservada

#### Scenario: Sinal de risco

- **WHEN** a entrada indica que a pessoa quer se machucar
- **THEN** nada é enviado, a tela mostra a mensagem fixa e acolhedora com o CVV (188), e o log só conta a categoria

### Requirement: Para menores, a IA do diário só chega com o filtro e a decisão do dono

Enquanto o dono não liberar, o perfil protegido (menor de 18 ou idade não declarada, inclusive sem conta) SHALL ter só
"Conferir sozinho", sem menção a plano e sem "Ver planos", e o servidor SHALL recusar o retorno de IA com 403. Quando liberado,
a instrução de segurança para menores SHALL ser aplicada e a saída SHALL passar pelo moderador local.

#### Scenario: Menor na v1

- **GIVEN** uma pessoa de 11 anos
- **WHEN** abre o diário
- **THEN** vê só "Conferir sozinho", e um cliente adulterado que chama `POST /api/ai/diario` recebe 403

#### Scenario: Menor liberado, saída barrada

- **GIVEN** a IA do diário liberada para 12 a 17 anos e uma saída que viola a lista do filtro
- **WHEN** o retorno chega ao servidor
- **THEN** a pessoa vê a frase fixa, e nenhum cartão é oferecido

### Requirement: Cada correção pode virar um cartão da pessoa

Cada ponto do retorno SHALL poder virar um cartão com um toque: a frente com o trecho em lacuna, o verso com o exemplo corrigido
e a dica, origem `diario`, etiqueta "do diário". O cartão SHALL passar pela régua de qualidade e pela deduplicação do `bulk-add`,
e MUST NOT exigir nova chamada de IA.

#### Scenario: Guardar um ponto

- **WHEN** a pessoa toca em "Guardar como cartão" num ponto
- **THEN** o cartão existe com a etiqueta "do diário", a lacuna não revela o exemplo inteiro, e nenhuma chamada de IA foi feita

#### Scenario: Cartão repetido

- **WHEN** a pessoa guarda duas vezes a mesma correção
- **THEN** o segundo é recusado com o motivo legível, sem erro

#### Scenario: Isto estava certo

- **WHEN** a pessoa toca em "Isto estava certo" num ponto
- **THEN** o ponto some, nenhum cartão é criado e o contador local de falso positivo sobe

### Requirement: Apagar o diário apaga tudo

"Apagar o diário", a troca de conta no aparelho e a exclusão de conta SHALL remover as entradas, os retornos e os rascunhos
locais. Os cartões já criados SHALL permanecer, pois são da pessoa.

#### Scenario: Apagar o diário

- **WHEN** a pessoa toca em "Apagar o diário" e confirma
- **THEN** o histórico local fica vazio e os cartões do diário continuam na revisão
