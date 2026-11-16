Unicode true
!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "x64.nsh"
!include "WinVer.nsh"
!include "nsDialogs.nsh"
Name "TunnelSight Desktop"
OutFile "${PROJECT_DIR}/release/TunnelSight-Setup-${VERSION}.exe"
InstallDir "$LOCALAPPDATA\Programs\TunnelSight"
InstallDirRegKey HKCU "Software\TunnelSight" "InstallDir"
RequestExecutionLevel user
SetCompressor zlib
SetCompressionLevel 5
ShowInstDetails show
ShowUninstDetails show
VIProductVersion "${VERSION}.0"
VIAddVersionKey /LANG=1033 "ProductName" "TunnelSight Desktop"
VIAddVersionKey /LANG=1033 "CompanyName" "Ezekiel Rego"
VIAddVersionKey /LANG=1033 "FileDescription" "TunnelSight Desktop Setup"
VIAddVersionKey /LANG=1033 "FileVersion" "${VERSION}"
VIAddVersionKey /LANG=1033 "LegalCopyright" "Copyright 2026 Ezekiel Rego"
!define MUI_ICON "${PROJECT_DIR}/resources/artwork/icon.ico"
!define MUI_UNICON "${PROJECT_DIR}/resources/artwork/icon.ico"
!define MUI_WELCOMEFINISHPAGE_BITMAP "${PROJECT_DIR}/resources/artwork/sidebar.bmp"
!define MUI_UNWELCOMEFINISHPAGE_BITMAP "${PROJECT_DIR}/resources/artwork/sidebar.bmp"
!define MUI_ABORTWARNING
!define MUI_WELCOMEPAGE_TITLE "Your TunnelSight workstation"
!define MUI_WELCOMEPAGE_TEXT "Install the online TunnelSight workstation and local phone streaming tools.$\r$\n$\r$\nscrcpy and FFmpeg are included. Your cloud projects and website remain separate from this installation.$\r$\n$\r$\nClose a running TunnelSight desktop app before updating."
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_LICENSE "${PROJECT_DIR}/TERMS.txt"
!define MUI_PAGE_CUSTOMFUNCTION_LEAVE CheckDirectory
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!define MUI_FINISHPAGE_RUN "$INSTDIR\TunnelSight.exe"
!define MUI_FINISHPAGE_RUN_TEXT "Launch TunnelSight"
!define MUI_FINISHPAGE_LINK "Desktop setup and support"
!define MUI_FINISHPAGE_LINK_LOCATION "https://tunnelsight.applications.co.zw/desktop/"
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_WELCOME
!insertmacro MUI_UNPAGE_CONFIRM
UninstPage custom un.Options un.OptionsLeave
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_UNPAGE_FINISH
!insertmacro MUI_LANGUAGE "English"
Var RemoveData
Var RemoveDataBox

Function .onInit
  SetShellVarContext current
  ${IfNot} ${RunningX64}
    MessageBox MB_ICONSTOP "TunnelSight requires 64-bit Windows 10 or 11."
    Abort
  ${EndIf}
  ${IfNot} ${AtLeastWin10}
    MessageBox MB_ICONSTOP "TunnelSight requires Windows 10 or 11."
    Abort
  ${EndIf}
FunctionEnd

Function CheckDirectory
  IfFileExists "$INSTDIR\.tunnelsight-install" ready
  IfFileExists "$INSTDIR\*.*" 0 ready
  FindFirst $0 $1 "$INSTDIR\*"
  directoryLoop:
    StrCmp $1 "" directoryEmpty
    StrCmp $1 "." directoryNext
    StrCmp $1 ".." directoryNext
    FindClose $0
    MessageBox MB_ICONSTOP "Choose a new, empty folder dedicated to TunnelSight so uninstalling cannot remove unrelated files."
    Abort
  directoryNext:
    FindNext $0 $1
    Goto directoryLoop
  directoryEmpty:
    FindClose $0
  ready:
FunctionEnd

!macro CheckClosed PREFIX
  ${PREFIX}checkClosed:
    IfFileExists "$INSTDIR\TunnelSight.exe" 0 ${PREFIX}closed
    ClearErrors
    FileOpen $0 "$INSTDIR\TunnelSight.exe" a
    IfErrors 0 ${PREFIX}closeHandle
    MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "Close TunnelSight to stop its local stream, then click Retry." /SD IDCANCEL IDRETRY ${PREFIX}checkClosed
    Abort
  ${PREFIX}closeHandle:
    FileClose $0
  ${PREFIX}closed:
!macroend

Section "TunnelSight" Install
  Call CheckDirectory
  !insertmacro CheckClosed "install_"
  SetOutPath "$INSTDIR"
  File /r "${APP_DIR}/*"
  IfFileExists "$INSTDIR\TunnelSight.exe" 0 installFailed
  IfFileExists "$INSTDIR\resources\app.asar" 0 installFailed
  FileOpen $0 "$INSTDIR\.tunnelsight-install" w
  FileWrite $0 "TunnelSight ${VERSION}"
  FileClose $0
  WriteUninstaller "$INSTDIR\Uninstall TunnelSight.exe"
  CreateShortcut "$DESKTOP\TunnelSight.lnk" "$INSTDIR\TunnelSight.exe"
  CreateDirectory "$SMPROGRAMS\TunnelSight"
  CreateShortcut "$SMPROGRAMS\TunnelSight\TunnelSight.lnk" "$INSTDIR\TunnelSight.exe"
  CreateShortcut "$SMPROGRAMS\TunnelSight\Uninstall.lnk" "$INSTDIR\Uninstall TunnelSight.exe"
  WriteRegStr HKCU "Software\TunnelSight" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\TunnelSight" "DisplayName" "TunnelSight Desktop"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\TunnelSight" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\TunnelSight" "Publisher" "Ezekiel Rego"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\TunnelSight" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\TunnelSight" "UninstallString" '$\"$INSTDIR\Uninstall TunnelSight.exe$\"'
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\TunnelSight" "QuietUninstallString" '$\"$INSTDIR\Uninstall TunnelSight.exe$\" /S'
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\TunnelSight" "DisplayIcon" "$INSTDIR\TunnelSight.exe"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\TunnelSight" "URLInfoAbout" "https://tunnelsight.applications.co.zw/desktop/"
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\TunnelSight" "NoModify" 1
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\TunnelSight" "NoRepair" 1
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\TunnelSight" "EstimatedSize" 500000
  Goto complete
  installFailed:
    MessageBox MB_ICONSTOP "Installation could not finish. Check disk space and choose a writable folder."
    Abort
  complete:
SectionEnd

Function un.onInit
  SetShellVarContext current
  StrCpy $RemoveData ${BST_UNCHECKED}
  IfFileExists "$INSTDIR\.tunnelsight-install" valid
  MessageBox MB_ICONSTOP "The TunnelSight installation marker is missing. No folder was removed."
  Abort
  valid:
FunctionEnd
Function un.Options
  !insertmacro MUI_HEADER_TEXT "Local application data" "Your cloud projects will stay on TunnelSight."
  nsDialogs::Create 1018
  Pop $0
  ${NSD_CreateLabel} 0 0 100% 35u "Uninstalling removes the app and bundled local tools. By default, your desktop settings and sign-in are kept for reinstalls."
  Pop $0
  ${NSD_CreateCheckbox} 0 45u 100% 25u "Also remove this computer's desktop settings and sign-in"
  Pop $RemoveDataBox
  ${NSD_SetState} $RemoveDataBox $RemoveData
  nsDialogs::Show
FunctionEnd
Function un.OptionsLeave
  ${NSD_GetState} $RemoveDataBox $RemoveData
FunctionEnd
Section "Uninstall"
  !insertmacro CheckClosed "uninstall_"
  Delete "$DESKTOP\TunnelSight.lnk"
  RMDir /r "$SMPROGRAMS\TunnelSight"
  SetOutPath "$TEMP"
  RMDir /r /REBOOTOK "$INSTDIR"
  DeleteRegKey HKCU "Software\TunnelSight"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\TunnelSight"
  ${If} $RemoveData == ${BST_CHECKED}
    RMDir /r "$APPDATA\TunnelSight"
  ${EndIf}
SectionEnd
