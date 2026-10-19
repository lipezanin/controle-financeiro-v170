; Instalador Windows (NSIS) — gera ControleFinanceiro-Setup.exe
; Instala em Program Files (64-bit) com elevação de administrador.

Unicode True
RequestExecutionLevel admin
SetCompressor /SOLID lzma

!ifndef SRC
  !define SRC "/tmp/cf-windows/ControleFinanceiro"
!endif
!ifndef OUT
  !define OUT "/tmp/cf-windows/ControleFinanceiro-Setup.exe"
!endif

!include "MUI2.nsh"
!include "x64.nsh"

!ifndef APPVER
  !define APPVER "2.0.0"
!endif

Name "Controle Financeiro ${APPVER}"
OutFile "${OUT}"
InstallDir "$PROGRAMFILES64\Controle Financeiro"
InstallDirRegKey HKLM "Software\ControleFinanceiro" "InstallDir"
BrandingText "Controle Financeiro ${APPVER}"

!define MUI_ABORTWARNING
!define MUI_FINISHPAGE_NOAUTOCLOSE
!define MUI_FINISHPAGE_RUN "$INSTDIR\ControleFinanceiro.exe"
!define MUI_FINISHPAGE_RUN_TEXT "Abrir o Controle Financeiro agora"

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "PortugueseBR"

VIProductVersion "${APPVER}.0"
VIAddVersionKey /LANG=1046 "ProductName" "Controle Financeiro"
VIAddVersionKey /LANG=1046 "FileDescription" "Instalador do Controle Financeiro"
VIAddVersionKey /LANG=1046 "FileVersion" "${APPVER}"
VIAddVersionKey /LANG=1046 "ProductVersion" "${APPVER}"
VIAddVersionKey /LANG=1046 "LegalCopyright" "Uso local"

Function .onInit
  ${If} ${RunningX64}
    SetRegView 64
  ${EndIf}
FunctionEnd

Function .onInstSuccess
  IfSilent 0 fimSilencioso
    Exec '"$INSTDIR\ControleFinanceiro.exe"'
  fimSilencioso:
FunctionEnd

Section "Instalar" SecInst
  SetRegView 64
  nsExec::ExecToLog 'taskkill /F /IM ControleFinanceiro.exe'
  Sleep 800

  SetOutPath "$INSTDIR"
  File /r /x "Instalar.bat" "${SRC}\*.*"

  CreateDirectory "$SMPROGRAMS\Controle Financeiro"
  CreateShortCut "$SMPROGRAMS\Controle Financeiro\Controle Financeiro.lnk" "$INSTDIR\ControleFinanceiro.exe" "" "$INSTDIR\ControleFinanceiro.exe" 0
  CreateShortCut "$DESKTOP\Controle Financeiro.lnk" "$INSTDIR\ControleFinanceiro.exe" "" "$INSTDIR\ControleFinanceiro.exe" 0

  WriteUninstaller "$INSTDIR\Desinstalar.exe"
  WriteRegStr HKLM "Software\ControleFinanceiro" "InstallDir" "$INSTDIR"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\ControleFinanceiro" "DisplayName" "Controle Financeiro ${APPVER}"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\ControleFinanceiro" "UninstallString" "$INSTDIR\Desinstalar.exe"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\ControleFinanceiro" "DisplayIcon" "$INSTDIR\ControleFinanceiro.exe"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\ControleFinanceiro" "Publisher" "Controle Financeiro"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\ControleFinanceiro" "DisplayVersion" "${APPVER}"
  WriteRegDWORD HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\ControleFinanceiro" "NoModify" 1
  WriteRegDWORD HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\ControleFinanceiro" "NoRepair" 1
SectionEnd

Section "Uninstall"
  SetRegView 64
  nsExec::ExecToLog 'taskkill /F /IM ControleFinanceiro.exe'
  Delete "$DESKTOP\Controle Financeiro.lnk"
  RMDir /r "$SMPROGRAMS\Controle Financeiro"
  RMDir /r "$INSTDIR"
  DeleteRegKey HKLM "Software\ControleFinanceiro"
  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\ControleFinanceiro"
SectionEnd
