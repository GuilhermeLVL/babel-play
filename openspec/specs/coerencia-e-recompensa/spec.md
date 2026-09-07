# coerencia-e-recompensa Specification

## Purpose
TBD - created by archiving change auditoria-ux-e-economia-de-recompensas. Update Purpose after archive.
## Requirements
### Requirement: Liberdade classificada
Toda capacidade de edição do app SHALL ser classificada como DIREITO (sempre disponível) ou
RECOMPENSA (condicionada a nível, moeda ou conquista), e a interface SHALL respeitar a
classificação.

#### Scenario: Acessibilidade é direito
- **WHEN** o usuário ajusta tamanho de texto, contraste ou perfil de exibição
- **THEN** nada é cobrado nem trancado, em nenhum nível

#### Scenario: Estética é recompensa
- **WHEN** o usuário aplica um visual puramente estético que a progressão ainda não liberou
- **THEN** o app diz o que falta, e nenhum caminho alternativo entrega o mesmo resultado

### Requirement: Toda recompensa do passe é nomeável e densa
Cada recompensa da trilha grátis SHALL ser algo que o usuário consiga nomear ao recebê-la: um
item de catálogo ou UM Cofre de Seeds por década (bloco único e denso). A trilha grátis MAY ser
esparsa (níveis sem carta própria), porque a auditoria provou que todos os slots de uma década
destravam no mesmo instante (`slotDestravado` compara nível ≥ década) — fatiar a moeda da década
em vários slots é gotejamento ilusório: o usuário recebe as frações todas juntas.

#### Scenario: Moeda em Cofre único por década
- **WHEN** uma década tem vagas sem item de catálogo
- **THEN** a moeda da década inteira aparece como UM Cofre nomeado ("Cofre da década N — X
  Seeds"), nunca fatiada em slots de 10–50

#### Scenario: Resgate honesto
- **WHEN** um Cofre está destravado mas o crédito ainda não foi confirmado pelo servidor
- **THEN** a interface NÃO diz "resgatado" — diz o estado real (disponível/creditando/creditado)

### Requirement: Voltar ao original
O usuário SHALL conseguir restaurar o visual padrão do app em um clique.

#### Scenario: Restauração
- **WHEN** o usuário pede para voltar ao visual original
- **THEN** tema, fonte, partículas, cursor, rastro e paleta voltam aos padrões, e o que ele
  possui continua possuído

