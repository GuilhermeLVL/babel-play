## Why

O app oferece **28 idiomas** no seletor e tem trilha para **um**. O G0 (`docs/auditoria/multi-idioma-v1.md`)
mediu o que isso significa na prática, e a frente B existe para fechar três buracos que a medição
expôs:

- **A trilha não é "inglês" — é "inglês para quem fala português".** `DadoTrilha` não tem
  `tgtLang`, e a tradução PT mora dentro do dado. Um nativo de espanhol que erra uma palavra da
  trilha promove um cartão com verso português rotulado `tgtLang: 'es'` (`Play.tsx`, promoção).
  É corrupção de dados **ativa hoje**, não risco futuro (F26).
- **O dado da trilha é estático no bundle.** `en-vjtESkJa.js` = **237,2 KB** medidos no `dist/`.
  Cinco idiomas escritos do mesmo jeito ≈ 1,2 MB baixados ao entrar em `/jogar`, qualquer que seja
  o idioma escolhido (F27).
- **CEFR-J só cobre inglês.** `cefrWordlist.ts` devolve mapa vazio para qualquer outro idioma, e
  não existe equivalente com licença aberta para a maioria dos 28.

E há uma dívida que o próprio `FONTES.md:180` declara: **o gerador da trilha de inglês não é
versionado**. O que se versionou foi a saída. Um segundo idioma hoje custa reconstruir o pipeline a
partir de prosa.

## What Changes

- **A trilha vira monolíngue.** `trilha/<lang>.json` traz palavra, nível e frase no idioma
  praticado. A tradução sai para `glosas/<praticado>-<nativo>.json`. N+M arquivos em vez de N×M:
  5 praticados × 3 nativos deixa de ser 15 arquivos de ~230 KB e passa a ser 8.
- **Nível por frequência onde não há lista curada**, com procedência declarada. A tela diz "mais
  comuns", não "A1", quando a fonte é frequência. Inglês mantém CEFR-J.
- **Carregamento dinâmico** com um índice estático minúsculo (idioma → níveis + contagens), para a
  Sala e o seletor contarem sem baixar o JSON.
- **A promoção passa a usar a glosa do par certo**; sem glosa para o par, não promove e diz por quê.
- **`scripts/trilha/`**: o pipeline repetível que não existe, com as regras que o `FONTES.md` já
  estabelece em prosa.
- **Tabela de cobertura por idioma visível ao usuário** — ele precisa saber o que a plataforma
  entrega naquele idioma antes de investir tempo.

## Impact

- Dados: `src/data/trilha/en.json` migra para o schema v2 + `src/data/glosas/en-pt.json`. Sem perda:
  as frases traduzidas viram `frases[palavra]`.
- Código: `trilha.ts`, `cefrWordlist.ts`, `Play.tsx` (resolução do dado e promoção),
  `PainelTrilha.tsx` (estado de carregamento). `etapas.ts` e `SalaDeEscolha.tsx` **não mudam** —
  o primeiro já é genérico por `dado.lang`, a segunda passa a ler o índice.
- Sem migração de esquema de banco. O `cefrSource` ganha um valor novo (`frequencia`), aditivo.
- Risco concentrado numa fase: `trilha` é `useMemo` **síncrono** e dele dependem `frasesTrilha`,
  `etapaDaTrilha`, `jogaveis` e `fontesOferecidas`. Ver `design.md`, Decisão 3.
