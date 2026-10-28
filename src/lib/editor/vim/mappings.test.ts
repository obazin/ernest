import { describe, expect, it } from 'vitest';
import { parseMappings } from './mappings';

describe('parseMappings', () => {
    it('reads every mapping command with its context', () => {
        const { mappings, errors } = parseMappings(
            [
                'map Q gq',
                'nmap Y y$',
                'vmap < <gv',
                'xmap > >gv',
                'imap jj <Esc>',
                'omap ip ap',
            ].join('\n'),
        );
        expect(errors).toEqual([]);
        expect(mappings.map(({ lhs, context }) => [lhs, context])).toEqual([
            ['Q', undefined],
            ['Y', 'normal'],
            ['<', 'visual'],
            ['>', 'visual'],
            ['jj', 'insert'],
            ['ip', 'operatorPending'],
        ]);
    });

    it('tells noremap from map and keeps the rest of the line as the target', () => {
        const [mapping] = parseMappings('nnoremap <C-s> :w<CR>').mappings;
        expect(mapping).toEqual({
            line: 1,
            lhs: '<C-s>',
            rhs: ':w<CR>',
            context: 'normal',
            noremap: true,
        });
        expect(parseMappings('nmap gs :s/a b/c/<CR>').mappings[0].rhs).toBe(':s/a b/c/<CR>');
    });

    it('accepts ex command mappings only without a mode', () => {
        expect(parseMappings('map :W :w').errors).toEqual([]);
        expect(parseMappings('nmap :W :w').errors).toEqual([
            "Line 1: ex commands are mapped with 'map', not 'nmap'",
        ]);
    });

    it('skips blank lines and comments', () => {
        const { mappings, errors } = parseMappings('\n" a comment\n   \nnmap Y y$\n');
        expect(errors).toEqual([]);
        expect(mappings).toHaveLength(1);
        expect(mappings[0].line).toBe(4);
    });

    it('reports unknown commands, unmap and missing keys with their line', () => {
        const { mappings, errors } = parseMappings('set number\nunmap K\nnmap Y\nnmap Y y$');
        expect(mappings).toHaveLength(1);
        expect(errors).toEqual([
            "Line 1: 'set' is not a mapping command (nmap, inoremap, …)",
            "Line 2: 'unmap' is not a mapping command (nmap, inoremap, …)",
            "Line 3: 'nmap' needs keys and what they map to",
        ]);
    });
});
