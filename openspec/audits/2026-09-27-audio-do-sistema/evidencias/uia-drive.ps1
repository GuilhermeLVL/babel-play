param([string]$Surface = 'Entire Screen', [string]$Audio = '1', [string]$Item = '', [switch]$DumpOnly)
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
$A = [System.Windows.Automation.AutomationElement]
$TS = [System.Windows.Automation.TreeScope]
$CT = [System.Windows.Automation.ControlType]
function Find-Win { $root = $A::RootElement
  $c = New-Object System.Windows.Automation.PropertyCondition($A::ClassNameProperty, 'Chrome_WidgetWin_1')
  foreach ($w in $root.FindAll($TS::Children, $c)) { $pat = if ($env:WIN) { $env:WIN } else { '*repro-audio*' }; if ($w.Current.Name -like $pat) { return $w } } }
function All($w) { $w.FindAll($TS::Descendants, [System.Windows.Automation.Condition]::TrueCondition) }
function Dump($w) { foreach ($e in (All $w)) { $n = $e.Current.Name; $t = $e.Current.ControlType.ProgrammaticName
  $extra=''; try { $tp=$e.GetCurrentPattern([System.Windows.Automation.TogglePattern]::Pattern); $extra=' toggle='+$tp.Current.ToggleState } catch {}
  if ($n) { "  $t | $n$extra" } } }
function Find-El($w, $type, $name) { foreach ($e in (All $w)) { if ($e.Current.ControlType -eq $type -and $e.Current.Name -like $name) { return $e } } }
Start-Sleep -Milliseconds 1500
$w = Find-Win
if (-not $w) { 'janela nao achada'; exit 1 }
$dlg = Find-El $w ([System.Windows.Automation.ControlType]::Window) 'Choose what to share*'
if (-not $dlg) { 'dialogo nao achado'; Dump $w; exit 1 }
$w = $dlg
$tab = Find-El $w $CT::TabItem $Surface
if (-not $tab) { "aba $Surface nao achada"; Dump $w; exit 1 }
$tab.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern).Select()
Start-Sleep -Milliseconds 1500
if ($DumpOnly) { Dump $w; exit 0 }
if ($env:DUMP) { Dump $w }
$skip = @('Share','Cancel','Share with system audio','Share with tab audio','Share with Audio')
$pick = $null
foreach ($e in (All $w)) { if (($e.Current.ControlType -eq $CT::Button -or $e.Current.ControlType -eq $CT::DataItem -or $e.Current.ControlType -eq $CT::ListItem) -and $skip -notcontains $e.Current.Name -and $e.Current.Name -notlike 'repro-audio*') {
  if (-not $Item -or $e.Current.Name -like $Item) { $pick = $e; break } } }
if ($pick) { "escolhido: $($pick.Current.Name)"; try { $pick.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke() } catch { try { $pick.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern).Select() } catch { $pick.SetFocus() } } }
else { 'nenhum item'; Dump $w }
Start-Sleep -Milliseconds 700
$tg = Find-El $w $CT::Button 'Share with system audio'; if (-not $tg) { $tg = Find-El $w $CT::Button 'Share with tab audio' }
if ($tg) { $tp = $tg.GetCurrentPattern([System.Windows.Automation.TogglePattern]::Pattern)
  $want = if ($Audio -eq '1') { 'On' } else { 'Off' }
  if ("$($tp.Current.ToggleState)" -ne $want) { $tp.Toggle() }; "audio toggle=$($tp.Current.ToggleState)" } else { 'sem toggle de audio' }
Start-Sleep -Milliseconds 500
$sh = Find-El $w $CT::Button 'Share with Audio'; if (-not $sh) { $sh = Find-El $w $CT::Button 'Share' }
if ($sh) { $sh.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke(); 'share clicado' } else { 'sem Share'; Dump $w }
