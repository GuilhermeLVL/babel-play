> **Status da palavra 1 a 4 na legenda e no leitor, com promoção automática pelo FSRS.** A força 1 a 4 JÁ existe (change
> arquivada `vocab-forca-e-etiquetas`); esta change descreve só o DELTA: levar essa mesma régua para onde a pessoa lê.

## O que já existe (não repetir)

Conferido no código e nas changes arquivadas:

- **Força 1 a 4 derivada do FSRS**: `src/core/learning/forcaDoCartao.ts` (1 Nova, 2 Reconhecida < 3 dias de estabilidade, 3 Familiar
  3 a < 21, 4 Firme >= 21; 3 esquecimentos rebaixam um nível). Sem status manual, de propósito. Aparece no catálogo
  (`CatalogoDePalavras.tsx`, `CatalogoDoQuest.tsx`) e no cartão da palavra (`ForcaDaPalavra.tsx`, `GET /api/vocab/palavra`).
- **"Já sei" e "Ignorar"** (`palavras-marcadas`, arquivada `vocab-conhecidas-e-ignoradas`): outra coisa, nunca altera a força.
- **A legenda e o leitor NÃO usam a força.** Eles pintam pela régua de TRÊS estados de `src/core/learning/estadoDoCartao.ts`
  (nova, aprendida, dominada), via `src/lib/etiquetas/indiceDeEtiquetas.ts` e `src/core/vocabulario/etiquetas.ts`
  (`salva`, `aprendendo`, `dominada`, `conhecida`, `ignorada`, `nova-para-voce`; CSS em `src/styles/etiquetas.css`). Nessa régua,
  `dominada` é "fase Review E retenção de agora acima de `RETENCAO_DE_DOMINIO`", ou seja, DEPENDE DO RELÓGIO: a palavra que
  ontem estava dominada pode voltar a ser pintada se a pessoa ficar semanas sem revisar. A glosa do leitor (`leitor-glosa`) e a
  cobertura leem a mesma régua.

## Why

A pessoa vê a "Força 3 de 4" na lista de palavras e a "aprendendo" na legenda: duas escalas para a mesma palavra, calculadas por
regras diferentes (estabilidade contra retenção instantânea) que podem discordar. Quem estuda quer que a legenda e o leitor
mostrem o que o catálogo mostra e que a palavra "suba de nível" sozinha, sem marcar nada, à medida que o FSRS a promove.
O LingQ faz isso à mão (status 1 a 4 manuais que brigam com a repetição espaçada); aqui a promoção é automática porque o status é
derivado.

## What Changes

Tudo atrás da flag NOVA `forca_na_legenda` (nasce desligada, sem regra de plano). Desligada, nada muda.

- **Índice com força**: `montarIndiceDoCaderno` passa a guardar, além do estado, a `forca` do cartão (`forcaDoCartao` já aceita o
  `VocabCard` do cliente: `stability`, `reps`, `lapses`). Quando duas linhas têm a mesma chave, vale a maior força (a mesma regra
  de "o estado mais avançado").
- **Etiqueta derivada da força** (função pura, ao lado de `etiquetaDaChave`): 1 = `salva`, 2 e 3 = `aprendendo`, 4 = silenciosa
  (como `dominada` hoje: não pinta, não pede atenção). As seis etiquetas e o CSS continuam; só muda de onde vem a escolha. Um
  atributo `data-forca` (1 a 4) vai junto de `data-etiqueta` para teste e para a gaveta da palavra, sem mudar o que o leitor de tela
  anuncia (a palavra continua o mesmo nó).
- **Promoção automática**: o índice já é relido quando há escrita (`geracaoDeEscritas`); terminada uma revisão, a etiqueta da
  palavra na legenda e no leitor sobe (ou desce, se esquecer) na próxima leitura do índice, sem toque da pessoa e sem aviso
  sonoro ou toast. Nenhuma linha nova é gravada: promoção é leitura da estabilidade, não escrita.
- **Glosa no leitor** (delta do `leitor-glosa`): a glosa de uma palavra com cartão passa a sumir quando a força chega a 3
  (`FORCA_QUE_APAGA_A_GLOSA`), e não assim que o cartão sai de "nova". "Já sei" continua apagando na hora.
- **Gaveta/cartão da palavra** na legenda e no leitor mostram a mesma "Força N de 4" do catálogo (o componente `ForcaDaPalavra` já
  existe).

## Fora de escopo

- Status manual 1 a 4 (decisão anterior mantida: sem status editável).
- Mudar a contagem de "palavras que você conhece" e os marcos (`contarConhecidas` continua contando aprendendo + dominada + Já sei;
  mexer ali altera números que a pessoa já viu e é decisão do dono, abaixo).
- Quatro tons distintos na legenda, toast ou som de "subiu de nível", streak ou meta diária (gamificação por resultado, não por
  tempo; nada novo aqui).
- Mudar os limiares da força ou a migração de banco (nada novo é gravado).
- Idiomas sem espaço entre palavras e o ponto "nova para você" (intocados).

## Riscos

- **Mudança visível de cor**: palavras hoje `dominada` por retenção podem ficar silenciosas ou pintadas de outro jeito. Mitigação:
  flag e simulação com decks reais antes de ligar (tarefa 1.1).
- **Duas verdades**: a moldura do cartão (`pelesDeCartao`) segue na régua de três estados e pode discordar da legenda. Mitigação:
  a decisão do dono 1 abaixo (migrar tudo para a força ou só a legenda) e um teste que fixa a tabela de correspondência.
- **Contraste**: o tom `aprendendo` passa a cobrir mais palavras (força 2 e 3). Mitigação: `scripts/etiquetas/contraste.mjs` com
  os dois temas e os fundos da janela flutuante (todos >= 4,5:1).
- **Jogos e cobertura divergem**: se a cobertura continuar contando "aprendendo" como conhecida e a glosa só apagar em força 3, o
  número de "conhecidas" sobe antes de a glosa sumir. É consequência declarada (decisão do dono 2).

## Custo

Zero de IA, zero de banco, zero de rede nova (o dado já vem no caderno). Esforço de código pequeno a médio.

## Métrica de sucesso

- Concordância legenda x catálogo: 100% das palavras com a MESMA faixa nas duas telas (teste de tabela).
- Simulação sobre os decks reais do dono e do corpus Anki de teste: reportar quantas palavras mudam de etiqueta (esperado: a maior
  parte é a dominada por relógio que passa a depender de estabilidade). Se mais de 15% mudarem, rever os limiares antes de ligar.
- Depois de ligar para o dono: nenhuma palavra "pisca" entre etiquetas sem uma revisão no meio (instabilidade = 0 em um mês).
