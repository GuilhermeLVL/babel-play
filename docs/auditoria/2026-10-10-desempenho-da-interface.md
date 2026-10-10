# Desempenho da interface: onde está a lentidão e o que consertar

Data: 10/10/2026. Alvo: `https://babel-play.pages.dev` (edição estática, commit `aa97cf3d`). Esta etapa só mede e diagnostica; nenhum arquivo do app foi alterado.

Dados brutos, tabelas completas e os scripts de medida: `docs/auditoria/eval/desempenho-2026-10/` (`tabelas.md`, `dados/*.json`, `scripts/`).

## 1. Resumo

A carga não é o problema. No celular médio simulado (CPU 4×, 4G), a primeira carga tem LCP de 2,2 s, TBT de 121 ms e CLS de 0,02; a segunda, LCP de 0,7 s. Tudo dentro do "bom" das Core Web Vitals.

A lentidão está no que acontece depois que a tela abre. São cinco causas, todas medidas:

1. **O app nunca fica parado.** Com a tela do Início aberta e ninguém tocando, o fio principal trabalha 24% do tempo (240 ms a cada segundo) no celular médio. Com o sensor de orientação do aparelho ligado, que é o caso de um celular na mão, sobe para 86%, e para 99% no celular fraco. No saguão do Jogar são 51% sem sensor e 99% com sensor, já no celular médio. Qualquer toque disputa o processador com esse trabalho.
2. **Entrar no Jogar custa cerca de 1,2 s de script por vez**, mesmo com tudo já baixado, e isso não depende dos efeitos: com o Modo desempenho ligado continua em 1,0 s. São contas do saguão refeitas a cada entrada.
3. **Toda troca de tela espera 150 ms antes de começar, e só então pede o código da tela.** Na primeira visita (4G) o conteúdo leva de 0,6 a 1,5 s para aparecer; depois, cerca de 0,3 s. E a tela só assenta entre 1,4 e 3,1 s depois do toque, por causa da entrada em cascata.
4. **Abrir o painel "Mais" responde em 176 a 496 ms (INP)** no celular médio e em 312 a 744 ms no fraco. Sem placa de vídeo (aproximação de um aparelho de GPU fraca), 57% dos quadros dessa abertura são descartados, e a causa medida é o vidro (`backdrop-filter`), não o desfoque das entradas.
5. **Na captura, cada fala nova custa mais que a anterior**: de 45 para 77 ms depois de 200 falas, com o DOM indo de 382 para 3.774 nós.

No computador sem limite de CPU a navegação está boa (INP até 80 ms, nenhuma tarefa longa). O que aparece ali é o custo de mexer o mouse: 25% de um núcleo rápido, 218 recálculos de estilo e 319 pinturas por segundo.

O que dá para ganhar sem mudar nada do desenho: o Início parado cai de 240 para 23 ms/s (medido com o código de produção remendado no laboratório), a primeira visita a cada tela fica igual à segunda (até 1 s a menos), e a entrada no Jogar perde a maior parte do 1,2 s de script. O que depende de decisão do dono: o vidro no celular, a duração da entrada das telas, e a inclinação pelo sensor em aparelho fraco.

## 2. Como foi medido

| Item | Como |
|---|---|
| Ferramenta | Playwright 1.62.1 dirigindo o `chrome-headless-shell` do próprio Playwright (Chromium 151) por CDP: `Emulation.setCPUThrottlingRate`, `Network.emulateNetworkConditions`, `Performance.getMetrics`, `Tracing`, `Profiler`, `PerformanceObserver` (`longtask`, `event`, `layout-shift`, `largest-contentful-paint`). O MCP `chrome-devtools` e o Lighthouse não foram usados. |
| Placa de vídeo | A da máquina (AMD RX 6800, ANGLE/D3D11), a 60 Hz. O Chromium com janela desta máquina roda a 268 Hz (monitor de 280 Hz), o que multiplica por 4,5 o custo de todo laço por quadro; por isso a medida foi no modo que fixa 60 Hz. As medidas da primeira hora, a 268 Hz, estão em `dados/hz268/` e não entram em nenhuma tabela. |
| Sem placa | Mesma coisa com desenho por software (SwiftShader), como aproximação de aparelho com GPU fraca. |
| Perfis | celular médio: 390×844, DPR 3, toque, CPU 4×, 4G (9 Mbit/s, 165 ms); celular fraco: igual com CPU 6×; computador: 1440×900 sem limite; "Quest": 1280×720, CPU 4×, com o agente de usuário do Quest (o app se classifica como `quest`). |
| Sensor | No celular real o sensor de orientação entrega leituras o tempo todo. Aqui elas foram simuladas: 60 eventos `deviceorientation` por segundo, com oscilação de 1,5° a 2° e tremor de 0,3°. As tabelas dizem "com sensor" ou "sem sensor". O laço que o app liga com o sensor não depende da frequência dos eventos: basta um evento para ele rodar a cada quadro, para sempre (`sentidos.ts:499-513`). |
| Repetições | 3 por jornada e perfil; a tabela traz a mediana. Onde foram menos, a coluna `n` diz. |
| Navegação e jogos | Um medidor na página marca o toque (`pointerdown`), a troca do React, o conteúdo de verdade no DOM, o quadro seguinte ("pintou") e o fim de todas as animações finitas ("assentou"). INP é a maior entrada de `event` com `interactionId` na janela. |
| Limite do medidor | Esse medidor pede um quadro por vsync. Em produção o app já faz isso sozinho (o laço da aura), então os números de produção valem; mas ele esconde o ganho de um conserto que pare o laço. Por isso os experimentos "antes × depois" foram refeitos só com trace, sem medidor na página (seção 5). |
| Parado e rolagem | Trace de 10 s (ou do gesto), sem medidor na página. Rolagem com gesto sintético de toque (`Input.synthesizeScrollGesture`). |
| Experimentos | O pacote publicado, com um trecho trocado na hora por interceptação de rede (`scripts/lib.mjs`, opção `exp`). Servem para medir quanto um conserto renderia; não são o conserto. |
| Habilidades | `performance-optimization` e `react-best-practices` foram carregadas e o método seguido (medir, achar o gargalo, propor, guardar contra regressão). |

Ruído: havia outro agente rodando testes com navegador na mesma máquina durante parte das medidas. As medianas de 3 absorvem parte disso; diferenças abaixo de 10% entre duas variantes não devem ser lidas como ganho.

## 3. Carga (jornada 1)

Mediana de 3, em ms. "Até interagir" é o fim da última tarefa longa depois do primeiro conteúdo.

| Perfil | Carga | FCP | LCP | Até interagir | TBT | CLS | Pedidos | kB baixados | JS descomprimido |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| celular médio | fria | 944 | 2.155 | 2.016 | 121 | 0,019 | 85 | 509 | 646 kB |
| celular médio | com cache | 344 | 729 | 807 | 95 | 0 | 85 | 2 | 646 kB |
| celular fraco | fria | 1.039 | 2.294 | 2.234 | 311 | 0,020 | 85 | 509 | 646 kB |
| celular fraco | com cache | 394 | 1.031 | 1.170 | 249 | 0 | 85 | 2 | 646 kB |
| computador | fria | 341 | 833 | 558 | 0 | 0 | 85 | 509 | 646 kB |
| computador | com cache | 134 | 166 | 134 | 0 | 0 | 85 | 2 | 646 kB |
| Quest | fria | 406 | 1.124 | 1.127 | 137 | 0,053 | 88 | 516 | 653 kB |
| Quest | com cache | 208 | 521 | 597 | 69 | 0,077 | 88 | 2 | 653 kB |
| celular médio, reduzir movimento | fria | 947 | 2.226 | 2.004 | 128 | 0,019 | 85 | 509 | 646 kB |
| celular médio, Modo desempenho | fria | 936 | 1.490 | 1.972 | 110 | 0 | 84 | 503 | 629 kB |

O que desce no arranque: 75 arquivos de script (311 kB na rede), 6 folhas de estilo (113 kB), 3 fontes (101 kB: Inter, Archivo e IBM Plex Mono 700). Dos 75 scripts, 61 têm menos de 2 kB: são ícones do `lucide-react` e utilitários, um arquivo cada.

Cobertura no Início (celular): dos 637 kB de JS que descem, 298 kB (47%) são executados até a tela assentar. As maiores sobras: `index` 123 kB, `vendor-react` 121 kB, `servidor` 26 kB. A folha da camada de movimento (`estilos-*.css`, 136 kB) usa 7% das suas regras no Início.

Leitura: a carga está boa em todos os perfis. O único ponto fora é o CLS do Quest (0,05 a 0,08), ainda dentro do "bom" (até 0,1). Não há ganho grande a buscar aqui.

## 4. O que foi medido depois da carga

### 4.1 Parado (jornada 6)

Tela aberta, 6 s de espera, depois 10 s de trace sem tocar em nada. Mediana de 3. "Fio principal" é o tempo de relógio ocupado, já com a CPU limitada. As três últimas colunas são CPU real da máquina, sem limite: num celular custam mais.

| Tela e condição | Fio principal | ms/s | Laços por s (rAF) | Recálculos de estilo/s | Pinturas/s | Processo da GPU ms/s | Worker das partículas ms/s |
|---|---:|---:|---:|---:|---:|---:|---:|
| Início, celular médio, sem sensor | 24% | 240 | 60 | 60 | 86 | 127 | 18 |
| Início, celular médio, com sensor | 86% | 860 | 109 | 157 | 96 | 121 | 15 |
| Início, celular fraco, sem sensor | 26% | 257 | 60 | 60 | 86 | 90 | 13 |
| Início, celular fraco, com sensor | 99% | 991 | 53 | 100 | 56 | 120 | 15 |
| Início, celular médio, reduzir movimento | 30% | 299 | 60 | 60 | 86 | 151 | 22 |
| Início, celular médio, Modo desempenho | 9,5% | 95 | 60 | 0 | 0 | 6 | 0 |
| Início, celular médio, Modo desempenho, com sensor | 8,7% | 87 | 60 | 0 | 0 | 5 | 0 |
| Início, celular médio, sem placa de vídeo | 23% | 225 | 60 | 60 | 86 | 267 | 46 |
| Capturar, celular médio, com sensor | 17% | 173 | 120 | 120 | 86 | 79 | – |
| Jogar (saguão, quem volta), celular médio, sem sensor | 51% | 507 | 60 | 60 (105 elementos cada) | 151 | 121 | – |
| Jogar (saguão, quem volta), celular médio, com sensor | 99% | 989 | 69 | 170 (50 elementos cada) | 104 | 155 | – |
| Jogar (primeira visita, seletor de fonte aberto), celular médio, sem sensor | 72% | 718 | 59 | 59 (106 elementos cada) | 148 | 176 | 12 |
| Jogar (primeira visita, seletor de fonte aberto), celular médio, com sensor | 87% | 873 | 117 | 117 | 148 | 196 | 15 |
| Início, Quest | 14% | 138 | 60 | 60 | 129 | 61 | 13 |
| Início, computador, mouse parado sobre um cartão | 5% | 50 | 120 | 60 | 129 | 79 | 14 |
| Início, computador, mouse em movimento | 25% | 253 | 226 | 218 | 319 | 179 | 17 |

Três leituras:

- "Reduzir movimento" do sistema não muda nada (30% contra 24%, dentro do ruído). É a decisão de 08/10 (`base.ts:46-51`, `useAparencia.ts:82-89`): as animações nascem ligadas em todo aparelho e só o interruptor do app as desliga.
- O Modo desempenho derruba a GPU a quase zero, mas o fio principal continua em 9,5%: um laço de 60 chamadas por segundo segue rodando sem desenhar nada. É o laço da aura, que testa `polido()` e se reagenda mesmo com a camada desligada (`ponteiro.ts:166-176`).
- O React não participa disso: nenhum commit em 5 s parado no Início, no Jogar, na Memória ou no Capturar (`dados/react-cel-medio.json`).

### 4.2 Navegar pelo menu (jornada 2)

Celular médio, sem sensor, mediana de 3, em ms. "Conteúdo" é do toque até a tela nova estar no DOM sem esqueleto; "assentou" é o fim das animações de entrada.

| Troca | 1ª visita: conteúdo | pintou | assentou | INP | Tarefas longas (soma / maior) | Baixou | 2ª visita: conteúdo | pintou | assentou | INP | Tarefas longas (soma / maior) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Capturar | 1.050 | 1.102 | 2.108 | 192 | 484 / 90 | 60 arq., 219 kB | 337 | 383 | 1.408 | 128 | 59 / 59 |
| Intérprete | 508 | 606 | 1.930 | 216 | 394 / 139 | 10 arq., 21 kB | 359 | 373 | 1.495 | 128 | 79 / 79 |
| Sair do Intérprete (volta ao Início) | 309 | 388 | 1.601 | 48 | 155 / 155 | – | 283 | 340 | 1.548 | 48 | 119 / 119 |
| Jogar | 1.289 | 1.748 | 3.134 | 112 | 1.435 / 519 | 22 arq., 177 kB | 535 | 755 | 1.998 | 96 | 931 / 229 |
| abrir "Mais" | 338 | 492 | 1.515 | 496 | 633 / 193 | – | 233 | 378 | 1.744 | 384 | 444 / 282 |
| Estatísticas (1ª visita medida na 2ª volta) | 985 | 1.099 | 2.472 | 376 | 695 / 248 | 6 arq., 13 kB | – | – | – | – | – |
| Personalizar | 1.501 | 1.621 | 3.020 | 528 | 1.298 / 388 | 9 arq., 37 kB | 456 | 625 | 1.995 | 200 | 366 / 208 |
| Biblioteca (na edição estática é só o aviso "na versão completa") | 796 | 806 | 1.391 | 280 | 417 / 183 | 1 arq. | 398 | 411 | 995 | 208 | 174 / 123 |
| Vocabulário (idem) | 237 | 250 | 580 | 160 | 87 / 87 | – | 223 | 237 | 548 | 136 | 77 / 77 |
| Ajustes | 584 | 727 | 2.080 | 168 | 658 / 219 | 16 arq., 36 kB | 274 | 581 | 1.928 | 144 | 387 / 317 |
| Início | 320 | 382 | 1.597 | 112 | 96 / 96 | – | 299 | 355 | 1.563 | 96 | 89 / 89 |

Com o sensor ligado os tempos até o conteúdo e o INP ficam no mesmo patamar (diferenças dentro do ruído: `dados/navegar-giro-cel-medio.json`). O sensor ocupa o fio principal em fatias pequenas, de modo que o toque entra entre elas; o que ele rouba é a folga de cada quadro, não a resposta ao toque.

Os outros perfis, nas trocas mais pesadas (mediana de 3):

| Troca | Celular fraco, com sensor: conteúdo / assentou / INP / maior tarefa | Quest: conteúdo / assentou / INP / maior tarefa | Computador: conteúdo / assentou / INP / maior tarefa |
|---|---|---|---|
| Capturar, 1ª | 1.256 / 2.362 / 328 / 128 | 786 / 1.839 / 144 / 117 | 564 / 1.601 / 80 / 68 |
| Jogar, 1ª | 1.711 / 3.641 / 232 / 653 | 870 / 2.311 / 40 / 279 | 533 / 1.938 / 32 / 0 |
| Jogar, 2ª | 866 / 2.488 / 200 / 403 | 407 / 1.811 / 56 / 139 | 218 / 1.582 / 24 / 0 |
| abrir "Mais" | 437 a 504 / 1.883 a 2.070 / 616 a 744 / 468 a 515 | 90 a 127 / 1.427 a 1.477 / 120 a 184 / 68 a 121 | 15 a 24 / 1.347 / 48 / 0 |
| Personalizar, 1ª | 1.903 / 3.605 / 688 / 470 | 783 / 2.191 / 72 / 315 | 515 / 1.899 / 32 / 64 |
| Ajustes, 2ª | 566 / 2.438 / 328 / 627 | 317 / 1.747 / 88 / 94 | 217 / 1.614 / 48 / 0 |

No celular fraco o pior quadro da entrada no Jogar chega a 1.267 ms (primeira visita).

### 4.3 Jogar (jornada 3)

Celular médio, mediana; cartas: 21 a 24 toques por linha.

| Passo | Conteúdo | Assentou | INP mediana / pior | Tarefas longas (soma / maior) | Pior quadro |
|---|---:|---:|---:|---:|---:|
| Memória: abrir | 798 | 2.336 | 240 / 408 | 524 / 95 | 150 |
| Memória: fechar a explicação | 372 | 512 | 96 / 440 | 0 | 50 |
| Memória: virar carta (1ª do par) | 29 | 762 | 48 / 80 | 0 | 17 |
| Memória: virar carta (2ª do par) | 29 | 762 | 40 / 48 | 0 | 17 |
| Memória: último par (fim da rodada) | 29 | 2.189 | 48 / 48 | 362 / 313 | 67 |
| Memória: sair da rodada (com sensor, n=2) | 386 | 2.032 | 160 / 176 | 986 / 293 | 333 |
| Caça-palavras: abrir (com sensor, n=2) | 922 | 1.994 | 428 / 496 | 594 / 165 | 250 |
| Caça-palavras: arrastar sobre as letras (n=6) | – | – | 88 a 104 | 0 | 33 |
| Caça-palavras: ajuda "Radar" (n=2) | 104 | 1.220 | 120 / 128 | 0 | 58 |
| Caça-palavras: sair da rodada (n=2) | 362 | 1.937 | 120 / 120 | 829 / 270 | 400 |

Jogar em si está bom: virar carta responde em 40 a 48 ms e nenhum quadro passa de 17 ms. O que pesa é entrar e sair da rodada. "Sair da rodada" volta ao saguão e paga o custo do saguão (seção 5, gargalo 2).

Com o sensor ligado, cada carta ainda responde em 72 ms (pior 104), mas o fio principal trabalha muito mais durante a rodada: as cartas não viradas são alvo da inclinação (`sentidos.ts:397-398`).

No computador: abrir a Memória 520 ms, INP 96; cartas 32 ms; nenhuma tarefa longa fora do fim da rodada (296 ms somados, maior 69).

No celular fraco, com sensor: abrir a Memória tem INP de 320 ms (pior 1.088) e 860 ms de tarefas longas; cada carta responde em 72 a 80 ms (pior 152); o fim da rodada soma 1.011 ms de tarefas longas (maior 449). Sair da rodada e a Caça-palavras só têm uma execução válida nesse perfil (`dados/jogos-giro-cel-fraco.json`).

A Caça-palavras não foi jogada até o fim, e a Memória foi (os pares estão no DOM em `data-par`).

### 4.4 Capturar (jornada 4)

Celular médio, com sensor, mediana de 3.

| Passo | Conteúdo | Assentou | INP | Maior tarefa longa |
|---|---:|---:|---:|---:|
| Abrir a tela (1ª vez, 60 arquivos, 219 kB, 527 kB de JS) | 1.113 | 2.170 | 232 | 99 |
| Abrir "Como isto funciona" (1ª / 2ª) | 205 / 119 | 997 / 915 | 232 / 144 | 143 / 61 |
| Fechar "Como isto funciona" | 162 / 155 | 347 / 343 | 184 / 176 | 73 / 75 |
| Abrir "Ajustes da captura" (1ª / 2ª) | 198 / 129 | 1.078 / 997 | 224 / 144 | 150 / 74 |
| Fechar "Ajustes da captura" | 223 / 199 | 496 / 491 | 248 / 224 | 105 / 110 |

Falas: o pacote publicado traz o gancho de teste `window.__simFalas` (`LiveCapture.tsx:1450-1472`), que acrescenta falas já transcritas pelo mesmo estado que o pipeline escreve. Com 200 falas, uma a cada 60 ms:

| | Celular médio | Computador |
|---|---:|---:|
| Custo de uma fala até o 2º quadro: falas 1 a 10 | 45,5 ms | 22,1 ms |
| Falas do meio | 51,5 ms | 21,8 ms |
| Falas 191 a 200 | 77 ms | 21,6 ms |
| Pior | 121,5 ms | 36,6 ms |
| Nós do DOM, antes e depois | 382 → 3.774 | 386 → 3.778 |
| No total: script / estilo / layout | 2.909 / 8.808 / 1.106 ms | 503 / 537 / 209 ms |

O estilo é três vezes o script. O React faz 2 commits por fala. A contagem de fibras "que trabalharam" cresceu com a lista (133, 856 e 2.456 por fala com 10, 100 e 300 falas), mas esse contador conta também fibras reaproveitadas sem render, então não prova que as linhas antigas são renderizadas de novo; a linha é `memo` (`HistoricoDoPrototipo.tsx:39`) e as propriedades que ela recebe são estáveis.

Não foi medido: captura com áudio de verdade, com os modelos de fala rodando nos workers e as parciais chegando várias vezes por segundo.

### 4.5 Rolar (jornada 5)

Gesto de toque de ida e volta, mediana de 3, celular médio. Quadros contados no trace.

| Tela | Nós | Quadros/s | Fio principal ocupado, sem sensor | com sensor | Recálculos (elementos cada) | Tarefas longas |
|---|---:|---:|---:|---:|---:|---:|
| Início | 276 | 60 | 38% | 86% | 152 (7) | 1 (79 ms) |
| Jogar (grade, 18 cartões) | 609 | 60 | 78% | 82% | 538 (54) | 0 |
| Estatísticas | 808 | 61 | 19% | 23% | 179 (1) | 0 |
| Personalizar | 452 | 48 a 55 | 25% | 93% | 362 (1) | 0 |
| Ajustes | 390 | 51 a 53 | 28% | 28% | 412 (1) | 0 |

A rolagem em si é feita pelo compositor e mantém 60 quadros por segundo nesta máquina. O que as colunas mostram é quanto o fio principal fica ocupado enquanto isso: na grade do Jogar, 78%, com 54 elementos recalculados a cada quadro (as miniaturas animadas). Nesse estado, um toque durante a rolagem espera.

No computador: 6 a 7% de ocupação em todas as telas.

### 4.6 Saguão do Jogar parado, com e sem os remendos de laboratório

Celular médio, material da trilha já escolhido (quem volta), 18 cartões, 4 à vista. Mediana de 3.

| Variante | Fio principal | ms/s | rAF/s | Elementos por recálculo | Animações rodando / pausadas | Pinturas/s |
|---|---:|---:|---:|---:|---:|---:|
| produção, sem sensor | 51% | 507 | 60 | 105 | 53 / 0 | 151 |
| produção, com sensor | 99% | 989 | 69 | 50 (170 recálculos/s) | 69 / 0 | 104 |
| miniaturas só à vista | 32% | 319 | 60 | 29 | 15 / 38 | 149 |
| miniaturas só à vista + aura que para + sem pulso | 25,5% | 255 | 0 | 28 | 14 / 38 | 95 |

Mesmo com os três remendos sobram 255 ms/s: as miniaturas que estão à vista incluem animações que pintam (`mm-acende` anima `background` e `color`), e elas sozinhas obrigam o fio principal a produzir os 60 quadros.

## 5. Os gargalos, com causa e conserto

A ordem aqui é por tamanho do problema. A lista por ganho ÷ esforço está na seção 6.

### G1. O laço do sensor de orientação

**Evidência.** Início parado, celular médio: 240 ms/s sem sensor, 860 ms/s com sensor; celular fraco: 257 → 991 ms/s (99% do fio principal). 575 a 729 ms/s disso são recálculo de estilo. Rolando o Personalizar: 25% → 93%. No trace, cada recálculo ligado ao sensor custa cerca de 20 vezes o de um recálculo comum com o mesmo número de elementos (50 ms contra 0,9 ms para 28 e 7 elementos, no mesmo trace pesado: `dados/motivos-giro-cel-medio.json` × `dados/motivos-nada-cel-medio.json`).

**Causa.** `src/lib/polimento/sentidos.ts:470-496` (`quadroDoGiro`): a cada quadro, para até 16 alvos, chama `getAnimations()` (linha 482), escreve `transform` em linha (488), escreve `--mx` e `--my` na luz (491-492) e lê `offsetWidth` e `offsetHeight` depois de escrever. Os alvos têm `transition: transform 180ms` (`src/styles/polimento/polimento.css:52-58`), então cada escrita dispara uma transição nova; e a transição em curso faz o próprio laço pular o alvo no quadro seguinte (o teste da linha 482), de modo que a inclinação é atualizada aos saltos. O laço também move o ponteiro da aura a cada quadro (`moverPonteiro`, linha 478), o que impede o laço da aura de sossegar. Ele liga no primeiro evento do sensor e não para mais (`sentidos.ts:499-513`).

**O que não funcionou no laboratório.** Duas tentativas, registradas para não serem repetidas:

| Tentativa | Antes → depois (Início, com sensor) | Veredito |
|---|---|---|
| Ler tudo antes de escrever, tamanhos em cache (`giro-lote`) | 860 → 836 ms/s | dentro do ruído |
| Sem `getAnimations`, sem a transição de `transform` nos alvos, retângulo da aura em cache, sem o pulso (`giro-barato` + `aura-cache` + `sem-pulso`) | 860 → 991 ms/s | pior: sem o salto da transição, a escrita passa a acontecer nos 60 quadros |

Uma microbancada com as mesmas escritas isoladas na página (`scripts/giroMicro.mjs`) deu menos de 0,1 ms por escrita, abaixo da resolução do relógio. Ou seja: a escrita isolada é barata e o custo aparece no encadeamento por quadro. **A causa exata do custo por recálculo não foi isolada.**

**Conserto proposto.** (a) Sem perda visual: o laço dorme quando a inclinação não mudou além de um limiar (aparelho na mesa ou mão firme) e acorda no próximo evento; para de mover a aura quando o ponto não mudou. (b) Investigar com o código-fonte e mapas (build de perfil, `scripts/perf/telas/build-perfil.mjs`): painel de Desempenho com "estatísticas de seletor" no trace do sensor. (c) Se não houver conserto barato, é decisão do dono (seção 6, T3).

**Ganho esperado.** Até 620 ms/s no celular médio e 734 ms/s no fraco quando o laço dorme. Com o aparelho se movendo na mão, o ganho depende de (b) e não está medido.

**Risco visual.** Nenhum em (a). **Esforço.** Pequeno em (a); médio em (b).

### G2. Entrar no Jogar

**Evidência.** Trace sem medidor, celular médio, peças já baixadas: 2.781 ms de tarefas em 3,3 s (83% do fio principal), 10 tarefas longas, bloqueio de 1.331 ms, maior tarefa 396 ms; script 1.157 ms, layout 581 ms, estilo 381 ms; 112 quadros descartados contra 158 desenhados. Com o Modo desempenho ligado: script 1.010 ms, layout 580 ms, bloqueio 1.112 ms. O custo não é dos efeitos.

Perfil de CPU da mesma entrada (`dados/perfilCpu-revisita-cel-medio.json`), tempo próprio a 4×:

| Função | ms | Origem |
|---|---:|---|
| `getBoundingClientRect` chamado pelo laço da aura | 702 | `ponteiro.ts:172`: é onde o layout da tela nova acaba sendo feito |
| `chaveDaPalavra` (normaliza a palavra) | 220 | `src/core/texto/palavra.ts:14-20` |
| montagem de rodada | 99 | `Play-*.js` (`montarRodada`, `src/core/minigames/rodada`) |
| `getAnimations` chamado por `limpar` | 96 | `base.ts:84-89` |
| `getBoundingClientRect` chamado por `medir` (pílulas) | 78 | `telas.ts:32-46` |
| normalização para o Termo | 62 | `src/core/minigames/termo.ts:28` |
| `pecas` (lista dos blocos que entram) | 58 | `telas.ts:206-215` |
| coleta de lixo | 48 | – |
| normalização para o Caça-palavras | 44 | `src/core/minigames/wordsearch.ts:60` |
| filtro do índice | 33 | `indice-*.js` |

**Causa.** `src/components/views/Play.tsx` calcula a triagem do acervo e o estado dos 18 jogos em cerca de 30 `useMemo` (linhas 1600 a 2430: `triagem`, `jogaveis`, `acervoDaFonte`, `estados`, `ordenados`…), sobre as 2.784 palavras da trilha. O componente desmonta ao sair do Jogar, então tudo é refeito a cada entrada, inclusive ao sair de uma rodada. O React em si faz pouco: 12 commits na primeira entrada.

**Conserto proposto.** Guardar o resultado fora do componente, com chave pelo acervo e pela fonte (um mapa no módulo), de modo que voltar ao Jogar reaproveite; guardar a chave normalizada junto da palavra em vez de recalcular; calcular o estado dos jogos fora da tela depois da primeira pintura.

**Ganho esperado.** As funções de normalização e montagem somam 458 ms de tempo próprio dos 1.949 ms de JS da entrada (a 4×); é o piso do ganho. O teto é o script inteiro do saguão, cerca de 1,0 s. Não foi medido por experimento.

**Risco visual.** Nenhum. **Esforço.** Médio.

### G3. As miniaturas dos jogos animam todas, sempre, no toque

**Evidência.** No saguão há 53 animações infinitas rodando, com 4 dos 18 cartões à vista. Parado: 507 ms/s (51%), 105 elementos por recálculo, 151 pinturas por segundo; com sensor, 989 ms/s (99%). Rolando a grade: 78% do fio principal (92% no celular fraco com sensor).

**Causa.** `src/styles/polimento/minis.css:31-33`: com mouse, só a miniatura do cartão sob o ponteiro anima; com toque (`@media (hover: none)`), todas animam, inclusive as que estão fora da tela. Uma delas (`mm-acende`, `minis.css:49`) anima `background` e `color`, que pintam a cada quadro.

**Conserto proposto.** Animar só as miniaturas dos cartões à vista (um `IntersectionObserver` que pausa as outras). O que está na tela continua idêntico.

**Ganho esperado.** Medido (seção 4.6): 507 → 319 ms/s só com a pausa do que está fora da tela; 255 ms/s somando os consertos de G4. Para descer disso é preciso que as miniaturas à vista animem só `transform` e `opacity`: a `mm-acende` pode trocar a cor por uma camada que aparece e some. Esse segundo passo não foi medido.

**Risco visual.** Nenhum na pausa: o que pausa está fora da tela. Na `mm-acende`, a troca de cor precisa ser conferida lado a lado. **Esforço.** Pequeno.

### G4. O laço da aura e o pulso do contador

**Evidência.** Início parado, celular médio: 240 ms/s. Experimentos sobre o pacote publicado:

| Variante | Fio principal ms/s | rAF/s | Pinturas/s |
|---|---:|---:|---:|
| produção | 240 | 60 | 86 |
| só o pulso desligado | 200 | 60 | 0 |
| só o laço da aura parando ao chegar | 244 | 0 | 86 |
| os dois | 23 | 0 | 0 |
| os dois, sem partículas | 13 | 0 | 0 |

Cada um sozinho não resolve, porque qualquer um dos dois basta para obrigar o fio principal a produzir um quadro por vsync, e a partir daí todas as animações em curso passam a ser recalculadas nele. Só os dois juntos liberam o fio.

Nas interações (trace sem medidor, celular médio, produção → os dois consertos):

| Interação | Tarefas no fio principal | Quadros produzidos no fio principal | Quadros descartados | INP |
|---|---|---|---|---|
| abrir "Mais" | 1.295 → 875 ms (−32%) | 154 → 70 | 19 → 7 | 320 → 320 |
| ir para o Jogar | 2.781 → 2.657 ms (−4%) | 89 → 87 | 112 → 109 | 96 → 96 |
| abrir a Memória | 1.462 → 1.225 ms (−16%) | 178 → 120 | 43 → 36 | 240 → 224 |
| virar uma carta | 340 → 233 ms (−31%) | 94 → 38 | 0 → 0 | 32 → 32 |

**Causa.**
- `src/lib/polimento/ponteiro.ts:166-176` (`quadroDaAura`): `requestAnimationFrame` sem condição de parada, com `main.getBoundingClientRect()` a cada quadro (linha 172). Roda no celular, onde não há ponteiro, e roda com a camada desligada.
- `src/styles/polimento/efeitos.css:169-173` (`px-pulso`): anima `box-shadow`, que não é composto; estilo e pintura a cada quadro. O alvo é o contador de avisos do botão "Mais", presente em toda tela.

**Conserto proposto.** O laço da aura para quando a aura chega ao ponteiro (diferença abaixo de 0,05 px) e recomeça no próximo movimento; o retângulo do `main` fica em cache e é refeito por `ResizeObserver`; com a camada desligada o laço nem começa. O pulso vira um pseudo-elemento do mesmo tamanho e raio, animado com `transform: scale` e `opacity`.

**Ganho esperado.** O medido acima: 240 → 23 ms/s parado; 4% a 32% a menos de trabalho nas interações; no Modo desempenho, 95 → perto de 0 ms/s.

**Risco visual.** Nenhum na aura. No pulso, o anel precisa ser conferido lado a lado com o atual (a sombra cresce 10 px e some; o pseudo-elemento tem de crescer o mesmo). **Esforço.** Pequeno.

### G5. Abrir o painel "Mais", as folhas e os diálogos

**Evidência.** INP de 176 a 496 ms no celular médio e de 312 a 744 ms no fraco; maior tarefa longa de 110 a 282 ms (médio) e até 515 ms (fraco). Folhas do Capturar: INP de 144 a 248 ms. Abrir a Caça-palavras: 428 ms.

Sem placa de vídeo (SwiftShader), a abertura do "Mais" em 2,9 s:

| Variante | Quadros desenhados | Descartados | Processo da GPU (ms de CPU) |
|---|---:|---:|---:|
| produção | 79 | 104 | 2.647 |
| sem o desfoque das entradas e da tela recuada | 93 | 93 | 2.669 |
| sem partículas | 89 | 91 | 2.529 |
| sem `backdrop-filter` | 171 | 17 | 1.836 |
| sem os três | 172 | 15 | 603 |

Com a placa desta máquina a mesma abertura desenha 168 e descarta 19; o vidro não aparece como custo porque a placa sobra.

**Causa.**
- No fio principal: `src/lib/polimento/folha.ts:101-134` (`abrir`): lê `offsetHeight` do painel recém-inserido (linha 107), o que força o layout na hora; e cria uma animação por cartão do painel (linhas 119-131). `src/lib/polimento/telas.ts:383-400` (`atualizar`) roda depois de qualquer mutação do documento e mede todas as barras de abas com `getBoundingClientRect` (`medir`, linhas 32-46): 54 ms por abertura no perfil. O laço da aura, de novo, é onde o layout cai (428 ms no perfil).
- Na GPU: o véu com `backdrop-filter: blur(8px)` e o painel com `blur(20px) saturate(160%)` (`src/styles/polimento/telas.css:44-45` e `54-55`), mais a barra do celular com `blur(22px) saturate(170%)` (`celular.css:29-30`), por cima de uma tela que está encolhendo, desfocando e arredondando (`efeitos.css:38-49`) e de uma aura e partículas que se mexem. O que está atrás muda a cada quadro, então o vidro é refeito a cada quadro.

**Conserto proposto.** Sem perda visual: medir as pílulas só quando uma aba ou a rota muda, não a cada mutação; ler a altura do painel uma vez, antes de escrever; os consertos de G4. Com decisão do dono: o vidro no celular (seção 6, T1).

**Ganho esperado.** G4 já tira 32% do trabalho do fio principal nessa abertura. O ganho de quadros do vidro só vale para aparelho de GPU fraca e foi medido com desenho por software, não em aparelho.

**Risco visual.** Nenhum na parte do fio principal. **Esforço.** Pequeno.

### G6. A espera antes de trocar de tela e o código pedido tarde

**Evidência.** Mesmo com tudo em memória, do toque ao conteúdo passam de 274 a 359 ms nas telas leves (computador: 215 a 220 ms, quase tudo espera). Na primeira visita (4G): Capturar 1.050 ms, Jogar 1.289, Personalizar 1.501, Estatísticas 985, Ajustes 584.

**Causa.** `src/lib/polimento/telas.ts:249-280` (`trocarDeTela`): a tela atual sai em 150 ms e só então `trocar()` roda. É só aí que o React monta o componente `lazy` e o navegador pede o arquivo da tela (`src/App.tsx:10-30`, `src/lib/lazyComRecarga.ts`). Não há pré-carga em lugar nenhum.

**Conserto proposto.** Pedir o arquivo da tela no `pointerdown` do item do menu, em paralelo com a saída de 150 ms; e, com o navegador ocioso depois da carga, pré-carregar os arquivos das telas do menu (respeitando `saveData`). A animação fica igual.

**Ganho esperado.** A primeira visita passa a custar o que custa a segunda: Capturar 1.050 → cerca de 340 ms, Jogar 1.289 → 535, Personalizar 1.501 → 456, Ajustes 584 → 274. Medido como a diferença entre a 1ª e a 2ª volta.

**Risco visual.** Nenhum. **Esforço.** Pequeno. Custo: cerca de 470 kB baixados em segundo plano.

### G7. A entrada das telas

**Evidência.** "Assentou" entre 1,4 e 3,1 s no celular médio, até 3,6 s no fraco, e 1,3 a 2,7 s no computador sem limite. É a duração do desenho, não lentidão do aparelho.

**Causa.** `telas.ts:218-235`: cada bloco entra em 700 ms com atraso de 90 ms + 60 ms por bloco, até 12 blocos (810 ms de atraso no último), e o título entra palavra por palavra (760 ms, 75 ms entre palavras, `telas.ts:163-203`). Somado aos 150 ms da saída.

O desfoque dos quadros-chave (`ENTRA`, `telas.ts:134-137`) foi medido e pesa pouco: sem ele o processo da GPU gasta de 8% a 19% a menos nas interações e, sem placa, não se ganha quadro nenhum. A leitura de `getBoundingClientRect` por bloco em `entrar` (linha 228) custa 5 a 6 ms: descartada como causa.

**Conserto.** Só com decisão do dono (seção 6, T2).

### G8. Sair de uma rodada e o fim da rodada

**Evidência.** "Sair da rodada": tarefas longas de 829 a 986 ms somadas, maior de 270 a 293 ms, pior quadro de 333 a 400 ms. Último par da Memória: 362 ms somados, maior 313 ms.

**Causa.** Sair da rodada remonta o saguão (G2 e G3). O fim da rodada baixa 5 arquivos (8 kB) na hora e dispara a comemoração.

**Conserto.** Os de G2 e G3; pré-carregar a tela de fim de rodada quando a rodada começa.

### G9. Mouse em movimento no computador

**Evidência.** 234 ms/s de CPU real num núcleo rápido (25%), 218 recálculos de estilo e 319 pinturas por segundo, 226 chamadas de `requestAnimationFrame` por segundo; processo da GPU 179 ms/s. Com o mouse parado sobre um cartão: 120 rAF por segundo, para sempre.

**Causa.** Quatro coisas respondem ao mesmo `pointermove`:
- `ponteiro.ts:74-114` (`aoMover`): dois `getBoundingClientRect` e duas escritas de `--mx`/`--my` por evento;
- `src/lib/dispositivo/respostaAoApontar.ts`: escreve `--mx`/`--my` de novo, no próprio cartão. A variável é herdada, então o cartão inteiro é recalculado;
- `ponteiro.ts:48-58` (`quadroTilt`): o laço da inclinação só para quando o mouse sai do cartão; parado em cima, segue rodando;
- o laço da aura (G4) e o cursor (`cursor.ts:66-78`).

**Conserto proposto.** Um só dono para `--mx`/`--my` (a luz, não o cartão); o laço da inclinação para ao convergir; G4.

**Ganho esperado.** Não medido por experimento. **Risco visual.** Nenhum. **Esforço.** Pequeno.

### G10. A lista de falas da captura

**Evidência.** Seção 4.4: 45 → 77 ms por fala em 200 falas no celular médio; 17 nós novos por fala; estilo 8,8 s contra 2,9 s de script no total.

**Causa.** A lista não é virtualizada nem tem `content-visibility`; todas as falas ficam no DOM e entram em cada recálculo de documento.

**Conserto proposto.** `content-visibility: auto` com `contain-intrinsic-size` nas linhas (o mesmo que `src/styles/desempenho.css:15-18` já faz nas peças da Loja), ou janela virtual. Conferir a rolagem automática para o fim.

**Ganho esperado.** Não medido. **Risco visual.** Nenhum com `content-visibility`, desde que a altura reservada seja a real. **Esforço.** Médio.

### G11. As partículas

**Evidência.** Com o Início parado e os consertos de G4 aplicados, tirar as partículas leva o processo da GPU de 117 para 34,5 ms/s de CPU (sem limite) e zera o worker (14 a 22 ms/s). Sem placa de vídeo, o processo da GPU gasta 267 ms/s parado.

**Causa.** O laço já roda num worker (`src/lib/motorDeParticulas.ts`, da auditoria de 26/09), então o fio principal não paga. O que sobra é a tela: um `<canvas>` fixo de tela cheia, a DPR 2 (780×1688 no celular: `ParticleCanvas.tsx:150`), limpo e recomposto 60 vezes por segundo, embora o ambiente só desenhe na metade de cima (`motorDeParticulas.ts:471`).

**Conserto proposto.** Sem perda visual: um canvas do tamanho da faixa do ambiente e outro, de tela cheia, que só existe durante uma rajada. Com decisão do dono: seção 6, T4.

**Ganho esperado.** Não medido para a versão de dois canvas. **Esforço.** Médio.

### G12. Itens menores, medidos

| Item | Evidência | Causa | Conserto |
|---|---|---|---|
| `aplicarAcess` varre todas as folhas | 67 ms no arranque e 12 a 28 ms a cada tela nova (CPU 4×) | `base.ts:120-158`, chamado de novo a cada folha que entra (`base.ts:201-215`) | Visitar só as folhas novas; guardar a lista das regras `@media` na primeira passada |
| A folha da camada pesa em todo recálculo | Recalcular o documento do Jogar: 11,0 ms; sem `estilos-*.css`: 6,9 ms (37% a menos). Nesta máquina, sem limite | 84 seletores terminados em `:is(...)` respondem por 45% do tempo de casamento no maior recálculo medido; 186 seletores são testados contra todo elemento (`dados/seletores-*.json`) | No gerador (`scripts/polimento/trazer-css.mjs`), abrir o `:is()` final em seletores separados. Teto do ganho: os 37% |
| 61 arquivos de menos de 2 kB no arranque | 85 pedidos na carga; 60 na 1ª visita ao Capturar | Um pedaço por ícone do `lucide-react` | `manualChunks` juntando os ícones. Ganho pequeno em HTTP/2 |
| `respostaAoApontar` consulta `navigator.getGamepads()` | 4 ms na 1ª visita ao Capturar | Roda em todo aparelho | Só no Quest |
| `:has()` | 2,6 a 5,9 ms por interação | – | Descartado como causa |
| Leitura de `localStorage` em caminho quente | `rastroDoMouse.ts:133-150` lê depois do acelerador | – | Descartado como causa |
| React re-renderizando demais na navegação | 1 a 12 commits por interação; zero parado | – | Descartado como causa |

## 6. Lista ordenada por ganho ÷ esforço

### Sem nenhuma perda visual

| Ordem | Conserto | Gargalo | Ganho medido ou esperado | Esforço |
|---:|---|---|---|---|
| 1 | Laço da aura para quando chega; não roda com a camada desligada; retângulo em cache | G4 | Com o item 2: Início parado 240 → 23 ms/s; interações 4% a 32% mais leves; Modo desempenho 95 → ~0 ms/s | pequeno |
| 2 | `px-pulso` com `transform`/`opacity` em vez de `box-shadow` | G4 | Idem (só vale junto com o 1) | pequeno |
| 3 | Pedir o arquivo da tela no toque e pré-carregar em ocioso | G6 | 1ª visita: Capturar −710 ms, Jogar −750, Personalizar −1.045, Ajustes −310 | pequeno |
| 4 | Miniaturas do Jogar só animam à vista | G3 | Saguão parado 507 → 319 ms/s (255 com os itens 1 e 2) | pequeno |
| 5 | Laço do sensor dorme quando a inclinação não muda | G1 | Até 620 ms/s (médio) e 734 ms/s (fraco) com o aparelho parado; em movimento, não medido | pequeno |
| 6 | Pílulas medidas só quando aba ou rota mudam; altura do painel lida antes de escrever | G5 | 54 a 78 ms por interação a 4× | pequeno |
| 7 | Guardar as contas do saguão fora do componente | G2 | 458 ms (piso) a ~1,0 s (teto) de script por entrada no Jogar, a 4× | médio |
| 8 | Um dono para `--mx`/`--my`; laço da inclinação para ao convergir | G9 | Não medido | pequeno |
| 9 | `aplicarAcess` só nas folhas novas | G12 | 67 ms no arranque, 12 a 28 ms por tela nova | pequeno |
| 10 | `content-visibility` na lista de falas | G10 | Não medido | médio |
| 11 | Abrir o `:is()` final no gerador do CSS da camada | G12 | Até 37% do tempo de cada recálculo de documento no Jogar | médio |
| 12 | Partículas em dois canvas | G11 | Não medido | médio |
| 13 | Juntar os ícones num pedaço | G12 | Pequeno | pequeno |
| 14 | Investigar o custo por recálculo do laço do sensor com mapas de código | G1 | Desconhecido; é o maior custo medido e o de causa menos fechada | médio |

### Troca visual a decidir pelo dono

| | Troca | O que muda à vista | Evidência do ganho |
|---|---|---|---|
| T1 | Vidro (`backdrop-filter`) no celular: trocar o véu e o painel por fundo translúcido sem desfoque, ao menos em aparelho fraco | O que está atrás do painel deixa de aparecer borrado; fica só escurecido | Sem placa de vídeo, quadros descartados ao abrir o "Mais": 104 → 17. Não medido em aparelho |
| T2 | Encurtar a entrada das telas no celular (cascata e duração) e a saída de 150 ms | A tela assenta mais cedo; a cascata fica mais curta | Hoje a tela assenta entre 1,4 e 3,1 s; o tempo é do desenho |
| T3 | Inclinação pelo sensor: desligar no celular fraco, ou atualizar a 30 por segundo | Os cartões deixam de inclinar com o aparelho (ou inclinam menos liso) | 620 a 734 ms/s de fio principal |
| T4 | Partículas: DPR 1 no canvas ou 30 quadros por segundo no ambiente | Pontos um pouco menos nítidos ou movimento um pouco menos liso | Processo da GPU 117 → 34,5 ms/s é o teto (sem partículas) |
| T5 | Modo desempenho automático no celular fraco e respeito ao "reduzir movimento" do sistema | Reverte a decisão de 08/10 para esses aparelhos | Modo desempenho, celular médio: abrir "Mais" com INP 320 → 120 ms e 1.295 → 264 ms de tarefas; parado 240 → 95 ms/s |

O Modo desempenho, hoje, dá a medida do custo total dos efeitos: no Início parado, 60% do fio principal (240 → 95 ms/s) e 96% do processo da GPU (127 → 6 ms/s); ao abrir o "Mais", 80% do trabalho do fio principal. Ele não ajuda na entrada do Jogar (script 1.157 → 1.010 ms), que é conta, não efeito.

## 7. O que deveria virar portão na CI

O repositório já tem o orçamento do pacote (`scripts/perf/orcamento-bundle.mjs`, `scripts/perf/suite/slo.json`) e o medidor de telas (`scripts/perf/telas/medir-telas.mjs`). A auditoria de 26/09 já tinha apontado uma animação infinita de `box-shadow` (`respira`) custando cerca de 300 ms/s parado; a camada de movimento trouxe outra (`px-pulso`) e dois laços sem parada. Falta um portão para essa classe de problema.

| Portão | Limite proposto | Como medir |
|---|---|---|
| Tela parada | Depois de 6 s sem tocar, em Início, Jogar e Capturar (CPU 4×): 0 `requestAnimationFrame` por segundo, até 5 recálculos de estilo por segundo, 0 pinturas por segundo, até 30 ms/s de fio principal | `scripts/parado.mjs` desta auditoria, levado para `scripts/perf/telas/` |
| Tela parada com sensor | O mesmo, com `deviceorientation` simulado e depois interrompido: o laço tem de dormir | Idem, opção `giro` |
| Animação infinita só em propriedade composta | Nenhum `@keyframes` usado com `infinite` anima algo além de `transform` e `opacity` | Um teste que lê o CSS gerado; hoje reprovaria `px-pulso` e `mm-acende` |
| Resposta ao toque | INP até 200 ms em abrir "Mais", abrir uma folha e trocar de tela (CPU 4×, mediana de 3) | `medir-telas.mjs` já mede INP |
| Entrada no Jogar | Bloqueio (soma do que passa de 50 ms por tarefa) até 400 ms com as peças em memória (CPU 4×) | `scripts/tracoNav.mjs` |
| Primeira visita a uma tela | Conteúdo em até 600 ms no 4G simulado | `scripts/navegar.mjs` |
| Pedidos no arranque | Até 40 | `orcamento-bundle.mjs` |

Como as medidas variam com a máquina, os portões de tempo devem usar mediana de 3 e folga de 20%; os de contagem (rAF, pinturas, pedidos) podem ser exatos.

## 8. O que não foi medido

- **Aparelho de verdade.** Nenhum celular, nenhum Quest. A CPU foi limitada por software; a GPU é a de um computador de mesa, que não se limita. Todo número de GPU aqui é CPU do processo da GPU nesta máquina, ou desenho por software. O custo real do vidro, do desfoque e das partículas na GPU de um celular não foi medido.
- **Safari e iOS.** Só Chromium. No iPhone o sensor pede permissão no primeiro toque (`sentidos.ts:446-450`); o comportamento do WebKit com `backdrop-filter`, `OffscreenCanvas` e `linear()` não foi visto.
- **O sensor real.** A frequência e o ruído das leituras foram simulados. Que o Chrome do Android entrega `deviceorientation` sem pedir permissão é o comportamento conhecido, mas não foi conferido em aparelho nesta auditoria.
- **Captura com áudio.** Sem microfone no navegador de teste. As falas foram injetadas já prontas; o custo das parciais, dos workers de fala e da disputa de CPU com eles ficou de fora.
- **Biblioteca e Vocabulário.** Na edição estática são só um aviso. As listas longas de verdade não existem nesse alvo.
- **Conta logada e servidor.** Só a edição estática.
- **Tema Água**, que tem cena e laço próprios (`aguaCena.ts`).
- **Memória.** Nenhum retrato de heap; só o heap usado ao fim da carga (3,8 a 4,8 MB).
- **Camadas do compositor.** A contagem pelo CDP devolveu só a camada raiz e foi descartada.
- **Lighthouse.** Não rodado.
- **Caça-palavras até o fim** e os outros 16 jogos.
- **Rede pior que 4G.**
- **Navegação com "reduzir movimento" e captura no celular fraco** não foram repetidas. Carga e tela parada com "reduzir movimento" foram (3 vezes cada) e não diferem do normal.
- **O ganho de três consertos propostos** (contas do saguão em cache, um dono para `--mx`/`--my`, `content-visibility` nas falas) é estimativa a partir do custo medido, não resultado de experimento.

## 9. Onde estão os dados

- `docs/auditoria/eval/desempenho-2026-10/tabelas.md`: todas as tabelas, geradas dos JSON.
- `docs/auditoria/eval/desempenho-2026-10/dados/`: um JSON por jornada, perfil e variante (medianas e execuções, sem as listas longas).
- `docs/auditoria/eval/desempenho-2026-10/scripts/`: os scripts de medida e os remendos de laboratório.
- Traces inteiros (fora do repositório): `C:\Users\Guilh\AppData\Local\Temp\claude\c--Users-Guilh-OneDrive--rea-de-Trabalho-babel-play-lab\de918f0f-08be-4ee8-b701-1de5b0ff2546\scratchpad\perf\traces\`. Só a primeira repetição de cada variante foi guardada.

As linhas de código citadas são as do commit `aa97cf3d`, o publicado. A árvore de trabalho de `ei-polimento` tem mudanças não commitadas em `base.ts`, `LiveCapture.tsx` e outros, de outro agente.

## 10. Aplicado em 10/10

Os consertos "sem nenhuma perda visual" da camada de efeitos foram aplicados na árvore de trabalho (branch `feat/polimento-movimento`, sobre `d4feb9bf`), sem commit. Ficaram de fora, por serem de outro agente: o saguão do Jogar (G2), a lista de falas (G10) e os pedidos ao servidor. Nada do que muda o que se vê foi feito; está na lista da seção 10.6.

Tabelas completas: `eval/desempenho-2026-10/aplicado/tabelas.md`. Dados: `aplicado/dados/{antes,depois}/`. Prova de aparência: `aplicado/prova/`. Scripts: `scripts/intercalado.sh`, `antesDepois.mjs`, `provaVisual.mjs`, `minisFase.mjs`, `buildLimpo.mjs`, `servidor.mjs`.

### 10.1 Como foi medido

| Item | Como |
|---|---|
| Alvo | Dois builds de produção locais da edição estática: ANTES = `d4feb9bf` como está no repositório; DEPOIS = o mesmo commit mais só os arquivos deste conserto (os que o outro agente mudou em `src/` entram como estão no HEAD: `scripts/buildLimpo.mjs`). Servidos por `scripts/servidor.mjs`: os cabeçalhos de `public/_headers`, o `.br` que o build grava e o `Cache-Control` de `/assets`. |
| Método | O da auditoria (Playwright + CDP, `chrome-headless-shell`, 60 Hz, mesmos perfis, 3 repetições, mediana), com os mesmos scripts. Mudou neles: o endereço vem de `URL0`; o roteiro de navegação segue o menu de hoje (Biblioteca e Cartões no trilho; Estatísticas, Personalizar e Ajustes no "Mais"; "Praticar" na barra do celular); e há um estímulo novo, `giroquieto` (o sensor entregando 60 leituras por segundo só com ruído de ±0,03°: o celular pousado). |
| Intercalado | Cada configuração roda 3 vezes no ANTES e, em seguida, 3 vezes no DEPOIS (`scripts/intercalado.sh`). A primeira tentativa mediu um lado inteiro e o outro horas depois, e a máquina (dividida com outros agentes) estava 1,7 vez mais lenta na segunda leva: aqueles números foram descartados. |
| Limites | Os números absolutos do ANTES não batem com os da seção 4: lá era o commit publicado, na rede, noutra hora. A comparação que vale é a de cada linha, ANTES × DEPOIS. As linhas de tela parada, saguão e interações foram medidas antes de três acertos finais (pré-carga em ocioso só dos destinos do trilho, o primeiro quadro das miniaturas e a retirada de uma tentativa, seção 10.5); navegação, carga e as duas linhas do computador foram medidas de novo depois deles. Diferença abaixo de 10% está marcada como ruído. |

### 10.2 O que mudou, por conserto

| # | Conserto | Onde | Gargalo |
|---|---|---|---|
| 1 | O laço do giroscópio dorme quando a inclinação na tela chegou à do aparelho (falta menos de 0,001) e nenhum alvo ficou sem receber o valor; acorda com uma leitura a mais de 0,004 (0,09° do aparelho) do que está na tela, com alvos novos e ao mudar a largura. Quadro que não muda nada não escreve. | `src/lib/polimento/sentidos.ts:400-409, 462-469, 491-538, 541-563` | G1 |
| 2a | O laço da aura para ao chegar (menos de 0,05 px) e volta no próximo movimento; não roda com a camada desligada; o canto do `main` é medido ao acordar e quando o `main` muda de tamanho, não a cada quadro. | `src/lib/polimento/ponteiro.ts:24-36, 199-275` | G4 |
| 2b | O pulso do contador sai do `box-shadow`: uma camada (`::before`) do tamanho final do anel, atrás do número, que cresce por `transform` e some por `opacity`, com os mesmos 1,9 s, curva e cor. A regra do protótipo é desligada pelo app; a cópia não foi editada. | `src/styles/polimentoDesempenho.css` (novo), `src/lib/polimento/pulso.ts` (novo), `src/lib/polimento/estilos.ts:26-28`, `TrilhoDoQuest.tsx:365, 406` | G4 |
| 3 | A inclinação 3D dorme com o mouse parado sobre o cartão e acorda ao mexer, apertar e soltar; uma medida do cartão por movimento, não duas; a posição do ponteiro (`--mx`, `--my`) só é gravada nos alvos que a leem (`.q-tile`, `.q-linha`, `.jogo.clicavel`), não em todo botão. | `ponteiro.ts:55-97, 111-136`; `src/lib/dispositivo/respostaAoApontar.ts:25-26, 197-200` | G9 |
| 4 | As miniaturas dos cartões fora da vista ficam pausadas (um `IntersectionObserver` com 160 px de folga); ao voltar, cada animação avança o tempo que ficou parada. | `src/lib/polimento/minis.ts` (novo), `polimentoDesempenho.css`, `TrilhoDoQuest.tsx:248` | G3 |
| 5 | O pedaço da tela é pedido no `pointerdown` e no foco do item do menu (trilho e ladrilhos do "Mais"), e os destinos do trilho descem com o navegador ocioso, um por vez. O ocioso e o foco não pedem com economia de dados nem em 2G/3G. A saída de 150 ms continua. | `src/lib/polimento/precarga.ts` (novo), `src/App.tsx:10-57`, `TrilhoDoQuest.tsx:249-261, 286-287, 352-353` | G6 |
| 6a | As pílulas só são medidas quando uma aba ou o destino muda, uma barra entra ou muda por dentro, a camada liga ou uma barra muda de tamanho (`ResizeObserver`). A mutação que não é da camada não pede quadro nenhum. | `src/lib/polimento/telas.ts:376-386, 402-422, 424-480` | G5 |
| 6b | `aplicarAcess` percorre cada folha de estilo uma vez (de novo se ela ganhar regras) e só regrava a regra que precisa mudar. | `src/lib/polimento/base.ts:132-141, 151-207` | G12 |
| 7 | (pedido do coordenador) A regra do cursor perde o `:has(.px-cursor)`; em troca, a classe `px-com-cursor` não atravessa para a janela das Legendas flutuantes, nem na abertura nem na sincronia. | `src/styles/polimentoCursor.css:5-12`, `src/lib/appearanceSync.ts:49-64, 78`, `src/components/DocumentPiP.tsx:85` | – |

Não foi feito: abrir o `:is()` final no gerador do CSS. O relatório não diz que é seguro, e não é em geral: `:is(.a, .b c)` dá a todos os argumentos o peso do mais pesado, e separado em seletores cada um fica com o seu, o que muda quem ganha um empate. Só seria seguro onde todos os argumentos têm o mesmo peso, e isso pede um verificador no gerador.

Também não foi feito: as três regras `dialog :is(.op-linha, .q-ajuste):has(…)` de `styles/polimento/paineis.css:44-46`. O arquivo é cópia do protótipo. Para tirá-las sem editar a cópia: (1) uma linha a mais na tabela de cortes de `scripts/polimento/trazer-css.mjs` (`'paineis.css': [{ de: 43, ate: 45, motivo: … }]`); (2) em `polimento/dialogos.ts`, que já observa todo diálogo que abre, marcar a linha que tem interruptor (`data-px-com-interruptor`) e repetir as três regras numa folha do app com esse atributo no lugar do `:has`. Elas estão dentro de `@media (max-width: 720px)`: só pesam no celular. Não foi medido aqui.

### 10.3 Antes e depois

Tela parada, 10 s de trace. Fio principal em ms por segundo: mediana (menor–maior das 3).

| Tela | Perfil | Condição | Antes | Depois | Δ | rAF/s | Recálculos/s | Pinturas/s |
|---|---|---|---:|---:|---:|---:|---:|---:|
| Início | celular médio | sem sensor | 195 (185–200) | 24 (23–28) | −88% | 60 → 0 | 60 → 6 | 84 → 0 |
| Início | celular médio | sensor, aparelho parado | 960 (949–992) | 54 (54–58) | −94% | 79 → 0 | 143 → 7 | 78 → 0 |
| Início | celular médio | sensor, aparelho em movimento | 966 (793–968) | 918 (900–926) | ruído | 87 → 109 | 151 → 120 | 81 → 27 |
| Início | celular fraco | sem sensor | 358 (325–377) | 30 (29–30) | −92% | 60 → 0 | 60 → 7 | 86 → 0 |
| Início | celular fraco | sensor, aparelho parado | 992 (991–993) | 67 (54–68) | −93% | 45 → 0 | 107 → 7 | 55 → 0 |
| Início | celular fraco | sensor, aparelho em movimento | 994 (993–994) | 991 (988–991) | ruído | 46 → 75 | 108 → 101 | 55 → 27 |
| Início, Modo desempenho | celular médio | sem sensor | 50 (49–51) | 0 (0–0) | −99% | 60 → 0 | 0 → 0 | 0 → 0 |
| Início | computador | mouse parado | 47 (46–51) | 7 (6–7) | −86% | 120 → 0 | 60 → 8 | 129 → 11 |
| Início | computador | mouse em movimento | 265 (263–276) | 211 (210–211) | −20% | 234 → 226 | 216 → 130 | 309 → 282 |
| Jogar (saguão) | celular médio | sem sensor | 658 (652–669) | 460 (429–476) | −30% | 59 → 0 | 59 → 60 | 147 → 101 |
| Jogar (saguão) | celular médio | sensor, aparelho parado | 992 (986–992) | 614 (520–675) | −38% | 54 → 0 | 146 → 59 | 84 → 102 |
| Jogar (saguão) | celular médio | sensor, aparelho em movimento | 993 (992–993) | 991 (989–991) | ruído | 51 → 68 | 140 → 130 | 78 → 75 |
| Jogar (saguão) | celular fraco | sem sensor | 951 (931–985) | 613 (609–617) | −36% | 57 → 0 | 57 → 60 | 143 → 95 |

No saguão as animações rodando caem de 53 para 15 (38 pausadas) e os elementos por recálculo, de 105 para 29. Sobram 460 ms/s porque as miniaturas à vista seguem pedindo estilo e pintura a cada quadro (`mm-acende` anima `background` e `color`).

Com o aparelho se mexendo o laço do sensor não ganhou nada, como a auditoria previa: o custo por recálculo continua sem causa fechada (G1, item b).

Interações, só com trace (tarefas no fio principal em ms; mediana de 3):

| Perfil | Interação | Antes | Depois | Δ | Quadros feitos no fio principal | INP | Maior tarefa |
|---|---|---:|---:|---:|---:|---:|---:|
| celular médio | abrir "Mais" | 1.155 | 824 | −29% | 157 → 66 | 288 → 320 | 159 → 182 |
| celular médio | ir para o Jogar (peças já baixadas) | 2.782 | 2.461 | −12% | 89 → 88 | 96 → 96 | 353 → 347 |
| celular médio | abrir a Memória | 1.449 | 1.130 | −22% | 181 → 120 | 240 → 224 | 100 → 82 |
| celular médio | virar uma carta | 236 | 148 | −37% | 94 → 38 | 32 → 32 | 11 → 11 |
| celular fraco | abrir "Mais" | 1.702 | 1.249 | −27% | 151 → 64 | 424 → 480 | 174 → 311 |
| celular fraco | ir para o Jogar | 3.292 | 3.221 | ruído | 27 → 25 | 136 → 160 | 535 → 549 |
| celular fraco | abrir a Memória | 2.171 | 1.832 | −16% | 161 → 109 | 384 → 352 | 174 → 172 |
| celular fraco | virar uma carta | 380 | 264 | −31% | 96 → 39 | 48 → 48 | 19 → 22 |
| computador | abrir "Mais" | 303 | 314 | ruído | 157 → 140 | 56 → 48 | 19 → 16 |
| computador | ir para o Jogar | 647 | 566 | −13% | 182 → 127 | 24 → 24 | 83 → 86 |
| computador | abrir a Memória | 453 | 283 | −38% | 192 → 126 | 136 → 112 | 34 → 28 |
| computador | virar uma carta | 96 | 88 | ruído | 93 → 92 | 32 → 16 | 3 → 5 |

O trabalho total cai, mas a resposta ao toque não melhorou: o INP de abrir o "Mais" ficou igual ou pior (288 → 320 no médio, 424 → 480 no fraco, e a maior tarefa do fraco foi de 174 para 311 ms). O que segura essa abertura é o que a seção 5 (G5) já apontava e não foi tocado: a leitura de altura em `folha.ts` e o vidro.

Navegar pelo menu, celular médio, do toque ao conteúdo em ms (mediana de 3). "Ocioso": o navegador teve tempo ocioso antes do toque. "Só o toque": o ocioso nunca chegou.

| Troca | 1ª visita, ocioso: antes → depois | Arquivos baixados no toque | 1ª visita, só o toque: antes → depois | 2ª visita, ocioso: antes → depois |
|---|---:|---:|---:|---:|
| Capturar | 2.402 → 616 (−74%) | 64 → 1 | 2.305 → 1.998 (−13%) | 329 → 275 (−16%) |
| Intérprete | 473 → 381 (−19%) | 10 → 8 | 428 → 378 (−12%) | 411 → 319 (−22%) |
| Jogar | 1.509 → 902 (−40%) | 24 → 1 | 1.386 → 1.089 (−21%) | 663 → 503 (−24%) |
| Estatísticas (pelo "Mais") | 1.395 → 1.106 (−21%) | 10 → 7 | 1.075 → 977 (ruído) | 1.005 → 809 (−20%) |
| Personalizar (pelo "Mais") | 1.299 → 1.334 (ruído) | 9 → 7 | 1.053 → 848 (−19%) | 451 → 223 (−51%) |
| Ajustes (pelo "Mais") | 962 → 579 (−40%) | 13 → 13 | 893 → 741 (−17%) | 470 → 224 (−52%) |
| abrir "Mais" | 383 → 242 / 151 → 137 / 166 → 143 | – | 255 → 220 / 118 → 139 / 139 → 142 | 315 → 280 / 131 → 131 / 139 → 151 |

A segunda visita não é um resultado firme: na rodada "só o toque" ela saiu pior em quatro trocas (de +34% a +58%) e, na "ocioso", melhor (até −52%), com o mesmo código nos dois casos. O que se sustenta é a primeira visita. O tempo até a tela assentar não mudou onde só a espera mudou (Capturar, 2ª visita: 1.368 → 1.344 ms): a animação é a mesma.

O preço da pré-carga em ocioso, na carga (celular médio, 4G, mediana de 3, tudo contado até a rede sossegar):

| Carga | Medida | Antes | Depois | Δ |
|---|---|---:|---:|---:|
| fria | FCP / LCP | 841 / 4.466 | 852 / 4.441 | ruído |
| fria | TBT | 299 | 276 | ruído |
| fria | fim da última tarefa longa ("até interagir") | 3.384 | 5.455 | +61% |
| fria | pedidos / kB baixados | 85 / 484 | 188 / 916 | +121% / +89% |
| fria | JS descomprimido | 651 kB | 1.597 kB | +145% |
| fria | fio principal até a rede sossegar | 1.984 ms | 2.502 ms | +26% |
| fria e quente | heap | 3,6 / 4,9 MB | 5,0 / 6,9 MB | +39% / +41% |
| quente | FCP / LCP / TBT / até interagir | 344 / 736 / 118 / 796 | 358 / 785 / 109 / 831 | ruído |

A pintura da primeira tela não muda. O que muda é que, depois dela, o aparelho baixa 432 kB a mais e avalia quase 1 MB de JS em segundo plano, em tarefas que passam de 50 ms: quem toca nesse intervalo disputa o processador com isso. Por isso o ocioso ficou só com os destinos do trilho (com os três do "Mais" junto eram 1.015 kB e +91% em "até interagir"). É decisão do dono manter, reduzir ou tirar (seção 10.6, P1).

### 10.4 Prova de que a aparência é a mesma

`scripts/polimento/comparar.mjs` não serviu para o antes × depois: os roteiros dele pedem o servidor de desenvolvimento (`import('/src/lib/theme.ts')`) e comparam app × protótipo, não dois estados do app. No lugar, `scripts/provaVisual.mjs` abre as mesmas telas nos dois builds, congela todas as animações no MESMO instante e compara: as caixas e os estilos computados das mesmas 26 propriedades do `comparar.mjs`, em mais de trinta seletores, e a captura pixel a pixel. Telas: Início, "Mais", Capturar, Jogar, Memória, Início com o mouse sobre um cartão e Início e Jogar com o aparelho inclinado; a 1280 e a 390 px, claro e escuro; o pulso e as miniaturas em 3 instantes do ciclo. As partículas ficam fora (são sorteadas, e não foram tocadas).

| O que foi comparado | Resultado |
|---|---|
| Caixas (tolerância de 1 px) em todas as telas | iguais |
| Estilos computados | iguais, fora o esperado: no contador, `animation-name` passa de `px-pulso` para nenhum e `box-shadow` para nenhum (o anel agora é o `::before`); a aura e os cartões inclinados diferem na terceira casa (a aura para a menos de 0,05 px do ponteiro; a inclinação, a menos de 0,01°) |
| Capturas sem o anel à vista | diferença máxima de 1 a 7 níveis em 255, espalhada pela aura (que para a até 0,05 px de onde chegava) |
| Capturas com o anel à vista | mesmo tamanho, lugar e cor; a BORDA do anel fica até 1 pixel de aparelho mais suave e o miolo difere em até 8 níveis: 13 a 32 níveis de diferença em 60 a 200 pixels. Ampliado 8 vezes: `aplicado/prova/rec-anel-t187.png` e `rec-anel-escuro-t667.png` |
| Controle (ANTES × ANTES) | zero pixel de diferença em 17 de 20 cenas; nas outras, ruído de captura |
| Miniaturas que voltam à vista | no mesmo passo das que nunca pararam: 0 ms de desvio em 13 animações que nasceram fora da vista e em 14 que saíram e voltaram (`scripts/minisFase.mjs`) |

O anel é a única diferença que existe na imagem. Em tamanho natural não a distingo; quem decide se passa é o dono, com as duas imagens ampliadas. O contador de dois algarismos (uma pílula, não um círculo) não foi capturado: nele, pela conta (não por captura), o canto do anel desvia até cerca de 0,5 px no começo do ciclo, porque uma camada esticada não cresce igual para todos os lados.

Um defeito do método, achado no caminho: com o laço parado a página não desenha quadro novo sozinha, e a captura pegava o último quadro desenhado, com a animação ainda no instante de antes de congelar. A Memória "diferia" por isso. `provaVisual.mjs` agora invalida a tela e descarta uma captura antes da que vale.

### 10.5 O que foi tentado e desfeito

| Tentativa | Resultado | Destino |
|---|---|---|
| Registrar `--mx`/`--my` sem herança (`@property … inherits: false`) para o cartão não recalcular os filhos | Mouse em movimento, computador: com ela 291 → 264 ms/s (ruído); sem ela 265 → 211 (−20%). Elementos por recálculo: 24 → 23 | desfeita |
| O anel do pulso como camada do tamanho do contador, ampliada | borda borrada pela ampliação | trocada pela camada do tamanho final, encolhida |
| Guardar o começo de cada animação ao pausar a miniatura (`getAnimations` em cada cartão que sai da vista) | 132 a 142 ms ao entrar no Jogar (medida do agente de lógica) | trocada: pausar só anota a hora; quem pergunta é a volta |
| Pré-carga em ocioso de todos os destinos do menu, com os três do "Mais" | 1.015 kB na carga fria, "até interagir" +91%, e a 1ª visita ao Personalizar piorou (1.318 → 1.786 ms) por disputar o processador com a própria pré-carga | reduzida aos destinos do trilho |

### 10.6 Para o dono decidir

Novas, deste trabalho:

| | O quê | O que pesa |
|---|---|---|
| P1 | A pré-carga em ocioso: manter (como está), só Capturar e Jogar, ou só o pedido no toque | Como está: 1ª visita a Capturar 2,4 s → 0,6 s e ao Jogar 1,5 s → 0,9 s, ao custo de 432 kB e ~1 MB de JS avaliado em segundo plano depois de cada carga. Só o toque: −13% a −21% na 1ª visita, sem custo |
| P2 | O anel do contador com a borda um pixel mais suave | É o que tira o `box-shadow` animado de toda tela (Início parado 195 → 24 ms/s junto com o laço da aura) |

As da seção 6 continuam abertas. Com as medidas de hoje:

| | Troca | Ganho estimado |
|---|---|---|
| T1 | Vidro sem desfoque no celular | Sem placa de vídeo, 104 → 17 quadros descartados ao abrir o "Mais" (seção 5, G5). É o que sobra nessa abertura: o INP dela não caiu com os consertos de hoje |
| T2 | Entrada das telas mais curta | A tela assenta entre 1,3 e 2,1 s (medido hoje, 2ª visita); é o tempo do desenho |
| T3 | Inclinação pelo sensor desligada ou a 30 por segundo no celular fraco | Com o aparelho na mão o Início segue em 918 ms/s (médio) e 991 (fraco); parado caiu para 54 e 67. O teto do ganho é essa diferença |
| T4 | Partículas mais leves | Processo da GPU: até 117 → 34,5 ms/s (seção 5, G11); não medido de novo |
| T5 | Modo desempenho automático no celular fraco | Início parado no Modo desempenho: 0 ms/s. Abrir "Mais": 1.295 → 264 ms de tarefas (seção 6) |
| T6 (nova) | `mm-acende` (a letra achada na miniatura da Caça-palavras) como camada que aparece, em vez de cor animada | É o que mantém o saguão em 460 ms/s com as outras miniaturas já pausadas. Pede marcação nova na miniatura e conferência de cor |

### 10.7 Portões

Entrou como teste (`tests/animacoesInfinitas.test.ts`): nenhum `@keyframes` usado com `infinite` no CSS do app anima algo além de `transform` e `opacity`, com as 19 exceções de hoje listadas uma a uma e o motivo de cada. Animação nova fora da regra reprova; exceção consertada também (sai da lista).

Propostos para a CI, com os limites que as medidas de hoje sustentam (CPU 4×, mediana de 3, folga de 20% nos de tempo):

| Portão | Limite | Hoje |
|---|---|---|
| Início parado, sem sensor | 0 rAF/s, 0 pinturas/s, até 10 recálculos/s, até 40 ms/s de fio principal | 0 / 0 / 6 / 24 |
| Início parado, sensor com o aparelho parado (`giroquieto`) | 0 rAF/s, até 80 ms/s | 0 / 54 |
| Início no Modo desempenho | 0 rAF/s, até 5 ms/s | 0 / 0 |
| Computador, mouse parado sobre um cartão | 0 rAF/s, até 15 ms/s | 0 / 7 |
| Saguão do Jogar parado | 0 rAF/s, até 20 animações rodando, até 600 ms/s (baixar quando a T6 for feita) | 0 / 15 / 460 |
| 1ª visita a Capturar e Jogar com o ocioso | conteúdo em até 800 ms e 1.200 ms no 4G simulado | 616 / 902 |
| Carga fria | LCP e TBT dentro do que eram; kB até a rede sossegar até 1.000 | 916 |

`scripts/parado.mjs` (estímulos `nada`, `giroquieto`, `mouse`) e `scripts/navegar.mjs` já dão esses números. Sem contagem que dependa de comparar com outro build: cada portão olha o build de agora.

### 10.8 O que continua sem medida

- Aparelho de verdade, Safari e iOS, Quest: nada do que está aqui. Em particular, QUANTO ruído o sensor de um celular real entrega parado na mesa. O laço acorda com 0,09° de diferença; se o ruído do aparelho passar disso, ele não dorme, e o ganho de 94% do "aparelho parado" não aparece.
- O contador de dois algarismos e o selo do dia dos Cartões (não aparecem na edição estática sem conta).
- A captura com falas (o conserto 6a tira `atualizar` do caminho de cada fala; a medida de 109 ms em 21 falas é do agente de lógica, e não foi refeita).
- O `:has` do cursor: a medida de 49,7 → 10,3 elementos por recálculo é do agente de lógica, numa execução, com as três regras apagadas. Aqui só uma das três saiu, e a linha "mouse em movimento" a inclui sem isolá-la.
- A janela das Legendas flutuantes num navegador de verdade (o ponteiro do sistema dentro dela): coberto só por teste de unidade.
- Navegação e carga no celular fraco e no computador com o build final (medidas só no celular médio).
- Rede pior que 4G, tema Água, conta logada.
