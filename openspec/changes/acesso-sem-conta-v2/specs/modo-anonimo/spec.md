## ADDED Requirements

### Requirement: Com a flag ligada, a primeira sessão sem conta é livre

Com `acesso_restrito_sem_conta` ligada, sem conta e na edição `web`, a pessoa SHALL poder gravar 1 sessão de legenda, tradução
ou intérprete e jogar com as palavras dela, sem porta. Ao salvar, o app SHALL oferecer o cartão "Guarde o que você capturou"
(Criar conta, Já tenho conta, Agora não), que MUST NOT aparecer durante captura ou jogo.

#### Scenario: Primeira gravação

- **WHEN** a pessoa sem conta grava a primeira sessão
- **THEN** a gravação é salva no aparelho e o cartão "Guarde o que você capturou" aparece ao final, dispensável

### Requirement: O segundo uso abre a porta de entrada

Com a flag ligada, sem conta, na edição `web` e já com 1 sessão local, iniciar a 2ª sessão, abrir um livro ou voltar ao app
SHALL abrir a porta de entrada, com a pergunta "Você tem 18 anos ou mais?". O estado SHALL ser decidido por
`estadoDoAcesso` (`src/core/acessoSemConta.ts`): `livre`, `convite` ou `porta`.

#### Scenario: Segunda sessão de quem ainda não respondeu a faixa

- **WHEN** a pessoa sem conta, com 1 sessão local e sem faixa declarada, inicia a 2ª sessão
- **THEN** a porta abre com a pergunta de faixa

#### Scenario: Voltar ao app depois do primeiro uso

- **WHEN** a pessoa sem conta, com 1 sessão local, abre o app de novo
- **THEN** a porta abre

### Requirement: A faixa declarada fica só no aparelho

A resposta à pergunta de faixa SHALL ser guardada em `babel.faixa_sem_conta` (`'adulto' | 'menor'`) no aparelho e MUST NOT ser
enviada ao servidor. Quando o armazenamento falhar, a pergunta SHALL se repetir sem quebrar o app. Ao criar a conta, a
`PerguntaDeIdade` SHALL continuar sendo a fonte da verdade.

#### Scenario: Resposta guardada

- **WHEN** a pessoa responde "tenho 18 anos ou mais"
- **THEN** `babel.faixa_sem_conta` vale `adulto` e nenhuma chamada de rede leva a resposta

### Requirement: Adulto entra com login e volta ao destino

Para quem se declara adulto, a porta SHALL oferecer Login e Criar conta e MUST NOT oferecer "Continuar sem conta". Depois do
login, a pessoa SHALL voltar ao destino guardado (`guardarIntencao`/`consumirIntencao`) e o `ModalDeMigracao` SHALL subir a
sessão local sem duplicar (`origemLocalId`).

#### Scenario: Adulto entra e volta

- **WHEN** o adulto toca em "Gravar", cai na porta, cria a conta e entra
- **THEN** volta à tela de gravar e a sessão local aparece na conta uma única vez

### Requirement: Menor de 18 segue no modo local sem pressão

Para quem se declara menor, o app SHALL manter o modo local como hoje (`TETO_ANONIMO`: 5 sessões e 80 palavras; livros livres)
e MUST NOT bloquear nem exigir cadastro. O convite SHALL ser neutro ("Com um responsável, você pode criar uma conta"),
dispensável, sem urgência nem culpa, e só aparece perto do teto. O perfil protegido continua valendo.

#### Scenario: Menor declarado

- **WHEN** a pessoa responde que é menor de 18
- **THEN** segue no app sem conta, sem porta, e os livros continuam abrindo

### Requirement: Livros: o catálogo é livre e ler pede conta

Com a flag ligada, sem conta e na edição `web`, o catálogo e as fichas dos livros SHALL ficar visíveis e "Ler" SHALL pedir
conta (`comConta('livro', ...)`) a quem não se declarou menor (`podeLer`). Depois do login, o livro SHALL abrir
(`abrirLivroNoLeitor`). A rota direta `/livros/<id>/ler` sem conta SHALL cair na porta com a intenção guardada.

#### Scenario: Adulto toca em Ler

- **WHEN** a pessoa sem conta, que se declarou adulta, toca em "Ler" num livro
- **THEN** a porta abre e, depois do login, o livro abre

### Requirement: A regra só vale no app web e atrás da flag

A porta obrigatória MUST NOT valer na edição estática, no self-host nem para o convidado de nuvem, nem com a flag
`acesso_restrito_sem_conta` desligada (padrão: desligada); desligada, o comportamento SHALL ser o de hoje.

#### Scenario: Flag desligada

- **WHEN** a flag está desligada e a pessoa sem conta grava uma 2ª sessão
- **THEN** não há porta e valem o teto e os convites de hoje

## MODIFIED Requirements

### Requirement: O modo anonimo tem teto

`TETO_ANONIMO` (`src/core/tetoAnonimo.ts:22`) SHALL limitar sessoes e palavras no modo sem conta; o servidor efemero recusa acima do teto e a casca avisa antes. Com `acesso_restrito_sem_conta` ligada, o teto continua sendo o caminho de quem se declara menor; para adultos, a porta de entrada vem antes de o teto ser alcançado.

#### Scenario: Sexta sessao

- **WHEN** ja existem 5 sessoes locais
- **THEN** o `POST /api/sessions` e recusado com aviso, sem perder as existentes
