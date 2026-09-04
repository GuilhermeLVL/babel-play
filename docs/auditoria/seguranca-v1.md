# Auditoria de segurança e integridade — v1

Rodada em 2026-08-30 sobre `babel-play-lab`. Priorizei **usar o aparato que o projeto já tem** —
ele é bom — em vez de duplicar com ferramenta genérica.

| Verificação | Ferramenta | Resultado |
|---|---|---|
| Segredos no histórico | gitleaks (82 commits, 6,6 MB) | **limpo** (1 falso positivo) |
| CVEs de dependência | Trivy + `npm run audit:gate` | 2 HIGH, ambas triadas |
| Invariantes de arquitetura | `ast-grep` (regras do projeto) | **2 erros**, 2 avisos |
| Integridade cliente↔servidor | inspeção de rede no navegador | **2 rotas mortas** |

Semgrep não rodou: exige Docker, e o Docker Desktop estava parado. O CI já roda **CodeQL** e
**gitleaks** (`.github/workflows/seguranca.yml`), então a cobertura de SAST genérico existe.

---

## 1. Segredos — limpo

Único achado: `const SECRET = 'segredo-e2e-hs256-marco1'` em
`tests/integration/mt1-isolation-e2e.test.ts`, no commit `511224d`. É **literal de teste**, não
credencial, e o arquivo atual já usa par de chaves gerado em memória (`generateKeyPair('ES256')`).
Falso positivo.

## 2. Dependências — triagem correta, justificativa desatualizada

Duas HIGH, ambas no cluster `@huggingface/transformers`:

| pacote | versão | correção | via |
|---|---|---|---|
| `adm-zip` | 0.5.18 | **0.6.0** | `onnxruntime-node` → `@huggingface/transformers` |
| `sharp` | 0.34.5 | **0.35.0** | `@huggingface/transformers` |

**A triagem se sustenta e é verificável:** o `Dockerfile:69` remove `node_modules/onnxruntime-node`
da imagem de runtime, e a inferência roda no navegador (`onnxruntime-web`), não no servidor. Os
pacotes vulneráveis não estão no caminho de execução de produção.

**O que envelheceu:** o cabeçalho de `scripts/audit-gate.mjs` diz que a allowlist é de
*"HIGH sem fix upstream"*. **Já existe fix upstream para as duas.** A premissa deixou de valer,
mesmo que a conclusão (risco baixo) continue.

**Ação:** atualizar a justificativa da allowlist, e no próximo bump do `@huggingface/transformers`
verificar se as versões corrigidas entram sozinhas. Forçar `overrides` num módulo nativo como o
`sharp` tem risco maior que o CVE, dado que ele não está no servidor.

## 3. Invariantes de arquitetura — 2 erros que quebrariam o CI

O CI roda `ast-grep scan` **sem tolerância a erro** (`ci.yml:32`). O scan atual falha:

```
error[fetch-fora-do-funil]  src/lib/ranking.ts:56
error[fetch-fora-do-funil]  src/lib/ranking.ts:69
```

`fetch('/api/rank/…')` cru, fora de `src/data/api.ts`. A regra guarda uma invariante real: o funil
`apiFetch` injeta o Bearer, trata 401 com refresh, e — o que a regra protege — **impede sair para a
rede no modo sem conta**, onde o servidor em memória deveria responder.

**Por que ainda não quebrou:** a branch tem **33 commits não publicados**. O CI nunca viu este
código. Ele falha no primeiro push.

**Decisão necessária:** ou o ranking passa pelo `apiFetch`, ou ganha uma supressão com motivo
escrito. O ranking global é intencionalmente sem conta (D1 no Cloudflare), então a exceção é
defensável — mas precisa estar escrita, não implícita.

Avisos (não bloqueiam, e ambos com justificativa plausível): `res.send()` dinâmico em
`server/routes/import.ts:65` (entrega de `.apkg`, binário) e Drizzle direto em
`server/routes/health.ts:26` (sonda de saúde).

## 4. Rotas mortas — o cliente chama, o servidor não tem

Encontradas inspecionando a rede do navegador com a aplicação rodando.

| chamada | Express | Pages Functions | servidor efêmero (sem conta) |
|---|---|---|---|
| `POST /api/metrics/presenca` | **404** | — | existe |
| `POST /api/metrics/seeds/creditar` | **404** | — | existe |
| `GET /api/rank/:jogo` | **não existe** | existe | — |

**Consequência 1 — conquistas nunca desbloqueiam na conta logada.** `src/lib/conquistas.ts:6`
recusa marcar a conquista se o crédito falhar ("nunca conquistada sem as Seeds"), o que é correto.
Mas a falha não é de rede: a rota não existe. A tentativa se repete a cada avaliação — foram **3
chamadas num único carregamento de página**. Inversão notável: o modo **sem conta funciona** e o
modo **com conta não**.

**Consequência 2 — o ranking global não existe fora do Cloudflare.** `/api/rank/` só é servido por
`functions/api/rank/[[path]].ts`. Em self-host ou Docker, `lerRanking` captura a falha e devolve
`null`: a tela some sem erro. Degrada em silêncio, que é o padrão de defeito que esta sessão vem
perseguindo.

---

## O que NÃO foi verificado

- **Semgrep** (Docker parado). O CodeQL do CI cobre parte disso.
- **Teste de carga.** Ninguém sabe como a aplicação responde com N usuários simultâneos — e o
  `expensiveLimiter` e o rate-limit por tenant nunca foram exercitados sob concorrência real.
- **Restauração de backup.** Não existe rotina de backup; portanto não existe o que testar.
- **Fluxo de pagamento.** Não existe.
- A superfície de autenticação **não foi reauditada**: as auditorias anteriores (F15-01, P0-1, S-01)
  estão registradas no código com correções aplicadas, e refazê-las seria a duplicação que este
  trabalho vem evitando.


---

## Adendo (31/08, tarde) — Semgrep rodado: a lacuna fechou

O Docker voltou e o Semgrep rodou via container (`p/security-audit` + `p/secrets` +
`p/typescript`): **212 regras, 514 arquivos, 2 achados — ambos falsos positivos** contra código
já endurecido:

1. `sessions.ts:102` `res.send(capa.bytes)` (regra de XSS por escrita direta): é exatamente o
   vetor do SVG que uma auditoria anterior encontrou E fechou — `lerCapaEmbutida` só aceita a
   lista FECHADA de subtipos (`png/jpeg/jpg/gif/webp/avif`, `capaDeSessao.ts`), então `svg+xml`
   nunca vira Content-Type. A regra genérica não enxerga a allowlist.
2. `scripts/eval-fala/baixar-corpus.py:60` `urlopen` (auditoria de rede): URL CONSTANTE do
   HuggingFace num script offline de medição — não há entrada de usuário.

Com isso, a varredura planejada está completa: gitleaks ✅, Trivy ✅, ast-grep ✅, audit:gate ✅,
Semgrep ✅.
