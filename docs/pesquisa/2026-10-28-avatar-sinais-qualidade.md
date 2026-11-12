# Qualidade das mãos do avatar que soletra (M4b)

Data: 28/10/2026. Ramo `feat/avatar-m4b-sinais`. Capturas do antes e do depois (VRM `bullidan.vrm`, câmera de mãos): `~/.claude/jobs/092d1bee/tmp/telas-sinais/qualidade/` (`asl-todas-ANTES-bullidan.png`, `asl-todas-DEPOIS-bullidan.png`, `asl-DEPOIS-B-E-M-N-S-T.png`, `libras-todas-DEPOIS-bullidan.png`).

## Honestidade

- **Nenhuma pose foi revisada por pessoas surdas.** Soletração do alfabeto manual, não tradução. A coluna "fidelidade" é AUTOAVALIADA por IA a partir de imagens de referência de domínio público citadas nos relatórios A1/P2 (ABC pict, Gallaudet, placa de 1875); **nada foi promovido**: nenhuma letra de Libras é "alta", e as notas das letras mexidas ficaram como estavam.
- Não reabri as imagens de referência nesta rodada (sem acesso offline a elas): as correções partem da descrição das formas e da comparação visual antes/depois. São melhorias plausíveis, não prova de fidelidade.
- Também não houve colisão entre dedos e polegar: o que depende de contato (M x N, ponta do polegar entre dedos, E, T, R) só se resolve com colisão ou revisão humana.
- Números 0 a 9: NÃO incluídos (sem referência confiável); ficam pulados e marcados ("Números não são soletrados").

## O que mudou nos dados

B, E e T mudaram em ASL e em Libras (as formas eram idênticas nas duas línguas por suposição); M e N mudaram só em ASL. Antes/depois nas capturas acima. G, H, R, P, Q, Z: sem mudança (não consegui melhorar sem colisão ou sem referência).

Calibração do polegar por rig (nova): o zero de `cmc_abd` e o ângulo de repouso no plano da palma são medidos no esqueleto normalizado de cada modelo e comparados com os do rig em que os dados foram autorados (Quaternius, medido com este mesmo código em um GLB real: elevação 27,7 graus, ângulo no plano -18,3). Nos VRM de teste a elevação deu 26,5 a 26,8 e o deslocamento do `cmc_flex` +11,6 a +11,8 graus.

## ASL

| Letra         | Fidelidade (autoavaliada) | Mudança                                                                                    | Defeito restante                                                                                    |
| ------------- | ------------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| A             | alta                      | sem mudança                                                                                | nenhum visto na captura; sem comparação com revisão humana                                          |
| B             | media                     | M4b: polegar passou a atravessar a palma (antes saía para o lado)                          | ponta do polegar mais baixa que na referência                                                       |
| C             | media                     | sem mudança                                                                                | nenhum visto na captura; sem comparação com revisão humana                                          |
| D             | media                     | sem mudança                                                                                | nenhum visto na captura; sem comparação com revisão humana                                          |
| E             | baixa                     | M4b: dedos em garra e polegar por baixo (antes quase um punho S)                           | ainda parecido com A/S; pontas não tocam o polegar                                                  |
| F             | media                     | sem mudança                                                                                | nenhum visto na captura; sem comparação com revisão humana                                          |
| G             | baixa                     | sem mudança                                                                                | sem defeito novo visto no VRM; no protótipo havia serrilhado manga-pele (peculiar ao modelo antigo) |
| H             | baixa                     | sem mudança                                                                                | idem G                                                                                              |
| I             | alta                      | sem mudança                                                                                | nenhum visto na captura; sem comparação com revisão humana                                          |
| J (movimento) | baixa                     | sem mudança                                                                                | nenhum visto na captura; sem comparação com revisão humana                                          |
| K             | media                     | sem mudança                                                                                | nenhum visto na captura; sem comparação com revisão humana                                          |
| L             | alta                      | sem mudança                                                                                | nenhum visto na captura; sem comparação com revisão humana                                          |
| M             | baixa                     | M4b (só ASL): punho de frente, polegar recolhido (antes mão de lado com polegar para fora) | M e N quase iguais; falta colisão para a ponta do polegar                                           |
| N             | baixa                     | M4b (só ASL): idem M                                                                       | idem M                                                                                              |
| O             | media                     | sem mudança                                                                                | nenhum visto na captura; sem comparação com revisão humana                                          |
| P             | baixa                     | sem mudança                                                                                | polegar não toca o médio                                                                            |
| Q             | baixa                     | sem mudança                                                                                | vão polegar-indicador maior que na referência                                                       |
| R             | baixa                     | sem mudança                                                                                | cruzamento só por sobreposição (sem colisão)                                                        |
| S             | media                     | sem mudança                                                                                | nenhum visto na captura; sem comparação com revisão humana                                          |
| T             | baixa                     | M4b: polegar visível entre indicador e médio (antes igual ao S)                            | polegar atravessa a malha dos dedos                                                                 |
| U             | alta                      | sem mudança                                                                                | nenhum visto na captura; sem comparação com revisão humana                                          |
| V             | alta                      | sem mudança                                                                                | nenhum visto na captura; sem comparação com revisão humana                                          |
| W             | alta                      | sem mudança                                                                                | nenhum visto na captura; sem comparação com revisão humana                                          |
| X             | media                     | sem mudança                                                                                | nenhum visto na captura; sem comparação com revisão humana                                          |
| Y             | alta                      | sem mudança                                                                                | nenhum visto na captura; sem comparação com revisão humana                                          |
| Z (movimento) | baixa                     | sem mudança                                                                                | nenhum visto na captura; sem comparação com revisão humana                                          |

## Libras

| Letra         | Fidelidade (autoavaliada) | Mudança                                                                                       | Defeito restante                                                                                    |
| ------------- | ------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| A             | media                     | sem mudança                                                                                   | nenhum visto na captura; sem comparação com revisão humana                                          |
| B             | media                     | M4b: polegar passou a atravessar a palma (antes saía para o lado)                             | ponta do polegar mais baixa que na referência                                                       |
| C             | media                     | sem mudança                                                                                   | nenhum visto na captura; sem comparação com revisão humana                                          |
| D             | media                     | sem mudança                                                                                   | nenhum visto na captura; sem comparação com revisão humana                                          |
| E             | baixa                     | M4b: dedos em garra e polegar por baixo (antes quase um punho S)                              | ainda parecido com A/S; pontas não tocam o polegar                                                  |
| F             | media                     | sem mudança                                                                                   | nenhum visto na captura; sem comparação com revisão humana                                          |
| G             | baixa                     | sem mudança                                                                                   | sem defeito novo visto no VRM; no protótipo havia serrilhado manga-pele (peculiar ao modelo antigo) |
| H (movimento) | baixa                     | sem mudança                                                                                   | idem G                                                                                              |
| I             | media                     | sem mudança                                                                                   | nenhum visto na captura; sem comparação com revisão humana                                          |
| J (movimento) | baixa                     | sem mudança                                                                                   | nenhum visto na captura; sem comparação com revisão humana                                          |
| K             | media                     | sem mudança                                                                                   | nenhum visto na captura; sem comparação com revisão humana                                          |
| L             | media                     | sem mudança                                                                                   | nenhum visto na captura; sem comparação com revisão humana                                          |
| M             | baixa                     | sem mudança (forma por suposição a partir da placa de 1875); mão aparece com dedos para baixo | forma não confirmada; M e N quase iguais                                                            |
| N             | baixa                     | sem mudança (forma por suposição a partir da placa de 1875); mão aparece com dedos para baixo | forma não confirmada; M e N quase iguais                                                            |
| O             | media                     | sem mudança                                                                                   | nenhum visto na captura; sem comparação com revisão humana                                          |
| P             | baixa                     | sem mudança                                                                                   | polegar não toca o médio                                                                            |
| Q             | baixa                     | sem mudança                                                                                   | vão polegar-indicador maior que na referência                                                       |
| R             | baixa                     | sem mudança                                                                                   | cruzamento só por sobreposição (sem colisão)                                                        |
| S             | media                     | sem mudança                                                                                   | nenhum visto na captura; sem comparação com revisão humana                                          |
| T             | baixa                     | M4b: polegar visível entre indicador e médio (antes igual ao S)                               | polegar atravessa a malha dos dedos                                                                 |
| U             | media                     | sem mudança                                                                                   | nenhum visto na captura; sem comparação com revisão humana                                          |
| V             | media                     | sem mudança                                                                                   | nenhum visto na captura; sem comparação com revisão humana                                          |
| W             | media                     | sem mudança                                                                                   | nenhum visto na captura; sem comparação com revisão humana                                          |
| X (movimento) | media                     | sem mudança                                                                                   | nenhum visto na captura; sem comparação com revisão humana                                          |
| Y             | media                     | sem mudança                                                                                   | nenhum visto na captura; sem comparação com revisão humana                                          |
| Z (movimento) | baixa                     | sem mudança                                                                                   | nenhum visto na captura; sem comparação com revisão humana                                          |
| Ç (movimento) | baixa                     | sem mudança                                                                                   | C com movimento descendente aproximado; forma por suposição                                         |

## Limites conhecidos

- Vistos só em Chromium com WebGL por software, em dois VRM de desenho (`milk`: mão de 11,8 cm, `bullidan`: mão de 29,7 cm); nenhum modelo de proporção humana realista, nenhum Safari/Firefox.
- O verificador de independência dos dedos passa nos dois modelos pelo critério da mão do próprio modelo; pelo critério estrito de 8 cm a 1,7 m o `milk` fica abaixo no polegar (7,4 cm) e no mínimo (6,9 e 7,9 cm) porque a mão dele é pequena. Os outros dedos andam 0,00 cm em todos os casos.
- Letras com movimento (H, J, X, Z, Ç em Libras; J, Z em ASL) seguem aproximadas.
- Convenção de til (Ã, Õ em Libras): balanço lateral, NÃO confirmada com surdos.

## Polimento de 29/10/2026 (ramo `feat/avatar-polimento-sinais`)

Continua valendo: nenhuma pose foi revisada por pessoas surdas; é soletração, não tradução.

- **ASL M e N:** a mão vira para baixo e os dedos caem sobre o polegar (M: três, N: dois), em vez de dois punhos de frente. **E** (ASL e Libras): garra com as quatro pontas à vista. **T**: polegar mais alto entre indicador e médio. **G**: polegar estendido (de frente quase não se vê: a mão mostra o dorso). **R**: mão 5 cm mais baixa, e o enquadramento "só mãos" sobe 2% da altura, para os dedos cruzados não saírem do quadro.
- **Números 0 a 9** nos dois alfabetos, por descrição das formas; em Libras, 1 a 5 são contagem pelos dedos e 6 a 9 reusam a ASL por suposição. Sem colisão: nas formas 6 a 9 o polegar só se aproxima do dedo.
- **Sem mudança:** H, P, Q, Z (não consegui melhorar sem colisão ou referência). Capturas: `$AVATAR_CAPTURAS` (`letras-*-antes/depois`).

## Lacunas do modo Libras, 29/10/2026 (ramo `feat/avatar-libras-lacunas-2`)

Continua valendo: nenhuma pose foi revisada por pessoas surdas; é soletração, não tradução. Sem referência nova: os ajustes partem de capturas do guia "Alfabeto manual" (antes e depois) e de uma medida de distância geométrica, não de comparação com gráficos de referência.

- **G e H** (ASL e Libras): mão girada para o polegar do G aparecer abaixo do indicador (antes sumia atrás dele) e polegar menos aberto. O polegar agora aparece; a distância G-H caiu de 41,6 para 37,3 (piso do teste: 34).
- **Q**: polegar mais aberto, separado do indicador (antes quase invisível).
- **Z**: base e percurso menores e mais ao centro, para a mão ficar no quadro.
- **M e N na ASL**: palma voltada a quem olha, dedos caídos sobre o polegar (M três, N dois, anelar recolhido); antes eram dois punhos quase iguais vistos de trás. A distância subiu de 16,1 para 23,2. Em Libras, M e N não mudaram.
- **P**: NÃO melhorou. Os dois dedos seguem para baixo e o polegar fica atrás; qualquer giro que mostrasse o polegar apontava os dedos para a câmera. Fica para revisão humana.
- Pisos por par em `tests/avatar-poses-distincao.test.ts` (regressão, não validação linguística). Pares idênticos por definição: I-J e C-Ç (só o movimento muda) e os algarismos que reusam formas de letras (0-O, 2-V, 9-F).
