# O app em outros idiomas além do inglês (10/10/2026)

Branch `feat/polimento-movimento`, worktree `C:\Users\Guilh\dev\ei-polimento`. Nada foi commitado.

## O relato do dono e a causa de cada ponto

| Relato                                                              | Causa                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Estado                                                                         |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| "Botei no mandarim no meio da conversa e travou, não funcionou"     | Duas causas somadas, no caminho em que o microfone vai ao Whisper (o modo automático sempre vai; o "Privado" e a nuvem também). (1) `src/gateway/alucinacao.ts:88` tratava como ruído toda palavra sem vogal LATINA; uma frase em chinês, japonês, coreano, árabe, russo ou hindi não tem nenhuma, e a transcrição certa era devolvida vazia. (2) `src/lib/captura/pipelineDeFala.ts:741` anuncia o fim da fala ao intérprete (que fecha o microfone e passa a "Traduzindo…") e, com o final vazio (`:892-900`), apagava o balão e saía sem avisar: a conversa ficava em "Traduzindo…" para sempre, e no automático o microfone não reabria. | Consertado (as duas)                                                           |
| Idem, agravante                                                     | A rota do modelo é decidida uma vez, no início da sessão (`pipelineDeFala.ts`, `rotaDaCaptura`), e só perguntava pelo motor do "Eu falo". No intérprete com inglês de um lado e o microfone contado como "do navegador", a rota saía no Moonshine, que só decodifica inglês.                                                                                                                                                                                                                                                                                                                                                                 | Consertado (`src/lib/captura/idiomasDoModelo.ts`); não provado com modelo real |
| "Não consegui fazer a pronúncia do mandarim sair"                   | Sem voz de chinês no aparelho (Windows sem o pacote), `src/lib/tts.ts` não lê com voz de outro idioma, o que está certo. Mas a tela do intérprete só sabia de "aparelho sem voz nenhuma" (`semVoz`, o Quest): seguia dizendo "Voz do aparelho" e "é lida em voz alta", com "Repetir" e "Parar voz" à mostra. O único aviso era um toast de 5 s, uma vez, sem dizer onde instalar.                                                                                                                                                                                                                                                            | Consertado                                                                     |
| "Nem que fosse escrito em tela em mandarim"                         | A mesma causa (1): a fala em mandarim era descartada antes de chegar à tela, então não havia original nem tradução. Com o reconhecimento do navegador ("Rápido") e tradutor disponível, o texto em chinês aparece: provado em navegador antes de qualquer conserto.                                                                                                                                                                                                                                                                                                                                                                          | Consertado pela causa (1)                                                      |
| Minijogos: "palavras e frases sem sentido, confusas e embaralhadas" | Várias, medidas na seção dos jogos: o dado da Trilha de mandarim (lista de frequência de legendas com pedaços que não são palavra; glosa em 20% das palavras e muitas vezes de outra acepção), a lacuna que nunca casava fora do alfabeto latino, jogos de letras recusados sem dizer por quê, e a Charada que o gate liberava e o tabuleiro fechava.                                                                                                                                                                                                                                                                                        | Regras consertadas; o DADO fica pendente (decisão do dono)                     |

O que foi provado em navegador com fala e tradutor simulados: trocar inglês → mandarim com a conversa parada e com o microfone aberto, mandarim → português, árabe da direita para a esquerda, e o aparelho sem voz de chinês. O que NÃO foi provado: a transcrição real em mandarim (exigiria baixar modelo) e a sessão real no modo automático.

## Matriz idioma × recurso

Legenda: F = funciona; FM = funciona mal; NF = não funciona; NV = não verificado. Estado DEPOIS dos consertos deste trabalho; entre parênteses, o que era antes quando mudou.

| Idioma | Transcrever (rota e filtro)                                         | Texto na tela                                                                                          | Traduzir de/para pt no aparelho | Voz do aparelho                                                | Intérprete                             | Palavras (segmentar) | Jogos                                                          |
| ------ | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------- | -------------------------------------------------------------- | -------------------------------------- | -------------------- | -------------------------------------------------------------- |
| en     | F: Moonshine, ou nuvem                                              | F                                                                                                      | F (opus-mt/Bergamot)            | F                                                              | F                                      | F                    | F                                                              |
| pt     | F: Whisper base/small (Parakeet atrás de chave)                     | F                                                                                                      | n/a                             | F                                                              | F                                      | F                    | F                                                              |
| es     | F: Whisper (Parakeet atrás de chave)                                | F                                                                                                      | NF local (só es↔en); internet  | F se instalada                                                 | F                                      | F                    | F; caça-palavras consertado                                    |
| fr     | F: Whisper                                                          | F                                                                                                      | NF local (só fr↔en); internet  | F se instalada                                                 | F                                      | F                    | F                                                              |
| de     | F: Whisper (antes FM: palavra só com ä/ö caía no filtro)            | F                                                                                                      | NF local (só de↔en); internet  | F se instalada                                                 | F                                      | F                    | F                                                              |
| it     | F: Whisper                                                          | F                                                                                                      | NF local (só it↔en); internet  | F se instalada                                                 | F                                      | F                    | F                                                              |
| zh     | F no código (antes NF: filtro descartava tudo); transcrição real NV | FM: sem fonte CJK própria (a do sistema)                                                               | NF local; só internet           | F se instalada; sem ela a tela agora diz e ensina (antes muda) | F com Web Speech (provado); Whisper NV | F (`Intl.Segmenter`) | FM: dado da Trilha; jogos de letras fora, com motivo no núcleo |
| ja     | idem zh                                                             | FM: idem                                                                                               | NF local                        | idem                                                           | NV                                     | F                    | FM: idem                                                       |
| ko     | idem zh                                                             | FM: fonte do sistema                                                                                   | NF local                        | idem                                                           | NV                                     | F (espaço)           | FM: glosa em 7% da Trilha                                      |
| ar     | idem zh                                                             | FM: no Intérprete agora sai da direita para a esquerda; na Captura ainda não (arquivo fora do alcance) | NF local                        | idem                                                           | F com Web Speech (provado)             | F                    | FM: glosa em 10%                                               |
| ru     | idem zh                                                             | FM: cirílico existe no pacote da fonte e não é carregado                                               | NF local                        | idem                                                           | NV                                     | F                    | F nas regras; glosa em 33%                                     |
| hi     | idem zh                                                             | FM: fonte do sistema                                                                                   | NF local                        | idem                                                           | NV                                     | F                    | FM: glosa em 11%; 2 frases com tradução                        |

Detalhes e causas, por recurso.

### 1. Transcrever

- Rota: `routeStt` (`src/gateway/sttRouter.ts:324`). Inglês em todas as fontes → Moonshine; qualquer outro → Whisper base (ou small com GPU provada), ou a nuvem (Groq large-v3-turbo) com o Whisper base de reserva. Parakeet só pt/es, atrás da chave `babel.stt.parakeet`. Tabela testada para os doze em `tests/outros-idiomas.test.ts`.
- Código de idioma: a captura corta a região (`zh-CN` → `zh`), que o Whisper aceita. `zh-TW` vira `zh` (nada pede a escrita tradicional). `nb-NO` chega como `nb`, que a biblioteca do Whisper local recusa (ela só conhece `no`): pendente, `it.todo` (leitura do subagente em `node_modules/@huggingface/transformers`, não reproduzido por mim).
- Filtro de alucinação: a causa principal do relato, consertada (acima).
- Detecção por texto (`src/core/texto/detectarIdioma.ts`): "inglês classificado como tcheco" confirmado e consertado: a lista tcheca tinha "a" e "to" e a inglesa não tinha nenhuma das palavras curtas mais comuns. E um único caractere de outra escrita decidia o idioma com 0,95 (uma tradução para o português citando um nome chinês era lida como chinês e rejeitada por `src/lib/validaTraducao.ts` como "não traduziu"): agora a escrita precisa ser 40% das letras.
- "apple" tratada como português: NÃO reproduzido. O detector devolve `null` para a palavra solta; o idioma vem então do rótulo da fala ou da sessão (`src/lib/vocabWord.ts:80-116`), ou do detector nativo do Chrome numa palavra só. Não verificado.
- Legenda ao vivo, suposições de espaço (leitura do subagente, não consertado): `src/lib/captura/parcialEstavel.ts:33-34` (a tradução parcial pede 6 palavras por `split(' ')`; a pontuação conhece `。！？` e não `，、؟،।`), `src/gateway/adapters/webSpeech.ts:139` (a deduplicação de hipóteses conta tokens por espaço), `src/lib/captura/ritmoDaLegenda.ts:23` (velocidade por caractere: 30 ideogramas ficam o mesmo tempo que 30 letras).
- Fontes: os pacotes `@fontsource*` do app só carregam `latin` e `latin-ext` (`src/styles/fontes/base.css`, `src/lib/fontesDosTemas.ts`). Nenhum pacote instalado cobre CJK nem árabe; cirílico existe em Inter, Geist e outras e não é carregado; devanágari existe em Baloo 2 e Rajdhani. Tudo fora do latino é desenhado pela fonte do sistema (leitura do subagente).
- Direção: `direcaoDoTexto` (`src/lib/languages.ts`) não tinha NENHUM chamador. Agora o Intérprete o usa. A Captura não.

### 2. Traduzir

- Tradutor do aparelho: só inglês ↔ es/fr/it/de, inglês → pt, e pt/ro/ca/gl → inglês (`src/gateway/adapters/opusMtLocal.ts:46-56`; Bergamot só pt → en). NÃO há modelo local para nenhum par com zh/ja/ko/ar/ru/hi, nem para pt ↔ es/fr/it/de. NÃO há pivô pelo inglês em lugar nenhum.
- Esses pares dependem do tradutor do Chrome (só computador, baixa pacote), do servidor (plano e consentimento) ou do MyMemory (consentimento, 4.500 caracteres por dia).
- Par sem motor: o gateway lança `NoRouteError`; a fala mostra o original entre parênteses e um aviso sai uma vez (`src/lib/captura/traducaoDaFala.ts:469-486`); o intérprete recebe "sem tradução" e volta a "parado". Não trava. Se o pacote do Chrome ficar "baixando" sem terminar, a fala fica em "…" até ele terminar ou falhar (inferência do subagente, não executado).
- `mtCoverage` (`src/lib/languages.ts`) anunciava errado: alemão ↔ inglês é local e a tela dizia "usa a internet"; inglês → romeno/catalão/galego não é e a tela prometia "no aparelho". Consertado e conferido contra o adaptador, par a par.

### 3. Falar

- Escolha da voz (`pickVoice`, `src/lib/tts.ts`): casava por prefixo. `fi` casava com voz filipina (`fil-PH`); `zh-CN` caía em `zh-HK` (cantonês); `cmn-Hans-CN`, `iw-IL`, `in-ID` e `no-NO` não eram reconhecidos. Consertado.
- Sem voz do idioma: o motor não fala (certo), e agora a tela diz o que houve e o caminho no Windows, Android, iPhone/iPad ou Mac (`src/lib/voz/faltaDeVoz.ts`), tanto na faixa do intérprete quanto no aviso geral.
- Reserva: a voz natural da nuvem lê os doze idiomas, mas só no Premium com a flag `voz_natural` (desligada de fábrica). Usá-la como reserva no Grátis é decisão do dono.
- A fila de fala não prende: sem voz, o erro vem na hora; há prazo de 8 s para começar e prazo por tamanho para terminar (`src/lib/voz/filaDeFala.ts`).

### 4. Intérprete e Conversa virtual

- Trocar de idioma no meio: a folha "Idiomas da sessão" fecha o microfone (`ModoInterprete.tsx`, `aoEscolherIdioma`), o reconhecimento do navegador reabre no idioma novo (`src/lib/captura/fontesDeAudio.ts:849-878`), e o Whisper recebe a dica a cada fala. Provado em navegador para en → zh (parado e gravando) e zh → pt.
- O que travava está na primeira tabela.
- Trocar os lados e o automático: sem defeito novo encontrado; o automático em mandarim não foi exercitado com modelo real.

### 5. Palavras

- `palavrasDoTexto` (`src/core/texto/segmentacao.ts`) e `trechosTocaveis` (`src/lib/captura/trechosTocaveis.ts`) já usam `Intl.Segmenter`: funcionam nos doze (testado).
- Ainda dividem por espaço, em arquivos fora do alcance deste trabalho: `captura/celular/FolhaDaFrase.tsx:44`, `captura/legendas/LinhaDaLegenda.tsx:38`, `captura/quest/HistoricoDoPrototipo.tsx:84`, `ChatTranscript.tsx:304`, `src/lib/vocabWord.ts:216`. Numa frase chinesa, o toque pega a frase inteira como "palavra".
- Transliteração (pinyin, romaji): não existe em lugar nenhum.

### 6. Minijogos

| Jogo                                                 | es/fr/de/it           | zh, ja                                                 | ko, ar, ru, hi                            | O que supõe                                               |
| ---------------------------------------------------- | --------------------- | ------------------------------------------------------ | ----------------------------------------- | --------------------------------------------------------- |
| Memória, Duelo, Karuta, Mala                         | roda                  | roda; conteúdo fraco (dado)                            | roda; pouca glosa                         | nada da escrita                                           |
| Caça-palavras, Termo, Choseong, Rali, Bao, Shiritori | roda                  | não oferecido                                          | não oferecido                             | alfabeto latino (grade A–Z, teclado QWERTY, vogais AEIOU) |
| Frase embaralhada                                    | roda                  | roda com peças do segmentador (decisão pendente)       | roda; hi tem 2 frases                     | 4 a 10 peças e tradução                                   |
| Karaokê, Escuta, Ditado (na Trilha)                  | palavra solta por voz | idem; homófonos em zh (decisão pendente)               | idem; ditado exige marcas exatas em ar/hi | voz do idioma                                             |
| Caça-conectores                                      | só com gravação       | não oferecido                                          | não oferecido                             | lista de conectores (só en, pt, es, de, fr, it, nl)       |
| Charada                                              | roda                  | roda só com frase em que a palavra é um segmento       | roda (antes abria e fechava)              | lacuna na frase                                           |
| Cadavre, Tabu                                        | roda                  | FM: não reconhece a palavra dentro da frase sem espaço | FM: só a forma idêntica                   | tokens por espaço, sufixos ingleses                       |

Por que saía "sem sentido" em mandarim (medições do subagente sobre `public/trilha/zh.json` e `public/glosas/zh-pt.json`, não refeitas por mim, salvo onde dito):

- O dado: lista de frequência de legendas (`"escala":"frequencia"`), com entradas que são pedaços (`一切都是`, `它会`) e 1.034 de 5.221 com um caractere só. 29% das palavras com frase não são um segmento na própria frase de exemplo.
- A glosa: 1.026 de 5.221 palavras (20%) têm glosa, uma por palavra, e a acepção é com frequência a errada (`的` → "objetivo", `是` → "sim", `我` → "me"; conferido por mim no arquivo).
- A lacuna (`src/core/learning/cloze.ts`) usava `\b`, que só conhece letras ASCII: casava em 0% das frases de ja/ko/ar/ru/hi e 2 de 4.859 em zh. Consertado.
- A elegibilidade considera o idioma só de três formas: alfabeto latino da palavra, lista de conectores, e escrita sem espaço na Frase embaralhada. Não há tabela "jogo × idiomas".
- Mistura de idiomas no baralho: não encontrada. O filtro por idioma roda antes da rodada e os distratores exigem o mesmo idioma; os testes de navegador conferem que toda alternativa está na escrita do idioma. O idioma da TRADUÇÃO não é conferido em lugar nenhum (`MinigameItem` não tem o campo).

### 7. Carregar outros idiomas por padrão

O que um usuário novo recebe ao escolher outro idioma, contra o inglês:

| Item                  | Inglês                                                                    | Outros                                                                        |
| --------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Padrão de fábrica     | `DEFAULT_LANG_CONFIG`: fala pt-BR, estuda en-US (`src/lib/langConfig.ts`) | precisa escolher                                                              |
| Trilha                | curada                                                                    | lista de frequência; existe para 16 idiomas (`public/trilha/*.json`)          |
| Glosa em português    | não medido aqui (o inglês usa outro arquivo)                              | es 37%, fr 58%, de 49%, it 42%, ru 33%, ja 25%, zh 20%, hi 11%, ar 10%, ko 7% |
| Modelo de transcrição | Moonshine (67 MB)                                                         | Whisper base (maior, mais lento)                                              |
| Tradutor no aparelho  | sim                                                                       | só es/fr/it/de ↔ inglês; nada para pt ↔ outro                               |
| Voz                   | costuma vir no sistema                                                    | depende de instalar                                                           |
| Interface             | pt e en oferecidas                                                        | es 25% e ar 26%, abaixo do piso (`scripts/i18n/cobertura.mjs`)                |

## O que foi consertado

| Arquivo                                                                                                        | Mudança                                                                                                                                  |
| -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `src/gateway/alucinacao.ts`                                                                                    | a régua "sem vogal é ruído" vale só para o alfabeto latino (e confere a vogal sem o acento); um caractere han, kana ou hangul é palavra  |
| `src/lib/captura/tiposDaFala.ts`, `controleDoInterprete.ts`, `pipelineDeFala.ts`                               | o fim de fala sem texto (`FimDaFala.semTexto`: final vazio, fala descartada por sobreposição, erro do motor) devolve a vez ao intérprete |
| `src/lib/captura/idiomasDoModelo.ts` (novo), `pipelineDeFala.ts`                                               | no intérprete a rota é sempre multilíngue                                                                                                |
| `src/lib/voz/faltaDeVoz.ts` (novo), `ModoInterprete.tsx`, `PaginaDoInterprete.tsx`, `src/components/Toast.tsx` | idioma sem voz no aparelho: "Voz em X · Y em texto", sem "Repetir"/"Parar voz" daquele lado, e o caminho de instalação por sistema       |
| `src/lib/tts.ts`                                                                                               | escolha da voz pela mesma base, com os códigos equivalentes (`cmn`, `iw`, `in`, `no`) e sem cantonês para mandarim                       |
| `ConversaDoPrototipo.tsx`, `TextoTocavel.tsx`                                                                  | `dir` no texto da conversa (árabe e hebraico)                                                                                            |
| `src/core/texto/detectarIdioma.ts`                                                                             | inglês com as palavras curtas; a escrita precisa ser 40% das letras                                                                      |
| `src/lib/languages.ts`                                                                                         | `mtCoverage` igual ao tradutor local, par a par                                                                                          |
| `src/core/learning/cloze.ts`                                                                                   | lacuna em qualquer escrita; em chinês e japonês a palavra precisa ser um segmento inteiro                                                |
| `src/core/minigames/estadoDosJogos.ts`, `desbloqueio.ts`                                                       | Choseong, Rali, Bao, Shiritori e Termo devolvem `alfabeto-nao-suportado` (antes "faltam N"); sem botão que não resolve                   |
| `src/core/minigames/itemSource.ts`                                                                             | a Charada só conta item que abre lacuna; a Memória não recebe par palavra + frase no mesmo idioma                                        |
| `src/core/minigames/wordsearch.ts`, `CacaPalavrasDoPrototipo.tsx`                                              | o enchimento da grade inclui toda letra das palavras colocadas (antes J, K, Q, V, X, Y, Z só apareciam dentro das respostas)             |
| `public/i18n/{en,es,ar,xx}.json`, `src/data/i18n/cobertura.json`                                               | 5 mensagens novas; `xx` e cobertura regenerados                                                                                          |
| `tests/__snapshots__/elegibilidade.test.ts.snap`                                                               | atualizado: só ganhou `motivo: alfabeto-nao-suportado` nos baralhos 100% japoneses                                                       |

## Testes criados e resultado

- `tests/outros-idiomas.test.ts`: tabela idioma × função (rota, filtro, detecção, par de tradução, voz, segmentação, cada jogo de palavra × 10 idiomas com as palavras reais da Trilha, lacuna, peças da frase). 499 casos verdes e 7 `it.todo`.
- `tests/interprete-fala-sem-texto.test.ts`: 4 casos, verdes.
- `tests/e2e/outros-idiomas-interprete.e2e.ts`: 5 testes, verdes (projeto `mobile-375`).
- `tests/e2e/outros-idiomas-jogos.e2e.ts`: 9 verdes (Memória até o fim e Duelo/Karuta/Mala em espanhol, mandarim e árabe; jogos de letras fora em mandarim e árabe; captura com chinês e árabe), 3 `test.fixme`.
- Vizinhos: 112 arquivos de teste que importam os módulos tocados, 2.557 verdes; `modo-interprete.e2e.ts` e `sessao-de-jogo.e2e.ts` verdes.
- `eslint --max-warnings 0`: limpo nos arquivos tocados. `prettier --check`: limpo nos arquivos novos e nos de `src/lib`, `src/gateway` e `src/components`; sete arquivos de `src/core` e `src/lib/languages.ts` já falhavam no `HEAD` e não foram reformatados.
- Vermelho visto antes do conserto: direção do árabe, falta de voz, voz por idioma, lacuna, motivo dos jogos de letras, Charada, par da Memória em árabe. Escritos junto com o conserto, sem o vermelho observado: filtro de alucinação, detector, `mtCoverage`, fala sem texto, `idiomasDoModelo`, enchimento.
- Suíte inteira, `tsc` e build não foram rodados (regra do trabalho).

## Pendente, com o teste que marca

| Pendência                                                                                             | Teste                                         |
| ----------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| A carta do jogo de letras diz "faltam N" em vez do motivo (depende de `Play.tsx`)                     | `test.fixme` em `outros-idiomas-jogos.e2e.ts` |
| Árabe na legenda da Captura sem `dir`                                                                 | `test.fixme` idem                             |
| `nb-NO` chega ao Whisper como `nb`                                                                    | `it.todo` em `outros-idiomas.test.ts`         |
| Transcrição real em mandarim                                                                          | `it.todo`                                     |
| pt ↔ zh/ja/ko/ar/ru/hi sem internet                                                                  | `it.todo`                                     |
| Transliteração                                                                                        | `it.todo`                                     |
| Frase embaralhada em zh/ja; dado da Trilha de mandarim; Ditado/Escuta/Karaokê com palavra solta em zh | `it.todo` (três)                              |

Sem teste pendente (só registrado): toque por palavra na Captura em chinês/japonês; `parcialEstavel` e `ritmoDaLegenda` para escritas sem espaço; `vazaResposta` em Cadavre e Tabu; a Karuta fala a pista no idioma da interface (`KarutaDoPrototipo.tsx:77-79`); o disjuntor do tradutor local conta "par não suportado" como falha (`src/gateway/index.ts:367`), o que pode tirar o pt → en do ar por 30 s numa conversa que alterna pares (inferência do subagente).

## O que mudar nos arquivos que não pude tocar

1. `src/components/views/Play.tsx`, função `notaDoJogo` (perto de `:3454-3477`): antes do ramo "faltam N", acrescentar
   `if (motivo === 'alfabeto-nao-suportado') return t('este jogo usa letras do alfabeto latino, e {idioma} não é escrito com elas', { idioma: langLabelNaUI(fonte.lang) });`
   O núcleo já devolve o motivo para os seis jogos, e `comoDesbloquear` já devolve `null` (sem botão). O Quest herda por `notaDoBloqueio` (`play/quest/jogosNoQuest.ts:169`).
2. `src/components/views/captura/celular/**` e `captura/quest/HistoricoDoPrototipo.tsx:152-168`, `captura/legendas/LinhaDaLegenda.tsx:109,124`, `LegendaFlutuanteDoPrototipo.tsx:54,57`, `celular/FolhaDaFrase.tsx:111,115`: onde já há `lang={x}`, acrescentar `dir={direcaoDoTexto(x)}` (de `src/lib/languages.ts`). `.q-fala { text-align: left }` (`capturaNoCelular.css:432`) passa a `text-align: start`.
3. Os mesmos arquivos: trocar `split(' ')`/`split(/\s+/)` por `trechosTocaveis(texto, lang)` (`FolhaDaFrase.tsx:44`, `LinhaDaLegenda.tsx:38`, `HistoricoDoPrototipo.tsx:84`).
4. `src/components/views/LiveCapture.tsx:2262-2289`: os avisos do par não passam por `t()`.

## Decisões do dono

1. Fonte CJK, árabe e devanágari: baixar (peso grande: uma CJK tem vários MB) ou seguir com a do sistema. Cirílico e devanágari já estão nos pacotes instalados e bastaria carregar.
2. Tradução pt ↔ outros idiomas sem internet: pivô pelo inglês (dois modelos em sequência, mais lento e com erro somado) ou seguir dependendo da internet.
3. Voz da nuvem como reserva no Grátis quando o aparelho não tem a voz (custo por uso).
4. Trilha de mandarim (e as outras de frequência): refazer o dado com palavras de verdade e glosa conferida, ou tirar da oferta os idiomas com glosa abaixo de um piso (ko 7%, ar 10%, hi 11%, zh 20%).
5. Frase embaralhada em chinês e japonês: manter com as peças do segmentador ou não oferecer.
6. Ditado, Escuta e Karaokê com palavra solta em chinês (homófonos) e com marcas exatas em árabe e hindi: manter ou não oferecer.
7. Interface em espanhol e árabe (25%): completar o catálogo ou deixar só pt e en.
