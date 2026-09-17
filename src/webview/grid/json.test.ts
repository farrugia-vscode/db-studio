import { describe, expect, test } from 'bun:test';
import { compactJson, enclosingBracket, jsonEnterEdit, prettyJson, tidyJson } from './json';

describe('json round trips', () => {
  test('prettyJson indents valid json and leaves the rest alone', () => {
    expect(prettyJson('{"a":1}')).toBe('{\n  "a": 1\n}');
    expect(prettyJson('{oops')).toBe('{oops');
    expect(prettyJson(null)).toBe('');
  });

  test('compactJson strips whitespace, tidyJson forgives trailing commas', () => {
    expect(compactJson('{ "a" : [1, 2] }')).toBe('{"a":[1,2]}');
    expect(compactJson('nope')).toBe('nope');
    expect(tidyJson('{"a": 1,}')).toBe('{\n  "a": 1\n}');
    expect(tidyJson('{"a": }')).toBe('{"a": }');
  });
});

describe('enclosingBracket', () => {
  test('finds the innermost open bracket, ignoring brackets inside strings', () => {
    const text = '{"a": ["{", {"b": 1}]}';
    expect(enclosingBracket(text, 8)).toBe('[');
    expect(enclosingBracket(text, 14)).toBe('{');
    expect(enclosingBracket(text, text.length)).toBeNull();
  });
});

describe('jsonEnterEdit', () => {
  test('after an opening brace, scaffolds the first key and the closer', () => {
    const { insert, caret } = jsonEnterEdit('{', 1);
    expect(insert).toBe('\n  "": \n}');
    expect('{' + insert).toBe('{\n  "": \n}');
    expect(caret).toBe(5); // between the quotes
  });

  test('keeps an existing closer on its own line', () => {
    const { insert } = jsonEnterEdit('[]', 1);
    expect(insert).toBe('\n  \n');
  });

  test('inside an object, adds the comma and scaffolds the next key', () => {
    const text = '{\n  "a": 1';
    const { insert, caret } = jsonEnterEdit(text, text.length);
    expect(insert).toBe(',\n  "": ');
    expect(caret).toBe(text.length + 5); // between the quotes
  });

  test('inside an array, adds the comma and a plain newline', () => {
    const text = '[\n  1';
    expect(jsonEnterEdit(text, text.length).insert).toBe(',\n  ');
  });

  test('no comma after an opener or a colon', () => {
    const text = '{\n  "a":';
    expect(jsonEnterEdit(text, text.length).insert).toBe('\n  "": ');
  });
});
