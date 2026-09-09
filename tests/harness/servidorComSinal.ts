/**
 * LANÇADOR DO SERVIDOR DE VERDADE PARA O TESTE DE DESLIGAMENTO.
 *
 * Ele não monta nada: importa o `server.ts` inteiro, com bootstrap, migrations, `listen` e o
 * `registrarDesligamento()`. O que ele acrescenta é UMA linha — uma porta de entrada por IPC para
 * o teste pedir o sinal.
 *
 * POR QUE ESSA PORTA EXISTE, e ela é sobre o Windows, não sobre conveniência. Sinal POSIX não
 * existe no Windows: `process.kill(pid, 'SIGTERM')` de fora não entrega sinal nenhum, ele chama
 * `TerminateProcess` e o processo morre na hora, sem rodar handler — que é justamente o
 * comportamento que este teste precisa provar que deixou de acontecer. Do lado de DENTRO, o
 * `process.on('SIGTERM')` é um listener comum de EventEmitter e roda igual nas duas plataformas.
 *
 * Então: no Linux/macOS o teste manda o sinal DE VERDADE e esta porta não é usada; no Windows ele
 * manda a mensagem e o processo emite o mesmo evento para si. O que muda é como o evento nasce; o
 * caminho exercitado — handler do `server.ts`, dreno, checkpoint, código de saída — é o mesmo.
 *
 * A alternativa recusada foi marcar o teste como `skip` no Windows. Esta é a máquina em que o
 * projeto é desenvolvido: o teste que só roda no CI é o teste que ninguém vê quebrar.
 */
process.on('message', (mensagem) => {
  if (mensagem === 'sinal:SIGTERM') process.emit('SIGTERM', 'SIGTERM')
  if (mensagem === 'sinal:SIGINT') process.emit('SIGINT', 'SIGINT')
})

/* Sem `await`: o `server.ts` sobe sozinho no import (ele chama `iniciar()` no fim do arquivo), e
   esperar aqui só adiaria o registro do listener acima. */
void import('../../server')
