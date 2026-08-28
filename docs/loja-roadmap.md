# Loja de personalização — pesquisa, referências e roadmap da galeria (2026-08-27)

## Referências estudadas

- **Lojas de temporada (Fortnite / Roblox)**: raridade com cor própria, rotação de vitrine,
  "o que vem no próximo nível", prévia animada do item, e a moeda ganha jogando comprando o
  atalho. → Já aplicado: raridades comum/raro/épico/lendário, vitrine do próximo nível, Seeds.
- **Catálogos de cursor** ([custom-cursor.com](https://custom-cursor.com/),
  [cursor-trails.com/collections](https://cursor-trails.com/collections),
  [custom-cursor-trails.com](https://custom-cursor-trails.com/)): milhares de cursores por
  coleção temática + rastros (glitter, estrelas) como categoria própria. → Aplicado: cursores
  emoji + rastros como itens; coleções temáticas ficam para os packs abaixo.
- **Gamificação de engajamento** ([guia da Wix Studio](https://www.wix.com/studio/blog/website-gamification)):
  progressão visível, recompensa por retorno diário, colecionáveis. → Aplicado: barra de
  aprimoramento Nv.0-3 com %, colecionável de eventos raros na antessala.

## O que já está no catálogo (v2)

Temas (7) · Fonte Arcade · Partículas (6 skins) · **Aprimoramentos com progressão** (Explosão de
Partículas com intensidade editável, Sorte de Eventos) · **Packs de emoji (12)** · **Cursores (9)** ·
**Rastros do mouse (6)** · Posições do menu (4, topo/esquerda sempre livres) · Estúdio (lendário).

## Roadmap da galeria (por esforço: P = horas, M = 1-2 dias, G = semana+)

| Item | Raridade sugerida | Esforço | Nota |
| --- | --- | --- | --- |
| Molduras de avatar (anel pixel, fogo, louros) | raro-épico | P | círculo decorado em volta do avatar do perfil |
| Títulos/insígnias ("Poliglota", "Maratonista", "Caçador de Patos") | comum-lendário | P | ganhos por feito + exibidos no ranking |
| Kits de SOM de acerto (8-bit, orquestra, lo-fi, taberna) | raro | M | trocar THEME_VOICES por kit equipado |
| Fundos animados do app (chuva, neve, vagalumes, pétalas) | épico | M | camada ambient do ParticleCanvas com presets |
| Trilhas de combo (a barra do Duelo com skin: lava, arco-íris, circuito) | raro | P | classe CSS por skin no anel/barra |
| Animações de level-up alternativas (foguete, dragão de emojis, fogos) | épico | P | composições novas em eventosDeJogo |
| Mascote reativo no canto (pato que comemora acertos) | lendário | G | sprite + estados; candidato à identidade da marca |
| Temas sazonais (Halloween, Natal, Festa Junina) | épico | M | paletas + pack de emoji + evento raro temático |
| Skins do teclado dos jogos (Termo/Ditado) | raro | P | classes no teclado virtual |
| Efeito de entrada da sessão ("READY? GO!" arcade) | raro | P | overlay curto no início da captura/jogo |
| Cursores animados (rastro de chama no próprio ponteiro) | lendário | M | sprite-sheet via CSS animation em data-URI |
| Boosters temporários (2× Seeds por 1 hora) | consumível | M | cuidado: primeiro item consumível, muda a economia |

## Princípios que valem para tudo

1. Nada custa dinheiro; a moeda é estudo (Seeds) ou constância (nível).
2. Todo item tem prévia REAL antes de comprar (o mouse, uma amostra de partícula, o mockup).
3. Reversível sempre: equipar nunca tranca (a lição das posições do menu).
4. Guardas de acessibilidade vencem cosmético: animações desligadas silenciam tudo.

## Galeria & perfis (2026-08-28) — FEITO

- **Paletas**: 30 matizes × 6 estilos (claro, pastel, papel, escuro, néon, meia-noite) + 20 curadas =
  200 paletas geradas em tempo de execução (`lib/galeria/paletas.ts`), aplicadas pelo tema `custom`
  (quatro variáveis CSS). Zero CSS novo; teste trava contraste ink×fundo ≥ 7:1 em todas.
- **Emojis**: catálogo de ~380 em 14 categorias (`lib/galeria/emojis.ts`); pack PERSONALIZADO
  (`babel.pack_custom`): escolher um a um, categoria inteira, excluir. Alimenta partículas e rastro.
- **Rastros**: forma (faíscas/estrelas/corações/pixel/bolinhas) × qualquer paleta = 1.000+ combinações
  (`gen:<forma>:<paleta>`), ou lista de emojis escolhidos (`emojis:<lista>`). Resolvidos em tempo de
  execução para `kind` + `sobrescrever` da spec — nenhuma spec nova.
- **Cursores**: qualquer emoji do catálogo (`emoji:<char>`); a regra CSS é injetada só para o equipado.
- **Perfis**: 16 presets completos ("Tudo de pato", "Tudo de coração", Arcade, Espaço, Pizzaria…) +
  perfis próprios salvos com nome. Tela: Loja → "Perfis & criar o seu".
- Custo: ~12 KB de dados; nenhum asset baixado. Itens da galeria são livres (a Loja continua vendendo os
  temas nativos, packs e cursores curados por Seeds/nível).

### Acesso à galeria (2026-08-28, v2) — a mesma régua da Loja

Cada capacidade virou item `tipo: 'galeria'` no catálogo e abre por nível OU Seeds (conquista onde
for exclusivo). Mapa em `lib/galeria/acesso.ts`:

| Nível | Abre |
| --- | --- |
| 1 | paletas Claro e Papel · 5 categorias de emoji (animais, comidas, natureza, rostos, símbolos) · packs prontos · 5 perfis livres |
| 2 | paletas Pastel (50) · editor de pack (50) · emojis Patos & aves (40), Esportes (40) |
| 3 | paletas Escuro (60) · cursor de qualquer emoji (100) · Festa (50), Música (50) |
| 4 | Espaço (100), Transporte (100) · rastro forma × paleta por forma (= o rastro da Loja) |
| 5 | paletas Néon (120) · Objetos (110), Bebidas (60) |
| 7 | paletas Meia-noite (220) |
| conquista | Corações (pack) · Bolinhas do rastro (Colecionador) · tema Aurora (Constante) |

O editor nunca esconde: mostra o cadeado, o motivo e "Obter · N Seeds". Presets trancados listam o
que falta. Tela reorganizada: "Seu visual agora" + perfis + acordeão (uma peça por vez) com um
seletor de emojis único.

### Centralização (2026-08-28) — uma tela, um dono por preferência

Mapeado antes de mexer: tema editável em 4 lugares (Estúdio, cluster morto, Loja, Personalizar),
paleta em 3 galerias que discordavam, som/animações/desempenho em 2, perfil/posição em 3, e dois
furos de gate (Estúdio e galeria de paletas contornavam o nível). Depois:

| Preferência | Único dono |
| --- | --- |
| tema, paleta, fonte, partículas, emojis, cursor, rastro, perfil de exibição, posição do menu, perfis | **Personalizar › Visual** |
| cores livres e layout dos painéis | Estúdio (aberto SÓ pelo Visual, com o gate do nível/Loja) |
| comprar/liberar | Personalizar › Loja (não equipa mais; "Liberado · usar no Visual") |
| tamanho do texto, som, animações, desempenho, claro/escuro | barra de controles (sempre à vista) |
| idioma, captura, motores, conta, dados | Ajustes (sem aparência) |

Removidos: popover de Aparência do cluster (170 linhas atrás de flag falsa), seções Aparência e
Desempenho dos Ajustes, Modo/Tema/galeria do Estúdio, "Equipar" da Loja. Segurança: o atalho
`window.babel.liberarTudo()` / `?liberar=1` só existe em desenvolvimento, e o Ajustes deixou de
assumir nível 99 enquanto as métricas carregam.
