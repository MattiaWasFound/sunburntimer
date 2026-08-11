# SunburnTimer - Smart Sun Exposure Calculator (Vanilla JS Edition)

A dependency-free vanilla JavaScript fork of [Jon Callahan's SunburnTimer](https://github.com/jondcallahan/sunburntimer). It estimates safe sun-exposure time from skin type, sunscreen, activity, chosen start time, and live local weather.

There are no frameworks, packages, build tools, API keys, or server-side application code. The app is plain HTML, CSS, and JavaScript and can be served by any static web server.

## Features

- **Fitzpatrick Skin Type Selection**: Choose from 6 scientifically-based skin types
- **SPF Protection Modeling**: Account for different sunscreen strengths and degradation over time
- **Activity Level Consideration**: Factor in sweating that reduces SPF effectiveness
- **Configurable Start Time**: Calculate from now by default or choose a future date and time within the available forecast
- **Real-time Weather Data**: Uses Open-Meteo API for UV index and weather conditions
- **Interactive Charts**: Canvas-based skin damage accumulation and UV index charts
- **Location Services**: Support for both GPS location and manual city search
- **Sun Position Visualization**: SVG arc showing the sun's path throughout the day
- **Sun Exposure Timer**: Real-time damage tracking with start/pause/stop
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
- **Install/offline**: the fleet PWA kit (ServerCLI `docs/fleet-pwa.md`) — one vendored module, a generated icon set and manifest, and a service worker
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

Use `serve.py` rather than `python3 -m http.server`: it is the same stdlib server plus the `Cache-Control` headers the service worker depends on. `http.server` sends none at all, which means heuristic caching — and a `/sw.js` a browser will not re-fetch is a service worker that can never update itself. `serve.py --help` for the options; it binds loopback by default because nginx owns TLS and the public path in production.

## Verifying

```bash
bin/verify
```

The single entry point, and the thing to run before calling any change here done: it parses every file the app serves, runs the fleet PWA contract check against `pwa.json` and `index.html`, and runs the test suite. See the comment at the top of that file for what each gate is for and what it deliberately cannot check.

Tests are `node --test` over the app's **real** modules — no framework, no dependency, no build step, and node is already on the box. They cover the honest-staleness rule end to end (`tests/uv_source.test.js`), what the store persists and refuses to resurrect (`tests/store.test.js`), the service worker's invariants (`tests/sw.test.js`), and `serve.py`'s delivery headers against a real subprocess (`tests/delivery.test.js`).

## Usage

1. **Select Your Skin Type**: Choose from the Fitzpatrick scale (I-VI)
2. **Choose SPF Level**: Select your sunscreen's SPF rating or "None"
3. **Set Activity Level**: Indicate how much you'll be sweating
4. **Set Location**: Use GPS or enter a city name
5. **Choose a Start Time**: Keep the default moving “Now” value or select a future date and time
6. **View Results**: Get your personalized burn time, charts, and safety recommendations

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
├── pwa.json            # Fleet PWA kit config — manifest & icons generate from it
├── bin/verify          # The verification entry point
├── css/
│   └── styles.css      # All styling (no Tailwind, no CSS framework)
├── static/
│   ├── icon.svg        # Hand-drawn app mark (the icon set is generated from it)
│   ├── fleet_pwa.js    # Vendored fleet module — byte-identical, never patched
│   ├── manifest.webmanifest   # Generated: pwa_kit.py manifest
│   └── icons/          # Generated: pwa_kit.py icons
├── tests/              # node --test suites over the real modules
└── js/
    ├── config.js       # Constants, skin/SPF/sweat configs, WMO descriptions
    ├── utils.js        # Timezone, temperature, formatting, DOM helpers
    ├── uv_source.js    # Where the UV came from and whether it may be used
    ├── calculations.js # Core burn time algorithm (faithful port)
    ├── services.js     # API services (weather, geolocation, geocoding, AQI)
    ├── store.js        # State management with localStorage persistence
    ├── charts.js       # Canvas-based burn & UV charts
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

MIT License — see the original [repository](https://github.com/jondcallahan/sunburntimer) for details.

## Acknowledgments

- Original app by [Jon Callahan](https://github.com/jondcallahan)
- Fitzpatrick skin type scale for scientific accuracy
- Open-Meteo and BigDataCloud for reliable, free data services
