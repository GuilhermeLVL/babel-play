import type { VRM } from '@pixiv/three-vrm'
import { AnimationClip, AnimationMixer, Object3D, Quaternion, QuaternionKeyframeTrack, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'

import { espelharPose, limitarAngulos } from '../src/core/avatar/sinais/pose'
import { soletrar } from '../src/core/avatar/sinais/soletrar'
import type { Alfabeto, Limites } from '../src/core/avatar/sinais/tipos'
import alfabetoAsl from '../src/data/avatar/sinais/alfabeto-asl.json'
import limitesJson from '../src/data/avatar/sinais/limites.json'
import { criarMaos, filtrarClipe, medirIndependenciaDosDedos, suportaSinais } from '../src/lib/avatar/maos'

const limites = limitesJson as unknown as Limites
const asl = alfabetoAsl as unknown as Alfabeto

type Dialeto = 'vrm' | 'quaternius' | 'mixamo' | 'humanoide'

/** Nome do osso canônico num dialeto. `canon`: `ombro|braco|antebraco|mao|<dedo>:<0..2>` com dedo em ind/med/ane/min/pol. */
function nomeDe(d: Dialeto, lado: 'R' | 'L', canon: string): string {
  const [k, i] = canon.split(':')
  const n = Number(i)
  const longo = { ind: 'index', med: 'middle', ane: 'ring', min: 'pinky', pol: 'thumb' } as Record<string, string>
  if (d === 'quaternius') {
    const s = lado === 'R' ? 'r' : 'l'
    const base = {
      ombro: `clavicle_${s}`,
      braco: `upperarm_${s}`,
      antebraco: `lowerarm_${s}`,
      mao: `hand_${s}`,
    } as Record<string, string>
    return base[k] ?? `${longo[k]}_0${n + 1}_${s}`
  }
  if (d === 'mixamo') {
    const s = lado === 'R' ? 'Right' : 'Left'
    const base = { ombro: `${s}Shoulder`, braco: `${s}Arm`, antebraco: `${s}ForeArm`, mao: `${s}Hand` } as Record<
      string,
      string
    >
    const cap = (x: string) => x[0].toUpperCase() + x.slice(1)
    return `mixamorig:${base[k] ?? `${s}Hand${cap(longo[k])}${n + 1}`}`
  }
  const s = lado === 'R' ? 'right' : 'left'
  const base = { ombro: `${s}Shoulder`, braco: `${s}UpperArm`, antebraco: `${s}LowerArm`, mao: `${s}Hand` } as Record<
    string,
    string
  >
  if (base[k]) return base[k]
  if (k === 'pol') return `${s}Thumb${['Metacarpal', 'Proximal', 'Distal'][n]}`
  const nome = k === 'min' ? 'Little' : longo[k][0].toUpperCase() + longo[k].slice(1)
  return `${s}${nome}${['Proximal', 'Intermediate', 'Distal'][n]}`
}

interface Rig {
  objeto: Object3D
  vrm: VRM | null
  nos: Map<string, Object3D>
}

/** Esqueleto em T-pose (normalizado: rotações identidade), de frente para +Z, 1,7 m, sem malha. */
function criarRig(dialeto: Dialeto, opcoes: { semDedos?: boolean; nomesEstranhos?: boolean } = {}): Rig {
  const objeto = new Object3D()
  const nos = new Map<string, Object3D>()
  const no = (nome: string, pai: Object3D, x: number, y: number, z: number) => {
    const o = new Object3D()
    o.name = opcoes.nomesEstranhos ? `Bone.${nos.size}` : nome
    o.position.set(x, y, z)
    pai.add(o)
    nos.set(nome, o)
    return o
  }
  const hips = no('hips', objeto, 0, 1, 0)
  no('pe', objeto, 0, 0, 0)
  const peito = no('peito', hips, 0, 0.3, 0)
  no('cabeca', peito, 0, 0.4, 0)
  for (const lado of ['R', 'L'] as const) {
    const sx = lado === 'R' ? -1 : 1 // a direita do personagem fica em -X (olhando para +Z)
    const ombro = no(nomeDe(dialeto, lado, 'ombro'), peito, sx * 0.06, 0.2, 0)
    const braco = no(nomeDe(dialeto, lado, 'braco'), ombro, sx * 0.1, 0, 0)
    const ante = no(nomeDe(dialeto, lado, 'antebraco'), braco, sx * 0.26, 0, 0)
    const mao = no(nomeDe(dialeto, lado, 'mao'), ante, sx * 0.24, 0, 0)
    if (opcoes.semDedos) continue
    ;(['ind', 'med', 'ane', 'min'] as const).forEach((d, i) => {
      const z = [0.02, 0.007, -0.012, -0.03][i]
      const p = no(nomeDe(dialeto, lado, `${d}:0`), mao, sx * 0.09, 0, z)
      const m = no(nomeDe(dialeto, lado, `${d}:1`), p, sx * 0.04, 0, 0)
      no(nomeDe(dialeto, lado, `${d}:2`), m, sx * 0.025, 0, 0)
    })
    const t0 = no(nomeDe(dialeto, lado, 'pol:0'), mao, sx * 0.02, -0.004, 0.02)
    const t1 = no(nomeDe(dialeto, lado, 'pol:1'), t0, sx * 0.018, -0.004, 0.026)
    no(nomeDe(dialeto, lado, 'pol:2'), t1, sx * 0.012, 0, 0.022)
  }
  objeto.updateMatrixWorld(true)
  let vrm: VRM | null = null
  if (dialeto === 'vrm') {
    vrm = {
      humanoid: { getNormalizedBoneNode: (n: string) => [...nos.values()].find((o) => o.name === n) ?? null },
    } as unknown as VRM
  }
  return { objeto, vrm, nos }
}

const mundo = (o: Object3D) => o.getWorldPosition(new Vector3())

describe('suportaSinais', () => {
  it.each(['vrm', 'quaternius', 'mixamo', 'humanoide'] as const)('reconhece o dialeto %s', (d) => {
    const rig = criarRig(d)
    const s = suportaSinais({ objeto: rig.objeto, vrm: rig.vrm })
    expect(s.suporta).toBe(true)
    if (s.suporta) expect(s.origem).toBe(d === 'vrm' ? 'vrm' : 'glb')
  })

  it('modelo só com a palma (sem dedos) não suporta, com motivo', () => {
    for (const d of ['vrm', 'quaternius'] as const) {
      const rig = criarRig(d, { semDedos: true })
      const s = suportaSinais({ objeto: rig.objeto, vrm: rig.vrm })
      expect(s).toMatchObject({ suporta: false, motivo: 'sem_dedos' })
    }
  })

  it('GLB com nomes irreconhecíveis diz que não suporta; modelo vazio também', () => {
    const rig = criarRig('quaternius', { nomesEstranhos: true })
    expect(suportaSinais({ objeto: rig.objeto, vrm: null })).toMatchObject({
      suporta: false,
      motivo: 'sem_ossos_reconheciveis',
    })
    expect(suportaSinais({ objeto: new Object3D(), vrm: null })).toMatchObject({ suporta: false })
    expect(criarMaos({ objeto: new Object3D(), vrm: null }, limites)).toBeNull()
  })
})

describe.each(['vrm', 'quaternius', 'mixamo', 'humanoide'] as const)('criarMaos (%s)', (dialeto) => {
  const rig = criarRig(dialeto)
  const ctl = criarMaos({ objeto: rig.objeto, vrm: rig.vrm }, limites)!
  const seq = soletrar('Abc', asl, { limites })

  it('cada dedo se move sozinho (>= 8 cm; os outros <= 1 cm) nas duas mãos', () => {
    for (const lado of ['R', 'L'] as const) {
      const r = medirIndependenciaDosDedos(ctl, lado)
      const resumo = r.dedos.map(
        (d) => `${d.dedo}: ${(d.andouM * 100).toFixed(1)}cm / outros ${(d.outrosMaxM * 100).toFixed(2)}cm`,
      )
      expect(r.ok, `${lado}: ${resumo.join('; ')}`).toBe(true)
    }
  })

  it('a palma chega ao alvo (IK) para todas as letras do ASL, destra e canhota', () => {
    let pior = 0
    for (const espelhar of [false, true]) {
      const s = soletrar('ABCDEFGHIKLMNOPQRSTUVWXY', asl, { limites, espelhar, tetoMs: 1e9 })
      for (const p of s.passos) {
        ctl.aplicar(p.pose, s.repouso)
        const lado = p.pose.espelhada ? 'L' : 'R'
        const ombro = mundo(ctl.ossos[lado].braco)
        // sinalizador -> mundo: x = direita do avatar (-X), y = cima, z = frente (+Z)
        const alvo = ombro.clone().add(new Vector3(-p.pose.posicao[0], p.pose.posicao[1], p.pose.posicao[2]))
        const palma = mundo(ctl.ossos[lado].dedos[1][0])
        pior = Math.max(pior, palma.distanceTo(alvo))
      }
    }
    // a pose do protótipo foi autorada para um braço de ~0,47 m; este rig tem 0,50 m + mão: tolera 3 cm
    expect(pior).toBeLessThan(0.03)
  })

  it('a mão espelhada usa os ossos da esquerda e a destra vai ao repouso', () => {
    const e = soletrar('Ab', asl, { limites, espelhar: true })
    const direita = ctl.ossos.R.mao
    const antes = direita.quaternion.clone()
    ctl.aplicar(e.passos[0].pose, e.repouso)
    const lado = ctl.ossos.L
    expect(mundo(lado.mao).x).toBeGreaterThan(0.05 - 0.01) // esquerda do personagem = +X
    expect(direita.quaternion.angleTo(antes)).toBeGreaterThanOrEqual(0) // foi ao repouso (existe)
    // simétrico: a letra espelhada na esquerda é a imagem no espelho da destra
    const d = soletrar('Ab', asl, { limites })
    ctl.aplicar(d.passos[0].pose, d.repouso)
    const pd = mundo(ctl.ossos.R.dedos[1][2])
    ctl.aplicar(e.passos[0].pose, e.repouso)
    const pe = mundo(ctl.ossos.L.dedos[1][2])
    expect(Math.abs(pd.x + pe.x)).toBeLessThan(0.01)
    expect(Math.abs(pd.y - pe.y)).toBeLessThan(0.01)
    expect(Math.abs(pd.z - pe.z)).toBeLessThan(0.01)
  })

  it('com dados válidos o clamp por osso não age; ângulo absurdo é limitado', () => {
    const antes = ctl.clamp.vezes
    for (const p of seq.passos) ctl.aplicar(p.pose, seq.repouso)
    expect(ctl.clamp.vezes).toBe(antes)
    const ruim = { ...seq.passos[0].pose, a: seq.passos[0].pose.a.slice() }
    ruim.a[6] = 300
    ctl.aplicar(ruim, seq.repouso)
    expect(ctl.clamp.vezes).toBe(antes + 1)
    expect(limitarAngulos(ruim.a, limites).a[6]).toBe(limites.dedo.pip[1])
  })

  it('calibração do polegar: zero relativo à palma mede a elevação do rig', () => {
    const c = ctl.calibracao()
    expect(Number.isFinite(c.R.zeroCmcAbd)).toBe(true)
    expect(c.R.zeroCmcAbd).toBeCloseTo(-c.R.elevacao, 6)
    expect(c.L.zeroCmcAbd).toBeCloseTo(c.R.zeroCmcAbd, 0)
  })

  it('restaurar devolve os ossos ao repouso do modelo', () => {
    ctl.aplicar(seq.passos[0].pose, seq.repouso)
    ctl.restaurar()
    for (const lado of ['R', 'L'] as const) {
      const o = ctl.ossos[lado]
      for (const osso of [o.braco, o.antebraco, o.mao, ...o.dedos.flat(), ...o.polegar]) {
        expect(osso.quaternion.angleTo(new Quaternion())).toBeLessThan(1e-6)
      }
    }
  })
})

describe('máscara para clipes de corpo', () => {
  it('a máscara tira do clipe o braço que sinaliza; o resto segue o clipe, mesmo se o mixer vier DEPOIS', () => {
    const rig = criarRig('quaternius')
    const ctl = criarMaos({ objeto: rig.objeto, vrm: null }, limites)!
    const s = soletrar('Ola', asl, { limites })
    const sacode = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), 1.2).toArray()
    const faixa = (nome: string) => new QuaternionKeyframeTrack(`${nome}.quaternion`, [0, 1], [...sacode, ...sacode])
    const nomes = ctl.nomesDaMascara('R')
    expect(nomes).toContain('hand_r')
    expect(nomes).toContain('index_02_r')
    expect(nomes).not.toContain('hand_l')
    const clip = new AnimationClip('gesto', 1, [
      faixa('hand_r'),
      faixa('index_02_r'),
      faixa('thumb_01_r'),
      faixa('hand_l'),
      faixa('peito'),
    ])
    const mascarado = filtrarClipe(clip, nomes)
    expect(mascarado.tracks.map((t) => t.name.split('.')[0]).sort()).toEqual(['hand_l', 'peito'])
    expect(clip.tracks).toHaveLength(5) // o original não é tocado

    const nosPorNome = (n: string) => rig.nos.get(n) as Object3D
    const pose = s.passos[0].pose
    const dedoR = nosPorNome('index_02_r')
    const medirComClipe = (c: AnimationClip) => {
      ctl.restaurar()
      const mixer = new AnimationMixer(rig.objeto)
      mixer.clipAction(c).play()
      ctl.aplicar(pose, s.repouso)
      const esperado = dedoR.quaternion.clone()
      mixer.update(0.5) // o clipe roda DEPOIS da soletração (pior ordem)
      return {
        dedo: dedoR.quaternion.angleTo(esperado),
        maoL: nosPorNome('hand_l').quaternion.angleTo(new Quaternion()),
        peito: nosPorNome('peito').quaternion.angleTo(new Quaternion()),
      }
    }
    const comMascara = medirComClipe(mascarado)
    expect(comMascara.dedo).toBeLessThan(1e-6)
    expect(comMascara.maoL).toBeGreaterThan(0.5) // o outro braço segue o clipe
    expect(comMascara.peito).toBeGreaterThan(0.5) // o tronco também
    const semMascara = medirComClipe(clip)
    expect(semMascara.dedo).toBeGreaterThan(0.1) // sem máscara o clipe sobrescreve o dedo
  })

  it('outraMao "livre" não toca no outro braço', () => {
    const rig = criarRig('vrm')
    const ctl = criarMaos({ objeto: rig.objeto, vrm: rig.vrm }, limites, { outraMao: 'livre' })!
    const s = soletrar('Ab', asl, { limites })
    const esq = ctl.ossos.L.mao
    ctl.aplicar(s.passos[0].pose, s.repouso)
    expect(esq.quaternion.angleTo(new Quaternion())).toBe(0)
    const dir = ctl.ossos.R.mao.quaternion.clone()
    expect(dir.angleTo(new Quaternion())).toBeGreaterThan(0.01) // a destra sinalizou
    ctl.aplicar(espelharPose(s.passos[0].pose), s.repouso)
    expect(ctl.ossos.R.mao.quaternion.angleTo(dir)).toBe(0) // a destra ficou como estava
  })
})
