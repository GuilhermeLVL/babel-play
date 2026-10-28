# Avatares no Frasy: Eu, Intérprete, Narrador e Personagens

Status: proposta (M0), aguardando o dono · Data: 2026-10-28 · Autor: Guilherme (com Claude)

Change OpenSpec: `openspec/changes/avatar-interprete/`. Esta spec é o detalhe técnico; a intenção, as personas e as
tarefas por marco estão lá.

## Problema

Intérprete, leitor de livros e perfil são telas de texto e voz sem rosto. Os protótipos provaram avatar 3D low poly com
mãos articuladas, mas nada está no app. Queremos um avatar opcional, barato de rodar, seguro para menores e que nunca seja
o único caminho para o conteúdo.

## Decisões do dono

Traga-o-seu só local, para todos, com validador e leitura do `meta` · família própria via Blender · acessibilidade livre
e vence a skin · sem promessa de tradução para Libras; sinais só como demonstração rotulada até revisão por surdos · sem
foto de pessoa, sem clonagem de aparência ou voz · produção FECHADA (staging primeiro; ligar flag é ato do dono).

## Decisões do assistente (trocáveis)

Ver `proposal.md` da change (seis itens: base do trabalho, coleção curada para menores, Quaternius, boca por
amplitude, sinais só soletração, `three` em chunk dinâmico).

## Arquitetura por camadas

| Camada                                                             | Pasta                    | Conteúdo                                                                                                                                                                                            |
| ------------------------------------------------------------------ | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| core (puro; sem React, rede, DOM, sem `URL`/`TextDecoder` globais) | `src/core/avatar/`       | receita e validação, licença, menores, tiers, estados, emoção para voz, mapa personagem para voz, fila e ritmo (espelha `ritmoDaLegenda`)                                                           |
| lib                                                                | `src/lib/avatar/`        | renderer three (WebGL2), carregador GLB/VRM, motor de mãos (esquema `frasy-alfabeto-mao/2`), vida procedural, boca, spring bones por tier, IndexedDB `frasy-avatar`, importador, fallback sem WebGL |
| components                                                         | `src/components/avatar/` | `AvatarCanvas`, seletor, personalização, estúdio, cartão do perfil, painel do elenco                                                                                                                |
| flags e planos                                                     | `src/core/planos.ts`     | `FLAG_AVATAR_3D`, `FLAG_AVATAR_SINAIS`, `FLAG_AVATAR_ELENCO` (M0, feito)                                                                                                                            |

`core/avatar` não importa de `gateway`, `components` nem `lib` (regra de ESLint existente). Nada de `three` no core.

## Receita versionada

Objeto JSON, `versao: 1`, validação estrita (campo desconhecido é rejeitado):

| Campo                     | Tipo                                     | Notas                                                                |
| ------------------------- | ---------------------------------------- | -------------------------------------------------------------------- |
| `versao`                  | `1`                                      | migração por versão; versão futura é recusada com mensagem           |
| `base`                    | id da família ou da coleção              | `robo`, `voxel`, `pato`, `frasy`, ou id da coleção curada            |
| `origem`                  | `'familia' \| 'colecao' \| 'local'`      | `local` = traga-o-seu (arquivo só no IndexedDB)                      |
| `pele`, `cabelo`, `olhos` | token de paleta                          | tons variados, sem padrão estereotipado                              |
| `corpo`                   | `'a' \| 'b' \| 'c' ...` (chaves da base) | tipos de corpo definidos por base                                    |
| `partes`                  | lista de ids de catálogo                 | cabelo, traje, acessório; cada parte tem `acesso: 'livre' \| 'loja'` |
| `acessibilidade`          | `{ soMaos, altoContraste, escala }`      | vence a skin; nunca é item pago                                      |
| `nome`                    | texto curto                              | opcional                                                             |

Não entram: foto, URL de terceiros, dado biográfico. Exportar e importar `.json` (M6) com a mesma validação.

## Licença do VRM

O validador lê o `meta` do modelo antes de salvar e decide por campo real.

- **VRM 1.0** (`VRMC_vrm.meta`): `licenseUrl`, `avatarPermission` (`onlyAuthor|onlySeparatelyLicensedPerson|everyone`),
  `commercialUsage` (`personalNonProfit|personalProfit|corporation`), `allowExcessivelyViolentUsage`,
  `allowExcessivelySexualUsage`, `allowPoliticalOrReligiousUsage`, `allowAntisocialOrHateUsage`, `creditNotation`,
  `allowRedistribution`, `modification`.
- **VRM 0.x** (`VRM.meta`): `allowedUserName` (`OnlyAuthor|ExplicitlyLicensedPerson|Everyone`), `violentUssageName`
  (`Disallow|Allow`; a grafia com dois "s" é a do esquema), `sexualUssageName`, `commercialUssageName`,
  `otherPermissionUrl`, `licenseName`, `otherLicenseUrl`.
- **GLB sem `meta`:** licença desconhecida.

Regras: (1) `onlyAuthor` ou equivalente: recusa. (2) Para adulto, o aviso informa o que está permitido e o que não, e o
uso é local e pessoal. (3) Para perfil protegido, "traga o seu" exige licença explícita com uso excessivamente violento e
sexual não permitidos; licença ausente ou desconhecida: recusa. (4) A coleção curada pelo Frasy vale para menores mesmo com
`meta` permissivo, porque foi avaliada por nós. (5) Ler o `meta` é triagem, não parecer jurídico; o texto da UI diz isso.

## Política de menores

Perfil protegido (`server/lib/idade.ts`: menor ou idade não declarada): só coleção curada; sem importar; sem galeria de
terceiros nem miniaturas de terceiros; sem compra com dinheiro; sem soletração de sinais fora do rótulo; nenhum dado de
avatar sai do aparelho. O servidor continua sendo a fonte da decisão de compra e de idade.

## Tiers e orçamento

| Tier    | Quem                                            | Teto de triângulos | Extras                                   |
| ------- | ----------------------------------------------- | ------------------ | ---------------------------------------- |
| fraco   | celular fraco (`CPU_LENTA`), PiP, modo economia | <= 20k             | sem spring bones, sombra simples, 30 fps |
| desktop | demais                                          | <= 70k             | spring bones, 60 fps                     |
| 2D      | sem WebGL2 ou "só imagem"                       | 0                  | foto, iniciais ou SVG                    |

Detecção em `lib/avatar` (WebGL2, memória do dispositivo, núcleos, preferência). O PiP sempre usa o tier fraco. Modelo
acima do teto do tier é recusado na importação ou simplificado só se a base permitir; nunca decodifica antes de ler o
cabeçalho (teto de bytes, de texturas e de triângulos declarados).

## Estados do avatar

`parado`, `ouvindo`, `pensando`, `falando`, `erro`, mais a emoção base (`neutra`, `alegre`, `triste`, `surpresa`, `brava`).
Transições puras no core (`estadoDoAvatar(estado, evento)`); eventos vêm do `TtsEngine` (`onStart/onEnd/onError`) e do
intérprete. Falha de carregamento nunca bloqueia: cai para o tier abaixo.

## Sincronia de boca (limite documentado)

Nenhum motor atual devolve visemas. Portanto: **nuvem** (`<audio>`) usa envelope de amplitude via `AnalyserNode`;
**aparelho** (`speechSynthesis`) usa cadência estimada pelo texto e pelo ritmo, com `boundary` quando o navegador emitir.
Isso é "boca que acompanha a fala", não leitura labial. A UI e a documentação não prometem mais que isso. Visemas reais só
com motor local futuro (Piper/Kokoro dependem de parecer; `espeak-ng` é GPL e fica de fora).

## Emoção para voz

Tabela pura `emocao -> { ritmo, tom }`. A nuvem não aceita tom: só o ritmo muda. O aparelho usa `rate` e `pitch` do
`speechSynthesis` em faixas curtas. Emoção ausente = neutra. Nunca altera o texto falado.

## Soletração sob flag (`avatar_sinais`)

Só soletração de nomes e palavras sem sinal, usando o motor de mãos. Dois avisos fixos e sempre visíveis: "demonstração" e
"não é tradução para Libras". Sem "tradução ao vivo". Sai do rótulo apenas após revisão por pessoas surdas (pendência do
dono). Desligada, nada aparece.

## Privacidade

O arquivo do usuário (VRM/GLB) nunca vai ao servidor: vive no IndexedDB `frasy-avatar` (leitura e escrita em `try/catch`,
como o resto). Nada de foto de pessoa, clonagem ou compartilhamento entre usuários. Galeria de terceiros: só ToxSam com
opt-in explícito e desligada para menor. Telemetria só de contagem agregada (abaixo), sem conteúdo. Apagar avatar apaga
tudo do IndexedDB.

## Carregamento

`three` e `@pixiv/three-vrm` por `import()` dinâmico num chunk próprio, fora do arranque (teste de orçamento de chunk em
M1). `gltf-validator` vendorizado, nunca por CDN. Modelos da coleção ficam no R2 e entram por `VITE_AVATARES_URL`, que
`server/http/csp.ts` acrescenta ao `connect-src` por `origemDe()`. COEP `credentialless` exige CORS no R2; Safari não aceita
`credentialless` (teste no Safari real, pendência do dono). Download em segundo plano, com fallback 2D enquanto espera.

## Loja

`TipoDaLoja` ganha `'avatar'` (`src/core/tiposDaLoja.ts`). Itens livres usam `nivel:1`. Posse paga continua vinda do
servidor. Perfil protegido não compra com dinheiro. Acessibilidade (alto contraste, só mãos, escala) nunca é item.

## i18n

Textos via `t()`, pt e en completos, es e ar acima do piso (`cobertura.json`). Rodar `i18n:orfas`. RTL: o cartão e os
controles espelham sem quebrar. Nomes de partes vêm de chave de catálogo, não de texto livre. M0 não adiciona chaves (sem UI).

## Métricas

Contagens agregadas, sem conteúdo nem identificador de avatar de terceiros: avatar ativado (família, coleção ou local),
tier usado, quedas para 2D (motivo), tempo de carregamento do chunk, FPS médio e custo por frame no tier fraco (M7, em
Chrome real), falhas de importação por motivo (licença, teto, formato).

## Critérios de aprovação do LLM-as-judge

Sem créditos de API: `claude -p` e `agy -p`, no máximo 3 em paralelo. O juiz nunca decide sozinho; a falha dele vira tarefa
e a aprovação não substitui teste.

- **Falante e emoção por frase (M5):** conjunto de ouro em pt/en/es (travessão, aspas, narração, cenas emotivas). Rubrica:
  atribuição correta do falante, emoção plausível, não inventar personagem, consistência. Compara IA, heurística e pior caso.
  Limiar numérico fixado antes de ligar `avatar_elenco`; abaixo dele a flag não liga.
- **Textos de produto:** juiz com a skill `copy-br-etica` (microcopy, avisos de licença, ECA).
- **Jornadas e telas:** capturas de cada fluxo (leigo, experiente, acessibilidade, diversidade, criança, baixa conexão),
  crítica em rubrica fixa, correção e nova rodada até passar. Resultados em `docs/pesquisa/`.

## Guardas

Nenhum código AGPL, GPL ou NC (sign.mt, VoiceStudio, MANO, `espeak-ng` sem parecer). Sem Mixamo cru, sem VRoid Hub ou
Sketchfab como acervo. Poses rotuladas como demonstração. Avatar nunca é a única forma de acessar o conteúdo (legenda de
texto sempre presente). Produção fechada. Cota e direito de plano NÃO mudam; flag nunca é direito (`docs/flags.md`).

## Marcos

M1 núcleo e motor · M2 meu avatar · M3 fala · M4 intérprete e PiP · M5 livros e personagens (depende do PR de Livros) ·
M6 estúdio e loja · M7 qualidade e entrega. Cada marco: spec, testes, implementação, verificação, juiz, PR draft. Tarefas e
critérios de aceite em `openspec/changes/avatar-interprete/tasks.md`.

## Pendências do dono

PR único das 4 frentes de Livros · parecer jurídico (Quaternius QAL × CC0, `meta` de terceiros, menores, miniaturas de
terceiros, `espeak-ng`/Piper) · revisão por surdos antes de sair do rótulo "demonstração" · checklist do PiP no Safari real ·
ligar flags em staging e produção.
