import { useEffect, useState } from "react";
import {
	fetchSunburnCounter,
	recordSunburnAvoided,
} from "@/services/sunburn-counter";

type SunburnCounterProps = {
	hasPreloadedPrefs: boolean;
	shouldRecord: boolean;
};

let hasRecordedCounterThisSession = false;

function getCounterDigits(count: number) {
	return Math.max(0, Math.floor(count)).toLocaleString("en-US", {
		useGrouping: true,
	});
}

function getCounterDigitItems(count: number) {
	const seenDigits = new Map<string, number>();

	return getCounterDigits(count)
		.split("")
		.map((digit) => {
			const seenCount = seenDigits.get(digit) ?? 0;
			seenDigits.set(digit, seenCount + 1);

			return {
				digit,
				key: `${digit}-${seenCount}`,
			};
		});
}

function getNewestCount(currentCount: number | null, nextCount: number | null) {
	if (nextCount === null) {
		return currentCount;
	}

	return currentCount === null ? nextCount : Math.max(currentCount, nextCount);
}

export function SunburnCounter({
	hasPreloadedPrefs,
	shouldRecord,
}: SunburnCounterProps) {
	const [count, setCount] = useState<number | null>(null);

	useEffect(() => {
		if ((hasPreloadedPrefs || shouldRecord) && !hasRecordedCounterThisSession) {
			return;
		}

		let ignore = false;

		fetchSunburnCounter()
			.then((nextCount) => {
				if (!ignore) {
					setCount((currentCount) => getNewestCount(currentCount, nextCount));
				}
			})
			.catch(() => {
				if (!ignore) {
					setCount(null);
				}
			});

		return () => {
			ignore = true;
		};
	}, [hasPreloadedPrefs, shouldRecord]);

	useEffect(() => {
		if (!shouldRecord || hasRecordedCounterThisSession) {
			return;
		}

		let ignore = false;
		hasRecordedCounterThisSession = true;

		const restoreCachedCounter = () => {
			if (!hasPreloadedPrefs || ignore) {
				return;
			}

			fetchSunburnCounter()
				.then((fallbackCount) => {
					if (!ignore) {
						setCount((currentCount) =>
							getNewestCount(currentCount, fallbackCount),
						);
					}
				})
				.catch(() => undefined);
		};

		if (hasPreloadedPrefs) {
			setCount(null);
		}

		recordSunburnAvoided()
			.then((nextCount) => {
				if (nextCount === null) {
					hasRecordedCounterThisSession = false;
					restoreCachedCounter();
					return;
				}

				if (!ignore) {
					setCount((currentCount) => getNewestCount(currentCount, nextCount));
				}
			})
			.catch(() => {
				hasRecordedCounterThisSession = false;
				restoreCachedCounter();
			});

		return () => {
			ignore = true;
		};
	}, [hasPreloadedPrefs, shouldRecord]);

	if (count === null) {
		return null;
	}

	const digits = getCounterDigitItems(count);

	return (
		<div className="sunburn-counter">
			<span className="sr-only">{count} sunburns avoided</span>
			<div className="sunburn-counter__display" aria-hidden="true">
				{digits.map(({ digit, key }) => (
					<span
						className="sunburn-counter__digit"
						key={key}
						data-comma={digit === "," ? "true" : undefined}
					>
						{digit}
					</span>
				))}
			</div>
			<span className="sunburn-counter__label">sunburns avoided</span>
		</div>
	);
}
