# tom.wav (nao versionado): senoide 440 Hz, 48 kHz mono, amplitude 0.25, 12 s. Gerar com Python (wave + math.sin).
param([int]$Segundos = 20)
$tom = Join-Path $PSScriptRoot 'tom.wav'
$p = Start-Process powershell -ArgumentList '-NoProfile','-Command',"`$s = New-Object System.Media.SoundPlayer '$tom'; `$s.PlayLooping(); Start-Sleep -Seconds $Segundos; `$s.Stop()" -PassThru -WindowStyle Hidden
$p.Id
