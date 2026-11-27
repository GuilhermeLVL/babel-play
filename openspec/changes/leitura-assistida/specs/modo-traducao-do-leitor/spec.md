## ADDED Requirements

### Requirement: A tradução do trecho aparece flutuando junto dele

Com a flag `leitor_modo_traducao` ligada e o modo tradução ativo, soltar a seleção SHALL mostrar a tradução num balão ancorado ao trecho, sem
cliques extras, e o balão MUST NOT cobrir o trecho selecionado.

#### Scenario: Soltar a seleção

- **WHEN** o modo tradução está ligado e a pessoa seleciona uma frase
- **THEN** após o debounce a tradução aparece no balão, acima ou abaixo do trecho, na mesma coluna, sem sobrepor o texto selecionado

#### Scenario: A seleção muda antes da resposta

- **WHEN** a pessoa muda a seleção enquanto a tradução anterior carrega
- **THEN** o pedido anterior é cancelado e só a tradução da seleção atual aparece

#### Scenario: Modo desligado

- **WHEN** o modo tradução está desligado
- **THEN** a tradução só ocorre ao tocar em "Traduzir", como hoje

### Requirement: A tradução respeita plano, idade e privacidade

A tradução do balão SHALL usar o motor local quando carregado e a nuvem só quando o plano e a idade permitem (`ferramentasDeIa`); o texto do livro MUST NOT ser gravado no servidor.

#### Scenario: Perfil protegido sem nuvem

- **WHEN** a idade restringe a nuvem e não há motor local carregado
- **THEN** o balão mostra o motivo (`idade`) em vez de traduzir

### Requirement: Ações práticas de leitura

O balão e a barra da seleção SHALL oferecer traduzir a frase sob o dedo, traduzir o parágrafo, ler o trecho em voz alta e copiar; atalhos de
teclado SHALL existir (T traduz, V lê, C copia, A ajusta nível) e MUST NOT disparar com o foco num campo de texto.

#### Scenario: Ler em voz alta

- **WHEN** a pessoa toca em "Ler em voz alta" com um trecho selecionado
- **THEN** o trecho é lido pelo TTS atual e a leitura para ao limpar a seleção

#### Scenario: Atalho dentro de um campo de texto

- **WHEN** a pessoa digita "t" numa nota
- **THEN** nenhuma tradução é disparada

### Requirement: Exportar grifos com traduções

A exportação de grifos SHALL poder incluir a tradução de cada trecho que já foi traduzido, sem pedir nova tradução.

#### Scenario: Exportar

- **WHEN** a pessoa exporta os grifos com a opção "incluir traduções"
- **THEN** cada grifo traduzido sai com o texto original e a tradução, e os não traduzidos saem só com o original

### Requirement: Ditado de uma frase grifada

A pessoa SHALL poder ouvir uma frase grifada e escrevê-la de memória para conferir; nada é gravado nem enviado.

#### Scenario: Conferir o ditado

- **WHEN** a pessoa escreve a frase ouvida e confirma
- **THEN** a tela mostra as diferenças com o original e não persiste a escrita
