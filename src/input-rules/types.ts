/**
 * An input rule triggers a command when the user types a pattern
 * at the beginning of a line (e.g. "- " → bullet list).
 */
export interface InputRule {
  /** Regex pattern tested against the text at the start of the current line. */
  readonly pattern: RegExp;
  /** Command name to execute when the pattern matches. */
  readonly command: string;
  /** Optional arguments passed to the command. */
  readonly args?: readonly unknown[];
  /** If true (default), remove the matched text before executing the command. */
  readonly consumeMatch?: boolean;
}

/**
 * Result of matching an input rule against line text.
 */
export interface InputRuleMatch {
  readonly rule: InputRule;
  readonly match: RegExpMatchArray;
}
