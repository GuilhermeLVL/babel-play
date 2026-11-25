## ADDED Requirements

### Requirement: O primeiro nível da navegação tem teto

Com a flag `navegacao_simples` ligada, a navegação principal SHALL ter no máximo 5 destinos de primeiro nível (Início, Ao vivo,
Praticar, Biblioteca, Você), iguais no computador, no tablet e no celular, mais a Buscar como utilitário no computador. Um teste
SHALL falhar quando um item novo estourar o teto.

#### Scenario: Computador

- **GIVEN** a flag ligada
- **WHEN** a pessoa abre o app numa janela de 1280x800
- **THEN** a navegação mostra 5 destinos e a Buscar, e nenhum outro botão de destino

#### Scenario: Celular

- **WHEN** abre o app em 390x844
- **THEN** a barra mostra os mesmos 5 destinos

#### Scenario: Item novo

- **WHEN** alguém acrescenta um sexto destino de primeiro nível em `navItems.ts`
- **THEN** o teste do orçamento de navegação falha

#### Scenario: Flag desligada

- **WHEN** a flag está desligada
- **THEN** a navegação é a de hoje, sem nenhuma mudança

### Requirement: Todo item de primeiro nível mostra o rótulo

Os itens de primeiro nível SHALL mostrar o texto do rótulo em qualquer altura de janela a partir de 600 px, e o nome acessível
SHALL ser igual ao rótulo visível. Quando o espaço faltar, a navegação SHALL rolar em vez de esconder o texto.

#### Scenario: Janela baixa

- **WHEN** a janela tem 1280x600
- **THEN** os 5 destinos mostram ícone e texto

#### Scenario: Perfil sênior

- **WHEN** o perfil é `senior`
- **THEN** os rótulos usam o texto longo do perfil ("Página Inicial", "Gravar e conversar") e continuam visíveis

### Requirement: Nenhum diálogo se interpõe entre a tela e um destino principal

O app MUST NOT abrir painel ou diálogo para escolher entre destinos principais. "Mais" SHALL ser a página "Você", e "Ao vivo"
SHALL abrir direto a captura, com o seletor "Legendar | Conversar" dentro dela.

#### Scenario: Ao vivo lembra a última escolha

- **GIVEN** a pessoa usou Conversar da última vez
- **WHEN** toca em "Ao vivo"
- **THEN** a tela abre já em Conversar, sem diálogo de escolha, e T1 ou T2 se completam em no máximo 2 toques

#### Scenario: Você é uma página

- **WHEN** a pessoa toca em "Você"
- **THEN** abre uma página com Progresso, Personalizar, Planos, Ajustes, Perfil, Ajuda, Sobre e Avisos, e o botão Voltar
  funciona como em qualquer tela

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
- **THEN** encontra pela página "Você", pela faixa do Início, pelo atalho em Ajustes e pela busca

### Requirement: Ajustes têm poucos itens visíveis de cada vez

Os Ajustes SHALL ter no máximo 5 abas, um bloco "Mais usados" no alto, grupos recolhidos por padrão e uma busca de ajuste, e
nenhuma aba SHALL mostrar mais de 8 itens antes de "Mostrar mais".

#### Scenario: Busca de ajuste

- **WHEN** a pessoa digita "voz" na busca dos Ajustes
- **THEN** vê só os ajustes cujo nome ou descrição tem "voz", cada um com a aba de origem

#### Scenario: Endereço de aba antiga

- **WHEN** a pessoa abre `/ajustes/processamento`
- **THEN** o ajuste correspondente abre na seção nova, sem 404

### Requirement: A navegação tem orçamento e regra de entrada

Um item novo de primeiro nível SHALL entrar somente tirando outro, e cada destino SHALL ter no máximo 5 abas de segundo nível.

#### Scenario: Aba a mais

- **WHEN** um destino passa a ter 6 abas
- **THEN** o teste do orçamento falha e aponta o destino
