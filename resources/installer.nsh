!ifndef GETPROCESSINFO_INCLUDED
  !include "getProcessInfo.nsh"
!endif

!ifndef nsProcess::FindProcess
  !include "nsProcess.nsh"
!endif

!ifndef WORKSHOP_MANAGER_NSIS_PID_DEFINED
  Var pid
  !define WORKSHOP_MANAGER_NSIS_PID_DEFINED
!endif

!macro WorkshopManagerFindAppProcess _RETURN
  ${nsProcess::FindProcess} "${APP_EXECUTABLE_FILENAME}" ${_RETURN}
  ${if} ${_RETURN} != 0
    nsExec::Exec `"$SYSDIR\cmd.exe" /C tasklist /FI "IMAGENAME eq ${APP_EXECUTABLE_FILENAME}" /FO CSV | "$SYSDIR\find.exe" "${APP_EXECUTABLE_FILENAME}"`
    Pop ${_RETURN}
  ${endif}
!macroend

!macro WorkshopManagerForceCloseApp
  ${nsProcess::CloseProcess} "${APP_EXECUTABLE_FILENAME}" $R2
  Sleep 1000
  ${nsProcess::KillProcess} "${APP_EXECUTABLE_FILENAME}" $R2
  nsExec::Exec `"$SYSDIR\cmd.exe" /C taskkill /T /F /IM "${APP_EXECUTABLE_FILENAME}" /FI "PID ne $pid"`
  Pop $R2
  Sleep 1500
!macroend

!macro customCheckAppRunning
  ${GetProcessInfo} 0 $pid $1 $2 $3 $4
  ${if} $3 != "${APP_EXECUTABLE_FILENAME}"
    ${if} ${isUpdated}
      Sleep 300
    ${endif}

    !insertmacro WorkshopManagerFindAppProcess $R0
    ${if} $R0 == 0
      DetailPrint "$(appClosing)"

      !insertmacro WorkshopManagerForceCloseApp
      !insertmacro WorkshopManagerFindAppProcess $R0
      ${if} $R0 != 0
        Goto not_running
      ${endif}

      StrCpy $R1 0
      close_loop:
        IntOp $R1 $R1 + 1

        !insertmacro WorkshopManagerForceCloseApp
        !insertmacro WorkshopManagerFindAppProcess $R0

        ${if} $R0 == 0
          DetailPrint `Waiting for "${PRODUCT_NAME}" to close.`
          ${if} $R1 < 8
            Goto close_loop
          ${endif}

          MessageBox MB_OK|MB_ICONEXCLAMATION "$(appCannotBeClosed)"
          Quit
        ${endif}
      not_running:
    ${endif}
  ${endif}
!macroend

!macro WorkshopManagerCleanupInstallDir _INSTALL_DIR
  ${if} ${_INSTALL_DIR} == ""
    SetErrors
    Goto cleanup_end
  ${endif}

  !insertmacro WorkshopManagerForceCloseApp

  StrCpy $R6 0
  cleanup_loop:
    IntOp $R6 $R6 + 1
    ClearErrors
    SetOutPath $TEMP
    RMDir /r "${_INSTALL_DIR}"
    IfErrors 0 cleanup_done

    DetailPrint `Direct cleanup retry $R6 for "${_INSTALL_DIR}".`
    ${if} $R6 < 6
      Sleep 1500
      !insertmacro WorkshopManagerForceCloseApp
      Goto cleanup_loop
    ${endif}

    SetErrors
    Goto cleanup_end

  cleanup_done:
    ClearErrors

  cleanup_end:
!macroend

!macro customUnInstallCheck
  IfErrors check_cleanup_result
  ${if} $R0 == 0
    Return
  ${endif}

  check_cleanup_result:
    DetailPrint `Previous installer cleanup returned $R0. Falling back to direct directory cleanup.`
    !insertmacro readReg $R7 "SHELL_CONTEXT" "${INSTALL_REGISTRY_KEY}" InstallLocation
    !insertmacro WorkshopManagerCleanupInstallDir "$R7"
    IfErrors 0 cleanup_recovered
    MessageBox MB_OK|MB_ICONEXCLAMATION "$(appCannotBeClosed)"
    SetErrorLevel 2
    Quit

  cleanup_recovered:
    Push 0
    Pop $R0
    ClearErrors
!macroend
