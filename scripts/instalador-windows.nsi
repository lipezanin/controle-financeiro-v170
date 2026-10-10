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

Name "Controle Financeiro 1.7.0"
OutFile "${OUT}"
InstallDir "$PROGRAMFILES64\Controle Financeiro"
InstallDirRegKey HKLM "Software\ControleFinanceiro" "InstallDir"
BrandingText "Controle Financeiro 1.7.0"

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

VIProductVersion "1.7.0.0"
VIAddVersionKey /LANG=1046 "ProductName" "Controle Financeiro"
VIAddVersionKey /LANG=1046 "FileDescription" "Instalador do Controle Financeiro"
VIAddVersionKey /LANG=1046 "FileVersion" "1.7.0"
VIAddVersionKey /LANG=1046 "ProductVersion" "1.7.0"
VIAddVersionKey /LANG=1046 "LegalCopyright" "Uso local"

Function .onInit
  ${If} ${RunningX64}
    SetRegView 64
  ${EndIf}
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
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\ControleFinanceiro" "DisplayName" "Controle Financeiro 1.7.0"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\ControleFinanceiro" "UninstallString" "$INSTDIR\Desinstalar.exe"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\ControleFinanceiro" "DisplayIcon" "$INSTDIR\ControleFinanceiro.exe"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\ControleFinanceiro" "Publisher" "Controle Financeiro"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\ControleFinanceiro" "DisplayVersion" "1.7.0"
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
