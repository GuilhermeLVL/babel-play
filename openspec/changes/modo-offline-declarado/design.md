## Decisões

- **Puro no core.** `capacidadesSemRede(estado)` não lê rede, DOM nem armazenamento: o chamador monta o estado. Assim é
  testável sem navegador.
- **Honestidade acima de tudo.** Um item só vale "funciona" se o que ele precisa está de fato no aparelho. Transcrição e
  tradução dependem do modelo baixado E do motor local; sem modelo baixado, dizem "baixe antes, com rede".
- **Online não esconde nada.** Com rede, o que é da nuvem funciona; o que é local continua dependendo do modelo.
- **Jogos e leitor** funcionam com o que já está no aparelho (baralho, livros da estante). A faixa só aparece com a
  página já aberta, então isso é verdadeiro ali.
- **Onde aparece.** Faixa do topo só quando offline (sem menu novo), dispensável por sessão (`sessionStorage`). Detalhe
  completo em "Uso sem internet" no Diagnóstico.
- **Estado dos modelos** vem de `areModelsCached(expectedModelIds(src, tgt))` (manifesto + Cache Storage), conferido
  quando a rede cai.
