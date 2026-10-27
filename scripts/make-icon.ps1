# Draws Komori's app icon (a little mint bat on a dark rounded tile) as a
# 1024x1024 PNG; `npx tauri icon` then makes every size from it.
Add-Type -AssemblyName System.Drawing

$size = 1024
$bmp = New-Object System.Drawing.Bitmap $size, $size
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.Clear([System.Drawing.Color]::Transparent)

function RoundRect([float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $p.AddArc($x, $y, 2 * $r, 2 * $r, 180, 90)
  $p.AddArc($x + $w - 2 * $r, $y, 2 * $r, 2 * $r, 270, 90)
  $p.AddArc($x + $w - 2 * $r, $y + $h - 2 * $r, 2 * $r, 2 * $r, 0, 90)
  $p.AddArc($x, $y + $h - 2 * $r, 2 * $r, 2 * $r, 90, 90)
  $p.CloseFigure()
  return $p
}

# Tile.
$tile = RoundRect 40 40 944 944 220
$bg = New-Object System.Drawing.Drawing2D.LinearGradientBrush (New-Object System.Drawing.Point 0, 0), (New-Object System.Drawing.Point 0, $size), ([System.Drawing.Color]::FromArgb(255, 22, 36, 32)), ([System.Drawing.Color]::FromArgb(255, 10, 17, 15))
$g.FillPath($bg, $tile)

$mint = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 143, 227, 192))
$mintDark = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 95, 191, 149))
$dark = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 14, 22, 20))
$white = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)

$cx = 512; $cy = 560; $r = 190

# Wings.
foreach ($sx in @(-1, 1)) {
  $w = New-Object System.Drawing.Drawing2D.GraphicsPath
  $pts = @(
    (New-Object System.Drawing.PointF ($cx + $sx * $r * 0.7), ($cy - $r * 0.3)),
    (New-Object System.Drawing.PointF ($cx + $sx * $r * 2.05), ($cy - $r * 0.95)),
    (New-Object System.Drawing.PointF ($cx + $sx * $r * 2.1), ($cy + $r * 0.15)),
    (New-Object System.Drawing.PointF ($cx + $sx * $r * 1.65), ($cy + $r * 0.05)),
    (New-Object System.Drawing.PointF ($cx + $sx * $r * 1.5), ($cy + $r * 0.5)),
    (New-Object System.Drawing.PointF ($cx + $sx * $r * 1.15), ($cy + $r * 0.3)),
    (New-Object System.Drawing.PointF ($cx + $sx * $r * 0.9), ($cy + $r * 0.65))
  )
  $w.AddPolygon($pts)
  $g.FillPath($mintDark, $w)
}
# Ears.
foreach ($sx in @(-1, 1)) {
  $e = @(
    (New-Object System.Drawing.PointF ($cx + $sx * $r * 0.88), ($cy - $r * 0.4)),
    (New-Object System.Drawing.PointF ($cx + $sx * $r * 0.62), ($cy - $r * 1.5)),
    (New-Object System.Drawing.PointF ($cx + $sx * $r * 0.15), ($cy - $r * 0.9))
  )
  $g.FillPolygon($mint, $e)
}
# Body.
$g.FillEllipse($mint, ($cx - $r), ($cy - $r), (2 * $r), (2 * $r))
# Eyes.
foreach ($sx in @(-1, 1)) {
  $g.FillEllipse($white, ($cx + $sx * $r * 0.38 - 46), ($cy - 60), 92, 104)
  $g.FillEllipse($dark, ($cx + $sx * $r * 0.38 - 22), ($cy - 28), 44, 54)
}
# Fangs.
foreach ($sx in @(-1, 1)) {
  $f = @(
    (New-Object System.Drawing.PointF ($cx + $sx * 14), ($cy + $r * 0.4)),
    (New-Object System.Drawing.PointF ($cx + $sx * 46), ($cy + $r * 0.4)),
    (New-Object System.Drawing.PointF ($cx + $sx * 30), ($cy + $r * 0.62))
  )
  $g.FillPolygon($white, $f)
}

$out = Join-Path $PSScriptRoot "..\src-tauri\icons\source.png"
New-Item -ItemType Directory -Force (Split-Path $out) | Out-Null
$bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()
Write-Output "icon: $out"
