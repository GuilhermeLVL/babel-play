# SÓ LEITURA: inicializa (sem Start) um cliente de loopback WASAPI no dispositivo de reprodução padrão
# com formatos diferentes e libera. Não altera nenhuma configuração do Windows.
$src=@'
using System; using System.Runtime.InteropServices;
[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumeratorCo2 {}
[InterfaceType(ComInterfaceType.InterfaceIsIUnknown), Guid("A95664D2-9614-4F35-A746-DE8DB63617E6")]
interface IMMDeviceEnumerator2 { int EnumAudioEndpoints(int a,int b,out IntPtr c); int GetDefaultAudioEndpoint(int flow,int role,out IMMDevice2 dev); }
[InterfaceType(ComInterfaceType.InterfaceIsIUnknown), Guid("D666063F-1587-4E43-81F1-B948E807363F")]
interface IMMDevice2 { int Activate(ref Guid iid,int ctx,IntPtr p,[MarshalAs(UnmanagedType.IUnknown)] out object o); }
[InterfaceType(ComInterfaceType.InterfaceIsIUnknown), Guid("1CB9AD4C-DBFA-4c32-B178-C2F568A703B2")]
interface IAudioClient2x { [PreserveSig] int Initialize(int mode,uint flags,long buf,long per,IntPtr fmt,IntPtr sess); int GetBufferSize(out uint n); int GetStreamLatency(out long l); int GetCurrentPadding(out uint p); [PreserveSig] int IsFormatSupported(int m,IntPtr f,out IntPtr c); int GetMixFormat(out IntPtr f); }
public static class LB {
 static IAudioClient2x Client(){ var e=(IMMDeviceEnumerator2)new MMDeviceEnumeratorCo2(); IMMDevice2 d; e.GetDefaultAudioEndpoint(0,0,out d); Guid iid=new Guid("1CB9AD4C-DBFA-4c32-B178-C2F568A703B2"); object o; d.Activate(ref iid,23,IntPtr.Zero,out o); return (IAudioClient2x)o; }
 public static string Try(string label,int ch,uint mask,long flagsL){ uint flags=(uint)flagsL; var ac=Client(); IntPtr f;
  if(ch==0){ ac.GetMixFormat(out f); } else { f=Marshal.AllocHGlobal(40); byte[] b=new byte[40]; Buffer.BlockCopy(BitConverter.GetBytes((ushort)0xFFFE),0,b,0,2); Buffer.BlockCopy(BitConverter.GetBytes((ushort)ch),0,b,2,2); Buffer.BlockCopy(BitConverter.GetBytes(48000u),0,b,4,4); Buffer.BlockCopy(BitConverter.GetBytes((uint)(48000*4*ch)),0,b,8,4); Buffer.BlockCopy(BitConverter.GetBytes((ushort)(4*ch)),0,b,12,2); Buffer.BlockCopy(BitConverter.GetBytes((ushort)32),0,b,14,2); Buffer.BlockCopy(BitConverter.GetBytes((ushort)22),0,b,16,2); Buffer.BlockCopy(BitConverter.GetBytes((ushort)32),0,b,18,2); Buffer.BlockCopy(BitConverter.GetBytes(mask),0,b,20,4); Buffer.BlockCopy(new Guid("00000003-0000-0010-8000-00aa00389b71").ToByteArray(),0,b,24,16); Marshal.Copy(b,0,f,40); }
  int ch2=Marshal.ReadInt16(f,2);
  IntPtr c; int hs=ac.IsFormatSupported(0,f,out c);
  int hr=ac.Initialize(0,flags,200000,0,f,IntPtr.Zero); Marshal.ReleaseComObject(ac);
  return label+" (ch="+ch2+"): IsFormatSupported=0x"+hs.ToString("X8")+" Initialize=0x"+hr.ToString("X8"); } }
'@
Add-Type -TypeDefinition $src
$LOOP=0x00020000; $AUTO=[long]0x80000000; $SRC=0x08000000
[LB]::Try('formato de mixagem do dispositivo + LOOPBACK',0,0,$LOOP)
[LB]::Try('2ch float 48k (o que o Chrome pede) + LOOPBACK',2,3,$LOOP)
[LB]::Try('2ch float 48k + LOOPBACK + AUTOCONVERTPCM|SRC_DEFAULT_QUALITY',2,3,($LOOP + $AUTO + $SRC))
