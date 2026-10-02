## Why

A auditoria pré-deploy de 2026-09-13 (`openspec/audits/2026-09-13-pre-deploy/`) **provou por PoC**
(`evidencias/poc-ssrf.txt`) que o guard anti-SSRF do proxy de IA deixa passar 6 de 8 vetores de
destino interno que deveria bloquear. O guard vive em `server/ai/ssrf.ts` e protege duas rotas que
buscam URLs vindas do usuário: o proxy BYOK (`server/ai/proxy.ts`, `baseUrl` do provedor custom) e
o import de artigo web (`server/import/web.ts`).

A raiz do bypass está em `server/ai/ssrf.ts:31`: para um IPv4 mapeado em IPv6
(`http://[::ffff:127.0.0.1]`), o `new URL()` normaliza o host para `::ffff:7f00:1`; `isIP` o
reconhece como IPv6 (kind 6), o ramo `startsWith('::ffff:')` faz `isPrivateIp(low.slice(7))` sobre
`'7f00:1'`, que **não é um IP válido** — então `isPrivateIp` devolve `false` e o destino passa.
O mesmo vale para `::ffff:169.254.169.254` (**endpoint de metadados da nuvem**, `::ffff:a9fe:a9fe`).

Faixas inteiras também não são bloqueadas: `100.64.0.0/10` (CGNAT, usada como metadata por
Alibaba/Oracle), `198.18.0.0/15` (benchmark) e NAT64 `64:ff9b::/96`. Por fim, o `fetch` do proxy
**segue redirects por padrão** (`server/ai/proxy.ts`): um host público pode responder `302` para um
endereço interno depois que o guard já passou, e o proxy transmite a resposta de volta
(redirect-to-internal e DNS rebinding).

**Impacto num alvo de nuvem** (Cloud Run/GCE é um dos candidatos de deploy): um usuário autenticado
cadastra um provedor custom com `baseUrl = http://[::ffff:169.254.169.254]/...` e o servidor busca
as credenciais de instância e as devolve ao atacante. Severidade: crítica (CWE-918).

## What Changes

- `isPrivateIp` passa a **canonicalizar** o endereço antes de decidir: um IPv4 mapeado
  (`::ffff:a.b.c.d` e a forma hexadecimal `::ffff:7f00:1`) é reduzido ao IPv4 subjacente e checado
  como IPv4; o que não canonicaliza para um IP roteável público é **bloqueado por padrão**
  (fail-closed), não liberado.
- A lista de faixas bloqueadas ganha `100.64.0.0/10`, `198.18.0.0/15`, `192.0.0.0/24`,
  `::/128`/`::`-mapeados e NAT64 `64:ff9b::/96`.
- O `fetch` dos dois caminhos que usam o guard passa a **não seguir redirects** (`redirect: 'manual'`)
  e a revalidar `assertPublicUrl` a cada hop; ou, alternativamente, resolve o host uma vez e conecta
  ao **mesmo IP** validado (pin), fechando o DNS rebinding.
- O PoC da auditoria vira teste de regressão: `tests/seguranca/ssrf-vetores.test.ts` com os 8 vetores;
  os 6 que hoje passam DEVEM bloquear, os 2 públicos DEVEM continuar permitidos.

## Non-Goals

- Não muda o contrato das rotas nem o formato de erro (`DestinoBloqueado` já existe e é reconhecível).
- Não mexe na IA local do usuário (Ollama/LM Studio), que é chamada pelo cliente, não por este proxy.
- Não implementa allowlist de destinos (continua sendo denylist de internos + esquema http/https).
