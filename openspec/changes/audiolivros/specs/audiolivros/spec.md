## ADDED Requirements

### Requirement: Flags desligadas por padrão

O sistema SHALL ter as flags `audiolivros`, `audiolivros_nuvem` e `audiolivros_elenco`, semeadas DESLIGADAS e sem regra de plano.

#### Scenario: Semente

- **WHEN** a migração roda num banco novo ou existente
- **THEN** as três flags existem com `habilitada = false` e `regras = '{}'`, e rodar de novo não desliga o que o operador ligou

#### Scenario: Desligada, nada muda

- **WHEN** `audiolivros` está desligada
- **THEN** nenhuma tela, rota, requisição ao CDN de áudio ou chunk novo é carregado

### Requirement: Audiolivro do catálogo pré-gerado

O sistema SHALL tocar áudio gravado, com tempo por frase, para livros do catálogo de domínio público que tenham manifesto válido.

#### Scenario: Destaque sincronizado

- **WHEN** a pessoa toca "Ouvir" num capítulo com áudio
- **THEN** a frase `i` fica destacada em até 300 ms do seu `t0` e a página segue a frase

#### Scenario: Texto mudou

- **WHEN** o hash do texto do capítulo difere do `hashDoTexto` do manifesto
- **THEN** o áudio não toca e o narrador local lê o capítulo

#### Scenario: Retomar

- **WHEN** a pessoa volta ao livro
- **THEN** a leitura retoma da última frase guardada no aparelho

#### Scenario: Sem direito de ver o livro

- **WHEN** o perfil não pode ver o livro pela classificação etária
- **THEN** o áudio não é oferecido nem servido pela lista do catálogo

#### Scenario: Rótulo de voz sintetizada

- **WHEN** qualquer player de narração está visível
- **THEN** o chip "Voz sintetizada" está visível, não dispensável e lido pelo leitor de tela

### Requirement: Livro do usuário no aparelho

O sistema SHALL narrar o livro trazido pela pessoa no aparelho por padrão, sem enviar o texto a terceiros e sem exportar áudio.

#### Scenario: Rede vazia

- **WHEN** a pessoa ouve um livro trazido sem consentimento de nuvem
- **THEN** nenhuma requisição leva o texto do livro

#### Scenario: Nuvem com consentimento e cota

- **WHEN** a pessoa tem plano com `vozNatural`, aceitou a nuvem para aquele livro e há cota
- **THEN** a frase é lida pela voz natural e desconta `vozCaracteresMes` e `vozCaracteresDia`

#### Scenario: Recusa da nuvem

- **WHEN** a nuvem responde 402, 429 ou 503
- **THEN** a mesma frase é lida com a voz do aparelho, sem silêncio

#### Scenario: Perfil protegido

- **WHEN** o perfil é de menor ou de idade não declarada
- **THEN** a opção de nuvem para livro próprio não aparece

### Requirement: Elenco por personagem

O sistema SHALL usar marcação de "quem fala" gerada offline para livros do catálogo, com queda para a heurística local.

#### Scenario: Confiança baixa

- **WHEN** a marcação tem confiança menor que 0,5 ou personagem fora da lista
- **THEN** a frase é lida pelo narrador

#### Scenario: Sem flag

- **WHEN** `audiolivros_elenco` está desligada
- **THEN** o áudio usa só o narrador

### Requirement: Qualidade medida antes de publicar

O sistema SHALL publicar um capítulo só se passar nos limiares da bancada e houver aprovação humana da amostra.

#### Scenario: Frase sem áudio

- **WHEN** o lote termina um capítulo com frase sem áudio, truncada ou repetida
- **THEN** o script regera a frase até 2 vezes e, se persistir, não publica o capítulo

#### Scenario: Decisão final

- **WHEN** o motor passa nos limiares automáticos
- **THEN** ele só é adotado depois que o dono ouve e aprova

### Requirement: Custo com teto

O sistema SHALL manter o custo da voz de nuvem dentro das cotas de `src/core/planos.ts` e do orçamento global de IA.

#### Scenario: Teto por pessoa

- **WHEN** uma pessoa usa a voz natural no limite do plano
- **THEN** o custo mensal não passa de US$ 0,60 no Premium e a margem no pior caso segue maior ou igual a zero
