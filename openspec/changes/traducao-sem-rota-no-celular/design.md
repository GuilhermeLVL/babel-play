## Context

A cascata de tradução da captura tenta, em ordem: memória e cache, o Translator nativo (Chrome desktop), a nuvem (só com
consentimento, `consentimentoDeNuvem.ts`; o perfil protegido sem responsável fica sempre no aparelho,
`escolhaDoProcessamento.ts:75`), o MyMemory (também nuvem) e o tradutor local. O local tem três motores:

- `opusMtLocal.modelFor` (`src/gateway/adapters/opusMtLocal.ts:47-58`): en↔{es,fr,it,de} dedicados, en→pt pelo
  `en-ROMANCE`, ROMANCE→en, e X→en pela tabela `MODELOS_PARA_O_INGLES`. **Não há X→pt para es/fr/it/de.**
- `viaIngles` (mesmo arquivo) e `parDoPivo` (`bergamotModelo.ts:65-71`): pivotam só os idiomas de `MODELOS_PARA_O_INGLES`
  (zh, ja, ko…). O comentário em `viaIngles.ts:15` exclui es/fr/it/de/pt porque "o inglês no meio piora o que o tradutor
  da web faz bem". A premissa vale só com nuvem; sem consentimento não sobra rota nenhuma.
- Bergamot: pt→en embutido e X→en de `ORIGENS_DO_BERGAMOT_NO_CDN` (inclui es, fr, de, it) via `VITE_BERGAMOT_MODELOS_URL`.

Quando tudo falha, `traducaoDaFala.ts:469-487` (`degrade`) escreve `translatedText: '(' + text + ')'` e mostra, uma vez por
sessão, um aviso de 8 s. No celular a pessoa vê o espanhol em letra grande no lugar da tradução e não percebe o aviso.

O cartão de preparo soma pares nativos em `pacotesNativos.ts` pela média. `salvarSessao.ts:312` prepara `[s,t]` e `[t,s]`.
No Chromium sem pacote, um par chama `falhou`, mas o outro nunca chama `progresso(1)` nem `falhou`: a média fica em 0, e
`ModelPrepPanel` mantém o cartão por cima da lista.

A 2ª sessão: o atraso está entre o texto e a tradução (`sttAteTraducao` p50 230 → 4710 ms). O worker de tradução já tem
prioridade parcial < final (`opusMtLocal.ts:249-259`). O que não se mediu é a disputa no início da sessão entre a carga do
Whisper do cache e a do opus-mt, com 1 thread no iPhone sem isolamento. As rodadas "quente" com outro perfil foram rápidas
(944 e 828 ms), então a causa precisa ser isolada antes de mudar.

## Goals / Non-Goals

**Goals:**

- Todo par entre {pt, es, fr, it, de} tem tradução no aparelho, sem nuvem.
- Nenhuma linha mostra o original fingindo ser tradução.
- Antes de Iniciar, a pessoa sabe se o par terá tradução.
- O cartão do tradutor nativo some quando não há o que esperar.
- A 2ª sessão traduz pelo menos tão rápido quanto a 1ª (dentro do ruído).

**Non-Goals:**

- Melhorar a qualidade da tradução em si (COMP-06, tom de Portugal, é outra frente).
- Novos idiomas fora de {pt, es, fr, it, de} e da tabela atual.
- Traduzir pela nuvem sem consentimento.

## Decisions

1. **Pivô local para os idiomas com modelo direto, como último recurso local.** `viaIngles` e `parDoPivo` deixam de excluir
   es/fr/it/de/pt quando o alvo está em `ALVOS_DO_INGLES ∪ {pt}` e não existe modelo direto X→alvo. A perna X→en prefere
   o Bergamot (A/B de 17/10/2026: chrF++ 77,3 contra 69,3, de 5 a 10× mais rápido e cerca de 3× menor) e cai no opus-mt
   `es-en`/`ROMANCE-en` sem o CDN. A ordem da cascata não muda: nativo e nuvem autorizada vêm antes. A tabela fica num
   lugar só (`viaIngles.ts`), lida pelo worker, pelo adaptador, por `modelCache.ts` e por `languages.ts`, como hoje.
   Alternativa descartada: um modelo direto es→pt (não há opus-mt `es-pt` com revisão testada no repositório, e seria mais
   um download de cerca de 110 MB).
2. **`coberturaNoAparelho(de, para, ctx)` no núcleo.** É pura e recebe o que o aparelho tem: `{ nativo: boolean,
nuvemAutorizada: boolean, bergamotNoCdn: boolean }`. Devolve `'direta' | 'pelo-ingles' | 'nativo' | 'nuvem' |
'sem-rota'` e o tamanho do download. A escolha de idiomas e o Iniciar consultam essa função; `languages.ts` também.
3. **Linha sem tradução honesta.** `degrade` passa a escrever `translatedText: ''` e `semTraducao: 'sem-rota' | 'falhou'`
   (o campo `semTraducao` já existe como booleano na conversa virtual; vira união com o motivo). O balão mostra "Sem
   tradução neste aparelho" (sem rota) ou "Tradução indisponível agora · Tentar de novo" (falha), sem o original repetido.
   A exportação, a voz e "Guardar" tratam a tradução vazia como ausente.
4. **Prazo no par nativo.** `criarProgressoDosPacotesNativos` ganha um prazo de 20 s sem progresso por par (o mesmo
   relógio para a abertura do disjuntor `chrome-translator`): vencido, o par é tratado como `falhou`. Quando o tradutor
   local entrega a primeira tradução da sessão, o pacote `tradutor` some do cartão (`aplicar('tradutor', undefined)`).
   `ModelPrepPanel` passa a ocupar a faixa de avisos, acima da lista, sem sobrepor (layout, não `position: absolute`).
5. **2ª sessão: medir antes, depois agir.** Primeiro, instrumentar com marcas `performance.mark` (carga do STT, carga do
   MT, pedido e resposta da tradução, fila do worker) e repetir `celular/rodar-visitante.sh` com 5 réplicas alternando a
   ordem (1ª/2ª), em máquina sem carga. Se a disputa se confirmar: adiar o `preload` do MT até o STT estar pronto (ou o
   inverso no "só ouvir"), e no iPhone sem isolamento serializar as cargas. A oferta do regulador vira um aviso visível
   (o mesmo de `avisoDeSempre`) ou deixa de ser registrada no log quando a tela não a mostra.

## Risks / Trade-offs

- [Qualidade do pivô] → Juiz automático: o mesmo `celular/juiz-traducao.mjs` (LLM-as-judge via `claude -p`, sem créditos de
  API, conforme a memória do projeto) com piso de nota 3/5 no par es→pt nas falas do cenário mercado.
- [Memória no celular] → Medir a aba com `celular/medir-celular.mjs` (campo de memória); teto: não passar de +300 MB sobre
  a rodada en→pt de referência.
- [Download maior] → O aviso de download soma as pernas (`bytesDoDownload` do Bergamot + opus-mt), e a confirmação no
  celular segue a regra da change `carga-rapida-no-celular`.
- [Prazo de 20 s corta um pacote nativo lento e legítimo] → O par só sai do cartão; o download do Chrome continua, e a
  próxima sessão o usa.

## Migration Plan

Sem dado persistido. A rota nova entra com o deploy. Rollback: reverter. Se o CDN do Bergamot não tiver o par, o opus-mt
cobre a perna X→en (mais lento, mas funciona).

## Open Questions

- O Environment `production` tem `VITE_BERGAMOT_MODELOS_URL`? (Dono; sem ele, a perna é opus-mt.)
