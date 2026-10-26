#!/usr/bin/env bash
# Posts releases to the Telegram channel (#258, #263).
#
#   tools/telegram-post.sh v0.5.2        one release
#   tools/telegram-post.sh --history     every release, oldest first
#   tools/telegram-post.sh --delete <message-id>
#   tools/telegram-post.sh --edit <message-id> v0.5.2   rewrite a release's post in place
#   tools/telegram-post.sh --set-photo   channel photo = www/icon-512.png
#   tools/telegram-post.sh --bot-photo   the bot's photo = tools/telegram-bot-photo.jpg
#
# Everything about a release is read from git at its tag (version, changelog,
# date, games added since the previous release), so it runs from any checkout
# with the tags fetched. A release that added games goes out as an album with a
# picture of each new game (tools/game-shots.sh), the post itself follows with
# its links as buttons. Needs TELEGRAM_BOT_TOKEN.
# DRY_RUN=1 prints what would be sent and sends nothing.
# Exit 0: done. 1: Telegram refused. 2: cannot post (bad tag, no changelog, no token).
set -euo pipefail
cd "$(dirname "$0")/.."

CHANNEL="${TELEGRAM_CHANNEL:-@chogan_games}"
# Overridable only so the test can point the real curl at a local server
API="${TELEGRAM_API:-https://api.telegram.org}"
DRY="${DRY_RUN:-0}"
SHOTS="${SHOTS_DIR:-$(mktemp -d)}"

releases() { git tag -l 'v*' --sort=v:refname | grep -v -- '-test$' || true; }
prev_of() { releases | awk -v t="$1" '$0 == t { print p; exit } { p = $0 }'; }
field() { git show "$1:www/version.js" | sed -n "s/^self\.$2 *= *'\{0,1\}\([^';]*\)'\{0,1\};.*/\1/p"; }
game_ids() { git show "$1:www/games.json" | python3 -c 'import json,sys; d=json.load(sys.stdin); d=d["games"] if isinstance(d,dict) else d; print("\n".join(g["id"] for g in d))'; }
game_name() { git show "$1:www/games.json" | python3 -c 'import json,sys; d=json.load(sys.stdin); d=d["games"] if isinstance(d,dict) else d; print({g["id"]: g["name"]["en"] for g in d}[sys.argv[1]].replace("­",""))' "$2"; }
# Games in this release that the previous one did not have; the first release introduces all of them
new_games() {
  local prev; prev=$(prev_of "$1")
  if [ -z "$prev" ]; then game_ids "$1"; else comm -13 <(game_ids "$prev" | sort) <(game_ids "$1" | sort); fi
}

api() {  # api <method> [curl args...]; prints Telegram's JSON, never the token
  local method="$1"; shift
  local r
  for attempt in 1 2 3; do
    local rc=0
    r=$(curl -s --max-time 120 "$API/bot${TELEGRAM_BOT_TOKEN}/$method" "$@") || rc=$?
    # curl's own failure, e.g. 26 when a -F value starting with @ was read as a file (#267)
    [ "$rc" -eq 0 ] || r="{\"ok\":false,\"description\":\"curl failed with exit code $rc\"}"
    # Channels take about 20 posts a minute; on 429 wait as long as Telegram asks
    local wait; wait=$(printf '%s' "$r" | sed -n 's/.*"retry_after":\([0-9]*\).*/\1/p')
    if [ -n "$wait" ]; then sleep $((wait + 1)); continue; fi
    break
  done
  printf '%s' "$r"
}
check() {  # check <what> <json>
  if printf '%s' "$2" | grep -q '"ok":true'; then return 0; fi
  echo "Telegram refused $1: $(printf '%s' "$2" | sed -n 's/.*"description":"\([^"]*\)".*/\1/p')" >&2
  exit 1
}

text_for() {
  local tag="$1" version code file day
  version=$(field "$tag" APP_VERSION); code=$(field "$tag" APP_VERSION_CODE)
  # The checked-out changelog wins over the tag's: old releases were rewritten
  # into sections afterwards (#265), and a new tag carries its own file anyway
  file="fastlane/metadata/android/en-US/changelogs/$code.txt"
  if [ ! -f "$file" ]; then
    file=$(mktemp)
    git show "$tag:fastlane/metadata/android/en-US/changelogs/$code.txt" > "$file" 2>/dev/null \
      || { echo "No English changelog for $tag (version code $code)" >&2; exit 2; }
  fi
  day=$(LC_ALL=C date -u -d "$(git log -1 --format=%cI "$tag")" '+%-d %B %Y')
  # HTML for bold headings; the formatter escapes the changelog text
  printf '%s\n\n%s' "<b>Chogan $version</b> · $day" "$(python3 tools/release-notes.py --html "$file")"
}
# The links are buttons under the post (owner's wish); an album cannot carry
# buttons, so a release with new games sends its pictures first and this after
# The cover is GitHub's own card for the release (version, changelog, org
# avatar), shown large above the text as the link preview (owner's wish)
cover_for() {
  printf '%s' "{\"url\":\"https://github.com/choganhq/chogan/releases/tag/$1\",\"prefer_large_media\":true,\"show_above_text\":true}"
}
buttons_for() {
  printf '%s' "{\"inline_keyboard\":[[{\"text\":\"Play in the browser\",\"url\":\"https://choganhq.github.io/chogan/\"}],[{\"text\":\"Android APK\",\"url\":\"https://github.com/choganhq/chogan/releases/tag/$1\"},{\"text\":\"F-Droid\",\"url\":\"https://f-droid.org/packages/io.github.choganhq.chogan/\"}]]}"
}

post() {
  local tag="$1" text games buttons
  releases | grep -qx -- "$tag" || { echo "No release tag $tag" >&2; exit 2; }
  text=$(text_for "$tag")
  games=$(new_games "$tag")
  buttons=$(buttons_for "$tag")
  if [ "$DRY" = "1" ]; then
    echo "=== $tag to $CHANNEL${games:+ with pictures: $(echo $games)}"
    printf '%s\n' "$text"
    echo "[cover] $(cover_for "$tag")"
    echo "[buttons] $buttons"
    return
  fi
  if [ -n "$games" ]; then
    # shellcheck disable=SC2086
    tools/game-shots.sh "$SHOTS" $games >/dev/null
    local ids=(); mapfile -t ids <<< "$games"
    if [ "${#ids[@]}" -eq 1 ]; then
      # An album needs at least two pictures
      check "$tag" "$(api sendPhoto --form-string "chat_id=$CHANNEL" -F "photo=@$SHOTS/${ids[0]}.png" --form-string "caption=$(game_name "$tag" "${ids[0]}")")"
    else
      # An album takes 2 to 10 pictures, so eleven games go out as 6 + 5, not 10 + 1
      local n=${#ids[@]} i=0 size
      size=$(( (n + (n + 9) / 10 - 1) / ((n + 9) / 10) ))
      while [ "$i" -lt "$n" ]; do
        local media="[" files=() j cap
        for ((j = i; j < i + size && j < n; j++)); do
          cap=$(python3 -c 'import json,sys; print(json.dumps(sys.argv[1]))' "$(game_name "$tag" "${ids[$j]}")")
          [ "$j" -gt "$i" ] && media="$media,"
          media="$media{\"type\":\"photo\",\"media\":\"attach://p$j\",\"caption\":$cap}"
          files+=(-F "p$j=@$SHOTS/${ids[$j]}.png")
        done
        check "$tag" "$(api sendMediaGroup --form-string "chat_id=$CHANNEL" --form-string "media=$media]" "${files[@]}")"
        i=$((i + size))
      done
    fi
  fi
  check "$tag" "$(api sendMessage --data-urlencode "chat_id=$CHANNEL" --data-urlencode "text=$text" \
    --data-urlencode "parse_mode=HTML" --data-urlencode "link_preview_options=$(cover_for "$tag")" \
    --data-urlencode "reply_markup=$buttons")"
  echo "Posted $tag${games:+ with pictures}"
}

if [ "$DRY" != "1" ] && [ -z "${TELEGRAM_BOT_TOKEN:-}" ]; then
  echo "Secret TELEGRAM_BOT_TOKEN is not set. The owner adds it with:" >&2
  echo "  gh secret set TELEGRAM_BOT_TOKEN -R choganhq/chogan" >&2
  exit 2
fi

case "${1:-}" in
  --history)
    [ -n "$(releases)" ] || { echo "No release tags; fetch them first" >&2; exit 2; }
    for t in $(releases); do post "$t"; [ "$DRY" = "1" ] || sleep 4; done ;;
  --edit)
    # Rewrites a release's text post where it stands, without a new notification:
    # older posts gained a contributor's name after the fact (#533), and deleting and
    # reposting would have moved them out of order. Only the text post; an album stays.
    [ -n "${2:-}" ] && [ -n "${3:-}" ] || { echo "Usage: --edit <message-id> <tag>" >&2; exit 2; }
    releases | grep -qx -- "$3" || { echo "No release tag $3" >&2; exit 2; }
    text=$(text_for "$3")
    if [ "$DRY" = "1" ]; then
      echo "=== edit message $2 to $3"
      printf '%s\n' "$text"
      echo "[cover] $(cover_for "$3")"
      echo "[buttons] $(buttons_for "$3")"
      exit 0
    fi
    r=$(api editMessageText --data-urlencode "chat_id=$CHANNEL" --data-urlencode "message_id=$2" --data-urlencode "text=$text" \
      --data-urlencode "parse_mode=HTML" --data-urlencode "link_preview_options=$(cover_for "$3")" \
      --data-urlencode "reply_markup=$(buttons_for "$3")")
    # an unchanged text is not an error: the post already says this
    if printf '%s' "$r" | grep -q 'message is not modified'; then echo "Message $2 already up to date"; exit 0; fi
    check "the edit of $2" "$r"
    echo "Edited message $2 for $3" ;;
  --delete)
    [ -n "${2:-}" ] || { echo "Usage: --delete <message-id>" >&2; exit 2; }
    [ "$DRY" = "1" ] && { echo "Would delete message $2"; exit 0; }
    check "the delete" "$(api deleteMessage --data-urlencode "chat_id=$CHANNEL" --data-urlencode "message_id=$2")"
    echo "Deleted message $2" ;;
  --set-photo)
    [ "$DRY" = "1" ] && { echo "Would set the channel photo to www/icon-512.png"; exit 0; }
    check "the channel photo (the bot needs the 'Change channel info' right)" "$(api setChatPhoto --form-string "chat_id=$CHANNEL" -F "photo=@www/icon-512.png")"
    echo "Channel photo set" ;;
  --bot-photo)
    # The bot's own picture: a static JPG only, so the icon is kept as a JPG with
    # its corners filled, since Telegram crops profile photos to a circle (#269)
    [ "$DRY" = "1" ] && { echo "Would set the bot photo to tools/telegram-bot-photo.jpg"; exit 0; }
    check "the bot photo" "$(api setMyProfilePhoto --form-string 'photo={"type":"static","photo":"attach://pic"}' -F "pic=@tools/telegram-bot-photo.jpg;type=image/jpeg")"
    echo "Bot photo set" ;;
  v*) post "$1" ;;
  *) echo "Usage: tools/telegram-post.sh <tag> | --history | --edit <id> <tag> | --delete <id> | --set-photo | --bot-photo" >&2; exit 2 ;;
esac
