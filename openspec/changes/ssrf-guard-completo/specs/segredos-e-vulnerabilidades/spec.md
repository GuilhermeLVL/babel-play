## ADDED Requirements

### Requirement: O guard anti-SSRF canonicaliza o endereço antes de decidir
Antes de permitir uma URL, o servidor SHALL reduzir o host à sua forma canônica de IP e bloquear
todo endereço que resolva para um destino não roteável na Internet pública. Um IPv4 mapeado em IPv6
(`::ffff:a.b.c.d` ou sua forma hexadecimal) SHALL ser avaliado como o IPv4 subjacente. O que não
puder ser canonicalizado para um IP público SHALL ser bloqueado (fail-closed).

#### Scenario: Loopback mapeado em IPv6
- **WHEN** a URL é `http://[::ffff:127.0.0.1]` (host normalizado para `::ffff:7f00:1`)
- **THEN** o guard lança `DestinoBloqueado` e a requisição não é feita

#### Scenario: Metadados da nuvem mapeados em IPv6
- **WHEN** a URL é `http://[::ffff:169.254.169.254]` ou `http://[::ffff:a9fe:a9fe]`
- **THEN** o guard bloqueia

#### Scenario: Faixas internas adicionais
- **WHEN** o destino é `100.64.0.0/10` (CGNAT), `198.18.0.0/15` (benchmark) ou NAT64 `64:ff9b::/96`
- **THEN** o guard bloqueia

#### Scenario: Destino público legítimo continua permitido
- **WHEN** a URL é um host público real (ex.: `https://api.openai.com`) ou um IP público (`https://8.8.8.8`)
- **THEN** o guard permite

### Requirement: O proxy não segue redirects para destinos não validados
Os caminhos que buscam URLs do usuário (proxy BYOK e import web) SHALL tratar redirects de forma que
o destino final passe pela mesma validação do destino inicial — seja não seguindo redirects
automaticamente, seja revalidando cada hop, seja conectando ao IP já validado.

#### Scenario: Redirect público para interno
- **WHEN** um host público responde `302 Location: http://169.254.169.254/` (ou um IPv6 mapeado interno)
- **THEN** o servidor não busca o destino interno nem devolve seu corpo ao cliente

#### Scenario: Rebinding de DNS
- **WHEN** o host resolve para um IP público na validação e para um IP interno na conexão
- **THEN** a conexão ao IP interno é impedida
