@echo off
title Build SpendWise Desktop Executable (.exe)
echo =======================================================
echo Checking for icon.png in project directory...
echo =======================================================
if not exist "icon.png" (
  echo ERROR: icon.png not found in project directory!
  echo Please ensure icon.png exists before building.
  pause
  exit /b 1
)
echo Converting icon.png to Windows .ico format...
python -c "import struct, os; png=open('icon.png','rb').read(); header=struct.pack('<HHH',0,1,1); entry=struct.pack('<BBBBHHII',0,0,0,0,1,32,len(png),22); open('icon.ico','wb').write(header+entry+png); print('icon.ico created successfully!')"
echo.
echo =======================================================
echo Installing build dependencies (pywebview & pyinstaller)...
echo =======================================================
pip install pywebview pyinstaller
echo.
echo =======================================================
echo Compiling desktop.py into SpendWise.exe...
echo This may take a minute. Please wait...
echo =======================================================
pyinstaller --noconsole --onefile --name="SpendWise" --icon="icon.ico" desktop.py
echo.
echo =======================================================
echo Build Complete!
echo.
echo You can find your new "SpendWise.exe" inside the "dist" folder!
echo Feel free to drag it to your desktop or pin it to your taskbar.
echo =======================================================
pause
