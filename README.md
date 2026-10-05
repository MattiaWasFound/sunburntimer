# SunburnTimer - Smart Sun Exposure Calculator (Vanilla JS Edition)

A dependency-free vanilla JavaScript fork of [Jon Callahan's SunburnTimer](https://github.com/jondcallahan/sunburntimer). It estimates safe sun-exposure time from skin type, sunscreen, activity, chosen start time, and live local weather.

There are no frameworks, packages, build tools, API keys, or server-side application code. The app is plain HTML, CSS, and JavaScript and can be served by any static web server.

## Features

- **Fitzpatrick Skin Type Selection**: Choose from 6 scientifically-based skin types
- **SPF Protection Modeling**: Account for different sunscreen strengths and degradation over time
- **Activity Level Consideration**: Factor in sweating that reduces SPF effectiveness
- **Configurable Start Time**: Calculate from now by default or choose a future date and time within the available forecast
- **Real-time Weather Data**: Uses Open-Meteo API for UV index and weather conditions
- **Interactive Charts**: UV, burn dose, the sun's height and temperature on canvas, sharing one cursor: point at any of them and all of them show that moment
- **Location Services**: Support for both GPS location and manual city search
- **The real sun**: its height through the day from an almanac formula, and the shadow rule (shorter than you: strong UV) at any moment
- **Sun Exposure Timer**: Real-time damage tracking with start/pause/stop, inside the answer
- **One screen**: a bento of six tiles that fills a 16:9 screen exactly, reflowing to two columns and then one; light and dark
- **Installable, and works offline**: an installable PWA whose calculator, charts and timer all run with no network, against the last forecast this device stored
- **Never presents stale UV as current**: every reading carries the time it was fetched, and an expired one is refused rather than quietly used (see below)
- **Responsive Design**: Works on desktop and mobile
- **No Dependencies**: Pure vanilla JS, CSS, and HTML — runs from any static file server

## Technology Stack

- **Frontend**: Vanilla JavaScript (ES Modules), HTML5, CSS3
- **Charts**: HTML5 Canvas (no Chart.js)
- **State Management**: Custom store with localStorage persistence (no Zustand)
- **Icons**: Inline SVG (no icon library)
- **APIs**: Open-Meteo (weather, AQI, geocoding), BigDataCloud (reverse geocoding)
- **Server**: `serve.py`, Python stdlib only
- **Install/offline**: one vendored PWA module (`static/fleet_pwa.js`, from the author's PWA toolkit), a generated icon set and manifest, and a service worker
- **Tests**: node's built-in runner, no dependencies

`package.json` exists only to declare that `js/*.js` are ES modules, which is what lets node's test runner import the same files the browser does. There are no dependencies and no build step.

## Getting Started

### Prerequisites

- Any modern browser with ES Module support
- A static file server (e.g., `python3 -m http.server`)

### Running

```bash
# Clone the repository
git clone https://github.com/MattiaWasFound/sunburntimer.git
cd sunburntimer

# Start the app's own static server
python3 serve.py 8000

# Open your browser
# Navigate to http://localhost:8000
```

No `npm install` and no build step are required. A server is necessary because the browser loads the JavaScript as ES modules; opening `index.html` directly as a `file://` URL is not supported.

Use `serve.py` rather than `python3 -m http.server`: it is the same stdlib server plus the `Cache-Control` headers the service worker depends on. `http.server` sends none at all, which means heuristic caching — and a `/sw.js` a browser will not re-fetch is a service worker that can never update itself. `serve.py --help` for the options; it binds loopback by default because in production a reverse proxy owns TLS and the public path.

## Verifying

```bash
bin/verify
```

The single entry point, and the thing to run before calling any change here done: it parses every file the app serves and runs the test suite. With `PWA_KIT_HOME` pointing at the PWA toolkit it also checks `pwa.json`, the generated manifest and icons, and the head block in `index.html`; without it, that gate says it skipped. See the comment at the top of that file for what each gate is for and what it deliberately cannot check. CI runs the same script on every push and pull request.

Tests are `node --test` over the app's **real** modules — no framework, no dependency, no build step; node and python3 are all it needs. They cover the honest-staleness rule end to end (`tests/uv_source.test.js`), what the store persists and refuses to resurrect (`tests/store.test.js`), what the hero says (`tests/answer.test.js`), the service worker's invariants (`tests/sw.test.js`), and `serve.py`'s delivery headers against a real subprocess (`tests/delivery.test.js`).

## Usage

One screen, no steps. Opening it shows the answer for here and now, in six
tiles:

- **The answer**: how long you can stay in the sun before you burn, the time
  that happens, the same dose in the shade, on a beach and on snow, and where
  the UV number came from. Its colour is the UV band (WHO scale); the sky
  behind the page follows where the sun is in its day. **Start timer** runs a
  live exposure timer inside it.
- **Your settings**, one tap each: skin type (I–VI, with a "Which am I?"
  guide), sunscreen, sweat, and start (Now, or Later… for the native date
  picker). Under every option is the time it would give you, so you see what a
  choice does before you make it.
- **UV through the day**, on the WHO bands, with your time outside shaded.
  Point at it to read the UV at any moment and what a start then would give
  you; click (or press Enter) to plan your start there. On a phone, drag
  across it and tap **Plan**.
- **Your burn dose** building from your start, with the other sunscreen
  strengths drawn faintly beside it. Near a burn the axis runs to 100% with the
  burn line on it; on a low-UV evening it scales to the dose you will actually
  get, and says that a burn is off the scale.
- **The sun**: its real height through the day, sunrise, sunset and the peak,
  and how long your shadow is.
- **Weather**: now, or the forecast for the hour under the cursor (°C/°F),
  with the temperature through the day.

The four charts share one cursor: pointing at any of them moves it on all of
them. The arrow keys move it on a focused chart (Shift for an hour at a time).
**The place** is the button top right: use your location or search a city.

Everything you choose is remembered on this device (localStorage): skin
type, sunscreen, sweat, place, temperature unit, and a planned start until it
has passed. A first visit starts from type II, no sunscreen (the shortest,
never a longer, burn time) and Copenhagen, so it answers with zero input.

## Command line

```bash
bin/sun --skin II --spf 30                      # Copenhagen, now
bin/sun --lat 41.9 --lon 12.5 --at 14:00 --json # anywhere, a start time, machine-readable
```

`js/cli.js` drives the same `calculations.js` / `uv_source.js` / `services.js`
the page uses (open-meteo for the forecast, the same staleness refusal), so the
number a script prints is the number the page shows. Exit codes: 0 answer,
3 no usable UV reading, 2 bad arguments, 1 weather fetch failed.

## Core Algorithm

The application uses a physics-grounded UV damage model:

```
UVI = 40 × E_erythema(W/m²)
MED = 80 × skinTypeCoefficient (J/m²)
damagePerMinute = (120 × UVI / effectiveSPF) / MED × lowUvWeight
```

- UV interpolation uses proper float division (trapezoid integration)
- SPF degradation is modeled linearly based on sweating level and time
- A smoothstep ramp reduces over-estimation at low UV (dawn/dusk)

## Project Structure

```
├── index.html          # Main page
├── serve.py            # Static server + the PWA delivery headers
├── sw.js               # Service worker (app shell offline; never the weather)
├── pwa.json            # PWA config — the manifest & icons are generated from it
├── bin/verify          # The verification entry point
├── bin/sun             # The command-line calculator
├── css/
│   └── styles.css      # All styling (no Tailwind, no CSS framework)
├── static/
│   ├── icon.svg        # Hand-drawn app mark (the icon set is generated from it)
│   ├── fleet_pwa.js    # Vendored PWA module — byte-identical to the toolkit's, never patched here
│   ├── manifest.webmanifest   # Generated: pwa_kit.py manifest
│   └── icons/          # Generated: pwa_kit.py icons
├── tests/              # node --test suites over the real modules
└── js/
    ├── config.js       # Constants, skin/SPF/sweat configs, WMO descriptions
    ├── utils.js        # Timezone, temperature, formatting, DOM helpers
    ├── uv_source.js    # Where the UV came from and whether it may be used
    ├── answer.js       # What the hero says: UV band, start, verdict, sky
    ├── calculations.js # Core burn time algorithm (faithful port)
    ├── services.js     # API services (weather, geolocation, geocoding, AQI)
    ├── store.js        # State management with localStorage persistence
    ├── charts.js       # The four canvas charts and the curve their cursor reads
    ├── solar.js        # The sun's elevation, sunrise and sunset, the shadow ratio
    ├── cli.js          # The command line: argument parsing and output for bin/sun
    └── app.js          # Main app: rendering, events, UI components
```

## Offline, and never a stale UV presented as current

The app is installable and its whole shell is precached, so the calculator, both charts and the exposure timer work with no network — against the last forecast this device stored, which is persisted with the wall-clock time it arrived.

That is exactly why the app also has to be able to refuse. A sunburn calculator answers in the same confident voice whether its UV number is five minutes or five hours old, and the person reading it is outside, not reading a console. So there is one rule, in `js/uv_source.js`:

> Nothing may compute a burn time from a UV number that was not fetched, typed, or explicitly acknowledged within the last hour.

An hour because the UV index here **is** an hourly forecast — one value per clock hour — so that is the resolution of the underlying data, and a shorter window would only refuse readings that are still the best answer in existence. The same window governs a hand-typed index and an acknowledgement, because "the UV is 7" said an hour ago is exactly as stale as a forecast fetched an hour ago.

When a reading is past its window the app shows **"This UV reading has expired"** with the hour it was read, and offers two ways forward: type the UV index yourself, or *"Use the reading from &lt;time&gt;"*. A forecast that no longer reaches the moment being asked about is **"This forecast has run out"** and cannot be acknowledged at all — only replaced or re-typed, because consent to an old reading is not consent to extrapolate past the end of one.

Anything computed from a non-live reading stays marked: the provenance strip reads *"Stale UV · read at &lt;time&gt;, &lt;age&gt;"* or *"Manual UV &lt;n&gt; · entered at &lt;time&gt;"*, the charts plot exactly those numbers, and a running timer carries the snapshot it was started from — *"Timing against a stale reading from &lt;time&gt;. The real UV has moved since."* The refusal lives in the core, not the UI: `findOptimalTimeSlicing` throws on a source it is not allowed to use, so no caller can skip the check.

`sw.js` never caches an Open-Meteo or BigDataCloud response, and refuses those hosts by name. A UV index cached in HTTP land has no timestamp the app can see, and a reading whose age is unknown is one that can never be refused.

## API Integration

All APIs are free and require no API keys:

- **Open-Meteo Weather**: Current weather, hourly UV forecasts, sunrise/sunset
- **Open-Meteo AQI**: Air quality index
- **Open-Meteo Geocoding**: City search
- **BigDataCloud**: Reverse geocoding (GPS coordinates → place name)

## Differences from the Original

This is a from-scratch remake of the original React/TypeScript app:

| Original | This Version |
|----------|-------------|
| React 19 + TypeScript | Vanilla JavaScript (ES Modules) |
| Vite build tool | No build step |
| Tailwind CSS + shadcn/ui | Hand-written CSS |
| Zustand + persist | Custom store + localStorage |
| Chart.js + react-chartjs-2 | HTML5 Canvas |
| date-fns + @date-fns/tz | Intl.DateTimeFormat API |
| lucide-react icons | Inline SVG |
| ios-haptics | Removed |

The calculation model was ported from the upstream project and retains its UV interpolation, MED, SPF-degradation, and low-UV weighting approach. The two projects now evolve independently, so exact output parity is not guaranteed across future upstream releases.

## License

MIT — see [LICENSE](LICENSE).

This fork was taken from upstream commit [`7543acd`](https://github.com/jondcallahan/sunburntimer/commit/7543acd) (2026-06-24), when the upstream project was published under the MIT License, and has been developed independently since. Upstream later moved to a source-available license (2 September 2026); that applies to upstream's later versions, not to this fork, and nothing from upstream after `7543acd` is included here.

## Acknowledgments

- Original app by [Jon Callahan](https://github.com/jondcallahan)
- Fitzpatrick skin type scale for scientific accuracy
- Open-Meteo and BigDataCloud for reliable, free data services

