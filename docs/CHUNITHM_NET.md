# CHUNITHM-NET reference

What was observed on CHUNITHM-NET's International and JP sites: page routes, selectors, the subscription gate, how failures are classified, and what the observations do not establish. The code that reads these pages is in [`server/services/games/chunithm/scores/`](../apps/main/src/server/services/games/chunithm/scores/). Each site's origin, mobile root and daily maintenance window are the `sites` entry of [the CHUNITHM definition](../apps/main/src/lib/games/chunithm/definition.ts), and the canonical difficulty and status codes are in [`packages/games/src/codes.ts`](../packages/games/src/codes.ts). Catalog ingestion is separate, see [CHUNITHM_CATALOG.md](CHUNITHM_CATALOG.md).

## Evidence rules

Keep upstream observations apart from repository contracts and recommendations. A successful login or a player summary does not prove that every score record is available. Account identifiers, cookie values, credentials, hidden form values and private raw HTML do not belong here.

Site paths below resolve against the site's mobile root. The maintenance start is inclusive and its end exclusive. CHUNITHM has no China site. SEGA ID authentication and session cookies are shared concepts with maimai, but authentication endpoints and page parsing were verified separately for each region.

## Observed International navigation

This was a credential login followed by session cookie use. Starting from a user-supplied `cookie://` token was not tested.

| Step | Request | Observed result |
| --- | --- | --- |
| Entry | `GET https://chunithm-net-eng.com/mobile/` | HTTP 200 with a script redirect to the SEGA gateway |
| Gateway | `GET https://lng-tgk-aime-gw.am-all.net/common_auth/login` | HTTP 200 login form. Query parameter names `site_id`, `redirect_url`, `back_url` |
| Credentials | Form `POST /common_auth/login/sid` on the gateway | Inputs `retention` (hidden), `sid` (text), `password` (password). Accepted credentials produced HTTP 302 |
| Game exchange | `GET /mobile/?ssid=<session-value>` on the game origin | HTTP 302 to `/mobile/home/` |
| Home | `GET /mobile/home/` | HTTP 200 authenticated home page |

Do not hardcode the session query value or hidden form values. Follow the gateway form and redirect contract, and keep only the appropriate origin's cookies. The entry response's script navigation is not an HTTP redirect, so it needs explicit interpretation, and it is not evidence of a usable authenticated player page.

Observed game cookie names are `_t`, `userId` and `friendCodeList`. Gateway cookies include `JSESSIONID`, `clal` and AWS load-balancer cookies. Names alone do not establish which cookies are required or their lifetimes. Cookie and session values must not appear in logs, fixtures or this document. Later home and music-list responses also carried `Set-Cookie` headers, and unchanged cookie names do not prove unchanged values. The site client therefore merges response cookies into the session on each same-origin request and redirect.

The unauthenticated redirect confirmed the public International gateway configuration: `site_id=chuniex`, `redirect_url=https://chunithm-net-eng.com/mobile/` and `back_url=https://chunithm.sega.com/`. These are site configuration, not account session values. CHUNITHM credentials were submitted as POST form fields. The shared gateway login form-encodes the credentials for both games and reads `retention` from the login form, so no password travels in a URL.

### International home

| Selector | Observed purpose |
| --- | --- |
| `.player_name`, `.player_name_in` | Player name containers |
| `.player_lv` | Player level |
| `.player_rating_num_block` | Rating digit images |
| `.player_overpower_text` | Overpower text |
| `.player_lastplaydate_text` | Last-play text |
| `.player_chara > img` | Character image, observed under game-host `/mobile/img/<asset>.png` |
| `.player_honor_text` | Honor or title text |

Observed navigation links include `/mobile/home/playerData` (without a trailing slash) and `/mobile/home/playerData/ratingDetailBest/`. Three `.player_honor_short` containers were present, with only the first populated through `.player_honor_text > span` in the inspected account. This proves one populated title, not how to combine several equipped titles.

### International player details

`/mobile/home/playerData` exposes `.user_data_play_count` and `.user_data_current_play_count`, the distinct total and current-version play counts. The value selectors are `.user_data_play_count > .user_data_text` and `.user_data_current_play_count > .user_data_text`. Their content is numeric: trim whitespace, remove comma grouping and validate the whole remaining string as an integer. No English or Japanese label regex is needed for these nodes.

### Rating digits and target lists

Rating image filenames in `.player_rating_num_block` follow `/mobile/images/rating/rating_<color>_<two-digit numeral>.png` and `rating_<color>_comma.png`, read in DOM order. The parser matches `/rating_[a-z]+_(\d{2}|comma)\.png$/`, reads the two-digit suffix as a digit and `comma` as the decimal separator, and stores the decimal times 100. `orange` was observed, and the full digit and color vocabulary was not enumerated. The rule was not checked against a textual rating. Never parse an image URL as a floating-point string or drop the separator blindly.

| Route | Observed contents |
| --- | --- |
| `/mobile/home/playerData/ratingDetailBest/` | 30 `.musiclist_box` rows in the inspected account |
| `/mobile/home/playerData/ratingDetailRecent/` | Labeled **Current** by `.btn_new_on` and “Music for Rating(Current)” in `.box01_title .text_b.font_small`. One row in the inspected account |
| `/mobile/home/playerData/ratingDetailNext/` | Linked, not read as a source |

The route name `ratingDetailRecent` does **not** mean recent plays or a recent-10 rating bucket. Observing one row does not prove the current list's capacity.

Target rows carry `.music_title` and `.play_musicdata_highscore > span.text_b` (a comma-grouped integer score). Difficulty classes observed include `bg_advanced`, `bg_expert` and `bg_master`. Trim the title without Unicode normalization. For the score text, remove comma grouping and validate the whole remaining integer string before converting. Rows contain a form with `method="POST"` and action `/mobile/record/musicGenre/sendMusicDetail/`, with hidden fields `diff`, `genre`, `idx` and `token`. Submitting a row produced HTTP 302 to `/mobile/record/musicDetail/`. Hidden values are per response and must not be invented or copied here.

Target pages alone are not a complete score source: they list a limited selection, and their combo, chain and clear fields need separate evidence.

Because the selector POST redirects to one shared detail URL without a record key, keep each selector POST and its resulting GET paired and sequential within a session. Do not copy maimai's concurrent keyed detail fetching into this flow. A race was not demonstrated, and the complete list pages remove the need to fetch per-song details.

### International score-list navigation

The parent of `.difficulty_btn_record` has an `onclick` handler calling `search('Basic'|'Advanced'|'Expert'|'Master'|'Ultima', this)`. These exact strings are navigation arguments, distinct from the numeric canonical difficulty codes.

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

Use the site's All filter for complete score collection rather than assuming genre IDs form a contiguous sequence.

The live inline function was:

```js
function search(diff, obj) {
  var form = $(obj).parents('form');
  form.attr('action', 'https://chunithm-net-eng.com/mobile/record/musicGenre/send' + diff);
  form.submit();
}
```

This confirms a form POST to `/mobile/record/musicGenre/sendBasic`, `sendAdvanced`, `sendExpert`, `sendMaster` or `sendUltima`, keeping the original `genre` and hidden `token` fields. Select `genre=99` for All. The handler sends no `diff` query parameter.

Both the genre landing page and the Basic result page use `form[method=post]` with `action=""`, a `select[name=genre]` and a hidden `token`. The script supplies the action only when a difficulty is selected. Read the hidden fields from that genre form, and do not require a nonempty action as the detail selector forms do.

The Expert action was verified live: POST `/mobile/record/musicGenre/sendExpert` with `genre=99` and the form's hidden `token` returned HTTP 302 to `/mobile/record/musicGenre/expert`, then HTTP 200. The other difficulty actions are confirmed by the inline handler but were not submitted.

| Selector within `.musiclist_box.bg_expert` | Observed meaning |
| --- | --- |
| `.music_title` | Public song title |
| Hidden inputs `idx`, `genre`, `diff`, `token` | Existing detail selection fields |
| `.play_musicdata_highscore > span.text_b` | Comma-grouped integer score, present only on played rows |
| `.play_musicdata_icon.clearfix img` | Played-row status and grade images |

Unplayed rows have a title and hidden fields but **no high-score element**. Skip them when collecting played scores, and do not turn a missing score into zero. None of the observed played rows displayed zero, so zero-score semantics remain unverified. Tell an absent score in a recognized row apart from an unexpected page with no recognized rows at all, and skip by element absence, not by a falsy numeric check such as `!scoreValue`.

Observed image basenames were `icon_clear.png` and `icon_rank_4.png` through `icon_rank_11.png`. `icon_clear.png` maps to the CLEAR status. Rank images are grade indicators, not combo or chain lamps. International FC, AJ, AJC, chain and advanced clear-lamp filenames were not observed on this page.

The inspected All-genre Expert response had no pager elements or page anchors. This is evidence for that response only, not for pagination or completeness of other difficulty and category combinations.

### International recent-play list

`GET /mobile/record/playlog` returned HTTP 200 with `.frame02.w400` record rows. The observed row count does not prove page capacity or pagination behavior.

| Selector within a row | Observed shape | Extraction |
| --- | --- | --- |
| `.play_datalist_date` | `YYYY/MM/DD HH:mm`, no printed timezone | Validate `/^(\d{4})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2})$/` and build the date with an explicit timezone |
| `.play_track_text` | `TRACK <integer>` | `/^TRACK\s+(\d+)$/` after trimming |
| `.play_track_result img` | Difficulty image, `musiclevel_expert.png` observed | Match the basename, then use an explicit difficulty dictionary |
| `.play_musicdata_title` | Song title | Trim without blind Unicode normalization |
| `.play_musicdata_score_text` | Comma-grouped integer | Remove grouping, validate `/^\d+$/`, then convert |
| `.play_musicdata_icon img` | `icon_clear.png`, `icon_rank_5.png` observed | Tell the clear lamp from the score rank |
| Score-new marker | `icon_new.png` observed | Presentation marker, not a combo or clear status |

The timestamp prints no timezone. JST is the repository's interpretation, not something the markup proves, so never parse it with host-local `new Date(unqualifiedText)`.

Each row has a POST detail selector form with fields `idx` and `token`. Its action is `/mobile/record/playlog/sendPlaylogDetail/`, and following it produced HTTP 302 to `/mobile/record/playlogDetail/`, then HTTP 200. As with song details, keep selector submission and detail reading paired, so the details of a fetch's plays are read one at a time on the fetch's session.

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

The note-category figures are **percentages, not note counts**, and an observed percentage exceeded 100. Do not clamp them to 100 or coerce them into maimai note-count fields. Parse them as `/^(\d+(?:\.\d+)?)%$/` after trimming. Judgment counts and max combo use integer parsing instead.

### International song details

`/mobile/record/musicDetail/` contains `.play_musicdata_title` and `.play_musicdata_artist`. Within `.music_box.bg_expert`, `.musicdata_score_num > .text_b` appears in several rows. Use the associated `.musicdata_score_title` label to tell `HIGH SCORE：` from `Play Count：` rather than taking the first numeric element. The play count appends `times`, read as `/^([\d,]+)\s*times$/` followed by comma removal and integer validation. Difficulty variants beyond the observed box class need verification.

FC, AJ and chain icon variants were not observed here, and their filenames must not be invented from the canonical code names.

## Observed JP login and pre-subscription access

| Step | Request | Observed result |
| --- | --- | --- |
| Entry | `GET https://new.chunithm-net.com/` | HTTP 200 login form |
| Credentials | Form `POST /chuni-mobile/html/mobile/submit/` | Fields `segaId`, `password`, `save_cookie` (checkbox), `token` (hidden). Successful submission produced HTTP 302 to the card list |
| Card list | `GET /chuni-mobile/html/mobile/aimeList/` | HTTP 200 with a card selection form |
| Card selection form | `POST /chuni-mobile/html/mobile/aimeList/submit/` | Hidden fields `idx`, `token`. This is a POST form, unlike maimai's GET selection URL |

Use the displayed form and its current hidden values. maimai JP selects a card with a GET, which is not a CHUNITHM equivalent. A successful credential exchange does not establish subscription entitlement or access to player records.

Before subscription, the authenticated home page and `/chuni-mobile/html/mobile/home/playerData` both returned HTTP 200 after card selection. The rating-best link instead returned HTTP 302 to `/chuni-mobile/html/mobile/rightLimit/`, which returned HTTP 200. The tested account was authenticated while that records surface was unavailable.

Pre-subscription access differed by endpoint (paths are relative to `/chuni-mobile/html/mobile/`):

| Route | Observed access for the unsubscribed account |
| --- | --- |
| `home/` | HTTP 200 authenticated home |
| `home/playerData` | HTTP 200 profile |
| `record/` | HTTP 200 map and progression overview |
| `record/musicGenre` | HTTP 302 to `rightLimit/`. Full music records are gated |
| `record/playlog` | HTTP 200 recent-play list, 18 `.frame02` rows in this observation, with normal detail forms |
| `home/playerData/ratingDetailBest/` | HTTP 302 to `rightLimit/` |

The 18 rows are an observation, not a proven pagination limit. The record overview returning 200 does not establish access to the full score catalog.

## Observed JP access with an active subscription

With the JP subscription, the same authenticated account could open the rating-best page with HTTP 200 instead of being redirected to `rightLimit/`. These observations supplement the unpaid evidence and do not replace subscription-denial detection. The paid JP pass used one credential session and 26 requests, including five authentication requests. It was an exploratory sequence, not a production fetch budget. Paid-page HTML was inspected in memory and was not retained as fixtures.

Unless stated otherwise, JP paths below are relative to `https://new.chunithm-net.com/chuni-mobile/html/mobile/`.

### JP rating targets

`GET home/playerData/ratingDetailBest/` has the same target-row structure as International: `.musiclist_box` with difficulty classes such as `bg_expert` and `bg_master`, `.music_title`, and `.play_musicdata_highscore > span.text_b`. Detail selection uses POST `record/musicGenre/sendMusicDetail/` with form fields `diff`, `genre`, `idx` and `token`.

The title `.box01_title` is `レーティング対象曲(ベスト)`, and the `.font_x-small.mb_10` text states that the 30 highest-rated playable songs outside the latest version are listed. This is an older-version best 30, and a particular account need not have 30 rows.

`GET home/playerData/ratingDetailRecent/` returned HTTP 200 and is titled `レーティング対象曲(新曲)` in `.box01_title`. Its `.font_x-small.mb_10` text states that the 20 highest-rated songs of the latest version are listed. The JP page therefore confirms a current-version best 20 alongside the older-version best 30, which are the repository's ranking buckets. The `Recent` route segment means this new-song selection, not play history.

### JP score lists and song details

`GET record/musicGenre` returned HTTP 200 after subscription. The landing page contains navigation rather than score rows, and that absence must not be read as an empty account. Its search handler and buttons use the same five `sendBasic`, `sendAdvanced`, `sendExpert`, `sendMaster` and `sendUltima` POST actions as International, with `genre=99` and the page's hidden `token`. All five actions were submitted and returned HTTP 302 to the matching `record/musicGenre/basic`, `advanced`, `expert`, `master` and `ultima` routes, then HTTP 200. Each request used the current page's form token.

| Navigation argument | List-row selector | Played-row verification |
| --- | --- | --- |
| `Basic` | `.musiclist_box.bg_basic` | Unplayed-row shape observed |
| `Advanced` | `.musiclist_box.bg_advanced` | Unplayed-row shape observed |
| `Expert` | `.musiclist_box.bg_expert` | Played and unplayed rows observed |
| `Master` | `.musiclist_box.bg_master` | Played and unplayed rows observed |
| `Ultima` | `.musiclist_box.bg_ultima` | Unplayed-row shape observed |

Played Expert and Master rows expose `.play_musicdata_highscore > span.text_b` and `.play_musicdata_icon.clearfix img`. Unplayed rows keep titles and hidden detail selection fields but lack the high-score element, matching the International skip rule. The ULTIMA navigation button uses `btn_ultimate` or `btn_ultimate_on`, although the action says `Ultima` and rows say `bg_ultima`, so do not derive all three from one spelling.

No pager classes or page links were found in the returned lists, and Basic and ULTIMA also received explicit pagination selector checks. These are observations of the inspected All-filter responses, not a guarantee about every future page or filter.

Submitting a song row redirected with HTTP 302 to the shared `record/musicDetail/` URL, then returned HTTP 200. Scope detail values to `.music_box.bg_expert` (or the observed difficulty variant), pairing `.musicdata_score_title` with `.musicdata_score_num > .text_b`:

| Field | JP label | International label |
| --- | --- | --- |
| High score | `HIGH SCORE：` | `HIGH SCORE：` |
| Play count | `プレイ回数：` | `Play Count：` |

The JP play-count value ends with `回`, unlike International's `times`. Read it as `/^([\d,]+)回$/` after trimming, and remove comma grouping from the capture before integer conversion. This unit belongs to the song-detail value, not to the profile counts below.

Reopening `record/musicDetail/` after visiting other pages returned the same previously selected song and difficulty. The shared detail URL keeps the session's selection, which is why each selection POST and its detail GET stay paired and sequential. A concurrent selection race was not deliberately created.

### JP profile and recent plays

`GET home/playerData` returned HTTP 200 with the same profile selectors as International: `.player_name_in`, `.player_rating_num_block`, `.player_honor_text` and `.player_chara`. Both `.user_data_play_count > .user_data_text` and `.user_data_current_play_count > .user_data_text` are present, so the total and current-version counts stay separate. Both profile values are plain numbers without `回`, read with the International integer extraction, not the song-detail suffix pattern. Rating images use the same filename pattern, with `orange` observed.

`GET record/playlog` returned HTTP 200 with the same `.frame02.w400` rows and date, track, title, score and icon selectors as International. The inspected list contained `musiclevel_master.png`, `musiclevel_expert.png` and a played-record `icon_fullcombo.png`. JST remains the repository's interpretation of the timestamp rather than a printed timezone.

A POST to `record/playlog/sendPlaylogDetail/` with the row's `idx` and `token` returned HTTP 302 to `record/playlogDetail/`, then HTTP 200. The detail page uses the same `.play_data_detail_maxcombo_block.font_large`, `.play_data_detail_judge_text.text_critical`, `.text_justice`, `.text_attack` and `.text_miss` selectors. Scope each short class to `.play_data_detail_judge_text` when extracting counts.

The five `.play_data_detail_notes_text` variants are also shared: `text_tap_red`, `text_hold_yellow`, `text_slide_blue`, `text_air_green` and `text_flick_skyblue`. Their values end with `%`, so they are percentages, not note counts. One set of CHUNITHM record parsers serves both regions, separate from maimai's judgment schema.

### JP icon vocabulary

The paid score page's `.score_list` aggregate summary contains these asset basenames. This shows that the assets exist in the page, not that every status was observed on an individual played-song row. `icon_fullcombo.png` was also observed in the recent-play list.

| Family | Observed basenames |
| --- | --- |
| Clear | `icon_clear.png`, `icon_hard.png`, `icon_brave.png`, `icon_absolute.png`, `icon_catastrophy.png` |
| Combo | `icon_fullcombo.png`, `icon_alljustice.png`, `icon_alljusticecritical.png` |
| Chain | `icon_fullchain.png`, `icon_fullchain2.png` |
| Score rank | `icon_rank_8.png` through `icon_rank_13.png` |

The clear status key `catastrophy` keeps the upstream filename's spelling. The two chain images had no alt labels in the inspected summary. Public importer research establishes `icon_fullchain2.png` as the lower chain status and `icon_fullchain.png` as the higher one: [performai-api's parser](https://github.com/rezaa-cmV6YWE/performai-api/blob/main/src/lib/games/chunithm/parser/rating.ts) maps them to `fch` and `fch+`, and an [independent importer](https://github.com/leomotors/chunithm-net-scraper/blob/main/src/steps/vendor/qman.ts) maps them to `1` and `2`. They map to the sync keys `full-chain` and `full-chain-aj`. This is corroborated importer evidence, not an official label captured from the authenticated page.

## Failure classification

### Subscription gate

These messages were observed on the JP `/chuni-mobile/html/mobile/rightLimit/` response:

- `利用権が必要です。`
- `利用権が無いため、サービスをご利用いただけません。`
- `ゲキチュウマイ-NET利用権を購入することで、サービスを利用できます。`

Observed gate-page classes are `.riyouken_block00`, `.riyouken_attention`, `.riyouken_what` and `.btn_standard_charge`. The rating-best request redirected to this page after authenticated home and profile requests succeeded. No purchase link was visited.

| Gate selector | Observed content |
| --- | --- |
| `.riyouken_block00 > .riyouken_attention` | `利用権が必要です。` |
| `.riyouken_block00 .text_l p` (first paragraph) | `利用権が無いため、サービスをご利用いただけません。` |
| `p.mb_30` | The purchase clause above, with a `<br>` separating the text |
| `.riyouken_what_img img` | Image source ending in `/images/unpaid_info.png` |

The classifier matches both complete clauses within `.riyouken_block00` after removing whitespace, because a clause can be split across text nodes and `利用権` alone also occurs in ordinary navigation. The final `rightLimit/` URL is useful context but not sufficient evidence by itself, and neither is a status code, a route, missing rows or a purchase link. Inspect the error content before looking for score rows, and do not treat every HTTP 200 page as fetched records.

Unsubscribed JP accounts reach home, profile, the record overview and the recent-play list, while their rating-best and full music record routes are gated. Accessible recents cannot stand in for complete best scores. Other account types and International records were evaluated separately.

A subscription denial means record access is unavailable, not that the account has zero scores. The fetch fails with `SUBSCRIPTION_REQUIRED` before returning a result. It keeps the saved token and existing snapshots rather than saving an empty result or asking for new credentials, and the fetch toast explains how to recover. This condition is distinct from incorrect credentials, an expired session, maintenance, an unexpected page shape or a verified empty-record page, and it must not disable International fetching.

### Credentials, sessions and pages

- A stored token is deleted only when SEGA definitively refuses it: the gateway or the JP site answering with its sign-in form, or a JP credential submit that does not reach the card list. Network errors, timeouts, server errors and a failed card selection are transient and keep the token.
- A recent play whose difficulty image is not one of the five fetched difficulties, such as a WORLD'S END play, is skipped and counted. A playlog page with no play rows is an empty history, because the page request has already verified the session. Layout breakage still fails the score stages, which read every difficulty list.
- Scheduled maintenance follows the definition's windows before any request. An upstream maintenance page outside that schedule needs its own observed response classifier. Do not infer expired authentication from subscription text, or maintenance from missing record elements.

## Requests and known gaps

Detail navigation costs a selector POST and a redirected GET per song or recent play. Read the resulting page before selecting another record on the same session. Authentication and its gateway redirects are separate from data-page request counts.

A complete collection is one profile page, one score-list form bootstrap, five difficulty POSTs and one recent-list page: eight page and form requests after authentication, plus an optional icon request. With every difficulty POST redirecting to a GET, as Expert does, the total is 13. Each selected recent detail page adds two requests.

Not yet observed or verified:

- For International, difficulty POSTs other than Expert. For JP, played Basic, Advanced or ULTIMA rows, and a completely empty account.
- Pagination on other accounts. Every individual-row status of the JP icon vocabulary. An account with both chain variants.
- An expired session or a maintenance page, whose selectors and messages must be captured before classifying them.
- Starting from a browser-imported gateway cookie: bookmarklet fragment retention and gateway cookie visibility. The browser helpers read `document.cookie`, so they need a JavaScript-readable `clal` on the gateway origin and cannot read HttpOnly cookies or gateway cookies from the game origin. A copied cookie may expire.
- A complete application fetch against the live sites, including the JP card selection's Referer.
- WORLD'S END, which is not fetched until its charts have a catalog representation.

Model limits to check against real observations:

- Player names have a database limit of 16 characters.
- Recent plays are unique by user, game, song and play time, not by an upstream record id.
- A recent play is matched in the catalog of the fetch's captured game version, so a play of a chart missing from that version is not matched. Its play time stays the real JST time, because deriving the version from it would skip historical plays. Cross-version recent history is unresolved.
- Scores match catalog charts by exact title, difficulty and chart type. Neither CHUNITHM-NET nor the otoge-db catalog titles are NFKC normalized, so compare real titles from both sources before normalizing either.
- The official profile supplies the player rating. No recent-10 rating bucket exists.
