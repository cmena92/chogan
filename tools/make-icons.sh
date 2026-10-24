#!/usr/bin/env bash
# Builds every app icon from one square logo on a flat background.
# Usage: tools/make-icons.sh design/capybara-logo.png [background hex, default #FEF8EE]
#
# Writes: www/icon-192.png, www/icon-512.png, www/icon-maskable-512.png,
#   www/favicon.svg, the Android launcher (legacy mipmaps and the adaptive
#   foreground) and the store icons in fastlane.
set -euo pipefail
cd "$(dirname "$0")/.."

SRC="${1:?usage: tools/make-icons.sh <logo.png> [background hex]}"
BG="${2:-#FEF8EE}"
command -v magick >/dev/null || { echo "ImageMagick 7 (magick) is required" >&2; exit 2; }

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

# Master: square 1024 copy of the logo as drawn (the logo keeps its own margin)
magick "$SRC" -resize 1024x1024^ -gravity center -extent 1024x1024 "$TMP/full.png"

# Tight: the drawing cropped to a square around its content, for the icons whose
# safe zone is smaller than the logo's own margin (maskable and adaptive)
GEOM=$(magick "$TMP/full.png" -fuzz 6% -trim -format '%w %h %X %Y' info: | tr -d '+')
read -r W H X Y <<<"$GEOM"
SIDE=$(( (W > H ? W : H) + 16 ))
CX=$(( X + W / 2 )); CY=$(( Y + H / 2 ))
magick "$TMP/full.png" -background "$BG" -gravity northwest \
  -crop "${SIDE}x${SIDE}+$(( CX - SIDE / 2 ))+$(( CY - SIDE / 2 ))" +repage \
  -gravity center -extent "${SIDE}x${SIDE}" "$TMP/tight.png"

# Rounded square with transparent corners
rounded() { # size out
  local s=$1 r=$(( $1 * 22 / 100 ))
  magick "$TMP/full.png" -resize "${s}x${s}" \
    \( -size "${s}x${s}" xc:none -fill white -draw "roundrectangle 0,0,$(( s - 1 )),$(( s - 1 )),$r,$r" \) \
    -compose DstIn -composite "$2"
}
# Content scaled to a share of a flat background tile
padded() { # size share% out
  local inner=$(( $1 * $2 / 100 ))
  magick -size "${1}x${1}" "xc:$BG" \( "$TMP/tight.png" -resize "${inner}x${inner}" \) \
    -gravity center -composite "$3"
}

# Web
rounded 192 www/icon-192.png
rounded 512 www/icon-512.png
padded 512 54 www/icon-maskable-512.png   # maskable safe zone is the inner 80% circle
rounded 128 "$TMP/fav.png"
{
  printf '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">\n'
  printf '  <image width="128" height="128" href="data:image/png;base64,%s"/>\n' "$(base64 -w0 "$TMP/fav.png")"
  printf '</svg>\n'
} > www/favicon.svg

# Android: legacy launcher for Android 7, adaptive foreground for 8+
RES=android/app/src/main/res
for d in mdpi:48:108 hdpi:72:162 xhdpi:96:216 xxhdpi:144:324 xxxhdpi:192:432; do
  IFS=: read -r dpi legacy fg <<<"$d"
  mkdir -p "$RES/mipmap-$dpi"
  rounded "$legacy" "$RES/mipmap-$dpi/ic_launcher.png"
  padded "$fg" 58 "$RES/mipmap-$dpi/ic_launcher_foreground.png"   # adaptive safe zone is the inner 66dp of 108dp
done

# Store icons: full square, the store applies its own mask
for lang in en-US fa; do
  magick "$TMP/full.png" -resize 512x512 "fastlane/metadata/android/$lang/images/icon.png"
done

echo "Icons written from $SRC on $BG"
