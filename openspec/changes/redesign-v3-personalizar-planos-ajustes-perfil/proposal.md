## Why

Ajustes, Planos e Perfil abriam cada um com o seu próprio cabeçalho escrito à mão (três tamanhos
de título, kicker ora `text-accent` ora `text-accent-ink`), e os filtros da Loja usavam a pílula
accent que a F6 e a F7 já trocaram por ink. O protótipo v3 não desenha estas telas; elas recebem
a linguagem por extensão (PLANO §F9-F10): a mesma hierarquia de cabeçalho das outras telas e a
mesma pílula ativa.

## What Changes

- Ajustes, Planos e Perfil pelo `CabecalhoDeTela` (kicker com ícone por perfil em Ajustes; o
  subtítulo de Planos continua a frase com o plano em negrito). Mesmos textos e chaves i18n.
- Filtros da Loja em `kpi-pill` com `active` em ink (D-012), mantendo `aria-pressed`.
- Personalizar (abas, catálogo, carteira com Seeds e Créditos, Passe, Desafios) já vinha das
  rodadas anteriores com `Abas`/`card-panel` e continua igual: o v3 inventa um catálogo que o app
  não tem (D-016), então o app vence.

## Nao-escopo

Sobre mantém o herói do criador em `font-marca` (é a única tela de marca do app, decisão da
rodada de 08/09). Login, Onboarding, GateDeConta e ErroDaTela já usam tokens e ficam para a
passada de estados da F12.
