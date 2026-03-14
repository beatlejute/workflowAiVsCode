@echo off
REM Run unit tests:
REM 1. Compile TypeScript to CJS JS (needed for Node 25 which treats .ts as ESM natively)
REM 2. Run mocha on compiled JS files
REM NODE_OPTIONS cleared to avoid global ESM loader conflicts

set NODE_OPTIONS=

echo Compiling TypeScript unit tests...
"%~dp0node_modules\.bin\tsc" -p "%~dp0tsconfig.unit-test.json" --noEmit false
if %ERRORLEVEL% neq 0 (
  echo TypeScript compilation failed
  exit /b 1
)

echo Running unit tests...
set MOCHA="%~dp0node_modules\.bin\mocha"
REM Use find to collect test files (avoids glob quoting issues)
set TEST_FILES=
for /f "delims=" %%i in ('dir /b /s /o:n "%~dp0dist\unit-test\src\test\*.test.js"') do (
  set TEST_FILES=!TEST_FILES! %%i
)
%MOCHA% --ui tdd %TEST_FILES% %*
