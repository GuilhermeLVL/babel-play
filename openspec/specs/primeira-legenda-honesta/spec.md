# primeira-legenda-honesta Specification

## Purpose
Reduzir LCP do /app no celular, primeira legenda em rede lenta e download sem aviso (auditoria 17/11). Criada pela change `carga-rapida-no-celular` (arquivada em 2026-11-23); veja `openspec/changes/archive/2026-11-23-carga-rapida-no-celular/proposal.md` para o porquê.

## Requirements

### Requirement: Download de modelo no celular é sempre confirmado

No celular e no Quest, todo download de modelos acima de 20 MB MUST pedir confirmação antes de começar, com o tamanho real
somado (transcrição e tradução). Quando o navegador não informa o tipo de rede, o app SHALL estimar a vazão e avisar sobre
rede lenta do mesmo jeito.

#### Scenario: Mercado com rede livre (CEL-04)

- **WHEN** a rodada `celular/medir-celular.mjs --aparelho pixel7 --cenario mercado` começa com perfil novo
- **THEN** `confirmacoes` tem 1 item com o tamanho em MB e `mbDepoisDoClique` é 0 até o aceite (a auditoria registrou 0
  confirmações e 90,7 MB)

#### Scenario: iPhone em rede lenta

- **WHEN** a rodada `--aparelho iphone14 --cenario aeroporto --rede 3g` abre a confirmação
- **THEN** o texto da confirmação inclui o aviso de conexão lenta e a estimativa de tempo (a auditoria não teve aviso no
  iPhone)

### Requirement: O primeiro download diz o que está acontecendo e quanto falta

Depois do aceite, a tela MUST NOT mostrar "Pronto para legendar" nem "Ouvindo…" enquanto o reconhecimento não está pronto.
Ela SHALL mostrar as barras da transcrição e da tradução desde o aceite, com bytes e tempo estimado, e o número de trechos de
fala guardados. O tradutor MUST começar a baixar no máximo quando a transcrição terminar de baixar.

#### Scenario: Aeroporto em 3G (CEL-03)

- **WHEN** a rodada `celular/medir-celular.mjs --aparelho pixel7 --cenario aeroporto --loop --rede 3g --teto-s 2100` roda
- **THEN** a foto aos 30 s não tem "Pronto para legendar" e a foto aos 300 s não tem "Ouvindo…"
- **AND** as duas barras aparecem desde o aceite, e a foto aos 300 s mostra uma estimativa de tempo e o número de trechos
  guardados
- **AND** o pedido do primeiro arquivo do tradutor sai no máximo 5 s depois do fim do download da transcrição (a auditoria
  registrou o tradutor começando por volta dos 540 s, depois da 1ª legenda)

#### Scenario: Estimativa razoável

- **WHEN** a estimativa é mostrada aos 60 s da rodada em 3G
- **THEN** o tempo real até a 1ª legenda cai dentro da faixa mostrada, com folga de 50%

### Requirement: Rede lenta oferece um caminho mais curto

Quando a estimativa até a 1ª legenda passar de 2 min, a tela SHALL oferecer começar só com a transcrição e usar um modelo
menor. Para o adulto, e só com a decisão do dono, PODE oferecer a legenda do navegador que não baixa nada. Para o perfil
protegido, MUST NOT oferecer um caminho que envie áudio para fora do aparelho.

#### Scenario: Começar só com a transcrição

- **WHEN** a pessoa escolhe "Começar só com a transcrição" na rodada em 3G
- **THEN** a 1ª legenda chega antes do fim do download do tradutor, e as falas são traduzidas quando ele chega

#### Scenario: Modelo menor

- **WHEN** a pessoa escolhe "Usar um modelo menor" na rodada em 3G
- **THEN** a 1ª legenda chega em no máximo 50% do tempo da rodada de referência (a auditoria mediu 549,6 s)

### Requirement: O 1º texto na tela é rápido e vigiado

No desktop, o tempo do início da 1ª fala ao 1º texto na tela SHALL ter mediana de no máximo 1,2 s e p90 de no máximo 1,5 s em
6 ou mais rodadas da bancada. O `slo-captura.json` MUST vigiar `primeiroTextoNaTelaMs` em cada perfil e ambiente com base, e
o rótulo de `primeiraLegendaMs` MUST dizer "legenda completa".

#### Scenario: Bancada no desktop (LB-02)

- **WHEN** `npm run build:estatica && node scripts/perf/latencia-legenda/bancada-captura.mjs --perfis desktop,fraco
--rodadas 6` roda
- **THEN** a mediana de `primeiroTextoNaTelaMs` do desktop fica em no máximo 1200 ms e o p90 em no máximo 1500 ms (a auditoria
  mediu mediana de 3100 ms em 3 rodadas)
- **AND** o perfil fraco não piora mais que a tolerância do SLO (base de cerca de 1,9 s)

#### Scenario: O SLO reprova a regressão (LB-03)

- **WHEN** a bancada roda com o 1º parcial atrasado de propósito para 3 s
- **THEN** a comparação com `slo-captura.json` reprova pela métrica `primeiroTextoNaTelaMs`
