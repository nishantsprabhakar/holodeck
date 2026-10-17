; Inno Setup script for the Wrexlyn HoloDeck Windows installer.
; Build (after PyInstaller):
;   ISCC /DAppVersion=1.0.0 /DDistDir=<path>\dist\WrexlynHoloDeck /DOutDir=<path>\installers packaging\windows\holodeck.iss

#ifndef AppVersion
  #define AppVersion "1.0.0"
#endif
#ifndef DistDir
  #define DistDir "..\..\dist\WrexlynHoloDeck"
#endif
#ifndef OutDir
  #define OutDir "..\..\installers"
#endif

#define AppName "Wrexlyn HoloDeck"
#define AppExe "WrexlynHoloDeck.exe"
#define AppPublisher "Nishant Prabhakar"
#define AppCopyright "Copyright (c) 2026 Nishant Prabhakar. All rights reserved."

[Setup]
AppId={{6E0B5D2A-91C4-4F7B-A3E8-2D5C7B19F4A6}
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName={#AppName} {#AppVersion}
AppPublisher={#AppPublisher}
AppCopyright={#AppCopyright}
DefaultDirName={autopf}\Wrexlyn HoloDeck
DefaultGroupName=Wrexlyn HoloDeck
DisableProgramGroupPage=yes
; Per-user install by default (no admin prompt); admins may choose all users.
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
LicenseFile=..\..\LICENSE.txt
OutputDir={#OutDir}
OutputBaseFilename=WrexlynHoloDeck-Setup-{#AppVersion}-windows-x64
SetupIconFile=..\icons\holodeck.ico
UninstallDisplayIcon={app}\{#AppExe}
UninstallDisplayName={#AppName}
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
CloseApplications=yes
VersionInfoVersion={#AppVersion}
VersionInfoCompany={#AppPublisher}
VersionInfoCopyright={#AppCopyright}
VersionInfoProductName={#AppName}
VersionInfoDescription={#AppName} Setup

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[Files]
Source: "{#DistDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\..\LICENSE.txt"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{autoprograms}\{#AppName}"; Filename: "{app}\{#AppExe}"
Name: "{autoprograms}\{#AppName} License and Disclaimer"; Filename: "{app}\LICENSE.txt"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#AppExe}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#AppExe}"; Description: "{cm:LaunchProgram,{#AppName}}"; Flags: nowait postinstall skipifsilent
