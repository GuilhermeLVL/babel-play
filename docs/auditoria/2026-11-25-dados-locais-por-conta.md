# Dados locais por conta: auditoria dos armazéns do aparelho (25/11/2026)

## O problema

A revisão de segurança achou o mesmo padrão em três armazéns locais (áudio do cartão, cena do cartão, histórico do
diário): o ouvinte de troca de identidade só era registrado no primeiro uso e os registros não tinham dono. Num aparelho
compartilhado, o que a conta A guardou ficava visível para a conta B (o áudio e a cena já tinham sido corrigidos no PR #211).

## A peça comum

`src/lib/armazemLocalPorConta.ts` (lista de armazéns: `src/lib/guardaDosArmazensLocais.ts`):

1. MARCAR: cada registro (IndexedDB) ou valor (localStorage, `{ dono, valor }`) leva o dono (`donoDaIdentidade`);
2. DESCARTAR NA LEITURA: dado de outro dono, ou de antes da regra (sem dono), não aparece e sai na hora; sem dono
   conhecido (identidade carregando) o armazém não lê nem grava;
3. GUARDA CEDO: o ouvinte nasce no boot (`main.tsx`), não no primeiro uso;
4. APAGAR: ao sair/trocar de conta (`signOut` e ouvintes), em `limparTudo` ("esquecer este navegador") e em `excluirConta`
   com sucesso. O fim da migração do modo sem conta (`limparTudo({ soDoModoSemConta: true })`) NÃO apaga os armazéns da
   conta que acabou de entrar.

Exceção deliberada: o rascunho da captura do visitante sem conta passa para a conta que entra (é o caso de uso dele: a
captura que a tela de login interrompeu volta depois do login); o de uma conta nunca passa para outra.

## Tabela

Legenda: **migrado** = usa a peça comum; **por conta, pendente** = deveria ser por conta mas não foi migrado nesta
rodada; **aparelho** = preferência/cache do aparelho, não é por conta.

| Armazém                                                                                                                                                                                                               | Onde                   | Por conta?                                                               | O que foi feito                                                                                |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| Áudio do cartão (`babel-audio-do-cartao`)                                                                                                                                                                             | IndexedDB              | Sim                                                                      | Migrado (já tinha dono; agora usa a peça comum, sem mudar o comportamento)                     |
| Cena do cartão (`babel-cena-do-cartao`)                                                                                                                                                                               | IndexedDB              | Sim                                                                      | Migrado (idem)                                                                                 |
| Histórico do diário (`babel-diario`)                                                                                                                                                                                  | IndexedDB              | Sim                                                                      | Migrado: linhas com dono, ouvinte no boot (antes: preguiçoso, sem dono)                        |
| Rascunho do diário (`frasy.diario.rascunho`)                                                                                                                                                                          | localStorage           | Sim                                                                      | Migrado (antes: ouvinte preguiçoso, só apagava na troca de estado, não conta -> conta)         |
| Minha voz no cartão (`babel-minha-voz`)                                                                                                                                                                               | IndexedDB              | Sim (voz da pessoa)                                                      | Migrado: linhas com dono (antes: ouvinte preguiçoso, sem dono)                                 |
| Conversas do iChat (`ichat_conversas`, `ichat_conversa_atual`, `ichat_sessions`)                                                                                                                                      | localStorage           | Sim (texto da pessoa)                                                    | Migrado: valor com dono; o formato antigo (sem dono) deixou de ser migrado e sai               |
| Rascunho da captura (`babel.capturas_pendentes`)                                                                                                                                                                      | localStorage           | Sim, com a exceção do visitante (acima)                                  | Migrado com `adotarDoAnonimo`                                                                  |
| Plano guardado (`babel.entitlements`)                                                                                                                                                                                 | localStorage           | Sim (a conta B via o plano da A sem rede)                                | Migrado, e a cópia em memória também é esquecida na troca                                      |
| Cache de voz sintetizada (`babel-voz`)                                                                                                                                                                                | IndexedDB              | Só pela retenção (chave = SHA-256, áudio sintético)                      | Ligado à guarda comum (apaga ao sair/trocar, limpar tudo, excluir); sem dono por linha         |
| Nível do diário (`frasy.diario.nivel`)                                                                                                                                                                                | localStorage           | Não (preferência de estudo, sem dado pessoal)                            | Nada                                                                                           |
| Sessões, falas, áudios, cartões, revisões do modo sem conta (`babel-local`)                                                                                                                                           | IndexedDB              | É o modo SEM conta (dono = visitante); migra para a conta que entra      | Nada; `limparTudo` continua apagando; risco residual abaixo                                    |
| Palavras marcadas do modo sem conta (`babel.efemero.palavrasMarcadas`), configurações (`babel.efemero.settings`), fuso, aviso de reembolso                                                                            | localStorage           | Idem (espelho do modo sem conta)                                         | Nada                                                                                           |
| Memória de tradução (`babel-memoria-de-traducao`)                                                                                                                                                                     | IndexedDB              | Parcial: falas curtas (<= 12 palavras) por 30 dias, sem listagem na tela | **Migrado (Onda 5, `armazensDoAparelhoDaConta`)** (era risco baixo: só dá "acerto de cache")   |
| Meus livros (`frasy.livros.meus.v1`), posições, capas locais, anotações do leitor                                                                                                                                     | localStorage/IndexedDB | Sim                                                                      | **Migrado (Onda 5, `armazensDoAparelhoDaConta`)** (era risco médio: lista de livros da pessoa) |
| Desenhos por sessão (`babel-desenhos`, `babel.desenho.sessao:*`)                                                                                                                                                      | IndexedDB/localStorage | Sim (id da sessão, que só a conta enxerga)                               | **Migrado (Onda 5, `armazensDoAparelhoDaConta`)** (era risco baixo: chave é id da sessão)      |
| Foto do perfil (`babel.fotoDoPerfil.<usuario>`), avatar (`frasy.avatar.*.<usuario>`)                                                                                                                                  | localStorage           | Já isolado por chave de usuário                                          | Nada na leitura; **agora apaga ao sair/trocar de conta** (Onda 5)                              |
| Perfis da galeria (`babel.perfis`), cromas, paletas, efeitos equipados, peles de cartão                                                                                                                               | localStorage           | Cosmético da conta                                                       | **Por conta, pendente** (risco baixo)                                                          |
| Conquistas, datas, ofensiva, estudo do dia, metas, recompensas vistas, eventos vistos, marcos, maestria/temporada creditadas, presença, loja possuídos                                                                | localStorage           | Sim, mas espelho de dado do servidor (a conta é a fonte)                 | **Migrado (Onda 5)**: apagar na troca refaz alguns avisos "já visto", aceito                   |
| Cenas juntadas da revisão (`revisao.cenasJuntadas`), curadoria mantida, leitura ativa (lidos), anki perfis de mapeamento                                                                                              | localStorage           | Sim                                                                      | **Por conta, pendente** (risco baixo: ids e preferências de fluxo)                             |
| Apelido e envio do ranking (`babel.apelido`, `babel.rank_enviado`)                                                                                                                                                    | localStorage           | Sim (apelido público)                                                    | **Por conta, pendente** (risco baixo)                                                          |
| Chave do Anki Connect (`babel.anki_connect_key`)                                                                                                                                                                      | local/sessionStorage   | Não: credencial do Anki NESTA máquina (127.0.0.1)                        | Nada                                                                                           |
| Tema, idioma da interface, escala de fonte, sons, animações, layout, legendas flutuantes, Quest, vibração, sonda do aparelho, flags, modelos de voz/STT, cache de pesos, sentinelas, dicionário local, service worker | localStorage/Cache API | Não (preferência ou cache do APARELHO)                                   | Nada                                                                                           |
| Tokens de convite, intenção de login, e-mail do login, erro do link, funil de ofertas/checkout/cotas de anúncios, avisos dispensados, provas de polimento (`babel.px.*`, `babel.lab.*`)                               | local/sessionStorage   | Não (efêmeros de fluxo ou de teste do aparelho)                          | Nada                                                                                           |
| Sessão do Supabase (`sb-*-auth-token`)                                                                                                                                                                                | localStorage           | É a própria sessão (o SDK a apaga no `signOut`)                          | Nada                                                                                           |

## Resultado

- 8 armazéns migrados para a peça comum (+ 1 cache ligado à guarda); testes para cada um em
  `tests/dados-locais-por-conta.test.ts` (conta -> conta, recarga com outra conta, sair, signOut sem ouvinte, limpar tudo,
  excluir conta com sucesso e com falha, e o caso do visitante).
- Pendências por conta de risco baixo/médio estão marcadas na tabela; a mais relevante é "Meus livros".

## Riscos residuais e observações

- Dado do modo sem conta (`babel-local`) fica no aparelho até migrar para uma conta ou "esquecer este navegador"; se uma
  pessoa A usou sem conta e depois a B entra no mesmo aparelho, o diálogo de migração pode oferecer esse dado à B. É o
  comportamento do desenho do modo sem conta, e merece decisão do dono.
- O iChat carrega as conversas ao montar; se montar antes de a identidade resolver, começa uma conversa nova (a anterior
  volta na próxima abertura).
- Com a identidade ainda carregando, `getEntitlements()` devolve o plano FECHADO até o dono ser conhecido (antes devolvia
  o cache do disco); o App já recarrega os entitlements quando a sessão resolve.

## Onda 5: armazéns restantes e o aviso do visitante (25/11/2026)

Peça: `src/lib/armazensDoAparelhoDaConta.ts` (registrada na guarda como `dados-do-aparelho-da-conta`). Como esses módulos
carregam sob demanda (teto de 184 KB de JS inicial; o orçamento do bundle segue ok), a guarda não os importa: ela conhece só os
NOMES das chaves do `localStorage` e dos bancos. Em vez de mudar o formato de cada armazém, um marcador
(`babel.dono-dos-armazens-locais`) diz de quem é o conjunto inteiro. Cobertos: Meus livros (lista, posições, elenco, narração por
livro, `frasy-livros`, `frasy-leitor`, `frasy-capas`), memória de tradução, desenhos por sessão, cosméticos da galeria,
marcadores de gamificação, foto do perfil e avatar (miniatura, crédito, `frasy-avatar`). Bancos são esvaziados (não criados nem
apagados) na troca/saída, e destruídos em "esquecer este navegador"/excluir conta. Os módulos com cópia em memória ouvem
`frasy:armazens-do-aparelho-limpos`.

Decisões assumidas (recomendação do agente, 25/11):

- Dado de antes da regra (sem marcador) é ADOTADO por quem abre primeiro; apagar tudo na primeira abertura destruiria a lista de
  livros de todo mundo. Risco: aparelho que já era compartilhado.
- O que o visitante deixou fica PENDENTE ao entrar numa conta (nem apagado nem adotado sozinho). O aviso de entrada
  (`ModalDeMigracao`) agora tem "Guardar na conta" (traz), "Apagar deste navegador" (com confirmação) e "Agora não".
  Se a conta SAI ou TROCA com a escolha ainda pendente, o conjunto INTEIRO sai do aparelho, inclusive o que o visitante
  deixou (regra FAIL-CLOSED, revisão de segurança de 25/11).
- Enquanto pendente, o que a conta grava se mistura ao do visitante (mesmas chaves e bancos, sem como separar), e contar
  linhas ou tirar "impressão" do conjunto não prova que a conta não gravou (sobrescrita e corrida passam). Por isso a regra
  acima: perder o dado do visitante que ninguém reivindicou é aceitável; vazar dado de conta para a próxima pessoa não é.
  "Apagar" leva os dois (são espelhos do servidor); "Guardar na conta" não perde nada.
- Chaves por conta acrescentadas na revisão: `frasy.avatar.receita.`, `frasy.avatar.sinais.marcacoes`, `leitor:recentes`,
  `leitor:narracao:sessao:` e `leitor:migrou:`. Ficam de fora, por serem preferência do aparelho: `frasy.avatar.modo.*`,
  `frasy.avatar.interprete.*`, `leitor:perfil`, `leitor:narracao:opcoes|meu-estilo|modo|seguir`, `leitor:glosa`.
- Não migrados (risco baixo, seguem pendentes): cenas juntadas da revisão, curadoria, leitura ativa, perfis de mapeamento do Anki,
  apelido e envio do ranking.
