# Versionamento, compatibilidade e migrations

Política da auditoria de prontidão (Fase 6, 25/09/2026). Três regras, cada uma com o portão que a cobra.

## 1. Semver do app

A versão é uma só para o app inteiro (cliente + servidor + API): o campo `version` do `package.json`.
O que roda em produção aparece como `0.2.0+35bc2d6` (versão + sha do commit, `server/lib/versao.ts`)
no cabeçalho `x-babel-versao` de toda resposta `/api`, no campo `versao` de `/api/health` e na tela Sobre.

| sobe      | quando                                                                                                                                                                                                                              | exemplos                                                         |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| **major** | quebra que o usuário ou um cliente externo percebe e não tem como contornar: rota `/api` removida **fora** do prazo de depreciação, campo de resposta com significado trocado, dado local (IndexedDB) que a versão nova não lê mais | trocar o formato de exportação; remover o modo sem conta         |
| **minor** | funcionalidade nova ou mudança visível **compatível**: rota nova, campo novo, tela nova, migration expand, rota que **entra** em depreciação, rota depreciada que **sai** depois do prazo                                           | novo jogo; `GET /api/me/uso` ganha `iaDeNuvem`; índice novo      |
| **patch** | correção sem mudança de contrato: bug, segurança, desempenho, texto, dependência                                                                                                                                                    | GAP-011 (webhook confere no Asaas); 404 JSON em rota inexistente |

Enquanto a versão for `0.x`, vale a mesma tabela (não usamos a licença do semver de "0.x pode quebrar
em minor"): quem está do outro lado é gente com aba aberta, e ela não lê changelog.

### Como lançar

```bash
# 1. o CHANGELOG já tem, em [Unreleased], o que muda (é obrigatório: vazio, a release é recusada)
npm run release -- minor          # ou patch / major; --data=AAAA-MM-DD para fixar a data
# 2. o script sobe package.json + package-lock.json, data o CHANGELOG e IMPRIME os comandos:
git diff -- package.json package-lock.json CHANGELOG.md
git add package.json package-lock.json CHANGELOG.md
git commit -m "chore(release): v0.2.0"
git tag -a v0.2.0 -m "v0.2.0"
git push origin HEAD --follow-tags
# 3. deploy desse commit em staging e depois produção: docs/deploy-checklist.md
```

O script (`scripts/release.mjs`) não roda git e não cria tag: publicar é decisão de quem revisou o diff.
Tag é `vX.Y.Z`, anotada, no commit do `chore(release)`. Imagens continuam etiquetadas pelo **sha** (o
`deploy.yml` não depende da tag); a tag é o nome humano do sha.

## 2. Compatibilidade da API

Há sempre duas versões conversando: a aba aberta desde ontem roda o bundle velho contra o servidor novo
(até clicar em "Atualizar" no aviso de versão nova, que vem do `x-babel-versao`), e um rollback põe o
servidor velho sob o bundle novo. Por isso:

1. **A API muda de forma aditiva.** Rota nova, campo novo na resposta, parâmetro novo **opcional**: livres.
2. **Nada é removido ou renomeado de uma vez.** Rota ou campo que vai sair:
   - o cliente para de usar na versão N (e a rota entra em `tests/contratos/api-depreciacoes.json` com
     `depreciadaEm: N` e o motivo);
   - o servidor continua servindo nas versões N+1 minor;
   - a remoção só acontece a partir de **N + 2 minor** (ou numa major). Ex.: depreciada em 0.4.1, pode
     sumir a partir de 0.6.0.
3. **Mudar o significado de um campo** é remover o velho e criar um novo (regra 2), nunca reaproveitar.
4. Erro novo em rota existente é compatível se usa o formato de sempre (`{ error, code }`) e um status
   que o cliente já trata.

**Portão:** `tests/contratos/api-contrato.json` é o censo das rotas `/api` (o mesmo de
`scripts/testes/rotas-sem-consumidor.mjs`, via `scripts/testes/_rotas-do-servidor.mjs`). No CI,
`node scripts/testes/contrato-api.mjs` e `tests/contratos/compatibilidade-api.test.ts` reprovam:

- rota do contrato que sumiu **sem** depreciação, ou antes das duas minor;
- rota nova que não foi registrada — ela é permitida, só precisa entrar no contrato:
  `node scripts/testes/contrato-api.mjs --atualizar` (o diff do JSON mostra a mudança no PR).

Campos de resposta não estão no censo (não há esquema de resposta declarado por rota); a regra 2 vale
para eles por revisão, e os testes de caracterização (`tests/caracterizacao/`) pegam parte dela.

## 3. Migrations: expand / contract

As migrations rodam **no boot** e só para a frente. Com uma máquina e `--strategy immediate`
(ADR 0006), o rollback de deploy troca a **imagem**; o banco fica como está. Uma imagem anterior sobre
um banco migrado só funciona se a migration tiver apenas **acrescentado**.

- **Expand (padrão):** `CREATE TABLE`, `CREATE INDEX`, `ADD COLUMN` anulável ou com `DEFAULT`. Nada mais.
- **Contract:** `DROP TABLE`, `DROP COLUMN`, `RENAME`, `NOT NULL` sem `DEFAULT` (inclui a recriação de
  tabela que o drizzle-kit gera: `__new_x` + `DROP` + `RENAME`). Três deploys:
  1. expand: coluna nova + código que escreve nas duas;
  2. código para de ler/escrever o que vai sair (a versão anterior a esta já não depende disso);
  3. migration de contrato **sozinha**, com uma linha `-- CONTRATO: <justificativa>`; no mesmo diff só
     podem mudar `server/db/migrations/**` e `server/db/schema.ts`.
- **Toda migration nova tem `-- REVERSAO: <como desfazer>`**, que é o que o runbook executa (§0.3).

**Portões:**

- `node scripts/migracoes/conferir.mjs --base=<ref>` (job `migracoes` do `ci.yml`) aplica as regras acima
  às migrations a partir da 0030 e confere o journal contra os arquivos. Sem base resolvível (push de
  branch nova), cobra só o marcador e avisa.
- `tests/integration/schema-igual-ao-banco.test.ts` aplica todas as migrations num banco vazio e pede ao
  drizzle-kit o diff até o `schema.ts` (tem que ser vazio), e confere que o snapshot da última migration
  não difere do `schema.ts` — senão o próximo `npm run db:generate` gera SQL falso.

Migration escrita **à mão** (o costume da casa: SQL comentado, `IF NOT EXISTS`) não grava snapshot.
Depois de escrevê-la e registrá-la no `_journal.json`, gere o snapshot pelo drizzle-kit:
`npx tsx scripts/migracoes/snapshot-do-schema.ts`. Os snapshots de 0023 e 0025–0029 não existem e não
serão recriados (o `schema.ts` de cada época não existe mais); o `generate` só precisa do último.
