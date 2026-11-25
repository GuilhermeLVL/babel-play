## Why

A cena do vídeo ajuda a lembrar a palavra (rosto, legenda, objeto na tela), e a revisão enxuta do app já reconhece a falta:
"A cena de vídeo: o app não guarda quadro; a cena é sempre a de onda" (`openspec/changes/cartoes/revisao-enxuta.md`, "O que
ficou de fora"). O dado existe no meio do caminho e é jogado fora:

- A captura de áudio do sistema usa `getDisplayMedia`, que EXIGE uma faixa de vídeo (`src/gateway/capture/systemAudio.ts`,
  `QUALIDADE_DO_VIDEO_DA_TELA`: 1 quadro/s, até 640x360). O comentário do código já prevê: "Quando um recurso de visão
  precisar da imagem, `applyConstraints` na faixa sobe a taxa e a resolução sem pedir o compartilhamento de novo."
- O cartão tem só o áudio e o texto (tabela `vocab_cards`: `sentence`, `cloze_*`; nenhum campo de imagem).

Mas a imagem de uma TELA é o dado mais perigoso que o app pode tocar: ela mostra notificações, conversas privadas, nomes,
rostos de terceiros e, para menores, tudo o que estiver aberto ao lado do vídeo. Por isso esta change é SEPARADA da do áudio
e muito mais restrita.

## Para quem

Quem revisa cartões nascidos de vídeo, jogo ou aula (aba, janela ou tela compartilhada). Não vale para Intérprete (conversa
frente a frente, sem tela compartilhada) nem para captura só de microfone.

## What Changes

Atrás da flag nova `cartao_com_cena` (nasce DESLIGADA; depende do armazém local da `cartao-com-audio-do-trecho`, tarefa 2.2).

- **Um quadro por palavra, só quando a pessoa pede.** No painel da frase, um botão "Guardar a cena" (não automático, nunca
  por palavra salva em massa) tira UM quadro da faixa de vídeo já compartilhada: sobe a resolução por `applyConstraints`
  por um instante, desenha no canvas, reduz a no máximo 480 px de largura e codifica em WebP (q 0,6; ~20 a 40 KB).
- **Só no aparelho. Sempre.** O quadro vai para o IndexedDB, no mesmo armazém do clipe de áudio (apagar o cartão apaga a cena;
  trocar de conta apaga tudo). **Não existe destino na conta nem rota no servidor para a imagem.** É a decisão de projeto
  desta change, e é o que a torna segura para menores.
- **Antes de guardar, a pessoa vê e pode cobrir.** A pré-visualização aparece com "Cobrir um pedaço" (retângulo preto) e
  "Descartar". Só o que ela confirma é gravado. Nada é gravado sem a pré-visualização.
- **Só a superfície certa.** Quando `superficieCompartilhada()` diz `monitor` (tela inteira), o botão exige confirmação
  extra ("Isto guarda tudo o que está na tela agora"); com `browser` (aba), é direto. Na janela (`window`), idem aba.
- **Aparece no verso do cartão** como a cena (hoje é só a onda com a inicial de quem falou), com "Remover a imagem".
- **Exportação**: vai no `.apkg` (campo `<img>` + mídia) só quando a pessoa marca "Levar as imagens" na hora de exportar; o
  padrão é NÃO levar.

## Delta sobre o que já existe

Fecha o item "A cena de vídeo" de `cartoes/revisao-enxuta.md` e a nota do `systemAudio.ts`. Não duplica nenhuma change ativa
ou arquivada (conferido em `openspec/changes` e `archive`). Reaproveita o armazém local da `cartao-com-audio-do-trecho`.

## Fora de escopo

- Captura automática de quadros, "linha do tempo" de imagens ou gravação de vídeo.
- Qualquer envio da imagem a servidor, a provedor de IA (OCR, descrição, "o que é isto?") ou a terceiros.
- Reconhecimento de rostos ou de texto na imagem.
- Câmera do aparelho (só a faixa de tela já compartilhada).
- Perfil protegido na primeira rampa (ver Decisões do dono).

## Privacidade e retenção zero

- A imagem NUNCA sai do aparelho: nem para o servidor do Frasy, nem para IA. Não há "retenção" a declarar porque não há
  tratamento externo; mesmo assim o ROPA ganha uma linha ("imagem da cena do cartão, só no aparelho do titular, sem
  transferência") para ficar completo.
- **Perfil protegido**: recomendação é NÃO ter a função na v1 (botão ausente). O risco de um menor guardar, sem querer, uma
  conversa privada ou o rosto de um colega é maior do que o ganho pedagógico; a onda com a inicial continua sendo a cena.
  Se o dono liberar para 16-17 anos depois, entra com a pré-visualização obrigatória já descrita e uma mensagem de cuidado.
- Terceiros: o aviso na primeira vez diz "A imagem pode mostrar outras pessoas e mensagens. Confira antes de guardar."
- A faixa de vídeo continua a 1 quadro/s e 640x360 salvo durante os ~300 ms do quadro; a pessoa não percebe, e o
  compartilhamento não é reaberto.

## Armazenamento e custo

~30 KB por cena; teto local de 100 MB (3.000 cenas), o mais antigo sai com aviso. Custo de IA e de servidor: zero. Custo de
CPU: um `applyConstraints`, um `drawImage` e uma codificação WebP, uma vez por pedido (meta p95 < 120 ms em celular médio).

## Riscos

| Risco                                                    | Mitigação                                                                                                                        |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Guardar conteúdo privado da tela (notificação, chat)     | Ação explícita, pré-visualização obrigatória, "Cobrir um pedaço", só local, aviso na 1ª vez; tela inteira pede confirmação extra |
| Menor guardar imagem de terceiros                        | Função ausente para perfil protegido na v1                                                                                       |
| `applyConstraints` falha ou o navegador reabre o seletor | Testar por navegador (tarefa 1.2); se falhar, usar o último quadro de 640x360 que já chega, sem subir resolução                  |
| Vazamento por exportação                                 | "Levar as imagens" desmarcado por padrão; `.apkg` é montado no navegador                                                         |
| IndexedDB cheio / limpo                                  | Teto, aviso, cartão segue sem imagem                                                                                             |

## Métrica de sucesso

- > = 70% das cenas guardadas passam pela pré-visualização sem "Descartar" (sinal de que o recorte é útil e não acidental).
- Zero requisição de rede com corpo de imagem (teste de rede no e2e) e zero linha de imagem no servidor.
- Quem usa a cena revisa o cartão com acerto maior que o par sem cena: comparação só com consentimento e sem medir pessoas
  (agregado por cartão, no aparelho); sem meta inventada, a linha de base é a tarefa 1.1.

## Esforço

M (4 a 6 dias): a captura do quadro é pequena; a pré-visualização com cobertura, as travas por superfície e a prova em
navegadores reais são o trabalho.

## Decisões do dono (com recomendação)

1. **A função existe?** Recomendo sim, só para adulto, só local, com pré-visualização obrigatória. Alternativa: não construir (a cena de onda segue); o ganho pedagógico é incerto e o risco de privacidade é real, então esta é a change que o dono pode simplesmente recusar sem perder o resto.
2. **Perfil protegido.** Recomendo ausente na v1. Liberar 16 e 17 anos só com decisão datada.
3. **Tela inteira** com confirmação extra (recomendo) ou proibida (mais simples e mais segura).
4. **Ordem.** Recomendo só começar depois de `cartao-com-audio-do-trecho` 2.2 (armazém compartilhado).
