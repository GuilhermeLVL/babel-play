## Why

Na auditoria de 17/11/2026, o par espanhol → português não traduziu nada para o visitante no celular: 9 de 9 linhas ficaram
sem tradução nas 6 rodadas do cenário "mercado" (achado CEL-01, CONFIRMADO, "bloqueia"). O console registra
`NoRouteError: sem rota disponível para a capacidade "mt"`, e a tela mostra o espanhol entre parênteses no lugar da
tradução, como se tivesse traduzido. A causa está no código, não na emulação. `opusMtLocal.ts:47-58` não tem modelo
es→pt. O pivô pelo inglês (`viaIngles.ts:15`, `bergamotModelo.ts:65-71`) exclui de propósito os idiomas com modelo direto
(es, fr, it, de). O MyMemory exige consentimento de nuvem, que o perfil protegido não tem, e o Translator do Chrome não
existe no Chrome Android nem no Safari. É o par mais comum de quem viaja a partir do Brasil.

Há dois problemas irmãos na mesma cadeia. (a) A 2ª sessão, com os modelos em cache, traduz mais devagar que a 1ª (CEL-08,
PLAUSIVEL): do fim da fala à tradução, p50 de 3,5 s → 8,5 s no iPhone emulado (máximo de 19,6 s) e de 0,9 s → 4,2 s no
Pixel, com o atraso entre o texto e a tradução. (b) O cartão "Tradutor do navegador 0%" fica preso a sessão inteira e
cobre a primeira legenda (COMP-03, CONFIRMADO; CONV-06, PLAUSIVEL). A captura prepara dois pares nativos
(`salvarSessao.ts:312`); só um falha, o outro fica em 0% para sempre, e a média nunca chega a 1 nem some.

Evidências (relativas a `reports/auditoria-qualidade/`):

- CEL-01: `celular/runs/visitante-1a-iphone14-mercado/05-fim.png`, `celular/runs/visitante-1a-iphone14-mercado/resultado.json`
  (console), `celular/analise.json` (`linhasSemTraducao` 9/9).
- CEL-08: `celular/latencias.json`, `verificacao-2/lat-resumo.json`, `celular/runs/visitante-2a-iphone14-desenho/05-fim.png`,
  `celular/runs/concorrente-visitante-2a-*`.
- COMP-03 e CONV-06: `computador/runs/sessao-10min-a/05-gravando-601s.png`, `computador/runs/quente-15a/console.json`,
  `computador/runs/frio-serie/06-fim.png`, `conversa/rodadas/desktop-sem-voz-en/tela.json`,
  `conversa/rodadas/desktop-cache-limpo/99-lista.png`.

## What Changes

- **Rota no aparelho para todo par entre pt, es, fr, it e de**: quando não há modelo direto e nem o nativo nem a nuvem
  autorizada atendem, o tradutor local passa pelo inglês. A perna X→en usa o Bergamot (CDN próprio, `VITE_BERGAMOT_MODELOS_URL`)
  quando o par existe, ou o opus-mt dedicado/ROMANCE→en. A perna en→alvo usa o opus-mt. O pivô fica como último recurso
  local, depois do nativo e da nuvem autorizada, para não piorar quem já tinha rota melhor.
- **Honestidade quando não há rota**: uma consulta pura de cobertura (`coberturaNoAparelho(de, para, contexto)`) responde
  antes de Iniciar. Se o par não tem tradução neste aparelho, a escolha de idiomas e o botão Iniciar dizem isso, com a
  saída possível (autorizar a nuvem, se a política permitir). Na linha, a degradação deixa de pôr `(original)` no lugar
  da tradução: aparece "sem tradução neste aparelho", e a tradução fica vazia para a exportação, a voz e os cartões.
- **Cartão do tradutor nativo que não prende**: o par nativo que não progride em 20 s, ou cujo disjuntor
  (`chrome-translator`) abriu, conta como falho e sai da média. Com o tradutor local servindo traduções, o cartão do
  nativo some. O cartão de preparo nunca cobre a lista de falas.
- **2ª sessão sem regressão**: a tradução do final da fala atual passa à frente dos parciais e da carga do STT. A carga do
  tradutor do cache não disputa threads com o aquecimento do Whisper no início da sessão. A oferta do regulador
  ("fim da escada local") passa a aparecer na tela ou deixa de ser registrada.

## Capabilities

### New Capabilities

- `traducao-no-aparelho`: cobertura de pares no aparelho (rota pelo inglês), aviso honesto de par sem rota, linha sem
  tradução falsa e latência da tradução estável entre sessões.
- `preparo-dos-modelos-visivel`: o cartão de preparo (download e pacotes nativos) reflete o estado real, fecha sozinho e não
  cobre a legenda.

### Modified Capabilities

(nenhuma)

## Impact

- Alterados: `src/core/traducao/viaIngles.ts` (origens que pivotam), `src/gateway/adapters/opusMtLocal.ts`
  (`modelFor`/`viaIngles`), `src/gateway/adapters/bergamotModelo.ts` (`parDoPivo`), `src/gateway/adapters/mtWorker.ts`
  (prioridade), `src/gateway/modelCache.ts` (lista de download do par), `src/lib/languages.ts` (cobertura
  anunciada), `src/lib/captura/traducaoDaFala.ts` (`degrade`), `src/lib/captura/pacotesNativos.ts` (prazo),
  `src/components/ModelPrepPanel.tsx` (posição), a escolha de idiomas e o Iniciar de Legendar.
- Novo: `src/core/traducao/coberturaNoAparelho.ts`.
- Download: es→pt passa a baixar a perna es→en (Bergamot cerca de 31 MB, ou opus-mt cerca de 110 MB) além do en→pt que já
  existia. O aviso de download soma as duas pernas.
- Sem migração, sem custo de servidor.

## Prioridade, esforço, riscos e dono

- **Prioridade**: P0 para a rota es→pt e a linha honesta (é "bloqueia" e enganoso). P1 para o cartão preso e a 2ª sessão.
- **Esforço**: médio (cerca de 3 a 4 dias: rota e honestidade em 2 dias, cartão em 0,5, investigação da 2ª sessão em 1 a
  1,5).
- **Riscos**:
  - O pivô pelo inglês perde nuance (es→en→pt). Mitigação: juiz de qualidade (abaixo) com piso, e o pivô só entra quando
    não há rota melhor.
  - Memória no celular: dois modelos de tradução mais o Whisper (CEL-02 já mede de 1,6 a 2,6 GB). Mitigação: preferir o
    Bergamot (cerca de 3× menor) na perna X→en, e não carregar a perna inversa sem uso.
  - A causa da 2ª sessão lenta é hipótese (disputa entre o Whisper e o mtWorker). A medição pode mostrar outra causa; o
    design prevê a medição antes da mudança.
- **Precisa do dono**:
  1. Confirmar que `VITE_BERGAMOT_MODELOS_URL` está no Environment `production` e que o bucket tem `es-en`, `fr-en`,
     `it-en` e `de-en` publicados (`scripts/modelos/publicar-bergamot-no-r2.ts`, credencial do R2).
  2. Aprovar o texto do aviso "sem tradução neste aparelho" (skill `copy-br-etica`).

## Revisão de 25/11/2026

- **Estado**: quase toda feita (cobertura, rota pelo inglês, linha honesta, aviso de par, cartão de 20 s, marcas, regulador). #205 e #206 corrigiram o layout que reprovava o e2e da 3.2; o e2e ainda NÃO voltou (revertido em `65c5c54c`, pronto em `ef991c9f`). Abertas e velhas: 4.2 e 4.3 (a lentidão da 2ª sessão não se reproduziu: 0,96× e 0,95×), 5.2 (nota 2,33 a 2,89 contra o piso 3,0) e 5.3 (Bergamot es-en passa o teto de memória: +726 MB). Decisões que mudaram: a qualidade do es→pt local passou para `traducao-local-por-direcao`; o corte de custo de 02/10 e os planos v4 não alteram esta change (o pivô é local, sem custo, e o perfil protegido continua sem nuvem); a tarefa 3.1 não ligou o disjuntor `chrome-translator`, e o prazo de 20 s cobre o caso.
- **Esforço**: P (cerca de 0,5 dia: cherry-pick do e2e e rodar; mais a rodada no staging, que é do dono/aparelho real).
- **Valor para quem usa**: alto (es→pt é o par mais comum de quem viaja; antes a tela fingia traduzir). Já entregue em grande parte; o resto é prova e qualidade.
- **Dependências**: conflito de arquivo com `modelos-confiaveis-e-offline` em `ModelPrepPanel.tsx` (esta vai primeiro); o piso de qualidade depende de `traducao-local-por-direcao`; o CDN do Bergamot depende de `bergamot-multi-idioma-via-cdn` 1.3 (dono).
- **Decisões do dono** (tarefa 6.1 e 6.3):
  1. Piso do pivô es→pt: (A) aceitar 2,9 com o Bergamot e rotular "tradução aproximada" na linha; (B) exigir 3,0 e bloquear o pivô até haver modelo direto; (C) A para desktop e, no celular, só o opus-mt (memória no teto) com o rótulo. **Recomendo A**: mostrar algo útil e honesto vale mais que nada, e `traducao-local-por-direcao` sobe a nota depois.
  2. Memória no celular (+726 MB na 1ª sessão): (A) aceitar com o Bergamot só onde há 6 GB ou mais; (B) usar opus-mt nas duas pernas (+185/+206 MB, nota menor); (C) medir em aparelho real antes. **Recomendo C com B como padrão no celular enquanto não medir**.
  3. Aprovar o texto do aviso e publicar o CDN do Bergamot (itens antigos, sem opção: só fazer).
