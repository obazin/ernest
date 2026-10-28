import rawConfig from '../../ernest.config.json';

/**
 * Tuning values baked into the build from `ernest.config.json` at the
 * project root. Unlike user settings, these are chosen by developers, so a
 * malformed file fails loudly at startup instead of falling back silently.
 */
export interface Config {
    typewriter: {
        /** The scroll to a new line when the cursor moves without typing. */
        glide: {
            /** 0 turns gliding off. */
            durationMs: number;
            easing: Easing;
        };
    };
}

export const easings = {
    linear: (progress: number) => progress,
    easeIn: (progress: number) => progress * progress,
    easeOut: (progress: number) => 1 - (1 - progress) * (1 - progress),
    easeInOut: (progress: number) =>
        progress < 0.5 ? 2 * progress * progress : 1 - 2 * (1 - progress) * (1 - progress),
} as const;

export type Easing = keyof typeof easings;

export class ConfigError extends Error {
    constructor(path: string, expected: string, value: unknown) {
        super(`ernest.config.json: ${path} must be ${expected}, got ${JSON.stringify(value)}`);
        this.name = 'ConfigError';
    }
}

/** Validates the parsed file; throws a `ConfigError` naming the first bad value. */
export function parseConfig(source: unknown): Config {
    const typewriter = object(source, 'typewriter');
    const glide = object(typewriter, 'typewriter.glide');

    const durationMs = glide.durationMs;
    if (typeof durationMs !== 'number' || !Number.isFinite(durationMs) || durationMs < 0) {
        throw new ConfigError('typewriter.glide.durationMs', 'a number of at least 0', durationMs);
    }

    const easing = glide.easing;
    if (typeof easing !== 'string' || !Object.hasOwn(easings, easing)) {
        throw new ConfigError(
            'typewriter.glide.easing',
            `one of ${Object.keys(easings).join(', ')}`,
            easing,
        );
    }

    return { typewriter: { glide: { durationMs, easing: easing as Easing } } };
}

/** Reads `path`'s last segment from `parent`, requiring a plain object. */
function object(parent: unknown, path: string): Record<string, unknown> {
    const key = path.split('.').at(-1) as string;
    const value = (parent as Record<string, unknown> | undefined)?.[key];
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new ConfigError(path, 'an object', value);
    }
    return value as Record<string, unknown>;
}

export const config: Config = parseConfig(rawConfig);
