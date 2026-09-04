# G0 — Pesquisa: Motor de Ingestão e Ludificação de Baralhos Anki

> Gate G0 do programa aprovado em plano (01/09/2026). Entrega: mapa do sistema (§0), cinco frentes
> de pesquisa com fontes (§1–§5) e as implicações de engenharia (§6). Nada aqui é código; o único
> código desta fase foi o bugfix de proveniência declarado no plano (commit `a524f56`).

## §0 — Mapa do sistema (o que o brief mandou respeitar, dito como é)

Levantado por três exploradores independentes + conferência direta das linhas decisivas.

### Montagem de rodada — cliente, não servidor

`montarRodada(jogo, semente?, apenas?, evitarTambem?)` é uma closure no componente React
(`src/components/views/Play.tsx:482-751`), com 8 ramos para 9 jogos. O servidor só **ordena o
pool** (`GET /api/vocab/para-jogo`, limite 200, `src/core/minigames/composicao.ts:262`) com
fallback local no catch; a invariante está escrita no código: *"a composição ORDENA e PRIORIZA;
ela nunca ADICIONA"* (`composicao.ts:340-350`). Prévia passa exclusivamente por
`previaSegura`/`REVELAVEL`; o fim de rodada grava SRS via `reviewCard`, gateado por
`MINIGAMES[jogo].writesSrs`.

### O "adapter" real

Não existe interface `Adapter`: são 6 builders ad hoc + 2 ramos inline e 7 tipos de rodada. O
contrato formal são **duas tabelas exaustivas por tipo** — `MINIGAMES`
(`src/core/minigames/types.ts:121-139`: minItems/maxItems/requiresTranslation/writesSrs/
aceitaPalavraFalada) e `REVELAVEL` (`revelavel.ts:71-81`) — um 10º jogo **não compila** sem se
declarar nelas. Costuras comuns: `estadoDeCadaJogo` (gate), `previaSegura` (funil), e
`ItemOutcome`/`RoundReport` (saída única).

### Fonte e o filtro por origem que JÁ existe

`FonteId = 'baralho'|'sessao'|'trilha'|'dificeis'`, partição exclusiva (`source.ts:23-42,84-97`);
cartão Anki hoje cai em `'baralho'` (`!c.daTrilha`). `PedidoDeComposicao.fonte` já carrega
`ref?: string|null` (`composicao.ts:167`) e `selecionarParaJogo` já filtra por origem via `EXISTS`
em `vocab_occurrences (origin_kind, origin_ref)` com índice pronto (`vocab.ts:473-486`;
`schema.ts:167,177`). `FonteId` não pode ser renomeado (`exercise_results.origem` deriva dele).

### Campos mínimos por jogo

| Jogo | Exige | Observações |
|---|---|---|
| memory / wordsearch / blitz | `word` + tradução (blitz aceita frase→cloze) + `srcLang` | passam por `avaliarCartao` (`quality.ts:182-214`); wordsearch normaliza A–Z |
| termo (solo/dueto/quarteto) | palavra 4–6 letras, sem hífen/espaço; mesmo comprimento e pista única por degrau | `LETRAS_POR_FAIXA`, escada 1+2+4 |
| scramble / escuta / ditado / conectores / karaokê | **falas** (frases de gravação) | escuta/ditado/karaokê exigem áudio real (`endMs>startMs`) ou, na trilha, TTS (`startMs:0,endMs:0` é o sinal); conectores só en/pt/es |

`MinigameItem.lang` é escrito mas ignorado pelos 3 jogos de palavra que o recebem. `vocab_cards`
já tem `clozePrompt/clozeAnswer` e `selecionarParaJogo` já os devolve — cloze do Anki tem destino
pronto.

### SRS

FSRS-5 de implementação própria, isomórfica (`src/core/learning/scheduler.ts:68-154`: 19 pesos
default, damping de dificuldade), agendando de verdade em `vocabRepo.review()`
(`server/db/repositories/vocab.ts:556-596`) + `review_logs`. Desvios declarados: Again→`dueAt=now`;
sem fuzz/learning steps/otimizador. **Cartão novo nasce vencido** (`vocab.ts:216`) — 3.000 notas
de uma vez seriam 3.000 vencidos no mesmo instante; daí o teto cliente de 300.

### Banco e migrações

`@libsql/client` + drizzle, 20 tabelas (`server/db/schema.ts`); migrations rodam no boot com
topologia "um nó migra, outros servem" (`manutencao.ts:42-54`); **não existe rollback** (zero
`down`; rebuilds destrutivos são só-de-ida). `vocab_cards`: SRS completo, `session_id` FK,
`norm_key` com índice único parcial (`WHERE deleted_at IS NULL`) que é a base do upsert.
`origin_kind='anki'` estava documentado no schema e nunca era escrito — corrigido no Passo 0
(`a524f56`). **Não existem** tabelas de baralho, mídia, notas Anki ou jobs.

### Mídia e cota

Áudio de sessão em `AUDIO_DIR` via seam filesystem|S3-R2 (`server/lib/armazenamento.ts:182-194`),
nome `${sessionId}.${ext}`, **sem hash/dedupe de conteúdo em lugar nenhum**. Cota por plano
(free 500 MB · essencial 1 GB · pro 5 GB) com reserva atômica que degrada fechado
(`storageQuota.ts`) — mas cobre **só** áudio de sessão; `/api/import/anki` e `/api/vocab/bulk-add`
estão fora da cota por decisão declarada cuja premissa é "nada chega ao disco"
(`routes/import.ts:37-40`). `somarBytesEmDisco` só itera sessões — mídia Anki em disco não seria
contada hoje.

### Importador atual — capacidades e lacunas

A rota `POST /api/import/anki` **só lê e devolve** (nada persiste); a gravação é o cliente chamando
`bulk-add` (lote ≤500, validação do lote inteiro). O parser (`server/import/anki.ts`) já faz:
JSZip em fluxo com teto de expansão 300 MB (anti zip-bomba, medido 1028:1), **`.anki21b` com zstd
nativo do Node** e segundo teto `maxOutputLength`, preferência `anki21b→anki21→anki2`, nomes de
campo da tabela `fields` → `col.models` → posicional, mapeamento por nome com prioridade
(`PADRAO_FRENTE/VERSO`), `.txt/.csv/.tsv`. **Lacunas**: o mapa `media` nunca é aberto (só um
booleano `temMidia`) e as referências `[sound:]`/`<img>` são **apagadas** do texto; sem cloze,
`cards`, `decks`, `notetypes.name`, `templates`; `SELECT notes` sem LIMIT; sem job/fila (não há
scheduler; o padrão da casa é reconciliação oportunista); tags lidas e descartadas pelo cliente.
E o cliente **descarta a mídia antes do upload** (`soAColecao`, 214 MB→630 KB): no caminho feliz
ela nem chega ao servidor.

### Telas com embrião pronto

Importar = `BaralhoAnki.tsx` (upload→prévia→gravar, teto 300, saldo por motivo); Mapeador = o
mapeamento por nome já roda no servidor e `LeituraAnki.campos` já viaja ao cliente (falta só a UI
de override); Saúde = `CuradoriaBaralho.tsx` sobre `triarCartoes`/`contarPorMotivo`; molde de
lista para Biblioteca › Baralhos = `CatalogoDePalavras.tsx` (busca server-side, cursor +
virtualização, filtros, 3 estados). Não há conceito de "baralho" no esquema — essa é a migração
central do programa.

---

## §1 — Formato de arquivo: `.apkg` e `.colpkg` hoje

Confirmado na fonte primária — o código do Anki (`rslib/src/import_export/package/meta.rs` e
`proto/anki/import_export.proto`) — mais o manual oficial e engenharia reversa da comunidade.

### As três variantes, e como detectá-las

O arquivo `meta` (protobuf `PackageMetadata`) dentro do zip declara a versão; **na ausência dele**,
o próprio Anki cai no fallback por presença de arquivo — exatamente a cadeia que nosso parser já
usa:

```proto
enum Version { VERSION_UNKNOWN = 0; VERSION_LEGACY_1 = 1; VERSION_LEGACY_2 = 2; VERSION_LATEST = 3; }
```

| Variante | Coleção | Mapa `media` | Mídia numerada | Compressão |
|---|---|---|---|---|
| Legacy 1 | `collection.anki2` | JSON `{"0":"nome.mp3"}` | crua | nenhuma |
| Legacy 2 | `collection.anki21` (+ `collection.anki2` de cortesia) | JSON | crua | nenhuma |
| **Latest** | **`collection.anki21b`** (schema v18) | **protobuf `MediaEntries`** | **cada arquivo numerado é zstd** | zstd |

- **A armadilha do `collection.anki2` falso é real e documentada**: no export moderno, o
  `collection.anki2` presente é um *stub* com a mensagem "please update" para clientes antigos
  ([fórum oficial](https://forums.ankiweb.net/t/collection-anki2-in-exported-apkg-file/44380);
  [meta.rs](https://github.com/ankitects/anki/blob/main/rslib/src/import_export/package/meta.rs)).
  Nossa ordem de preferência `anki21b→anki21→anki2` já a evita por construção.
- O export moderno é o padrão; a checkbox **"Support older Anki versions (slower/larger files)"**
  gera o formato legado ([manual — Exporting](https://docs.ankiweb.net/exporting.html)).
- **Detalhe novo para nós**: no formato Latest, **os arquivos de mídia numerados também são
  zstd** — extrair mídia exige descompressão por arquivo, não só da coleção
  ([análise do formato](https://eikowagenknecht.com/posts/understanding-the-anki-apkg-format/);
  [genanki#100](https://github.com/kerrickstaley/genanki/issues/100)).
- O mapa de mídia moderno é um **presente para a fase de mídia (G3)** — cada entrada traz nome,
  tamanho **e sha1**:

```proto
message MediaEntries { message MediaEntry {
  string name = 1; uint32 size = 2; bytes sha1 = 3; optional uint32 legacy_zip_filename = 255;
} repeated MediaEntry entries = 1; }
```

  O índice da entrada na lista ↔ o nome numérico no zip
  ([import_export.proto](https://github.com/ankitects/anki/blob/main/proto/anki/import_export.proto)).
  A negociação de upload por hash planejada no G3 pode partir dos sha1 do próprio pacote (o
  servidor **recalcula** de qualquer forma — hash de cliente nunca é autoridade).
- Estrutura interna relevante: `notes` (`flds` separado por `0x1f`, `guid` de sync, `mid`, `sfld`
  de ordenação, `csum` anti-duplicata, `tags` por espaço), `cards` (queue/type/due/ivl/factor), e
  no schema v18 as tabelas `notetypes`/`fields`/`templates`/`decks` substituem os JSON
  `col.models`/`col.decks`
  ([wiki AnkiDroid — Database Structure](https://github.com/ankidroid/Anki-Android/wiki/Database-Structure)).
  Nosso parser já lê `fields` com fallback para `col.models` — faltam `notetypes.name`,
  `templates`, `decks` (hierarquia por `::`) e `cards`.

### `.colpkg`

É a **coleção inteira** (com scheduling e configurações); importá-lo no Anki **substitui** a
coleção ([manual](https://docs.ankiweb.net/exporting.html)). Estrutura de zip idêntica à do apkg
moderno. **Decisão do G0**: aceitar `.colpkg` **lendo-o como apkg** (mesmas tabelas, mesmo código;
muda a extensão e a semântica "tudo, não um deck" — a UI lista todos os decks internos e avisa).
Restauração de backup completo NÃO é escopo: somos um importador de conteúdo, não um cliente Anki.

### Onde vive o estado FSRS do Anki moderno (alimenta as questões 1–2 do brief)

O Anki atual guarda estabilidade, dificuldade e decay por cartão **no campo `cards.data`** (JSON),
não em custom data de add-on
([fsrs4anki-helper](https://github.com/open-spaced-repetition/fsrs4anki-helper);
[PR de integração #2654](https://github.com/ankitects/anki/pull/2654)). Consequência: um `.apkg`
exportado **com scheduling** carrega o estado FSRS legível — "importar preservando a memória" e a
inversa "exportar progresso de volta" são tecnicamente viáveis. Ambas ficam registradas como
**porta aberta** (ADR no G1), não como escopo — mas a §3 mostra que preservar scheduling é uma
das maiores dores de troca da comunidade, então a porta vale ouro.

### Mídia e marcações no HTML dos campos

Referências que o parser precisa **preservar** (hoje apaga): `[sound:arquivo.mp3]` (que pode
aparecer em **qualquer** campo, não só nos chamados Audio — ver §4), `<img src="...">`, cloze
`{{c1::texto::dica}}` (múltiplos `c1/c2/c3` na mesma nota geram vários cartões), furigana
`palavra[leitura]` (o formato armazenado; `<ruby>` é renderização de template, raro no campo), e
tags de TTS `{{tts ...}}` — que indicam "não há áudio gravado, o cliente fala", mapeando direto
para o nosso sinal `startMs:0,endMs:0`.

## §2 — Ecossistema e bibliotecas: por que seguimos com o parser próprio (embrião do ADR-1)

**Node/npm** ([busca](https://www.npmjs.com/search?q=keywords%3Aanki)):
[`anki-apkg-parser`](https://github.com/74Genesis/anki-apkg-parser) (atualizado fev/2026, depende
de `sqlite`), [`anki-reader`](https://github.com/ewei068/anki-reader) (TS, node/bun/browser),
[`apkg-reader`](https://socket.dev/npm/package/apkg-reader),
[`@seangenabe/apkg`](https://www.npmjs.com/package/@seangenabe/apkg). Nenhuma cobre com clareza o
trio anki21b + mídia-zstd + `MediaEntries` protobuf; adotá-las trocaria um parser **já testado com
baralho real e com tetos anti-bomba medidos** por dependência de manutenção incerta.

**Python**: o pacote oficial `anki` lê tudo (é o próprio app), mas traria um runtime Python a um
stack TS; `genanki` é write-only; `ankisync2`/`ankipandas` cobrem os formatos legados.

**Zstd**: já usamos o nativo do Node (`zlib.zstdDecompressSync`), disponível desde **v22.15.0 /
v23.8.0** ([release notes](https://nodejs.org/en/blog/release/v23.8.0);
[PR #52100](https://github.com/nodejs/node/pull/52100)) — vira requisito de versão de Node
documentado no deploy. **Protobuf**: `MediaEntries` tem 4 campos; decodificar com `protobufjs` ou
um leitor mínimo dedicado — decisão de implementação no G2, não de arquitetura.

**AnkiConnect**: add-on que abre um REST local em `localhost:8765` **só com o Anki desktop
aberto** ([repo](https://git.sr.ht/~foosoft/anki-connect)); não serve como caminho de importação
de um app web. Anotado como integração opcional futura ("puxar direto do meu Anki"), fora de
escopo.

**AnkiWeb**: **não há API pública nem documentada**
([fórum oficial](https://forums.ankiweb.net/t/is-there-any-plan-to-expose-rest-api-for-anki/43106));
o caminho universal é o upload do `.apkg` pelo usuário — exatamente o que temos.

**Decisão fundamentada**: estender o parser TS próprio. Ele já lê anki21b/zstd e `fields`, mapeia
campos por nome e sobreviveu a um baralho real de 214 MB; as lacunas (mídia, cloze, decks,
notetypes, paginação) são incrementos sobre código testado, não uma reescrita.

## §3 — Necessidades da comunidade (evidência, não achismo)

Levantamento com fontes linkadas; onde a evidência é secundária/agregadora, está dito.

| Hipótese | Veredito | Evidência-âncora |
|---|---|---|
| Tédio/burnout/"review hell" | **VALIDADA** | ["Anki burnout" (2026)](https://immit.co/blog/anki-burnout-why-it-happens-and-the-fix-that-actually-lasts-2026); ["Why 80% quit SRS"](https://my-senpai.com/insights/ankiburnout.html); reviews de add-ons: "makes anki less boring" ([Pokemanki](https://ankiweb.net/shared/info/1677779223)) |
| Campos bagunçados de decks de terceiros | **VALIDADA** | [FAQ oficial sobre note type alterado quebrar updates](https://faqs.ankiweb.net/some-updates-were-ignored-because-the-note-type-has-changed.html); [fórum](https://forums.ankiweb.net/t/deck-sharing-and-changing-note-types/41355); existe serviço pago (AnkiHub) só para gerir isso |
| Mídia quebrada em decks compartilhados | **VALIDADA** | [FAQ oficial dedicada](https://faqs.ankiweb.net/a-shared-deck-is-not-showing-images-or-playing-audio.html); threads recorrentes ([ex.](https://forums.ankiweb.net/t/media-files-missing-in-shared-deck/51544)); causas incluem case-sensitivity |
| Decks gigantes intimidam | **VALIDADA (evidência média)** | [fórum](https://forums.ankiweb.net/t/overwhelming-amount-of-available-cards-in-deck/1149); autores publicam fatias 1K/2K/3K "se 10.000 soa esmagador" |
| Falta produção/pronúncia | **VALIDADA (evidência secundária)** | consenso "Anki é manutenção de memória" ([síntese](https://studycardsai.com/blog/best-way-to-use-anki-for-language-learning-reddit)); a demanda aparece como migração para outras ferramentas, não como feature request |
| Fricção mobile com áudio | **VALIDADA** | [AnkiDroid #12992](https://github.com/ankidroid/Anki-Android/issues/12992); [Opus não toca](https://forums.ankiweb.net/t/solved-ankidroid-audio-files-not-playing-reason-opus-format/69182) |
| Social/streaks | **PARCIAL** | atendida por add-ons ([Leaderboard](https://shigeyukey.github.io/shige-addons-wiki/anki-leaderboard.html)); nicho — retenção, não aquisição |
| Outras dores achadas | — | **medo de perder o scheduling ao trocar de app** ([guia de migração](https://kachika.app/en/blog/how-to-switch-from-anki/); [ferramenta dedicada](https://github.com/kaCVanime/anki-transfer-scheduling)); ansiedade com FSRS ([ex.](https://forums.ankiweb.net/t/my-fsrs-algorithm-is-completely-messed-up/56692)) |

**Demanda por "jogar" com decks**: comprovada por consumo — add-ons de gamificação populares
([Ankimon](https://github.com/Unlucky-Life/ankimon) ~15k downloads;
[Pokemanki](https://shigeyukey.github.io/shige-addons-wiki/pokemanki-gold.html) ~30k). Apps que
importam .apkg existem ([Noji/ex-Anki Pro](https://help.noji.io/en/articles/9654023-upload-an-anki-deck-file))
e a lição reputacional é dura: **quem importa apkg e entrega menos que o Anki é atacado como
"clone pago"** ([reviews](https://justuseapp.com/en/app/1573585542/anki-pro-study-flash-cards/reviews));
quem entrega o que o Anki não faz (jogo, produção, mídia consertada) tem espaço.

**Implicações de produto** (as 6 decisivas): sessões curtas sem contador de backlog; mapeamento
semântico de campos com correção em 1 tela; auditoria de mídia no ingest com fallback TTS;
transcodificação de mídia para formato universal; fatiar decks grandes em trilhas progressivas
(nunca "9.847 restantes" — nossa ativação em lotes de ≤300 é exatamente isso); posicionar como
**complemento** ("jogue seus decks"), nunca substituto do Anki.

## §4 — Arquétipos de baralhos e os priors do mapeador

Catálogo completo com fontes no levantamento da frente; síntese do que vira requisito:

**Arquétipos confirmados** (com exemplares e estrutura): Core 2k/6k (campos hifenizados
`Vocabulary-*`/`Sentence-*`, furigana `palavra[leitura]`); **Kaishi 1.5k** (estrutura 100%
documentada no [README](https://github.com/donkuri/kaishi): `Word`, `Word Reading`,
`Word Meaning`, `Word Furigana`, `Word Audio`, `Sentence`, `Sentence Meaning`, …, `Picture` —
a melhor âncora de corpus); Tango N5/N4 (sentença-alvo); Refold JP1K (comercial, estrutura não
pública); Migaku/mpvacious/asbplayer/Yomitan (mineração moderna: `SentKanji`/`SentEng`/
`SentAudio`/`Image`, papéis fixos mapeáveis); subs2srs clássico
(`Tag, Sequence, Audio, Snapshot, Expression, Meaning` — [docs](https://subs2srs.sourceforge.net/));
HSK ([ex. id 1081958254](https://ankiweb.net/shared/info/1081958254): `Pinyin`, `Zhuyin`,
`Traditional`, `Simplified`, `English` + áudio/imagem); europeus de frequência
([SpanishDict 5000](https://ankiweb.net/shared/info/800457400): `word_to_translate`,
`definition_html`, `source_sentences`…); imagem-palavra Fluent Forever 625; Basic `Front`/`Back`;
Cloze nativo (`Text` com `{{cN::…}}` + `Extra`); TTS gerado (AwesomeTTS/HyperTTS); e o
**4000 Essential English Words** que já parseamos (dois note types, `№`/`IMG` na frente — a prova
medida de por que posição fixa falha).

**Tabela de priors** (nomes observados por papel — entra pré-cadastrada no mapeador do G1):

| Papel | Nomes observados |
|---|---|
| palavra-alvo | `Word`, `Expression`¹, `Vocabulary-Kanji`, `word_to_translate`, `Simplified`/`Hanzi`, `Front`, `Target Word` |
| leitura | `Reading`, `Word Reading`, `Vocabulary-Furigana`/`-Kana`, `Pinyin`/`Zhuyin`, `Transcription`/`IPA` |
| significado | `Meaning`, `Word Meaning`, `Vocabulary-English`, `Definition`, `Glossary`, `Back` |
| frase | `Sentence`, `Expression`¹, `SentKanji`, `Example`, `source_sentences` |
| tradução da frase | `Sentence Meaning`, `SentEng`, `Sentence-English`, `target_sentences` |
| áudio da palavra | `Word Audio`, `Vocabulary-Audio`, `Sound`, `Audio` |
| áudio da frase | `Sentence Audio`, `SentAudio`, `Sentence-Audio` |
| imagem | `Picture`, `Image`, `Snapshot`, `IMG` |
| cloze | `Text` (+`Extra`), `Sentence-Clozed` |
| metadados | `Frequency`, `Notes`, `Pitch Accent`, `part_of_speech`, `№`, `Source`, `URL` |

¹ `Expression` é **ambíguo**: palavra em decks de vocabulário, frase em subs2srs — o mapeador
precisa desambiguar por conteúdo (comprimento médio, presença de espaço), não só por nome.

**Regras derivadas**: (a) compostos usam espaço, hífen OU CamelCase (`Word Audio` /
`Sentence-Audio` / `SentAudio`) — normalizar antes de casar; (b) `[sound:...]` aparece em
**qualquer** campo; (c) prefixos `Word*`/`Vocabulary-*` vs `Sentence-*`/`Sent*` separam os dois
níveis com alta confiança; (d) furigana armazenada é `palavra[leitura]`, não `<ruby>`.

## §5 — Jurídico e ético

*Pesquisa informativa, não aconselhamento jurídico formal. FATO = citável com fonte;
INTERPRETAÇÃO = leitura nossa, marcada como tal.*

**Licença dos decks compartilhados.** [FATO] Os [Termos do AnkiWeb](https://ankiweb.net/account/terms)
embutem uma "Shared Deck License": quem baixa recebe licença permanente e mundial **para os seus
estudos pessoais**; direitos extras (redistribuir, modificar publicamente) só se o autor os
declarar. Na prática quase nenhum deck declara licença (verificado nas páginas do corpus);
exceções existem ([deck Refold com word list Apache 2.0](https://ankiweb.net/shared/info/216385733);
[Ultimate Geography, open-source com dados CC BY-SA](https://github.com/anki-geo/ultimate-geography)).
[INTERPRETAÇÃO] A licença autoriza **o usuário** a estudar — não autoriza **o app** a redistribuir.
Transformar o deck em jogos *para o próprio importador* é compatível com "personal studies";
qualquer distribuição a terceiros não é, salvo licença explícita.

**subs2srs / mídia minerada.** [FATO] Clipes e screenshots de filmes são reprodução de obra
protegida; a comunidade troca "ferramentas, não decks" e o AnkiWeb aplica takedown
([ex.](https://forums.ankiweb.net/t/responding-to-copyright-notice/67771)). [FATO — Brasil] O
art. 19 do Marco Civil (responsabilidade só após ordem judicial) **exclui direito autoral no
§2º** — autoral segue a Lei 9.610/98
([FGV](https://portal.fgv.br/artigos/artigo-19-marco-civil-internet-merece-audiencia-publica);
[Migalhas](https://www.migalhas.com.br/coluna/migalhas-de-protecao-de-dados/343301/responsabilidade-civil-no-ambito-do-marco-civil-da-internet-e-da-lgpd)).
[INTERPRETAÇÃO] Armazenamento privado (o conteúdo só volta a quem enviou) é análogo a cloud
storage; prudente adotar **notice-and-takedown voluntário**. O risco real aparece com exibição
pública, compartilhamento ou indexação.

**Decks famosos são derivados com risco.** [FATO] Os Core 2k/6k/10k derivam do corpus
proprietário iKnow e já saíram do AnkiWeb
([RtKWiki](http://rtkwiki.koohii.com/wiki/Core_10k)); "4000 Essential English Words" é livro da
[Compass Publishing](https://www.compasspub.com/eng/compass/level_view.asp?h_seq=2249) e o deck
id 645460916 está **indisponível hoje** (verificado 01/09/2026 — consistente com takedown, causa
não confirmável). [INTERPRETAÇÃO] Confirma a assimetria: **aceitar upload** (cópia privada do
usuário) ≠ **semear galeria/catálogo** (reprodução pública nossa). Nunca pré-carregar decks
famosos como catálogo do app.

**Regra de partida validada** ("importado é privado do importador; compartilhar é feature separada
com trilha própria") — nenhum contraexemplo que a inviabilize. Três condicionantes: (a) autoral
fora do escudo do art. 19 → takedown voluntário; (b) **dedupe de mídia entre usuários pode
descaracterizar a cópia privada** (um arquivo servido a muitos ≈ distribuição) — ratifica a
decisão de dedupe **por usuário** já tomada no plano; (c) modo social/multiplayer com conteúdo
importado já é a "feature separada".

**Marca.** [FATO] "Anki" é marca da Ankitects Pty Ltd, com
[política de uso](https://apps.ankiweb.net/) e enforcement real — o app "Anki Pro" virou "Noji"
em 2025 sob pressão de marca. [INTERPRETAÇÃO] Seguro: uso nominativo — "Importar baralho Anki
(.apkg)", "Compatível com Anki®" + disclaimer de não afiliação. Inseguro: "Anki" no nome do
produto, ícone ou loja.

**Corpus de teste — 15 candidatos verificados** (páginas reais, 01/09/2026): cobre JA/ZH/RU/AR +
EN/FR (3 scripts não latinos), um subs2srs-like com 3.234 áudios + 4.688 imagens
([id 2062595919](https://ankiweb.net/shared/info/2062595919)), só-texto, imagem-palavra
([Ultimate Geography](https://ankiweb.net/shared/info/2109889812)), cloze-pesado
([id 1218229865](https://ankiweb.net/shared/info/1218229865)), note types custom
([KanjiDamage](https://ankiweb.net/shared/info/748570187)), um **29.883 notas**
([id 2112246396](https://ankiweb.net/shared/info/2112246396)) e formatos antigo (2015–2018) e
novo (2025–2026). Tabela completa com URLs e licenças no levantamento da frente; mais os âncoras
com download direto do §4 (Kaishi no GitHub releases — estrutura 100% documentada — e HSK 3.0 no
GitHub). **Fluxo de download testado hoje, sem login e sem captcha**: a página é SPA (curl na URL
devolve o shell), mas `GET /svc/shared/item-info?sharedId=<id>` responde anonimamente com um
protobuf contendo o token, e `GET /svc/shared/download-deck/<id>?t=<token>` entrega o `.apkg`.
Para o corpus: baixar uma vez manualmente e guardar **fora do repo** (tamanho + licença) — não
automatizar contra endpoint não documentado, nem redistribuir.

## §6 — Implicações de engenharia (cada achado → restrição/requisito numerado)

| # | Implicação | Origem | Onde morde |
|---|---|---|---|
| R1 | O parser passa a **preservar** `[sound:]`, `<img>`, `{{cN::}}`, furigana `palavra[leitura]` e tags TTS — hoje as apaga; sem isso a medição de mídia do G2 é impossível | §1 | `server/import/anki.ts` (`limparCampo`) |
| R2 | Abrir o mapa `media` nas **duas formas** (JSON legado; protobuf `MediaEntries` no Latest) e descomprimir a **mídia numerada zstd** do formato novo; `sha1`+`size` por entrada alimentam a negociação de upload — o servidor sempre recalcula | §1 | parser + fase de mídia (G3) |
| R3 | Manter a detecção `anki21b→anki21→anki2` (evita o stub "please update" por construção) e passar a ler o `meta` quando presente | §1 | parser |
| R4 | `.colpkg` entra lendo como apkg (mesmas tabelas); a UI avisa "coleção inteira, todos os decks"; restauração de backup NÃO é escopo | §1 | G1 spec |
| R5 | Node **≥22.15** vira requisito documentado de deploy (zstd nativo do zlib) | §2 | `docs/deploy.md` |
| R6 | ADR-1: parser TS próprio, estendido — nenhuma lib npm cobre anki21b + mídia-zstd + protobuf; Python traria runtime novo | §2 | G1 ADRs |
| R7 | Mapeador: normalizar nomes compostos (espaço/hífen/CamelCase) antes de casar; desambiguar `Expression` por conteúdo; procurar `[sound:]` em **qualquer** campo; priors da tabela do §4 pré-cadastrados; hash de perfil sobre nomes normalizados + ordem | §4 | G1 mapeador-e-perfis |
| R8 | Anti-burnout é requisito, não estilo: ativação em lotes ≤300 sem contador de backlog; decks grandes fatiados por subdeck/tag (import parcial) | §3 | G1 acervo-e-ingestao |
| R9 | Auditoria de mídia no ingest ("X áudios faltando, Y imagens") com fallback TTS declarado — a dor nº 1 dos decks compartilhados vira feature; transcodificação para formato universal na fase de mídia | §3 | G1/G3 |
| R10 | `cards.data` carrega o estado FSRS do Anki moderno → importar preservando memória e exportar progresso de volta são **viáveis**; portas abertas em ADR — e o §3 mostra que scheduling é a maior barreira de troca, então a porta tem prioridade pós-programa | §1+§3 | G1 ADRs |
| R11 | Jurídico operacional: conteúdo importado é privado do importador; **nunca** semear catálogo de decks famosos; takedown voluntário; **dedupe de mídia POR USUÁRIO** (global ≈ distribuição); marca só em uso nominativo ("Importar baralho Anki (.apkg)") | §5 | G1 ADRs + telas |
| R12 | Corpus: 15 candidatos verificados + 2 âncoras GitHub; download do AnkiWeb funciona anônimo (2 passos com token); baixar manualmente 1×, guardar fora do repo, só métricas JSON entram | §5 | G2 runner |
| R13 | A régua `pistaUtil` (42 chars/5 palavras) rejeitou 98% de um deck en-en real → **perfil de qualidade por origem** especificado no G1 e calibrado com o corpus no G2 | §0 | `quality.ts` / G1 |
| R14 | Cloze: múltiplos `c1/c2/c3` na mesma nota geram vários cartões → o modelo de projeção precisa prever **1 nota → N itens jogáveis** | §1+§4 | G1 acervo |

---

*Próximo gate: G1 — design + ADRs em 3–4 changes OpenSpec (`acervo-e-ingestao`,
`mapeador-e-perfis`, `midia-e-cota`, `fonte-nos-jogos-e-telas`), só após aprovação deste
relatório.*
