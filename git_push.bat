@echo off
title Git Push Daily Expenses Tracker
echo =======================================================
echo Staging and Committing SpendWise Expenses Tracker...
echo =======================================================
git add .
git commit -m "feat: complete daily expenses tracker with WebRTC camera OCR, mobile bottom nav, Indian Rupee support, and database reset utility"
echo.
echo =======================================================
echo Pushing changes to GitHub...
echo =======================================================
git push
echo.
echo =======================================================
echo Git Push Completed Successfully!
echo =======================================================
pause
