## ADDED Requirements

### Requirement: Aviso antes de começar

Antes de iniciar a conversa virtual, o app SHALL mostrar que a outra pessoa não é avisada pelo app, que a conversa será
traduzida e transcrita, e que a pessoa deve informá-la. A pessoa MUST confirmar para continuar. O aviso MUST voltar a cada
nova conversa.

#### Scenario: Confirma

- **WHEN** a pessoa inicia uma conversa virtual
- **THEN** o app mostra o aviso e só abre a captura depois da confirmação

### Requirement: Nada gravado por padrão

A conversa virtual MUST NOT gravar áudio e MUST NOT salvar a sessão automaticamente. O salvamento e a exportação MUST ser
ações explícitas da pessoa. O botão de parar a captura MUST estar sempre visível, e a tela MUST mostrar quando "Eles" está
sendo capturado.

#### Scenario: Fechar a conversa

- **WHEN** a pessoa encerra a conversa virtual sem pedir para salvar
- **THEN** nenhum texto nem áudio da conversa fica guardado

#### Scenario: Indicador de captura

- **WHEN** "Eles" está sendo capturado
- **THEN** a tela mostra um indicador de captura ativa e o botão de parar

### Requirement: Só para maiores de 18 anos

O modo SHALL ficar oculto para contas de menores de 18 anos. Sem a idade conhecida, o app MUST pedir a confirmação de que a
pessoa tem 18 anos ou mais.

#### Scenario: Conta de menor

- **WHEN** a conta é de uma pessoa menor de 18 anos
- **THEN** a conversa virtual não aparece no intérprete

### Requirement: Plano e medidor

A conversa virtual SHALL exigir o entitlement `conversaVirtual` (Premium e selfhost), MUST contar nos tetos de
reconhecimento e de voz já existentes, e MUST mostrar o tempo usado. Ao atingir o teto, o app MUST cair para só legenda sem
encerrar a conversa.

#### Scenario: Plano Grátis

- **WHEN** a conta é do plano Grátis
- **THEN** o modo aparece com cadeado e diz de que plano é

#### Scenario: Teto atingido

- **WHEN** o teto de voz da conta acaba no meio da conversa
- **THEN** a conversa continua só com legenda e a tela explica por quê
