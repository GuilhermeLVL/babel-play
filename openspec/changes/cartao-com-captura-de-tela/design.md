## Abordagem escolhida

**Um botão explícito tira UM quadro da faixa de vídeo que o app já mantém viva, mostra para a pessoa, e só então grava no
aparelho.**

1. `systemAudio.ts` ganha `tirarQuadro(): Promise<Blob | null>`: `applyConstraints` da faixa para 960x540 por até 300 ms,
   aguarda o primeiro quadro novo (`requestVideoFrameCallback` ou `ImageCapture.grabFrame`), desenha num `OffscreenCanvas`
   com largura <= 480, volta as constraints para `QUALIDADE_DO_VIDEO_DA_TELA` e devolve WebP q 0,6. Sem faixa de vídeo (só
   microfone, Intérprete), a função devolve `null` e o botão nem aparece.
2. Pré-visualização em folha: imagem, "Cobrir um pedaço" (arrasta um retângulo opaco, aplicado no canvas antes de codificar,
   então o pixel coberto não existe no arquivo), "Guardar", "Descartar".
3. Armazém: o mesmo `ArmazemDeAudioDoCartao` da change de áudio, generalizado para `AnexoDoCartao { tipo: 'audio' | 'cena' }`,
   adaptador local apenas. O adaptador "conta" NÃO recebe o tipo `cena`: a interface o recusa por tipo, para que um commit
   futuro descuidado não abra o caminho.
4. Verso do cartão: a cena da onda (`lib/revisao/cena.ts`) mostra a imagem quando existe.

## Alternativa descartada

**Guardar um quadro automático por palavra salva, em segundo plano**, para o cartão "sempre ter a cena". É mais conveniente e
daria cobertura de ~100%, mas grava a tela sem a pessoa ver (conversas, notificações, terceiros), é incompatível com ECA
Digital e LGPD para menores e transforma uma ação pedagógica em vigilância. Descartada pelo risco, não pelo custo.

## Método rápido (skill ciclo-rapido)

Não há modelo nem qualidade de IA a medir; o que se decide é latência e compatibilidade por navegador.

1. **Simular antes**: página de teste local (`scripts/lab/quadro-da-tela.html`, fora do app) que chama `getDisplayMedia` e mede
   `applyConstraints` + `drawImage` + WebP em 20 quadros. Resposta em minutos, sem tocar no código de produção.
2. **Triagem curta**: Chrome, Firefox e Safari desktop, e Android Chrome (que nem tem `getDisplayMedia`: aí a função some).
   Parada antecipada: o navegador que reabrir o seletor ao subir a resolução fica de fora (cai no quadro de 640x360).
3. **Só a finalista no aparelho real**: o que sobrar em pé roda o fluxo completo no Quest e no desktop do dono.
