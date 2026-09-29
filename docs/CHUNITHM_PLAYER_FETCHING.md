# CHUNITHM player fetching reference

Status: investigation and implementation reference. The CHUNITHM JP/International
score source is configured and player surfaces are enabled. Offline parser and
flow checks do not establish successful live end-to-end application fetching. Catalog ingestion is separate;
see [CHUNITHM_CATALOG.md](CHUNITHM_CATALOG.md).

## Evidence and scope

Separate upstream observations from repository contracts and implementation
recommendations. Do not treat a successful login or a player summary as proof
that all score records are available. Account identifiers, cookie values,
credentials, hidden form values and private raw HTML do not belong here.

The user confirmed these entry URLs and maintenance windows; the canonical
configuration is the `sites` entry of [the CHUNITHM definition](../apps/main/src/lib/games/chunithm/definition.ts).

| Region | Entry URL | Daily maintenance, JST |
| --- | --- | --- |
| International | `https://chunithm-net-eng.com/mobile/` | 04:00–07:00 |
| JP | `https://new.chunithm-net.com/` | 02:00–07:00 |

The maintenance start is inclusive and its end exclusive. CHUNITHM has no CN
configuration. SEGA ID authentication and session cookies are shared concepts
with maimai; authentication endpoints and page parsing still require independent
verification for each region.

## Observed International navigation

Authenticated International navigation was observed during this investigation.
The following describes the actual route sequence; secret values are omitted.
This was a credential-login flow followed by session-cookie use. Independently
starting from a user-supplied `cookie://` token was not tested.

| Step | Request | Observed result |
| --- | --- | --- |
| Entry | `GET https://chunithm-net-eng.com/mobile/` | HTTP 200 with a script redirect to the SEGA gateway |
| Gateway | `GET https://lng-tgk-aime-gw.am-all.net/common_auth/login` | HTTP 200 login form; query parameter names `site_id`, `redirect_url`, `back_url` |
| Credentials | Form `POST /common_auth/login/sid` on the gateway | Inputs `retention` (hidden), `sid` (text), `password` (password); accepted credentials produced HTTP 302 |
| Game exchange | `GET /mobile/?ssid=<session-value>` on the game origin | HTTP 302 to `/mobile/home/` |
| Home | `GET /mobile/home/` | HTTP 200 authenticated home page |

Do not hardcode the session query value or hidden form values. Observe and
follow the gateway form/redirect contract, retaining only the appropriate
origin's cookies. The entry response's script navigation is not an HTTP redirect
and therefore needs explicit interpretation. It is not evidence of a usable
authenticated player page.

Observed game cookie names are `_t`, `userId` and `friendCodeList`. Gateway
cookies include `JSESSIONID`, `clal` and AWS load-balancer cookies. Names alone do
not establish which cookies are required or their lifetimes. Cookie and session
values must not appear in logs, fixtures or this document.
Later home and music-list landing responses also contained `Set-Cookie` headers.
Unchanged cookie names do not prove that values remain unchanged. The shared transport now merges response cookies into the CHUNITHM fetch
session on each same-origin request and redirect; it does not assume the first
exchange's cookie string remains sufficient indefinitely.

The unauthenticated redirect confirmed the public International gateway
configuration: `site_id=chuniex`,
`redirect_url=https://chunithm-net-eng.com/mobile/` and
`back_url=https://chunithm.sega.com/`. These are site configuration, not account
session values.
Observed CHUNITHM credentials were submitted as POST form fields. The shared
International login helper keeps maimai's existing query encoding while the
CHUNITHM configuration selects form-body encoding. This follows the observed
CHUNITHM submission without changing maimai's request contract.

### International home

| Selector | Observed purpose |
| --- | --- |
| `.player_name`, `.player_name_in` | Player name containers |
| `.player_lv` | Player level |
| `.player_rating_num_block` | Rating digit images |
| `.player_overpower_text` | Overpower text |
| `.player_lastplaydate_text` | Last-play text |
| `.player_chara > img` | Character image, observed under game-host `/mobile/img/<asset>.png` |
| `.player_honor_text` | Honor/title text |

Observed navigation links include `/mobile/home/playerData` (without a trailing
slash) and `/mobile/home/playerData/ratingDetailBest/`.
Three `.player_honor_short` containers were present, with only the first
populated through `.player_honor_text > span` in the inspected account. This
proves one populated title, not how to combine multiple equipped titles.

### International player details

`/mobile/home/playerData` exposes `.user_data_play_count` and
`.user_data_current_play_count`, providing distinct total and current-version
play counts. These map directly to `totalPlayCount` and
`currentVersionPlayCount`. The nested value selectors are
`.user_data_play_count > .user_data_text` and
`.user_data_current_play_count > .user_data_text`. Their content is numeric;
trim whitespace, remove comma grouping and validate the entire remaining string
as an integer. No English or Japanese label regex is necessary for these nodes.

### Rating digits and target lists

Rating image filenames observed in `.player_rating_num_block` follow
`/mobile/images/rating/rating_<color>_<two-digit numeral>.png` and
`rating_<color>_comma.png`. Read images in DOM order. A proposed filename
extractor is `/rating_[a-z]+_(\d{2}|comma)\.png$/`; check it against every
observed color before use. `orange` was observed; the full digit/color vocabulary
was not enumerated. Interpreting the two-digit suffix as a digit and `comma` as
the decimal separator is the proposed parsing rule, not independently checked
against a textual rating. Once verified, scale the resulting decimal by 100 for
storage. Do not parse an image URL as a floating-point string or remove the
separator blindly.

| Route | Observed contents |
| --- | --- |
| `/mobile/home/playerData/ratingDetailBest/` | 30 `.musiclist_box` rows in the inspected account |
| `/mobile/home/playerData/ratingDetailRecent/` | Labeled **Current** by `.btn_new_on` and “Music for Rating(Current)” in `.box01_title .text_b.font_small`; one row in the inspected account |
| `/mobile/home/playerData/ratingDetailNext/` | Linked; not yet established as a fetched parser source |

The route name `ratingDetailRecent` does **not** imply recent plays or a
recent-10 rating bucket. The current-list capacity is not proven by observing
one row.

Observed target-row selectors are `.music_title` and
`.play_musicdata_highscore > span.text_b` (a comma-grouped integer score).
Difficulty classes observed include `bg_advanced`, `bg_expert` and `bg_master`.
Trim the title without Unicode normalization. For the score text, remove comma
grouping and validate the full remaining integer string before converting.
Rows contain a form with `method="POST"` and action
`/mobile/record/musicGenre/sendMusicDetail/`; hidden field names are `diff`,
`genre`, `idx` and `token`. Submitting an observed row produced HTTP 302 to
`/mobile/record/musicDetail/`. Hidden values are per response and must not be
invented or copied into this reference.

Target pages alone are not established as a complete score source: they have a
limited selection and their combo/chain/clear fields require separate evidence.

Implementation inference: because the selector POST redirects to one shared
detail URL without a record key, keep each selector POST and its resulting GET
paired and sequential within a session until isolation is understood. Do not
copy maimai's concurrent keyed-detail fetching into this flow. A race has not
been experimentally demonstrated, and complete list pages may remove the need
to fetch per-song details at all.

### International score-list navigation

The parent of `.difficulty_btn_record` has an `onclick` handler calling
`search('Basic'|'Advanced'|'Expert'|'Master'|'Ultima', this)`. These exact strings
are navigation arguments, distinct from numeric canonical difficulty codes.

Observed genre values:

| Value | Label |
| --- | --- |
| `99` | All |
| `0` | POP |
| `2` | niconico |
| `3` | Touhou |
| `6` | VARIETY |
| `7` | Irodori |
| `9` | Gekimai |
| `5` | Original |

Use the site's observed All filter for complete score collection rather than
assuming genre IDs form a contiguous sequence.

The live inline function was:

```js
function search(diff, obj) {
  var form = $(obj).parents('form');
  form.attr('action', 'https://chunithm-net-eng.com/mobile/record/musicGenre/send' + diff);
  form.submit();
}
```

This confirms a form POST to `/mobile/record/musicGenre/sendBasic`,
`sendAdvanced`, `sendExpert`, `sendMaster` or `sendUltima`, preserving the
original `genre` and hidden `token` fields. Select `genre=99` for All. There is no
`diff` query parameter in this observed handler.

A follow-up International check verified that both the genre landing page and
the Basic result page use `form[method=post]` with `action=""`, a
`select[name=genre]`, and a hidden `token`. The script supplies the action only
when a difficulty is selected. Read the hidden fields from that genre form;
do not require a nonempty action as detail-selector forms do.

The Expert action was subsequently verified live: POST
`/mobile/record/musicGenre/sendExpert` with `genre=99` and the form's hidden
`token` returned HTTP 302 to `/mobile/record/musicGenre/expert`, then HTTP 200.
The other difficulty actions are confirmed by the inline handler but were not
submitted during this investigation.

| Selector within `.musiclist_box.bg_expert` | Observed meaning |
| --- | --- |
| `.music_title` | Public song title |
| Hidden inputs `idx`, `genre`, `diff`, `token` | Existing detail-selection fields |
| `.play_musicdata_highscore > span.text_b` | Comma-grouped integer score, present only on observed played rows |
| `.play_musicdata_icon.clearfix img` | Played-row status/grade images |

Unplayed rows have a title and hidden fields but **no high-score element**. Skip
them when collecting played scores; do not turn a missing score into zero. None
of the observed played rows displayed zero, so zero-score semantics remain
unverified. Distinguish an absent score in a recognized row from an unexpected
page with no recognized rows at all.
Skip by element absence, not a falsy numeric check such as `!scoreValue`; an
explicit numeric zero must not be mistaken for a missing element.

Observed image basenames were `icon_clear.png` and `icon_rank_4.png` through
`icon_rank_11.png`. `icon_clear.png` maps to the existing CLEAR code; rank images
are grade indicators, not combo or chain lamps. FC/AJ/AJC/chain and advanced
clear-lamp filenames were not observed and must not be guessed.

The inspected All-genre Expert response had no pager/pagination elements or
next/page anchors. This is evidence for that response only; it does not establish
pagination or completeness for other difficulty/category combinations.

### International recent-play list

`GET /mobile/record/playlog` returned HTTP 200 with `.frame02.w400` record rows.
The observed row count is not proof of page capacity or pagination behavior.

| Selector within a row | Observed shape | Extraction |
| --- | --- | --- |
| `.play_datalist_date` | `YYYY/MM/DD HH:mm`, no printed timezone | Validate `/^(\d{4})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2})$/`; construct a date with an explicit timezone |
| `.play_track_text` | `TRACK <integer>` | `/^TRACK\s+(\d+)$/` after trimming |
| `.play_track_result img` | Difficulty image; `musiclevel_expert.png` observed | Match the basename, then use an explicit difficulty dictionary |
| `.play_musicdata_title` | Song title | Trim without blind Unicode normalization |
| `.play_musicdata_score_text` | Comma-grouped integer | Remove grouping, validate `/^\d+$/`, then convert |
| `.play_musicdata_icon img` | `icon_clear.png`, `icon_rank_5.png` observed | Distinguish clear lamp from score rank; full vocabulary remains unverified |
| Score-new marker | `icon_new.png` observed | Presentation marker, not combo/clear status |

The numeric/date regexes above are proposed full-string parsers for the observed
formats, not existing implementation. The timestamp itself does not print a
timezone: JST is the intended repository interpretation, not something proved
by the markup. Avoid host-local `new Date(unqualifiedText)` parsing.

Each row has a POST detail-selector form with field names `idx` and `token`.
Its action is `/mobile/record/playlog/sendPlaylogDetail/`; following it produced
HTTP 302 to `/mobile/record/playlogDetail/`, then HTTP 200. As with song
details, keep selector submission and detail reading paired until session
selection behavior is understood.

### International recent details

| Selector | Observed value |
| --- | --- |
| `.play_data_detail_maxcombo_block.font_large` | Integer max combo |
| `.play_data_detail_judge_text.text_critical` | Comma-grouped critical count |
| `.play_data_detail_judge_text.text_justice` | Comma-grouped justice count |
| `.play_data_detail_judge_text.text_attack` | Comma-grouped attack count |
| `.play_data_detail_judge_text.text_miss` | Comma-grouped miss count |
| `.play_data_detail_notes_text.text_tap_red` | Tap percentage |
| `.play_data_detail_notes_text.text_hold_yellow` | Hold percentage |
| `.play_data_detail_notes_text.text_slide_blue` | Slide percentage |
| `.play_data_detail_notes_text.text_air_green` | Air percentage |
| `.play_data_detail_notes_text.text_flick_skyblue` | Flick percentage |

The note-category figures are **percentages, not note counts**, and an observed
percentage exceeded 100. Do not clamp to 100 or coerce these values into maimai
note-count fields. A proposed percentage parser is `/^(\d+(?:\.\d+)?)%$/`
after trimming; preserve them as optional CHUNITHM recent metadata. Judgment
counts and max combo use integer parsing instead.

### International song details

`/mobile/record/musicDetail/` contains `.play_musicdata_title` and
`.play_musicdata_artist`. Within `.music_box.bg_expert`,
`.musicdata_score_num > .text_b` appears in multiple rows. Use the associated
`.musicdata_score_title` label to distinguish `HIGH SCORE：` from `Play Count：`
rather than taking the first numeric element. The observed play-count text
appends `times`; a proposed extractor is `/^([\d,]+)\s*times$/`, followed by
comma removal and integer validation. Difficulty variants beyond the observed
box class require verification.

FC, AJ and chain icon variants were not observed. Their filenames must not be
invented from the repository's canonical code names.

## Observed JP login and pre-subscription access

| Step | Request | Observed result |
| --- | --- | --- |
| Entry | `GET https://new.chunithm-net.com/` | HTTP 200 login form |
| Credentials | Form `POST /chuni-mobile/html/mobile/submit/` | Fields `segaId`, `password`, `save_cookie` (checkbox), `token` (hidden); successful submission produced HTTP 302 to the card list |
| Card list | `GET /chuni-mobile/html/mobile/aimeList/` | HTTP 200 with card-selection form |
| Card selection form | `POST /chuni-mobile/html/mobile/aimeList/submit/` | Hidden fields `idx`, `token`; this is the observed form contract, not maimai's GET selection URL |

Use the displayed form and its current hidden values. The existing maimai JP
helper's GET selection with `idx=0` is not a verified CHUNITHM equivalent. A
successful credential exchange does not establish subscription entitlement or
access to player records.

Before subscription, the authenticated home page and
`/chuni-mobile/html/mobile/home/playerData` both returned HTTP 200 after card
selection. The observed
rating-best link instead returned HTTP 302 to
`/chuni-mobile/html/mobile/rightLimit/`, which returned HTTP 200. This proves the
tested account was authenticated while that records surface was unavailable.

The pre-subscription JP observations differed by endpoint (paths are relative to
`/chuni-mobile/html/mobile/`):

| Route | Observed access for the unsubscribed account |
| --- | --- |
| `home/` | HTTP 200 authenticated home |
| `home/playerData` | HTTP 200 profile |
| `record/` | HTTP 200 map/progression overview |
| `record/musicGenre` | HTTP 302 to `rightLimit/`; full music records gated |
| `record/playlog` | HTTP 200 recent-play list, 18 `.frame02` rows in this observation, with normal detail forms |
| `home/playerData/ratingDetailBest/` | HTTP 302 to `rightLimit/` |

The 18 rows are an observation, not a proven pagination limit. The record
overview returning 200 does not establish access to the full score catalog.

## Observed JP access with an active subscription

After the user purchased the JP subscription, the same authenticated account
could open the rating-best page with HTTP 200 instead of being redirected to
`rightLimit/`. These observations supplement the historical unpaid evidence;
they do not replace subscription-denial detection. The paid JP pass used one
credential session and 26 requests, including five authentication requests;
this was an exploratory sequence, not a production fetch budget. Paid-page HTML
was inspected in memory and was not retained as fixtures.

Unless stated otherwise, JP paths below are relative to
`https://new.chunithm-net.com/chuni-mobile/html/mobile/`.

### JP rating targets

`GET home/playerData/ratingDetailBest/` exposes the same target-row structure as
International: `.musiclist_box` with difficulty classes such as `bg_expert` and
`bg_master`, `.music_title`, and `.play_musicdata_highscore > span.text_b`.
Detail selection uses POST `record/musicGenre/sendMusicDetail/` with form fields
`diff`, `genre`, `idx` and `token`.

The title `.box01_title` is `レーティング対象曲(ベスト)`. The explanatory
`.font_x-small.mb_10` text explicitly states:

> 最新バージョンの楽曲を除くプレイ可能な楽曲の内、スコアによるレーティング値が高い順に30曲が表示されます。

This establishes an older-version best-30 selection from playable songs; a
particular account need not have 30 rows. Do not infer capacity from its row
count.

`GET home/playerData/ratingDetailRecent/` returned HTTP 200 and is titled
`レーティング対象曲(新曲)` in `.box01_title`. Its `.font_x-small.mb_10` explains:

> 最新バージョンの楽曲の内、スコアによるレーティング値が高い順に20曲が表示されます。

The JP page therefore confirms current-version best 20 alongside older-version
best 30. The `Recent` route segment means this new-song rating selection, not
play history. This agrees with the repository's existing ranking buckets.

### JP score lists and song details

`GET record/musicGenre` returned HTTP 200 after subscription. The landing page
contains navigation rather than score rows; that absence must not be classified
as an empty account. Its search handler and buttons use the same five
`sendBasic`, `sendAdvanced`, `sendExpert`, `sendMaster` and `sendUltima` POST
actions as International, with `genre=99` and the page's hidden `token`.
All five actions were submitted and returned HTTP 302 to the respective
`record/musicGenre/basic`, `advanced`, `expert`, `master` and `ultima` routes,
then HTTP 200. Each request used the current page's form token.

| Navigation argument | List-row selector | Played-row verification |
| --- | --- | --- |
| `Basic` | `.musiclist_box.bg_basic` | Unplayed-row shape observed |
| `Advanced` | `.musiclist_box.bg_advanced` | Unplayed-row shape observed |
| `Expert` | `.musiclist_box.bg_expert` | Played and unplayed rows observed |
| `Master` | `.musiclist_box.bg_master` | Played and unplayed rows observed |
| `Ultima` | `.musiclist_box.bg_ultima` | Unplayed-row shape observed |

Played Expert/Master rows expose `.play_musicdata_highscore > span.text_b` and
`.play_musicdata_icon.clearfix img`. Unplayed rows retain titles and hidden
detail-selection fields but lack the high-score element, matching the
International skip rule. The ULTIMA navigation button uses `btn_ultimate` or
`btn_ultimate_on`, despite `Ultima` in the action and `bg_ultima` on rows; do not
derive all three from one spelling.

No pager classes or pagination/page links were found in the returned list
classes/links; Basic and ULTIMA also received explicit pagination-selector
checks. These are observations of the inspected All-filter responses, not a
guarantee about every future page or filter.

Submitting an observed song row redirected with HTTP 302 to the shared
`record/musicDetail/` URL, then returned HTTP 200. Scope detail values to
`.music_box.bg_expert` (or the observed difficulty variant), pairing
`.musicdata_score_title` with `.musicdata_score_num > .text_b`:

| Field | JP label | International label |
| --- | --- | --- |
| High score | `HIGH SCORE：` | `HIGH SCORE：` |
| Play count | `プレイ回数：` | `Play Count：` |

The JP play-count value ends with `回`, unlike International's `times`.
A proposed full-value extractor after trimming is `/^([\d,]+)回$/`; remove comma
grouping from the capture before integer conversion. This unit belongs to the
song-detail value, not the profile counts below.

Reopening `record/musicDetail/` after visiting other pages returned the same
previously selected song/difficulty. This reinforces that the shared detail URL
retains session selection; keep each selection POST and its detail GET paired
and sequential. The investigation did not deliberately create a concurrent
selection race.

### JP profile and recent plays

`GET home/playerData` returned HTTP 200 with the same profile selectors as
International: `.player_name_in`, `.player_rating_num_block`,
`.player_honor_text` and `.player_chara`. Both
`.user_data_play_count > .user_data_text` and
`.user_data_current_play_count > .user_data_text` are present, so total and
current-version counts can remain separate. Both profile values are plain
numbers without `回`; use the integer extraction described for International,
not the song-detail suffix regex. Rating images use the same filename pattern,
with `orange` observed. No independent textual rating comparison was available,
so the digit-to-rating interpretation remains a parsing proposal.

`GET record/playlog` returned HTTP 200 with the same `.frame02.w400` rows and
date, track, title, score and icon selectors listed in the International section.
The inspected recent list contained `musiclevel_master.png`,
`musiclevel_expert.png` and an actual played-record `icon_fullcombo.png`.
The existing date/track/integer parsing proposals apply to those observed shapes;
JST remains the intended interpretation rather than a timezone printed by the
page.

A representative POST to `record/playlog/sendPlaylogDetail/` using the row's
`idx` and `token` returned HTTP 302 to `record/playlogDetail/`, then HTTP 200.
The detail page uses the same `.play_data_detail_maxcombo_block.font_large`,
`.play_data_detail_judge_text.text_critical`, `.text_justice`, `.text_attack`
and `.text_miss` selectors. Scope each short class to
`.play_data_detail_judge_text` when extracting counts.

The five `.play_data_detail_notes_text` variants are also shared:
`text_tap_red`, `text_hold_yellow`, `text_slide_blue`, `text_air_green` and
`text_flick_skyblue`. Their values end with `%`; they are percentages, not note
counts. This supports shared JP/International CHUNITHM record parsers with
region-specific labels where necessary, separate from maimai's judgment schema.

### JP icon vocabulary

The paid score page's `.score_list` aggregate summary contains these asset
basenames. This establishes that the assets exist in the page, not that every
status was observed on an individual played-song row. `icon_fullcombo.png` was
also observed in the recent-play list, as noted above.

| Family | Observed basenames |
| --- | --- |
| Clear | `icon_clear.png`, `icon_hard.png`, `icon_brave.png`, `icon_absolute.png`, `icon_catastrophy.png` |
| Combo | `icon_fullcombo.png`, `icon_alljustice.png`, `icon_alljusticecritical.png` |
| Chain | `icon_fullchain.png`, `icon_fullchain2.png` |
| Score rank | `icon_rank_8.png` through `icon_rank_13.png` |

Preserve the upstream spelling `catastrophy` when matching the filename; the
repository's canonical status is CATASTROPHY. The two chain images had no alt
labels in the inspected summary. Subsequent public importer research establishes
`icon_fullchain2.png` as the lower chain status and `icon_fullchain.png` as the
higher status: [performai-api's parser](https://github.com/rezaa-cmV6YWE/performai-api/blob/main/src/lib/games/chunithm/parser/rating.ts)
maps them to `fch` and `fch+`, while an
[independent importer](https://github.com/leomotors/chunithm-net-scraper/blob/main/src/steps/vendor/qman.ts)
maps them to `1` and `2`. The implementation uses canonical sync codes `1`
(FULL CHAIN) and `2` (FULL CHAIN AJ), respectively. This is corroborated importer
evidence, not an official label captured from the authenticated page.

## Requests, pagination and unverified cases

Observed detail navigation costs a selector POST followed by a redirected GET
per song or recent play. Read the resulting page before selecting another
record on the same session. Authentication and its gateway redirects are
separate from data-page request counts.

A conditional collection estimate is one profile page, one score-list form
bootstrap, five difficulty POSTs and one recent-list page: eight page/form
requests after authentication, plus an optional icon request. The verified
Expert POST redirects to a GET; if all five follow that pattern, the total is
13 page/form requests. This is a planning estimate, not a measured complete-fetch
total. All five redirects were verified for paid JP; only Expert was submitted
for International. Optional Best and Current target pages add two requests. Each
selected recent-detail page adds two observed requests. Do not fetch every song detail unless required fields
are absent from the eventually verified list.

For International, difficulty POSTs other than Expert remain untested. For JP,
all five standard difficulty POSTs were verified, but played Basic, Advanced or
ULTIMA rows and a completely empty account were not observed. Pagination across
other accounts remains unverified. JP aggregate summary icons establish additional
asset names, but not every individual-row status. Chain mapping is supported by
the public importer evidence above, rather than an observed account with both
variants.
Rating-target row counts do not establish limits for full scores or recents. No session was
deliberately expired and no maintenance response was observed during this
investigation; actual auth-expiry and maintenance-page selectors/messages must
be captured before implementing their response classifiers.

## Normalized data contract

These are existing repository contracts, not statements about fields observed
on the upstream pages. The provider returns
[`GameFetchResult`](../apps/main/src/server/services/games/types.ts).

| Field | CHUNITHM representation |
| --- | --- |
| `player.displayName` | Upstream player name |
| `player.rating` | Decimal rating multiplied by 100; presentation divides by 100 |
| `player.title`, `titleType`, `iconUrl` | Required; only title type `0` (normal) is currently defined for CHUNITHM |
| `player.totalPlayCount`, `currentVersionPlayCount` | Both required; do not substitute one for the other without evidence |
| `score.chart` | Game `chunithm`, requested region, `ctx.gameVersion`, song name, chart type `0`, and canonical difficulty |
| `score.scoreValue` | Raw integer score, not maimai's scaled achievement percentage |
| `score.secondaryScore` | `0`; CHUNITHM has no DX score |
| `recent.playedAt` | A `Date` interpreting the upstream local timestamp in JST |
| `recent.track` | Optional if actually present |
| `recent.maxDxScore` | Omitted |
| `recent.details` | CHUNITHM judgments can use generic recent metadata |

Only `NormalizedRecent` carries `details`, stored in
`user_recent_songs.metadata`. The maimai detailed judgment table's
tap/hold/slide/touch/break matrix is not a CHUNITHM schema. Missing required
player fields remain an integration question, not permission to fabricate zeros
or placeholder profile data.

Canonical codes live in
[`codes.ts`](../packages/games/src/codes.ts). The following is the
repository vocabulary; mapping upstream images to it requires observed icon
filenames or page labels.

| Kind | Codes |
| --- | --- |
| Difficulty | `0` BASIC, `1` ADVANCED, `2` EXPERT, `3` MASTER, `4` ULTIMA |
| Combo | `0` none, `1` FC, `2` AJ, `3` AJC |
| Sync | `0` none, `1` FULL CHAIN, `2` FULL CHAIN AJ |
| Clear | `0` none, `1` CLEAR, `2` HARD, `3` BRAVE, `4` ABSOLUTE, `5` CATASTROPHY |

WORLD'S END remains deferred; difficulty code `5` being reserved does not enable
its ingestion. Numeric scaling and status mapping must remain game-specific.

### Chart matching, versions and rankings

[`score-storage.ts`](../apps/main/src/server/services/games/score-storage.ts)
scopes charts by game, region and captured `ctx.gameVersion`, then matches exact
`songName|difficulty|chartType`. Ambiguous matches are skipped. Upstream numeric
IDs are not used for this matching, even though the catalog retains its source
ID in `metadata.otogeDb.id`. The otoge-db catalog keeps the source title without
NFKC normalization; do not copy maimai's name normalization without comparing
actual titles from both CHUNITHM sources.

Chart constants and `addedVersion` come from the catalog, not the player's
displayed level. Capture the region's current version once for the fetch.
Existing ranking logic selects the current-version best 20 and older best 30
from resolved scores; the official profile supplies the player rating. A rating
target page can provide consistency or hidden-chart evidence, but generic
persistence does not require it. No recent-10 rating bucket currently exists.
If upstream data contradicts this model, resolve that difference explicitly.

Player names have a database limit of 16 characters. Recent deduplication uses
`(userId, game, songId, playedAt)`, not an upstream recent-record ID. These limits
need to be checked against real observations before enabling the provider.
Recent `chart.version` must also equal captured `ctx.gameVersion` for current
persistence. Keep `playedAt` as the actual JST timestamp; deriving the chart
version from that timestamp would cause historical-version recents to be
skipped. Cross-version recent history remains an explicit unresolved edge case.

## Failure handling and preservation

The following user-reported messages were also observed on the JP
`/chuni-mobile/html/mobile/rightLimit/` response:

- `利用権が必要です。`
- `利用権が無いため、サービスをご利用いただけません。`
- `ゲキチュウマイ-NET利用権を購入することで、サービスを利用できます。`

Observed gate-page classes are `.riyouken_block00`, `.riyouken_attention`,
`.riyouken_what` and `.btn_standard_charge`. The rating-best request redirected
to this page after authenticated home/profile requests succeeded. No purchase
link was visited.

| Gate selector | Observed content |
| --- | --- |
| `.riyouken_block00 > .riyouken_attention` | `利用権が必要です。` |
| `.riyouken_block00 .text_l p` (first paragraph) | `利用権が無いため、サービスをご利用いただけません。` |
| `p.mb_30` | Purchase-explanation clause above, with a `<br>` separating text |
| `.riyouken_what_img img` | Image source ending in `/images/unpaid_info.png` |

Recommended detection: retain the final response URL and inspect normalized
text inside the observed gate containers. Classify the known JP `rightLimit/`
page with these subscription messages as `subscription required`; the classes
and message pair provide stronger evidence than the URL alone. For whitespace
normalization, `.text().replace(/\s+/g, " ").trim()` is a starting point;
match the distinctive complete Japanese clauses, not merely `利用権`, which may
also occur in ordinary navigation. If presentation splits a clause across text
nodes, compare a whitespace-stripped variant of that clause. The implemented classifier matches both complete clauses within
`.riyouken_block00` after removing whitespace; the URL remains useful context
rather than sufficient evidence by itself.

Historical pre-subscription scope: the JP account could reach home, profile,
the record overview and recent-play list. Its rating-best and full-music-record
routes were gated. Do not infer that all JP records are unavailable; equally,
accessible recents cannot stand in for complete best scores. Other account types and
International records must be evaluated separately.

A subscription denial means record access is unavailable, not that the account
has zero scores. Detection must inspect the actual error content before looking
for score rows. A status code, a route, missing rows, or a purchase link alone is
insufficient to establish subscription denial. Conversely, do not classify all
HTTP 200 pages as successfully fetched records.

The provider fails the affected JP fetch before returning its normalized
result. It preserves the saved account token and existing snapshots rather than
returning an empty successful result or requesting credential replacement. A suitable message is: “Fetching complete CHUNITHM JP scores requires an active
ゲキチュウマイ-NET subscription. Your existing data has not been changed.”
This is an access condition, distinct from incorrect credentials, an expired
session, maintenance, an unexpected page shape, or a verified empty-record page.
It must not disable International fetching.

Existing propagation boundaries:

- [`score-ingestion.ts`](../apps/main/src/server/services/games/score-ingestion.ts)
  persists the provider result only after fetching succeeds. An asynchronous
  provider error marks the session failed and stores its message instead.
- [`useFetchSession.ts`](../apps/main/src/hooks/useFetchSession.ts) invokes the
  completion refresh only on success. Token-pattern errors can reopen login UI;
  subscription errors do not match those patterns.
- [`fetch-toast.tsx`](../apps/main/src/components/fetch-toast.tsx) already displays
  the failed session's error message and provides localized subscription recovery
  instructions for `SUBSCRIPTION_REQUIRED`.
- If subscription denial is detected before session creation, add an explicit
  error mapping in both REST and tRPC. A plain unknown error currently becomes
  a generic server error. A precondition response is preferable to a credential
  error or a silent empty success.

Scheduled maintenance uses the shared
[`maintenance.ts`](../apps/main/src/lib/games/maintenance.ts) policy before token
or provider work. An upstream maintenance page outside that schedule still
needs its own observed response classifier. Do not infer expired authentication
from subscription text or infer maintenance from missing record elements.

## Implementation boundaries

| Concern | Existing owner / intended use |
| --- | --- |
| Game and region entry URLs | `sites` in [`lib/games/chunithm/definition.ts`](../apps/main/src/lib/games/chunithm/definition.ts), read through [`lib/games/sites.ts`](../apps/main/src/lib/games/sites.ts) |
| HTTP, cookies, redirects | [`games/sega/http.ts`](../apps/main/src/server/services/games/sega/http.ts) |
| Shared SEGA token/login mechanics | [`games/sega/login.ts`](../apps/main/src/server/services/games/sega/login.ts) |
| Verified maimai login configuration, reference only | [`games/maimai/login-config.ts`](../apps/main/src/server/services/games/maimai/login-config.ts) |
| Game/user/region token storage | [`games/tokens.ts`](../apps/main/src/server/services/games/tokens.ts) |
| Session lifecycle and persistence | [`games/score-ingestion.ts`](../apps/main/src/server/services/games/score-ingestion.ts) |
| Future CHUNITHM response interpretation | Game-specific provider/parser; do not put CHUNITHM selectors into shared SEGA transport |

Preserve maimai's specialized CN formats and existing schedules. Fetch
progress now selects each game's stages; CHUNITHM uses BASIC through ULTIMA and
recents without maimai-only album, hidden-song, Re:MASTER or UTAGE stages. The
stages describe completed work, not the raw HTTP request count. Shared
session-level pending/completed/failed behavior is retained.

The existing maimai split in
[`player/`](../apps/main/src/server/services/games/maimai/scores/player/),
[`songs/`](../apps/main/src/server/services/games/maimai/scores/songs/) and
[`recents/`](../apps/main/src/server/services/games/maimai/scores/recents/) is a structural reference for
small fetch/parse modules and a CHUNITHM orchestrator. Shared admission, rate
limits, the provider deadline, captured game version and atomic persistence
already exist. Do not introduce a parallel persistence pipeline or reuse
maimai's album/events extras by default.

### Current implementation

The configured [CHUNITHM pipeline](../apps/main/src/server/services/games/chunithm/scores/pipeline.ts)
uses region-specific login configuration and
[shared CHUNITHM parsers](../apps/main/src/server/services/games/chunithm/scores/parsers.ts)
for profile, the five standard difficulty lists, and recent plays/details.
Authenticated profile images reuse the existing content-addressed hosting
pipeline. A complete normalized result reaches shared game-scoped persistence
only after the fetch succeeds.

The shared SEGA credential dialog serves CHUNITHM JP; International also
supports the shared gateway cookie wizard described below. The JP subscription check
returns `SUBSCRIPTION_REQUIRED` and the fetch toast localizes recovery
instructions under `fetchToast.errors.subscriptionRequired`. This condition does
not trigger credential replacement or a successful snapshot refresh.

No application fetch against a live account was run as part of implementation.
The earlier authenticated investigation verified page shapes and navigation;
the implementation's offline checks verify parsing and integration separately.
WORLD'S END and maimai-specific albums/events remain outside this provider.

A positively identified empty-history response and WORLD'S END recent-play
markup have not been verified. A recent page with no recognized records, or a
record with an unsupported difficulty, currently fails the whole fetch rather
than silently omitting data. This includes WORLD'S END history until a reliable
row identifier allows it to be excluded. Prior snapshots, recent history and
stored authentication remain intact; no partial snapshot is saved.

## International cookie login support

The frontend now exposes the existing shared SEGA gateway cookie wizard for
CHUNITHM International. Its first login link uses the configured CHUNITHM entry
URL; its OTP/bookmarklet step uses the same neutral `/common_auth/` gateway
landing as maimai. The signed authorization binds the tomomai user and game,
and the server exchanges `clal` using CHUNITHM's `site_id=chuniex` configuration.
JP continues to require account credentials.

Manual `clal=` input and the `/sega-cookie-extractor.user.js` download
remain supported. The old `/maimai-cookie-extractor.user.js` path serves the
same script, whose update URL moves installed copies to the new path. That
download is a shared SEGA gateway clipboard helper, independent of the
experimental OAuth userscript package. It copies only after a user click and
no longer writes cookie values to console logs or alerts.

The credential login and resulting game session were observed during R&D;
independent browser-cookie import, bookmarklet fragment retention and gateway
cookie visibility have not yet been verified live for CHUNITHM. Offline tests
cover the cookie exchange, game binding, expiry and cross-game redirect refusal.
Both browser helpers use `document.cookie`: they require a JavaScript-readable
`clal` on the gateway origin and cannot read HttpOnly cookies or gateway cookies
from the CHUNITHM game origin. A copied cookie may expire; account credentials
remain an alternative and the helpers do not promise indefinite sessions.
