#Requires -Version 7.5
param([string]$BaseUrl = 'http://127.0.0.1:5173', [ValidateSet('daily','hourly')][string]$ExpectedFrequency = 'hourly')
$ErrorActionPreference = 'Stop'
$checks = @()
function Get-Api([string]$Path) {
  # Preserve API timestamp strings: Invoke-RestMethod converts them to DateTime.
  (Invoke-WebRequest -Uri ($BaseUrl + $Path) -NoProxy -TimeoutSec 55).Content | ConvertFrom-Json -DateKind String
}
function Assert-Check([bool]$Condition, [string]$Name) {
  if (-not $Condition) { throw ('FAIL: ' + $Name) }
  $script:checks += $Name
}
$page = Invoke-WebRequest -Uri ($BaseUrl + '/') -NoProxy -TimeoutSec 50 -UseBasicParsing
Assert-Check ($page.StatusCode -eq 200) 'Homepage returns 200'
$rates = Get-Api '/api/rates?base=CNY'
Assert-Check ($rates.base -eq 'CNY' -and $rates.frequency -eq $ExpectedFrequency) 'Expected frequency and base are explicit'
Assert-Check ($rates.quotes.Count -ge 100) 'More than 100 currencies available'
Assert-Check (@($rates.quotes | Where-Object { $_.rate -le 0 -or -not $_.date }).Count -eq 0) 'Rates are positive and individually dated'
$usd = $rates.quotes | Where-Object code -eq 'USD'
Assert-Check ($usd.rate -gt 0) 'USD to CNY present'
$history = Get-Api '/api/history?from=USD&to=CNY&days=30'
Assert-Check ($history.points.Count -gt 5) 'Thirty-day history contains actual data'
Assert-Check ($history.frequency -eq 'daily' -and $history.source -match 'Frankfurter') 'History source and daily frequency remain explicit'
$history7 = Get-Api '/api/history?from=USD&to=CNY&days=7'
Assert-Check ($history7.points.Count -ge 2 -and $history7.points.Count -le $history.points.Count) 'History period is applied'
$pair = Get-Api '/api/quote?from=USD&to=CNY'
$inverse = Get-Api '/api/quote?from=CNY&to=USD'
Assert-Check ([Math]::Abs(($pair.rate * $inverse.rate) - 1) -lt 0.0005) 'Inverse direction agrees within source rounding'
$same = Get-Api '/api/quote?from=CNY&to=CNY'
Assert-Check ($same.rate -eq 1) 'Same currency conversion is identity'
$usdBase = Get-Api '/api/rates?base=USD'
Assert-Check ($usdBase.base -eq 'USD' -and @($usdBase.quotes | Where-Object code -eq 'CNY').Count -eq 1) 'Base currency switch returns matching data'
if ($ExpectedFrequency -eq 'hourly') {
  Assert-Check (-not $rates.setupRequired -and $rates.source -match 'Open Exchange Rates') 'Hourly provider is active'
  Assert-Check ($pair.frequency -eq 'hourly' -and $pair.date -match 'T.*Z$') 'Converter carries actual hourly publication timestamp'
  Assert-Check ($pair.date -eq $usd.date -and $pair.rate -eq $usd.rate) 'Overview and converter agree on quote and timestamp'
  Assert-Check ($pair.fetchedAt -eq $rates.fetchedAt -and $usdBase.fetchedAt -eq $rates.fetchedAt) 'Different bases and pairs reuse the same upstream fetch'
  $cacheSeconds = ([datetimeoffset]$pair.nextUpdateAt - [datetimeoffset]$pair.fetchedAt).TotalSeconds
  Assert-Check ($cacheSeconds -eq 3600) 'Provider snapshot has one-hour refresh interval'
  $repeat = Get-Api '/api/quote?from=EUR&to=CNY'
  Assert-Check ($repeat.fetchedAt -eq $pair.fetchedAt) 'Additional conversion does not refetch the upstream snapshot'
  $headerCheck = Invoke-WebRequest -Uri ($BaseUrl + '/api/quote?from=USD&to=CNY') -NoProxy -TimeoutSec 30
  Assert-Check ($headerCheck.Headers['X-Data-Frequency'] -contains 'hourly') 'HTTP metadata reports hourly frequency'
}
$bad = Invoke-WebRequest -Uri ($BaseUrl + '/api/history?from=USD&to=CNY&days=2') -NoProxy -TimeoutSec 50 -SkipHttpErrorCheck
Assert-Check ($bad.StatusCode -eq 400) 'Unsupported time period returns 400'
$badCode = Invoke-WebRequest -Uri ($BaseUrl + '/api/quote?from=..%2F&to=CNY') -NoProxy -TimeoutSec 50 -SkipHttpErrorCheck
Assert-Check ($badCode.StatusCode -eq 400) 'Malformed currency code is rejected'
$unsupported = Invoke-WebRequest -Uri ($BaseUrl + '/api/quote?from=ZZZ&to=CNY') -NoProxy -TimeoutSec 50 -SkipHttpErrorCheck
Assert-Check ($unsupported.StatusCode -eq 404) 'Unsupported currency returns 404'
$summary = [ordered]@{checkedAt=(Get-Date).ToString('o');baseUrl=$BaseUrl;passed=$checks.Count;checks=$checks;currencies=$rates.quotes.Count;historyPoints=$history.points.Count;historyAvailable=$rates.historyAvailable;usdCny=$pair;sampleChange=$usd}
$directory = Join-Path $PSScriptRoot '..\outputs'
[System.IO.Directory]::CreateDirectory($directory) | Out-Null
$summary | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $directory 'api-verification.json') -Encoding utf8
[pscustomobject]@{Passed=$checks.Count;Currencies=$rates.quotes.Count;HistoryPoints=$history.points.Count;HistoryComparison=$rates.historyAvailable;QuoteDate=$pair.date;Evidence='outputs/api-verification.json'} | ConvertTo-Json
