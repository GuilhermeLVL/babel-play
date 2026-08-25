/**
 * A REGRA QUE DECIDE SE UMA ESCOLHA SALVA DE ROTA AINDA É POSSÍVEL.
 *
 * `systemSource` é persistido. Quem escolheu "Dispositivo de loopback" um dia fica com a escolha
 * gravada — e se o Stereo Mix / VB-Cable não existe naquela máquina, a captura não tem de onde ler
 * o som e a tela não explica nada. Aconteceu numa demonstração.
 *
 * O caso difícil, e o motivo destes testes existirem, é o FALSO NEGATIVO: sem permissão de
 * microfone o navegador esconde os rótulos, e aí "não achei loopback" não significa "não existe
 * loopback". Trocar nesse caso passaria por cima de uma escolha legítima.
 */
import { describe, it, expect } from 'vitest'
import { isLoopbackDevice, filterLoopbackDevices } from '../src/lib/audioDevices'

/** A decisão, isolada do React: vale trocar a rota salva por "servidor"? */
function deveTrocarParaServidor(entrada: {
  rotaSalva: string
  servidorDisponivel: boolean
  rotulosVisiveis: boolean
  inputs: Array<{ deviceId: string; label: string }>
}): boolean {
  if (!entrada.servidorDisponivel) return false
  if (entrada.rotaSalva !== 'loopback') return false
  if (!entrada.rotulosVisiveis) return false
  return !filterLoopbackDevices(entrada.inputs).detected
}

const MIC = { deviceId: 'a', label: 'Microfone (Realtek)' }
const CABLE = { deviceId: 'b', label: 'CABLE Output (VB-Audio Virtual Cable)' }
const STEREO = { deviceId: 'c', label: 'Mixagem Estéreo (Realtek)' }
const SEM_ROTULO = { deviceId: 'd', label: '' }

describe('isLoopbackDevice', () => {
  it('reconhece os rótulos comuns, em português e inglês', () => {
    expect(isLoopbackDevice('Stereo Mix (Realtek)')).toBe(true)
    expect(isLoopbackDevice('Mixagem Estéreo')).toBe(true)
    expect(isLoopbackDevice('CABLE Output (VB-Audio Virtual Cable)')).toBe(true)
    expect(isLoopbackDevice('VoiceMeeter Output')).toBe(true)
    expect(isLoopbackDevice('What U Hear')).toBe(true)
  })

  it('não confunde um microfone comum com loopback', () => {
    expect(isLoopbackDevice('Microfone (Realtek High Definition Audio)')).toBe(false)
    expect(isLoopbackDevice('Headset (Bluetooth)')).toBe(false)
    expect(isLoopbackDevice('')).toBe(false)
  })
})

describe('deveTrocarParaServidor', () => {
  it('TROCA quando não há nenhum dispositivo de loopback e os rótulos estão visíveis', () => {
    expect(deveTrocarParaServidor({
      rotaSalva: 'loopback', servidorDisponivel: true, rotulosVisiveis: true, inputs: [MIC],
    })).toBe(true)
  })

  it('NÃO troca quando o dispositivo existe — a escolha continua legítima', () => {
    expect(deveTrocarParaServidor({
      rotaSalva: 'loopback', servidorDisponivel: true, rotulosVisiveis: true, inputs: [MIC, CABLE],
    })).toBe(false)
    expect(deveTrocarParaServidor({
      rotaSalva: 'loopback', servidorDisponivel: true, rotulosVisiveis: true, inputs: [MIC, STEREO],
    })).toBe(false)
  })

  /* O TESTE QUE IMPORTA MAIS: rótulo oculto não é prova de ausência. */
  it('NÃO troca quando os rótulos estão ocultos, mesmo sem detectar nada', () => {
    expect(deveTrocarParaServidor({
      rotaSalva: 'loopback', servidorDisponivel: true, rotulosVisiveis: false, inputs: [SEM_ROTULO, SEM_ROTULO],
    })).toBe(false)
  })

  it('NÃO troca se a rota do servidor não existe — trocaria para uma rota impossível', () => {
    expect(deveTrocarParaServidor({
      rotaSalva: 'loopback', servidorDisponivel: false, rotulosVisiveis: true, inputs: [MIC],
    })).toBe(false)
  })

  it('não mexe em quem escolheu outra rota de propósito', () => {
    for (const rota of ['display', 'server']) {
      expect(deveTrocarParaServidor({
        rotaSalva: rota, servidorDisponivel: true, rotulosVisiveis: true, inputs: [MIC],
      })).toBe(false)
    }
  })

  it('lista de entradas vazia com rótulos visíveis conta como sem loopback', () => {
    expect(deveTrocarParaServidor({
      rotaSalva: 'loopback', servidorDisponivel: true, rotulosVisiveis: true, inputs: [],
    })).toBe(true)
  })
})

describe('filterLoopbackDevices — o fallback é honesto sobre si mesmo', () => {
  it('marca `detected: false` quando devolve a lista inteira por não achar nada', () => {
    const r = filterLoopbackDevices([MIC, { deviceId: 'e', label: 'Webcam' }])
    expect(r.detected).toBe(false)
    expect(r.devices).toHaveLength(2)
  })

  it('marca `detected: true` e devolve SÓ os de loopback quando acha', () => {
    const r = filterLoopbackDevices([MIC, CABLE, STEREO])
    expect(r.detected).toBe(true)
    expect(r.devices.map(d => d.deviceId)).toEqual(['b', 'c'])
  })

  it('descarta entradas sem deviceId — não dá para selecionar o que não tem id', () => {
    const r = filterLoopbackDevices([{ deviceId: '', label: 'Stereo Mix' }, MIC])
    expect(r.detected).toBe(false)
    expect(r.devices.every(d => d.deviceId)).toBe(true)
  })
})
