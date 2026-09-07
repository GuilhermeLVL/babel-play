> **Entregue.** A pergunta 4 foi respondida pelo dono em 07/09 — encerrar a edição leve, manter o
> modo sem conta — e ela destravou tudo o que faltava. A seção 5 fecha por REMOÇÃO, e isso está
> dito item a item; a remoção em si é a change `edicao-leve-encerrada`.

## 1. Decisao e inventario

- [x] 1.1 Pergunta 4 respondida: a edição leve é encerrada como build; o modo sem conta continua e passa a ser o único caminho "sem servidor". Os dois custos foram medidos antes da decisão (47 ramos em 12 arquivos e 4 arquivos exclusivos de um lado; espelhar economia e rotas do outro), e o fato que decidiu foi que ela nunca esteve no ar: o deploy nasceu desarmado e nunca foi disparado.
- [x] 1.2 A tabela "rota → paridade | 501 explicado" virou um TESTE (`tests/contratos/rotas-espelhadas.test.ts`), e não um documento. Uma tabela responde a pergunta uma vez e envelhece na primeira rota nova — foi assim que seis rotas ficaram fora do espelho sem ninguém perceber. O teste lê as chamadas `/api/...` de todo o `src/` e cobra que cada uma esteja espelhada ou tenha motivo escrito, **nos dois sentidos**: justificativa para rota que ninguém chama mais também derruba. Ele já encontrou uma rota órfã de verdade (`POST /api/ai/llm/chat/completions`, sem chamador).

## 2. Rotas

- [x] 2.1 Espelhadas: `GET /metrics/xp`, `GET /vocab/pagina`, `GET /vocab/inicio-da-contagem`, `DELETE /vocab/:id` e `GET /sessions/utterances/all`. **`para-jogo` continua sem espelho, de propósito** — `compor` já cai em `composicaoLocal`, a MESMA ordenação do core rodando no cliente; espelhá-la sobre IndexedDB criaria uma segunda verdade onde hoje há uma. O motivo está escrito no teste de paridade, onde envelhece junto com o código.
- [x] 2.2 `fetchAllUtterances` parava a tela com `throw` quando o modo sem conta respondia 501. Lista vazia era a resposta certa; hoje nem isso é preciso — a rota é espelhada e devolve as falas de verdade.
- [x] 2.3 O 501 do efêmero passou a carregar `code` além de `codigo` — o envelope do servidor real é `{ error, code?, detalhes? }`, e um cliente que lê `code` precisa achar o mesmo campo nas duas pontas.
- [x] 2.4 **Além do previsto:** `POST /api/exercises/results` SAIU do efêmero. O Express a removeu na mudança `servicos-sem-duplicata` e o espelho ficou — a mesma divergência que esta change fecha, só que ao contrário: sem conta funcionaria algo que com conta responde 404.

## 3. Perfil compartilhado

- [x] 3.1 A CURVA DE XP foi para o core (`src/core/learning/historicoDeXp.ts`) e as duas pontas a chamam. Era a peça que faltava para `/metrics/xp` existir sem conta, e copiá-la teria criado a segunda verdade: setenta linhas de "some evento por balde" que concordariam só enquanto ninguém mexesse numa delas. O que ficou em cada lado é o que só ele sabe fazer — LER as linhas.
- [ ] 3.2 `computeProfile` inteiro num módulo compartilhado. **Não feito, e a recomendação é não fazer agora.** A duplicação real que sobrou é a agregação do perfil, e ela é grande, testada dos dois lados e sobre payloads contratados — trocá-la por uma função nova é risco sem sintoma. O caminho que se provou melhor nesta rodada foi extrair PEÇA POR PEÇA quando uma delas precisa valer para as duas pontas: foi assim com `chaveDedup`, `economiaDeMetricas` e agora `historicoDeXp`. As três nasceram de uma necessidade concreta, e não de um plano de unificação.

## 4. Chave de dedup unica

- [x] 4.1 `chaveDedup(palavra, lang)` em `src/core/texto/palavra.ts`, usada pelo servidor e pelo efêmero. Eram duas, e o comentário de uma delas afirmava ser "a mesma chave do servidor" — não era, em três pontos. O efeito aparecia na MIGRAÇÃO, que é o pior lugar: quem estudou sem conta e depois criou uma via o acervo duplicar palavras que já tinha.
- [x] 4.2 `tests/paridade-anonima.test.ts`: 20 palavras com acento, caixa, pontuação e escrita não latina, em quatro idiomas, produzindo a MESMA chave nas duas pontas.
- [x] 4.3 `acharPelaChaveAntiga` reconhece a chave legada uma última vez e a regrava na forma nova — senão a mudança de forma faria uma carta antiga deixar de ser encontrada, e duplicar, justamente para quem já usava o modo sem conta.

## 5. Edicao leve

- [x] 5.1 `/perfil` em branco e `/plano` sem backend: **fechados por REMOÇÃO.** Eram rotas roteáveis numa edição que não tinha as telas por trás. Sem a edição, as duas rotas têm a tela e o backend que sempre tiveram na completa.
- [x] 5.2 `vite.config.ts` tratar `mode === 'leve'`: **fechada por remoção**, e é o resultado certo. A tarefa existia porque o build leve funcionava por convenção (`.env.leve`) sem o `vite.config.ts` saber do modo. Sem build leve, não há modo a tratar.
- [x] 5.3 Suíte verde (2.903) e e2e 18/18.
