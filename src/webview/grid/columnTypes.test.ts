import { describe, expect, test } from 'bun:test';
import {
  compactType,
  dateInputType,
  enumValues,
  isLongTextColumn,
  isPlainTextColumn,
  valueEditorFor,
  whereLiteral,
} from './columnTypes';
import { column } from '../../test/fixtures';

describe('enumValues', () => {
  test('parses the MySQL enum literal, unescaping doubled quotes', () => {
    expect(enumValues("enum('a','b c','it''s')")).toEqual(['a', 'b c', "it's"]);
  });

  test('is null for anything else', () => {
    expect(enumValues('varchar(255)')).toBeNull();
    expect(enumValues("set('a','b')")).toBeNull();
  });
});

describe('compactType', () => {
  test('keeps the keyword only for enum and set, lowercases the rest', () => {
    expect(compactType("enum('a','b')")).toBe('enum');
    expect(compactType("SET('x')")).toBe('set');
    expect(compactType('VARCHAR(255)')).toBe('varchar(255)');
  });
});

describe('valueEditorFor', () => {
  test('json columns and json-shaped text open the json editor', () => {
    expect(valueEditorFor('json', null)).toBe('json');
    expect(valueEditorFor('longtext', '{"a":1}')).toBe('json');
    expect(valueEditorFor('varchar(255)', ' [1,2]')).toBe('json');
  });

  test('long text opens the text editor, single-line types nothing', () => {
    expect(valueEditorFor('text', 'hello')).toBe('text');
    expect(valueEditorFor('CLOB', null)).toBe('text');
    expect(valueEditorFor('varchar(255)', 'hello')).toBeNull();
    expect(valueEditorFor('int', null)).toBeNull();
  });
});

describe('column kinds', () => {
  test('isLongTextColumn matches text families, never varchar', () => {
    expect(isLongTextColumn('mediumtext')).toBe(true);
    expect(isLongTextColumn('citext')).toBe(true);
    expect(isLongTextColumn('varchar(20)')).toBe(false);
  });

  test('isPlainTextColumn excludes dates, json and enums', () => {
    expect(isPlainTextColumn('varchar(20)')).toBe(true);
    expect(isPlainTextColumn('timestamp')).toBe(false);
    expect(isPlainTextColumn('jsonb')).toBe(false);
    expect(isPlainTextColumn("enum('a')")).toBe(false);
  });

  test('dateInputType picks the native input for dates', () => {
    expect(dateInputType('date')).toBe('date');
    expect(dateInputType('datetime')).toBe('datetime-local');
    expect(dateInputType('timestamp without time zone')).toBe('datetime-local');
    expect(dateInputType('varchar(10)')).toBeNull();
  });
});

describe('whereLiteral', () => {
  test('quotes text with doubled quotes, leaves numbers bare', () => {
    expect(whereLiteral(column('name', 'varchar(20)'), "O'Neil")).toBe("'O''Neil'");
    expect(whereLiteral(column('id', 'bigint unsigned'), '42')).toBe('42');
    expect(whereLiteral(column('qty', 'int(11)'), '3')).toBe('3');
    expect(whereLiteral(column('price', 'numeric(10,2)'), '9.5')).toBe('9.5');
    expect(whereLiteral(column('pos', 'point'), '1')).toBe("'1'");
  });
});
