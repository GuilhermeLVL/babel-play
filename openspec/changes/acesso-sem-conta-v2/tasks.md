## 1. OpenSpec

- [x] 1.1 proposal, design, specs (delta de `modo-anonimo`) e tasks; `openspec validate acesso-sem-conta-v2` passa
- [ ] 1.2 O dono aprova

## 2. Core, faixa local e flag (PR sem nada visível)

- [x] 2.1 `src/core/acessoSemConta.ts`: `estadoDoAcesso` e `podeLer`, com `tests/acessoSemConta.test.ts` (tabela completa)
- [x] 2.2 `src/lib/faixaSemConta.ts` (`babel.faixa_sem_conta`, try/catch, nunca ao servidor) e teste
- [x] 2.3 Flag `acesso_restrito_sem_conta` desligada: PG 0022 e SQLite 0064, `docs/flags.md`, `PainelFlags`, baseline de flags

## 3. Porta obrigatória, migração e volta ao destino

- [x] 3.1 `porta()` devolve `'porta-obrigatoria'`; `PortaDeEntrada` com pergunta de faixa e `Login` sem "Continuar sem conta"
- [x] 3.2 Volta ao destino e `ModalDeMigracao` sem duplicar
- [x] 3.3 Cartão "Guarde o que você capturou" ao fim da 1ª sessão; menor com convite neutro
- [x] 3.4 Testes: `app-gate-anonimo`, `funil-login`, `convites-sem-conta` com a flag ligada; e2e `acesso-sem-conta-v2`

## 4. Livros

- [x] 4.1 Catálogo e fichas livres; "Ler" usa `podeLer` (a leitura sem `podeLer` cai na porta, que pergunta a faixa e guarda a volta; ver design, decisão 7)
- [x] 4.2 `/livros/<id>/ler` sem conta cai na porta com a intenção guardada

## 5. Site e funil

- [ ] 5.1 "Entrar" vai a `/app?entrar=login` e novo "Criar conta" a `/app?entrar=signup`; `App.tsx` lê `entrar` uma vez e limpa a URL
- [ ] 5.2 Eventos `porta_exibida`, `porta_faixa_menor`, `porta_cadastro_iniciado`, `conta_criada_pela_porta`
- [ ] 5.3 Textos em pt-BR via `t()`, `npm run i18n`, revisão `copy-br-etica`

## 6. Staging e liberação

- [ ] 6.1 Staging com a flag ligada só para o id do dono; conferir porta, menor, adulto, migração, volta e livro
- [ ] 6.2 `percentual` 10% → 50% → 100%, olhando o funil
