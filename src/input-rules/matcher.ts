import type { InputRule, InputRuleMatch } from './types';

/**
 * Test the given line text against input rules.
 *
 * Returns the first matching rule and its `RegExpMatchArray`, or `null`.
 */
export function matchInputRule(text: string, rules: readonly InputRule[]): InputRuleMatch | null {
  for (const rule of rules) {
    const m = rule.pattern.exec(text);
    if (m) {
      return { rule, match: m };
    }
  }
  return null;
}
