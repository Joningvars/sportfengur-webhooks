param(
    [Parameter(Mandatory = $true)]
    [string]$WorkbookPath
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $WorkbookPath)) {
    throw "Workbook not found: $WorkbookPath"
}

$excel = $null
$workbook = $null

try {
    $excel = New-Object -ComObject Excel.Application
    $excel.Visible = $false
    $excel.DisplayAlerts = $false
    # Manual mode + explicit full rebuild gives predictable formula refresh.
    $excel.Calculation = -4135  # xlCalculationManual

    $workbook = $excel.Workbooks.Open($WorkbookPath, 0, $false)
    $excel.CalculateFullRebuild()
    $workbook.Save()
}
finally {
    if ($workbook -ne $null) {
        $workbook.Close($true) | Out-Null
        [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($workbook)
        $workbook = $null
    }

    if ($excel -ne $null) {
        $excel.Quit()
        [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel)
        $excel = $null
    }

    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
}
