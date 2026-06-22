import { useEffect, useState } from "react";
import {
	fetchSunburnCounter,
	recordSunburnAvoided,
} from "@/services/sunburn-counter";

type SunburnCounterProps = {
	shouldRecord: boolean;
};

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

export function SunburnCounter({ shouldRecord }: SunburnCounterProps) {
	const [count, setCount] = useState<number | null>(null);

	useEffect(() => {
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
	}, []);

	useEffect(() => {
		if (!shouldRecord) {
			return;
		}

		let ignore = false;

		recordSunburnAvoided()
			.then((nextCount) => {
				if (!ignore) {
					setCount((currentCount) => getNewestCount(currentCount, nextCount));
				}
			})
			.catch(() => undefined);

		return () => {
			ignore = true;
		};
	}, [shouldRecord]);

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
