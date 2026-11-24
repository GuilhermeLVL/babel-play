# modo-anonimo Specification

## Purpose

Descreve o modo sem conta como ele e HOJE: um servidor efemero em memoria/IndexedDB que responde as chamadas de API no proprio navegador, um teto de uso, uma migracao idempotente para a conta e um 501 declarado para o que exige conta. Escrita a partir do codigo em 2026-09-07 (auditoria, secoes 2.1 e 2.2); cada requirement cita o `arquivo:linha` que o implementa. A paridade de rotas e a chave de dedup sao objeto de `modo-anonimo-em-paridade`.

## Requirements

### Requirement: Sem conta, a API e servida no navegador

Quando a identidade e `anonimo` (`src/lib/identidade.ts:25`), `apiFetch` (`src/data/api.ts:26`) SHALL entregar a chamada a `servidorEfemero` (`src/data/efemero/servidor.ts:661`), que casa metodo e caminho contra a tabela `ROTAS` (`servidor.ts:631`) e responde com o mesmo formato JSON do Express. Nada sai para a rede.

#### Scenario: Gravar uma sessao sem conta

- **WHEN** o cliente faz `POST /api/sessions`
- **THEN** a sessao e gravada no IndexedDB e `GET /api/sessions` a devolve

### Requirement: O que exige conta responde 501 e dispara o convite

Rota fora de `ROTAS` SHALL responder 501 com `codigo: EXIGE_CONTA` (`servidor.ts:25,63`) e disparar o evento `babel_exige_conta` (`servidor.ts:26,61`), que a casca transforma em convite para criar conta.

#### Scenario: Importar do YouTube sem conta

- **WHEN** o cliente chama `/api/import/youtube`
- **THEN** a resposta e 501 `EXIGE_CONTA` e o convite explica o motivo (`motivoDoGate`, `src/components/conta/exigeConta.ts:76`)

#### Scenario: Lacuna conhecida — rotas nao espelhadas que o cliente chama

- **WHEN** o cliente anonimo chama `/api/metrics/xp` ou `/api/vocab/para-jogo`
- **THEN** recebe 501 e o cliente cai em fallback (composicao local) ou mostra vazio (achado A25)

### Requirement: O modo anonimo tem teto

`TETO_ANONIMO` (`src/core/tetoAnonimo.ts:22`) SHALL limitar sessoes e palavras no modo sem conta; o servidor efemero recusa acima do teto e a casca avisa antes. Com `acesso_restrito_sem_conta` ligada, o teto continua sendo o caminho de quem se declara menor; para adultos, a porta de entrada vem antes de o teto ser alcançado.

#### Scenario: Sexta sessao

- **WHEN** ja existem 5 sessoes locais
- **THEN** o `POST /api/sessions` e recusado com aviso, sem perder as existentes

### Requirement: Migrar para a conta e idempotente

`migrarParaConta` (`src/data/migracao.ts:80`) SHALL enviar cada sessao local com `origemLocalId` (`migracao.ts:5,11`), que o servidor usa como chave de idempotencia; repetir a migracao nao duplica. `inventarioLocal` (`migracao.ts:37`) diz antes o que vai subir.

#### Scenario: Migracao interrompida

- **WHEN** a rede cai no meio e a pessoa repete
- **THEN** as sessoes ja enviadas nao sao duplicadas

### Requirement: O agendador e a economia do modo anonimo sao os mesmos do core

O servidor efemero SHALL aplicar o mesmo FSRS (`src/core/learning/scheduler.ts`) e a mesma formula de Seeds (`src/core/learning/xp.ts`) sobre os dados locais.

#### Scenario: Lacuna conhecida — valores vindos do cliente

- **WHEN** o cliente anonimo chama `seeds/creditar` com `amount`
- **THEN** hoje o efemero aceita o valor sem validar (achado A26); `seeds-e-creditos-fonte-unica` fecha isso

### Requirement: O toque em algo que exige conta sempre convida

Sem conta, um toque da pessoa em uma ação que exige conta SHALL abrir o convite (`GateDeConta`) a cada vez, mesmo depois de
ela ter fechado o convite na visita. O aviso automático do servidor em memória MUST continuar aparecendo no máximo uma vez
por visita. Nenhuma ação que exige conta MAY terminar em botão morto ou em erro cru ("conta necessária").

#### Scenario: Segundo toque

- **WHEN** a pessoa sem conta fecha o convite e toca de novo em "Trazer um baralho do Anki"
- **THEN** o convite abre de novo com o motivo

#### Scenario: Aviso automático

- **WHEN** o servidor em memória responde 501 a uma ação depois de o convite ter sido fechado
- **THEN** o convite não reabre sozinho

### Requirement: Todo convite tem "Criar conta" e "Já tenho conta"

Todo convite SHALL oferecer "Criar conta", que abre a porta já no cadastro, e "Já tenho conta", que abre na entrada. Depois de
entrar, a pessoa MUST voltar à tela de onde pediu.

#### Scenario: Do perfil ao cadastro e de volta

- **WHEN** a pessoa sem conta abre /perfil, toca "Criar conta", troca para "Entrar" e entra
- **THEN** a porta abre em "Criar conta" e, depois de entrar, a tela é /perfil

### Requirement: Ajustes sem conta não mostram a conta que não existe

Sem conta no modo público, Ajustes → Conta MUST NOT mostrar e-mail, senha, 2FA, aparelhos, "Sair" nem "Excluir a conta";
SHALL mostrar o convite e "Apagar sessões, palavras e progresso deste navegador" (livros e avatar ficam), com confirmação. "Pedir uma cópia" SHALL ser convite, e o canal
E-mail das notificações e o resumo semanal SHALL ficar desligados com o convite ao lado.

#### Scenario: Aba Conta

- **WHEN** a pessoa sem conta abre Ajustes → Conta
- **THEN** vê o convite e "Apagar sessões, palavras e progresso deste navegador" (livros e avatar ficam), e o Supabase não é consultado

### Requirement: O visitante vê as próprias sessões locais

Sem conta, o Início SHALL listar as sessões gravadas neste navegador, até o teto do modo sem conta, com o aviso "Elas ficam só
neste navegador. Com uma conta, vão com você.", e cada uma SHALL abrir em Jogar.

#### Scenario: Sete sessões guardadas

- **WHEN** há mais sessões que o teto de 5
- **THEN** o Início lista 5, com o aviso

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
