## ADDED Requirements

### Requirement: A pré-tradução nasce desligada

A flag `pre_traducao_de_legendas` SHALL nascer DESLIGADA e sem regra de plano. Com ela desligada, a importação de legendas SHALL
produzir só o texto das falas, como hoje.

#### Scenario: Flag desligada

- **WHEN** a pessoa importa um .srt e a flag está desligada
- **THEN** a sessão é criada só com o texto e nenhuma tradução em lote é iniciada

### Requirement: A pré-tradução roda só no aparelho

A pré-tradução SHALL usar apenas motor de tradução local (`opus-mt-local`, `bergamot-local`) e SHALL NOT enviar texto da legenda a
nenhum serviço de rede, com ou sem consentimento de nuvem.

#### Scenario: Provedor de nuvem

- **WHEN** o adaptador é criado com um provedor que não é local (por exemplo `server-llm-mt` ou `mymemory`)
- **THEN** a criação falha e nenhuma fala é traduzida

#### Scenario: Resposta de motor não local

- **WHEN** o provedor devolve um resultado cujo `engine` não é um motor local
- **THEN** a resposta é descartada, a fala conta como falha e o texto do resultado não entra na sessão

#### Scenario: Opções de nuvem

- **WHEN** o adaptador chama o tradutor local
- **THEN** a chamada não leva `nuvemPrimeiro` nem `escalarSeRuim`

### Requirement: Lotes que não travam a tela e podem ser cancelados

O núcleo SHALL traduzir em lotes de até 20 falas ou 2 000 caracteres, SHALL ceder a vez ao navegador entre lotes e SHALL conferir o
cancelamento antes de cada fala.

#### Scenario: Lotes

- **WHEN** a legenda tem 45 falas curtas
- **THEN** o núcleo faz 3 lotes (20, 20 e 5) e cede a vez 2 vezes entre eles

#### Scenario: Cancelar no meio

- **WHEN** a pessoa cancela depois de 12 falas traduzidas
- **THEN** o núcleo para antes da 13ª, devolve as 12 traduções, o estado é `cancelada` e o progresso diz 12 de N

### Requirement: Progresso honesto

O progresso SHALL contar só falas realmente resolvidas e SHALL separar traduzidas, repetidas, vazias e falhas. A estimativa de tempo
SHALL ficar ausente até 5 falas traduzidas e SHALL ser marcada como estimativa.

#### Scenario: Falas repetidas

- **WHEN** a legenda tem "Okay." quatro vezes
- **THEN** o motor traduz uma vez, as outras três reaproveitam o resultado e contam como `repetidas`

#### Scenario: Falha numa fala

- **WHEN** o motor lança erro numa fala
- **THEN** a fala fica sem tradução, `falhas` sobe em 1 e o lote segue com a próxima

#### Scenario: Motor quebrado

- **WHEN** 5 falas seguidas falham
- **THEN** o núcleo para com estado `falhou` e devolve o que já foi traduzido

### Requirement: Modelo ainda não carregado

Se o motor local do par ainda não está pronto, o núcleo SHALL parar com estado `aguardando-motor` e SHALL NOT recorrer a nuvem nem
contar falha. O download do modelo SHALL ser pedido só com aviso à pessoa.

#### Scenario: Par baixando

- **WHEN** o motor lança `MotorAindaCarregando` na primeira fala
- **THEN** o estado é `aguardando-motor`, nenhuma fala conta como falha e nada é enviado à rede

### Requirement: Legenda segura aplicada à pré-tradução

A política de legenda segura SHALL ser aplicada ao original e à tradução de cada fala, e o texto traduzido SHALL sair da pré-tradução
já com o marcador no lugar do termo sensível.

#### Scenario: Perfil protegido

- **WHEN** o perfil é protegido e a tradução de uma fala contém um termo da lista
- **THEN** a fala sai com `•••` no lugar do termo e `ocultadas` maior que zero
