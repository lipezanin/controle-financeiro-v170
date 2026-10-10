@echo off
chcp 65001 >nul
title Controle Financeiro — Instalação
set "ORIGEM=%~dp0"
set "DESTINO=%LOCALAPPDATA%\ControleFinanceiro"

echo.
echo  Controle Financeiro — instalação local (sem admin)
echo  Destino: %DESTINO%
echo.

if not exist "%DESTINO%" mkdir "%DESTINO%"
xcopy /E /I /Y /Q "%ORIGEM%*" "%DESTINO%" >nul

set "ATALHO=%USERPROFILE%\Desktop\Controle Financeiro.lnk"
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$s = (New-Object -ComObject WScript.Shell).CreateShortcut([Environment]::GetFolderPath('Desktop') + '\Controle Financeiro.lnk'); $s.TargetPath = $env:LOCALAPPDATA + '\ControleFinanceiro\ControleFinanceiro.exe'; $s.WorkingDirectory = $env:LOCALAPPDATA + '\ControleFinanceiro'; $s.Description = 'Controle Financeiro — 100%% local'; $s.Save()"

echo  Atalho criado na Área de trabalho.
echo  Abrindo o aplicativo...
echo.
start "" "%DESTINO%\ControleFinanceiro.exe"
exit /b 0
