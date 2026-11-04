import { describe, it, expect } from 'vitest';

import { matchInputRule } from '../../src/input-rules/matcher';
import { defaultInputRules } from '../../src/input-rules/defaults';
import type { InputRule } from '../../src/input-rules/types';

describe('matchInputRule — defaultInputRules', () => {
  it('"- " → setList(bullet)', () => {
    const result = matchInputRule('- ', defaultInputRules);
    expect(result?.rule.command).toBe('setList');
    expect(result?.rule.args).toEqual(['bullet', { toggle: false }]);
  });

  it('"* " → setList(bullet)', () => {
    const result = matchInputRule('* ', defaultInputRules);
    expect(result?.rule.command).toBe('setList');
    expect(result?.rule.args).toEqual(['bullet', { toggle: false }]);
  });

  it('"1. " → setList(ordered)', () => {
    const result = matchInputRule('1. ', defaultInputRules);
    expect(result?.rule.command).toBe('setList');
    expect(result?.rule.args).toEqual(['ordered', { toggle: false }]);
  });

  it('"4. " → setList(ordered) (continue after an existing list)', () => {
    const result = matchInputRule('4. ', defaultInputRules);
    expect(result?.rule.command).toBe('setList');
    expect(result?.rule.args).toEqual(['ordered', { toggle: false }]);
  });

  it('"[] " → setList(unchecked)', () => {
    const result = matchInputRule('[] ', defaultInputRules);
    expect(result?.rule.command).toBe('setList');
    expect(result?.rule.args).toEqual(['unchecked', { toggle: false }]);
  });

  it('"[x] " → setList(checked)', () => {
    const result = matchInputRule('[x] ', defaultInputRules);
    expect(result?.rule.command).toBe('setList');
    expect(result?.rule.args).toEqual(['checked', { toggle: false }]);
  });

  it('"- [ ] " → setList(unchecked) (GFM, before generic bullet)', () => {
    const result = matchInputRule('- [ ] ', defaultInputRules);
    expect(result?.rule.command).toBe('setList');
    expect(result?.rule.args).toEqual(['unchecked', { toggle: false }]);
  });

  it('"- [x] " → setList(checked) (GFM)', () => {
    const result = matchInputRule('- [x] ', defaultInputRules);
    expect(result?.rule.command).toBe('setList');
    expect(result?.rule.args).toEqual(['checked', { toggle: false }]);
  });

  it('"* [X] " → setList(checked)', () => {
    const result = matchInputRule('* [X] ', defaultInputRules);
    expect(result?.rule.command).toBe('setList');
    expect(result?.rule.args).toEqual(['checked', { toggle: false }]);
  });

  it('"> " → toggleBlockquote', () => {
    const result = matchInputRule('> ', defaultInputRules);
    expect(result?.rule.command).toBe('toggleBlockquote');
  });

  it('"# " → setHeader(1)', () => {
    const result = matchInputRule('# ', defaultInputRules);
    expect(result?.rule.command).toBe('setHeader');
    expect(result?.rule.args).toEqual([1]);
  });

  it('"## " → setHeader(2)', () => {
    const result = matchInputRule('## ', defaultInputRules);
    expect(result?.rule.command).toBe('setHeader');
    expect(result?.rule.args).toEqual([2]);
  });

  it('"### " → setHeader(3)', () => {
    const result = matchInputRule('### ', defaultInputRules);
    expect(result?.rule.command).toBe('setHeader');
    expect(result?.rule.args).toEqual([3]);
  });

  it('"--- " → insertBlock(divider)', () => {
    const result = matchInputRule('--- ', defaultInputRules);
    expect(result?.rule.command).toBe('insertBlock');
    expect(result?.rule.args).toEqual([{ divider: true }]);
  });

  it('"Hello" → null (no match)', () => {
    const result = matchInputRule('Hello', defaultInputRules);
    expect(result).toBeNull();
  });

  it('"" (empty) → null', () => {
    const result = matchInputRule('', defaultInputRules);
    expect(result).toBeNull();
  });
});

describe('matchInputRule — custom rules', () => {
  it('custom rules work', () => {
    const custom: InputRule[] = [{ pattern: /^!!!$/, command: 'myAlert' }];
    const result = matchInputRule('!!!', custom);
    expect(result?.rule.command).toBe('myAlert');
  });

  it('first match wins', () => {
    const rules: InputRule[] = [
      { pattern: /^-\s$/, command: 'first' },
      { pattern: /^-\s$/, command: 'second' },
    ];
    const result = matchInputRule('- ', rules);
    expect(result?.rule.command).toBe('first');
  });
});
