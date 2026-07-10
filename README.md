# SunburnTimer - Smart Sun Exposure Calculator (Vanilla JS Edition)

A vanilla JavaScript remake of [SunburnTimer](https://github.com/jondcallahan/sunburntimer) — calculates safe sun exposure time based on your skin type, SPF protection, sweating level, and real-time weather data. **No frameworks, no build tools, no dependencies.** Just plain HTML, CSS, and JavaScript.

## Features

- **Fitzpatrick Skin Type Selection**: Choose from 6 scientifically-based skin types
- **SPF Protection Modeling**: Account for different sunscreen strengths and degradation over time
- **Activity Level Consideration**: Factor in sweating that reduces SPF effectiveness
- **Real-time Weather Data**: Uses Open-Meteo API for UV index and weather conditions
- **Interactive Charts**: Canvas-based skin damage accumulation and UV index charts
- **Location Services**: Support for both GPS location and manual city search
- **Sun Position Visualization**: SVG arc showing the sun's path throughout the day
- **Sun Exposure Timer**: Real-time damage tracking with start/pause/stop
- **Responsive Design**: Works on desktop and mobile
- **No Dependencies**: Pure vanilla JS, CSS, and HTML — runs from any static file server

## Technology Stack

- **Frontend**: Vanilla JavaScript (ES Modules), HTML5, CSS3
- **Charts**: HTML5 Canvas (no Chart.js)
- **State Management**: Custom store with localStorage persistence (no Zustand)
- **Icons**: Inline SVG (no icon library)
- **APIs**: Open-Meteo (weather, AQI, geocoding), BigDataCloud (reverse geocoding)

## Getting Started

### Prerequisites

- Any modern browser with ES Module support
- A static file server (e.g., `python3 -m http.server`)

### Running

```bash
# Clone the repository
git clone https://github.com/MattiaWasFound/sunburntimer.git
cd sunburntimer

# Start a local server
python3 -m http.server 8000

# Open your browser
# Navigate to http://localhost:8000
```

No `npm install`, no build step — just open and go.

## Usage

1. **Select Your Skin Type**: Choose from the Fitzpatrick scale (I-VI)
2. **Choose SPF Level**: Select your sunscreen's SPF rating or "None"
3. **Set Activity Level**: Indicate how much you'll be sweating
4. **Set Location**: Use GPS or enter a city name
5. **View Results**: Get your personalized burn time, charts, and safety recommendations

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
├── css/
│   └── styles.css      # All styling (no Tailwind, no CSS framework)
└── js/
    ├── config.js       # Constants, skin/SPF/sweat configs, WMO descriptions
    ├── utils.js        # Timezone, temperature, formatting, DOM helpers
    ├── calculations.js # Core burn time algorithm (faithful port)
    ├── services.js     # API services (weather, geolocation, geocoding, AQI)
    ├── store.js        # State management with localStorage persistence
    ├── charts.js       # Canvas-based burn & UV charts
    └── app.js          # Main app: rendering, events, UI components
```

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
| React 18 + TypeScript | Vanilla JavaScript (ES Modules) |
| Vite build tool | No build step |
| Tailwind CSS + shadcn/ui | Hand-written CSS |
| Zustand + persist | Custom store + localStorage |
| Chart.js + react-chartjs-2 | HTML5 Canvas |
| date-fns + @date-fns/tz | Intl.DateTimeFormat API |
| lucide-react icons | Inline SVG |
| ios-haptics | Removed |

The core calculation algorithm is a faithful port — it produces the same results.

## License

MIT License — see the original [repository](https://github.com/jondcallahan/sunburntimer) for details.

## Acknowledgments

- Original app by [Jon Callahan](https://github.com/jondcallahan)
- Fitzpatrick skin type scale for scientific accuracy
- Open-Meteo and BigDataCloud for reliable, free data services
