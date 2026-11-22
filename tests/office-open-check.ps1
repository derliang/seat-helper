# 用本機 Word／Excel 實際開啟分組功能產生的下載檔（需要安裝 Office；不在 pre-push 自動跑）。
# 用法：pwsh -NoProfile -File tests\office-open-check.ps1 [-OutDir 路徑] [-Pdf]
#（用 PowerShell 7；Windows PowerShell 5.1 會把本檔的中文讀成亂碼）
# 會先用 node 產生樣本檔（虛構名單），逐一開啟：Word 回報頁數、Excel 回報工作表名稱；-Pdf 另存 PDF 供目視檢查版面。
# v3.7.0 起：每一份 Word／Excel 都必須「只印一頁」——Word 頁數不是 1、Excel 匯出的 PDF 頁數不是 1，都算失敗。
param([string]$OutDir = (Join-Path $env:TEMP 'seat-helper-group-samples'), [switch]$Pdf)
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
if (Test-Path $OutDir) { Remove-Item -Recurse -Force $OutDir }
New-Item -ItemType Directory -Force $OutDir | Out-Null
$env:GROUP_SAMPLES_DIR = $OutDir
node --test (Join-Path $repo 'tests\group-logic.test.js') | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'node 測試失敗，先修測試' }
$fail = 0
$word = New-Object -ComObject Word.Application
$word.Visible = $false; $word.DisplayAlerts = 0
try {
    Get-ChildItem $OutDir -Filter *.docx | ForEach-Object {
        $f = $_
        try {
            $doc = $word.Documents.Open($f.FullName, $false, $true, $false)
            $pages = $doc.ComputeStatistics(2)
            if ($Pdf) { $doc.ExportAsFixedFormat(($f.FullName + '.pdf'), 17) }
            $doc.Close($false)
            if ($pages -ne 1) { throw "頁數是 $pages，必須是 1" }
            "OK   Word  頁數 $pages  $($f.Name)"
        } catch { $fail++; "FAIL Word  $($f.Name)：$($_.Exception.Message)" }
    }
} finally { $word.Quit() }
$xl = New-Object -ComObject Excel.Application
$xl.Visible = $false; $xl.DisplayAlerts = $false
try {
    Get-ChildItem $OutDir -Filter *.xlsx | ForEach-Object {
        $f = $_
        try {
            # 關閉警示時，需要修復的檔案會丟出例外；檔名若被加上「修復」也算失敗
            $wb = $xl.Workbooks.Open($f.FullName)
            if ($wb.Name -match 'Repaired|修復') { throw 'Excel 需要修復這個檔案' }
            $names = ($wb.Worksheets | ForEach-Object { $_.Name }) -join '、'
            $pdfPath = $f.FullName + '.pdf'
            $wb.ExportAsFixedFormat(0, $pdfPath)
            $xt = [System.Text.Encoding]::GetEncoding(28591).GetString([System.IO.File]::ReadAllBytes($pdfPath))
            $xPages = ([regex]::Matches($xt, '/Types*/Page(?![sw])')).Count
            if (-not $Pdf) { Remove-Item $pdfPath -Force }
            $wb.Close($false)
            if ($xPages -ne 1) { throw "列印成 $xPages 頁，必須是 1" }
            "OK   Excel 工作表 $names  列印 $xPages 頁  $($f.Name)"
        } catch { $fail++; "FAIL Excel $($f.Name)：$($_.Exception.Message)" }
    }
} finally { $xl.Quit() }
"樣本資料夾：$OutDir"
if ($fail) { throw "$fail 個檔案打不開" }
