/**
 * SOBREPOSIÇÃO DE FALA (interrupção) — duas pessoas falando ao mesmo tempo.
 *
 * POR QUE ISTO EXISTE. A tela de Análise dizia "Interrupções (sobreposição) — requer diarização —
 * em breve". A diarização EXISTE: roda na captura, persiste em `utterances.speaker_id` /
 * `speaker_name` e já é renderizada três vezes na mesma tela. O dado estava todo lá; faltava a
 * comparação, que é intersecção de intervalos.
 *
 * DUAS FALAS SE SOBREPÕEM quando `inicio_da_segunda < fim_da_primeira`. Só conta como interrupção
 * se os FALANTES FOREM DIFERENTES — a mesma pessoa continuando a frase não interrompeu ninguém, e
 * dois trechos consecutivos do mesmo falante que se encostam são recorte do motor de transcrição,
 * não conversa.
 *
 * O CASO QUE JUSTIFICA CONTAR ISSO COMO REAL. `mic` e `system` são capturados em fluxos
 * INDEPENDENTES: você falando enquanto o vídeo toca gera dois intervalos que de fato coexistem no
 * tempo real. Não é artefato — é fala simultânea de verdade, e é exatamente o que o indicador quer
 * medir. Por isso a identidade do falante cai para a FONTE quando não há nome: `mic` e `system` são
 * comprovadamente dois falantes distintos, mesmo sem diarização por voz.
 *
 * HONESTIDADE. `null` quando não há como medir — menos de dois falantes distintos, ou nenhum par com
 * timing nos dois lados. A tela mostra "—" com o motivo, nunca zero: zero se leria como "você nunca
 * interrompeu", que é uma afirmação que não fizemos.
 *
 * Puro/isomórfico: sem DOM, sem Node, sem `src/lib`.
 */

/** Subconjunto de uma fala que este cálculo precisa. Declarado aqui para o core não depender da UI. */
export interface FalaComTempo {
  /** Nome/rótulo do falante (diarização). Vazio quando não houve diarização. */
  speaker?: string | null
  /** 'mic' | 'system' — a via de captura. Serve de identidade quando não há nome. */
  source?: string | null
  startMs?: number | null
  endMs?: number | null
}

export interface Sobreposicoes {
  /** Quantos pares de falas de falantes DIFERENTES coexistem no tempo. */
  total: number
  /** Soma do tempo sobreposto, em ms. Pares distintos somam separadamente. */
  msSobrepostos: number
  /** Maior sobreposição isolada, em ms — a interrupção mais longa. */
  maiorMs: number
  /** Falantes distintos considerados. A tela mostra para o número ter procedência. */
  falantes: string[]
  /** Falas descartadas por não ter timing nos dois lados — o que o número NÃO viu. */
  falasSemTiming: number
}

/** Identidade do falante: o nome da diarização; sem ele, a via de captura. '' = indeterminável. */
function quemFalou(f: FalaComTempo): string {
  const nome = (f.speaker ?? '').trim()
  if (nome && nome !== '—') return nome
  return (f.source ?? '').trim()
}

/**
 * Conta as sobreposições entre falas de falantes distintos.
 *
 * Devolve `null` quando a medição não é possível: menos de dois falantes distintos identificáveis,
 * ou nenhum par com timing nos dois lados.
 */
export function contarSobreposicoes(falas: ReadonlyArray<FalaComTempo>): Sobreposicoes | null {
  const comTempo: Array<{ quem: string; ini: number; fim: number }> = []
  let falasSemTiming = 0

  for (const f of falas ?? []) {
    const quem = quemFalou(f)
    /* Fala sem identidade não pode entrar: não há como saber se ela interrompeu OUTRA pessoa ou
       se é a continuação da mesma. Entrar como falante anônimo inventaria interrupções. */
    if (!quem || f.startMs == null || f.endMs == null || f.endMs <= f.startMs) {
      falasSemTiming++
      continue
    }
    comTempo.push({ quem, ini: f.startMs, fim: f.endMs })
  }

  const falantes = [...new Set(comTempo.map((c) => c.quem))].sort()
  if (comTempo.length < 2 || falantes.length < 2) return null

  /* Ordena por início para o barrido: uma vez que `ini` do candidato passa do `fim` do atual,
     nenhum candidato seguinte pode sobrepor este — e o laço interno para. */
  comTempo.sort((a, b) => a.ini - b.ini || a.fim - b.fim)

  let total = 0
  let msSobrepostos = 0
  let maiorMs = 0

  for (let i = 0; i < comTempo.length; i++) {
    const a = comTempo[i]
    for (let j = i + 1; j < comTempo.length; j++) {
      const b = comTempo[j]
      if (b.ini >= a.fim) break
      if (b.quem === a.quem) continue
      const ms = Math.min(a.fim, b.fim) - b.ini
      if (ms <= 0) continue
      total++
      msSobrepostos += ms
      if (ms > maiorMs) maiorMs = ms
    }
  }

  return { total, msSobrepostos, maiorMs, falantes, falasSemTiming }
}
