@echo off
set PYTHONUTF8=1
cd /d %~dp0
python mail_auto_cleaner.py >> logs\scheduler_output.txt 2>&1
