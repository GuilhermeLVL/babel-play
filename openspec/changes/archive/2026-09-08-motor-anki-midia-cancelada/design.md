## Context

O app já tem um seam de armazenamento pronto (`server/lib/armazenamento.ts:182-194`,
`armazenamentoDoAmbiente`): filesystem local ou S3/R2, com SigV4 escrito à mão, `lerFaixa` para
Range e `resolverDentroDe` contra path traversal. Ele existe porque o áudio de sessão já sofreu o
incidente P0-3 — arquivo preso ao disco de uma réplica enquanto a linha do banco replicava
(`server/routes/sessions.ts:20-28`). Mídia Anki entra por esse mesmo seam. Não se constrói storage
novo.

O que **não** existe é endereçamento por conteúdo: o nome de arquivo hoje é `${sessionId}.${ext}`,
determinístico pela sessão. `grep createHash` no servidor só acha SigV4 e o `csum` do export.
Dedupe de mídia é greenfield.

## Decisão 1 (ADR) — Extração seletiva no cliente, negociada por hash

**Escolhido:** o cliente continua mandando só a coleção; na **ativação**, com o `File` ainda em
mãos, extrai do zip apenas a mídia das notas ativadas e sobe o que o servidor disser que falta.

**Rejeitado — mandar o `.apkg` inteiro:** desfaz a compressão de 356× medida, estoura o limite de
200 MB no arquivo real que motivou tudo, e transfere mídia de notas que talvez nunca sejam ativadas.

**Rejeitado — upload multiparte do pacote inteiro:** é infraestrutura para transportar lixo.

Fluxo: (1) upload da coleção → o servidor devolve notas **com as referências preservadas** e o
manifesto de mídia; (2) na ativação, o cliente calcula os hashes dos arquivos daquelas notas e
pergunta quais faltam; (3) sobe os que faltam em lotes (~25 MB por requisição, coerente com os
limites já praticados); (4) **o servidor recalcula o sha256 e é a autoridade** — hash vindo do
cliente nunca é confiável, mesmo quando o próprio pacote Anki o fornece.

Caso descoberto: ativar uma nota depois, sem o arquivo em mãos. O app pede o `.apkg` de novo, com
mensagem clara. Declarado, não escondido.

## Decisão 2 (ADR) — Dedupe por usuário, nunca global

Chave `(user_id, sha256)`. Tecnicamente o dedupe global economizaria muito mais (o mesmo Core 2k
baixado por mil pessoas). **Não fazemos**, por duas razões que se somam:

1. **Jurídica** (G0 §5): armazenar cópia privada enviada pelo usuário é análogo a cloud storage; um
   arquivo único servido a muitos usuários descaracteriza a cópia privada e se aproxima de
   distribuição — que é exatamente a fronteira que o programa decidiu não cruzar.
2. **Contábil**: com dedupe global, a quem se cobra o byte? A atribuição de cota por plano viraria
   arbitrária, e a cota é enforcement real (degrada fechado, 507/503).

Registrado como porta que se pode abrir depois com refcount entre tenants — mas com parecer
jurídico, não por conveniência de disco.

## Decisão 3 — Cota no mesmo change, nunca depois

A isenção de `/api/import/anki` está escrita com a premissa: *"nada delas chega ao disco, então não
consomem cota"* (`routes/import.ts:37-40`). No instante em que gravarmos o primeiro byte de mídia
Anki, essa frase vira falsa. Então `somarBytesEmDisco` passa a somar `anki_media` **na mesma
entrega**, e a reserva atômica de `storageQuota.ts:114-125` vale para o upload de mídia como já
vale para o áudio de sessão. Separar as duas coisas em entregas diferentes criaria uma janela em
que o contador mente — e um contador que mente é pior que não ter contador.

## Decisão 4 — Auditoria de mídia é feature, não relatório de erro

A comunidade documenta mídia quebrada em decks compartilhados como dor recorrente, com FAQ oficial
do Anki para explicá-la. Nossa vantagem: sabemos exatamente o que a nota referencia e o que chegou.
A tela de Saúde do baralho diz "12 áudios referenciados, 9 presentes, 3 faltando" e oferece o
caminho — reenviar o arquivo, ou usar voz sintética para aquelas notas. O caminho TTS **já existe**
no app e tem sinal próprio: `startMs:0, endMs:0` significa "não há clipe, fale o texto"
(`Play.tsx:673-706`). Mídia faltando degrada para TTS em vez de virar cartão quebrado.

## Decisão 5 — Segurança do conteúdo de terceiros

Mídia vinda de estranho é conteúdo hostil até prova em contrário: allowlist de tipo por **magic
bytes** (o app já faz isso para áudio de sessão, `server/lib/tipoDeArquivo.ts`), nome de objeto
derivado do hash (nunca do nome original, que pode conter caminho), teto de tamanho por arquivo e
por lote, e sanitização do HTML dos campos na ingestão **e** no render.

## Riscos

| Risco | Mitigação |
|---|---|
| Mídia Anki estoura a cota do plano free (500 MB) | Reserva atômica antes de gravar, com 507 explicativo; ativação em lotes limita o volume por vez; a tela mostra o custo antes |
| Descompressão zstd por arquivo é lenta em baralho com milhares de mídias | Só a mídia das notas **ativadas** é processada; medido no G2 |
| Cliente sem o arquivo na hora de ativar | Fluxo declarado: pedir o `.apkg` de novo, com mensagem clara |
| Arquivo malicioso disfarçado de áudio | Magic bytes + allowlist + nome por hash + teto |
