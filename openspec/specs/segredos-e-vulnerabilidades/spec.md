# segredos-e-vulnerabilidades Specification

## Purpose

TBD - created by archiving change segredos-e-vulnerabilidades. Update Purpose after archive.

## Requirements

### Requirement: Historico sem segredo e SAST no CI

O repositorio SHALL passar `gitleaks` no historico completo e uma varredura SAST generica a cada
push, alem das regras proprias de arquitetura.

#### Scenario: Segredo novo commitado

- **WHEN** um valor sensivel que nao esta na allowlist nomeada entra no repositorio
- **THEN** o job de seguranca falha

### Requirement: O guard anti-SSRF canonicaliza o endereco antes de decidir

Antes de permitir uma URL, o servidor SHALL reduzir o host a sua forma canonica de IP e bloquear
todo endereco que resolva para um destino nao roteavel na Internet publica. Um IPv4 mapeado em IPv6
(`::ffff:a.b.c.d` ou sua forma hexadecimal) SHALL ser avaliado como o IPv4 subjacente. O que nao
puder ser canonicalizado para um IP publico SHALL ser bloqueado (fail-closed).

#### Scenario: Loopback mapeado em IPv6

- **WHEN** a URL e `http://[::ffff:127.0.0.1]` (host normalizado para `::ffff:7f00:1`)
- **THEN** o guard lanca `DestinoBloqueado` e a requisicao nao e feita

#### Scenario: Metadados da nuvem mapeados em IPv6

- **WHEN** a URL e `http://[::ffff:169.254.169.254]` ou `http://[::ffff:a9fe:a9fe]`
- **THEN** o guard bloqueia

#### Scenario: Faixas internas adicionais

- **WHEN** o destino e `100.64.0.0/10` (CGNAT), `198.18.0.0/15` (benchmark) ou NAT64 `64:ff9b::/96`
- **THEN** o guard bloqueia

#### Scenario: Destino publico legitimo continua permitido

- **WHEN** a URL e um host publico real (ex.: `https://api.openai.com`) ou um IP publico (`https://8.8.8.8`)
- **THEN** o guard permite

### Requirement: O proxy nao segue redirects para destinos nao validados

Os caminhos que buscam URLs do usuario (proxy BYOK e import web) SHALL tratar redirects de forma que
o destino final passe pela mesma validacao do destino inicial — seja nao seguindo redirects
automaticamente, seja revalidando cada hop, seja conectando ao IP ja validado.

#### Scenario: Redirect publico para interno

- **WHEN** um host publico responde `302 Location: http://169.254.169.254/` (ou um IPv6 mapeado interno)
- **THEN** o servidor nao busca o destino interno nem devolve seu corpo ao cliente

#### Scenario: Rebinding de DNS

- **WHEN** o host resolve para um IP publico na validacao e para um IP interno na conexao
- **THEN** a conexao ao IP interno e impedida

### Requirement: Producao falha fechada sem autenticacao

Quando `NODE_ENV` e `production`, o servidor SHALL rodar com a autenticacao exigida: `AUTH_REQUIRED`
ausente SHALL valer como ligada, e `AUTH_REQUIRED=0` SHALL abortar o boot, salvo quando `SELF_HOST=1`
declara uma instalacao pessoal. Um warning de log SHALL NOT ser considerado suficiente.

#### Scenario: Imagem de producao com AUTH_REQUIRED=0

- **WHEN** o servidor sobe com `NODE_ENV=production`, `AUTH_REQUIRED=0` e sem `SELF_HOST=1`
- **THEN** o processo aborta o boot com erro explicito, sem servir requisicoes

#### Scenario: Self-host continua livre

- **WHEN** o servidor sobe fora de producao (self-host/local) com `AUTH_REQUIRED=0`
- **THEN** o modo sem login funciona normalmente

### Requirement: O limiter usa o IP real atras do proxy

Quando o servidor roda atras de um proxy reverso, o rate-limit e o `ip_hash` SHALL chavear pelo IP
real do cliente, configurado por `TRUST_PROXY` de acordo com o alvo de deploy. Em producao,
`TRUST_PROXY` SHALL ser declarada: sem ela o boot aborta.

#### Scenario: Tentativas de auth de um IP nao derrubam todos

- **WHEN** um atacante estoura o limite de falha de autenticacao atras de um proxy
- **THEN** apenas o IP do atacante e limitado, nao todos os clientes que compartilham o IP do proxy

#### Scenario: Ranking registra o IP correto

- **WHEN** um post de ranking chega atras do proxy
- **THEN** o `ip_hash` deriva do IP real do cliente, nao do IP do proxy
