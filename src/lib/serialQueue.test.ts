import { describe, expect, it } from 'vitest';
import { createSerialQueue } from './serialQueue';

describe('createSerialQueue', () => {
    it('runs tasks one at a time, in order', async () => {
        const run = createSerialQueue();
        const events: string[] = [];
        const task = (name: string, delay: number) => async () => {
            events.push(`${name} start`);
            await new Promise((resolve) => setTimeout(resolve, delay));
            events.push(`${name} end`);
            return name;
        };

        const results = await Promise.all([run(task('slow', 20)), run(task('fast', 0))]);

        expect(results).toEqual(['slow', 'fast']);
        expect(events).toEqual(['slow start', 'slow end', 'fast start', 'fast end']);
    });

    it('hands a failure to its caller without holding up the next task', async () => {
        const run = createSerialQueue();
        const failing = run(async () => {
            throw new Error('disk full');
        });
        const next = run(async () => 'written');

        await expect(failing).rejects.toThrow('disk full');
        await expect(next).resolves.toBe('written');
    });
});
