"""
Monta os cenários de diarização a partir de falas de locutores CONHECIDOS.

POR QUE SINTETIZAR EM VEZ DE BAIXAR UM CORPUS DE DIARIZAÇÃO. Concatenar falas cujo falante é
conhecido dá ground-truth EXATO de graça (quem falou, de quando até quando) e — o que importa mais
aqui — permite montar exatamente os casos que o produto erra, em vez dos que um dataset genérico
oferece: várias pessoas no mesmo idioma, a mesma voz em volumes diferentes, microfone degradado.

O QUE ESTE MÉTODO NÃO MEDE, e o relatório precisa dizer: não há FALA SOBREPOSTA (duas pessoas ao
mesmo tempo), nem reverberação de sala, nem ruído ambiente contínuo. Esses três são justamente onde
a diarização real mais sofre. Portanto o DER daqui serve para COMPARAR VARIANTES entre si, nunca
como número absoluto publicável.

Cenários (`tests/fixtures/cenarios-diarizacao/`):
  alternancia-2      A B A B         — o caso mais simples, dois falantes revezando
  alternancia-3      A B C A B C     — três falantes, o teto de erro sobe rápido
  turnos-curtos      A B A B A B     — só falas curtas: réplicas de conversa real
  mesmo-falante      A A A A         — teste de FRAGMENTAÇÃO (não pode virar 4 pessoas)
  volume-variavel    A A' A A'       — a MESMA pessoa alta e baixa, o caso de microfone variável
  ruido              A B A B + ruído — SNR controlado, o caso de microfone ruim
  banda-estreita     A B A B @ 8 kHz — o caso de telefone / mic barato

Uso:  python scripts/eval-fala/montar-cenarios.py
"""
from __future__ import annotations

import io
import json
import math
import os
import random
import struct
import wave

MANIFESTO = "tests/fixtures/corpus-pt-br.jsonl"
RAIZ_AUDIO = "tests/fixtures/audio"
DIR_SAIDA = "tests/fixtures/cenarios-diarizacao"
TAXA = 16000
# Silêncio entre falas: o VAD precisa de uma fronteira para fechar o turno. 400 ms é maior que o
# `redemptionMs: 450`? Não — é deliberadamente MENOR que o silêncio típico de conversa e maior que
# uma pausa de respiração, para não facilitar nem sabotar a segmentação.
SILENCIO_MS = 500


def ler_wav(caminho: str) -> tuple[list[float], int]:
    with wave.open(caminho, "rb") as w:
        canais, largura, taxa, quadros = w.getnchannels(), w.getsampwidth(), w.getframerate(), w.getnframes()
        bruto = w.readframes(quadros)
    if largura != 2:
        raise ValueError(f"{caminho}: esperado PCM 16-bit")
    amostras = struct.unpack(f"<{len(bruto)//2}h", bruto)
    if canais > 1:
        amostras = [sum(amostras[i:i + canais]) / canais for i in range(0, len(amostras), canais)]
    pcm = [a / 32768.0 for a in amostras]
    return reamostrar(pcm, taxa, TAXA), TAXA


def reamostrar(pcm: list[float], de: int, para: int) -> list[float]:
    if de == para:
        return pcm
    razao = de / para
    n = int(len(pcm) / razao)
    saida = []
    for i in range(n):
        x = i * razao
        i0 = int(x)
        i1 = min(i0 + 1, len(pcm) - 1)
        saida.append(pcm[i0] + (pcm[i1] - pcm[i0]) * (x - i0))
    return saida


def escrever_wav(caminho: str, pcm: list[float]) -> None:
    os.makedirs(os.path.dirname(caminho), exist_ok=True)
    with wave.open(caminho, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(TAXA)
        w.writeframes(b"".join(struct.pack("<h", int(max(-1.0, min(1.0, v)) * 32767)) for v in pcm))


def rms(pcm: list[float]) -> float:
    return math.sqrt(sum(v * v for v in pcm) / len(pcm)) if pcm else 0.0


def com_ganho(pcm: list[float], fator: float) -> list[float]:
    return [v * fator for v in pcm]


def com_ruido(pcm: list[float], snr_db: float, rnd: random.Random) -> list[float]:
    """Ruído branco no SNR pedido — o eixo 'microfone ruim' de forma controlada e reprodutível."""
    p_sinal = rms(pcm) ** 2
    if p_sinal == 0:
        return pcm
    p_ruido = p_sinal / (10 ** (snr_db / 10))
    amp = math.sqrt(p_ruido)
    return [v + rnd.gauss(0, amp) for v in pcm]


def banda_estreita(pcm: list[float]) -> list[float]:
    """Passa por 8 kHz e volta: simula telefone / microfone barato sem inventar um filtro elaborado."""
    return reamostrar(reamostrar(pcm, TAXA, 8000), 8000, TAXA)


def main() -> int:
    if not os.path.exists(MANIFESTO):
        print(f"manifesto ausente: {MANIFESTO}\nRode antes: python scripts/eval-fala/baixar-corpus.py")
        return 1

    itens = [json.loads(l) for l in io.open(MANIFESTO, encoding="utf-8").read().strip().split("\n") if l]
    itens = [o for o in itens if os.path.exists(os.path.join(RAIZ_AUDIO, o["arquivo"]))]

    # Agrupa por falante, preferindo falas de duração média — muito curtas não dão embedding
    # confiável (o produto exige 1,2 s) e muito longas desequilibram o tempo por turno.
    por_falante: dict[str, list] = {}
    for o in sorted(itens, key=lambda o: abs(o["duracaoS"] - 3.5)):
        por_falante.setdefault(o["falante"], []).append(o)

    # Falas ABAIXO do mínimo de embedding (1,2 s). São o material do cenário `turnos-curtos`:
    # o produto não as embeda e faz cada uma HERDAR o falante anterior, o que numa conversa de
    # réplicas curtas manda turnos inteiros para a pessoa errada.
    curtas_por_falante: dict[str, list] = {}
    for o in sorted(itens, key=lambda o: o["duracaoS"]):
        if o["duracaoS"] < 1.2:
            curtas_por_falante.setdefault(o["falante"], []).append(o)

    falantes = [f for f, v in sorted(por_falante.items(), key=lambda kv: -len(kv[1])) if len(v) >= 4]
    if len(falantes) < 2:
        print(f"falantes com falas suficientes: {len(falantes)} — preciso de pelo menos 2.")
        print("Aumente o corpus: python scripts/eval-fala/baixar-corpus.py --por-faixa 25")
        return 1
    print(f"falantes disponíveis: {len(falantes)} ({', '.join(falantes)})")

    rnd = random.Random(20260829)  # semente fixa: o cenário tem de ser idêntico entre execuções
    cenarios = []

    def montar(nome: str, sequencia: list[tuple[str, int]], transformar=None, descricao: str = "") -> None:
        """`sequencia` = [(falante, índice da fala dele)]. Devolve o WAV e os turnos de referência."""
        pcm_total: list[float] = []
        turnos = []
        silencio = [0.0] * int(TAXA * SILENCIO_MS / 1000)
        for i, (falante, idx) in enumerate(sequencia):
            fonte = por_falante[falante][idx % len(por_falante[falante])]
            pcm, _ = ler_wav(os.path.join(RAIZ_AUDIO, fonte["arquivo"]))
            if transformar:
                pcm = transformar(pcm, i)
            inicio_ms = int(len(pcm_total) / TAXA * 1000)
            pcm_total.extend(pcm)
            fim_ms = int(len(pcm_total) / TAXA * 1000)
            turnos.append({"inicioMs": inicio_ms, "fimMs": fim_ms, "falante": falante})
            if i < len(sequencia) - 1:
                pcm_total.extend(silencio)
        arquivo = f"{nome}.wav"
        escrever_wav(os.path.join(DIR_SAIDA, arquivo), pcm_total)
        cenarios.append({
            "nome": nome,
            "descricao": descricao,
            "arquivo": arquivo,
            "duracaoS": round(len(pcm_total) / TAXA, 2),
            "falantesReais": len({t["falante"] for t in turnos}),
            "turnos": turnos,
        })
        print(f"  {nome:<18} {len(pcm_total)/TAXA:5.1f}s · {len(turnos)} turnos · {len({t['falante'] for t in turnos})} falantes")

    a, b = falantes[0], falantes[1]
    c = falantes[2] if len(falantes) > 2 else None

    montar("alternancia-2", [(a, 0), (b, 0), (a, 1), (b, 1)],
           descricao="dois falantes revezando — o caso base")

    if c:
        montar("alternancia-3", [(a, 0), (b, 0), (c, 0), (a, 1), (b, 1), (c, 1)],
               descricao="três falantes revezando — mais gente, mais confusão de cluster")

    montar("mesmo-falante", [(a, 0), (a, 1), (a, 2), (a, 3)],
           descricao="UMA pessoa só — teste de fragmentação: não pode virar várias")

    # A MESMA pessoa alternando forte e fraco. É o caso "microfone variável" que o produto erra:
    # sem normalização de ganho, o embedding da voz baixa não casa com o da voz alta.
    montar("volume-variavel", [(a, 0), (a, 1), (a, 2), (a, 3)],
           transformar=lambda pcm, i: com_ganho(pcm, 1.0 if i % 2 == 0 else 0.18),
           descricao="mesma pessoa alta e baixa — o eixo de microfone/distância variável")

    montar("ruido-10db", [(a, 0), (b, 0), (a, 1), (b, 1)],
           transformar=lambda pcm, i: com_ruido(pcm, 10.0, rnd),
           descricao="dois falantes com ruído branco a 10 dB de SNR")

    montar("banda-estreita", [(a, 0), (b, 0), (a, 1), (b, 1)],
           transformar=lambda pcm, i: banda_estreita(pcm),
           descricao="dois falantes em banda de 8 kHz — telefone / microfone barato")

    # TURNOS CURTOS — a hipótese que faltava medir. Alterna falas ABAIXO de 1,2 s de duas pessoas.
    # O produto não embeda nenhuma delas e faz cada uma herdar o falante anterior; se a regra for
    # nociva, o cenário inteiro colapsa numa pessoa só e a pureza despenca.
    curtos = [f for f, v in curtas_por_falante.items() if len(v) >= 1]
    if len(curtos) >= 2:
        ca, cb = curtos[0], curtos[1]
        seq_curta = [(ca, 0), (cb, 0), (ca, 1), (cb, 1)]
        pcm_total: list[float] = []
        turnos = []
        silencio = [0.0] * int(TAXA * SILENCIO_MS / 1000)
        for i, (falante, idx) in enumerate(seq_curta):
            fonte = curtas_por_falante[falante][idx % len(curtas_por_falante[falante])]
            pcm, _ = ler_wav(os.path.join(RAIZ_AUDIO, fonte["arquivo"]))
            inicio_ms = int(len(pcm_total) / TAXA * 1000)
            pcm_total.extend(pcm)
            turnos.append({"inicioMs": inicio_ms, "fimMs": int(len(pcm_total) / TAXA * 1000), "falante": falante})
            if i < len(seq_curta) - 1:
                pcm_total.extend(silencio)
        escrever_wav(os.path.join(DIR_SAIDA, "turnos-curtos.wav"), pcm_total)
        cenarios.append({
            "nome": "turnos-curtos",
            "descricao": "réplicas abaixo de 1,2 s alternando entre duas pessoas — expõe a regra de herança do falante",
            "arquivo": "turnos-curtos.wav",
            "duracaoS": round(len(pcm_total) / TAXA, 2),
            "falantesReais": len({t["falante"] for t in turnos}),
            "turnos": turnos,
        })
        print(f"  {'turnos-curtos':<18} {len(pcm_total)/TAXA:5.1f}s · {len(turnos)} turnos · "
              f"{len({t['falante'] for t in turnos})} falantes (todas abaixo de 1,2 s)")
    else:
        print("  turnos-curtos      PULADO: menos de 2 falantes com falas abaixo de 1,2 s no corpus")

    saida = os.path.join(DIR_SAIDA, "cenarios.json")
    with io.open(saida, "w", encoding="utf-8", newline="\n") as f:
        json.dump({"taxaHz": TAXA, "silencioMs": SILENCIO_MS, "cenarios": cenarios}, f, ensure_ascii=False, indent=2)
    print(f"\nreferência: {saida} ({len(cenarios)} cenários)")
    print("LIMITE CONHECIDO: sem fala sobreposta, sem reverberação, sem ruído ambiente contínuo.")
    print("Serve para comparar variantes entre si, não como DER absoluto.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
