@echo off
title Servidor - Mesa de Rol
echo ============================================
echo   Mesa de Rol Online - Servidor Local
echo ============================================
echo.
cd /d "%~dp0server"
echo Iniciando en localhost:8765...
echo Contrasena GM: gm1234
echo.
echo Para activar modo GM escribe en el chat:
echo   /mode gm gm1234
echo.
echo Cierra esta ventana para detener el servidor.
echo.
python server.py
pause
