## Why

O áudio nativo e as imagens são metade do valor de um baralho Anki — e hoje **jogamos os dois fora
antes de sair do navegador**. `soAColecao` (`src/components/views/BaralhoAnki.tsx:71-88`) reempacota
o `.apkg` mandando só a coleção, e `limparCampo` (`server/import/anki.ts:62-79`) apaga as
referências `[sound:]` e `<img>` do texto. Isso foi a coisa certa quando o objetivo era só ler
palavras: encolheu um arquivo real de **224.592.115 para 629.713 bytes** (356×) e fez caber num
limite de 200 MB que o arquivo estourava. Mas o resultado é que a referência **não sobra nem como
ponteiro**: depois do import, não há como saber que aquela nota tinha áudio.

Isso trava três coisas: os jogos de escuta/ditado/karaokê, que hoje só funcionam com gravação do
próprio usuário; o jogo de memória palavra↔imagem, pedido no brief; e o conserto da dor nº 1 dos
baralhos compartilhados — mídia faltando —, que o Anki tem FAQ oficial para explicar e nós
poderíamos simplesmente **auditar e suprir**.

Dois detalhes descobertos no G0 mudam o custo disso: no formato moderno **cada arquivo de mídia é
zstd** e precisa ser descomprimido individualmente; e o mapa de mídia é um protobuf que já traz
**nome, tamanho e sha1 por arquivo** — ou seja, o próprio pacote entrega a chave de deduplicação.

## What Changes

- **ADICIONA** armazenamento de mídia Anki endereçado por conteúdo (sha256), com deduplicação
  **por usuário**, reusando o seam `server/lib/armazenamento.ts` (filesystem ou S3/R2).
- **ADICIONA** upload seletivo negociado por hash: o cliente extrai do `.apkg` **só a mídia das
  notas ativadas**, pergunta ao servidor quais faltam, e sobe apenas essas — preservando a vitória
  de tamanho em vez de desfazê-la.
- **ADICIONA** auditoria de mídia por baralho: quantos áudios e imagens são referenciados, quantos
  chegaram, quais faltam — e o que fazer a respeito.
- **MODIFICA** a cota de armazenamento para enxergar a mídia Anki. Hoje `somarBytesEmDisco`
  (`server/lib/storageQuota.ts:83-94`) só percorre sessões: se gravássemos mídia Anki sem isso, o
  contador **mentiria** e a isenção declarada em `server/routes/import.ts:37-40` — cuja premissa
  literal é "nada delas chega ao disco" — deixaria de ser verdade sem ninguém perceber.
- **NÃO MUDA**: o caminho de áudio de sessão, que já funciona e tem Range/206 testado.

## Impact

- `server/import/anki.ts`: lê o mapa `media` nas duas formas (JSON legado e protobuf moderno) e
  descomprime a mídia zstd.
- `server/lib/storageQuota.ts`: passa a somar a mídia Anki (senão o contador mente).
- Tabelas novas `anki_media` e `anki_note_media` (aditivas).
- Rota nova de leitura de mídia com Range, sobre `lerFaixa` do seam.
- **Restrição jurídica do G0**: a deduplicação é **por usuário**, nunca global — um arquivo servido
  a muitos deixa de ser cópia privada e vira distribuição.
