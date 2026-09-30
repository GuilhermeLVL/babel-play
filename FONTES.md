# Fontes dos dados embutidos

Este arquivo existe para cumprir as licenças do material que o Babel Play distribui dentro do
aplicativo. Não é decorativo: duas das fontes abaixo EXIGEM atribuição, e uma delas exige nomear
cada pessoa que contribuiu.

## Vocabulário e níveis CEFR — `src/data/trilha/en.json`

- **CEFR-J Vocabulary Profile 1.5** — Tono Laboratory, Tokyo University of Foreign Studies.
  Níveis A1–B2. <https://www.cefr-j.org/download.html>
- **Octanove Vocabulary Profile C1/C2 1.0** — níveis C1 e C2.
  <https://github.com/openlanguageprofiles/olp-en-cefrj>

## Traduções palavra a palavra

- **Wikidata Lexemes** — licença **CC0** (domínio público), sem exigência de atribuição.
  <https://www.wikidata.org/wiki/Wikidata:Lexicographical_data>
- **Wikcionário em português**, via Wiktextract/kaikki — licença **CC BY-SA 3.0**.
  <https://kaikki.org/> · <https://pt.wiktionary.org/>

Todo par palavra↔tradução passou por validação de **ida e volta**: a entrada portuguesa da tradução
precisa listar a palavra inglesa entre as traduções dela. Sem isso, `body` virava "morto" e
`story` virava "andar" — sentidos raros escolhidos como principais.

## Glosas por par e dicionário do toque — `public/glosas/<xx>-pt.json`

Quinze pares (ar, de, es, fr, he, hi, it, ja, ko, nl, pl, ru, sv, tr, zh → pt). Cada arquivo traz
as glosas das palavras da trilha, o dicionário do toque em palavra (até 10 mil lemas mais
frequentes com glosa) e o mapa `formas` (forma flexionada → lema). Regerados em **2026-09-28**
com `scripts/trilha/gerar.mjs <xx> --so-glosas --dicionario=10000`, sem mexer na trilha publicada.

- **Wikcionário em português**, extrato do Wiktextract publicado no kaikki.org em **2026-09-25**
  (`pt-extract.jsonl.gz`) — licença **CC BY-SA**. É a fonte da maior parte das glosas.
  <https://kaikki.org/dictionary/downloads/pt/pt-extract.jsonl.gz> · <https://pt.wiktionary.org/>
  Citação do Wiktextract: Tatu Ylonen, "Wiktextract: Wiktionary as Machine-Readable Structured
  Data", LREC 2022, pp. 1317–1325.
- **Wikidata Lexemes** — **CC0**, consultado pelo SPARQL em 2026-09-28: pares por `P5137` (com
  prioridade sobre o Wikcionário) e formas → lema.
- **FrequencyWords** (hermitdave, dados OpenSubtitles, CC BY-SA 4.0) — só a ORDEM dos lemas.
- As `frases` traduzidas de cada arquivo vêm do Tatoeba (CC BY 2.0 FR) e foram conservadas da
  geração anterior.

Diferente do inglês, estes pares **não** passam pela ida e volta. E glosa fora da escrita latina é
descartada: o Wikidata tem lexemas "portugueses" em aljamiado (português em letra árabe), e a
geração anterior publicava 113 deles (`casa` → `كَاجَ`). Nesses casos vale a glosa do Wikcionário.

## Frases de exemplo — **Tatoeba**, licença **CC BY 2.0 FR**

As frases inglesas e as traduções portuguesas vêm do [Tatoeba](https://tatoeba.org), sob
[CC BY 2.0 FR](https://creativecommons.org/licenses/by/2.0/fr/).

Cobertura: **2552 de 2784** palavras têm frase (frases de 5 a 12 palavras, escolhida a
mais curta que contém a palavra e possui tradução portuguesa).

A licença exige creditar os autores. Abaixo estão os **443 usuários do Tatoeba** que
escreveram as frases embutidas — inglesas e portuguesas:

`_undertoad`, `aandrusiak`, `acbarbosa`, `acell`, `Adelpa`, `adiante19`, `adjusting`, `adl`, `Advanced`, `Aeetlrcreejl`, `aikawa`, `Airvian`, `ajdavidl`, `ajje`, `aka_aj`, `akilez`, `al_ex_an_der`, `AlanF_US`, `alec`, `alexjmota`, `alexmarcelo`, `alexmaur`, `Alkrasnov`, `alphafour`, `alvations`, `Amastan`, `annewate`, `AnneWy`, `anonym`, `anthrax26`, `Antoniocjf`, `Antrobos`, `apglopez`, `arademaker`, `araneo`, `arihato`, `arnxy20`, `arthurhh`, `AsliAbbasi`, `asuz`, `AutoBot`, `autuno`, `auxitt`, `azcor`, `azulhana`, `Babelball`, `Balamax`, `bapouy`, `bart`, `bekindtoall`, `belgavox`, `Benzeno`, `BettoBr`, `beyzanurkngr01`, `bill`, `Bing05`, `blay_paul`, `Blaz`, `bluepie88`, `BranTheOliver`, `Brasiliense`, `brauliobezerra`, `BraveSentry`, `Bruno_Lopes`, `bsc2015`, `bufo`, `Cainntear`, `calebante`, `Cangarejo`, `carlosalberto`, `carloseperola`, `CarolCavalcanti5`, `CarpeLanam`, `Castro5432`, `cathrynm`, `Catriona`, `CC`, `CH`, `chaule3`, `Chevere33`, `Cithara`, `CK`, `Clavain`, `CM`, `CN`, `confusedchild02`, `confusion`, `coynejeremy`, `CP`, `CptGuapo`, `cruzedu73`, `CS`, `csmjj`, `Cxom`, `DanaDescalza`, `danepo`, `DanielDaniel`, `daniellebandeira`, `darinmex`, `Dario`, `Dark`, `DarkLinkXXXX`, `DavidDias`, `dawnbreaksopen`, `ddnktr`, `Dejo`, `Delian`, `deniko`, `denisrizzoli`, `dilek`, `dimitris`, `DJ_Saidez`, `djinni74`, `doemaar14`, `Dorenda`, `doswans`, `DouglasLeandro`, `DracoKall`, `Dreamk33`, `Duck`, `dvalmont`, `eadbannon`, `Eccles17`, `edelyn90`, `eirik174`, `Eldad`, `elencw`, `Emersono`, `emory989`, `Enrike100`, `Ergulis`, `erikspen`, `espamatics`, `espjulie`, `fabioedri`, `fcbond`, `fekundulo`, `Fermoselle`, `FeuDRenais`, `FeuDRenais2`, `feyero`, `filipe_s`, `fishda`, `Flargus`, `Flarioca`, `flavio78`, `flaviodesousa`, `freddy1`, `frpzzd`, `GeeZ`, `gin`, `gleydin`, `Globetrotter`, `gobr`, `goksun`, `Gold`, `GPHemsley`, `gracehero`, `grindeldore`, `guavalava`, `Gulliver`, `Gustavo`, `Gyuri`, `HakeemEvrenoglu`, `halfb1t`, `Hautis`, `hayastan`, `hecko`, `helmfer`, `heo598`, `hiroy`, `hitalos`, `HMancuso`, `human600`, `hunzerf`, `Huskion`, `Hybrid`, `ianna`, `iart61`, `igor__kopschinski`, `ilayde`, `inastar`, `inestpereira`, `isaac_andrade`, `iskander`, `iT4LL`, `Ivan24`, `jackcool`, `jakov`, `Jane_Austen`, `JaqueSo`, `jayrod84`, `jdonnarumma`, `jeh`, `jerom`, `Jesse`, `JFMorais`, `JGEN`, `jimkillock`, `jjoao`, `jm`, `joan_LanguageProcess`, `joshodude_1308`, `josivangoncalves`, `JProenca`, `jrom`, `JuniorS`, `jvlopes91`, `Kaleb_Carvalho`, `karloelkebekio`, `kate15`, `katix824`, `Katubeltza`, `kazenochikara`, `kebukebu`, `keira_n`, `KenBr`, `Kevre`, `KimiP`, `kleberlucas`, `korobo4ka`, `kroko`, `kuma`, `kurteago`, `laetitiamg`, `landano`, `LanguageExpert`, `Laudemilson`, `lazymoose`, `Lemmy`, `lenon_perez`, `Leonroz`, `Lepotdeterre`, `lexinternacia`, `leyla`, `lilygilder`, `Lindoula`, `LittleBoy`, `Livonor`, `lohnesinpr`, `Loveless`, `lucas`, `lucasdcs`, `lucasfr`, `lucasjl`, `lucasmg123`, `Luciferous`, `Luciosp`, `Luigi`, `Luk3`, `lukaszpp`, `Lumi`, `Lumi_alt`, `Luornu`, `maaster`, `MacGyver`, `magnificentgoddess`, `magog2309`, `mailohilohi`, `malafaya`, `mamat`, `Manfredo`, `marcelostockle`, `marciom`, `marco87`, `marcospcruz`, `marcusps`, `MarlonX19`, `Martha`, `martins`, `marvinibahs`, `Matheus`, `mayok`, `Mecamute`, `meerkat`, `megamanenm`, `meirad`, `Melzar708`, `mervert1`, `MethodGT`, `Miktsoanit`, `minshirui`, `Mofli`, `moman`, `monahxo`, `mookeee`, `Mouseneb`, `MrJuice`, `mrt6`, `Muelisto`, `MUIRIEL`, `muitoazul`, `muriloricci`, `nancy`, `naXa`, `neilgrey`, `neron`, `nickyeow`, `Nicolas73`, `nmsalgueiro`, `nonong`, `Nordland`, `nowasky`, `Nuel`, `nurendra`, `Nylez`, `Objectivesea`, `oksigeno`, `oleckramo`, `Olya`, `omniglotman`, `orbpic`, `orcrist`, `oruam`, `OsoHombre`, `papabear`, `parheliu`, `Parmeet`, `patgfisher`, `patlima`, `paula_guisard`, `PaulLambeth`, `paulomiziara`, `pedrolima`, `pejcinovick`, `PeterUKBR`, `pguerrajr`, `piksea`, `piterkeo`, `pne`, `POLIGLOTA`, `PvtMarc`, `pysmatic`, `quoctrong018`, `rafael_cs`, `rafael8243`, `raghebaraby`, `randomdude`, `rekoowa`, `rftg`, `Ricardo14`, `riccioberto`, `Richom`, `rileyphone`, `RJH`, `RobinvanderVliet`, `RochaAr`, `roger_rf`, `RoyalBee`, `ruj`, `Rujo`, `rul`, `saasmath`, `sabretou`, `sacredceltic`, `Sadness`, `saeb`, `satsu`, `Sbgodin`, `Scott`, `sctld`, `sergiomelo`, `Serhiy`, `shanghainese`, `sharptoothed`, `shekitten`, `Shishir`, `shortiiboy`, `Silfarle`, `Sistemas`, `Sitko`, `sixtynine`, `sjaelsamlaren`, `Sladey`, `Sleekkat`, `Solana`, `Solid_Rock`, `soliloquist`, `Source_VOA`, `Spamster`, `spockofvulcan`, `sugoi`, `sundown`, `superbolo`, `supermarinete`, `supplementfacts`, `Swift`, `szaby78`, `Tamy`, `Tangobango`, `tatiara6`, `tatimonte`, `TaTu`, `thalitanjos`, `The_World_Factbook`, `Theocracy`, `thiago_nascimentodf`, `tinacalysto`, `tinowls`, `Tlustulimu`, `ToinhoAlam`, `ToxicFriu`, `TRANG`, `trochal`, `tulio`, `U2FS`, `Ueltatoeba2014`, `ulyssemc1`, `une_monica`, `user`, `User75171`, `User82312`, `Verdastelo`, `VH`, `vicsantos`, `victorhugosilvaspbr`, `VilhelmsPort`, `Vinks`, `Vitie`, `vitoreiji`, `vlavinia77`, `Vortarulo`, `vxern`, `Wagner1994`, `weihaiping`, `Welton`, `WestofEden`, `whitefishglobal`, `whykels`, `witbrock`, `Wolgoon`, `wreka`, `XenoKat`, `xtofu80`, `XY`, `yinp`, `yosia49`, `Zaghawa`, `zhouj1955`, `Zifre`, `zmah47jr`, `zumley`, `zvaigzne`

### Uma limitação medida, para não prometer o que não dá

O jogo **Caça-conectores** continua BLOQUEADO no modo trilha, e não é por falta de frases: das
2552 frases embutidas, apenas **116 (4,5%)** contêm algum conector da lista do jogo. As frases do
Tatoeba são curtas por natureza (a média fica perto de 5,5 palavras) e frase curta raramente traz
"however" ou "although". Um jogo de conectores sobre 116 palavras cairia sempre nas mesmas — pior
que o bloqueio honesto.

## Tradução português → inglês no aparelho — **Bergamot**, licença **MPL-2.0**

Desde o A9b (29/09/2026) o app serve, do próprio domínio (`/modelos/bergamot/`), o motor e o modelo
que traduzem pt→en no navegador. Os dois são **MPL-2.0**, e a licença pede que quem recebe o
executável saiba onde está o código-fonte — é o que esta seção e o `LEIA-ME.txt` servido junto fazem.

- **Motor**: `@browsermt/bergamot-translator` **0.4.9** (o Marian compilado para WASM, o mesmo do
  Firefox Translations) — <https://github.com/browsermt/bergamot-translator>. O `.wasm` vai sem
  mudança; a cola do Emscripten (`bergamot-translator-worker.js`) vai embrulhada como módulo ES, com
  UMA linha trocada (`global_object` passa de `this` a `globalThis`) e o aviso da MPL no topo
  (`scripts/baixar-modelos-bergamot.mjs`, `colaComoModulo`).
- **Modelo pt→en**: Mozilla translations, execução `retrain_hr_drxrs5bGSsOWvfK9lyZISw`, arquitetura
  `base-memory`, do registro público <https://mozilla.github.io/translations/model-registry/>
  (código e licença em <https://github.com/mozilla/translations>: "The model files are distributed
  under the MPL 2.0 license"). Os três arquivos (`model`, `lex`, `vocab`) vão sem mudança, com o
  sha256 conferido no build e de novo no navegador (`src/gateway/adapters/modelosDoBergamot.json`).

Por que só pt→en: a bancada da Etapa 5 (`docs/auditoria/eval/bancada-2026-09-etapa5.md`) mediu COMET
+0,028 (significativo) sobre o opus-mt nesse sentido; no en→pt o modelo da Mozilla escreve português
de Portugal e o gold de conversa piora, então ali fica o opus-mt (Helsinki-NLP, CC-BY-4.0).
