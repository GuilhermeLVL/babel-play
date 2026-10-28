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
- **Três flags** (nascem desligadas): `avatar_3d`, `avatar_sinais`, `avatar_elenco` (migração PG 0015).
- **Loja**: `TipoDaLoja` ganha `'avatar'`.
- Em M0 esta mudança entrega só a especificação, as flags e a migração. Nenhum código de avatar.

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
`server/db/migrations-pg/0015_flags_avatar.sql`, `server/http/csp.ts` (`VITE_AVATARES_URL`), `src/core/tiposDaLoja.ts`. Cotas e
direitos de plano NÃO mudam. Dependências novas: `three`, `@pixiv/three-vrm`, `gltf-validator` (vendorizado).
