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
| A. Fundamentos | A1–A14 | **em curso.** Feito: A1–A4, A8 (curvas e molas de 45 pontos em `src/lib/polimento/base.ts`), A11 e A12 (tipografia e sombras: `polimento.css` trazido sem reescrita). Aberto: A5–A7, A9, A10, A13, A14 |
| B. Casca: movimento | B1–B49 | **em curso.** Feito e conferido contra o protótipo (mesmas durações, curvas e quadros lidos nas duas páginas): B5–B8 pílula das abas e do trilho e salto do ícone; B9–B11 saída de tela; B12–B16 entrada (título por palavra, sobrancelha, cascata, revelação na rolagem, teclado sem animação); B17 aba primária pelo lado; B19 borda de rolagem. Vieram pelo CSS, ainda sem prova lado a lado: B1, B3, B4, B42–B47. Aberto: B2, B18, B20–B41, B48, B49 |
| C. Sentidos | C1–C12 | aberto |
| Jogos 1. Casca da partida | `jogos.md` §1 | aberto |
| Jogos 2. Níveis por jogo | §2 | aberto (hoje: fator uniforme em 10 jogos) |
| Jogos 3. Ajudas | §3 | aberto (hoje: "Ver resposta" é desistir; falta o Duelo no "+10 s") |
| Jogos 4. Explicação em três telas | §4 | aberto (não feita) |
| Jogos 5. Menos atrito | §5 | conferir os 5 feitos e completar |
| Jogos 6. As 18 cenas | §6 | aberto (Rali e Mala: refazer do zero) |
| Jogos 7. Miniaturas do lobby | §7 | aberto (hoje: cenas paradas minhas) |
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
| Telas de dentro do Jogar (lobby, antessala, rodada, fim) | saem com a animação de saída | só entram; ainda não saem | Elas trocam dentro de `Play.tsx`, fora da navegação. **Aberto**, não é decisão: falta portar. |
