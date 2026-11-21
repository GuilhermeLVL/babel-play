## Decisões

1. **Componente novo, não um modo do `VocabularyPanel`.** O painel serve cinco telas e o modo folha é usado
   pela Leitura antiga e pela Análise. Um componente do leitor (`views/leitor/CartaoDaPalavra.tsx`) evita
   mudar o que já funciona lá; ele reaproveita `lookup`, `wiktionaryUrl`, `forvoUrl`, `Provenance` e
   `ExplicacaoDaFrase`.
2. **Não modal.** `role="dialog"` com `aria-modal="false"`, sem `<dialog>` nem `showModal()`, sem fundo e sem
   prender o foco. O foco só vai ao cartão quando ele foi aberto pelo teclado (Enter na palavra, "Ver a
   palavra"); Esc fecha e devolve o caret à palavra. Fecha também com toque fora, virada de página e seleção;
   tocar outra palavra troca o conteúdo.
3. **Narração intocada.** Abrir e fechar o cartão não chama o `Narrador`. Só o botão Ouvir fala (como hoje),
   e a voz do aparelho pode cortar a frase narrada por ser a mesma fila de fala; isso já acontecia.
4. **Posição (pura).** Entrada: retângulo da palavra (já somado ao do iframe), tamanho do cartão e da janela.
   Computador: abaixo da palavra; sem espaço, acima; sem espaço nos dois, o lado com mais espaço. Celular
   (≤ 600 px): mini-folha embaixo, até 40% da altura; se ela cobriria a palavra, a folha sobe para o topo. O
   texto paginado não rola (uma página é uma página), então inverter é o jeito de nunca cobrir a palavra.
5. **Sentido no contexto (puro).** A forma de consulta é a minúscula quando a palavra está no começo da frase
   (ou em caixa alta) e não há sinal de nome próprio. A ordem dos sentidos pontua a classe gramatical: nome
   próprio só sobe quando a palavra está capitalizada no meio da frase (ou depois de um título: Mr., Sr.,
   Dr.); antes dela, artigo/determinante puxa substantivo e pronome/modal/"to" puxa verbo; logo depois, um
   pronome objeto ("me", "him") puxa verbo. Empate mantém a ordem do verbete.
6. **Tradução da frase.** Usa a mesma `traduzir` que a barra do trecho usa (`gateway.mt`), com cache por frase
   no leitor e estados "Traduzindo a frase…", erro com "Tentar de novo".
7. **Imagem.** A busca de hoje (`buscarImagensDaPalavra`: verbete do Wikcionário/Commons e, para completar,
   Openverse pelo proxy) só roda fora do perfil protegido (`perfilProtegido()` falso). Uma miniatura com a
   licença como link para a página da imagem; enquanto carrega, o cartão já está pronto.

## Riscos

- Heurística de classe gramatical é simples (sem etiquetador). Mitigação: só reordena, nunca esconde; o
  verbete inteiro continua em "Mais".
- Posição do range dentro do iframe paginado: o retângulo é o do documento do capítulo somado ao do iframe;
  se faltar, o cartão cai na mini-folha.
