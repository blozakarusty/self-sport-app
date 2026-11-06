/** Clean axis ticks from 0 to a rounded max (e.g. 0/20/40/60). */
export function niceTicks(max: number, count = 4): number[] {
	if (max <= 0) return [0, 1];
	const raw = max / count;
	const mag = 10 ** Math.floor(Math.log10(raw));
	const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw)!;
	const ticks = [];
	for (let v = 0; v <= max + step * 0.999; v += step) ticks.push(Math.round(v * 100) / 100);
	return ticks;
}

/** SVG path for a column with a 4px rounded top and a square base. */
export function columnPath(x: number, y: number, w: number, h: number, r = 4): string {
	if (h <= 0) return '';
	const rr = Math.min(r, w / 2, h);
	return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}
