## Purpose

Define quando a Leitura ativa existe para a pessoa (a flag `leitura_ativa`), por onde se chega a ela (rota e
menu) e o que muda no perfil protegido (menor ou idade não declarada).

## ADDED Requirements

### Requirement: A flag leitura_ativa nasce desligada

A flag `leitura_ativa` SHALL existir no banco das duas cadeias de migração (Postgres e SQLite legado) com
`habilitada=false` e `regras='{}'`, inserida com `ON CONFLICT DO NOTHING` e com o comentário de reversão. Uma
migração MUST NOT ligar a flag.

#### Scenario: Banco novo

- **GIVEN** um banco criado do zero pelas migrações
- **WHEN** o servidor lê a flag `leitura_ativa`
- **THEN** ela existe e está desligada

#### Scenario: Banco com a flag já ligada pelo admin

- **GIVEN** um banco onde o admin já ligou `leitura_ativa`
- **WHEN** as migrações rodam de novo
- **THEN** a flag continua ligada (a migração não sobrescreve)

### Requirement: Com a flag desligada a Leitura ativa não aparece

Com `leitura_ativa` desligada, o menu SHALL NOT mostrar o item "Leituras", a URL `/leitura` (ou
`/leitura/<textoId>`) SHALL levar ao início como qualquer caminho desconhecido, e `POST /api/ai/escrita` SHALL
responder 404 `recurso_indisponivel` sem reservar cota nem chamar provedor.

#### Scenario: Pessoa abre /leitura com a flag desligada

- **GIVEN** a flag `leitura_ativa` desligada
- **WHEN** a pessoa abre `/app/leitura/a1-no-mercado`
- **THEN** o app mostra o início e nenhum componente da Leitura ativa é carregado

#### Scenario: Cliente chama a escrita com a flag desligada

- **GIVEN** a flag `leitura_ativa` desligada e uma pessoa do plano Plus
- **WHEN** o cliente envia `POST /api/ai/escrita` com um texto válido
- **THEN** a resposta é 404 `recurso_indisponivel`, o contador `escritasMes` não muda e nenhum `fetch` a
  provedor de IA acontece

### Requirement: Com a flag ligada há uma tela e um endereço próprios

Com `leitura_ativa` ligada, o menu "Mais" SHALL mostrar o item "Leituras", e a tela SHALL responder em
`/leitura` (catálogo) e `/leitura/<textoId>` (um texto), com ida e volta entre o estado do app e a URL. A tela
MUST NOT usar o id `reading`, que é da aba Leitura da Sessão.

#### Scenario: Ida e volta da URL

- **GIVEN** a flag ligada
- **WHEN** o estado do app é "Leitura ativa, texto `a2-o-onibus-errado`"
- **THEN** a URL é `/leitura/a2-o-onibus-errado`, e abrir essa URL restaura o mesmo estado

#### Scenario: Texto que não existe

- **GIVEN** a flag ligada
- **WHEN** a pessoa abre `/leitura/nao-existe`
- **THEN** a tela mostra o catálogo, sem erro

#### Scenario: Tela carregada sob demanda

- **WHEN** o app é construído
- **THEN** o código da Leitura ativa fica num pedaço separado, carregado só ao abrir a tela, e o orçamento do
  pacote inicial continua passando

### Requirement: O perfil protegido não vê oferta nem comparação

Para menor ou idade não declarada, a Leitura ativa SHALL NOT mostrar ranking, "mais lidos", comparação com
outras pessoas, palavras por minuto, link ou banner de plano; o resto da tela funciona igual.

#### Scenario: Menor termina um texto

- **GIVEN** uma pessoa de 13 anos com a flag ligada
- **WHEN** ela chega ao resumo de um texto lido em voz alta
- **THEN** o resumo mostra frases lidas, tempo e palavras para praticar, sem palavras por minuto e sem link de
  planos
