param(
  [Parameter(Mandatory=$true)][string]$LayoutFile,
  [Parameter(Mandatory=$true)][string]$LogoFile,
  [Parameter(Mandatory=$true)][string]$OutputFile,
  [string]$DebugPng = ''
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$width = 576
$maxHeight = 20000
$parsed = Get-Content -LiteralPath $LayoutFile -Raw -Encoding UTF8 | ConvertFrom-Json
$layout = @($parsed)
if ($layout.Count -eq 1 -and $layout[0] -is [Array]) { $layout = @($layout[0]) }
if ($layout.Count -lt 1 -or $layout.Count -gt 1500) { throw 'Diseño de ticket inválido' }
$height = [Math]::Min($maxHeight, 400 + $layout.Count * 125)
$bitmap = New-Object System.Drawing.Bitmap($width,$height,[System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.Clear([System.Drawing.Color]::White)
$graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
$brush = [System.Drawing.Brushes]::Black
$fontItem = New-Object System.Drawing.Font('Arial',27,[System.Drawing.FontStyle]::Regular,[System.Drawing.GraphicsUnit]::Pixel)
$fontItemBold = New-Object System.Drawing.Font('Arial',27,[System.Drawing.FontStyle]::Bold,[System.Drawing.GraphicsUnit]::Pixel)
$fontMeta = New-Object System.Drawing.Font('Arial',25,[System.Drawing.FontStyle]::Regular,[System.Drawing.GraphicsUnit]::Pixel)
$fontClient = New-Object System.Drawing.Font('Arial',62,[System.Drawing.FontStyle]::Bold,[System.Drawing.GraphicsUnit]::Pixel)
$fontNote = New-Object System.Drawing.Font('Arial',23,[System.Drawing.FontStyle]::Regular,[System.Drawing.GraphicsUnit]::Pixel)
$fontNoteBold = New-Object System.Drawing.Font('Arial',23,[System.Drawing.FontStyle]::Bold,[System.Drawing.GraphicsUnit]::Pixel)
$fontDefault = New-Object System.Drawing.Font('Arial',26,[System.Drawing.FontStyle]::Regular,[System.Drawing.GraphicsUnit]::Pixel)
$left = 22
$right = $width - 22
$cursor = 8
$ruleCount = 0

function Text-Width([string]$value,[System.Drawing.Font]$font) {
  return $graphics.MeasureString($value,$font,[int]10000,[System.Drawing.StringFormat]::GenericTypographic).Width
}
function Put-Text([string]$value,[System.Drawing.Font]$font,[float]$x,[float]$y) {
  if ($value) { $graphics.DrawString($value,$font,$brush,$x,$y,[System.Drawing.StringFormat]::GenericTypographic) }
}
function Put-Wrapped([string]$value,[System.Drawing.Font]$font,[float]$x,[float]$y,[float]$maxWidth,[int]$lineHeight) {
  $words = @($value.Trim() -split '\s+')
  $line = ''
  $lines = New-Object 'System.Collections.Generic.List[string]'
  foreach($word in $words) {
    $candidate = if ($line) { $line + ' ' + $word } else { $word }
    if ($line -and (Text-Width $candidate $font) -gt $maxWidth) {
      $lines.Add($line)
      $line = $word
    } else {
      $line = $candidate
    }
    # Palabras largas sin espacios: partir por caracteres medidos.
    if ((Text-Width $line $font) -gt $maxWidth) {
      $fragment = ''
      foreach($char in $line.ToCharArray()) {
        $next = $fragment + [string]$char
        if ($fragment -and (Text-Width $next $font) -gt $maxWidth) {
          $lines.Add($fragment)
          $fragment = [string]$char
        } else { $fragment = $next }
      }
      $line = $fragment
    }
  }
  if ($line) { $lines.Add($line) }
  if ($lines.Count -eq 0) { return $y }
  foreach ($segment in $lines) {
    Put-Text $segment $font $x $y
    $y += $lineHeight
  }
  return $y
}

try {
  $logoBytes = [System.IO.File]::ReadAllBytes($LogoFile)
  if ($logoBytes.Length -lt 9 -or $logoBytes[0] -ne 29 -or $logoBytes[1] -ne 118) {
    throw 'Bitmap de logo inválido'
  }
  $stride = [int]$logoBytes[4] + 256 * [int]$logoBytes[5]
  $logoHeight = [int]$logoBytes[6] + 256 * [int]$logoBytes[7]
  if ($stride -ne 72 -or $logoHeight -lt 10 -or $logoHeight -gt 250) { throw 'Dimensiones de logo inválidas' }

  foreach($line in $layout) {
    if ($cursor + 150 -gt $height) { throw 'Ticket demasiado largo' }
    $kind = [string]$line.kind
    $value = [string]$line.text
    if ($value.Length -gt 300) { throw 'Línea demasiado larga' }
    switch ($kind) {
      'brand' {
        # Lee solo los 128 puntos iniciales del raster original.
        $brand = New-Object System.Drawing.Bitmap(128,$logoHeight)
        try {
          $brandGraphics = [System.Drawing.Graphics]::FromImage($brand)
          $brandGraphics.Clear([System.Drawing.Color]::White)
          $brandGraphics.Dispose()
          for ($y=0; $y -lt $logoHeight; $y++) {
            for ($x=0; $x -lt 128; $x++) {
              $index = 8 + $y*$stride + [int][Math]::Floor($x/8)
              if (($logoBytes[$index] -band (128 -shr ($x%8))) -ne 0) {
                $brand.SetPixel($x,$y,[System.Drawing.Color]::Black)
              }
            }
          }
          # 92 x 88 puntos: logo arriba a la izquierda, proporcionado.
          $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
          $graphics.DrawImage($brand, 24, $cursor, 92, 88)
        } finally { $brand.Dispose() }
        $cursor += 94
        continue
      }
      'rule' {
        $ruleCount++
        $cursor += 3
        $graphics.FillRectangle($brush,$left,$cursor,$right-$left,2)
        $cursor += if ($ruleCount -eq 2) { 24 } else { 7 }
        continue
      }
      'meta' {
        $parts = @($value.Trim() -split '\s{2,}')
        if ($parts.Count -gt 0) { Put-Text $parts[0] $fontMeta $left $cursor }
        if ($parts.Count -gt 1) {
          $midWidth = Text-Width $parts[1] $fontMeta
          Put-Text $parts[1] $fontMeta (($width - $midWidth)/2) $cursor
        }
        if ($parts.Count -gt 2) {
          $lastWidth = Text-Width $parts[2] $fontMeta
          Put-Text $parts[2] $fontMeta ($right - $lastWidth) $cursor
        }
        $cursor += 37
        continue
      }
      'item' {
        $qty = [string]$line.quantity
        if ($qty -notmatch '^[0-9]+(\.[0-9]+)?$') { throw 'Cantidad inválida' }
        $qtyX = 94
        $qtyWidth = Text-Width $qty $fontItem
        Put-Text $qty $fontItem $qtyX $cursor
        $nameX = [Math]::Max(130,[Math]::Ceiling($qtyX+$qtyWidth+14))
        $cursor = Put-Wrapped $value $fontItem $nameX $cursor ($right-$nameX) 44
        continue
      }
      'text' {
        if (-not $value.Trim()) {
          $cursor += 11
          continue
        }
        if ($line.doubleHeight) {
          $textWidth = Text-Width $value $fontClient
          $x = [Math]::Max($left,($width-$textWidth)/2)
          Put-Text $value $fontClient $x $cursor
          $cursor += 71
        } elseif ($value.StartsWith('    ')) {
          $cursor = Put-Wrapped $value.Trim() $fontNote 130 $cursor ($right-130) 32
        } else {
          $f = if ($line.bold) { $fontNoteBold } else { $fontDefault }
          $x = if ($line.align -eq 'center') {
            [Math]::Max($left,($width-(Text-Width $value $f))/2)
          } else { $left }
          $cursor = Put-Wrapped $value $f $x $cursor ($right-$x) 32
        }
        continue
      }
      default { throw ('Línea no admitida: ' + $kind) }
    }
  }

  $usedHeight = [Math]::Min($height,$cursor+20)
  if ($DebugPng) {
    $cropped = $bitmap.Clone((New-Object System.Drawing.Rectangle(0,0,$width,$usedHeight)),[System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
    try { $cropped.Save($DebugPng,[System.Drawing.Imaging.ImageFormat]::Png) }
    finally { $cropped.Dispose() }
  }
  $rect = New-Object System.Drawing.Rectangle(0,0,$width,$height)
  $data = $bitmap.LockBits($rect,[System.Drawing.Imaging.ImageLockMode]::ReadOnly,[System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
  try {
    $strideBytes = [Math]::Abs($data.Stride)
    $pixels = New-Object byte[] ($strideBytes*$height)
    [System.Runtime.InteropServices.Marshal]::Copy($data.Scan0,$pixels,0,$pixels.Length)
  } finally { $bitmap.UnlockBits($data) }

  $ms = New-Object System.IO.MemoryStream
  $initial = [byte[]]@(27,64,27,97,0)
  $ms.Write($initial,0,$initial.Length)
  $rowBytes = 72
  for($start=0;$start -lt $usedHeight;$start+=192) {
    $chunkHeight = [Math]::Min(192,$usedHeight-$start)
    $header = [byte[]]@(29,118,48,0,72,0,($chunkHeight -band 255),($chunkHeight -shr 8))
    $ms.Write($header,0,$header.Length)
    for($y=$start;$y -lt ($start+$chunkHeight);$y++) {
      $row = $y*$strideBytes
      for($b=0;$b -lt $rowBytes;$b++) {
        $packed = 0
        for($bit=0;$bit -lt 8;$bit++) {
          $index = $row + (8*$b+$bit)*3
          if ($pixels[$index] -lt 174 -or $pixels[$index+1] -lt 174 -or $pixels[$index+2] -lt 174) {
            $packed = $packed -bor (128 -shr $bit)
          }
        }
        $ms.WriteByte([byte]$packed)
      }
    }
  }
  $ending = [byte[]]@(10,10,29,86,0)
  $ms.Write($ending,0,$ending.Length)
  [System.IO.File]::WriteAllBytes($OutputFile,$ms.ToArray())
  Write-Output ('Raster BDP generado en memoria: '+$width+' x '+$usedHeight+' píxeles, '+$ms.Length+' bytes')
  $ms.Dispose()
} finally {
  foreach($font in @($fontItem,$fontItemBold,$fontMeta,$fontClient,$fontNote,$fontNoteBold,$fontDefault)) { $font.Dispose() }
  $graphics.Dispose()
  $bitmap.Dispose()
}