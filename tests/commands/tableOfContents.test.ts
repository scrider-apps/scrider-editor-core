import { describe, expect, it } from 'vitest';
import { Delta, isInsert, isTextInsert } from '@scrider/delta';

import {
  TOC_BOTTOM_ID,
  TOC_HEADING_TEXT,
  TOC_TOP_ID,
  applyTableOfContentsToDelta,
  collectHeadingAnchors,
  collectHeadingLinkTargets,
  insertContentsList,
  parseDocumentHashHref,
} from '../../src/commands/tableOfContents';
import { createEditorState } from '../../src/state';

describe('parseDocumentHashHref', () => {
  it('reads a document hash and skips draft / external hrefs', () => {
    expect(parseDocumentHashHref('#getting-started')).toBe('getting-started');
    expect(parseDocumentHashHref('#caf%C3%A9-cr%C3%A8me')).toBe('café-crème');
    expect(parseDocumentHashHref('#')).toBeNull();
    expect(parseDocumentHashHref('https://example.com#frag')).toBeNull();
  });
});

describe('collectHeadingAnchors', () => {
  it('uses header-id when present and slugifies the rest like GitHub', () => {
    const delta = new Delta()
      .insert('Title')
      .insert('\n', { header: 1 })
      .insert('Getting Started')
      .insert('\n', { header: 2 })
      .insert('Installation')
      .insert('\n', { header: 2, 'header-id': 'install' })
      .insert('FAQ')
      .insert('\n', { header: 2 })
      .insert('FAQ')
      .insert('\n', { header: 2 });

    const anchors = collectHeadingAnchors(delta);
    expect(anchors.map((a) => a.id)).toEqual([
      'title',
      'getting-started',
      'install',
      'faq',
      'faq-1',
    ]);
    expect(anchors[2]?.customId).toBe(true);
  });
});

describe('collectHeadingLinkTargets', () => {
  it('collects hash targets and ignores draft links', () => {
    const delta = new Delta()
      .insert('Jump', { link: '#getting-started' })
      .insert('\n')
      .insert('Draft', { link: '#' })
      .insert('\n')
      .insert('Docs', { link: 'https://example.com' })
      .insert('\n');

    expect([...collectHeadingLinkTargets(delta.ops)]).toEqual(['getting-started']);
  });
});

describe('applyTableOfContentsToDelta', () => {
  it('inserts a nested list after the H1 at the top', () => {
    const delta = new Delta()
      .insert('Guide')
      .insert('\n', { header: 1 })
      .insert('\n')
      .insert('Setup')
      .insert('\n', { header: 2 })
      .insert('CLI')
      .insert('\n', { header: 3 });

    const { delta: next } = applyTableOfContentsToDelta(delta, 'top');
    const anchors = collectHeadingAnchors(next);
    expect(anchors[1]).toMatchObject({ id: TOC_TOP_ID, text: TOC_HEADING_TEXT });

    const text = next.ops
      .filter(isTextInsert)
      .map((op) => op.insert)
      .join('');
    expect(text).toContain('Setup');
    expect(next.ops.some((op) => isInsert(op) && op.attributes?.link === '#setup')).toBe(true);
    expect(
      next.ops.some((op) => isInsert(op) && op.attributes?.link === '#cli' && op.insert === 'CLI'),
    ).toBe(true);
    expect(next.ops.some((op) => isInsert(op) && op.attributes?.link === '#guide')).toBe(false);
    expect(
      next.ops.some(
        (op) =>
          isTextInsert(op) &&
          op.insert === '\n' &&
          op.attributes?.list === 'bullet' &&
          op.attributes?.indent === 1,
      ),
    ).toBe(true);
  });

  it('writes top and bottom lists and removes both on off', () => {
    const delta = new Delta().insert('Setup').insert('\n', { header: 2 }).insert('Body\n');

    const both = applyTableOfContentsToDelta(delta, 'both').delta;
    const ids = collectHeadingAnchors(both).map((a) => a.id);
    expect(ids.filter((id) => id === TOC_TOP_ID || id === TOC_BOTTOM_ID)).toEqual([
      TOC_TOP_ID,
      TOC_BOTTOM_ID,
    ]);

    const off = applyTableOfContentsToDelta(both, 'off').delta;
    expect(collectHeadingAnchors(off).map((a) => a.id)).toEqual(['setup']);
  });

  it('replaces an existing TOC instead of stacking another copy', () => {
    const delta = new Delta().insert('Setup').insert('\n', { header: 2 }).insert('Body\n');
    const once = applyTableOfContentsToDelta(delta, 'top').delta;
    const twice = applyTableOfContentsToDelta(once, 'top').delta;
    const tocCount = collectHeadingAnchors(twice).filter((a) => a.id === TOC_TOP_ID).length;
    expect(tocCount).toBe(1);
  });
});

describe('insertContentsList', () => {
  it('lists H1–H3 below the current line, skips the title above and H4+', () => {
    const delta = new Delta()
      .insert('Guide')
      .insert('\n', { header: 1 })
      .insert('Setup')
      .insert('\n', { header: 2 })
      .insert('CLI')
      .insert('\n', { header: 3 })
      .insert('Deep')
      .insert('\n', { header: 4 })
      .insert('Body\n');
    // Caret on the H1 line → title stays out; sections below are listed.
    const state = createEditorState({ delta, selection: { index: 5, length: 0 } });
    const next = insertContentsList(state);

    expect(next.delta.ops.some((op) => isInsert(op) && op.attributes?.link === '#guide')).toBe(
      false,
    );
    expect(next.delta.ops.some((op) => isInsert(op) && op.attributes?.link === '#setup')).toBe(
      true,
    );
    expect(next.delta.ops.some((op) => isInsert(op) && op.attributes?.link === '#cli')).toBe(true);
    expect(next.delta.ops.some((op) => isInsert(op) && op.attributes?.link === '#deep')).toBe(
      false,
    );
    expect(
      next.delta.ops.some(
        (op) =>
          isTextInsert(op) &&
          op.insert === '\n' &&
          op.attributes?.list === 'bullet' &&
          op.attributes?.indent === 1,
      ),
    ).toBe(true);
    expect(next).not.toBe(state);
  });

  it('is a no-op when there are no H1–H3 headings below the caret', () => {
    const delta = new Delta().insert('Body\n');
    const state = createEditorState({ delta, selection: { index: 0, length: 0 } });
    expect(insertContentsList(state)).toBe(state);
  });

  it('replaces an empty paragraph and omits headings above it', () => {
    const delta = new Delta()
      .insert('Guide')
      .insert('\n', { header: 1 })
      .insert('\n')
      .insert('Setup')
      .insert('\n', { header: 2 });
    const state = createEditorState({ delta, selection: { index: 6, length: 0 } });
    const next = insertContentsList(state);
    expect(next.delta.ops.some((op) => isInsert(op) && op.attributes?.link === '#guide')).toBe(
      false,
    );
    expect(next.delta.ops.some((op) => isInsert(op) && op.attributes?.link === '#setup')).toBe(
      true,
    );
  });
});
