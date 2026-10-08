# Passada de fidelidade: estado

Em 08/10/2026 o dono viu as fases 0 a 4 rodando e rejeitou o resultado: era uma versão APROXIMADA do
protótipo. A regra passou a ser esta, e ela vale sobre qualquer coisa escrita antes em `design.md`,
`proposal.md` e `tasks.md`:

1. **A fonte é o código do protótipo** (`babel-play-lab/docs/prototipos/polimento-movimento-src/`).
   Cada valor é copiado de lá, com `arquivo:linha`. Os dois inventários ao lado (`casca-e-telas.md` e
   `jogos.md`) são a especificação.
2. **Nada de decisão minha no lugar do desenho.** Só fica diferente o que está na lista
   "Diferente de propósito", abaixo.
3. **Um item só fecha com prova lado a lado**: protótipo e app na mesma medida, captura dos dois e as
   animações que rodaram. Sem prova, fica aberto.

Decisões do dono:
- Vale em todo aparelho, inclusive o Meta Quest (risco de engasgo aceito; medir e avisar).
- O protótipo manda na tela: o que ele não mostra sai da tela (Pausar, passo a passo guiado, faixa de
  ranking). O que não se vê continua por baixo (nota de revisão, gravação da rodada, Esc pausa).
- O protótipo vence as regras e os testes do app, menos contraste de leitura e o "reduzir movimento"
  do sistema.

## Blocos

| Bloco | Itens | Estado |
|---|---|---|
| A. Fundamentos | A1–A14 | **em curso.** Feito: A1–A4, A8 (curvas e molas de 45 pontos em `src/lib/polimento/base.ts`), A11 e A12 (tipografia e sombras: `polimento.css` trazido sem reescrita). A13 (refino do computador) e A14 (selo com ícone), conferidos em Estatísticas: sete medidas iguais nas duas páginas (título 34 px, abas rebaixadas, bordas de 1 px, pílula, cartão, espaçamento). Aberto: A5–A7, A9, A10 |
| B. Casca: movimento | B1–B49 | **em curso.** Feito e conferido contra o protótipo (mesmas durações, curvas, quadros e estilos lidos nas duas páginas): B2 onda no toque; B5–B8 pílula e salto do ícone; B9–B11 saída de tela; B12–B16 entrada; B17 aba primária; B19 borda de rolagem; B20–B26 painel Mais (entrada, cascata, véu, vidro, tela de trás, saída, troca de aba com altura, folha de baixo com arrasto); B34 claro/escuro em círculo (850 ms); B36 aura; B37 luz no cartão; B38 inclinação 3D. Feito, conferido só por teste: B31–B33 toast (vida de 3400 ms, pausa, arrasto 45 px / 0,11 px/ms); B35 troca de pele em círculo (800 ms). Vieram pelo CSS, sem prova lado a lado: B1, B3, B4, B42–B47. B27, B28 e B30 feitos e lidos no app (diálogo: entrada de 560 ms a partir do botão, filhos 420 ms com 140 + 45·i, saída de 200 ms em 0,94; busca: 480 ms só por clique, pelo teclado não anima; o foco volta ao botão); B29 veio pelo CSS. Aberto: B18, B39–B41 (partículas com paralaxe, rajada, confete: o app tem motor próprio), B48, B49 |
| C. Sentidos | C1–C12 | aberto |
| Jogos 1. Casca da partida | `jogos.md` §1 | **em curso.** Feito: o cabeçalho (selo de nível colorido que abre a troca, "Como se joga", Recomeçar escondido, sem Pausar na tela) e a contagem 3-2-1 só no Duelo. Aberto: a instrução no alto do palco, o retorno de acerto e erro (vinheta, texto que sobe, selo de combo), o HUD conferido medida a medida |
| Jogos 2. Níveis por jogo | §2 | aberto (hoje: fator uniforme em 10 jogos) |
| Jogos 3. Ajudas | §3 | aberto (hoje: "Ver resposta" é desistir; falta o Duelo no "+10 s") |
| Jogos 4. Explicação em três telas | §4 | **feito** e conferido contra o protótipo no Rali (mesma caixa de 540 px, mesmas medidas internas, mesmos textos nas três telas; entrada 560 ms e saída 280 ms). Abre na primeira partida, pelo "Como se joga" e pelo selo; trocar o nível recomeça a rodada. Textos dos 18 jogos extraídos do protótipo rodando |
| Jogos 5. Menos atrito | §5 | conferir os 5 feitos e completar |
| Jogos 6. As 18 cenas | §6 | aberto (Rali e Mala: refazer do zero) |
| Jogos 7. Miniaturas do lobby | §7 | **feito** e conferido: 18 miniaturas do protótipo, mesmas medidas (cena de 112 px, cartão de 262 × 331) |
| Jogos 8. Fim de rodada | §8 | aberto |
| D. Telas | D1… | aberto |
| E. Celular | E… | aberto |
| F. Tema Água | F… | começado: cores e pontas do tema; falta a cena inteira |

## Diferente de propósito

| O quê | Protótipo | App | Por quê |
|---|---|---|---|
| Verde do tema Água claro (`--good`) | `#1F8A5B` | `#1E8758` | Texto branco sobre ele dava 4,33:1; o mínimo de leitura é 4,5:1. Diferença invisível a olho. |
| Câmera lenta e chave "Polido × Atual" | botões da barra do protótipo | não existem; "Polido" é o interruptor Animações do app | Eram ferramentas da página de demonstração, não do app. |
| Tela de carregamento | não existe (dados fixos) | o esqueleto aparece sem cerimônia e a entrada toca quando o conteúdo chega | O app busca dados de verdade; animar o esqueleto e depois o conteúdo tocaria a entrada duas vezes. |
| Troca presa à animação | a troca espera a animação de saída terminar | espera, mas um relógio de 400 ms garante a troca | Numa aba em segundo plano o navegador congela animações; no app a navegação não pode travar. |
| Preferências do sistema (transparência, contraste, menos movimento) | ignoradas por padrão; valem com o botão "Seguir o sistema" | ignoradas enquanto as animações estiverem ligadas no app; com elas desligadas a camada inteira sai | É a regra de `prototipo.js:26-33`, com o interruptor Animações do app no papel do botão. Sem isso, um Windows com transparência desligada mostrava os painéis opacos, diferentes do desenho. |
| Fonte dos títulos | o arquivo do protótipo, aberto do disco, cai numa fonte reserva | a fonte de verdade do app (a mesma de produção) | O protótipo não embute as fontes; a que ele mostra é acidente de abrir do disco. |
| Telas de dentro do Jogar (lobby, antessala, rodada, fim) | saem com a animação de saída | só entram; ainda não saem | Elas trocam dentro de `Play.tsx`, fora da navegação. **Aberto**, não é decisão: falta portar. |
