# Revisão etária dos livros: o que falta para o dono

Estado em 27/10/2026. Das 328 propostas de classificação etária (`scripts/livros/classificacao.json`, `"revisor":
"proposta-claude"`), **nenhuma está aprovada**. Por isso `public/catalogo/livros.json` sai com `classificacao: null` em
todos e **menor de idade não vê nenhum livro** (adulto vê tudo). Aprovar é **decisão sua**: define o que quem tem 12 a 17
anos pode ler (ECA Digital). Este documento só organiza a decisão; nada foi aprovado, alterado ou enviado.

## 1. O que a aprovação faz

- Trocar `"revisor": "proposta-claude"` pelo seu nome (e a `data`) faz a montagem publicar a faixa daquele livro.
- Quem enxerga o quê (`src/lib/livros/quemLe.ts`): menor de 12 só **livre**; 12 a 15 anos até **12**; 16 e 17 até **16**;
  perfil "Infantil" só livre; perfil protegido sem idade declarada até 12. **14, 16 e 18 só aparecem para quem tem a idade.**
- Números reais (conferidos no JSON, não de memória): livre 90, 12 anos 141, 14 anos 64, 16 anos 25, 18 anos 6, "a revisar"
  2 (propostos como 18); confiança alta 182, média 121, baixa 25. Batem com `docs/livros-classificacao-sugestoes.md`.
  100 livros têm nota de conteúdo sensível de época. Divergência: a lista tem **330 itens**, não 328. Dois são sobras de
  livros que saíram do catálogo (`pg-73486` Corazón, livre, e `pg-2591` Grimm, 12), sem campo `confianca`. Os filtros por
  confiança os ignoram; `--todos` os conta (330 aprovados, 328 livros mudam).
- Efeito para menores, depois de cada passo (acumulado):

| Depois de                    | Menor de 12 vê | 12 a 15 anos vê | 16 e 17 anos vê |
| ---------------------------- | -------------: | --------------: | --------------: |
| hoje                         |              0 |               0 |               0 |
| Passo 1                      |             67 |             148 |             148 |
| Passo 2                      |             89 |             215 |             275 |
| Passo 3 (o que você decidir) |         até 90 |         até 231 |         até 320 |

(Passo 3 no teto: aprovar também os 16 de confiança baixa em livre/12/14 e as faixas 16; "até" porque depende do que você
subir de faixa.) Os 14 anos (60 no fim do passo 2) só aparecem para 16 e 17 anos, porque 12 a 15 anos vê até 12.

## 2. Plano em 3 passos (do mais seguro ao que exige julgamento)

Antes de tudo, leia a **seção 3e abaixo (racismo e violência de época)** se quiser mudar a faixa de algum desses
(Huckleberry Finn, Peter Pan, Struwwelpeter): eles têm confiança alta/média e entrariam nos passos 1 e 2 na faixa proposta.
Para mudar: edite o `classificacao` do item em `classificacao.json` antes do passo. Todos os comandos rodam na raiz do
repositório. O nome do revisor é o que o script grava no campo `revisor` (obrigatório; não pode ser `proposta-claude`).

### Passo 1. Confiança ALTA em livre e 12 anos (o mais seguro)

Simulação real (`--simular` não grava nada):

```
$ npx tsx scripts/livros/aprovar-classificacao.mjs --revisor="<seu nome>" --classificacao=livre,12 --confianca=alta --simular
...
[aprovar] 148 proposta(s) seriam aprovadas por <seu nome>
[aprovar] livros.json: 148 livro(s) mudariam
```

Aprovar de verdade (o mesmo comando, sem `--simular`):

```bash
npx tsx scripts/livros/aprovar-classificacao.mjs --revisor="<seu nome>" --classificacao=livre,12 --confianca=alta
```

Libera **148 livros** (67 livre + 81 de 12 anos). Menor de 12 passa a ver 67; 12 a 17 anos, 148.

### Passo 2. Confiança MÉDIA em livre, 12 e 14 anos (mais os 14 anos de confiança alta)

O passo 1 deixa 14 anos de confiança alta (24) de fora; este passo os inclui. Simulação real do passo 2 junto com o
passo 1 (rodada ANTES do passo 1; os 148 dele estão dentro dos 275):

```
$ npx tsx scripts/livros/aprovar-classificacao.mjs --revisor="<seu nome>" --classificacao=livre,12,14 --confianca=alta,media --simular
...
[aprovar] 275 proposta(s) seriam aprovadas por <seu nome>
[aprovar] livros.json: 275 livro(s) mudariam
```

Depois do passo 1, o mesmo comando muda **127** (275 − 148: 22 livre + 45 de 12 + 24 de 14 alta + 36 de 14 média),
porque o script só mexe em proposta. Aprovar de verdade:

```bash
npx tsx scripts/livros/aprovar-classificacao.mjs --revisor="<seu nome>" --classificacao=livre,12,14 --confianca=alta,media
```

Libera mais **127 livros** (total 275). Menor de 12: 89. Quem tem 12 a 15 anos: 215. Quem tem 16 e 17: 275.
Se preferir ir mais devagar, rode só `--classificacao=livre,12 --confianca=media` e depois `--classificacao=14`.

### Passo 3. Julgamento, livro a livro (65 linhas, tabelas abaixo)

Sobram **53** propostas depois dos passos 1 e 2: 16 anos (25), 18 anos (6), "a revisar" (2) e as 20 de confiança baixa em
livre/12/14. Cada linha tem uma sugestão curta (manter, subir a faixa, revisar). Para aprovar uma a uma:

```bash
npx tsx scripts/livros/aprovar-classificacao.mjs --revisor="<seu nome>" --ids=pg-17073,ws-pt-luciola
```

Para aprovar toda uma faixa de uma vez, por exemplo as de 16 anos (só depois de ler a tabela 3c):

```bash
npx tsx scripts/livros/aprovar-classificacao.mjs --revisor="<seu nome>" --classificacao=16
```

Discordou de uma faixa? Edite o `classificacao` do item (livre, 12, 14, 16, 18) antes de aprovar. Livro que você não
quer liberar nunca: não aprove; ele continua invisível para menor.

> **Aviso: `--todos` aprova TUDO que sobrou, inclusive os 2 "a revisar" como 18** (`pg-78063` Le jeune Européen e
> `pg-78064` Lucifer) e os 25 de baixa confiança, e conta 330 itens. Como 18 está fora do alcance de menor, esses dois
> não vazam, mas passam a constar como revisados por você. Prefira os filtros acima.

## Passo 3. Livros que pedem julgamento (65)

As tabelas 3a a 3d são as 53 propostas que sobram depois dos passos 1 e 2 (mais as 12 da 3e, que os passos 1 e 2
aprovariam sozinhas na faixa proposta, por isso valem uma olhada ANTES). Aprove as que concordar com `--ids=<id>`.
Link: para livros do Gutenberg, a página pública do título; para Standard Ebooks e Wikisource, a obra.

### 3a. 18 anos (6): ficam fora do alcance de menor

| id                       | Título                | Autor              | Faixa | Conf. | Nota de conteúdo                                                                                                                                                                              | Link                                                     | Sugestão                                                                   |
| ------------------------ | --------------------- | ------------------ | ----- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------- |
| `ws-pt-bom-crioulo`      | Bom Crioulo           | Adolfo Caminha     | 18    | média | relação sexual de um marinheiro adulto com um grumete de 15 anos, açoites, assassinato no fim. Sensível: homossexualidade tratada como patologia (visão de época) e racismo; sexualidade com… | [fonte](https://pt.wikisource.org/wiki/Bom_Crioulo)      | manter 18 (sexo com grumete de 15 anos); nunca para menor                  |
| `pg-31284`               | Josefine Mutzenbacher | Felix Salten       | 18    | alta  | romance pornográfico de 1906: sexo explícito, inclusive envolvendo criança e incesto. Sensível: abuso sexual de menor descrito de forma explícita; nunca liberar para menor                   | [fonte](https://www.gutenberg.org/ebooks/31284)          | manter 18; decisão registrada: só 18+, nunca liberar para menor            |
| `pg-78098`               | L'art d'aimer         | Catulle Mendès     | 18    | média | "A arte de amar" de Catulle Mendès: contos galantes e eróticos                                                                                                                                | [fonte](https://www.gutenberg.org/ebooks/78098)          | manter 18 (erótico, confiança média); ler amostra se quiser descer para 16 |
| `pg-78059`               | L'homme tout nu       | Catulle Mendès     | 18    | média | Catulle Mendès, autor conhecido por contos licenciosos e eróticos                                                                                                                             | [fonte](https://www.gutenberg.org/ebooks/78059)          | manter 18 (erótico, confiança média); ler amostra se quiser descer para 16 |
| `ws-pt-noite-na-taverna` | Noite na Taverna      | Álvares de Azevedo | 18    | média | contos ultrarromânticos: necrofilia, incesto, estupro, canibalismo e assassinatos                                                                                                             | [fonte](https://pt.wikisource.org/wiki/Noite_na_Taverna) | manter 18 (necrofilia, estupro, canibalismo)                               |
| `pg-57248`               | 初刻拍案驚奇          | Mengchu Ling       | 18    | média | coletânea de contos populares Ming com episódios sexuais explícitos, adultério e crimes                                                                                                       | [fonte](https://www.gutenberg.org/ebooks/57248)          | manter 18 (episódios sexuais explícitos)                                   |

### 3b. "A revisar" (2): propostos como 18 por dúvida

| id         | Título            | Autor                    | Faixa          | Conf. | Nota de conteúdo                                                                                                                                                            | Link                                            | Sugestão                                                                                        |
| ---------- | ----------------- | ------------------------ | -------------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `pg-78063` | Le jeune Européen | Pierre Drieu La Rochelle | 18 (a revisar) | baixa | ensaio autobiográfico de Drieu La Rochelle (1927) sobre guerra, juventude e decadência; não deu para avaliar o conteúdo. Sensível: autor depois colaboracionista e fascista | [fonte](https://www.gutenberg.org/ebooks/78063) | revisar: ler amostra; até lá manter 18 (risco baixo, ensaio de guerra e juventude; pode ser 16) |
| `pg-78064` | Lucifer           | Maurice Magre            | 18 (a revisar) | baixa | romance de 1929 (amostra lida), atmosfera esotérica e de relações amorosas; não deu para avaliar o conteúdo sexual                                                          | [fonte](https://www.gutenberg.org/ebooks/78064) | revisar: ler amostra do conteúdo sexual; até lá manter 18                                       |

### 3c. 16 anos (25): sensibilidade alta, o teto de quem tem 16 e 17 anos

| id                                               | Título                                        | Autor                                     | Faixa | Conf. | Nota de conteúdo                                                                                                                                                                               | Link                                                                                   | Sugestão                                                                                                   |
| ------------------------------------------------ | --------------------------------------------- | ----------------------------------------- | ----- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `ws-pt-a-normalista`                             | A Normalista                                  | Adolfo Caminha                            | 16    | média | naturalismo: o padrinho seduz a afilhada, gravidez e aborto sugerido. Sensível: abuso de uma jovem pelo tutor como tema central                                                                | [fonte](https://pt.wikisource.org/wiki/A_Normalista)                                   | manter 16                                                                                                  |
| `se-leo-tolstoy-anna-karenina-constance-garnett` | Anna Karenina                                 | Leo Tolstoy                               | 16    | alta  | adultério e suicídio da protagonista como tema central; sem cena de sexo                                                                                                                       | [fonte](https://standardebooks.org/ebooks/leo-tolstoy/anna-karenina/constance-garnett) | manter 16 (14 é defensável: sem cena de sexo)                                                              |
| `pg-28281`                                       | Cecilia Valdés o la Loma del Ángel            | Cirilo Villaverde                         | 16    | média | escravidão em Havana: castigos e torturas de escravizados, incesto entre meios-irmãos e um assassinato. Sensível: escravidão e racismo no centro (romance abolicionista); termos de época      | [fonte](https://www.gutenberg.org/ebooks/28281)                                        | manter 16; revisar a violência contra escravizados nos trechos                                             |
| `se-pauline-e-hopkins-contending-forces`         | Contending Forces                             | Pauline E. Hopkins                        | 16    | média | escravidão, linchamento e o estupro de uma menina de 14 anos (passado de Sappho) narrado. Sensível: racismo, linchamento e violência sexual contra mulheres negras no centro do enredo         | [fonte](https://standardebooks.org/ebooks/pauline-e-hopkins/contending-forces)         | manter 16, com aviso (linchamento e estupro de menina narrados)                                            |
| `se-fyodor-dostoevsky-demons-constance-garnett`  | Demons                                        | Fyodor Dostoevsky                         | 16    | média | conspiração terrorista: assassinatos políticos, vários suicídios, incêndio; se trouxer "Na casa de Tíkhon", confissão de estupro de menina. Sensível: confirmar se a edição inclui o capítulo… | [fonte](https://standardebooks.org/ebooks/fyodor-dostoevsky/demons/constance-garnett)  | revisar: buscar "Tíkhon" no EPUB; se o capítulo suprimido estiver lá, subir para 18; senão manter 16       |
| `pg-66452`                                       | Die Liebe                                     | Hans Kaltneker                            | 16    | baixa | novelas expressionistas de Viena (amostra lida): cortesãs ("Hetäre"), desejo e decadência como tema, especulação financeira. Sensível: estereótipo antissemita no falar de um personagem (iíd… | [fonte](https://www.gutenberg.org/ebooks/66452)                                        | revisar: ler amostra; manter 16 até lá                                                                     |
| `pg-40739`                                       | Die Traumdeutung                              | Sigmund Freud                             | 16    | média | psicanálise dos sonhos: discussão clínica franca de sexualidade, desejo incestuoso (Édipo) e simbolismo sexual                                                                                 | [fonte](https://www.gutenberg.org/ebooks/40739)                                        | manter 16                                                                                                  |
| `pg-50285`                                       | Dr. Mabuse, der Spieler                       | Norbert Jacques                           | 16    | média | romance policial: jogo, hipnose, assassinatos, cocaína e outras drogas no submundo de Berlim                                                                                                   | [fonte](https://www.gutenberg.org/ebooks/50285)                                        | manter 16 (14 é defensável)                                                                                |
| `pg-28592`                                       | El pecado y la noche                          | Antonio de Hoyos y Vinent                 | 16    | baixa | contos decadentistas (amostra lida): morte, decomposição, pecado e desejo; o autor é conhecido por erotismo e morbidez                                                                         | [fonte](https://www.gutenberg.org/ebooks/28592)                                        | revisar: ler amostra; manter 16 até lá (pode subir para 18)                                                |
| `pg-50351`                                       | Historia de las Indias (vol. 2 de 5)          | Bartolomé de las Casas                    | 16    | média | Las Casas relata massacres, torturas e escravização de indígenas na conquista, com detalhe. Sensível: violência colonial descrita para denunciá-la; muito pesada para menor                    | [fonte](https://www.gutenberg.org/ebooks/50351)                                        | manter 16, com aviso (massacres e torturas descritos para denunciar)                                       |
| `pg-38720`                                       | L'amore che torna                             | Guido da Verona                           | 16    | média | romance de amores adúlteros e amantes (amostra lida) de Guido da Verona, autor de sucesso escandaloso pela sensualidade                                                                        | [fonte](https://www.gutenberg.org/ebooks/38720)                                        | manter 16                                                                                                  |
| `pg-78101`                                       | L'homme à l'Hispano                           | Pierre Frondaie                           | 16    | média | romance de paixão adúltera nos anos 1920 que termina em suicídio                                                                                                                               | [fonte](https://www.gutenberg.org/ebooks/78101)                                        | manter 16 (14 é defensável)                                                                                |
| `pg-17073`                                       | La Regenta                                    | Leopoldo Alas                             | 16    | alta  | adultério central, desejo obsessivo de um padre pela protagonista, morte do marido em duelo                                                                                                    | [fonte](https://www.gutenberg.org/ebooks/17073)                                        | manter 16                                                                                                  |
| `ws-pt-luciola`                                  | Lucíola                                       | José de Alencar                           | 16    | alta  | a protagonista é uma cortesã; prostituição, uma orgia e sexualidade sugerida                                                                                                                   | [fonte](https://pt.wikisource.org/wiki/Luc%C3%ADola)                                   | manter 16                                                                                                  |
| `pg-34635`                                       | Menazerya ludzka                              | Gabriela Zapolska                         | 16    | baixa | naturalismo de Zapolska (amostra lida): mulher "desencaminhada", sedução de criada pelo patrão, escândalo                                                                                      | [fonte](https://www.gutenberg.org/ebooks/34635)                                        | revisar: ler amostra; manter 16 até lá                                                                     |
| `ws-pt-o-choque-das-racas`                       | O Choque das Raças                            | Monteiro Lobato                           | 16    | média | ficção eugenista de 1926: o eleitorado branco reage à eleição de um presidente negro e a população negra é esterilizada. Sensível: racismo e eugenia são a tese do livro; nunca sem contexto   | [fonte](https://pt.wikisource.org/wiki/O_Choque_das_Ra%C3%A7as)                        | revisar: decisão de política (racismo e eugenia são a tese). Sem sexo, mas sugiro manter 16 e só com aviso |
| `ws-pt-o-cortico`                                | O Cortiço                                     | Aluísio Azevedo                           | 16    | alta  | naturalismo: cenas sexuais sugeridas, sedução lésbica de uma adolescente, brigas a navalha, suicídio de Bertoleza. Sensível: racismo e escravidão (Bertoleza vendida como livre); personagens… | [fonte](https://pt.wikisource.org/wiki/O_Corti%C3%A7o)                                 | manter 16                                                                                                  |
| `ws-pt-o-crime-do-padre-amaro`                   | O Crime do Padre Amaro                        | Eça de Queirós                            | 16    | alta  | padre seduz uma jovem, gravidez, morte dela e o bebê entregue a uma "tecedeira de anjos" (infanticídio)                                                                                        | [fonte](https://pt.wikisource.org/wiki/O_Crime_do_Padre_Amaro)                         | manter 16                                                                                                  |
| `pg-31971`                                       | O crime do padre Amaro, scenas da vida devota | Eça de Queirós                            | 16    | alta  | O Crime do Padre Amaro (outra edição): sedução de uma jovem, morte dela e infanticídio                                                                                                         | [fonte](https://www.gutenberg.org/ebooks/31971)                                        | manter 16 (mesma obra da linha acima)                                                                      |
| `pg-42942`                                       | O Primo Bazilio                               | Eça de Queirós                            | 16    | alta  | adultério da protagonista como tema central, chantagem da criada, doença e morte de Luísa                                                                                                      | [fonte](https://www.gutenberg.org/ebooks/42942)                                        | manter 16                                                                                                  |
| `ws-pt-os-maias`                                 | Os Maias                                      | Eça de Queirós                            | 16    | alta  | incesto entre irmãos que não sabem do parentesco, adultério e amantes                                                                                                                          | [fonte](https://pt.wikisource.org/wiki/Os_Maias)                                       | manter 16                                                                                                  |
| `pg-59828`                                       | The String of Pearls                          | Thomas Peckett Prest, James Malcolm Rymer | 16    | alta  | Sweeney Todd: barbeiro assassino em série e carne humana vendida em tortas                                                                                                                     | [fonte](https://www.gutenberg.org/ebooks/59828)                                        | manter 16                                                                                                  |
| `se-james-joyce-ulysses`                         | Ulysses                                       | James Joyce                               | 16    | média | sexualidade franca (masturbação, fantasias, monólogo de Molly), bordel no episódio "Circe"; foi censurado por obscenidade. Sensível: antissemitismo vivido por Bloom em falas de outros perso… | [fonte](https://standardebooks.org/ebooks/james-joyce/ulysses)                         | manter 16 (18 é defensável: "Circe" e o monólogo de Molly)                                                 |
| `pg-25128`                                       | 孽海花                                        | Pu Zeng                                   | 16    | média | a protagonista é uma ex-cortesã: adultério, bordéis e intrigas políticas                                                                                                                       | [fonte](https://www.gutenberg.org/ebooks/25128)                                        | manter 16                                                                                                  |
| `pg-34013`                                       | 血笑記                                        | Leonid Andreyev                           | 16    | média | "O Riso Vermelho": horror da guerra, cadáveres, loucura, descrições gráficas                                                                                                                   | [fonte](https://www.gutenberg.org/ebooks/34013)                                        | manter 16                                                                                                  |

### 3d. Confiança baixa nas outras faixas (20)

Nenhum passo automático os aprova (o filtro `--confianca` os deixa de fora). A leitura de amostra resolve quase todos.

| id                                 | Título                       | Autor                                | Faixa | Conf. | Nota de conteúdo                                                                                                                                                    | Link                                                                     | Sugestão                                                              |
| ---------------------------------- | ---------------------------- | ------------------------------------ | ----- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| `pg-26479`                         | I Utvecklingstid             | Toini Topelius                       | livre | baixa | romance de formação de uma jovem, para leitoras jovens; conteúdo exato não conferido                                                                                | [fonte](https://www.gutenberg.org/ebooks/26479)                          | revisar: ler amostra; se nada grave, manter livre (senão 12)          |
| `pg-23400`                         | A Lenda da Meia-Noite        | Manuel Pinheiro Chagas               | 12    | baixa | romance histórico de Pinheiro Chagas; conteúdo exato não conferido                                                                                                  | [fonte](https://www.gutenberg.org/ebooks/23400)                          | revisar: ler amostra; se nada grave, manter 12                        |
| `pg-21581`                         | Contos d'Aldeia              | Alberto Leal Barradas Monteiro Braga | 12    | baixa | contos de aldeia portuguesa; conteúdo exato não conferido                                                                                                           | [fonte](https://www.gutenberg.org/ebooks/21581)                          | revisar: ler amostra; se nada grave, manter 12                        |
| `pg-25178`                         | Damiano                      | Giulio Carcano                       | 12    | baixa | romance de Carcano; conteúdo exato não conferido                                                                                                                    | [fonte](https://www.gutenberg.org/ebooks/25178)                          | revisar: ler amostra; se nada grave, manter 12                        |
| `pg-28175`                         | De lelie van 's-Gravenhage   | Jacobus Jan Cremer                   | 12    | baixa | romance histórico holandês; conteúdo exato não conferido                                                                                                            | [fonte](https://www.gutenberg.org/ebooks/28175)                          | revisar: ler amostra; se nada grave, manter 12                        |
| `pg-63403`                         | Den ljusa skalpen            | Sigge Strömberg                      | 12    | baixa | aventura no Velho Oeste ("O Escalpo Loiro"); conteúdo exato não conferido. Sensível: indígenas norte-americanos e escalpos: provável retrato estereotipado de época | [fonte](https://www.gutenberg.org/ebooks/63403)                          | revisar: provável subir para 14 (escalpos, estereótipo de época)      |
| `pg-25138`                         | Dokter Helmond en zijn vrouw | Jacobus Jan Cremer                   | 12    | baixa | romance holandês sobre um médico e sua mulher; conteúdo exato não conferido                                                                                         | [fonte](https://www.gutenberg.org/ebooks/25138)                          | revisar: ler amostra; se nada grave, manter 12                        |
| `pg-25777`                         | El idilio de un enfermo      | Armando Palacio Valdés               | 12    | baixa | romance de um doente que vai se curar no campo e se envolve com uma moça da aldeia; conteúdo exato não conferido                                                    | [fonte](https://www.gutenberg.org/ebooks/25777)                          | revisar: ler amostra; se nada grave, manter 12                        |
| `pg-49660`                         | La alhambra                  | Manuel Fernández y González          | 12    | baixa | romance histórico da Granada moura: intriga, guerra e amores; conteúdo exato não conferido. Sensível: mouros e cristãos com estereótipos de época                   | [fonte](https://www.gutenberg.org/ebooks/49660)                          | revisar: ler amostra; se nada grave, manter 12                        |
| `pg-26453`                         | La pianta dei sospiri        | Defendente Sacchi                    | 12    | baixa | novela histórica romântica; conteúdo exato não conferido                                                                                                            | [fonte](https://www.gutenberg.org/ebooks/26453)                          | revisar: ler amostra; se nada grave, manter 12                        |
| `pg-78125`                         | Liebe ist ewig               | Wilhelm von Polenz                   | 12    | baixa | romance de família e de estudantes de medicina (amostra lida): namoro, conflito religioso católico × luterano, sem cena de sexo nas amostras                        | [fonte](https://www.gutenberg.org/ebooks/78125)                          | manter 12 (amostra lida sem sexo); só falta o aval seu                |
| `pg-25074`                         | Novelas y cuentos            | Serafín Estébanez Calderón           | 12    | baixa | cenas e contos andaluzes de costumes, de época; conteúdo exato não conferido. Sensível: estereótipos de época sobre ciganos e mouros                                | [fonte](https://www.gutenberg.org/ebooks/25074)                          | revisar: ler amostra; se nada grave, manter 12                        |
| `pg-78036`                         | Quand le rideau s'est baissé | Pierre Mille                         | 12    | baixa | contos de Pierre Mille; conteúdo exato não conferido. Sensível: autor de literatura colonial: retrato de época de povos colonizados                                 | [fonte](https://www.gutenberg.org/ebooks/78036)                          | revisar: ler amostra (literatura colonial); se nada grave, manter 12  |
| `pg-23203`                         | Scenas Contemporaneas        | Camilo Castelo Branco                | 12    | baixa | cenas e novelas de costumes de Camilo; conteúdo exato não conferido                                                                                                 | [fonte](https://www.gutenberg.org/ebooks/23203)                          | revisar: ler amostra; se nada grave, manter 12                        |
| `se-henry-seton-merriman-suspense` | Suspense                     | Henry Seton Merriman                 | 12    | baixa | romance vitoriano de amor e mistério, conteúdo forte não conhecido                                                                                                  | [fonte](https://standardebooks.org/ebooks/henry-seton-merriman/suspense) | revisar: ler amostra; se nada grave, manter 12                        |
| `pg-45252`                         | הצופה לבית ישראל             | Isaac Erter                          | 12    | baixa | ensaios satíricos do Iluminismo judaico (Haskalá), em hebraico; conteúdo exato não conferido                                                                        | [fonte](https://www.gutenberg.org/ebooks/45252)                          | revisar: ler amostra; se nada grave, manter 12                        |
| `pg-22622`                         | Aves Migradoras              | Fialho de Almeida                    | 14    | baixa | contos naturalistas de Fialho de Almeida, conhecidos pela crueza; conteúdo exato não conferido                                                                      | [fonte](https://www.gutenberg.org/ebooks/22622)                          | revisar: ler amostra (crueza naturalista); manter 14 ou subir para 16 |
| `pg-22501`                         | Fino a Dogali                | Alfredo Oriani                       | 14    | baixa | ensaio histórico-político que culmina na derrota colonial italiana na Eritreia. Sensível: defesa do colonialismo italiano; termos de época sobre africanos          | [fonte](https://www.gutenberg.org/ebooks/22501)                          | manter 14 (ensaio colonialista), com aviso                            |
| `pg-26655`                         | Tristán o el pesimismo       | Armando Palacio Valdés               | 14    | baixa | romance de um pessimista e de casamentos infelizes; infidelidade suspeita; conteúdo exato não conferido                                                             | [fonte](https://www.gutenberg.org/ebooks/26655)                          | revisar: ler amostra; se nada grave, manter 14                        |
| `pg-38628`                         | Vecchie storie d'amore       | Adolfo Albertazzi                    | 14    | baixa | contos de amores antigos; conteúdo exato não conferido                                                                                                              | [fonte](https://www.gutenberg.org/ebooks/38628)                          | revisar: ler amostra; se nada grave, manter 14                        |

### 3e. Racismo, escravidão e violência colonial de época (12)

| id                                                 | Título                                                                                   | Autor              | Faixa | Conf. | Nota de conteúdo                                                                                                                                                                               | Link                                                                                     | Sugestão                                                                                      |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------ | ----- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `pg-24571`                                         | Der Struwwelpeter                                                                        | Heinrich Hoffmann  | livre | média | versos de advertência para crianças com castigos cruéis (polegares cortados, menina queimada), em tom de fábula. Sensível: história dos meninos que zombam de um menino negro ("Mohr"): inten… | [fonte](https://www.gutenberg.org/ebooks/24571)                                          | subir para 12 (castigos cruéis e imagem racista de época; ou manter livre com aviso)          |
| `pg-16`                                            | Peter Pan                                                                                | J. M. Barrie       | livre | média | clássico infantil; lutas com piratas e Gancho devorado pelo crocodilo, sem detalhe. Sensível: "Redskins" e a tribo "piccaninny": retrato racista de indígenas, de época                        | [fonte](https://www.gutenberg.org/ebooks/16)                                             | subir para 12 (retrato racista dos "peles-vermelhas" e violência de época)                    |
| `ws-pt-a-escrava-isaura`                           | A escrava Isaura                                                                         | Bernardo Guimarães | 12    | média | escravidão: perseguição e assédio do senhor à escrava, castigos, sem cena explícita. Sensível: escravidão como tema central; a heroína é valorizada por ser "branca"; termos de época          | [fonte](https://pt.wikisource.org/wiki/A_escrava_Isaura)                                 | manter 12, com contexto (escravidão)                                                          |
| `ws-pt-auto-da-barca-do-inferno`                   | Auto da Barca do Inferno                                                                 | Gil Vicente        | 12    | alta  | sátira moral; personagens condenados ao inferno, humor grosseiro. Sensível: o Judeu e a Alcoviteira caricaturados com preconceito de época                                                     | [fonte](https://pt.wikisource.org/wiki/Auto_da_Barca_do_Inferno)                         | manter 12, com aviso (antissemitismo de época)                                                |
| `ws-pt-dom-casmurro`                               | Dom Casmurro                                                                             | Machado de Assis   | 12    | alta  | ciúme e suspeita de adultério como tema central, sem cena de sexo                                                                                                                              | [fonte](https://pt.wikisource.org/wiki/Dom_Casmurro)                                     | manter 12 (a proposta é 12, não 16: adultério só suspeito); subir para 14 se quiser prudência |
| `se-mark-twain-the-adventures-of-huckleberry-finn` | The Adventures of Huckleberry Finn                                                       | Mark Twain         | 12    | média | fuga pelo rio: pai alcoólatra e violento, assassinatos e uma rixa de famílias com mortes. Sensível: a palavra n-word mais de 200 vezes; escravidão como tema; obra antirracista, mas pede con… | [fonte](https://standardebooks.org/ebooks/mark-twain/the-adventures-of-huckleberry-finn) | subir para 14 (n-word em toda a obra); manter 12 só com aviso                                 |
| `pg-74`                                            | The Adventures of Tom Sawyer, Complete                                                   | Mark Twain         | 12    | alta  | aventura de infância com um assassinato no cemitério e o vilão morto de fome numa caverna. Sensível: "Injun Joe" e a palavra n-word: linguagem racista de época                                | [fonte](https://www.gutenberg.org/ebooks/74)                                             | manter 12, com aviso (n-word e estereótipo de "Injun Joe")                                    |
| `pg-14765`                                         | El Gaucho Martín Fierro                                                                  | José Hernández     | 14    | média | vida de um gaúcho perseguido: duelos a faca, mortes, castigos no forte. Sensível: cena em que Fierro insulta e mata um negro com ofensas racistas; indígenas como selvagens                    | [fonte](https://www.gutenberg.org/ebooks/14765)                                          | manter 14, com aviso (assassinato com ofensas racistas)                                       |
| `se-joseph-conrad-heart-of-darkness`               | Heart of Darkness                                                                        | Joseph Conrad      | 14    | alta  | violência colonial no Congo: trabalho forçado, africanos morrendo de fome, cabeças em estacas. Sensível: racismo de época (n-word, africanos descritos como selvagens); obra sobre o horror c… | [fonte](https://standardebooks.org/ebooks/joseph-conrad/heart-of-darkness)               | manter 14, com aviso (violência colonial; 16 é defensável)                                    |
| `pg-23`                                            | Narrative of the Life of Frederick Douglass, an American Slave                           | Frederick Douglass | 14    | alta  | autobiografia de um escravizado: açoites e assassinatos de escravizados descritos com detalhe. Sensível: escravidão e violência racial descritas em primeira pessoa; termos de época           | [fonte](https://www.gutenberg.org/ebooks/23)                                             | manter 14 (valor educativo; violência da escravidão narrada)                                  |
| `se-h-p-lovecraft-short-fiction`                   | Short Fiction                                                                            | H. P. Lovecraft    | 14    | média | horror cósmico: mortes, loucura, mutilações, canibalismo sugerido. Sensível: racismo explícito e recorrente (o gato de "The Rats in the Walls" tem nome com n-word; "The Horror at Red Hook";… | [fonte](https://standardebooks.org/ebooks/h-p-lovecraft/short-fiction)                   | manter 14, com aviso de racismo explícito                                                     |
| `pg-15399`                                         | The Interesting Narrative of the Life of Olaudah Equiano, Or Gustavus Vassa, The African | Olaudah Equiano    | 14    | alta  | autobiografia de um africano escravizado: sequestro, açoites e torturas descritos. Sensível: escravidão e tráfico atlântico descritos em primeira pessoa                                       | [fonte](https://www.gutenberg.org/ebooks/15399)                                          | manter 14 (valor educativo; violência da escravidão narrada)                                  |

## 4. Conferir depois de aprovar

```bash
npx tsx scripts/livros/montar-catalogo.mjs --verificar
npx vitest run tests/livros-catalogo.test.ts
```

O primeiro confere o JSON publicado (filtro legal e proposta publicada com classificação); o segundo cobra que a
classificação do JSON é a da lista. Os dois arquivos mudados (`scripts/livros/classificacao.json` e
`public/catalogo/livros.json`) precisam ir a commit e a **deploy**: o catálogo é um asset estático, e menor só passa a
ver os livros depois do próximo deploy do Worker.

**Como desfazer.** O script não tem "desaprovar" (ele só mexe em proposta). Opções:

- Antes do commit: `git restore scripts/livros/classificacao.json public/catalogo/livros.json` volta tudo.
- Depois do commit: `git revert <sha do commit da aprovação>`.
- Um livro só: no `classificacao.json`, volte `"revisor"` para `"proposta-claude"` (e a `data` para a original) e, no
  `public/catalogo/livros.json`, o `"classificacao"` desse livro para `null`; conferir com os dois comandos acima. Rodar
  o script de novo NÃO desfaz (ele recalcula o JSON a partir da lista, mas não devolve revisor a ninguém).
- O jeito mais seguro de não aprovar um livro é nunca incluí-lo em `--ids`/filtro: sem aprovação ele fica invisível a
  menor, qualquer que seja a faixa proposta.

## Para o catálogo aparecer em produção

Aprovar a classificação não basta para ler. Estado verificado em 27/10/2026 (só leitura):

- Os **208 EPUBs curados do Gutenberg** existem em `data/livros-curados/` (fora do git, na máquina do dono; num worktree
  novo a pasta não existe, rode do checkout principal ou monte de novo com `curar-gutenberg.mjs`). O bucket
  `frasy-livros-staging` os tem; o de produção (`frasy-livros`) **não foi enviado**.
- `gh variable list --env production` não lista `VITE_LIVROS_URL`. Sem ela, o app avisa "cópia ainda não publicada" nos
  **208 de 328** livros (os 70 do Standard Ebooks e os 50 da Wikisource abrem direto da fonte).
- Pré-requisitos: `CLOUDFLARE_API_TOKEN` e `CLOUDFLARE_ACCOUNT_ID` no `.env`, token com escrita em R2, e a zona
  `frasy.com.br` ativa na Cloudflare (o domínio do bucket depende dela).

Procedimento exato (nada disso foi executado; fontes: `docs/GUIA-DO-DONO.md` C3, `docs/livros-catalogo.md` §3,
`docs/deploy.md` "R2: criar/conferir buckets" e "Modelos no R2"):

1. Criar bucket e CORS. O script é idempotente e já inclui `frasy-livros` e `frasy-livros-staging`; o CORS padrão
   libera GET/HEAD para `https://frasy.com.br`, o staging e `http://localhost:3100`:

   ```bash
   set -a; source .env; set +a
   node scripts/cloudflare/r2.mjs --dry-run
   node scripts/cloudflare/r2.mjs
   ```

   (`cors set` sobrescreve a política inteira; se houver outra origem, passe TODAS em `--origens`.)

2. Conferir e enviar os EPUBs (o `--enviar` usa o wrangler; sem a flag só imprime os comandos):

   ```bash
   npx tsx scripts/livros/curar-gutenberg.mjs --conferir
   npx tsx scripts/livros/curar-gutenberg.mjs --enviar --bucket=frasy-livros
   ```

3. Acesso público por **domínio próprio** `livros.frasy.com.br` (a recomendação do repo; `r2.dev` tem limite de taxa e
   "não é para produção", `docs/deploy.md`). Pelo painel: R2, bucket `frasy-livros`, Settings, Custom Domains. Ou pelo
   CLI: `npx wrangler r2 bucket domain add frasy-livros --domain livros.frasy.com.br --zone-id <id da zona>` (confira as
   flags com `--help`; o repo usa esse comando para `modelos.<domínio>`). Teste: `curl -I
https://livros.frasy.com.br/livros/pg-46.epub` deve dar 200 (o app pede `<URL>/livros/pg-<id>.epub`).
4. Definir a variável no Environment `production` (raiz do bucket, sem barra no fim) e fazer novo deploy:

   ```bash
   gh variable set VITE_LIVROS_URL --env production --body https://livros.frasy.com.br
   gh workflow run deploy-worker.yml -f ambiente=production
   ```

   O workflow `deploy-worker.yml` repassa `vars.VITE_LIVROS_URL` ao build; a CSP abre a origem sozinha.

5. Conferir: abrir um livro do Gutenberg em `/app` no leitor; o aviso "cópia ainda não publicada" some.

Fora do escopo, visto de passagem: `VITE_BERGAMOT_MODELOS_URL` do `production` aponta para um `r2.dev` (o mesmo do
staging), contra a recomendação do `docs/deploy.md` de usar `modelos.<domínio>` em produção.
