## Context

A porta de entrada foi invertida em 01/09: o primeiro acesso é sem login e a conta é pedida quando há algo a perder
(`porta()` em `src/components/conta/exigeConta.ts`). O servidor efêmero (IndexedDB) já limita sessões e palavras
(`TETO_ANONIMO`) e a migração para a conta é idempotente (`src/data/migracao.ts`, `origemLocalId`). O convite é sempre
dispensável (`modo-anonimo`, "O toque em algo que exige conta sempre convida").

## Goals / Non-Goals

**Goals:** converter mais sem pagar servidor; manter menores sem pressão; reusar o que existe (intenção de login, migração,
convites); poder soltar aos poucos e desfazer desligando a flag.

**Non-Goals:** segurança ou verificação de idade; edição estática e self-host; convidado de nuvem; cobrança.

## Decisions

1. **Regra pura no core.** `src/core/acessoSemConta.ts`: `estadoDoAcesso({ sessoesLocais, faixaDeclarada, flagLigada,
temConta, edicao })` devolve `'livre' | 'convite' | 'porta'`, e `podeLer(...)` diz se um livro abre. O core não importa de
   gateway, components nem lib. Reusa `estadoDoTeto`/`TETO_ANONIMO` para o caminho do menor.
2. **Tabela de estados** (com flag ligada, sem conta, edição `web`):
   - 0 sessões: `livre` (qualquer faixa);
   - 1+ sessões, adulto ou sem resposta: `porta`;
   - 1+ sessões, menor: `livre` até chegar perto do teto (80% de `TETO_ANONIMO.sessoes`), depois `convite` (neutro, dispensável);
   - flag desligada, com conta ou edição `estatica`/`selfhost`: sempre `livre`.
     `podeLer`: só menor lê sem conta; quem ainda não respondeu a faixa não lê (a porta pergunta primeiro).
3. **Faixa só no aparelho.** `src/lib/faixaSemConta.ts` lê e grava `babel.faixa_sem_conta` no `localStorage` com try/catch;
   nunca é enviada. Ao criar a conta, a `PerguntaDeIdade` existente continua sendo a fonte da verdade.
4. **Porta.** `porta()` devolve `'porta-obrigatoria'` quando a flag está ligada, sem conta, faixa diferente de `menor` e já
   houve 1 sessão. `App.tsx` renderiza `PortaDeEntrada` (pergunta de faixa + `Login` sem `onContinuarSemConta`).
5. **Contagem da 1ª sessão.** Reusa as sessões locais do IndexedDB (`src/data/efemero/rotas/sessoes.ts`); nenhum contador novo.
6. **Volta ao destino.** `guardarIntencao`/`consumirIntencao` (`src/lib/intencaoDeLogin.ts`); o `ModalDeMigracao` sobe a sessão local.
7. **Livros.** O catálogo e as fichas são livres. A leitura (`/livros/<id>/ler`, aonde o "Ler" leva por
   `abrirLivroNoLeitor`) sem `podeLer` vira `porta` em `useAcessoSemConta` (`lendoLivro`): a `PortaDeEntrada` pergunta
   a faixa a quem não respondeu, leva o adulto ao Login, guarda a rota da leitura (o livro abre depois de entrar) e
   oferece "Voltar ao livro". Um caminho só para o botão e o link direto; o `comConta`/`GateDeConta` não serve aqui
   porque não pergunta a faixa e o convite oferece "Continuar sem conta".
8. **Flag.** `acesso_restrito_sem_conta`, DESLIGADA, sem regra de plano, solta por `percentual`. Desligada = comportamento de hoje.
9. **Funil sem id.** Eventos novos no alfabeto fechado, respeitando o desligamento de métricas e o perfil de menor.

## Risks / Trade-offs

- A faixa é autodeclarada: um adulto pode se declarar menor e seguir local. Aceito, porque a trava é de conversão.
- Limpar os dados do navegador reinicia a "1ª sessão livre". Aceito (a trava não é segurança).
- Mais atrito para adultos pode reduzir a captura de novos usuários: por isso `percentual` 10% → 50% → 100% olhando o funil.
- Menor sem pressão: convite neutro, sem urgência nem culpa (`copy-br-etica`).

## Migration Plan

Flag semeada desligada nas duas cadeias (PG 0022, SQLite 0064). Staging com a flag ligada só para o id do dono; depois
`percentual`. Reversão: desligar a flag (ou `DELETE FROM flags WHERE chave = 'acesso_restrito_sem_conta'`).

## Decisões para o dono conferir

- "Menor" = menos de 18 (igual ao perfil protegido), autodeclarado e guardado só no aparelho; um adulto pode mentir e seguir
  local, e isso é aceito porque a trava é de conversão, não de segurança.
- O caminho dos menores mantém tudo como hoje, inclusive livros livres.
- A porta também aparece ao voltar ao app depois do 1º uso, não só ao iniciar a 2ª sessão.
- (Do core) Menor só recebe convite perto do teto de sessões; antes disso fica livre, sem convite extra além dos de hoje.
- (Do core) Quem ainda não respondeu a faixa não lê livros: a porta pergunta primeiro.
