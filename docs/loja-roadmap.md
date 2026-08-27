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
