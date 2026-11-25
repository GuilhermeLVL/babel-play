## Why

O Frasy ensina idioma com o que a pessoa já assiste e conversa. Hoje o intérprete, a leitura de livros e o perfil são
telas de texto e voz sem rosto. Os protótipos (`proto/avatar-libras-tudo`) provaram avatar 3D low poly com mãos
articuladas, skins, coleção CC0 e importador local de VRM/GLB, mas nada disso está no app. O dono quer um avatar para a
pessoa se representar, um **intérprete** com voz (e sinais só quando houver conteúdo revisado) e **narrador e
personagens** nos livros, para leigos, experientes, quem quer personalizar e quem precisa de acessibilidade.

## What Changes

- **Núcleo puro** `src/core/avatar/`: receita versionada, licença do VRM, política de menores, tiers de orçamento,
  estados, emoção para voz, mapa personagem para voz.
- **Motor** (`src/lib/avatar/`, chunk dinâmico com `three`): renderer WebGL2, carregador GLB/VRM, mãos, vida procedural,
  sincronia de boca, fallback 2D, IndexedDB próprio.
- **Telas** (`src/components/avatar/`): Ajustes > Avatar, cartão do perfil, avatar por lado no intérprete, PiP, painel do
  elenco nos livros, estúdio.
- **Três flags** (nascem desligadas): `avatar_3d`, `avatar_sinais`, `avatar_elenco` (migração PG 0016).
- **Loja**: `TipoDaLoja` ganha `'avatar'`.
- Em M0 esta mudança entregava só a especificação, as flags e a migração. (Velho desde 29/10/2026: M1 a M7 já estão no código, atrás das flags; ver a revisão no fim.)

## Intenção, metas e não-metas

**Metas.** (1) Qualquer pessoa tem um avatar em um clique, com sugestão e "pular". (2) Quem quer personalizar tem
receita, partes e "traga o seu" local. (3) O intérprete e os livros ganham um rosto que acompanha a fala. (4) Roda em
celular fraco (tier fraco, modo 2D). (5) Acessibilidade acima da estética.

**Não-metas.** Tradução para Libras ou ASL ao vivo. Foto de pessoa, clonagem de aparência ou de voz. Compartilhar avatar
entre usuários. Sala multiusuário. Acervo de terceiros (VRoid Hub, Sketchfab, Mixamo cru). Ligar flag em produção.

**Anti-metas.** Avatar como única forma de acessar o conteúdo (a legenda de texto fica sempre). Avatar como recompensa
de acessibilidade. Promessa de sinais corretos. Venda de avatar a menor com dinheiro. Dark pattern para trocar de visual.

## Personas e jornadas

- **Leigo:** abre Ajustes, vê um avatar sugerido, aceita com um toque ou "pular". Sem palavra técnica (VRM, GLB).
- **Experiente:** importa o próprio VRM/GLB (guia de 4 passos), lê o aviso de licença, personaliza a receita, exporta JSON.
- **Acessibilidade:** alto contraste, modo "só mãos", tamanho ajustável, movimento reduzido (sem vida procedural),
  teclado completo, leitor de tela com descrição do estado ("intérprete falando"). Acessibilidade vence a skin.
- **Diversidade:** tons de pele, tipos de corpo, cabelo (cacheado, trançado, sem cabelo), trajes e acessórios (óculos,
  hijab, kipá, aparelho auditivo, cadeira de rodas como parte do avatar), sem estereótipo por padrão. RTL (árabe) e idiomas
  da interface sem quebrar o layout do cartão.
- **Criança em perfil protegido:** só coleção curada, sem importar, sem galeria de terceiros, sem compra com dinheiro,
  sem miniatura de terceiros.
- **Baixa conexão:** modelo pequeno por tier, download em segundo plano, fallback foto/iniciais/SVG, nada bloqueia o app.

## Capabilities

### New Capabilities

- `avatares`: avatar da pessoa, avatar do intérprete e do PiP, narrador e personagens nos livros, com receita versionada,
  licença, menores, orçamento e fallback.

### Modified Capabilities

<!-- Nenhuma em M0. M4 toca modo-interprete e M6 toca a loja; os deltas entram nos marcos respectivos. -->

## Decisões do dono (valem)

Avatar traga-o-seu só local, para todos, com validador e leitura do `meta` da licença, sem compartilhar entre usuários ·
família própria via Blender · acessibilidade livre e vence a skin · não prometer tradução para Libras; sinais só como
demonstração rotulada até revisão por surdos · sem foto de pessoa, sem clonagem de aparência ou voz · produção FECHADA
(staging primeiro; ligar flag é ato do dono).

## Decisões do assistente (o dono pode trocar)

1. Branch `feat/avatar-interprete` a partir da `main`; Livros (M5) só depois do PR das frentes de Livros; um PR draft por marco.
2. Coleção curada pelo Frasy vale para menores mesmo com `meta` permissivo; "traga o seu" mantém a regra estrita.
3. Base derivada de Quaternius fica atrás da flag e fora de coleção pública/R2 até parecer (QAL v1.0 de 28/08/2026 conflita
   com o `License.txt` CC0 do pacote). O lançamento pode usar só ToxSam CC0 e peças próprias.
4. Boca por envelope de amplitude (nuvem) e cadência estimada (aparelho); visemas reais só com motor local futuro.
5. Sinais: só soletração, sob `avatar_sinais`, com os dois avisos fixos.
6. `three` e `@pixiv/three-vrm` por `import()` dinâmico num chunk próprio; `gltf-validator` vendorizado.

## Pendências do dono

PR único das 4 frentes de Livros (bloqueia M5) · parecer jurídico (Quaternius, `meta` de terceiros, menores, miniaturas de
terceiros, `espeak-ng`/Piper) · revisão por pessoas surdas antes de qualquer sinal sair de "demonstração" · checklist do PiP
no Safari real · ligar flags em staging e produção.

## Impact

Código novo em `src/core/avatar/`, `src/lib/avatar/`, `src/components/avatar/`; `src/core/planos.ts` (3 flags, feito em M0),
`server/db/migrations-pg/0016_flags_avatar.sql`, `server/http/csp.ts` (`VITE_AVATARES_URL`), `src/core/tiposDaLoja.ts`. Cotas e
direitos de plano NÃO mudam. Dependências novas: `three`, `@pixiv/three-vrm`, `gltf-validator` (vendorizado).

## Revisão de 25/11/2026

- **Estado: precisa decisão (e depois, pronta para ligar em staging).** O proposal original dizia "M0 entrega só a especificação", mas M1 a M7 já estão no código desde 29/10/2026 (quase 70 arquivos em `src/{core,lib,components}/avatar`, 40 testes de unidade e 20 e2e), atrás de três flags desligadas. Nada mais foi tocado depois de 29/10; #201, #202, #205 e #206 não afetam. As tarefas 1.x, 2.x e 6.x estavam sem marca por esquecimento e foram reconciliadas em `tasks.md`.
- **O que ficou velho:** (1) o texto "Em M0 esta mudança entrega só a especificação" e "Nenhum código de avatar"; (2) a pendência "PR único das 4 frentes de Livros (bloqueia M5)": M5 já foi feito atrás de `avatar_elenco` e `avatar_3d`; (3) a opção B de `leitura_elenco` (função no servidor com subcota em `planos.ts`) conflita com o corte de custo de 02/10 e com os planos v4: só a opção A (arquivo gerado fora do produto, zero de API) cabe sem custo novo. Planos e cotas não mudam com esta change.
- **Esforço restante: P** (M em número de passos, mas quase tudo é conferência): runbook da flag, i18n es/ar, juiz de microcopy, 3 conferências em aparelho real e publicação da coleção no R2. Código novo só se o dono quiser `leitura_elenco` (M, opção A) ou cobrir lacunas achadas na conferência.
- **Valor para quem usa: médio.** Acessibilidade e personalização reais, mas só para quem abre Intérprete e Livros; soletração de Libras é demonstração rotulada e não pode ser vendida como tradução.
- **Dependências:** `filtro-tutor-menores` (qualquer saída nova de IA para perfil protegido), `interprete-conversa-virtual` (avatar por lado no Intérprete, mesmos arquivos de `ModoInterprete`), `audiolivros` (`audiolivros_elenco` é independente de `avatar_3d`, mas usa o mesmo mapa personagem para voz). Conflito de arquivos baixo (a pasta de avatar está parada); cuidado com `ModoInterprete.tsx` e `src/lib/leitor/narrador.ts`.
- **Decisões do dono:**
  1. Ligar em staging agora? (a) sim, só no id do dono, depois de publicar a coleção no R2 e rodar a tarefa 4.6/8.1 (recomendado); (b) esperar o parecer jurídico antes de qualquer staging; (c) congelar o avatar até haver prioridade.
  2. `leitura_elenco`: (a) não fazer, ficar com a heurística (recomendado agora, zero custo); (b) opção A, arquivo gerado offline por `claude -p` para os livros do catálogo; (c) opção B, função no servidor (exige custo declarado, subcota e migração; só depois de o custo do plano v4 fechar).
  3. `avatar_sinais`: (a) manter desligada até a revisão por pessoas surdas (recomendado); (b) ligar como demonstração rotulada em staging; (c) remover a soletração do produto.
  4. Parecer jurídico sobre Quaternius, `meta` de terceiros e menores: pedir junto da consulta dos anúncios (menor custo) ou dispensar a base derivada de Quaternius e lançar só com ToxSam CC0 e peças próprias (recomendado, já previsto na decisão 3 do assistente).
