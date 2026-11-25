# Audiolivros: consulta jurídica sobre espeak-ng (GPL-3.0)

Origem: spec `docs/specs/2026-10-31-audiolivros-e-leitura.md`, seção 6.4 e gate G1 (seção 12).

Enviada em: pendente (ato do dono; ainda não enviada)

Resposta: pendente. A resposta não bloqueia nenhuma tarefa; ela alimenta o G1.

## Pergunta

Distribuir ao navegador um WASM derivado de espeak-ng (GPL-3.0), carregado em Web Worker por um app React com outra
licença, é obra combinada ou agregação? E rodar o espeak-ng/Piper/Kokoro apenas no nosso servidor, entregando só áudio
gerado, cria alguma obrigação sobre o áudio ou o código?

## Nota

Não é parecer; a F0 testa só motores sem espeak-ng.

## Pergunta 2: OpenRAIL-M da Supertonic (preparada em 25/11, pronta para o pedido jurídico único)

Origem: decisão 6 e 17 de `docs/backlog/decisoes-do-dono.md` (pedido único; motor Supertonic condicionado ao parecer).

Enviada em: pendente (ato do dono)

Resposta: pendente. Sem ela o piloto de 3 livros não vai a staging com público; a geração local de amostra para a escuta cega não depende dela.

1. As restrições de uso da licença OpenRAIL-M do modelo (conferir o texto do `LICENSE` do repositório oficial na versão usada, hoje não transcrito aqui) alcançam o ÁUDIO gerado que distribuímos, ou só o uso do modelo?
2. Há restrição sobre menores de idade como ouvintes ou sobre o público do produto? O Frasy atende menores; o beta é só adulto (decisão 17).
3. Qual rótulo de voz gerada é exigido (texto e onde aparece)? Hoje o leitor mostra o chip "Voz sintetizada" (gate G5).
4. As restrições se repassam a quem baixa o capítulo (botão "baixar capítulo")? O que precisa constar nos termos de uso?
5. A licença permite hospedar o áudio em bucket público do R2 e servir por CDN?

Nota: não é parecer; esta lista só organiza a consulta. Alimenta os gates G1 e G2 do runbook.
