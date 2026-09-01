## Why

Três queixas do dono (31/08) que a investigação mostrou serem **o mesmo defeito**: o app tem a coisa
pronta e não entrega.

1. **"Minhas Palavras não informa nada."** A lista das 201 palavras existe, funciona e tem busca,
   filtro e ordenação (`views/vocab/CatalogoDePalavras.tsx`) — mas vive na aba `lexical`, que
   `coreOnly('senior')` esconde atrás do botão "Mais" (`Metrics.tsx:381-396`). **A tela chamada
   Minhas Palavras abre na única aba que não tem palavras.** Junto: `wordsCaptured` (713) e
   `listeningMs` (6min11s) são computados e não aparecem em tela nenhuma; a pizza CEFR desenha um
   donut "N/D 100%" enquanto o Resumo declara que não há base; e "Exportar Meu Caderno" gera um
   arquivo **sem nenhuma palavra**.

2. **"O texto do Sobre está errado agora que vamos precificar."** A página promete "Grátis e sem
   conta", "Roda inteiro no navegador", "Seu áudio nunca sai do PC" — e acusa as outras ferramentas
   de "pedir assinatura e mandar seu áudio para um servidor de alguém", que é a descrição do plano
   Pro do próprio app. As frases "Nada aqui custa dinheiro" seguem em `Loja.tsx:491` e
   `Conquistas.tsx:216`.

3. **"Remova os 3 cartões de cenário da captura."** Eles ocupam a tela inteira antes de gravar e
   escondem o controle que importa. Mas **não são decoração**: `applyScenario` (`LiveCapture.tsx:558`)
   é o ÚNICO escritor de `micEnabled`/`systemEnabled`, e o `<select>` de fonte de áudio mora dentro
   do mesmo bloco condicional.

## What Changes

1. **Minhas Palavras entrega palavras**: a lista sobe para a primeira coisa que se vê; os números
   capturados/ouvidos ganham lugar; o gráfico de uma semana mostra o ponto; o donut "N/D" não
   desenha; o export passa a incluir o caderno; e há caminho visível para a Curadoria (onde as
   traduções vazias se consertam).
2. **Guarda a montante**: com os dois idiomas iguais, a captura não ficha cartão sem verso em
   silêncio — foi assim que 198 dos 201 cartões do dono nasceram inúteis.
3. **Sobre reescrito** na linha aprovada: aprender é grátis e sem conta para sempre; paga-se nuvem e
   enfeite. Saem as frases que conflitam, aqui e nas duas telas da economia.
4. **Captura**: os 3 cartões saem e viram **dois interruptores diretos** (som do computador · meu
   microfone) que escrevem `micEnabled`/`systemEnabled`; o cenário passa a ser CONSEQUÊNCIA deles.
   O seletor de fonte de áudio fica.

## Não-escopo

O redesenho da economia (passe cheio, régua de origens, moedas) — está no protótipo aguardando
aprovação e terá mudança própria.
