# Critério do A/B de confirmação: primeiro texto na tela (guarda do final recalibrada)

Escrito e commitado ANTES de qualquer rodada desta confirmação. Vale o critério deste arquivo; o veredito do A/B anterior
(`../primeiro-texto/criterio.md`, REPROVADO pela guarda 1 com teto de +30 ms) FICA como está e não é reescrito.

## Por que existe (decisão do dono, 23/11)

O critério anterior escreveu a guarda 1 (`fimDaFalaAteLegendaMs` p75) com teto de +30 ms. O combinado do dono para o laboratório,
decidido na V7 (22/11), é +100 ms, que é a resolução da bancada (p75 sobre poucas falas). Um teto de +30 ms abaixo da resolução do
instrumento reprova por ruído (no A/B anterior: dif. -54 ms, IC [-165, +125]; o caminho do final não foi tocado pela mudança).
Em 23/11 o dono decidiu CONFIRMAR com o teto de +100 ms e um IC mais estreito. Esta é uma decisão do dono, tomada antes de ver qualquer
dado desta confirmação; o teto não muda depois.

## Variantes (iguais ao critério anterior)

- `antes`: o pai do commit do conserto (`a4396d3a^`, equivale ao `origin/main` do dia), `npm run build:estatica`.
- `depois`: `a4396d3a` (o adaptador do sistema repassa o retorno de `sysHandlers.onPartialAudio`); nada mais muda.
- Modelos em cache, rodadas INTERCALADAS (`--alvos`), aquecimento descartado, rodada inválida refeita; >= 12 rodadas VÁLIDAS por braço e cenário.
- Só perfil `desktop` (o fraco emulado já mostrou não-regressão no A/B anterior: 1.905 -> 1.917 ms, IC [-6, +15,5]; não é repetido).

## Cenários (declarados antes)

- **C1, `fleurs-en-8`** (padrão da bancada, en-US -> pt-BR, a rota onde a bimodalidade foi diagnosticada): mede a PRIMÁRIA. Não há outro
  fixture inglês maior; os fixtures disponíveis são `fleurs-en-8` (8 falas), `fleurs-pt-12` e `fleurs-pt-16`.
- **C2, `fleurs-pt-16`** (pt-BR -> pt-BR, `--qualidade accurate`, SEM tradução; 16 falas, o dobro de C1): mede a GUARDA 1 DECISIVA.
  Serve para a métrica do final porque `fimDaFalaAteLegendaMs` ali é o caminho do final sem tradução e o conserto (retorno do parcial
  na captura do sistema) não depende do idioma; com 16 falas o IC do p75 pareado estreita. Flags de laboratório iguais nos dois braços
  (nenhuma: o app como ele está em cada commit).

## Métrica primária (C1, desktop)

`primeiroTextoNaTelaMs`: mediana das rodadas válidas de cada braço; diferença `depois - antes` com IC 95% por bootstrap das RODADAS
(`ab-primeiro-texto.mjs`, 10 000 reamostragens, semente 20261123). Efeito mínimo -20% sobre a mediana de `antes`: `depois melhor` só se
o IC fica inteiro abaixo de 0 E o efeito é >= 20%; `depois pior` se o IC fica inteiro acima de 0; senão `sem diferença provada`.
Informativo: fração de rodadas >= 2,5 s e a mesma métrica em C2.

## Guardas (qualquer uma que falhe reprova `depois`)

1. Final p75 pareado por fala (bootstrap de `ab.mjs`, 10 000 reamostragens, semente padrão): limite superior do IC 95% de `depois - antes` **<= +100 ms**
   (era +30 ms; ver acima). Decisiva em **C2**, sobre `fimDaFalaAteOriginalMs` (fim da voz até o texto final do ORIGINAL no balão: em pt para pt não há
   tradução, então `fimDaFalaAteLegendaMs` não existe; é o quadro que `ab-parciais.mjs` usa para essa guarda, `compararParciais().fimDoOriginal`, 16 falas).
   Em C1 é informativa e reportada ao lado (`fimDaFalaAteLegendaMs` p75, 8 falas; resolução ~100 ms), pelo `ab.mjs`.
2. SLO da bancada: `comparar.mjs --ambiente local-darwin` sobre o resultado de `depois` (C1) não reprova.
3. Taxa de falha de legenda de `depois` <= a de `antes` (C1 e C2).

## Decisão

APROVADO = primária (C1) `depois melhor` E guardas 1 (C2), 2 e 3 passam. REPROVADO = alguma guarda falha ou primária `depois pior`.
SEM DIFERENÇA PROVADA = demais casos. A não-regressão no fraco emulado vem do A/B anterior (não repetida por decisão do dono).
Rodada inválida: pára e relata; não se completa com rodada antiga. Nenhum limiar muda depois de ver o número.
