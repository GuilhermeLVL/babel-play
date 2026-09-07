# linha-de-base-verde Specification

## Purpose
TBD - created by archiving change linha-de-base-verde. Update Purpose after archive.
## Requirements
### Requirement: O CI e o deploy compartilham a mesma definicao de verde
Os workflows de CI e de deploy SHALL executar o mesmo conjunto de gates (typecheck, typecheck:core, lint, test, build, pseudo --check, i18n:orfas, audit:gate, test:e2e, ast-grep) e todo workflow SHALL ser YAML valido.

#### Scenario: Deploy nao publica o que o CI recusaria
- **WHEN** um commit falha em qualquer gate do `ci.yml`
- **THEN** `deploy-pages.yml` falha no mesmo gate antes de `build:leve` e nada e publicado

#### Scenario: Workflow invalido nao passa despercebido
- **WHEN** um arquivo em `.github/workflows/` nao parseia como YAML
- **THEN** o CI falha com o nome do arquivo e a linha

### Requirement: A suite reflete a interface atual
Todo teste que interage com a interface SHALL localizar controles por papel acessivel que existe na tela atual.

#### Scenario: Controle removido quebra o teste, nao o silencia
- **WHEN** um controle usado por um teste e removido da tela
- **THEN** o teste falha no CI no mesmo commit, e a correcao muda o teste ou devolve o controle — nunca desliga o teste

### Requirement: Efeitos visuais nao dependem de canvas para os testes passarem
Codigo de efeito visual (confetti, particulas) SHALL ser no-op quando nao ha canvas desenhavel, sem lancar.

#### Scenario: Componente de jogo termina uma rodada no jsdom
- **WHEN** um teste de componente conclui uma rodada em ambiente sem `getContext('2d')`
- **THEN** o efeito nao dispara e nenhuma excecao e lancada

### Requirement: A loja e alcancavel pela navegacao
As rotas `/loja`, `/loja/passe`, `/loja/meu-visual`, `/loja/itens` e `/loja/desafios` SHALL montar a tela correspondente com os controles de compra, carteira e passe visiveis.

#### Scenario: Passe pela URL
- **WHEN** o usuario abre `/loja/passe`
- **THEN** a tela do Passe de Temporada e renderizada, nao o Cofre

### Requirement: Nada no barril do core aponta para arquivo fora do git
`src/core/index.ts` SHALL re-exportar apenas modulos rastreados pelo git no mesmo commit.

#### Scenario: Checkout limpo compila
- **WHEN** o repositorio e clonado do zero no commit
- **THEN** `npm run typecheck:core` passa

