/**
 * Runs asynchronous tasks one at a time, in the order they were queued. A
 * task that fails does not hold up the next one, and its caller still sees
 * the failure. Saving uses it so two writes never check and replace the same
 * file at once.
 */
export function createSerialQueue() {
    let last: Promise<unknown> = Promise.resolve();
    return function run<T>(task: () => Promise<T>): Promise<T> {
        const result = last.then(task);
        last = result.catch(() => undefined);
        return result;
    };
}
