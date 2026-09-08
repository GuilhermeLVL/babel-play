# Auditoria do conteudo de `gamificacao-v2-wip` — 2026-09-08

Branch `gamificacao-v2-wip` (commit `0ac344d`), base `976af2c`. `main` andou 30 commits desde entao.
Este relatorio mede o que a branch entrega ANTES de qualquer linha ser trazida, no mesmo protocolo
da auditoria de 07/09: evidencia `arquivo:linha`, medir antes de corrigir, e nenhuma correcao nesta
rodada.

Referencias da branch sao lidas com `git show gamificacao-v2-wip:<arquivo>`.

## 0. Resumo executivo

1. **Um terco do codigo novo nao tem caminho de execucao.** ~15.000 linhas liquidas de produto, das
   quais ~4.900 estao inalcancaveis hoje: 3.425 de TSX orfao, 470 de CSS que nenhum seletor usa,
   ~1.000 do Passe reescrito atras de uma constante, e 220 de `Loja.tsx` desligadas.
2. **`Loja.tsx:151` desliga o comercio inteiro.** `const [modoVisual, setModoVisual] = useState('pro')`
   e `setModoVisual` **nunca e chamado** — uma unica ocorrencia no arquivo, a propria declaracao. O
   `if (modoVisual === 'pro') return <GamificacaoHub/>` de `:457` e incondicional, e as 220 linhas
   seguintes (Loja, Passe, Conquistas, Inventario, `CabecalhoDeTemporada`) sao inalcancaveis. **As
   melhores melhorias de comunicacao da branch estao atras dessa porta.**
3. **A economia da branch contradiz a autoridade que `main` instalou em 01-07/09.** `drops.ts:207`
   chama `creditarSeeds` com `amount` e `reason` (campos que sairam do contrato) e um `creditoId`
   com `Date.now()` (que destroi a idempotencia). E a posse concedida por drop e apagada no proximo
   carregamento de perfil, porque `hidratarPosse(autoritativo)` substitui o espelho local.
4. **51 dos 128 itens do catalogo mestre sao inalcancaveis** pela regra do proprio
   `estaDesbloqueadoNoCofre`, e **31 ids ja existem** no `CATALOGO_DA_LOJA` — o canal de drop da de
   graca o que a loja vende por Seeds, incluindo dois itens de Credito.
5. **O design system e contornado.** 504 cores cruas do Tailwind nos componentes novos, num app que
   roda sobre tokens para sustentar 9 temas x 200 paletas, mais 7 usos de duas classes que nao
   existem.
6. **Ha melhoria real de comunicacao, e ela e especifica** — sobretudo as quatro rotas de aquisicao
   com CTA em `Inventario.tsx`, que respondem "como eu consigo isto?". Junto vieram quatro
   regressoes pequenas e uma perda de documentacao.

## 1. Tamanho e alcance

| Escopo | Numero |
|---|---|
| Arquivos alterados | 74 |
| Linhas liquidas de produto (`src/`) | ~15.000 (+16.109 / −1.062) |
| Sem caminho de execucao hoje | ~4.900 (33%) |
| Arquivos orfaos, direta ou transitivamente | 3.425 linhas (29% do codigo novo) |
| Arquivos que `main` tambem tocou | 11 |
| Conflitos textuais reais | 7 hunks em 5 arquivos |

**G01 — `src/App.tsx` da branch e 100% reindentacao.** 154 insercoes e 154 delecoes; `git diff -w`
sai vazio. Nao ha conteudo a preservar: o lado da branch deve ser descartado por inteiro. O mesmo
vale para `index.html` (32/27, todas de quebra de linha).

**G02 — Tres "versoes" visuais mutuamente exclusivas, nenhuma com importador.**
`views/gamificacao/versao1_arcade` (1.135 linhas), `versao2_cyber` (571), `versao3_odyssey` (572).
Mesmo dado, mesma mecanica, so muda a pele e o vocabulario. Os tres "vestiarios"
(`VestiarioArcade.tsx`, `VestiarioCyber.tsx`, `AtelieOdyssey.tsx`) sao o mesmo repasse de props com
nomes diferentes.

**G03 — 3.425 linhas orfas.** Os 12 arquivos das tres versoes, mais `StagePreviewLive.tsx` (377),
`CartaHolografica.tsx` (440), `ModalCelebracaoCarta.tsx` (157), `ModalCelebracaoRecompensa.tsx`
(106) e `BadgeRaridadeJogo.tsx` (67) — estes ultimos so usados por arquivos que tambem sao orfaos.

## 2. O catalogo mestre (`src/core/catalogoMestre.ts`, 3.741 linhas)

Medido por script sobre o arquivo da branch, contra `src/core/loja.ts` e
`src/core/learning/conquistas.ts` de `main`.

| Distribuicao | |
|---|---|
| Itens | 128 (contra 98 no `CATALOGO_DA_LOJA`) |
| Por canal | conquista 31, drop_partida 30, nivel 24, desafio 23, tempo 20 |
| Por raridade | epico 39, raro 39, lendario 23, comum 15, mitico 7, transcendente 5 |
| Por categoria | tema_total 36, cursor 25, pack_emoji 17, rastro 14, tema 13, particulas 12, shader 3, carimbo 3, som 2, visualizador 2, moldura 1 |

**G04 — 31 ids existem nos DOIS catalogos.** `tema-babel`, `tema-linear`, `tema-vercel`,
`tema-mochi`, `tema-notion`, `tema-premium`, `tema-custom`, `tema-aurora`, `cur-padrao`, `cur-mira`,
`cur-pato`, `cur-varinha`, `cur-pizza`, `cur-fogo`, `cur-espada`, `cur-coroa`, `cur-golfinho`,
`cur-dragao`, `part-pixel`, `part-confete`, `part-coracoes`, `part-estrelas`, `part-cometa`,
`dourada-1`, `ras-faisca`, `ras-estrelas`, `ras-arcoiris`, `ras-arcade`, `pack-espaco`,
`pack-tesouros`, `pack-natureza`.

E a mesma colisao que a auditoria de 07/09 mediu por outro caminho: os dois gates leem
`babel.loja_possuidos`, entao um item ganho por drop passa a valer como comprado na loja. **Inclui
`tema-premium` e `dourada-1`, que sao itens de Credito** — moeda comprada com dinheiro, cuja posse
`server/lib/posseDeCosmeticos.ts` deriva de `credit_spends`.

**G05 — 51 dos 128 itens sao inalcancaveis**, pela regra do proprio `estaDesbloqueadoNoCofre`
(`catalogoMestre.ts:3729`) combinada com `itensElegiveisParaDrop` (`drops.ts:61`):

| Motivo | Itens |
|---|---|
| canal `desafio`, que nenhum codigo concede | 23 |
| canal `tempo`, idem (`minutosEstudoRequeridos` aparece 10x no catalogo e **0x** no resto de `src/`) | 20 |
| canal `nivel` sem `nivelRequerido` (o nivel esta so na prosa) | 3 — `suite_forja_draconica`, `suite_gilded_metropole`, `suite_mecha_cockpit` |
| `conquistaId` que nao existe | 4 — `cur_tridente`→`maratona`, `part-onda`→`foco_impecavel`, `ras-matrix`→`hacker`, `suite_gelo_eterno`→`polar_freeze` |
| drop com raridade de peso zero | 1 — `suite_holograma_furtacor` |

`maratona` e quase certo um erro de digitacao de `maratonista`, que existe.

**G06 — Duplicatas funcionais por mistura de `-` e `_`.** `cur-pizza`/`cur_pizza`,
`cur-golfinho`/`cur_golfinho`, `ras-faisca`/`ras_faisca`: seis cartas para tres coisas.

**G07 — Nomes de exibicao repetidos.** "Neo Toquio 2099" (`suite_neo_toquio` e `pack-cyberpunk`) e
"Glaciar Artico" (`suite_glaciar_artico` e `pack-gelo`).

**G08 — O cabecalho do catalogo declara "economia 100% gratuita, sem paywalls"**, e o catalogo
contem itens que `main` vende em Creditos (G04). Nao e conflito de merge: e decisao de produto, ja
tomada pelo dono em 08/09 — **um catalogo so, mantendo Seeds e Creditos**.

## 3. Economia: onde a branch contradiz `main`

**G09 — `drops.ts:205-210` quebra o contrato de credito em tres pontos.**

```
await creditarSeeds({
  creditoId: `drop-partida-bau-${Date.now()}`,
  amount: bonusSeeds,
  reason: 'drop_partida:bau_seeds',
});
```

- `amount` e `reason` **nao existem mais** no contrato: `src/data/api.ts:914-916` aceita
  `{ creditoId: string }` e nada mais, desde a mudanca `seeds-e-creditos-fonte-unica`.
- `drop-partida-bau-*` **nao resolve** em `valorDoCredito` (`core/economiaAutoridade.ts`), que so
  conhece `conquista-*` e os cofres de `slotsDoPasse()`. Resposta: 400 `credito_desconhecido`, no
  Express **e** no modo sem conta, que chama a mesma funcao.
- `Date.now()` no id destroi a idempotencia que `seed_credits` assume.

**G10 — A posse por drop nao sobrevive a um carregamento de perfil.** `drops.ts:232` faz
`marcarPosse(id)` no espelho local, e `hidratarPosse(lista, autoritativo = true)`
(`src/lib/loja.ts:66-72`) **substitui** esse espelho pelo que o servidor sabe, derivado de
`seed_spends.reason`. Para quem tem conta, o Cofre e apagado na proxima leitura de `/profile`.

**G11 — `nivelJogador={1}` cravado.** `ResumoDaRodada.tsx` monta `<ModalDropDePartida
nivelJogador={1} />`; `ScratchReward.tsx` faz certo (`progress?.level ?? 1`). Na tela de resumo,
todo item de canal `nivel` conta como bloqueado.

**G12 — Dificuldade invertida.** `ResumoDaRodada.tsx:~62` passa
`dificuldade: podeSubirDificuldade ? 'normal' : 'dificil'`. `podeSubirDificuldade` significa "foi
bem e pode subir", e o codigo rotula justamente o caso oposto como dificil — e
`registrarFimDePartida` da um drop extra por isso.

**G13 — `consumirDrop()` sem guarda.** `drops.ts:190` chama e descarta o `boolean`; com zero drops
pendentes o sorteio acontece do mesmo jeito.

## 4. Posse e equipar

**G14 — O caminho canonico de equipar e contornado.** O cabecalho de `Loja.tsx:10-11` declara:
*"Comprar aqui e equipar ali passam pelo mesmo `equiparItem` (lib/galeria/equipar) — o unico caminho
que equipa no app."* O codigo VIVO da branch nao usa: `GaleriaDoCofre.equiparItemDoCofre` e
`MontadorDeEstiloDeck` chamam `setCursor`/`setParticulas`/`setRastro`/`persistTheme` e `localStorage`
direto, com tres tabelas id→valor escritas a mao (`cMap` 22 entradas, `pMap` 12, `rMap` 13) que
precisam ser mantidas em sincronia manual com 128 ids. Ironia registrada: os `Passe*` das tres
versoes orfas sao os UNICOS lugares da branch que usam `equiparItem`.

**G15 — 11 itens "equipam" para lugar nenhum.** O `default:` de `equiparItemDoCofre`
(`GaleriaDoCofre.tsx:116-119`) grava `babel.equipado.<categoria>` e **nada no app le essas chaves**.
Atinge `shader` (3), `carimbo` (3), `som` (2), `visualizador` (2), `moldura` (1). Todos exibem
"equipado com sucesso".

**G16 — O shader nao sobrevive a um F5.** `suitesTematicas.ts:805-807` grava
`babel.equipado.shader` e poe `data-shader` no `<html>`, e nenhum codigo de boot le a chave. Depois
de recarregar, o CSS some e o `localStorage` continua dizendo que esta ativo.

**G17 — A UI mente sobre o resultado.** `aplicarSuiteTematica` devolve `false` quando a suite nao
existe, e `GaleriaDoCofre.tsx:163` **ignora o retorno**, seguindo para
`toast.ok('… equipado com sucesso!')` em `:171`. Duas suites do catalogo nao existem em
`SUITES_TEMATICAS` (`suite_celestial`, `suite_cyberpunk`) e dois `paletaId` nao existem
(`suite_y2k_matrix`→`'matrix'`, `suite_neon_shinjuku`→`'amarelo-neon'`).

**G18 — Dessincronia de estado do React.** `aplicarSuiteTematica` chama `applyFonte()`,
`localStorage.setItem('app_fonte', …)` e `persistTheme()` direto, sem tocar no estado do `App.tsx`.
O React continua achando que a fonte e a antiga.

## 5. Design system

**G19 — 504 cores cruas do Tailwind** nos componentes novos, num app cujo tema roda sobre tokens
(`--color-accent`, `--color-good`, `--color-premium`) para sustentar 9 temas e 200 paletas. As mais
frequentes: `bg-amber-500` (52), `border-amber-500` (42), `text-amber-400` (40). Concentracao nos
dois arquivos que sobrevivem a escolha da pele Arcade: `MontadorDeEstiloDeck.tsx` 81,
`CartaHolografica.tsx` 55, `GaleriaDoCofre.tsx` 14. O resto esta em Cyber e Odyssey, que saem.

**G20 — Duas classes que nao existem.** `bg-surface-elevated` (5 usos) e `bg-surface-muted` (2) nao
sao declaradas no `@theme` de `src/index.css`, que so tem `--color-surface` e
`--color-surface-hover`. Nao geram CSS nenhum.

**G21 — 470 linhas de CSS sem consumidor.** `index.css:2536-3005` da branch (cartas holograficas,
foils elementais, particulas de hover) e 15 `@keyframes`. Verificado seletor a seletor:
`perspective-card`, `holo-foil-overlay`, `foil-dourado`, `card-cartonizado`, `ember-particle` —
**zero ocorrencias** em qualquer `.tsx` da branch.

**G22 — O reformat orfanou a evidencia de contraste.** Antes:
`--good-contrast: #111111;  /* #3FB950 → 8.27:1 */`. Depois, o valor numa linha e o comentario WCAG
na seguinte, solto. Acontece nos 9 temas x 3 tokens: a prova de acessibilidade deixou de estar
amarrada ao valor que ela justifica.

## 6. Comunicacao: o que melhorou e o que regrediu

**G23 — As quatro rotas de aquisicao com CTA** (`personalizar/Inventario.tsx:427-500`) sao a melhor
entrega da branch. Cada item trancado passa a dizer como se consegue: conquista (com botao "Ver em
Missoes & Conquistas"), Creditos ("Comprar na Loja"), Seeds ("Custa N Seeds. Voce tem saldo
suficiente!" ou "Faltam N Seeds"), nivel ("Desbloqueado de graca ao alcancar o Nivel N", com "Ver no
Passe"). Junto veio o alternador "Meus Itens / Catalogo Completo" e o cadeado com `title` explicando
o clique.

**G24 — Microcopia de fontes.** `appearance.ts` foi de 2 para 8 familias com `previewText` e
descricoes no padrao "nome categorizado + o que e + as familias reais + amostra que se le". **Com
uma promessa vazia**: as descricoes citam Garamond, Kalam, Bebas e Archivo Black, que nao estao no
`@import` de `index.css` — a copia promete o que a implementacao nao entrega. Junto veio uma
correcao real em `theme.ts`: `coerceFonte` validava so `'pixel'` e zeraria as outras seis.

**G25 — Tooltips das moedas.** De "Seeds — a moeda que vem de estudar" para "Seeds — Conquistadas
praticando e revisando. Nao se compram com dinheiro real." Melhoria clara.

**G26 — REGRESSAO: a tela afirma "0 Creditos" enquanto carrega.** `CabecalhoDeTemporada.tsx`
trocou `{carteira.creditos ?? '—'}` por `{carteira.disponivel ? (carteira.creditos ?? 0) : '—'}`, e
apagou junto o comentario que protegia a regra: *"Enquanto o servidor nao responde e '—', nunca 0:
zero e uma afirmacao."* Foram 18 linhas de documentacao removidas.

**G27 — REGRESSAO: o cartao de Creditos passou a renderizar sempre.** Antes era
`{carteira.disponivel && (…)}`. No self-host e sem conta, a UI mostra uma moeda que nao existe.

**G28 — REGRESSAO: a busca de emoji foi removida.** `SeletorDeEmojis.tsx` perdeu o estado de busca,
o input e o filtro, justamente quando o acervo subiu para 18 categorias.

**G29 — REGRESSAO: o estado vazio perdeu precisao.** "Nada **seu** nesta categoria ainda" virou
"Nada nesta categoria ainda", exatamente quando a tela passou a mostrar as duas coisas — o que e seu
e o que nao e.

**G30 — `palavraDeNivel()` substituido por "NIVEL" fixo**, deixando o import orfao (junto com
`HelpCircle`). Era o rotulo que se adapta ao perfil de idade.

## 7. Props recebidas e ignoradas

**G31.** `GamificacaoHub.tsx:23-24` declara `comprar` e `comprarComCreditos`, `Loja.tsx:468-469` os
passa, e o destructuring de `:30-41` **nao os inclui**; `carteira` e desestruturada e nunca usada.
`BaralhoDeCosmeticos` descarta `ctx`, `equipadoAtual` e `loadout`. `CofreEConquistas` descarta
`progress`, `ctxConquistas` e `subAbaInicial`. `GaleriaDoCofre.tsx:36` declara `onJogarMinigame`,
que ninguem passa. `VestiarioArcade` declara `onIrParaLoja` e nao o desestrutura. `drops.ts:92`
recebe `motivo` e nunca o le — a conquista monta `"Missao Concluida: <nome>"` e a string e jogada
fora.

## 8. Outros

**G32 — `three` e `@types/three` no `package.json`, zero `import … from 'three'`** em todo o
repositorio. ~600 kB de dependencia morta; o portao `morto:arquivos` acusa.

**G33 — `walkthrough.md` contradiz o codigo que descreve.** Afirma "reducao das cartas do
`GamificacaoHub` de 5 para 4: Passe, Loja, Vestiario e Cofre" — o hub tem 2 abas, e nem Passe nem
Loja. Afirma "controle segmentado entre Missoes & Desafios e Reliquias do Cofre" — e
`CofreEConquistas.tsx:18-21` diz o contrario ("a tela anterior de missoes foi removida"). Fala em
"64 reliquias" quando sao 128.

**G34 — Duas mudancas OpenSpec novas com todas as tarefas marcadas como feitas**
(`hiper-personalizacao-ecosystem`, `personalizacao-elemental-e-icones-premium`, ambas
`created: 2026-09-06`), descrevendo trabalho que esta atras de `modoVisual`.

## 9. As 11 colisoes com `main`

| Arquivo | Decisao |
|---|---|
| `src/App.tsx` | descartar o lado da branch por inteiro (G01) |
| `package-lock.json` | descartar os dois lados e rodar `npm install` |
| `package.json` | aceitar os dois lados, **sem deixar `tesseract.js` voltar** |
| `src/index.css` | funde limpo; entra por partes (Onda 1 e Onda 4) |
| `src/lib/appearance.ts` | funde limpo, a branch sobrevive intacta |
| `src/components/views/Conquistas.tsx` | funde limpo, a branch sobrevive intacta |
| `src/core/index.ts` | funde limpo; o `export * from './catalogoMestre'` SAI com a fusao de catalogo |
| `src/lib/conquistas.ts` | funde limpo, mas puxa `drops.ts`; bloqueado ate G09 |
| `src/lib/soundFx.ts` | eventos novos entram; os chamadores dos tres atalhos removidos viram `play(...)` |
| `PasseDeTemporada.tsx` | fica a UI; as duas linhas de contrato sao as de `main` |
| `src/components/views/Loja.tsx` | decisao de produto (Onda 2) |

## 10. Perguntas ja respondidas pelo dono (08/09)

1. Como a branch volta: **tudo, em ondas, com auditoria antes**.
2. Das tres versoes visuais: **Arcade**. Cyber e Odyssey saem.
3. Catalogo: **um so**, com o lore e as rotas de obtencao do mestre, mantendo Seeds e Creditos.
4. Abas da Loja: **montar as duas e decidir vendo**.
5. Os 7 jogos que nao rodam sobre o baralho: **reescrever a mecanica**, ciente de que alguns deixam
   de ser o que sao.
