export const FitzpatrickType = {
	I: "I",
	II: "II",
	III: "III",
	IV: "IV",
	V: "V",
	VI: "VI",
};

export const SPFLevel = {
	NONE: "NONE",
	SPF_15: "SPF_15",
	SPF_30: "SPF_30",
	SPF_50_PLUS: "SPF_50_PLUS",
};

export const SweatLevel = {
	LOW: "LOW",
	MEDIUM: "MEDIUM",
	HIGH: "HIGH",
};

export const SKIN_TYPE_CONFIG = {
	[FitzpatrickType.I]: {
		color: "#F5D0B3",
		subtitle: "Very Light",
		description: "Burns easily, often has freckles",
		coefficient: 2.5,
		hairColors: ["Red", "Blond", "Brown"],
		eyeColors: ["Blue", "Green", "Gray", "Brown"],
		freckles: "Common",
		emoji: "\u270B\uD83C\uDFFB",
	},
	[FitzpatrickType.II]: {
		color: "#E7B592",
		subtitle: "Light",
		description: "Burns easily, tans minimally",
		coefficient: 3.125,
		hairColors: ["Light", "Dark"],
		eyeColors: ["Blue", "Green", "Hazel", "Brown", "Gray"],
		freckles: "Rare",
		emoji: "\u270B\uD83C\uDFFB",
	},
	[FitzpatrickType.III]: {
		color: "#D19F7F",
		subtitle: "Medium",
		description: "Burns moderately, tans gradually",
		coefficient: 4.375,
		hairColors: ["Brown"],
		eyeColors: ["Blue", "Green", "Brown", "Black"],
		freckles: "None",
		emoji: "\u270B\uD83C\uDFFC",
	},
	[FitzpatrickType.IV]: {
		color: "#BB7955",
		subtitle: "Olive",
		description: "Burns rarely, tans easily",
		coefficient: 5.625,
		hairColors: ["Dark Brown", "Black"],
		eyeColors: ["Blue", "Brown", "Green", "Black"],
		freckles: "None",
		emoji: "\u270B\uD83C\uDFFD",
	},
	[FitzpatrickType.V]: {
		color: "#A55E31",
		subtitle: "Brown",
		description: "Very rarely burns, tans deeply",
		coefficient: 7.5,
		hairColors: ["Black"],
		eyeColors: ["Brown", "Black"],
		freckles: "None",
		emoji: "\u270B\uD83C\uDFFE",
	},
	[FitzpatrickType.VI]: {
		color: "#3A1F1C",
		subtitle: "Very Dark",
		description: "Almost never burns, naturally dark",
		coefficient: 12.5,
		hairColors: ["Black"],
		eyeColors: ["Black"],
		freckles: "None",
		emoji: "\u270B\uD83C\uDFFF",
	},
};

export const SPF_CONFIG = {
	[SPFLevel.NONE]: { label: "None", coefficient: 1.0 },
	[SPFLevel.SPF_15]: { label: "SPF 15", coefficient: 15.0 },
	[SPFLevel.SPF_30]: { label: "SPF 30", coefficient: 30.0 },
	[SPFLevel.SPF_50_PLUS]: { label: "SPF 50+", coefficient: 50.0 },
};

export const SWEAT_CONFIG = {
	[SweatLevel.LOW]: { label: "None", startHours: 0, durationHours: 0 },
	[SweatLevel.MEDIUM]: { label: "Some", startHours: 2.0, durationHours: 12.0 },
	[SweatLevel.HIGH]: { label: "Profuse", startHours: 1.0, durationHours: 6.0 },
};

export const DEFAULT_SWEAT_LEVEL = SweatLevel.LOW;

export const CALCULATION_CONSTANTS = {
	BASE_DAMAGE_TIME: 200.0,
	UV_SCALING_FACTOR: 3.0,
	DAMAGE_THRESHOLD: 100.0,
	SAFETY_THRESHOLD: 95.0,
	MAX_CALCULATION_POINTS: 26,
	EVENING_CUTOFF_HOUR: 22,
	MIN_POINTS_FOR_EVENING_STOP: 11,
	MIN_UV_THRESHOLD: 0.001,
	MEANINGFUL_UV_THRESHOLD: 2.0,
	HIGH_RISK_TIME_LIMIT_HOURS: 4,
	EVENING_RISK_CUTOFF_HOUR: 18,
	LOW_UV_SMOOTHSTEP_ENABLED: true,
	LOW_UV_RAMP_LOW: 1.0,
	LOW_UV_RAMP_HIGH: 3.0,
};

export const TIME_SLICE_OPTIONS = [30, 12, 6, 4];

export const SWEAT_INDEX_BANDS = [
	{ min: 160, rangeLabel: "160+", label: "Oppressive", description: "Extremely hot and humid", badgeClass: "si-red", textClass: "text-red-700" },
	{ min: 150, rangeLabel: "150-159", label: "Very muggy", description: "Very hot and sticky", badgeClass: "si-orange", textClass: "text-orange-700" },
	{ min: 140, rangeLabel: "140-149", label: "Muggy", description: "Hot and humid", badgeClass: "si-amber", textClass: "text-amber-700" },
	{ min: 130, rangeLabel: "130-139", label: "Warm", description: "Warm and slightly humid", badgeClass: "si-yellow", textClass: "text-yellow-700" },
	{ min: -Infinity, rangeLabel: "<130", label: "Comfortable", description: "Pleasant to be outside", badgeClass: "si-emerald", textClass: "text-emerald-700" },
];

export const ENVIRONMENTAL_MULTIPLIERS = {
	SNOW: 1.88,
	SAND: 1.15,
	SHADE: 0.5,
};

export const WMO_DESCRIPTIONS = {
	"0": "Sunny", "1": "Partly Cloudy", "2": "Partly Cloudy", "3": "Cloudy",
	"4": "Smoky", "5": "Hazy", "6": "Dusty Air", "7": "Blowing Dust",
	"8": "Dust Whirls", "9": "Duststorm", "10": "Mist", "11": "Foggy",
	"12": "Foggy", "13": "Lightning", "14": "Visible Precipitation", "15": "Distant Rain",
	"16": "Nearby Rain", "17": "Thunderstorm", "18": "Windy", "19": "Funnel Cloud",
	"20": "Drizzle/Snow Grains", "21": "Light Rain", "22": "Light Snow", "23": "Snowing",
	"24": "Freezing Drizzle", "25": "Rain Showers", "26": "Snow Showers", "27": "Hail Showers",
	"28": "Foggy", "29": "Thunderstorm", "30": "Light Duststorm", "31": "Duststorm",
	"32": "Duststorm", "33": "Severe Duststorm", "34": "Severe Duststorm", "35": "Severe Duststorm",
	"36": "Blowing Snow", "37": "Heavy Snow", "38": "Blowing Snow", "39": "Heavy Snowfall",
	"40": "Foggy", "41": "Patchy Fog", "42": "Foggy", "43": "Foggy",
	"44": "Foggy", "45": "Foggy", "46": "Foggy", "47": "Foggy",
	"48": "Rime Foggy", "49": "Rime Foggy", "50": "Light Drizzle", "51": "Light Drizzle",
	"52": "Moderate Drizzle", "53": "Moderate Drizzle", "54": "Heavy Drizzle", "55": "Heavy Drizzle",
	"56": "Freezing Drizzle", "57": "Freezing Drizzle", "58": "Drizzle & Rain", "59": "Heavy Rain",
	"60": "Light Rain", "61": "Steady Light Rain", "62": "Sudden Rain", "63": "Steady Rain",
	"64": "Heavy Intermittent Rain", "65": "Heavy Continuous Rain", "66": "Slight Rain", "67": "Heavy Rain",
	"68": "Slight Rain-Snow", "69": "Moderate Rain-Snow", "70": "Slight Snowflakes", "71": "Slight Snowfall",
	"72": "Moderate Snowfall", "73": "Snow Storm", "74": "Flurry", "75": "Snowfall",
	"76": "Diamond Dust", "77": "Tiny Snowfall", "78": "Snowflakes", "79": "Ice Pellets",
	"80": "Slight Rain", "81": "Heavy Rain", "82": "Heavy Rainfall", "83": "Slight Rain & Snow",
	"84": "Heavy Rain & Snow", "85": "Slight Snow", "86": "Heavy Snowr", "87": "Hail",
	"88": "Heavy Hail", "89": "Slight Hail Shower", "90": "Heavy Hail Shower", "91": "Slight Rain",
	"92": "Heavy Rain", "93": "Slight Snow", "94": "Heavy Rain", "95": "Thunderstorm",
	"96": "Thunderstorm", "97": "Heavy Thunderstorm", "98": "Mixed Storm", "99": "Thunderstorm",
};

export const FAHRENHEIT_COUNTRY_CODES = new Set(["BS", "BZ", "KY", "PR", "PW", "US"]);
