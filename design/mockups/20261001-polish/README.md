# sun: one-page redesign (2026-10-01 polish round)

Mattia: "Sun is hard to use because you have to scroll a lot and it forgets
your defaults and plus the result is at the bottom, re-design it as a one page
app."

## What was wrong (read off the `before/` captures, origin/main at 8e94ae3)

- **No answer on a first visit.** Skin type and place had defaults
  (II, Copenhagen) but sunscreen did not, so the results block stayed hidden
  until the visitor found step 2 — below a 320px-tall skin-type carousel. The
  first screen was a title, a subtitle, a byline and one skin card
  (`before/first-phone.jpg`); the whole page was 2,360px of steps on a phone.
- **The answer was a card among cards.** On a return visit the page loaded at
  the top and then auto-scrolled to the results, past the header, so the
  provenance strip sat at the very top edge and "Safe Sun Exposure Time" had a
  second Refresh button next to the first (`before/returning-phone.jpg`). The
  full phone page was 2,658px: answer, two 320px charts, a five-chip legend,
  the sun arc, the timer, and only then the four steps that change the answer.
- **Changing one input was 2–4 taps and a scroll.** Every setting lived in an
  accordion step under the charts: scroll down, open the step, pick, then
  scroll back up to see what changed. SPF and sweat were stacked full-width
  cards (seven of them, ~90px each).
- **The settings the answer was for were not on screen with it.** The hero said
  "Sunburn unlikely" without saying for which skin type, sunscreen, place or
  start time; those were collapsed badges far below.
- **A persisted start time outlived its moment.** `activityStart` was saved
  and restored forever, so a "14:00" picked yesterday came back as a start time
  in the past.
- **Desktop was a stretched phone column** (896px max), charts pushed below
  the fold, inputs a full screen further down (`before/returning-desktop.jpg`).
- **Visual weight was everywhere but the number.** "Sunburn unlikely" / "Safe
  for 2h 35m" was 24px; the step titles were 16px bold; there was no single
  number readable at arm's length. Colour came from decoration (cream page,
  green check, orange accents) rather than from the UV level.
- **Touch and keyboard.** Skin/SPF/sweat cards were `div role=button` with no
  key handler (Tab reached them, Enter did nothing); the place search input
  was 16px but the time input was not tokenised.
- **Light only**, on a warm cream (#fff7ed) background.

## What changed, and why it is better to use

- **The answer is the hero, always first, never scrolled to.** One tinted
  card at the top: the UV now and its band, "Safe in the sun for", the
  duration at 76px (88px on desktop) with small units, the clock time it runs
  out, the same dose in shade / on a beach / on snow, the one tip worth
  reading, and the provenance line with a refresh icon. Its colour is the UV
  band (WHO scale, one token set in `css/styles.css`); the sky behind the page
  follows the sun's phase at the place (dawn, morning, midday, afternoon,
  dusk, night). No calculate step and no auto-scroll.
- **Every input is one tap, on the same screen as the answer.** Four
  segmented controls under the hero: Skin I–VI (each with its skin-colour
  swatch), SPF None/15/30/50+, Sweat None/Some/Lots (disabled, with a reason,
  when there is no sunscreen), Start Now / Later… (the native date picker sits
  invisibly over "Later…", so one tap opens it). Real buttons with
  `aria-pressed`, built once so focus survives a pick. Fits 390×844,
  360×640 and even 320×568 with no scrolling (`--sweep` checks it).
- **It remembers you and answers with zero input.** First visit: type II,
  no sunscreen (the conservative default: the shortest burn time, never a
  longer one), Copenhagen. Returning: skin, SPF, sweat, place and °C/°F come
  back; a planned start comes back only until it has passed. A same-place
  refresh keeps the answer on screen while the new reading loads.
- **The place is one tap from anywhere**: the pill top right opens a native
  `<dialog>` (bottom sheet on a phone, panel on desktop) with "Use my current
  location" and city search with keyboard navigation. A refused location
  leaves the old place's answer standing and says why in the sheet.
- **Desktop uses the width**: answer + inputs in a sticky left column; UV
  through the day, burn dose, weather and the sun's arc beside them.
- **Detail kept, demoted**: UV chart now shows only the day asked about
  (not three days of humps), band-coloured; burn dose drawn as a straight
  rising line with whole-hour ticks; the skin-type carousel became a
  selectable "Which skin type am I?" list; "How does this work?" and the
  sweat-index bands are unchanged in content.
- **The timer lives in the answer**: Start timer in the hero's top row;
  running, it shows elapsed time, a dose meter, Safe/Caution/Warning/…, time
  to go, pause/stop, the stale-source note and the shade alerts.
- **Light and dark** from one token block; contrast tuned for sunlight (the
  big number is near-black on a pale band tint, ≥ 12:1).
- **Honesty rules intact**: the refusal ("This UV reading has expired" /
  "This forecast has run out" / the calculation-failed card) now stands in the
  hero's place with the same words from `uv_source.js`, the manual-UV and
  "use the reading from…" ways out, and stale results stay marked (hero
  border, "UV n at <time>", provenance chip, timer note).
- **Bugs fixed on the way**: WMO code 0 drew a cloud (`trunc(0) || -1`);
  the timer showed the browser's clock instead of the place's; a resize
  rebuilt the whole page.

## Tried and rejected

- *Chips that open a sheet per setting* (one row of "II · SPF 15 · Some ·
  Now"): compact, but two taps per change and the values hide behind a
  sheet. Visible segmented controls fit the same screen once the hero lost
  its spare lines.
- *Label above each control*: ~80px taller; used only below 360px wide.
- *A raw `datetime-local` in the Start row*: it rendered "14/07/2026, 11.40",
  truncated, in a 200px slot. Replaced by "Later…" with the picker over it.
- *Dark tints as dark versions of the band*: a dark orange is brown. The
  dark tints are now the band over the night surface.
- *Defaulting sunscreen to SPF 30*: a friendlier first number, but a longer
  burn time than someone without sunscreen actually has.

## How to rerun the captures

```
node design/mockups/20261001-polish/capture.cjs <checkout> <out-dir> [scenario…]
node design/mockups/20261001-polish/capture.cjs . /tmp/sweep --sweep
CAPTURE_BROWSER=webkit node design/mockups/20261001-polish/capture.cjs . /tmp/wk returning-phone
```

It serves the checkout with its own `serve.py` on a free loopback port, pins
the clock to 2026-07-14 11:40 Copenhagen, answers Open-Meteo from fixtures
(Copenhagen UV peak 6.2, Lisbon 9.1) and blocks the network and the service
worker. The returning visitor is type II, SPF 15, some sweat, in Lisbon.
`before/` is origin/main at 8e94ae3 (`git worktree add ../sun-before
8e94ae3`), `after/` is this branch. Images here are downsized JPEGs; the
full-resolution PNGs are in `/Volumes/DATA/tmp/app-polish-20261001/shots/sun/`.
