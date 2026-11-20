## ADDED Requirements

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
