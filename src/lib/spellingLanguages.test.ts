import { describe, expect, it } from 'vitest';
import { systemSpellingLanguages } from './spellingLanguages';

describe('systemSpellingLanguages', () => {
    it('takes the first system language with a dictionary, by language alone', () => {
        expect(systemSpellingLanguages(['de-DE', 'fr-CA', 'en-US'])).toEqual(['fr']);
        expect(systemSpellingLanguages(['es-419'])).toEqual(['es']);
        expect(systemSpellingLanguages(['en-GB'])).toEqual(['en-US']);
        expect(systemSpellingLanguages(['it_IT'])).toEqual(['it']);
    });

    it('falls back to English (US)', () => {
        expect(systemSpellingLanguages([])).toEqual(['en-US']);
        expect(systemSpellingLanguages(['ja-JP', 'de'])).toEqual(['en-US']);
    });

    it('skips POSIX locales and empty tags, ignoring case', () => {
        expect(systemSpellingLanguages(['C', 'POSIX', '', 'fR-Fr'])).toEqual(['fr']);
    });
});
