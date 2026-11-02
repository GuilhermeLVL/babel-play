# Esquema das poses de mão do alfabeto manual (`frasy-alfabeto-mao/2`)

Arquivos: `alfabeto-libras.json` (A-Z e Ç), `alfabeto-asl.json` (A-Z). Validador no app: `validarAlfabeto` em `src/core/avatar/sinais/validar.ts` (porta do `validar.mjs` do protótipo; o teste de rejeição com 7 adulterações está em `tests/avatar-sinais-validar.test.ts`). Limites articulares: `limites.json`, fonte única do validador (rejeita) e do protótipo (clamp por osso). O gerador `gerar-alfabetos.mjs` do protótipo NÃO veio para o app: a partir do M4b os JSON são a fonte e são editados direto (correções de qualidade em `docs/pesquisa/2026-10-28-avatar-sinais-qualidade.md`).

**Estado:** poses de DEMONSTRAÇÃO autoradas por IA, NÃO revisadas por pessoas surdas. É soletração do alfabeto manual, não tradução. O campo `aviso` de cada arquivo diz isso e o validador falha se o texto sumir.

## Espaço do sinalizador

Eixos em metros, vistos como o avatar: **x** = lado direito do avatar, **y** = para cima, **z** = para a frente (para quem olha). Origem: o ombro da mão dominante. É um sistema canhoto (x direita, y cima, z frente), por isso a regra do polegar abaixo usa `T = -(F x N)` nesses eixos. Modelo normalizado para 1,7 m (braço: ~0,23 m + ~0,24 m).

## Letra

```json
"A": {
  "fidelidade": "alta | media | baixa",   // minha autoavaliação da forma da mão contra a referência; NÃO é validação
  "movimento": false,                      // true: a letra tem percurso (selo "letra com movimento: aproximada")
  "movimento_descricao": null,             // obrigatório se movimento
  "obs": "...", "referencia": "...",
  "mao": { "polegar": {...}, "indicador": {...}, "medio": {...}, "anelar": {...}, "minimo": {...} },
  "orientacao": { "dedos": [x,y,z], "palma": [x,y,z] },
  "posicao": [x,y,z],                      // centro da palma (osso do metacarpo do médio), do ombro dominante
  "cotovelo": { "giro": 0 },               // graus; gira o cotovelo em torno do eixo ombro-mão (afastar o cotovelo)
  "caminho": [ { "t": 0.5, "dpos": [x,y,z], "rot": [rx,ry,rz], "dflex": { "indicador": [mcp,pip,dip,abd] } } ]
}
```

### Dedos (indicador, medio, anelar, minimo)

| campo | significado                                                                                                                                                                                      | limite (graus) |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------- |
| `mcp` | flexão da articulação da base (metacarpofalângica)                                                                                                                                               | -20 a 95       |
| `pip` | flexão da articulação do meio                                                                                                                                                                    | 0 a 115        |
| `dip` | flexão da ponta. `null` = ACOPLADO: o motor usa DIP = 2/3 do PIP (também no percurso: um `dflex` no PIP leva 2/3 dele ao DIP). Só vale número explícito quando foge do acoplamento (gancho do X) | 0 a 90         |
| `abd` | abdução: positivo = afasta do eixo da mão. No indicador e no médio positivo = em direção ao lado do polegar; no anelar e no mindinho positivo = afastar também (o motor inverte o sinal)         | -30 a 30       |

Flexão positiva = curvar em direção à palma. Zero = dedo reto na pose de ligação do modelo.

### Polegar

| campo      | significado                                                                                                                                                                                                                                              | limite (graus) |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| `cmc_flex` | varredura no plano da palma a partir da base: positivo = atravessa a palma rumo ao mindinho, negativo = abre (L)                                                                                                                                         | -60 a 105      |
| `cmc_abd`  | abdução palmar, ZERO = polegar deitado na palma (esquema /2; o /1 tinha o zero no polegar levantado ~30 graus, então os valores antigos valem `cmc_abd + 30` no novo; o motor soma `polegar_zero.cmc_abd` de `limites.json`). Positivo = afasta da palma | -15 a 90       |
| `mcp`      | flexão da articulação do meio (no plano da palma, rumo ao mindinho)                                                                                                                                                                                      | 0 a 75         |
| `ip`       | flexão da ponta                                                                                                                                                                                                                                          | -15 a 90       |
| `oposicao` | rolagem do polegar em torno do próprio eixo (a unha gira)                                                                                                                                                                                                | -30 a 90       |

O zero do polegar é a pose de ligação do Quaternius (polegar levantado ~30 graus do plano da palma, apontando para cima). No esquema /2 isso fica só no motor: `cmc_abd = 0` é o polegar deitado na palma. As articulações do polegar em um modelo real não têm esses limites exatos; os números são tetos conservadores deste protótipo.

### Orientação

`dedos` = direção para onde os dedos apontam. `palma` = normal da palma (para onde a palma "olha"). Os dois devem ser quase perpendiculares (o validador aceita |cos| até 0,3; o motor ortogonaliza). O polegar fica do lado `T = -(F x N)` no espaço do sinalizador, para a mão direita. Exemplos: dedos [0,1,0] e palma [0,0,1] = mão aberta para cima com a palma voltada a quem olha (B); dedos [1,0,0] e palma [0,0,-1] = apontando para a direita do avatar com a palma voltada ao corpo (G). Punho, antebraço e cotovelo NÃO são parâmetros próprios: o motor resolve por IK de dois ossos (ombro, cotovelo, punho) a partir de `posicao` e `orientacao`, com o cotovelo para baixo e para fora e `cotovelo.giro` como ajuste, e a torção do antebraço dividida meio a meio entre o osso do antebraço e o da mão.

### Percurso (`caminho`)

Lista de pontos com `t` crescente em (0,1] (fração do tempo de retenção da letra, que dura 1,7x o normal). Cada ponto é um DELTA em relação à pose-base: `dpos` (m, espaço do sinalizador), `rot` (graus em torno de x, y, z do sinalizador, aplicados antes da orientação-base) e `dflex` (soma nos ângulos dos dedos, na ordem mcp, pip, dip, abd; para o polegar: cmc_flex, cmc_abd, mcp, ip, oposicao). Interpola com senoide entre pontos. Limites: |dpos| até 0,2 m, |rot| até 120 graus, e os ângulos resultantes continuam dentro dos limites anatômicos.

### Mão dominante

`mao_dominante_padrao: "direita"`. Canhoto = espelhar: o motor reflete x de posição e orientação e usa os ossos do lado esquerdo. Os JSON guardam só a forma da mão direita.

## Convenções de texto (no motor, não nos JSON)

- Libras: acentos são ignorados (letra-base). `Ç` tem sinal próprio (C com leve movimento descendente). `Ã` e `Õ`: letra-base seguida de um leve balanço lateral da mão (til); convenção NÃO confirmada com surdos [?].
- ASL: sem acentos; `Ç` vira C; `Ã` e `Õ` viram A e O.
- Letra dupla: pequeno rebote (a mão avança 3,5 cm, afrouxa 30% os dedos e volta). Espaço, hífen e pontuação separam palavras (pausa). Algarismos 0-9 têm pose própria nos dois alfabetos (chaves `"0"` a `"9"`, opcionais, mas se um existe os dez existem; o motor só os soletra quando o alfabeto os traz). As formas são de DEMONSTRAÇÃO por descrição, sem revisão de pessoas surdas; em Libras, 6 a 9 reusam a forma da ASL por suposição [?]. Outros dígitos Unicode e símbolos não são soletrados.

## Receber poses capturadas (compatível com `pose-format`)

Pensado para, depois, trocar as poses autoradas por poses CAPTURADAS de sinalizadores surdos pagos, com consentimento. `pose-format` (`sign-language-processing/pose`, MIT [S]) guarda landmarks 3D por quadro (por exemplo, os 21 pontos de cada mão e os pontos do corpo do MediaPipe). Mapeamento proposto [?: não rodei a biblioteca neste protótipo]:

1. **Normalizar:** posições relativas ao ombro dominante e divididas pela largura entre os ombros (a mesma escala para qualquer avatar); multiplicar pelo comprimento do braço do avatar na hora de aplicar.
2. **`orientacao`:** `dedos` = normalizado (MCP do médio - punho); `palma` = normal do plano punho, MCP do indicador, MCP do mindinho, com o sinal escolhido pela lateralidade.
3. **Dedos:** `mcp` = ângulo entre o vetor da palma (punho - MCP) e o osso proximal; `pip` e `dip` = ângulos entre ossos consecutivos; `abd` = ângulo lateral entre o osso proximal e o eixo da mão projetado no plano da palma. Polegar: CMC, MCP e IP pelo mesmo cálculo, com `oposicao` estimada pela rotação da unha (ou ignorada).
4. **`posicao`:** centro da palma (média do punho e dos MCP) relativo ao ombro.
5. **Percurso:** uma letra capturada vira uma sequência de quadros; guardar a trilha inteira como `caminho` com `t` normalizado, reduzida por ajuste de curva (Ramer-Douglas-Peucker) para poucos pontos, ou trocar `caminho` por `quadros: [{t, mao, orientacao, posicao}]` em uma versão 2 do esquema.
6. **Caminho inverso (avatar para `.pose`):** cinemática direta com os comprimentos de osso do modelo, útil para comparar a pose do avatar com a captura (erro por articulação).

Sem esses dados reais, nada aqui vale como Libras validada.

## Guia "Alfabeto manual" e poses marcadas (29/10/2026)

O app tem um guia (Intérprete e Perfil › Avatar) com a grade das letras e dos algarismos, a pose grande e o campo "Soletrar uma palavra". O botão "Marcar esta pose como incorreta" guarda, SÓ neste aparelho (`localStorage`, `frasy.avatar.sinais.marcacoes`), `{alfabeto, letra, espelhada, em}`; "Exportar lista (JSON)" baixa `frasy-poses-marcadas.json` (esquema `frasy-poses-marcadas/1`, com o aviso de que as poses NÃO foram revisadas por pessoas surdas) para levar a quem revisa. Nada vai ao servidor.

Distinção entre poses: `tests/avatar-poses-distincao.test.ts` guarda um piso de distância geométrica (graus) por par que se confunde (G-H, G-Q, H-P, P-Q, M-N, Z-G, Z-D). É proteção contra regressão, NÃO validação linguística.
