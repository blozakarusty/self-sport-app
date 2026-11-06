// See https://svelte.dev/docs/kit/types#app.d.ts
import type { Athlete } from '#lib/server/db/schema.ts';

declare global {
	namespace App {
		interface Locals {
			athlete: Athlete | null;
		}
	}
}

export {};
