> **Entregue: as seções que NÃO dependem da pergunta 4.** Se a edição leve continua ou não é
> decisão do dono, e ela governa a seção 5 — mas não governa o resto: o modo sem conta precisa
> concordar com o servidor sobre o que é a mesma palavra e sobre o que fazer quando a rota não
> existe, valha o que valer para a edição leve. O que ficou está dito item a item.

## 1. Decisao e inventario

- [ ] 1.1 Pergunta 4 (manter a leve?). **Sem resposta do dono.** Diferente da pergunta 6 (jogos culturais), aqui não há saída padrão barata: as duas respostas dão trabalho em direções opostas — manter significa espelhar economia e rotas no efêmero; encerrar significa remover uma superfície inteira. Escolher por conta própria seria apostar semanas na resposta.
- [ ] 1.2 Tabela rota → paridade | 501 explicado, para TODAS as chamadas dos seis módulos de dados. **Não feito por inteiro:** o molde existe (`tests/contratos/sessoes.test.ts`, da change `contratos-alinhados`) e o caso mais grave foi resolvido abaixo; a tabela completa é trabalho de inventário que só vale depois de 1.1, porque metade dela some se a leve sair.

## 2. Rotas

- [ ] 2.1 Implementar no efêmero `/metrics/xp`, `/vocab/para-jogo`, `/vocab/pagina`, `/vocab/inicio-da-contagem`, `DELETE /vocab/:id`. **Não feito, e `para-jogo` merece nota:** ele NÃO precisa de espelho. `compor` já cai em `composicaoLocal`, que é a MESMA ordenação e os mesmos cortes, do núcleo, rodando no cliente — a paridade ali é por construção, não por duplicação, e reimplementá-la sobre IndexedDB criaria uma segunda verdade onde hoje há uma. As outras quatro dependem de 1.1.
- [x] 2.2 `fetchAllUtterances` parava a tela com `throw` quando o modo sem conta respondia 501. Lista vazia é a resposta certa para "quais são as suas falas guardadas?" quando não há onde guardá-las; o convite para criar conta já tem caminho próprio (`EVENTO_EXIGE_CONTA`) e não precisa vir como exceção.
- [x] 2.3 O 501 do efêmero passou a carregar `code` além de `codigo` — o envelope do servidor real é `{ error, code?, detalhes? }` (change `contratos-alinhados`), e um cliente que lê `code` precisa achar o mesmo campo nas duas pontas. `codigo` continua porque já há tela lendo dele.

## 3. Perfil compartilhado

- [ ] 3.1 `src/core/learning/perfil.ts` (linhas → `AppMetrics`) usado pelos dois. **Não feito:** é a mesma reescrita de agregação que `arranque-leve-e-payloads-enxutos` avaliou e não fez — trocar ~200 linhas de JS testado por uma função nova num payload contratado. Depende de 1.1 para saber se vale para duas pontas ou só para uma.
- [ ] 3.2 Campos iguais nos dois (`listeningMs`, `palavrasDificeis`, `cromasComprados`…). Depende de 3.1.

## 4. Chave de dedup unica

- [x] 4.1 `chaveDedup(palavra, lang)` em `src/core/texto/palavra.ts`, usada pelo servidor e pelo efêmero. Eram duas, e o comentário de uma delas afirmava ser "a mesma chave do servidor" — não era, em três pontos: ordem dos campos invertida (`palavra|lang` contra `lang|palavra`), pontuação não removida, e locale inteiro no lugar do idioma base. O efeito aparecia na MIGRAÇÃO, que é o pior lugar: quem estudou sem conta e depois criou uma via o acervo duplicar palavras que já tinha. A ordem canônica é a do servidor, porque é a que já está gravada em `vocab_cards.norm_key`.
- [x] 4.2 `tests/paridade-anonima.test.ts`: 20 palavras com acento, caixa, pontuação e escrita não latina, em quatro idiomas, produzindo a MESMA chave nas duas pontas. Mais os invariantes que dão sentido à chave: o idioma separa (`casa` em pt e es são duas), o locale não separa (`pt-BR` e `pt-PT` são um), e sem idioma a chave não colide com idioma real.
- [x] 4.3 **Além do previsto:** o efêmero grava `normKey` num índice do IndexedDB, então mudar a forma da chave faria uma carta antiga deixar de ser encontrada — e duplicar uma vez, justamente para quem já usava o modo sem conta. `acharPelaChaveAntiga` reconhece a chave legada uma última vez e a regrava na forma nova. Some sozinha quando não houver mais base anterior a 07/09.

## 5. Edicao leve

- [ ] 5.1 `/perfil` e `/plano` na leve. **Bloqueado por 1.1** — é exatamente a superfície que a pergunta 4 decide.
- [ ] 5.2 `vite.config.ts` tratar `mode === 'leve'`. Idem.
- [x] 5.3 `tests/paridade-anonima.test.ts` existe e `npm test` está verde (2.862).
