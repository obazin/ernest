import { describe, expect, it } from 'vitest';
import { ConfigError, easings, parseConfig } from './config';
import rawConfig from '../../ernest.config.json';

const vim = { yankFlash: { durationMs: 150 } };
const valid = { typewriter: { glide: { durationMs: 60, easing: 'easeOut' } }, vim };

describe('parseConfig', () => {
    it('accepts the shipped file', () => {
        expect(() => parseConfig(rawConfig)).not.toThrow();
    });

    it('keeps valid values', () => {
        expect(parseConfig(valid)).toEqual(valid);
    });

    it('rejects missing sections, naming the path', () => {
        expect(() => parseConfig({})).toThrow(/typewriter must be an object/);
        expect(() => parseConfig({ typewriter: {} })).toThrow(/typewriter\.glide must be/);
    });

    it('rejects negative or non-numeric durations', () => {
        for (const durationMs of [-1, '60', Number.NaN]) {
            expect(() =>
                parseConfig({ typewriter: { glide: { durationMs, easing: 'linear' } }, vim }),
            ).toThrow(ConfigError);
        }
    });

    it('rejects a missing or negative yank flash duration', () => {
        const typewriter = valid.typewriter;
        expect(() => parseConfig({ typewriter })).toThrow(/vim must be an object/);
        expect(() => parseConfig({ typewriter, vim: { yankFlash: { durationMs: -5 } } })).toThrow(
            /vim\.yankFlash\.durationMs must be a number of at least 0/,
        );
    });

    it('rejects unknown easings, including inherited keys', () => {
        for (const easing of ['bounce', 'toString']) {
            expect(() =>
                parseConfig({ typewriter: { glide: { durationMs: 60, easing } }, vim }),
            ).toThrow(/one of linear, easeIn, easeOut, easeInOut/);
        }
    });
});

describe('easings', () => {
    it('start at 0 and end at 1', () => {
        for (const ease of Object.values(easings)) {
            expect(ease(0)).toBe(0);
            expect(ease(1)).toBe(1);
        }
    });
});
