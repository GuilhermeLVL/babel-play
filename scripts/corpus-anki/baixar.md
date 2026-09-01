# Como obter os baralhos do corpus

**Nenhum destes arquivos entra no repositório.** Baralhos reais são grandes (dezenas de MB) e têm
licença própria (o autor do baralho, não o app) — por isso ficam numa pasta FORA daqui, que você
aponta para `medir.ts` com `--dir`.

Sugestão de organização (fora do repo, ex. `C:\corpus-anki\`):

```
corpus-anki/
  japones-core2k.apkg
  japones-29k-grande.apkg
  kanjidamage.apkg
  ingles-arabe-subs2srs.apkg
  chines-tradicional-apache2.apkg
  russo-3000.apkg
  arabe-15k-rtl.apkg
  ultimate-geography.apkg
  cloze-pesado.apkg
  hsk1-audio-imagem.apkg
  kaishi-1.5k.apkg
  hsk3.apkg
  corrompido.apkg        <- gerado, ver abaixo
  texto-exportado.txt    <- gerado, ver abaixo
```

## Fluxo de download do AnkiWeb (verificado)

A página de um baralho compartilhado (`https://ankiweb.net/shared/info/<id>`) é uma SPA — `curl`
nela devolve só o shell JS, sem o link de download. O fluxo real, verificado nesta pesquisa:

1. `GET https://ankiweb.net/svc/shared/item-info?sharedId=<id>` — responde **anonimamente**
   (sem login) com um corpo **protobuf** que contém um token de download.
2. `GET https://ankiweb.net/svc/shared/download-deck/<id>?t=<token>` — entrega o `.apkg`.

**Recomendação: baixe pelo NAVEGADOR.** Abrir a página do baralho e clicar em "Download" faz o
mesmo fluxo por trás das cenas, sem exigir decodificar protobuf à mão — mais simples e mais
robusto a mudanças de API do AnkiWeb. Guarde o arquivo baixado na pasta do corpus, fora do repo.

## Lista de candidatos (AnkiWeb)

Cada um cobre uma característica diferente do baralho real — leia o critério antes de escolher
quais baixar; não é preciso baixar todos para um primeiro corpus.

| sharedId | nome | critério |
|---|---|---|
| `2141233552` | Japonês Core 2k | áudio, formato antigo (`collection.anki2`) |
| `2112246396` | Japonês 29.883 notas | GRANDE — mede tempo/memória em escala |
| `748570187` | KanjiDamage | note type customizado (campos fora do padrão Word/Meaning) |
| `2062595919` | Inglês/árabe subs2srs-like | 3.234 áudios + 4.688 imagens — mídia pesada |
| `216385733` | Chinês tradicional | licença Apache 2.0 declarada — seguro para citar |
| `2037470492` | Russo 3.000 | cirílico, só-texto |
| `1429416700` | Árabe 15.346 | RTL, grande |
| `2109889812` | Ultimate Geography | imagem-palavra, open-source |
| `1218229865` | (cloze-pesado) | muitos cartões cloze — testa o filtro de HTML/marcação |
| `1081958254` | HSK1 | áudio + imagem juntos |

Baixe pela URL `https://ankiweb.net/shared/info/<sharedId>`.

## Dois com download direto do GitHub (sem AnkiWeb)

- **Kaishi 1.5k** — https://github.com/donkuri/kaishi/releases — estrutura 100% documentada no
  release notes; é a melhor âncora para validar o parser contra um baralho cuja estrutura interna
  é conhecida de antemão (não uma caixa-preta).
- **HSK 3.0** — https://github.com/AnthonyBogetti/HSK-3.0-Vocabulary-Anki-Deck

Baixe o `.apkg` direto da página de releases/repositório (botão "Download" do GitHub), sem
protobuf nem AnkiWeb envolvidos.

## Gerando o caso CORROMPIDO

Precisamos de um arquivo que FALHE de propósito, para provar que `medir.ts` (e o importador por
baixo) reportam o erro por arquivo sem abortar o lote. Trunque uma cópia de qualquer `.apkg` pela
metade:

```bash
# no diretório do corpus, fora do repo
cp japones-core2k.apkg corrompido.apkg
tamanho=$(stat -c%s corrompido.apkg 2>/dev/null || stat -f%z corrompido.apkg)  # linux/mac
metade=$((tamanho / 2))
head -c "$metade" corrompido.apkg > corrompido.apkg.tmp && mv corrompido.apkg.tmp corrompido.apkg
```

No PowerShell (Windows), equivalente com `.NET`:

```powershell
$origem = "japones-core2k.apkg"
$destino = "corrompido.apkg"
$bytes = [System.IO.File]::ReadAllBytes($origem)
$metade = $bytes.Length / 2
[System.IO.File]::WriteAllBytes($destino, $bytes[0..($metade - 1)])
```

Um zip truncado pela metade não fecha (falta o diretório central do ZIP no fim do arquivo) — é
exatamente o tipo de corrupção que `lerApkg` precisa recusar com mensagem clara, e não travar
o processo tentando.

## Gerando o caso `.txt`

O Anki exporta notas como texto (tabulação, ponto-e-vírgula ou vírgula como separador) pelo menu
`Notes > Export Notes... > Notes in Plain Text`. Alternativa sem abrir o Anki: qualquer planilha
de vocabulário (palavra, tradução, frase) salva como `.txt` separado por tabulação já serve —
é exatamente o formato que `lerTextoAnki` (`server/import/anki.ts`) lê.

Exemplo mínimo (`texto-exportado.txt`, separado por tabulação):

```
front	back	example
house	casa	I live in a big house.
run	correr	She likes to run every morning.
```
