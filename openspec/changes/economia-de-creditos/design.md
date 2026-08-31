## Context

O alicerce já existe em forma: `seed_spends`/`seed_credits` são eventos idempotentes por
(user, id) — a moeda comprada usa o MESMO desenho com tabelas próprias (`credit_purchases`,
`credit_spends`), mais o inventário server-side que hoje não existe. O webhook Asaas atual
(marcarSeNovo/desmarcar) é o template do fluxo de confirmação.
