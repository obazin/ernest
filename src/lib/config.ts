import rawConfig from '../../ernest.config.json';

/**
 * Tuning values baked into the build from `ernest.config.json` at the
 * project root. Unlike user settings, these are chosen by developers, so a
 * malformed file fails loudly at startup instead of falling back silently.
 */
export interface Config {
    typewriter: {
        /**
         * The scroll to a new line when the cursor moves without typing; its
         * duration is a user setting.
         */
        glide: {
            easing: Easing;
        };
    };
    vim: {
        /** The highlight on text just yanked. */
        yankFlash: {
            /** 0 turns the flash off. */
            durationMs: number;
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
    const easing = glide.easing;
    if (typeof easing !== 'string' || !Object.hasOwn(easings, easing)) {
        throw new ConfigError(
            'typewriter.glide.easing',
            `one of ${Object.keys(easings).join(', ')}`,
            easing,
        );
    }

    const vim = object(source, 'vim');
    const yankFlash = object(vim, 'vim.yankFlash');

    return {
        typewriter: {
            glide: { easing: easing as Easing },
        },
        vim: { yankFlash: { durationMs: duration(yankFlash, 'vim.yankFlash.durationMs') } },
    };
}

/** Reads `path`'s last segment from `parent`, requiring a number of milliseconds. */
function duration(parent: Record<string, unknown>, path: string): number {
    const value = parent[path.split('.').at(-1) as string];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
        throw new ConfigError(path, 'a number of at least 0', value);
    }
    return value;
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
