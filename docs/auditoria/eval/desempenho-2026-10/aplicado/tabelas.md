### Tela parada (10 s de trace, mediana de 3; entre parênteses, o menor e o maior das 3)

| Tela | Perfil | Condição | Fio principal ms/s: antes | depois | Δ | rAF/s: antes → depois | Recálculos/s | Pinturas/s | GPU ms/s |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|
| Início | celular médio | sem sensor | 195 (185–200) | 24 (23–28) | -88% | 60 → 0 | 60 → 6 | 84 → 0 | 94 → 109 |
| Início | celular médio | sensor, aparelho parado | 960 (949–992) | 54 (54–58) | -94% | 79 → 0 | 143 → 7 | 78 → 0 | 123 → 117 |
| Início | celular médio | sensor, aparelho em movimento | 966 (793–968) | 918 (900–926) | -5% (ruído) | 87 → 109 | 151 → 120 | 81 → 27 | 119 → 117 |
| Início | celular fraco | sem sensor | 358 (325–377) | 30 (29–30) | -92% | 60 → 0 | 60 → 7 | 86 → 0 | 107 → 74 |
| Início | celular fraco | sensor, aparelho parado | 992 (991–993) | 67 (54–68) | -93% | 45 → 0 | 107 → 7 | 55 → 0 | 96 → 89 |
| Início | celular fraco | sensor, aparelho em movimento | 994 (993–994) | 991 (988–991) | -0% (ruído) | 46 → 75 | 108 → 101 | 55 → 27 | 94 → 94 |
| Início | computador | mouse parado | 47 (46–51) | 7 (6–7) | -86% | 120 → 0 | 60 → 8 | 129 → 11 | 72 → 58 |
| Início | computador | mouse em movimento | 265 (263–276) | 211 (210–211) | -20% | 234 → 226 | 216 → 130 | 309 → 282 | 147 → 142 |
| Início, Modo desempenho | celular médio | sem sensor | 50 (49–51) | 0 (0–0) | -99% | 60 → 0 | 0 → 0 | 0 → 0 | 4 → 0 |
| Jogar (saguão) | celular médio | sem sensor | 658 (652–669) | 460 (429–476) | -30% | 59 → 0 | 59 → 60 | 147 → 101 | 125 → 142 |
| Jogar (saguão) | celular médio | sensor, aparelho parado | 992 (986–992) | 614 (520–675) | -38% | 54 → 0 | 146 → 59 | 84 → 102 | 161 → 161 |
| Jogar (saguão) | celular médio | sensor, aparelho em movimento | 993 (992–993) | 991 (989–991) | -0% (ruído) | 51 → 68 | 140 → 130 | 78 → 75 | 153 → 145 |
| Jogar (saguão) | celular fraco | sem sensor | 951 (931–985) | 613 (609–617) | -36% | 57 → 0 | 57 → 60 | 143 → 95 | 114 → 117 |

### Navegar pelo menu (medidor de `navegar.mjs`; mediana de 3). Com o navegador ocioso antes do toque

| Perfil | Troca | 1ª visita, conteúdo: antes | depois | Δ | baixou no toque (arq.): antes → depois | INP 1ª: antes → depois | 2ª visita, conteúdo: antes | depois | Δ | assentou 2ª: antes → depois |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| celular médio | Capturar | 2402 | 616 | -74% | 64 → 1 | 136 → 120 | 329 | 275 | -16% | 1368 → 1344 |
| celular médio | Interprete | 473 | 381 | -19% | 10 → 8 | 200 → 168 | 411 | 319 | -22% | 1543 → 1479 |
| celular médio | Sair do Interprete | 307 | 226 | -26% | 0 → 0 | 48 → 48 | 297 | 214 | -28% | 1465 → 1432 |
| celular médio | Jogar | 1509 | 902 | -40% | 24 → 1 | 104 → 96 | 663 | 503 | -24% | 2899 → 2123 |
| celular médio | abrir Mais (p/ Estatisticas) | 383 | 242 | -37% | 0 → 0 | 592 → 456 | 315 | 280 | -11% | 1594 → 1424 |
| celular médio | Estatisticas | 1395 | 1106 | -21% | 10 → 7 | 536 → 464 | 1005 | 809 | -20% | 2501 → 1941 |
| celular médio | abrir Mais (p/ Personalizar) | 151 | 137 | -9% (ruído) | 0 → 0 | 224 → 224 | 131 | 131 | +0% (ruído) | 1545 → 1194 |
| celular médio | Personalizar | 1299 | 1334 | +3% (ruído) | 9 → 7 | 240 → 216 | 451 | 223 | -51% | 1985 → 1318 |
| celular médio | abrir Mais (p/ Ajustes) | 166 | 143 | -14% | 0 → 0 | 272 → 248 | 139 | 151 | +9% (ruído) | 1561 → 1212 |
| celular médio | Ajustes | 962 | 579 | -40% | 13 → 13 | 248 → 248 | 470 | 224 | -52% | 2159 → 1414 |
| celular médio | Inicio | 325 | 264 | -19% | 0 → 0 | 96 → 96 | 318 | 280 | -12% | 1479 → 1462 |

### Navegar pelo menu SEM o ocioso (quem toca logo depois da carga: só o pedido no toque)

| Perfil | Troca | 1ª visita, conteúdo: antes | depois | Δ | baixou no toque (arq.): antes → depois | INP 1ª: antes → depois | 2ª visita, conteúdo: antes | depois | Δ | assentou 2ª: antes → depois |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| celular médio | Capturar | 2305 | 1998 | -13% | 63 → 63 | 120 → 208 | 293 | 315 | +8% (ruído) | 1331 → 1394 |
| celular médio | Interprete | 428 | 378 | -12% | 10 → 10 | 168 → 168 | 346 | 374 | +8% (ruído) | 1478 → 1543 |
| celular médio | Sair do Interprete | 289 | 220 | -24% | 0 → 0 | 48 → 40 | 282 | 213 | -24% | 1431 → 1463 |
| celular médio | Jogar | 1386 | 1089 | -21% | 24 → 24 | 96 → 128 | 501 | 730 | +46% | 2533 → 3173 |
| celular médio | abrir Mais (p/ Estatisticas) | 255 | 220 | -14% | 0 → 0 | 440 → 408 | 239 | 377 | +58% | 1759 → 1564 |
| celular médio | Estatisticas | 1075 | 977 | -9% (ruído) | 10 → 10 | 360 → 432 | 799 | 1087 | +36% | 2302 → 2320 |
| celular médio | abrir Mais (p/ Personalizar) | 118 | 139 | +18% | 0 → 0 | 184 → 208 | 119 | 169 | +42% | 1513 → 1261 |
| celular médio | Personalizar | 1053 | 848 | -19% | 9 → 9 | 168 → 192 | 419 | 368 | -12% | 1941 → 1592 |
| celular médio | abrir Mais (p/ Ajustes) | 139 | 142 | +2% (ruído) | 0 → 0 | 232 → 248 | 131 | 176 | +34% | 1530 → 1261 |
| celular médio | Ajustes | 893 | 741 | -17% | 13 → 13 | 192 → 256 | 419 | 574 | +37% | 2095 → 2109 |
| celular médio | Inicio | 297 | 264 | -11% | 0 → 0 | 88 → 96 | 294 | 309 | +5% (ruído) | 1446 → 1566 |

### Interações, só com trace (sem medidor na página; mediana de 3)

| Perfil | Interação | Tarefas no fio principal ms: antes | depois | Δ | Quadros feitos no fio principal | Descartados | INP | Maior tarefa ms | Layout ms | Estilo ms |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| celular médio | abrir Mais | 1155 | 824 | -29% | 157 → 66 | 15 → 7 | 288 → 320 | 159 → 182 | 60 → 66 | 470 → 455 |
| celular médio | ir para Jogar (pedacos ja baixados) | 2782 | 2461 | -12% | 89 → 88 | 110 → 109 | 96 → 96 | 353 → 347 | 597 → 609 | 472 → 341 |
| celular médio | abrir Memoria | 1449 | 1130 | -22% | 181 → 120 | 40 → 32 | 240 → 224 | 100 → 82 | 171 → 149 | 452 → 376 |
| celular médio | virar uma carta | 236 | 148 | -37% | 94 → 38 | 0 → 0 | 32 → 32 | 11 → 11 | 7 → 7 | 41 → 28 |
| celular fraco | abrir Mais | 1702 | 1249 | -27% | 151 → 64 | 31 → 13 | 424 → 480 | 174 → 311 | 95 → 97 | 676 → 695 |
| celular fraco | ir para Jogar (pedacos ja baixados) | 3292 | 3221 | -2% (ruído) | 27 → 25 | 171 → 163 | 136 → 160 | 535 → 549 | 875 → 807 | 369 → 397 |
| celular fraco | abrir Memoria | 2171 | 1832 | -16% | 161 → 109 | 68 → 57 | 384 → 352 | 174 → 172 | 273 → 252 | 692 → 634 |
| celular fraco | virar uma carta | 380 | 264 | -31% | 96 → 39 | 1 → 1 | 48 → 48 | 19 → 22 | 12 → 12 | 63 → 49 |
| computador | abrir Mais | 303 | 314 | +4% (ruído) | 157 → 140 | 4 → 5 | 56 → 48 | 19 → 16 | 8 → 5 | 133 → 130 |
| computador | ir para Jogar (pedacos ja baixados) | 647 | 566 | -13% | 182 → 127 | 13 → 12 | 24 → 24 | 83 → 86 | 94 → 58 | 82 → 42 |
| computador | abrir Memoria | 453 | 283 | -38% | 192 → 126 | 7 → 5 | 136 → 112 | 34 → 28 | 33 → 21 | 167 → 69 |
| computador | virar uma carta | 96 | 88 | -8% (ruído) | 93 → 92 | 0 → 0 | 32 → 16 | 3 → 5 | 1 → 1 | 29 → 19 |

### Carga (celular médio, mediana de 3)

| Carga | Medida | antes | depois | Δ |
|---|---|---:|---:|---:|
| fria | FCP ms | 841 | 852 | +1% (ruído) |
| fria | LCP ms | 4466 | 4441 | -1% (ruído) |
| fria | até interagir ms | 3384 | 5455 | +61% |
| fria | TBT ms | 299 | 276 | -8% (ruído) |
| fria | maior tarefa longa ms | 272 | 224 | -18% |
| fria | CLS | 0.0201 | 0.0201 | – |
| fria | pedidos (até a rede sossegar) | 85 | 188 | +121% |
| fria | kB baixados (até a rede sossegar) | 484 | 916 | +89% |
| fria | JS descomprimido kB | 651 | 1597 | +145% |
| fria | fio principal ms (até a rede sossegar) | 1984 | 2502 | +26% |
| fria | heap MB | 3.6 | 5 | +39% |
| quente | FCP ms | 344 | 358 | +4% (ruído) |
| quente | LCP ms | 736 | 785 | +7% (ruído) |
| quente | até interagir ms | 796 | 831 | +4% (ruído) |
| quente | TBT ms | 118 | 109 | -8% (ruído) |
| quente | maior tarefa longa ms | 109 | 124 | +14% |
| quente | CLS | 0 | 0 | – |
| quente | pedidos (até a rede sossegar) | 85 | 188 | +121% |
| quente | kB baixados (até a rede sossegar) | 2 | 2 | +0% (ruído) |
| quente | JS descomprimido kB | 651 | 1597 | +145% |
| quente | fio principal ms (até a rede sossegar) | 1170 | 1293 | +11% |
| quente | heap MB | 4.9 | 6.9 | +41% |
