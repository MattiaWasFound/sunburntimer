# sun: one-page redesign (2026-10-01 polish round)

Mattia: "Sun is hard to use because you have to scroll a lot and it forgets
your defaults and plus the result is at the bottom, re-design it as a one page
app."

## What was wrong (read off the `before/` captures, origin/main at 8e94ae3)

- **No answer on a first visit.** Skin type and place had defaults
  (II, Copenhagen) but sunscreen did not, so the results block stayed hidden
  until the visitor found step 2 — below a 320px-tall skin-type carousel. The
  first screen was a title, a subtitle, a byline and one skin card
  (`before/first-phone.png`); the whole page was 2,360px of steps on a phone.
- **The answer was a card among cards.** On a return visit the page loaded at
  the top and then auto-scrolled to the results, past the header, so the
  provenance strip sat at the very top edge and "Safe Sun Exposure Time" had a
  second Refresh button next to the first (`before/returning-phone.png`). The
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
  the fold, inputs a full screen further down (`before/returning-desktop.png`).
- **Visual weight was everywhere but the number.** "Sunburn unlikely" / "Safe
  for 2h 35m" was 24px; the step titles were 16px bold; there was no single
  number readable at arm's length. Colour came from decoration (cream page,
  green check, orange accents) rather than from the UV level.
- **Touch and keyboard.** Skin/SPF/sweat cards were `div role=button` with no
  key handler (Tab reached them, Enter did nothing); the place search input
  was 16px but the time input was not tokenised.
- **Light only**, on a warm cream (#fff7ed) background.
