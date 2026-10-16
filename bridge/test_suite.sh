#!/usr/bin/env bash
# End-to-end test suite for the DSIS Archangel local bridge.
# POSTs one sample payload per capture mode and verifies row counts.
set -euo pipefail

BASE="http://127.0.0.1:8010"

# Load DB credentials from bridge/.env (exported env vars take precedence).
if [ -f "$(dirname "$0")/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$(dirname "$0")/.env"
  set +a
fi
: "${ARCHANGEL_DB_HOST:=127.0.0.1}"
: "${ARCHANGEL_DB_PORT:=3306}"
: "${ARCHANGEL_DB_USER:=archangel}"
: "${ARCHANGEL_DB_NAME:=archangel}"

DB="mysql -h $ARCHANGEL_DB_HOST -P $ARCHANGEL_DB_PORT -u $ARCHANGEL_DB_USER -p$ARCHANGEL_DB_PASSWORD $ARCHANGEL_DB_NAME -N -e"
PASS=0; FAIL=0

note() { echo -e "\n\033[1;34m$1\033[0m"; }
ok()   { echo -e "  \033[32mPASS\033[0m $1"; PASS=$((PASS+1)); }
bad()  { echo -e "  \033[31mFAIL\033[0m $1"; FAIL=$((FAIL+1)); }

check() { # check "<desc>" <expected> <actual>
  if [ "$2" = "$3" ]; then ok "$1 ($2)"; else bad "$1 (expected $2, got $3)"; fi
}

# helper: POST a dataupload with the given JSON array
upload() {
  curl -s -X POST "$BASE/archangel/parse/dataupload?sendingPlayerId=4242" \
    --data-urlencode "server=helion" \
    --data-urlencode "data=$1"
}

# NON-DESTRUCTIVE: never TRUNCATE or DELETE any table — the suite must not wipe
# real captured data, even for a clean run. Assertions below either (a) scope a
# COUNT to a unique test key (coords/fleet_id/player_id/...) that can't collide
# with real rows, or (b) are delta-based (baseline count captured here, then
# assert the test added exactly the expected number). Baselines:
CAP_BEFORE=$($DB "SELECT COUNT(*) FROM capture_events")
ERR_BEFORE=$($DB "SELECT COUNT(*) FROM error_log WHERE base_url='helion'")

note "1. storage round-trip (savestorage -> getstorage)"
curl -s -X POST "$BASE/dsisscripts/load/savestorage" \
  --data-urlencode 'data={"PlayerId":4242,"Packets":[{"servid":1,"userId":4242,"storageType":0,"storageKey":"Preferences","storageData":{"Scouting":{"MaxScouts":12},"ConnectionDelay":6000}}]}' >/dev/null
GET=$(curl -s -X POST "$BASE/dsisscripts/load/getstorage" \
  --data-urlencode 'data={"QueryData":[{"StorageKey":"Preferences","ServId":1,"UserId":4242}]}')
echo "$GET" | grep -q '"Key":"Preferences"' && ok "getstorage returns Preferences packet" || bad "getstorage packet"
echo "$GET" | grep -q 'MaxScouts' && ok "packet Data has original JSON" || bad "packet Data JSON"

note "2. dataupload: base"
upload '[{"request":{"mode":"base","coords":"A00:00:00:00","base_id":123,"base_name":"Home","owner_id":4242,"ownerName":"Me","terrain":"Rocky","debris":"0","structures":"Metal Refineries*","wormHole":0,"jumpgate":5,"sendingPlayerId":4242}}]' >/dev/null
N=$($DB "SELECT COUNT(*) FROM bases WHERE coords='A00:00:00:00'")
check "bases row count" 1 "$N"
J=$($DB "SELECT jumpgate FROM bases WHERE coords='A00:00:00:00'")
check "jumpgate captured" 5 "$J"

note "3. dataupload: astro"
upload '[{"request":{"mode":"astro","coord":"A00:00:00:01","baseId":0,"terrain":"Metalic","debris":"0","hasEyes":true,"sendingPlayerId":4242}}]' >/dev/null
N=$($DB "SELECT COUNT(*) FROM astros WHERE coord='A00:00:00:01'")
check "astros row count" 1 "$N"

note "4. dataupload: system (nested astros)"
upload '[{"request":{"mode":"system","system":"A00:00:00","hasEyes":true,"astro0":{"coord":"A00:00:00:01","terrain":"Metalic"},"astro1":{"coord":"A00:00:00:02","terrain":"Rocky"},"sendingPlayerId":4242}}]' >/dev/null
N=$($DB "SELECT COUNT(*) FROM systems WHERE system='A00:00:00'")
check "systems row count" 1 "$N"
N=$($DB "SELECT COUNT(*) FROM system_astros WHERE system='A00:00:00'")
check "system_astros row count" 2 "$N"

note "5. dataupload: fleet"
upload '[{"request":{"mode":"fleet","destination":"A00:00:00:01","fleets":[{"fleetId":777,"fleetname":"Scouts","player_id":4242,"location":"A00:00:00:02","size":"40","hasEyes":true}],"sendingPlayerId":4242}}]' >/dev/null
N=$($DB "SELECT COUNT(*) FROM fleets WHERE fleet_id=777")
check "fleets row count" 1 "$N"
# re-sighting the same fleet (page refresh) must update, not duplicate
upload '[{"request":{"mode":"fleet","destination":"A00:00:00:01","fleets":[{"fleetId":777,"fleetname":"Scouts","player_id":4242,"location":"A00:00:00:03","size":"40","hasEyes":true}],"sendingPlayerId":4242}}]' >/dev/null
N=$($DB "SELECT COUNT(*) FROM fleets WHERE fleet_id=777")
check "fleets re-sighting dedupes" 1 "$N"
L=$($DB "SELECT location FROM fleets WHERE fleet_id=777")
check "fleets re-sighting updates location" "A00:00:00:03" "$L"

note "6. dataupload: fleet_details (top-level key)"
upload '[{"fleet_details":{"fleetId":777,"fleetname":"Scouts","details":[{"unit":"Scout Ship","amt":"40"}]}}]' >/dev/null
N=$($DB "SELECT COUNT(*) FROM fleet_details WHERE fleet_id=777")
check "fleet_details row count" 1 "$N"

note "7. dataupload: combat"
upload '[{"request":{"mode":"combat","location":"A00:00:00:03","att_id":1,"def_id":2,"time":"2026-10-14","debris":"1000","pillage":"50","conquered":0,"sendingPlayerId":4242}}]' >/dev/null
N=$($DB "SELECT COUNT(*) FROM combat_reports WHERE location='A00:00:00:03'")
check "combat_reports row count" 1 "$N"

note "8. dataupload: profile"
upload '[{"request":{"mode":"profile","player_id":99,"player_name":"Enemy","guild_tag":"FOO","level":52.3,"sendingPlayerId":4242}}]' >/dev/null
N=$($DB "SELECT COUNT(*) FROM profiles WHERE player_id=99")
check "profiles row count" 1 "$N"

note "9. dataupload: guild + members"
upload '[{"request":{"mode":"guild","guildId":5,"guildName":"FooBar","guildTag":"FOO","members":[{"playerId":99,"nick":"Enemy","level":52.3}],"sendingPlayerId":4242}}]' >/dev/null
N=$($DB "SELECT COUNT(*) FROM guilds WHERE guild_id=5")
check "guilds row count" 1 "$N"
N=$($DB "SELECT COUNT(*) FROM guild_members WHERE guild_id=5")
check "guild_members row count" 1 "$N"

note "10. dataupload: technology"
upload '[{"request":{"mode":"technology","techs":[{"tech":"Laser","level":"10"},{"tech":"Armour","level":"12"}],"sendingPlayerId":4242}}]' >/dev/null
N=$($DB "SELECT COUNT(*) FROM technologies WHERE user_id=4242 AND tech IN ('Laser','Armour')")
check "technologies row count" 2 "$N"

note "11. dataupload: capacities"
upload '[{"request":{"mode":"capacities","economy":"100","construction":"200","production":"300","research":"400","sendingPlayerId":4242}}]' >/dev/null
N=$($DB "SELECT COUNT(*) FROM capacities WHERE user_id=4242")
check "capacities row count" 1 "$N"

note "12. dataupload: storage packet (bookmark via dataupload)"
upload '[{"servid":1,"userId":4242,"storageType":1,"storageKey":"PersonalBookmarks","storageData":[{"Url":"http://x","Name":"b"}],"LastUpdated":1}]' >/dev/null
N=$($DB "SELECT COUNT(*) FROM storage_packets WHERE storage_key='PersonalBookmarks'")
check "bookmark storage_packet row count" 1 "$N"

note "13. angellog"
curl -s -X POST "$BASE/dsisscripts/load/angellog" \
  --data-urlencode 'data={"servid":1,"userId":4242,"baseUrl":"helion","errorReport":{"ExMessage":"test"}}' >/dev/null
N=$($DB "SELECT COUNT(*) FROM error_log WHERE base_url='helion'")
check "error_log row count (+1)" $((ERR_BEFORE+1)) "$N"

note "14. capture_events lossless log"
N=$($DB "SELECT COUNT(DISTINCT mode) FROM capture_events")
echo "  distinct modes captured: $N"
N=$($DB "SELECT COUNT(*) FROM capture_events")
check "capture_events total rows (+12 = 11 modes + 1 fleet re-sighting)" $((CAP_BEFORE+12)) "$N"

note "15. parse/script query handlers (empty-but-valid)"
R=$(curl -s -X POST "$BASE/archangel/parse/script" --data-urlencode 'data={"request":{"mode":"jg_search","sloc":"A00:00:00:00","dloc":"A00:00:00:05","method":"closest"}}')
echo "$R" | grep -q '"result":"A00:00:00:05"' && ok "jg_search returns dloc" || bad "jg_search: $R"
R=$(curl -s -X POST "$BASE/archangel/parse/script" --data-urlencode 'data={"request":{"mode":"getGates"}}')
echo "$R" | grep -q '"gates"' && ok "getGates returns gates key" || bad "getGates: $R"
R=$(curl -s -X POST "$BASE/archangel/parse/script" --data-urlencode 'data={"request":{"mode":"player_summary"}}')
echo "$R" | grep -q '"tech"' && ok "player_summary returns result" || bad "player_summary: $R"

note "16. getservers"
R=$(curl -s "$BASE/dsisscripts/load/getservers")
echo "$R" | grep -q '"helion"' && ok "getservers has helion" || bad "getservers: $R"

echo -e "\n\033[1mRESULT: $PASS passed, $FAIL failed\033[0m"
[ "$FAIL" -eq 0 ]
