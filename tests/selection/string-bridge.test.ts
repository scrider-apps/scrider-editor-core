import { describe, it, expect } from 'vitest';

import { StringBridge } from '../../src/selection';

const bridge = new StringBridge();

// ---------------------------------------------------------------------------
// htmlOffsetToDeltaIndex
// ---------------------------------------------------------------------------

describe('StringBridge.htmlOffsetToDeltaIndex', () => {
  it('plain text — offset equals delta index', () => {
    expect(bridge.htmlOffsetToDeltaIndex('Hello', 3)).toBe(3);
    expect(bridge.htmlOffsetToDeltaIndex('Hello', 0)).toBe(0);
    expect(bridge.htmlOffsetToDeltaIndex('Hello', 5)).toBe(5);
  });

  it('skips inline tags', () => {
    // <strong>Hello</strong> — "Hello" is at html offsets 8..12
    const html = '<strong>Hello</strong>';
    // offset 8 = 'H' → deltaIndex 0
    expect(bridge.htmlOffsetToDeltaIndex(html, 8)).toBe(0);
    // offset 13 = right after "Hello" (at </strong>) → deltaIndex 5
    expect(bridge.htmlOffsetToDeltaIndex(html, 13)).toBe(5);
  });

  it('skips nested tags', () => {
    const html = '<p><strong><em>Hi</em></strong></p>';
    // "Hi" starts after <p><strong><em> = 15 chars of tags
    expect(bridge.htmlOffsetToDeltaIndex(html, 15)).toBe(0);
    // After "Hi" (offset 17) = deltaIndex 2
    expect(bridge.htmlOffsetToDeltaIndex(html, 17)).toBe(2);
  });

  it('decodes &amp; as 1 character', () => {
    const html = 'A&amp;B';
    // 'A' at offset 0 → delta 0
    // '&amp;' occupies offsets 1..5, decoded = '&' = 1 delta char
    // 'B' at offset 6 → delta 2
    expect(bridge.htmlOffsetToDeltaIndex(html, 1)).toBe(1);
    expect(bridge.htmlOffsetToDeltaIndex(html, 6)).toBe(2);
    expect(bridge.htmlOffsetToDeltaIndex(html, 7)).toBe(3);
  });

  it('decodes &lt; and &gt; as 1 character each', () => {
    const html = '&lt;div&gt;';
    // &lt; (offsets 0..3) = '<' = 1 delta char
    // 'div' (offsets 4..6) = 3 delta chars
    // &gt; (offsets 7..10) = '>' = 1 delta char
    expect(bridge.htmlOffsetToDeltaIndex(html, 4)).toBe(1); // after &lt;
    expect(bridge.htmlOffsetToDeltaIndex(html, 7)).toBe(4); // after 'div'
    expect(bridge.htmlOffsetToDeltaIndex(html, 11)).toBe(5); // after &gt;
  });

  it('decodes numeric entities', () => {
    const html = '&#65;BC'; // &#65; = 'A'
    expect(bridge.htmlOffsetToDeltaIndex(html, 5)).toBe(1); // after &#65;
    expect(bridge.htmlOffsetToDeltaIndex(html, 7)).toBe(3); // after 'BC'
  });

  it('decodes hex entities', () => {
    const html = '&#x41;BC'; // &#x41; = 'A'
    expect(bridge.htmlOffsetToDeltaIndex(html, 6)).toBe(1); // after &#x41;
    expect(bridge.htmlOffsetToDeltaIndex(html, 8)).toBe(3); // after 'BC'
  });

  it('void elements (img) count as 1 delta character', () => {
    const html = 'A<img src="x.png"/>B';
    // 'A' offset 0 → delta 0
    // <img.../> is void → delta 1 (embed)
    // 'B' after the tag → delta 2
    expect(bridge.htmlOffsetToDeltaIndex(html, 1)).toBe(1); // after 'A'
    expect(bridge.htmlOffsetToDeltaIndex(html, 19)).toBe(2); // after <img.../>
    expect(bridge.htmlOffsetToDeltaIndex(html, 20)).toBe(3); // after 'B'
  });

  it('br counts as 1 delta character', () => {
    const html = 'Line1<br>Line2';
    expect(bridge.htmlOffsetToDeltaIndex(html, 5)).toBe(5); // after 'Line1'
    expect(bridge.htmlOffsetToDeltaIndex(html, 9)).toBe(6); // after <br>
    expect(bridge.htmlOffsetToDeltaIndex(html, 14)).toBe(11); // after 'Line2'
  });

  it('returns 0 for empty HTML', () => {
    expect(bridge.htmlOffsetToDeltaIndex('', 0)).toBe(0);
  });

  it('handles offset beyond HTML length', () => {
    expect(bridge.htmlOffsetToDeltaIndex('Hi', 10)).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// deltaIndexToHtmlOffset
// ---------------------------------------------------------------------------

describe('StringBridge.deltaIndexToHtmlOffset', () => {
  it('plain text — delta index equals html offset', () => {
    expect(bridge.deltaIndexToHtmlOffset('Hello', 3)).toBe(3);
    expect(bridge.deltaIndexToHtmlOffset('Hello', 0)).toBe(0);
  });

  it('accounts for tags when mapping delta index to html offset', () => {
    const html = '<strong>Hello</strong>';
    // delta 0 = 'H' at html offset 8
    expect(bridge.deltaIndexToHtmlOffset(html, 0)).toBe(8);
    // delta 3 = 'l' at html offset 11
    expect(bridge.deltaIndexToHtmlOffset(html, 3)).toBe(11);
  });

  it('accounts for entities', () => {
    const html = 'A&amp;B';
    // delta 0 = 'A' at offset 0
    expect(bridge.deltaIndexToHtmlOffset(html, 0)).toBe(0);
    // delta 1 = '&' (entity &amp;) at offset 1
    expect(bridge.deltaIndexToHtmlOffset(html, 1)).toBe(1);
    // delta 2 = 'B' at offset 6
    expect(bridge.deltaIndexToHtmlOffset(html, 2)).toBe(6);
  });

  it('accounts for void elements', () => {
    const html = 'A<img src="x.png"/>B';
    // delta 1 = img embed, at html offset 1
    expect(bridge.deltaIndexToHtmlOffset(html, 1)).toBe(1);
    // delta 2 = 'B' at html offset 19
    expect(bridge.deltaIndexToHtmlOffset(html, 2)).toBe(19);
  });

  it('returns 0 for index 0 in any HTML', () => {
    expect(bridge.deltaIndexToHtmlOffset('<p>Hi</p>', 0)).toBe(3);
    expect(bridge.deltaIndexToHtmlOffset('', 0)).toBe(0);
  });

  it('roundtrip: htmlOffset → deltaIndex → htmlOffset (text positions only)', () => {
    const html = '<p>Hello <strong>World</strong></p>';
    // Only offsets pointing to the START of a text character are valid for roundtrip.
    // 3='H', 8=' ', 17='W', 21='d'  (offset 22 is </strong> tag — no roundtrip)
    const testOffsets = [3, 8, 17, 21];

    for (const offset of testOffsets) {
      const deltaIdx = bridge.htmlOffsetToDeltaIndex(html, offset);
      const backOffset = bridge.deltaIndexToHtmlOffset(html, deltaIdx);
      expect(backOffset).toBe(offset);
    }
  });
});
