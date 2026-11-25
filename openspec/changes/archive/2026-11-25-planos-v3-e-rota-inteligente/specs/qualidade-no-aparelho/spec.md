## ADDED Requirements

### Requirement: Modelo local só entra depois de medido

Um modelo local novo SHALL ser adotado só depois de medido na nossa bancada, no navegador, por idioma e
por tipo de aparelho, com erro e fator de tempo real registrados.

#### Scenario: Parakeet em português

- **WHEN** a medição no navegador mostra erro menor que o do modelo atual e fator de tempo real até 0,5
  no aparelho-alvo
- **THEN** ele passa a ser o modelo local de precisão para aquele idioma e aparelho

#### Scenario: Medição não confirma

- **WHEN** o modelo não carrega, erra mais ou não acompanha
- **THEN** nada muda e o resultado fica registrado

### Requirement: Tabela única de qualidade

O erro medido por modelo, idioma e aparelho SHALL morar numa tabela única, lida pela política de rota e
usada para o texto que a pessoa vê.

#### Scenario: A política consulta a tabela

- **WHEN** a política avalia se o idioma é bem servido localmente
- **THEN** usa a tabela, e não constantes espalhadas

### Requirement: Correção só determinística

Um modelo de linguagem SHALL NOT reescrever a legenda. Depois do reconhecimento, o app MAY corrigir
palavras pelo vocabulário da pessoa e pelos nomes do conteúdo, com limiar conservador.

#### Scenario: Nome próprio do conteúdo

- **WHEN** o reconhecimento devolve uma grafia a uma letra de um nome presente no título da sessão
- **THEN** a grafia do título é usada

#### Scenario: Palavra comum parecida

- **WHEN** a palavra reconhecida é válida no idioma e só parecida com uma do vocabulário
- **THEN** fica como veio

### Requirement: Qualidade medida em uso, sem gabarito

O app SHALL guardar no aparelho o fator de tempo real, o atraso até o texto final e as correções
manuais, e MAY comparar local e nuvem numa amostra de 1 em 20 trechos de quem tem nuvem. Agregados só
SHALL sair do aparelho com o consentimento de métricas.

#### Scenario: Sem consentimento de métricas

- **WHEN** a pessoa não aceitou métricas
- **THEN** nada é enviado
