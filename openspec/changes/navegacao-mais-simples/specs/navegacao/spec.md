## ADDED Requirements

### Requirement: O Início é o menu

Com a flag `navegacao_simples` ligada, o app MUST NOT mostrar trilho lateral, painel "Mais" nem barra de baixo, no computador
e no celular. O Início SHALL ser a grade de destinos: Ao vivo (em destaque), Cartões (com o número de hoje), Jogar, Livros (com
o progresso do livro atual, quando houver), Biblioteca e Progresso, mais "Seja Premium" só para quem está no Grátis, sem conta
ou no teste. Os rótulos SHALL seguir o perfil (`navItems.ts`).

#### Scenario: Computador e celular

- **GIVEN** a flag ligada
- **WHEN** a pessoa abre o app em 1280x800 ou em 375x812
- **THEN** não há trilho, "Mais" nem barra de baixo, e o Início mostra a grade de destinos

#### Scenario: Quem assina

- **WHEN** a pessoa tem um plano pago (fora do teste)
- **THEN** o Início não mostra "Seja Premium", e o menu da conta mostra "Seu plano"

#### Scenario: Flag desligada

- **WHEN** a flag está desligada
- **THEN** a navegação é a de hoje, sem nenhuma mudança

### Requirement: Toda outra tela tem o cabeçalho fino

Fora do Início, o app SHALL mostrar um cabeçalho com "‹ Início", o nome da tela, a busca (Ctrl/⌘+K abre a busca global de
sempre), o sino e o avatar. O sino SHALL abrir direto a lista de avisos, com o número de não lidos preso a ele; o avatar SHALL
abrir o menu da conta (Progresso, Personalizar, Ajustes, Seu perfil, Ajuda e suporte, Sobre, Planos, Administração para admin,
interruptores `role="switch"` de tema, som e modo desempenho, estado da conta e Sair). Esc SHALL fechar o painel e devolver o
foco ao botão que o abriu, e Ctrl+, SHALL continuar abrindo Ajustes.

#### Scenario: Voltar ao Início

- **WHEN** a pessoa está em Cartões e toca "‹ Início"
- **THEN** volta à grade de destinos

#### Scenario: Esc devolve o foco

- **WHEN** a pessoa abre o menu da conta e aperta Esc
- **THEN** o menu fecha e o foco volta ao avatar

### Requirement: Ao vivo abre direto no último modo

O bloco "Ao vivo" MUST NOT abrir diálogo de escolha: SHALL abrir a captura no último modo usado (Legendar ou Conversar), e o
seletor "Legendar | Conversar" SHALL ficar dentro da tela do Ao vivo.

#### Scenario: Ao vivo lembra a última escolha

- **GIVEN** a pessoa usou Conversar da última vez
- **WHEN** toca em "Ao vivo" no Início
- **THEN** a tela abre já em Conversar, em 1 toque

### Requirement: As tarefas principais cabem em poucos toques

Com a flag ligada, as 7 tarefas medidas SHALL caber nos toques da proposta: T1 e T2 em até 2, T3 e T4 em até 2, T5 em até 2, T6 e
T7 em até 3, medidos por Playwright nos três formatos e nos perfis pro, kids e senior.

#### Scenario: Rever os cartões

- **WHEN** a pessoa, no Início, quer rever os cartões do dia
- **THEN** chega à revisão em no máximo 2 toques

#### Scenario: Trocar o idioma de legenda no celular

- **WHEN** a pessoa, no celular, quer trocar o idioma da legenda
- **THEN** chega ao seletor em no máximo 3 toques

### Requirement: Nenhum destino ou endereço se perde

Todo `ViewType` SHALL continuar alcançável em até 3 toques a partir do Início, e todo endereço existente SHALL abrir a mesma
tela de antes.

#### Scenario: Endereço antigo

- **WHEN** a pessoa abre `/estatisticas`, `/loja`, `/planos`, `/ajustes/privacidade` ou `/interprete`
- **THEN** a tela correspondente abre, como antes da mudança

#### Scenario: Planos continua achável

- **WHEN** a pessoa procura Planos
- **THEN** encontra pelo bloco "Seja Premium" do Início (quem não assina), pelo menu da conta, pelo atalho em Ajustes e
  pela busca
