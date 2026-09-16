"use strict";
(() => {
  var __create = Object.create;
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getProtoOf = Object.getPrototypeOf;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __commonJS = (cb, mod) => function __require() {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
    // If the importer is in node compatibility mode or this is not an ESM
    // file that has been converted to a CommonJS file using a Babel-
    // compatible transform (i.e. "__esModule" has not been set), then set
    // "default" to the CommonJS "module.exports" for node compatibility.
    isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
    mod
  ));

  // node_modules/nearley/lib/nearley.js
  var require_nearley = __commonJS({
    "node_modules/nearley/lib/nearley.js"(exports, module) {
      (function(root, factory) {
        if (typeof module === "object" && module.exports) {
          module.exports = factory();
        } else {
          root.nearley = factory();
        }
      })(exports, function() {
        function Rule(name, symbols, postprocess) {
          this.id = ++Rule.highestId;
          this.name = name;
          this.symbols = symbols;
          this.postprocess = postprocess;
          return this;
        }
        Rule.highestId = 0;
        Rule.prototype.toString = function(withCursorAt) {
          var symbolSequence = typeof withCursorAt === "undefined" ? this.symbols.map(getSymbolShortDisplay).join(" ") : this.symbols.slice(0, withCursorAt).map(getSymbolShortDisplay).join(" ") + " \u25CF " + this.symbols.slice(withCursorAt).map(getSymbolShortDisplay).join(" ");
          return this.name + " \u2192 " + symbolSequence;
        };
        function State(rule, dot, reference, wantedBy) {
          this.rule = rule;
          this.dot = dot;
          this.reference = reference;
          this.data = [];
          this.wantedBy = wantedBy;
          this.isComplete = this.dot === rule.symbols.length;
        }
        State.prototype.toString = function() {
          return "{" + this.rule.toString(this.dot) + "}, from: " + (this.reference || 0);
        };
        State.prototype.nextState = function(child) {
          var state = new State(this.rule, this.dot + 1, this.reference, this.wantedBy);
          state.left = this;
          state.right = child;
          if (state.isComplete) {
            state.data = state.build();
            state.right = void 0;
          }
          return state;
        };
        State.prototype.build = function() {
          var children = [];
          var node = this;
          do {
            children.push(node.right.data);
            node = node.left;
          } while (node.left);
          children.reverse();
          return children;
        };
        State.prototype.finish = function() {
          if (this.rule.postprocess) {
            this.data = this.rule.postprocess(this.data, this.reference, Parser.fail);
          }
        };
        function Column(grammar2, index) {
          this.grammar = grammar2;
          this.index = index;
          this.states = [];
          this.wants = {};
          this.scannable = [];
          this.completed = {};
        }
        Column.prototype.process = function(nextColumn) {
          var states = this.states;
          var wants = this.wants;
          var completed = this.completed;
          for (var w = 0; w < states.length; w++) {
            var state = states[w];
            if (state.isComplete) {
              state.finish();
              if (state.data !== Parser.fail) {
                var wantedBy = state.wantedBy;
                for (var i = wantedBy.length; i--; ) {
                  var left = wantedBy[i];
                  this.complete(left, state);
                }
                if (state.reference === this.index) {
                  var exp = state.rule.name;
                  (this.completed[exp] = this.completed[exp] || []).push(state);
                }
              }
            } else {
              var exp = state.rule.symbols[state.dot];
              if (typeof exp !== "string") {
                this.scannable.push(state);
                continue;
              }
              if (wants[exp]) {
                wants[exp].push(state);
                if (completed.hasOwnProperty(exp)) {
                  var nulls = completed[exp];
                  for (var i = 0; i < nulls.length; i++) {
                    var right = nulls[i];
                    this.complete(state, right);
                  }
                }
              } else {
                wants[exp] = [state];
                this.predict(exp);
              }
            }
          }
        };
        Column.prototype.predict = function(exp) {
          var rules = this.grammar.byName[exp] || [];
          for (var i = 0; i < rules.length; i++) {
            var r = rules[i];
            var wantedBy = this.wants[exp];
            var s = new State(r, 0, this.index, wantedBy);
            this.states.push(s);
          }
        };
        Column.prototype.complete = function(left, right) {
          var copy = left.nextState(right);
          this.states.push(copy);
        };
        function Grammar2(rules, start) {
          this.rules = rules;
          this.start = start || this.rules[0].name;
          var byName = this.byName = {};
          this.rules.forEach(function(rule) {
            if (!byName.hasOwnProperty(rule.name)) {
              byName[rule.name] = [];
            }
            byName[rule.name].push(rule);
          });
        }
        Grammar2.fromCompiled = function(rules, start) {
          var lexer2 = rules.Lexer;
          if (rules.ParserStart) {
            start = rules.ParserStart;
            rules = rules.ParserRules;
          }
          var rules = rules.map(function(r) {
            return new Rule(r.name, r.symbols, r.postprocess);
          });
          var g = new Grammar2(rules, start);
          g.lexer = lexer2;
          return g;
        };
        function StreamLexer() {
          this.reset("");
        }
        StreamLexer.prototype.reset = function(data, state) {
          this.buffer = data;
          this.index = 0;
          this.line = state ? state.line : 1;
          this.lastLineBreak = state ? -state.col : 0;
        };
        StreamLexer.prototype.next = function() {
          if (this.index < this.buffer.length) {
            var ch = this.buffer[this.index++];
            if (ch === "\n") {
              this.line += 1;
              this.lastLineBreak = this.index;
            }
            return { value: ch };
          }
        };
        StreamLexer.prototype.save = function() {
          return {
            line: this.line,
            col: this.index - this.lastLineBreak
          };
        };
        StreamLexer.prototype.formatError = function(token, message) {
          var buffer = this.buffer;
          if (typeof buffer === "string") {
            var lines = buffer.split("\n").slice(
              Math.max(0, this.line - 5),
              this.line
            );
            var nextLineBreak = buffer.indexOf("\n", this.index);
            if (nextLineBreak === -1) nextLineBreak = buffer.length;
            var col = this.index - this.lastLineBreak;
            var lastLineDigits = String(this.line).length;
            message += " at line " + this.line + " col " + col + ":\n\n";
            message += lines.map(function(line, i) {
              return pad(this.line - lines.length + i + 1, lastLineDigits) + " " + line;
            }, this).join("\n");
            message += "\n" + pad("", lastLineDigits + col) + "^\n";
            return message;
          } else {
            return message + " at index " + (this.index - 1);
          }
          function pad(n, length) {
            var s = String(n);
            return Array(length - s.length + 1).join(" ") + s;
          }
        };
        function Parser(rules, start, options) {
          if (rules instanceof Grammar2) {
            var grammar2 = rules;
            var options = start;
          } else {
            var grammar2 = Grammar2.fromCompiled(rules, start);
          }
          this.grammar = grammar2;
          this.options = {
            keepHistory: false,
            lexer: grammar2.lexer || new StreamLexer()
          };
          for (var key in options || {}) {
            this.options[key] = options[key];
          }
          this.lexer = this.options.lexer;
          this.lexerState = void 0;
          var column = new Column(grammar2, 0);
          var table = this.table = [column];
          column.wants[grammar2.start] = [];
          column.predict(grammar2.start);
          column.process();
          this.current = 0;
        }
        Parser.fail = {};
        Parser.prototype.feed = function(chunk) {
          var lexer2 = this.lexer;
          lexer2.reset(chunk, this.lexerState);
          var token;
          while (true) {
            try {
              token = lexer2.next();
              if (!token) {
                break;
              }
            } catch (e) {
              var nextColumn = new Column(this.grammar, this.current + 1);
              this.table.push(nextColumn);
              var err = new Error(this.reportLexerError(e));
              err.offset = this.current;
              err.token = e.token;
              throw err;
            }
            var column = this.table[this.current];
            if (!this.options.keepHistory) {
              delete this.table[this.current - 1];
            }
            var n = this.current + 1;
            var nextColumn = new Column(this.grammar, n);
            this.table.push(nextColumn);
            var literal = token.text !== void 0 ? token.text : token.value;
            var value = lexer2.constructor === StreamLexer ? token.value : token;
            var scannable = column.scannable;
            for (var w = scannable.length; w--; ) {
              var state = scannable[w];
              var expect = state.rule.symbols[state.dot];
              if (expect.test ? expect.test(value) : expect.type ? expect.type === token.type : expect.literal === literal) {
                var next = state.nextState({ data: value, token, isToken: true, reference: n - 1 });
                nextColumn.states.push(next);
              }
            }
            nextColumn.process();
            if (nextColumn.states.length === 0) {
              var err = new Error(this.reportError(token));
              err.offset = this.current;
              err.token = token;
              throw err;
            }
            if (this.options.keepHistory) {
              column.lexerState = lexer2.save();
            }
            this.current++;
          }
          if (column) {
            this.lexerState = lexer2.save();
          }
          this.results = this.finish();
          return this;
        };
        Parser.prototype.reportLexerError = function(lexerError) {
          var tokenDisplay, lexerMessage;
          var token = lexerError.token;
          if (token) {
            tokenDisplay = "input " + JSON.stringify(token.text[0]) + " (lexer error)";
            lexerMessage = this.lexer.formatError(token, "Syntax error");
          } else {
            tokenDisplay = "input (lexer error)";
            lexerMessage = lexerError.message;
          }
          return this.reportErrorCommon(lexerMessage, tokenDisplay);
        };
        Parser.prototype.reportError = function(token) {
          var tokenDisplay = (token.type ? token.type + " token: " : "") + JSON.stringify(token.value !== void 0 ? token.value : token);
          var lexerMessage = this.lexer.formatError(token, "Syntax error");
          return this.reportErrorCommon(lexerMessage, tokenDisplay);
        };
        Parser.prototype.reportErrorCommon = function(lexerMessage, tokenDisplay) {
          var lines = [];
          lines.push(lexerMessage);
          var lastColumnIndex = this.table.length - 2;
          var lastColumn = this.table[lastColumnIndex];
          var expectantStates = lastColumn.states.filter(function(state) {
            var nextSymbol = state.rule.symbols[state.dot];
            return nextSymbol && typeof nextSymbol !== "string";
          });
          if (expectantStates.length === 0) {
            lines.push("Unexpected " + tokenDisplay + ". I did not expect any more input. Here is the state of my parse table:\n");
            this.displayStateStack(lastColumn.states, lines);
          } else {
            lines.push("Unexpected " + tokenDisplay + ". Instead, I was expecting to see one of the following:\n");
            var stateStacks = expectantStates.map(function(state) {
              return this.buildFirstStateStack(state, []) || [state];
            }, this);
            stateStacks.forEach(function(stateStack) {
              var state = stateStack[0];
              var nextSymbol = state.rule.symbols[state.dot];
              var symbolDisplay = this.getSymbolDisplay(nextSymbol);
              lines.push("A " + symbolDisplay + " based on:");
              this.displayStateStack(stateStack, lines);
            }, this);
          }
          lines.push("");
          return lines.join("\n");
        };
        Parser.prototype.displayStateStack = function(stateStack, lines) {
          var lastDisplay;
          var sameDisplayCount = 0;
          for (var j = 0; j < stateStack.length; j++) {
            var state = stateStack[j];
            var display = state.rule.toString(state.dot);
            if (display === lastDisplay) {
              sameDisplayCount++;
            } else {
              if (sameDisplayCount > 0) {
                lines.push("    ^ " + sameDisplayCount + " more lines identical to this");
              }
              sameDisplayCount = 0;
              lines.push("    " + display);
            }
            lastDisplay = display;
          }
        };
        Parser.prototype.getSymbolDisplay = function(symbol) {
          return getSymbolLongDisplay(symbol);
        };
        Parser.prototype.buildFirstStateStack = function(state, visited) {
          if (visited.indexOf(state) !== -1) {
            return null;
          }
          if (state.wantedBy.length === 0) {
            return [state];
          }
          var prevState = state.wantedBy[0];
          var childVisited = [state].concat(visited);
          var childResult = this.buildFirstStateStack(prevState, childVisited);
          if (childResult === null) {
            return null;
          }
          return [state].concat(childResult);
        };
        Parser.prototype.save = function() {
          var column = this.table[this.current];
          column.lexerState = this.lexerState;
          return column;
        };
        Parser.prototype.restore = function(column) {
          var index = column.index;
          this.current = index;
          this.table[index] = column;
          this.table.splice(index + 1);
          this.lexerState = column.lexerState;
          this.results = this.finish();
        };
        Parser.prototype.rewind = function(index) {
          if (!this.options.keepHistory) {
            throw new Error("set option `keepHistory` to enable rewinding");
          }
          this.restore(this.table[index]);
        };
        Parser.prototype.finish = function() {
          var considerations = [];
          var start = this.grammar.start;
          var column = this.table[this.table.length - 1];
          column.states.forEach(function(t) {
            if (t.rule.name === start && t.dot === t.rule.symbols.length && t.reference === 0 && t.data !== Parser.fail) {
              considerations.push(t);
            }
          });
          return considerations.map(function(c) {
            return c.data;
          });
        };
        function getSymbolLongDisplay(symbol) {
          var type = typeof symbol;
          if (type === "string") {
            return symbol;
          } else if (type === "object") {
            if (symbol.literal) {
              return JSON.stringify(symbol.literal);
            } else if (symbol instanceof RegExp) {
              return "character matching " + symbol;
            } else if (symbol.type) {
              return symbol.type + " token";
            } else if (symbol.test) {
              return "token matching " + String(symbol.test);
            } else {
              throw new Error("Unknown symbol type: " + symbol);
            }
          }
        }
        function getSymbolShortDisplay(symbol) {
          var type = typeof symbol;
          if (type === "string") {
            return symbol;
          } else if (type === "object") {
            if (symbol.literal) {
              return JSON.stringify(symbol.literal);
            } else if (symbol instanceof RegExp) {
              return symbol.toString();
            } else if (symbol.type) {
              return "%" + symbol.type;
            } else if (symbol.test) {
              return "<" + String(symbol.test) + ">";
            } else {
              throw new Error("Unknown symbol type: " + symbol);
            }
          }
        }
        return {
          Parser,
          Grammar: Grammar2,
          Rule
        };
      });
    }
  });

  // node_modules/sql-formatter/dist/esm/expandPhrases.js
  var expandPhrases = (phrases) => phrases.flatMap(expandSinglePhrase);
  var expandSinglePhrase = (phrase) => buildCombinations(parsePhrase(phrase)).map(stripExtraWhitespace);
  var stripExtraWhitespace = (text) => text.replace(/ +/g, " ").trim();
  var parsePhrase = (text) => ({
    type: "mandatory_block",
    items: parseAlteration(text, 0)[0]
  });
  var parseAlteration = (text, index, expectClosing) => {
    const alterations = [];
    while (text[index]) {
      const [term, newIndex] = parseConcatenation(text, index);
      alterations.push(term);
      index = newIndex;
      if (text[index] === "|") {
        index++;
      } else if (text[index] === "}" || text[index] === "]") {
        if (expectClosing !== text[index]) {
          throw new Error(`Unbalanced parenthesis in: ${text}`);
        }
        index++;
        return [alterations, index];
      } else if (index === text.length) {
        if (expectClosing) {
          throw new Error(`Unbalanced parenthesis in: ${text}`);
        }
        return [alterations, index];
      } else {
        throw new Error(`Unexpected "${text[index]}"`);
      }
    }
    return [alterations, index];
  };
  var parseConcatenation = (text, index) => {
    const items = [];
    while (true) {
      const [term, newIndex] = parseTerm(text, index);
      if (term) {
        items.push(term);
        index = newIndex;
      } else {
        break;
      }
    }
    return items.length === 1 ? [items[0], index] : [{ type: "concatenation", items }, index];
  };
  var parseTerm = (text, index) => {
    if (text[index] === "{") {
      return parseMandatoryBlock(text, index + 1);
    } else if (text[index] === "[") {
      return parseOptionalBlock(text, index + 1);
    } else {
      let word = "";
      while (text[index] && /[A-Za-z0-9_ ]/.test(text[index])) {
        word += text[index];
        index++;
      }
      return [word, index];
    }
  };
  var parseMandatoryBlock = (text, index) => {
    const [items, newIndex] = parseAlteration(text, index, "}");
    return [{ type: "mandatory_block", items }, newIndex];
  };
  var parseOptionalBlock = (text, index) => {
    const [items, newIndex] = parseAlteration(text, index, "]");
    return [{ type: "optional_block", items }, newIndex];
  };
  var buildCombinations = (node) => {
    if (typeof node === "string") {
      return [node];
    } else if (node.type === "concatenation") {
      return node.items.map(buildCombinations).reduce(stringCombinations, [""]);
    } else if (node.type === "mandatory_block") {
      return node.items.flatMap(buildCombinations);
    } else if (node.type === "optional_block") {
      return ["", ...node.items.flatMap(buildCombinations)];
    } else {
      throw new Error(`Unknown node type: ${node}`);
    }
  };
  var stringCombinations = (xs, ys) => {
    const results = [];
    for (const x of xs) {
      for (const y of ys) {
        results.push(x + y);
      }
    }
    return results;
  };

  // node_modules/sql-formatter/dist/esm/lexer/token.js
  var TokenType;
  (function(TokenType2) {
    TokenType2["QUOTED_IDENTIFIER"] = "QUOTED_IDENTIFIER";
    TokenType2["IDENTIFIER"] = "IDENTIFIER";
    TokenType2["STRING"] = "STRING";
    TokenType2["VARIABLE"] = "VARIABLE";
    TokenType2["RESERVED_DATA_TYPE"] = "RESERVED_DATA_TYPE";
    TokenType2["RESERVED_PARAMETERIZED_DATA_TYPE"] = "RESERVED_PARAMETERIZED_DATA_TYPE";
    TokenType2["RESERVED_KEYWORD"] = "RESERVED_KEYWORD";
    TokenType2["RESERVED_FUNCTION_NAME"] = "RESERVED_FUNCTION_NAME";
    TokenType2["RESERVED_KEYWORD_PHRASE"] = "RESERVED_KEYWORD_PHRASE";
    TokenType2["RESERVED_DATA_TYPE_PHRASE"] = "RESERVED_DATA_TYPE_PHRASE";
    TokenType2["RESERVED_SET_OPERATION"] = "RESERVED_SET_OPERATION";
    TokenType2["RESERVED_CLAUSE"] = "RESERVED_CLAUSE";
    TokenType2["RESERVED_SELECT"] = "RESERVED_SELECT";
    TokenType2["RESERVED_JOIN"] = "RESERVED_JOIN";
    TokenType2["ARRAY_IDENTIFIER"] = "ARRAY_IDENTIFIER";
    TokenType2["ARRAY_KEYWORD"] = "ARRAY_KEYWORD";
    TokenType2["CASE"] = "CASE";
    TokenType2["END"] = "END";
    TokenType2["WHEN"] = "WHEN";
    TokenType2["ELSE"] = "ELSE";
    TokenType2["THEN"] = "THEN";
    TokenType2["LIMIT"] = "LIMIT";
    TokenType2["BETWEEN"] = "BETWEEN";
    TokenType2["AND"] = "AND";
    TokenType2["OR"] = "OR";
    TokenType2["XOR"] = "XOR";
    TokenType2["OPERATOR"] = "OPERATOR";
    TokenType2["COMMA"] = "COMMA";
    TokenType2["ASTERISK"] = "ASTERISK";
    TokenType2["PROPERTY_ACCESS_OPERATOR"] = "PROPERTY_ACCESS_OPERATOR";
    TokenType2["OPEN_PAREN"] = "OPEN_PAREN";
    TokenType2["CLOSE_PAREN"] = "CLOSE_PAREN";
    TokenType2["LINE_COMMENT"] = "LINE_COMMENT";
    TokenType2["BLOCK_COMMENT"] = "BLOCK_COMMENT";
    TokenType2["DISABLE_COMMENT"] = "DISABLE_COMMENT";
    TokenType2["NUMBER"] = "NUMBER";
    TokenType2["NAMED_PARAMETER"] = "NAMED_PARAMETER";
    TokenType2["QUOTED_PARAMETER"] = "QUOTED_PARAMETER";
    TokenType2["NUMBERED_PARAMETER"] = "NUMBERED_PARAMETER";
    TokenType2["POSITIONAL_PARAMETER"] = "POSITIONAL_PARAMETER";
    TokenType2["CUSTOM_PARAMETER"] = "CUSTOM_PARAMETER";
    TokenType2["DELIMITER"] = "DELIMITER";
    TokenType2["EOF"] = "EOF";
  })(TokenType = TokenType || (TokenType = {}));
  var createEofToken = (index) => ({
    type: TokenType.EOF,
    raw: "\xABEOF\xBB",
    text: "\xABEOF\xBB",
    start: index
  });
  var EOF_TOKEN = createEofToken(Infinity);
  var testToken = (compareToken) => (token) => token.type === compareToken.type && token.text === compareToken.text;
  var isToken = {
    ARRAY: testToken({ text: "ARRAY", type: TokenType.RESERVED_DATA_TYPE }),
    BY: testToken({ text: "BY", type: TokenType.RESERVED_KEYWORD }),
    SET: testToken({ text: "SET", type: TokenType.RESERVED_CLAUSE }),
    STRUCT: testToken({ text: "STRUCT", type: TokenType.RESERVED_DATA_TYPE }),
    WINDOW: testToken({ text: "WINDOW", type: TokenType.RESERVED_CLAUSE }),
    VALUES: testToken({ text: "VALUES", type: TokenType.RESERVED_CLAUSE })
  };
  var isReserved = (type) => type === TokenType.RESERVED_DATA_TYPE || type === TokenType.RESERVED_KEYWORD || type === TokenType.RESERVED_FUNCTION_NAME || type === TokenType.RESERVED_KEYWORD_PHRASE || type === TokenType.RESERVED_DATA_TYPE_PHRASE || type === TokenType.RESERVED_CLAUSE || type === TokenType.RESERVED_SELECT || type === TokenType.RESERVED_SET_OPERATION || type === TokenType.RESERVED_JOIN || type === TokenType.ARRAY_KEYWORD || type === TokenType.CASE || type === TokenType.END || type === TokenType.WHEN || type === TokenType.ELSE || type === TokenType.THEN || type === TokenType.LIMIT || type === TokenType.BETWEEN || type === TokenType.AND || type === TokenType.OR || type === TokenType.XOR;
  var isLogicalOperator = (type) => type === TokenType.AND || type === TokenType.OR || type === TokenType.XOR;

  // node_modules/sql-formatter/dist/esm/languages/mariadb/likeMariaDb.js
  function postProcess(tokens) {
    return tokens.map((token, i) => {
      const nextToken = tokens[i + 1] || EOF_TOKEN;
      if (isToken.SET(token) && nextToken.text === "(") {
        return Object.assign(Object.assign({}, token), { type: TokenType.RESERVED_FUNCTION_NAME });
      }
      const prevToken = tokens[i - 1] || EOF_TOKEN;
      if (isToken.VALUES(token) && prevToken.text === "=") {
        return Object.assign(Object.assign({}, token), { type: TokenType.RESERVED_FUNCTION_NAME });
      }
      return token;
    });
  }

  // node_modules/sql-formatter/dist/esm/languages/mysql/mysql.keywords.js
  var keywords = [
    // https://dev.mysql.com/doc/refman/8.0/en/keywords.html
    "ACCESSIBLE",
    "ADD",
    "ALL",
    "ALTER",
    "ANALYZE",
    "AND",
    "AS",
    "ASC",
    "ASENSITIVE",
    "BEFORE",
    "BETWEEN",
    "BOTH",
    "BY",
    "CALL",
    "CASCADE",
    "CASE",
    "CHANGE",
    "CHECK",
    "COLLATE",
    "COLUMN",
    "CONDITION",
    "CONSTRAINT",
    "CONTINUE",
    "CONVERT",
    "CREATE",
    "CROSS",
    "CUBE",
    "CUME_DIST",
    "CURRENT_DATE",
    "CURRENT_TIME",
    "CURRENT_TIMESTAMP",
    "CURRENT_USER",
    "CURSOR",
    "DATABASE",
    "DATABASES",
    "DAY_HOUR",
    "DAY_MICROSECOND",
    "DAY_MINUTE",
    "DAY_SECOND",
    "DECLARE",
    "DEFAULT",
    "DELAYED",
    "DELETE",
    "DENSE_RANK",
    "DESC",
    "DESCRIBE",
    "DETERMINISTIC",
    "DISTINCT",
    "DISTINCTROW",
    "DIV",
    "DROP",
    "DUAL",
    "EACH",
    "ELSE",
    "ELSEIF",
    "EMPTY",
    "ENCLOSED",
    "ESCAPED",
    "EXCEPT",
    "EXISTS",
    "EXIT",
    "EXPLAIN",
    "FALSE",
    "FETCH",
    "FIRST_VALUE",
    "FOR",
    "FORCE",
    "FOREIGN",
    "FROM",
    "FULLTEXT",
    "FUNCTION",
    "GENERATED",
    "GET",
    "GRANT",
    "GROUP",
    "GROUPING",
    "GROUPS",
    "HAVING",
    "HIGH_PRIORITY",
    "HOUR_MICROSECOND",
    "HOUR_MINUTE",
    "HOUR_SECOND",
    "IF",
    "IGNORE",
    "IN",
    "INDEX",
    "INFILE",
    "INNER",
    "INOUT",
    "INSENSITIVE",
    "INSERT",
    "IN",
    "INTERSECT",
    "INTERVAL",
    "INTO",
    "IO_AFTER_GTIDS",
    "IO_BEFORE_GTIDS",
    "IS",
    "ITERATE",
    "JOIN",
    "JSON_TABLE",
    "KEY",
    "KEYS",
    "KILL",
    "LAG",
    "LAST_VALUE",
    "LATERAL",
    "LEAD",
    "LEADING",
    "LEAVE",
    "LEFT",
    "LIKE",
    "LIMIT",
    "LINEAR",
    "LINES",
    "LOAD",
    "LOCALTIME",
    "LOCALTIMESTAMP",
    "LOCK",
    "LONG",
    "LOOP",
    "LOW_PRIORITY",
    "MASTER_BIND",
    "MASTER_SSL_VERIFY_SERVER_CERT",
    "MATCH",
    "MAXVALUE",
    "MINUTE_MICROSECOND",
    "MINUTE_SECOND",
    "MOD",
    "MODIFIES",
    "NATURAL",
    "NOT",
    "NO_WRITE_TO_BINLOG",
    "NTH_VALUE",
    "NTILE",
    "NULL",
    "OF",
    "ON",
    "OPTIMIZE",
    "OPTIMIZER_COSTS",
    "OPTION",
    "OPTIONALLY",
    "OR",
    "ORDER",
    "OUT",
    "OUTER",
    "OUTFILE",
    "OVER",
    "PARTITION",
    "PERCENT_RANK",
    "PRIMARY",
    "PROCEDURE",
    "PURGE",
    "RANGE",
    "RANK",
    "READ",
    "READS",
    "READ_WRITE",
    "RECURSIVE",
    "REFERENCES",
    "REGEXP",
    "RELEASE",
    "RENAME",
    "REPEAT",
    "REPLACE",
    "REQUIRE",
    "RESIGNAL",
    "RESTRICT",
    "RETURN",
    "REVOKE",
    "RIGHT",
    "RLIKE",
    "ROW",
    "ROWS",
    "ROW_NUMBER",
    "SCHEMA",
    "SCHEMAS",
    "SECOND_MICROSECOND",
    "SELECT",
    "SENSITIVE",
    "SEPARATOR",
    "SET",
    "SHOW",
    "SIGNAL",
    "SPATIAL",
    "SPECIFIC",
    "SQL",
    "SQLEXCEPTION",
    "SQLSTATE",
    "SQLWARNING",
    "SQL_BIG_RESULT",
    "SQL_CALC_FOUND_ROWS",
    "SQL_SMALL_RESULT",
    "SSL",
    "STARTING",
    "STORED",
    "STRAIGHT_JOIN",
    "SYSTEM",
    "TABLE",
    "TERMINATED",
    "THEN",
    "TO",
    "TRAILING",
    "TRIGGER",
    "TRUE",
    "UNDO",
    "UNION",
    "UNIQUE",
    "UNLOCK",
    "UNSIGNED",
    "UPDATE",
    "USAGE",
    "USE",
    "USING",
    "UTC_DATE",
    "UTC_TIME",
    "UTC_TIMESTAMP",
    "VALUES",
    "VIRTUAL",
    "WHEN",
    "WHERE",
    "WHILE",
    "WINDOW",
    "WITH",
    "WRITE",
    "XOR",
    "YEAR_MONTH",
    "ZEROFILL"
    // (R)
  ];
  var dataTypes = [
    // https://dev.mysql.com/doc/refman/8.0/en/data-types.html
    "BIGINT",
    "BINARY",
    "BIT",
    "BLOB",
    "BOOL",
    "BOOLEAN",
    "CHAR",
    "CHARACTER",
    "DATE",
    "DATETIME",
    "DEC",
    "DECIMAL",
    "DOUBLE PRECISION",
    "DOUBLE",
    "ENUM",
    "FIXED",
    "FLOAT",
    "FLOAT4",
    "FLOAT8",
    "INT",
    "INT1",
    "INT2",
    "INT3",
    "INT4",
    "INT8",
    "INTEGER",
    "LONGBLOB",
    "LONGTEXT",
    "MEDIUMBLOB",
    "MEDIUMINT",
    "MEDIUMTEXT",
    "MIDDLEINT",
    "NATIONAL CHAR",
    "NATIONAL VARCHAR",
    "NUMERIC",
    "PRECISION",
    "REAL",
    "SMALLINT",
    "TEXT",
    "TIME",
    "TIMESTAMP",
    "TINYBLOB",
    "TINYINT",
    "TINYTEXT",
    "VARBINARY",
    "VARCHAR",
    "VARCHARACTER",
    "VARYING",
    "YEAR"
    // 'SET' // handled as special-case in postProcess
  ];

  // node_modules/sql-formatter/dist/esm/languages/mysql/mysql.functions.js
  var functions = [
    // https://dev.mysql.com/doc/refman/8.0/en/built-in-function-reference.html
    "ABS",
    "ACOS",
    "ADDDATE",
    "ADDTIME",
    "AES_DECRYPT",
    "AES_ENCRYPT",
    // 'AND',
    "ANY_VALUE",
    "ASCII",
    "ASIN",
    "ATAN",
    "ATAN2",
    "AVG",
    "BENCHMARK",
    "BIN",
    "BIN_TO_UUID",
    "BINARY",
    "BIT_AND",
    "BIT_COUNT",
    "BIT_LENGTH",
    "BIT_OR",
    "BIT_XOR",
    "CAN_ACCESS_COLUMN",
    "CAN_ACCESS_DATABASE",
    "CAN_ACCESS_TABLE",
    "CAN_ACCESS_USER",
    "CAN_ACCESS_VIEW",
    "CAST",
    "CEIL",
    "CEILING",
    "CHAR",
    "CHAR_LENGTH",
    "CHARACTER_LENGTH",
    "CHARSET",
    "COALESCE",
    "COERCIBILITY",
    "COLLATION",
    "COMPRESS",
    "CONCAT",
    "CONCAT_WS",
    "CONNECTION_ID",
    "CONV",
    "CONVERT",
    "CONVERT_TZ",
    "COS",
    "COT",
    "COUNT",
    "CRC32",
    "CUME_DIST",
    "CURDATE",
    "CURRENT_DATE",
    "CURRENT_ROLE",
    "CURRENT_TIME",
    "CURRENT_TIMESTAMP",
    "CURRENT_USER",
    "CURTIME",
    "DATABASE",
    "DATE",
    "DATE_ADD",
    "DATE_FORMAT",
    "DATE_SUB",
    "DATEDIFF",
    "DAY",
    "DAYNAME",
    "DAYOFMONTH",
    "DAYOFWEEK",
    "DAYOFYEAR",
    "DEFAULT",
    "DEGREES",
    "DENSE_RANK",
    "DIV",
    "ELT",
    "EXP",
    "EXPORT_SET",
    "EXTRACT",
    "EXTRACTVALUE",
    "FIELD",
    "FIND_IN_SET",
    "FIRST_VALUE",
    "FLOOR",
    "FORMAT",
    "FORMAT_BYTES",
    "FORMAT_PICO_TIME",
    "FOUND_ROWS",
    "FROM_BASE64",
    "FROM_DAYS",
    "FROM_UNIXTIME",
    "GEOMCOLLECTION",
    "GEOMETRYCOLLECTION",
    "GET_DD_COLUMN_PRIVILEGES",
    "GET_DD_CREATE_OPTIONS",
    "GET_DD_INDEX_SUB_PART_LENGTH",
    "GET_FORMAT",
    "GET_LOCK",
    "GREATEST",
    "GROUP_CONCAT",
    "GROUPING",
    "GTID_SUBSET",
    "GTID_SUBTRACT",
    "HEX",
    "HOUR",
    "ICU_VERSION",
    "IF",
    "IFNULL",
    // 'IN',
    "INET_ATON",
    "INET_NTOA",
    "INET6_ATON",
    "INET6_NTOA",
    "INSERT",
    "INSTR",
    "INTERNAL_AUTO_INCREMENT",
    "INTERNAL_AVG_ROW_LENGTH",
    "INTERNAL_CHECK_TIME",
    "INTERNAL_CHECKSUM",
    "INTERNAL_DATA_FREE",
    "INTERNAL_DATA_LENGTH",
    "INTERNAL_DD_CHAR_LENGTH",
    "INTERNAL_GET_COMMENT_OR_ERROR",
    "INTERNAL_GET_ENABLED_ROLE_JSON",
    "INTERNAL_GET_HOSTNAME",
    "INTERNAL_GET_USERNAME",
    "INTERNAL_GET_VIEW_WARNING_OR_ERROR",
    "INTERNAL_INDEX_COLUMN_CARDINALITY",
    "INTERNAL_INDEX_LENGTH",
    "INTERNAL_IS_ENABLED_ROLE",
    "INTERNAL_IS_MANDATORY_ROLE",
    "INTERNAL_KEYS_DISABLED",
    "INTERNAL_MAX_DATA_LENGTH",
    "INTERNAL_TABLE_ROWS",
    "INTERNAL_UPDATE_TIME",
    "INTERVAL",
    "IS",
    "IS_FREE_LOCK",
    "IS_IPV4",
    "IS_IPV4_COMPAT",
    "IS_IPV4_MAPPED",
    "IS_IPV6",
    "IS NOT",
    "IS NOT NULL",
    "IS NULL",
    "IS_USED_LOCK",
    "IS_UUID",
    "ISNULL",
    "JSON_ARRAY",
    "JSON_ARRAY_APPEND",
    "JSON_ARRAY_INSERT",
    "JSON_ARRAYAGG",
    "JSON_CONTAINS",
    "JSON_CONTAINS_PATH",
    "JSON_DEPTH",
    "JSON_EXTRACT",
    "JSON_INSERT",
    "JSON_KEYS",
    "JSON_LENGTH",
    "JSON_MERGE",
    "JSON_MERGE_PATCH",
    "JSON_MERGE_PRESERVE",
    "JSON_OBJECT",
    "JSON_OBJECTAGG",
    "JSON_OVERLAPS",
    "JSON_PRETTY",
    "JSON_QUOTE",
    "JSON_REMOVE",
    "JSON_REPLACE",
    "JSON_SCHEMA_VALID",
    "JSON_SCHEMA_VALIDATION_REPORT",
    "JSON_SEARCH",
    "JSON_SET",
    "JSON_STORAGE_FREE",
    "JSON_STORAGE_SIZE",
    "JSON_TABLE",
    "JSON_TYPE",
    "JSON_UNQUOTE",
    "JSON_VALID",
    "JSON_VALUE",
    "LAG",
    "LAST_DAY",
    "LAST_INSERT_ID",
    "LAST_VALUE",
    "LCASE",
    "LEAD",
    "LEAST",
    "LEFT",
    "LENGTH",
    "LIKE",
    "LINESTRING",
    "LN",
    "LOAD_FILE",
    "LOCALTIME",
    "LOCALTIMESTAMP",
    "LOCATE",
    "LOG",
    "LOG10",
    "LOG2",
    "LOWER",
    "LPAD",
    "LTRIM",
    "MAKE_SET",
    "MAKEDATE",
    "MAKETIME",
    "MASTER_POS_WAIT",
    "MATCH",
    "MAX",
    "MBRCONTAINS",
    "MBRCOVEREDBY",
    "MBRCOVERS",
    "MBRDISJOINT",
    "MBREQUALS",
    "MBRINTERSECTS",
    "MBROVERLAPS",
    "MBRTOUCHES",
    "MBRWITHIN",
    "MD5",
    // 'MEMBER OF',
    "MICROSECOND",
    "MID",
    "MIN",
    "MINUTE",
    "MOD",
    "MONTH",
    "MONTHNAME",
    "MULTILINESTRING",
    "MULTIPOINT",
    "MULTIPOLYGON",
    "NAME_CONST",
    // 'NOT',
    // 'NOT IN',
    // 'NOT LIKE',
    // 'NOT REGEXP',
    "NOW",
    "NTH_VALUE",
    "NTILE",
    "NULLIF",
    "OCT",
    "OCTET_LENGTH",
    // 'OR',
    "ORD",
    "PERCENT_RANK",
    "PERIOD_ADD",
    "PERIOD_DIFF",
    "PI",
    "POINT",
    "POLYGON",
    "POSITION",
    "POW",
    "POWER",
    "PS_CURRENT_THREAD_ID",
    "PS_THREAD_ID",
    "QUARTER",
    "QUOTE",
    "RADIANS",
    "RAND",
    "RANDOM_BYTES",
    "RANK",
    "REGEXP",
    "REGEXP_INSTR",
    "REGEXP_LIKE",
    "REGEXP_REPLACE",
    "REGEXP_SUBSTR",
    "RELEASE_ALL_LOCKS",
    "RELEASE_LOCK",
    "REPEAT",
    "REPLACE",
    "REVERSE",
    "RIGHT",
    "RLIKE",
    "ROLES_GRAPHML",
    "ROUND",
    "ROW_COUNT",
    "ROW_NUMBER",
    "RPAD",
    "RTRIM",
    "SCHEMA",
    "SEC_TO_TIME",
    "SECOND",
    "SESSION_USER",
    "SHA1",
    "SHA2",
    "SIGN",
    "SIN",
    "SLEEP",
    "SOUNDEX",
    "SOUNDS LIKE",
    "SOURCE_POS_WAIT",
    "SPACE",
    "SQRT",
    "ST_AREA",
    "ST_ASBINARY",
    "ST_ASGEOJSON",
    "ST_ASTEXT",
    "ST_BUFFER",
    "ST_BUFFER_STRATEGY",
    "ST_CENTROID",
    "ST_COLLECT",
    "ST_CONTAINS",
    "ST_CONVEXHULL",
    "ST_CROSSES",
    "ST_DIFFERENCE",
    "ST_DIMENSION",
    "ST_DISJOINT",
    "ST_DISTANCE",
    "ST_DISTANCE_SPHERE",
    "ST_ENDPOINT",
    "ST_ENVELOPE",
    "ST_EQUALS",
    "ST_EXTERIORRING",
    "ST_FRECHETDISTANCE",
    "ST_GEOHASH",
    "ST_GEOMCOLLFROMTEXT",
    "ST_GEOMCOLLFROMWKB",
    "ST_GEOMETRYN",
    "ST_GEOMETRYTYPE",
    "ST_GEOMFROMGEOJSON",
    "ST_GEOMFROMTEXT",
    "ST_GEOMFROMWKB",
    "ST_HAUSDORFFDISTANCE",
    "ST_INTERIORRINGN",
    "ST_INTERSECTION",
    "ST_INTERSECTS",
    "ST_ISCLOSED",
    "ST_ISEMPTY",
    "ST_ISSIMPLE",
    "ST_ISVALID",
    "ST_LATFROMGEOHASH",
    "ST_LATITUDE",
    "ST_LENGTH",
    "ST_LINEFROMTEXT",
    "ST_LINEFROMWKB",
    "ST_LINEINTERPOLATEPOINT",
    "ST_LINEINTERPOLATEPOINTS",
    "ST_LONGFROMGEOHASH",
    "ST_LONGITUDE",
    "ST_MAKEENVELOPE",
    "ST_MLINEFROMTEXT",
    "ST_MLINEFROMWKB",
    "ST_MPOINTFROMTEXT",
    "ST_MPOINTFROMWKB",
    "ST_MPOLYFROMTEXT",
    "ST_MPOLYFROMWKB",
    "ST_NUMGEOMETRIES",
    "ST_NUMINTERIORRING",
    "ST_NUMPOINTS",
    "ST_OVERLAPS",
    "ST_POINTATDISTANCE",
    "ST_POINTFROMGEOHASH",
    "ST_POINTFROMTEXT",
    "ST_POINTFROMWKB",
    "ST_POINTN",
    "ST_POLYFROMTEXT",
    "ST_POLYFROMWKB",
    "ST_SIMPLIFY",
    "ST_SRID",
    "ST_STARTPOINT",
    "ST_SWAPXY",
    "ST_SYMDIFFERENCE",
    "ST_TOUCHES",
    "ST_TRANSFORM",
    "ST_UNION",
    "ST_VALIDATE",
    "ST_WITHIN",
    "ST_X",
    "ST_Y",
    "STATEMENT_DIGEST",
    "STATEMENT_DIGEST_TEXT",
    "STD",
    "STDDEV",
    "STDDEV_POP",
    "STDDEV_SAMP",
    "STR_TO_DATE",
    "STRCMP",
    "SUBDATE",
    "SUBSTR",
    "SUBSTRING",
    "SUBSTRING_INDEX",
    "SUBTIME",
    "SUM",
    "SYSDATE",
    "SYSTEM_USER",
    "TAN",
    "TIME",
    "TIME_FORMAT",
    "TIME_TO_SEC",
    "TIMEDIFF",
    "TIMESTAMP",
    "TIMESTAMPADD",
    "TIMESTAMPDIFF",
    "TO_BASE64",
    "TO_DAYS",
    "TO_SECONDS",
    "TRIM",
    "TRUNCATE",
    "UCASE",
    "UNCOMPRESS",
    "UNCOMPRESSED_LENGTH",
    "UNHEX",
    "UNIX_TIMESTAMP",
    "UPDATEXML",
    "UPPER",
    // 'USER',
    "UTC_DATE",
    "UTC_TIME",
    "UTC_TIMESTAMP",
    "UUID",
    "UUID_SHORT",
    "UUID_TO_BIN",
    "VALIDATE_PASSWORD_STRENGTH",
    "VALUES",
    "VAR_POP",
    "VAR_SAMP",
    "VARIANCE",
    "VERSION",
    "WAIT_FOR_EXECUTED_GTID_SET",
    "WAIT_UNTIL_SQL_THREAD_AFTER_GTIDS",
    "WEEK",
    "WEEKDAY",
    "WEEKOFYEAR",
    "WEIGHT_STRING",
    // 'XOR',
    "YEAR",
    "YEARWEEK"
  ];

  // node_modules/sql-formatter/dist/esm/languages/mysql/mysql.formatter.js
  var reservedSelect = expandPhrases(["SELECT [ALL | DISTINCT | DISTINCTROW]"]);
  var reservedClauses = expandPhrases([
    // queries
    "WITH [RECURSIVE]",
    "FROM",
    "WHERE",
    "GROUP BY",
    "HAVING",
    "WINDOW",
    "PARTITION BY",
    "ORDER BY",
    "LIMIT",
    "OFFSET",
    // Data manipulation
    // - insert:
    "INSERT [LOW_PRIORITY | DELAYED | HIGH_PRIORITY] [IGNORE] [INTO]",
    "REPLACE [LOW_PRIORITY | DELAYED] [INTO]",
    "VALUES",
    "ON DUPLICATE KEY UPDATE",
    // - update:
    "SET"
  ]);
  var standardOnelineClauses = expandPhrases(["CREATE [TEMPORARY] TABLE [IF NOT EXISTS]"]);
  var tabularOnelineClauses = expandPhrases([
    // - create:
    "CREATE [OR REPLACE] [SQL SECURITY DEFINER | SQL SECURITY INVOKER] VIEW [IF NOT EXISTS]",
    // - update:
    "UPDATE [LOW_PRIORITY] [IGNORE]",
    // - delete:
    "DELETE [LOW_PRIORITY] [QUICK] [IGNORE] FROM",
    // - drop table:
    "DROP [TEMPORARY] TABLE [IF EXISTS]",
    // - alter table:
    "ALTER TABLE",
    "ADD [COLUMN]",
    "{CHANGE | MODIFY} [COLUMN]",
    "DROP [COLUMN]",
    "RENAME [TO | AS]",
    "RENAME COLUMN",
    "ALTER [COLUMN]",
    "{SET | DROP} DEFAULT",
    // - truncate:
    "TRUNCATE [TABLE]",
    // https://dev.mysql.com/doc/refman/8.0/en/sql-statements.html
    "ALTER DATABASE",
    "ALTER EVENT",
    "ALTER FUNCTION",
    "ALTER INSTANCE",
    "ALTER LOGFILE GROUP",
    "ALTER PROCEDURE",
    "ALTER RESOURCE GROUP",
    "ALTER SERVER",
    "ALTER TABLESPACE",
    "ALTER USER",
    "ALTER VIEW",
    "ANALYZE TABLE",
    "BINLOG",
    "CACHE INDEX",
    "CALL",
    "CHANGE MASTER TO",
    "CHANGE REPLICATION FILTER",
    "CHANGE REPLICATION SOURCE TO",
    "CHECK TABLE",
    "CHECKSUM TABLE",
    "CLONE",
    "COMMIT",
    "CREATE DATABASE",
    "CREATE EVENT",
    "CREATE FUNCTION",
    "CREATE FUNCTION",
    "CREATE INDEX",
    "CREATE LOGFILE GROUP",
    "CREATE PROCEDURE",
    "CREATE RESOURCE GROUP",
    "CREATE ROLE",
    "CREATE SERVER",
    "CREATE SPATIAL REFERENCE SYSTEM",
    "CREATE TABLESPACE",
    "CREATE TRIGGER",
    "CREATE USER",
    "DEALLOCATE PREPARE",
    "DESCRIBE",
    "DROP DATABASE",
    "DROP EVENT",
    "DROP FUNCTION",
    "DROP FUNCTION",
    "DROP INDEX",
    "DROP LOGFILE GROUP",
    "DROP PROCEDURE",
    "DROP RESOURCE GROUP",
    "DROP ROLE",
    "DROP SERVER",
    "DROP SPATIAL REFERENCE SYSTEM",
    "DROP TABLESPACE",
    "DROP TRIGGER",
    "DROP USER",
    "DROP VIEW",
    "EXECUTE",
    "EXPLAIN",
    "FLUSH",
    "GRANT",
    "HANDLER",
    "HELP",
    "IMPORT TABLE",
    "INSTALL COMPONENT",
    "INSTALL PLUGIN",
    "KILL",
    "LOAD DATA",
    "LOAD INDEX INTO CACHE",
    "LOAD XML",
    "LOCK INSTANCE FOR BACKUP",
    "LOCK TABLES",
    "MASTER_POS_WAIT",
    "OPTIMIZE TABLE",
    "PREPARE",
    "PURGE BINARY LOGS",
    "RELEASE SAVEPOINT",
    "RENAME TABLE",
    "RENAME USER",
    "REPAIR TABLE",
    "RESET",
    "RESET MASTER",
    "RESET PERSIST",
    "RESET REPLICA",
    "RESET SLAVE",
    "RESTART",
    "REVOKE",
    "ROLLBACK",
    "ROLLBACK TO SAVEPOINT",
    "SAVEPOINT",
    "SET CHARACTER SET",
    "SET DEFAULT ROLE",
    "SET NAMES",
    "SET PASSWORD",
    "SET RESOURCE GROUP",
    "SET ROLE",
    "SET TRANSACTION",
    "SHOW",
    "SHOW BINARY LOGS",
    "SHOW BINLOG EVENTS",
    "SHOW CHARACTER SET",
    "SHOW COLLATION",
    "SHOW COLUMNS",
    "SHOW CREATE DATABASE",
    "SHOW CREATE EVENT",
    "SHOW CREATE FUNCTION",
    "SHOW CREATE PROCEDURE",
    "SHOW CREATE TABLE",
    "SHOW CREATE TRIGGER",
    "SHOW CREATE USER",
    "SHOW CREATE VIEW",
    "SHOW DATABASES",
    "SHOW ENGINE",
    "SHOW ENGINES",
    "SHOW ERRORS",
    "SHOW EVENTS",
    "SHOW FUNCTION CODE",
    "SHOW FUNCTION STATUS",
    "SHOW GRANTS",
    "SHOW INDEX",
    "SHOW MASTER STATUS",
    "SHOW OPEN TABLES",
    "SHOW PLUGINS",
    "SHOW PRIVILEGES",
    "SHOW PROCEDURE CODE",
    "SHOW PROCEDURE STATUS",
    "SHOW PROCESSLIST",
    "SHOW PROFILE",
    "SHOW PROFILES",
    "SHOW RELAYLOG EVENTS",
    "SHOW REPLICA STATUS",
    "SHOW REPLICAS",
    "SHOW SLAVE",
    "SHOW SLAVE HOSTS",
    "SHOW STATUS",
    "SHOW TABLE STATUS",
    "SHOW TABLES",
    "SHOW TRIGGERS",
    "SHOW VARIABLES",
    "SHOW WARNINGS",
    "SHUTDOWN",
    "SOURCE_POS_WAIT",
    "START GROUP_REPLICATION",
    "START REPLICA",
    "START SLAVE",
    "START TRANSACTION",
    "STOP GROUP_REPLICATION",
    "STOP REPLICA",
    "STOP SLAVE",
    "TABLE",
    "UNINSTALL COMPONENT",
    "UNINSTALL PLUGIN",
    "UNLOCK INSTANCE",
    "UNLOCK TABLES",
    "USE",
    "XA",
    // flow control
    // 'IF',
    "ITERATE",
    "LEAVE",
    "LOOP",
    "REPEAT",
    "RETURN",
    "WHILE"
  ]);
  var reservedSetOperations = expandPhrases(["UNION [ALL | DISTINCT]"]);
  var reservedJoins = expandPhrases([
    "JOIN",
    "{LEFT | RIGHT} [OUTER] JOIN",
    "{INNER | CROSS} JOIN",
    "NATURAL [INNER] JOIN",
    "NATURAL {LEFT | RIGHT} [OUTER] JOIN",
    // non-standard joins
    "STRAIGHT_JOIN"
  ]);
  var reservedKeywordPhrases = expandPhrases([
    "ON {UPDATE | DELETE} [SET NULL]",
    "CHARACTER SET",
    "{ROWS | RANGE} BETWEEN",
    "IDENTIFIED BY"
  ]);
  var reservedDataTypePhrases = expandPhrases([]);
  var mysql = {
    name: "mysql",
    tokenizerOptions: {
      reservedSelect,
      reservedClauses: [...reservedClauses, ...standardOnelineClauses, ...tabularOnelineClauses],
      reservedSetOperations,
      reservedJoins,
      reservedKeywordPhrases,
      reservedDataTypePhrases,
      supportsXor: true,
      reservedKeywords: keywords,
      reservedDataTypes: dataTypes,
      reservedFunctionNames: functions,
      // TODO: support _ char set prefixes such as _utf8, _latin1, _binary, _utf8mb4, etc.
      stringTypes: [
        '""-qq-bs',
        { quote: "''-qq-bs", prefixes: ["N"] },
        { quote: "''-raw", prefixes: ["B", "X"], requirePrefix: true }
      ],
      identTypes: ["``"],
      identChars: { first: "$", rest: "$", allowFirstCharNumber: true },
      variableTypes: [
        { regex: "@@?[A-Za-z0-9_.$]+" },
        { quote: '""-qq-bs', prefixes: ["@"], requirePrefix: true },
        { quote: "''-qq-bs", prefixes: ["@"], requirePrefix: true },
        { quote: "``", prefixes: ["@"], requirePrefix: true }
      ],
      paramTypes: { positional: true },
      lineCommentTypes: ["--", "#"],
      operators: [
        "%",
        ":=",
        "&",
        "|",
        "^",
        "~",
        "<<",
        ">>",
        "<=>",
        "->",
        "->>",
        "&&",
        "||",
        "!",
        "*.*"
        // Not actually an operator
      ],
      postProcess
    },
    formatOptions: {
      onelineClauses: [...standardOnelineClauses, ...tabularOnelineClauses],
      tabularOnelineClauses
    }
  };

  // node_modules/sql-formatter/dist/esm/languages/postgresql/postgresql.functions.js
  var functions2 = [
    // https://www.postgresql.org/docs/14/functions.html
    //
    // https://www.postgresql.org/docs/14/functions-math.html
    "ABS",
    "ACOS",
    "ACOSD",
    "ACOSH",
    "ASIN",
    "ASIND",
    "ASINH",
    "ATAN",
    "ATAN2",
    "ATAN2D",
    "ATAND",
    "ATANH",
    "CBRT",
    "CEIL",
    "CEILING",
    "COS",
    "COSD",
    "COSH",
    "COT",
    "COTD",
    "DEGREES",
    "DIV",
    "EXP",
    "FACTORIAL",
    "FLOOR",
    "GCD",
    "LCM",
    "LN",
    "LOG",
    "LOG10",
    "MIN_SCALE",
    "MOD",
    "PI",
    "POWER",
    "RADIANS",
    "RANDOM",
    "ROUND",
    "SCALE",
    "SETSEED",
    "SIGN",
    "SIN",
    "SIND",
    "SINH",
    "SQRT",
    "TAN",
    "TAND",
    "TANH",
    "TRIM_SCALE",
    "TRUNC",
    "WIDTH_BUCKET",
    // https://www.postgresql.org/docs/14/functions-string.html
    "ABS",
    "ASCII",
    "BIT_LENGTH",
    "BTRIM",
    "CHARACTER_LENGTH",
    "CHAR_LENGTH",
    "CHR",
    "CONCAT",
    "CONCAT_WS",
    "FORMAT",
    "INITCAP",
    "LEFT",
    "LENGTH",
    "LOWER",
    "LPAD",
    "LTRIM",
    "MD5",
    "NORMALIZE",
    "OCTET_LENGTH",
    "OVERLAY",
    "PARSE_IDENT",
    "PG_CLIENT_ENCODING",
    "POSITION",
    "QUOTE_IDENT",
    "QUOTE_LITERAL",
    "QUOTE_NULLABLE",
    "REGEXP_MATCH",
    "REGEXP_MATCHES",
    "REGEXP_REPLACE",
    "REGEXP_SPLIT_TO_ARRAY",
    "REGEXP_SPLIT_TO_TABLE",
    "REPEAT",
    "REPLACE",
    "REVERSE",
    "RIGHT",
    "RPAD",
    "RTRIM",
    "SPLIT_PART",
    "SPRINTF",
    "STARTS_WITH",
    "STRING_AGG",
    "STRING_TO_ARRAY",
    "STRING_TO_TABLE",
    "STRPOS",
    "SUBSTR",
    "SUBSTRING",
    "TO_ASCII",
    "TO_HEX",
    "TRANSLATE",
    "TRIM",
    "UNISTR",
    "UPPER",
    // https://www.postgresql.org/docs/14/functions-binarystring.html
    "BIT_COUNT",
    "BIT_LENGTH",
    "BTRIM",
    "CONVERT",
    "CONVERT_FROM",
    "CONVERT_TO",
    "DECODE",
    "ENCODE",
    "GET_BIT",
    "GET_BYTE",
    "LENGTH",
    "LTRIM",
    "MD5",
    "OCTET_LENGTH",
    "OVERLAY",
    "POSITION",
    "RTRIM",
    "SET_BIT",
    "SET_BYTE",
    "SHA224",
    "SHA256",
    "SHA384",
    "SHA512",
    "STRING_AGG",
    "SUBSTR",
    "SUBSTRING",
    "TRIM",
    // https://www.postgresql.org/docs/14/functions-bitstring.html
    "BIT_COUNT",
    "BIT_LENGTH",
    "GET_BIT",
    "LENGTH",
    "OCTET_LENGTH",
    "OVERLAY",
    "POSITION",
    "SET_BIT",
    "SUBSTRING",
    // https://www.postgresql.org/docs/14/functions-matching.html
    "REGEXP_MATCH",
    "REGEXP_MATCHES",
    "REGEXP_REPLACE",
    "REGEXP_SPLIT_TO_ARRAY",
    "REGEXP_SPLIT_TO_TABLE",
    // https://www.postgresql.org/docs/14/functions-formatting.html
    "TO_CHAR",
    "TO_DATE",
    "TO_NUMBER",
    "TO_TIMESTAMP",
    // https://www.postgresql.org/docs/14/functions-datetime.html
    // 'AGE',
    "CLOCK_TIMESTAMP",
    "CURRENT_DATE",
    "CURRENT_TIME",
    "CURRENT_TIMESTAMP",
    "DATE_BIN",
    "DATE_PART",
    "DATE_TRUNC",
    "EXTRACT",
    "ISFINITE",
    "JUSTIFY_DAYS",
    "JUSTIFY_HOURS",
    "JUSTIFY_INTERVAL",
    "LOCALTIME",
    "LOCALTIMESTAMP",
    "MAKE_DATE",
    "MAKE_INTERVAL",
    "MAKE_TIME",
    "MAKE_TIMESTAMP",
    "MAKE_TIMESTAMPTZ",
    "NOW",
    "PG_SLEEP",
    "PG_SLEEP_FOR",
    "PG_SLEEP_UNTIL",
    "STATEMENT_TIMESTAMP",
    "TIMEOFDAY",
    "TO_TIMESTAMP",
    "TRANSACTION_TIMESTAMP",
    // https://www.postgresql.org/docs/14/functions-enum.html
    "ENUM_FIRST",
    "ENUM_LAST",
    "ENUM_RANGE",
    // https://www.postgresql.org/docs/14/functions-geometry.html
    "AREA",
    "BOUND_BOX",
    "BOX",
    "CENTER",
    "CIRCLE",
    "DIAGONAL",
    "DIAMETER",
    "HEIGHT",
    "ISCLOSED",
    "ISOPEN",
    "LENGTH",
    "LINE",
    "LSEG",
    "NPOINTS",
    "PATH",
    "PCLOSE",
    "POINT",
    "POLYGON",
    "POPEN",
    "RADIUS",
    "SLOPE",
    "WIDTH",
    // https://www.postgresql.org/docs/14/functions-net.html
    "ABBREV",
    "BROADCAST",
    "FAMILY",
    "HOST",
    "HOSTMASK",
    "INET_MERGE",
    "INET_SAME_FAMILY",
    "MACADDR8_SET7BIT",
    "MASKLEN",
    "NETMASK",
    "NETWORK",
    "SET_MASKLEN",
    // 'TEXT', // excluded because it's also a data type name
    "TRUNC",
    // https://www.postgresql.org/docs/14/functions-textsearch.html
    "ARRAY_TO_TSVECTOR",
    "GET_CURRENT_TS_CONFIG",
    "JSONB_TO_TSVECTOR",
    "JSON_TO_TSVECTOR",
    "LENGTH",
    "NUMNODE",
    "PHRASETO_TSQUERY",
    "PLAINTO_TSQUERY",
    "QUERYTREE",
    "SETWEIGHT",
    "STRIP",
    "TO_TSQUERY",
    "TO_TSVECTOR",
    "TSQUERY_PHRASE",
    "TSVECTOR_TO_ARRAY",
    "TS_DEBUG",
    "TS_DELETE",
    "TS_FILTER",
    "TS_HEADLINE",
    "TS_LEXIZE",
    "TS_PARSE",
    "TS_RANK",
    "TS_RANK_CD",
    "TS_REWRITE",
    "TS_STAT",
    "TS_TOKEN_TYPE",
    "WEBSEARCH_TO_TSQUERY",
    // https://www.postgresql.org/docs/18/functions-uuid.html
    "GEN_RANDOM_UUID",
    "UUIDV4",
    "UUIDV7",
    "UUID_EXTRACT_TIMESTAMP",
    "UUID_EXTRACT_VERSION",
    // https://www.postgresql.org/docs/14/functions-xml.html
    "CURSOR_TO_XML",
    "CURSOR_TO_XMLSCHEMA",
    "DATABASE_TO_XML",
    "DATABASE_TO_XMLSCHEMA",
    "DATABASE_TO_XML_AND_XMLSCHEMA",
    "NEXTVAL",
    "QUERY_TO_XML",
    "QUERY_TO_XMLSCHEMA",
    "QUERY_TO_XML_AND_XMLSCHEMA",
    "SCHEMA_TO_XML",
    "SCHEMA_TO_XMLSCHEMA",
    "SCHEMA_TO_XML_AND_XMLSCHEMA",
    "STRING",
    "TABLE_TO_XML",
    "TABLE_TO_XMLSCHEMA",
    "TABLE_TO_XML_AND_XMLSCHEMA",
    "XMLAGG",
    "XMLCOMMENT",
    "XMLCONCAT",
    "XMLELEMENT",
    "XMLEXISTS",
    "XMLFOREST",
    "XMLPARSE",
    "XMLPI",
    "XMLROOT",
    "XMLSERIALIZE",
    "XMLTABLE",
    "XML_IS_WELL_FORMED",
    "XML_IS_WELL_FORMED_CONTENT",
    "XML_IS_WELL_FORMED_DOCUMENT",
    "XPATH",
    "XPATH_EXISTS",
    // https://www.postgresql.org/docs/14/functions-json.html
    "ARRAY_TO_JSON",
    "JSONB_AGG",
    "JSONB_ARRAY_ELEMENTS",
    "JSONB_ARRAY_ELEMENTS_TEXT",
    "JSONB_ARRAY_LENGTH",
    "JSONB_BUILD_ARRAY",
    "JSONB_BUILD_OBJECT",
    "JSONB_EACH",
    "JSONB_EACH_TEXT",
    "JSONB_EXTRACT_PATH",
    "JSONB_EXTRACT_PATH_TEXT",
    "JSONB_INSERT",
    "JSONB_OBJECT",
    "JSONB_OBJECT_AGG",
    "JSONB_OBJECT_KEYS",
    "JSONB_PATH_EXISTS",
    "JSONB_PATH_EXISTS_TZ",
    "JSONB_PATH_MATCH",
    "JSONB_PATH_MATCH_TZ",
    "JSONB_PATH_QUERY",
    "JSONB_PATH_QUERY_ARRAY",
    "JSONB_PATH_QUERY_ARRAY_TZ",
    "JSONB_PATH_QUERY_FIRST",
    "JSONB_PATH_QUERY_FIRST_TZ",
    "JSONB_PATH_QUERY_TZ",
    "JSONB_POPULATE_RECORD",
    "JSONB_POPULATE_RECORDSET",
    "JSONB_PRETTY",
    "JSONB_SET",
    "JSONB_SET_LAX",
    "JSONB_STRIP_NULLS",
    "JSONB_TO_RECORD",
    "JSONB_TO_RECORDSET",
    "JSONB_TYPEOF",
    "JSON_AGG",
    "JSON_ARRAY_ELEMENTS",
    "JSON_ARRAY_ELEMENTS_TEXT",
    "JSON_ARRAY_LENGTH",
    "JSON_BUILD_ARRAY",
    "JSON_BUILD_OBJECT",
    "JSON_EACH",
    "JSON_EACH_TEXT",
    "JSON_EXTRACT_PATH",
    "JSON_EXTRACT_PATH_TEXT",
    "JSON_OBJECT",
    "JSON_OBJECT_AGG",
    "JSON_OBJECT_KEYS",
    "JSON_POPULATE_RECORD",
    "JSON_POPULATE_RECORDSET",
    "JSON_STRIP_NULLS",
    "JSON_TO_RECORD",
    "JSON_TO_RECORDSET",
    "JSON_TYPEOF",
    "ROW_TO_JSON",
    "TO_JSON",
    "TO_JSONB",
    "TO_TIMESTAMP",
    // https://www.postgresql.org/docs/14/functions-sequence.html
    "CURRVAL",
    "LASTVAL",
    "NEXTVAL",
    "SETVAL",
    // https://www.postgresql.org/docs/14/functions-conditional.html
    // 'CASE',
    "COALESCE",
    "GREATEST",
    "LEAST",
    "NULLIF",
    // https://www.postgresql.org/docs/14/functions-array.html
    "ARRAY_AGG",
    "ARRAY_APPEND",
    "ARRAY_CAT",
    "ARRAY_DIMS",
    "ARRAY_FILL",
    "ARRAY_LENGTH",
    "ARRAY_LOWER",
    "ARRAY_NDIMS",
    "ARRAY_POSITION",
    "ARRAY_POSITIONS",
    "ARRAY_PREPEND",
    "ARRAY_REMOVE",
    "ARRAY_REPLACE",
    "ARRAY_TO_STRING",
    "ARRAY_UPPER",
    "CARDINALITY",
    "STRING_TO_ARRAY",
    "TRIM_ARRAY",
    "UNNEST",
    // https://www.postgresql.org/docs/14/functions-range.html
    "ISEMPTY",
    "LOWER",
    "LOWER_INC",
    "LOWER_INF",
    "MULTIRANGE",
    "RANGE_MERGE",
    "UPPER",
    "UPPER_INC",
    "UPPER_INF",
    // https://www.postgresql.org/docs/14/functions-aggregate.html
    // 'ANY',
    "ARRAY_AGG",
    "AVG",
    "BIT_AND",
    "BIT_OR",
    "BIT_XOR",
    "BOOL_AND",
    "BOOL_OR",
    "COALESCE",
    "CORR",
    "COUNT",
    "COVAR_POP",
    "COVAR_SAMP",
    "CUME_DIST",
    "DENSE_RANK",
    "EVERY",
    "GROUPING",
    "JSONB_AGG",
    "JSONB_OBJECT_AGG",
    "JSON_AGG",
    "JSON_OBJECT_AGG",
    "MAX",
    "MIN",
    "MODE",
    "PERCENTILE_CONT",
    "PERCENTILE_DISC",
    "PERCENT_RANK",
    "RANGE_AGG",
    "RANGE_INTERSECT_AGG",
    "RANK",
    "REGR_AVGX",
    "REGR_AVGY",
    "REGR_COUNT",
    "REGR_INTERCEPT",
    "REGR_R2",
    "REGR_SLOPE",
    "REGR_SXX",
    "REGR_SXY",
    "REGR_SYY",
    // 'SOME',
    "STDDEV",
    "STDDEV_POP",
    "STDDEV_SAMP",
    "STRING_AGG",
    "SUM",
    "TO_JSON",
    "TO_JSONB",
    "VARIANCE",
    "VAR_POP",
    "VAR_SAMP",
    "XMLAGG",
    // https://www.postgresql.org/docs/14/functions-window.html
    "CUME_DIST",
    "DENSE_RANK",
    "FIRST_VALUE",
    "LAG",
    "LAST_VALUE",
    "LEAD",
    "NTH_VALUE",
    "NTILE",
    "PERCENT_RANK",
    "RANK",
    "ROW_NUMBER",
    // https://www.postgresql.org/docs/14/functions-srf.html
    "GENERATE_SERIES",
    "GENERATE_SUBSCRIPTS",
    // https://www.postgresql.org/docs/14/functions-info.html
    "ACLDEFAULT",
    "ACLEXPLODE",
    "COL_DESCRIPTION",
    "CURRENT_CATALOG",
    "CURRENT_DATABASE",
    "CURRENT_QUERY",
    "CURRENT_ROLE",
    "CURRENT_SCHEMA",
    "CURRENT_SCHEMAS",
    "CURRENT_USER",
    "FORMAT_TYPE",
    "HAS_ANY_COLUMN_PRIVILEGE",
    "HAS_COLUMN_PRIVILEGE",
    "HAS_DATABASE_PRIVILEGE",
    "HAS_FOREIGN_DATA_WRAPPER_PRIVILEGE",
    "HAS_FUNCTION_PRIVILEGE",
    "HAS_LANGUAGE_PRIVILEGE",
    "HAS_SCHEMA_PRIVILEGE",
    "HAS_SEQUENCE_PRIVILEGE",
    "HAS_SERVER_PRIVILEGE",
    "HAS_TABLESPACE_PRIVILEGE",
    "HAS_TABLE_PRIVILEGE",
    "HAS_TYPE_PRIVILEGE",
    "INET_CLIENT_ADDR",
    "INET_CLIENT_PORT",
    "INET_SERVER_ADDR",
    "INET_SERVER_PORT",
    "MAKEACLITEM",
    "OBJ_DESCRIPTION",
    "PG_BACKEND_PID",
    "PG_BLOCKING_PIDS",
    "PG_COLLATION_IS_VISIBLE",
    "PG_CONF_LOAD_TIME",
    "PG_CONTROL_CHECKPOINT",
    "PG_CONTROL_INIT",
    "PG_CONTROL_SYSTEM",
    "PG_CONVERSION_IS_VISIBLE",
    "PG_CURRENT_LOGFILE",
    "PG_CURRENT_SNAPSHOT",
    "PG_CURRENT_XACT_ID",
    "PG_CURRENT_XACT_ID_IF_ASSIGNED",
    "PG_DESCRIBE_OBJECT",
    "PG_FUNCTION_IS_VISIBLE",
    "PG_GET_CATALOG_FOREIGN_KEYS",
    "PG_GET_CONSTRAINTDEF",
    "PG_GET_EXPR",
    "PG_GET_FUNCTIONDEF",
    "PG_GET_FUNCTION_ARGUMENTS",
    "PG_GET_FUNCTION_IDENTITY_ARGUMENTS",
    "PG_GET_FUNCTION_RESULT",
    "PG_GET_INDEXDEF",
    "PG_GET_KEYWORDS",
    "PG_GET_OBJECT_ADDRESS",
    "PG_GET_OWNED_SEQUENCE",
    "PG_GET_RULEDEF",
    "PG_GET_SERIAL_SEQUENCE",
    "PG_GET_STATISTICSOBJDEF",
    "PG_GET_TRIGGERDEF",
    "PG_GET_USERBYID",
    "PG_GET_VIEWDEF",
    "PG_HAS_ROLE",
    "PG_IDENTIFY_OBJECT",
    "PG_IDENTIFY_OBJECT_AS_ADDRESS",
    "PG_INDEXAM_HAS_PROPERTY",
    "PG_INDEX_COLUMN_HAS_PROPERTY",
    "PG_INDEX_HAS_PROPERTY",
    "PG_IS_OTHER_TEMP_SCHEMA",
    "PG_JIT_AVAILABLE",
    "PG_LAST_COMMITTED_XACT",
    "PG_LISTENING_CHANNELS",
    "PG_MY_TEMP_SCHEMA",
    "PG_NOTIFICATION_QUEUE_USAGE",
    "PG_OPCLASS_IS_VISIBLE",
    "PG_OPERATOR_IS_VISIBLE",
    "PG_OPFAMILY_IS_VISIBLE",
    "PG_OPTIONS_TO_TABLE",
    "PG_POSTMASTER_START_TIME",
    "PG_SAFE_SNAPSHOT_BLOCKING_PIDS",
    "PG_SNAPSHOT_XIP",
    "PG_SNAPSHOT_XMAX",
    "PG_SNAPSHOT_XMIN",
    "PG_STATISTICS_OBJ_IS_VISIBLE",
    "PG_TABLESPACE_DATABASES",
    "PG_TABLESPACE_LOCATION",
    "PG_TABLE_IS_VISIBLE",
    "PG_TRIGGER_DEPTH",
    "PG_TS_CONFIG_IS_VISIBLE",
    "PG_TS_DICT_IS_VISIBLE",
    "PG_TS_PARSER_IS_VISIBLE",
    "PG_TS_TEMPLATE_IS_VISIBLE",
    "PG_TYPEOF",
    "PG_TYPE_IS_VISIBLE",
    "PG_VISIBLE_IN_SNAPSHOT",
    "PG_XACT_COMMIT_TIMESTAMP",
    "PG_XACT_COMMIT_TIMESTAMP_ORIGIN",
    "PG_XACT_STATUS",
    "PQSERVERVERSION",
    "ROW_SECURITY_ACTIVE",
    "SESSION_USER",
    "SHOBJ_DESCRIPTION",
    "TO_REGCLASS",
    "TO_REGCOLLATION",
    "TO_REGNAMESPACE",
    "TO_REGOPER",
    "TO_REGOPERATOR",
    "TO_REGPROC",
    "TO_REGPROCEDURE",
    "TO_REGROLE",
    "TO_REGTYPE",
    "TXID_CURRENT",
    "TXID_CURRENT_IF_ASSIGNED",
    "TXID_CURRENT_SNAPSHOT",
    "TXID_SNAPSHOT_XIP",
    "TXID_SNAPSHOT_XMAX",
    "TXID_SNAPSHOT_XMIN",
    "TXID_STATUS",
    "TXID_VISIBLE_IN_SNAPSHOT",
    "USER",
    "VERSION",
    // https://www.postgresql.org/docs/14/functions-admin.html
    "BRIN_DESUMMARIZE_RANGE",
    "BRIN_SUMMARIZE_NEW_VALUES",
    "BRIN_SUMMARIZE_RANGE",
    "CONVERT_FROM",
    "CURRENT_SETTING",
    "GIN_CLEAN_PENDING_LIST",
    "PG_ADVISORY_LOCK",
    "PG_ADVISORY_LOCK_SHARED",
    "PG_ADVISORY_UNLOCK",
    "PG_ADVISORY_UNLOCK_ALL",
    "PG_ADVISORY_UNLOCK_SHARED",
    "PG_ADVISORY_XACT_LOCK",
    "PG_ADVISORY_XACT_LOCK_SHARED",
    "PG_BACKUP_START_TIME",
    "PG_CANCEL_BACKEND",
    "PG_COLLATION_ACTUAL_VERSION",
    "PG_COLUMN_COMPRESSION",
    "PG_COLUMN_SIZE",
    "PG_COPY_LOGICAL_REPLICATION_SLOT",
    "PG_COPY_PHYSICAL_REPLICATION_SLOT",
    "PG_CREATE_LOGICAL_REPLICATION_SLOT",
    "PG_CREATE_PHYSICAL_REPLICATION_SLOT",
    "PG_CREATE_RESTORE_POINT",
    "PG_CURRENT_WAL_FLUSH_LSN",
    "PG_CURRENT_WAL_INSERT_LSN",
    "PG_CURRENT_WAL_LSN",
    "PG_DATABASE_SIZE",
    "PG_DROP_REPLICATION_SLOT",
    "PG_EXPORT_SNAPSHOT",
    "PG_FILENODE_RELATION",
    "PG_GET_WAL_REPLAY_PAUSE_STATE",
    "PG_IMPORT_SYSTEM_COLLATIONS",
    "PG_INDEXES_SIZE",
    "PG_IS_IN_BACKUP",
    "PG_IS_IN_RECOVERY",
    "PG_IS_WAL_REPLAY_PAUSED",
    "PG_LAST_WAL_RECEIVE_LSN",
    "PG_LAST_WAL_REPLAY_LSN",
    "PG_LAST_XACT_REPLAY_TIMESTAMP",
    "PG_LOGICAL_EMIT_MESSAGE",
    "PG_LOGICAL_SLOT_GET_BINARY_CHANGES",
    "PG_LOGICAL_SLOT_GET_CHANGES",
    "PG_LOGICAL_SLOT_PEEK_BINARY_CHANGES",
    "PG_LOGICAL_SLOT_PEEK_CHANGES",
    "PG_LOG_BACKEND_MEMORY_CONTEXTS",
    "PG_LS_ARCHIVE_STATUSDIR",
    "PG_LS_DIR",
    "PG_LS_LOGDIR",
    "PG_LS_TMPDIR",
    "PG_LS_WALDIR",
    "PG_PARTITION_ANCESTORS",
    "PG_PARTITION_ROOT",
    "PG_PARTITION_TREE",
    "PG_PROMOTE",
    "PG_READ_BINARY_FILE",
    "PG_READ_FILE",
    "PG_RELATION_FILENODE",
    "PG_RELATION_FILEPATH",
    "PG_RELATION_SIZE",
    "PG_RELOAD_CONF",
    "PG_REPLICATION_ORIGIN_ADVANCE",
    "PG_REPLICATION_ORIGIN_CREATE",
    "PG_REPLICATION_ORIGIN_DROP",
    "PG_REPLICATION_ORIGIN_OID",
    "PG_REPLICATION_ORIGIN_PROGRESS",
    "PG_REPLICATION_ORIGIN_SESSION_IS_SETUP",
    "PG_REPLICATION_ORIGIN_SESSION_PROGRESS",
    "PG_REPLICATION_ORIGIN_SESSION_RESET",
    "PG_REPLICATION_ORIGIN_SESSION_SETUP",
    "PG_REPLICATION_ORIGIN_XACT_RESET",
    "PG_REPLICATION_ORIGIN_XACT_SETUP",
    "PG_REPLICATION_SLOT_ADVANCE",
    "PG_ROTATE_LOGFILE",
    "PG_SIZE_BYTES",
    "PG_SIZE_PRETTY",
    "PG_START_BACKUP",
    "PG_STAT_FILE",
    "PG_STOP_BACKUP",
    "PG_SWITCH_WAL",
    "PG_TABLESPACE_SIZE",
    "PG_TABLE_SIZE",
    "PG_TERMINATE_BACKEND",
    "PG_TOTAL_RELATION_SIZE",
    "PG_TRY_ADVISORY_LOCK",
    "PG_TRY_ADVISORY_LOCK_SHARED",
    "PG_TRY_ADVISORY_XACT_LOCK",
    "PG_TRY_ADVISORY_XACT_LOCK_SHARED",
    "PG_WALFILE_NAME",
    "PG_WALFILE_NAME_OFFSET",
    "PG_WAL_LSN_DIFF",
    "PG_WAL_REPLAY_PAUSE",
    "PG_WAL_REPLAY_RESUME",
    "SET_CONFIG",
    // https://www.postgresql.org/docs/14/functions-trigger.html
    "SUPPRESS_REDUNDANT_UPDATES_TRIGGER",
    "TSVECTOR_UPDATE_TRIGGER",
    "TSVECTOR_UPDATE_TRIGGER_COLUMN",
    // https://www.postgresql.org/docs/14/functions-event-triggers.html
    "PG_EVENT_TRIGGER_DDL_COMMANDS",
    "PG_EVENT_TRIGGER_DROPPED_OBJECTS",
    "PG_EVENT_TRIGGER_TABLE_REWRITE_OID",
    "PG_EVENT_TRIGGER_TABLE_REWRITE_REASON",
    "PG_GET_OBJECT_ADDRESS",
    // https://www.postgresql.org/docs/14/functions-statistics.html
    "PG_MCV_LIST_ITEMS",
    // cast
    "CAST"
  ];

  // node_modules/sql-formatter/dist/esm/languages/postgresql/postgresql.keywords.js
  var keywords2 = [
    // https://www.postgresql.org/docs/14/sql-keywords-appendix.html
    "ALL",
    "ANALYSE",
    "ANALYZE",
    "AND",
    "ANY",
    "AS",
    "ASC",
    "ASYMMETRIC",
    "AUTHORIZATION",
    "BETWEEN",
    "BINARY",
    "BOTH",
    "CASE",
    "CAST",
    "CHECK",
    "COLLATE",
    "COLLATION",
    "COLUMN",
    "CONCURRENTLY",
    "CONSTRAINT",
    "CREATE",
    "CROSS",
    "CURRENT_CATALOG",
    "CURRENT_DATE",
    "CURRENT_ROLE",
    "CURRENT_SCHEMA",
    "CURRENT_TIME",
    "CURRENT_TIMESTAMP",
    "CURRENT_USER",
    "DAY",
    "DEFAULT",
    "DEFERRABLE",
    "DESC",
    "DISTINCT",
    "DO",
    "ELSE",
    "END",
    "EXCEPT",
    "EXISTS",
    "FALSE",
    "FETCH",
    "FILTER",
    "FOR",
    "FOREIGN",
    "FREEZE",
    "FROM",
    "FULL",
    "GRANT",
    "GROUP",
    "HAVING",
    "HOUR",
    "ILIKE",
    "IN",
    "INITIALLY",
    "INNER",
    "INOUT",
    "INTERSECT",
    "INTO",
    "IS",
    "ISNULL",
    "JOIN",
    "LATERAL",
    "LEADING",
    "LEFT",
    "LIKE",
    "LIMIT",
    "LOCALTIME",
    "LOCALTIMESTAMP",
    "MINUTE",
    "MONTH",
    "NATURAL",
    "NOT",
    "NOTNULL",
    "NULL",
    "NULLIF",
    "OFFSET",
    "ON",
    "ONLY",
    "OR",
    "ORDER",
    "OUT",
    "OUTER",
    "OVER",
    "OVERLAPS",
    "PLACING",
    "PRIMARY",
    "REFERENCES",
    "RETURNING",
    "RIGHT",
    "ROW",
    "SECOND",
    "SELECT",
    "SESSION_USER",
    "SIMILAR",
    "SOME",
    "SYMMETRIC",
    "TABLE",
    "TABLESAMPLE",
    "THEN",
    "TO",
    "TRAILING",
    "TRUE",
    "UNION",
    "UNIQUE",
    "USER",
    "USING",
    "VALUES",
    "VARIADIC",
    "VERBOSE",
    "WHEN",
    "WHERE",
    "WINDOW",
    "WITH",
    "WITHIN",
    "WITHOUT",
    "YEAR"
    // requires AS
  ];
  var dataTypes2 = [
    // https://www.postgresql.org/docs/current/datatype.html
    "ARRAY",
    "BIGINT",
    "BIT",
    "BIT VARYING",
    "BOOL",
    "BOOLEAN",
    "CHAR",
    "CHARACTER",
    "CHARACTER VARYING",
    "DECIMAL",
    "DEC",
    "DOUBLE",
    "ENUM",
    "FLOAT",
    "INT",
    "INTEGER",
    "INTERVAL",
    "NCHAR",
    "NUMERIC",
    "JSON",
    "JSONB",
    "PRECISION",
    "REAL",
    "SMALLINT",
    "TEXT",
    "TIME",
    "TIMESTAMP",
    "TIMESTAMPTZ",
    "UUID",
    "VARCHAR",
    "XML",
    "ZONE"
  ];

  // node_modules/sql-formatter/dist/esm/languages/postgresql/postgresql.formatter.js
  var reservedSelect2 = expandPhrases(["SELECT [ALL | DISTINCT]"]);
  var reservedClauses2 = expandPhrases([
    // queries
    "WITH [RECURSIVE]",
    "FROM",
    "WHERE",
    "GROUP BY [ALL | DISTINCT]",
    "HAVING",
    "WINDOW",
    "PARTITION BY",
    "ORDER BY",
    "LIMIT",
    "OFFSET",
    "FETCH {FIRST | NEXT}",
    "FOR {UPDATE | NO KEY UPDATE | SHARE | KEY SHARE} [OF]",
    // Data manipulation
    // - insert:
    "INSERT INTO",
    "VALUES",
    "DEFAULT VALUES",
    // - update:
    "SET",
    // other
    "RETURNING"
  ]);
  var standardOnelineClauses2 = expandPhrases([
    "CREATE [GLOBAL | LOCAL] [TEMPORARY | TEMP | UNLOGGED] TABLE [IF NOT EXISTS]"
  ]);
  var tabularOnelineClauses2 = expandPhrases([
    // - create
    "CREATE [OR REPLACE] [TEMP | TEMPORARY] [RECURSIVE] VIEW",
    "CREATE [MATERIALIZED] VIEW [IF NOT EXISTS]",
    // - update:
    "UPDATE [ONLY]",
    "WHERE CURRENT OF",
    // - insert:
    "ON CONFLICT",
    // - delete:
    "DELETE FROM [ONLY]",
    // - drop table:
    "DROP TABLE [IF EXISTS]",
    // - alter table:
    "ALTER TABLE [IF EXISTS] [ONLY]",
    "ALTER TABLE ALL IN TABLESPACE",
    "RENAME [COLUMN]",
    "RENAME TO",
    "ADD [COLUMN] [IF NOT EXISTS]",
    "DROP [COLUMN] [IF EXISTS]",
    "ALTER [COLUMN]",
    "SET DATA TYPE",
    "{SET | DROP} DEFAULT",
    "{SET | DROP} NOT NULL",
    // - truncate:
    "TRUNCATE [TABLE] [ONLY]",
    // other
    "SET SCHEMA",
    "{BEFORE | AFTER | INSTEAD OF} {INSERT | UPDATE [OF] | DELETE | TRUNCATE}",
    "[NOT] DEFERRABLE",
    "INITIALLY {DEFERRED | IMMEDIATE}",
    "[NOT] DEFERRABLE INITIALLY {DEFERRED | IMMEDIATE}",
    // https://www.postgresql.org/docs/14/sql-commands.html
    "ABORT",
    "ALTER AGGREGATE",
    "ALTER COLLATION",
    "ALTER CONVERSION",
    "ALTER DATABASE",
    "ALTER DEFAULT PRIVILEGES",
    "ALTER DOMAIN",
    "ALTER EVENT TRIGGER",
    "ALTER EXTENSION",
    "ALTER FOREIGN DATA WRAPPER",
    "ALTER FOREIGN TABLE",
    "ALTER FUNCTION",
    "ALTER GROUP",
    "ALTER INDEX",
    "ALTER LANGUAGE",
    "ALTER LARGE OBJECT",
    "ALTER MATERIALIZED VIEW",
    "ALTER OPERATOR",
    "ALTER OPERATOR CLASS",
    "ALTER OPERATOR FAMILY",
    "ALTER POLICY",
    "ALTER PROCEDURE",
    "ALTER PUBLICATION",
    "ALTER ROLE",
    "ALTER ROUTINE",
    "ALTER RULE",
    "ALTER SCHEMA",
    "ALTER SEQUENCE",
    "ALTER SERVER",
    "ALTER STATISTICS",
    "ALTER SUBSCRIPTION",
    "ALTER SYSTEM",
    "ALTER TABLESPACE",
    "ALTER TEXT SEARCH CONFIGURATION",
    "ALTER TEXT SEARCH DICTIONARY",
    "ALTER TEXT SEARCH PARSER",
    "ALTER TEXT SEARCH TEMPLATE",
    "ALTER TRIGGER",
    "ALTER TYPE",
    "ALTER USER",
    "ALTER USER MAPPING",
    "ALTER VIEW",
    "ANALYZE",
    "BEGIN",
    "CALL",
    "CHECKPOINT",
    "CLOSE",
    "CLUSTER",
    "COMMENT ON",
    "COMMIT",
    "COMMIT PREPARED",
    "COPY",
    "CREATE ACCESS METHOD",
    "CREATE [OR REPLACE] AGGREGATE",
    "CREATE CAST",
    "CREATE COLLATION",
    "CREATE [DEFAULT] CONVERSION",
    "CREATE DATABASE",
    "CREATE DOMAIN",
    "CREATE EVENT TRIGGER",
    "CREATE EXTENSION",
    "CREATE FOREIGN DATA WRAPPER",
    "CREATE FOREIGN TABLE",
    "CREATE [OR REPLACE] FUNCTION",
    "CREATE GROUP",
    "CREATE [UNIQUE] INDEX",
    "CREATE [OR REPLACE] [TRUSTED] [PROCEDURAL] LANGUAGE",
    "CREATE OPERATOR",
    "CREATE OPERATOR CLASS",
    "CREATE OPERATOR FAMILY",
    "CREATE POLICY",
    "CREATE [OR REPLACE] PROCEDURE",
    "CREATE PUBLICATION",
    "CREATE ROLE",
    "CREATE [OR REPLACE] RULE",
    "CREATE SCHEMA [AUTHORIZATION]",
    "CREATE [TEMPORARY | TEMP | UNLOGGED] SEQUENCE",
    "CREATE SERVER",
    "CREATE STATISTICS",
    "CREATE SUBSCRIPTION",
    "CREATE TABLESPACE",
    "CREATE TEXT SEARCH CONFIGURATION",
    "CREATE TEXT SEARCH DICTIONARY",
    "CREATE TEXT SEARCH PARSER",
    "CREATE TEXT SEARCH TEMPLATE",
    "CREATE [OR REPLACE] TRANSFORM",
    "CREATE [OR REPLACE] [CONSTRAINT] TRIGGER",
    "CREATE TYPE",
    "CREATE USER",
    "CREATE USER MAPPING",
    "DEALLOCATE",
    "DECLARE",
    "DISCARD",
    "DROP ACCESS METHOD",
    "DROP AGGREGATE",
    "DROP CAST",
    "DROP COLLATION",
    "DROP CONVERSION",
    "DROP DATABASE",
    "DROP DOMAIN",
    "DROP EVENT TRIGGER",
    "DROP EXTENSION",
    "DROP FOREIGN DATA WRAPPER",
    "DROP FOREIGN TABLE",
    "DROP FUNCTION",
    "DROP GROUP",
    "DROP IDENTITY",
    "DROP INDEX",
    "DROP LANGUAGE",
    "DROP MATERIALIZED VIEW [IF EXISTS]",
    "DROP OPERATOR",
    "DROP OPERATOR CLASS",
    "DROP OPERATOR FAMILY",
    "DROP OWNED",
    "DROP POLICY",
    "DROP PROCEDURE",
    "DROP PUBLICATION",
    "DROP ROLE",
    "DROP ROUTINE",
    "DROP RULE",
    "DROP SCHEMA",
    "DROP SEQUENCE",
    "DROP SERVER",
    "DROP STATISTICS",
    "DROP SUBSCRIPTION",
    "DROP TABLESPACE",
    "DROP TEXT SEARCH CONFIGURATION",
    "DROP TEXT SEARCH DICTIONARY",
    "DROP TEXT SEARCH PARSER",
    "DROP TEXT SEARCH TEMPLATE",
    "DROP TRANSFORM",
    "DROP TRIGGER",
    "DROP TYPE",
    "DROP USER",
    "DROP USER MAPPING",
    "DROP VIEW",
    "EXECUTE [FUNCTION | PROCEDURE]",
    "EXPLAIN",
    "FETCH",
    "GRANT",
    "IMPORT FOREIGN SCHEMA",
    "LISTEN",
    "LOAD",
    "LOCK",
    "MOVE",
    "NOTIFY",
    "OVERRIDING SYSTEM VALUE",
    "PREPARE",
    "PREPARE TRANSACTION",
    "REASSIGN OWNED",
    "REFRESH MATERIALIZED VIEW",
    "REINDEX",
    "RELEASE SAVEPOINT",
    "RESET [ALL|ROLE|SESSION AUTHORIZATION]",
    "REVOKE",
    "ROLLBACK",
    "ROLLBACK PREPARED",
    "ROLLBACK TO SAVEPOINT",
    "SAVEPOINT",
    "SECURITY LABEL",
    "SELECT INTO",
    "SET CONSTRAINTS",
    "SET ROLE",
    "SET SESSION AUTHORIZATION",
    "SET TRANSACTION",
    "SHOW",
    "START TRANSACTION",
    "UNLISTEN",
    "VACUUM"
  ]);
  var reservedSetOperations2 = expandPhrases([
    "UNION [ALL | DISTINCT]",
    "EXCEPT [ALL | DISTINCT]",
    "INTERSECT [ALL | DISTINCT]"
  ]);
  var reservedJoins2 = expandPhrases([
    "JOIN",
    "{LEFT | RIGHT | FULL} [OUTER] JOIN",
    "{INNER | CROSS} JOIN",
    "NATURAL [INNER] JOIN",
    "NATURAL {LEFT | RIGHT | FULL} [OUTER] JOIN"
  ]);
  var reservedKeywordPhrases2 = expandPhrases([
    "PRIMARY KEY",
    "GENERATED {ALWAYS | BY DEFAULT} AS IDENTITY",
    "ON {UPDATE | DELETE} [NO ACTION | RESTRICT | CASCADE | SET NULL | SET DEFAULT]",
    "DO {NOTHING | UPDATE}",
    "AS MATERIALIZED",
    "FOR EACH ROW",
    "OR {INSERT | UPDATE [OF] | DELETE | TRUNCATE}",
    "{ROWS | RANGE | GROUPS} BETWEEN",
    // comparison operator
    "IS [NOT] DISTINCT FROM",
    "NULLS {FIRST | LAST}",
    "WITH ORDINALITY"
  ]);
  var reservedDataTypePhrases2 = expandPhrases([
    // https://www.postgresql.org/docs/current/datatype-datetime.html
    "[TIMESTAMP | TIME] {WITH | WITHOUT} TIME ZONE"
  ]);
  var postgresql = {
    name: "postgresql",
    tokenizerOptions: {
      reservedSelect: reservedSelect2,
      reservedClauses: [...reservedClauses2, ...standardOnelineClauses2, ...tabularOnelineClauses2],
      reservedSetOperations: reservedSetOperations2,
      reservedJoins: reservedJoins2,
      reservedKeywordPhrases: reservedKeywordPhrases2,
      reservedDataTypePhrases: reservedDataTypePhrases2,
      reservedKeywords: keywords2,
      reservedDataTypes: dataTypes2,
      reservedFunctionNames: functions2,
      nestedBlockComments: true,
      extraParens: ["[]"],
      underscoresInNumbers: true,
      stringTypes: [
        "$$",
        { quote: "''-qq", prefixes: ["U&"] },
        { quote: "''-qq-bs", prefixes: ["E"], requirePrefix: true },
        { quote: "''-raw", prefixes: ["B", "X"], requirePrefix: true }
      ],
      identTypes: [{ quote: '""-qq', prefixes: ["U&"] }],
      identChars: { rest: "$" },
      paramTypes: { numbered: ["$"] },
      operators: [
        // Arithmetic
        "%",
        "^",
        "|/",
        "||/",
        "@",
        // Assignment
        ":=",
        // Bitwise
        "&",
        "|",
        "#",
        "~",
        "<<",
        ">>",
        // Byte comparison
        "~>~",
        "~<~",
        "~>=~",
        "~<=~",
        // Geometric
        "@-@",
        "@@",
        "##",
        "<->",
        "&&",
        "&<",
        "&>",
        "<<|",
        "&<|",
        "|>>",
        "|&>",
        "<^",
        ">^",
        "?#",
        "?-",
        "?|",
        "?-|",
        "?||",
        "@>",
        "<@",
        "<@>",
        "~=",
        // JSON
        "?",
        "@?",
        "?&",
        "->",
        "->>",
        "#>",
        "#>>",
        "#-",
        // Named function params
        "=>",
        // Network address
        ">>=",
        "<<=",
        // Pattern matching
        "~~",
        "~~*",
        "!~~",
        "!~~*",
        // POSIX RegExp
        "~",
        "~*",
        "!~",
        "!~*",
        // Range/multirange
        "-|-",
        // String concatenation
        "||",
        // Text search
        "@@@",
        "!!",
        "^@",
        // Trigram/trigraph
        "<%",
        "%>",
        "<<%",
        "%>>",
        "<<->",
        "<->>",
        "<<<->",
        "<->>>",
        // Cube
        "~>",
        // Hstore
        "#=",
        // Type cast
        "::",
        ":",
        // Custom operators defined by pgvector extension
        // https://github.com/pgvector/pgvector#querying
        "<#>",
        "<=>",
        "<+>",
        "<~>",
        "<%>",
        // Custom operators: from PostGIS extension
        "&&&",
        "|=|"
        // https://postgis.net/docs/geometry_distance_cpa.html
      ],
      operatorKeyword: true
    },
    formatOptions: {
      alwaysDenseOperators: ["::", ":"],
      onelineClauses: [...standardOnelineClauses2, ...tabularOnelineClauses2],
      tabularOnelineClauses: tabularOnelineClauses2
    }
  };

  // node_modules/sql-formatter/dist/esm/languages/sqlite/sqlite.functions.js
  var functions3 = [
    // https://www.sqlite.org/lang_corefunc.html
    "ABS",
    "CHANGES",
    "CHAR",
    "COALESCE",
    "FORMAT",
    "GLOB",
    "HEX",
    "IFNULL",
    "IIF",
    "INSTR",
    "LAST_INSERT_ROWID",
    "LENGTH",
    "LIKE",
    "LIKELIHOOD",
    "LIKELY",
    "LOAD_EXTENSION",
    "LOWER",
    "LTRIM",
    "NULLIF",
    "PRINTF",
    "QUOTE",
    "RANDOM",
    "RANDOMBLOB",
    "REPLACE",
    "ROUND",
    "RTRIM",
    "SIGN",
    "SOUNDEX",
    "SQLITE_COMPILEOPTION_GET",
    "SQLITE_COMPILEOPTION_USED",
    "SQLITE_OFFSET",
    "SQLITE_SOURCE_ID",
    "SQLITE_VERSION",
    "SUBSTR",
    "SUBSTRING",
    "TOTAL_CHANGES",
    "TRIM",
    "TYPEOF",
    "UNICODE",
    "UNLIKELY",
    "UPPER",
    "ZEROBLOB",
    // https://www.sqlite.org/lang_aggfunc.html
    "AVG",
    "COUNT",
    "GROUP_CONCAT",
    "MAX",
    "MIN",
    "SUM",
    "TOTAL",
    // https://www.sqlite.org/lang_datefunc.html
    "DATE",
    "TIME",
    "DATETIME",
    "JULIANDAY",
    "UNIXEPOCH",
    "STRFTIME",
    // https://www.sqlite.org/windowfunctions.html#biwinfunc
    "row_number",
    "rank",
    "dense_rank",
    "percent_rank",
    "cume_dist",
    "ntile",
    "lag",
    "lead",
    "first_value",
    "last_value",
    "nth_value",
    // https://www.sqlite.org/lang_mathfunc.html
    "ACOS",
    "ACOSH",
    "ASIN",
    "ASINH",
    "ATAN",
    "ATAN2",
    "ATANH",
    "CEIL",
    "CEILING",
    "COS",
    "COSH",
    "DEGREES",
    "EXP",
    "FLOOR",
    "LN",
    "LOG",
    "LOG",
    "LOG10",
    "LOG2",
    "MOD",
    "PI",
    "POW",
    "POWER",
    "RADIANS",
    "SIN",
    "SINH",
    "SQRT",
    "TAN",
    "TANH",
    "TRUNC",
    // https://www.sqlite.org/json1.html
    "JSON",
    "JSON_ARRAY",
    "JSON_ARRAY_LENGTH",
    "JSON_ARRAY_LENGTH",
    "JSON_EXTRACT",
    "JSON_INSERT",
    "JSON_OBJECT",
    "JSON_PATCH",
    "JSON_REMOVE",
    "JSON_REPLACE",
    "JSON_SET",
    "JSON_TYPE",
    "JSON_TYPE",
    "JSON_VALID",
    "JSON_QUOTE",
    "JSON_GROUP_ARRAY",
    "JSON_GROUP_OBJECT",
    "JSON_EACH",
    "JSON_TREE",
    // cast
    "CAST"
  ];

  // node_modules/sql-formatter/dist/esm/languages/sqlite/sqlite.keywords.js
  var keywords3 = [
    // https://www.sqlite.org/lang_keywords.html
    // Note: The keywords listed on that URL are not all reserved keywords.
    // We'll need to clean up this list to only include reserved keywords.
    "ABORT",
    "ACTION",
    "ADD",
    "AFTER",
    "ALL",
    "ALTER",
    "AND",
    "ARE",
    "ALWAYS",
    "ANALYZE",
    "AS",
    "ASC",
    "ATTACH",
    "AUTOINCREMENT",
    "BEFORE",
    "BEGIN",
    "BETWEEN",
    "BY",
    "CASCADE",
    "CASE",
    "CAST",
    "CHECK",
    "COLLATE",
    "COLUMN",
    "COMMIT",
    "CONFLICT",
    "CONSTRAINT",
    "CREATE",
    "CROSS",
    "CURRENT",
    "CURRENT_DATE",
    "CURRENT_TIME",
    "CURRENT_TIMESTAMP",
    "DATABASE",
    "DEFAULT",
    "DEFERRABLE",
    "DEFERRED",
    "DELETE",
    "DESC",
    "DETACH",
    "DISTINCT",
    "DO",
    "DROP",
    "EACH",
    "ELSE",
    "END",
    "ESCAPE",
    "EXCEPT",
    "EXCLUDE",
    "EXCLUSIVE",
    "EXISTS",
    "EXPLAIN",
    "FAIL",
    "FILTER",
    "FIRST",
    "FOLLOWING",
    "FOR",
    "FOREIGN",
    "FROM",
    "FULL",
    "GENERATED",
    "GLOB",
    "GROUP",
    "HAVING",
    "IF",
    "IGNORE",
    "IMMEDIATE",
    "IN",
    "INDEX",
    "INDEXED",
    "INITIALLY",
    "INNER",
    "INSERT",
    "INSTEAD",
    "INTERSECT",
    "INTO",
    "IS",
    "ISNULL",
    "JOIN",
    "KEY",
    "LAST",
    "LEFT",
    "LIKE",
    "LIMIT",
    "MATCH",
    "MATERIALIZED",
    "NATURAL",
    "NO",
    "NOT",
    "NOTHING",
    "NOTNULL",
    "NULL",
    "NULLS",
    "OF",
    "OFFSET",
    "ON",
    "ONLY",
    "OPEN",
    "OR",
    "ORDER",
    "OTHERS",
    "OUTER",
    "OVER",
    "PARTITION",
    "PLAN",
    "PRAGMA",
    "PRECEDING",
    "PRIMARY",
    "QUERY",
    "RAISE",
    "RANGE",
    "RECURSIVE",
    "REFERENCES",
    "REGEXP",
    "REINDEX",
    "RELEASE",
    "RENAME",
    "REPLACE",
    "RESTRICT",
    "RETURNING",
    "RIGHT",
    "ROLLBACK",
    "ROW",
    "ROWS",
    "SAVEPOINT",
    "SELECT",
    "SET",
    "TABLE",
    "TEMP",
    "TEMPORARY",
    "THEN",
    "TIES",
    "TO",
    "TRANSACTION",
    "TRIGGER",
    "UNBOUNDED",
    "UNION",
    "UNIQUE",
    "UPDATE",
    "USING",
    "VACUUM",
    "VALUES",
    "VIEW",
    "VIRTUAL",
    "WHEN",
    "WHERE",
    "WINDOW",
    "WITH",
    "WITHOUT"
  ];
  var dataTypes3 = [
    // SQLite allows any word as a data type, e.g. CREATE TABLE foo (col1 madeupname(123));
    // Here we just list some common ones as SQL Formatter
    // is only able to detect a predefined list of data types.
    // https://www.sqlite.org/stricttables.html
    // https://www.sqlite.org/datatype3.html
    "ANY",
    "ARRAY",
    "BLOB",
    "CHARACTER",
    "DECIMAL",
    "INT",
    "INTEGER",
    "NATIVE CHARACTER",
    "NCHAR",
    "NUMERIC",
    "NVARCHAR",
    "REAL",
    "TEXT",
    "VARCHAR",
    "VARYING CHARACTER"
  ];

  // node_modules/sql-formatter/dist/esm/languages/sqlite/sqlite.formatter.js
  var reservedSelect3 = expandPhrases(["SELECT [ALL | DISTINCT]"]);
  var reservedClauses3 = expandPhrases([
    // queries
    "WITH [RECURSIVE]",
    "FROM",
    "WHERE",
    "GROUP BY",
    "HAVING",
    "WINDOW",
    "PARTITION BY",
    "ORDER BY",
    "LIMIT",
    "OFFSET",
    // Data manipulation
    // - insert:
    "INSERT [OR ABORT | OR FAIL | OR IGNORE | OR REPLACE | OR ROLLBACK] INTO",
    "REPLACE INTO",
    "VALUES",
    // - update:
    "SET",
    // other:
    "RETURNING"
  ]);
  var standardOnelineClauses3 = expandPhrases(["CREATE [TEMPORARY | TEMP] TABLE [IF NOT EXISTS]"]);
  var tabularOnelineClauses3 = expandPhrases([
    // - create:
    "CREATE [TEMPORARY | TEMP] VIEW [IF NOT EXISTS]",
    // - update:
    "UPDATE [OR ABORT | OR FAIL | OR IGNORE | OR REPLACE | OR ROLLBACK]",
    // - insert:
    "ON CONFLICT",
    // - delete:
    "DELETE FROM",
    // - drop table:
    "DROP TABLE [IF EXISTS]",
    // - alter table:
    "ALTER TABLE",
    "ADD [COLUMN]",
    "DROP [COLUMN]",
    "RENAME [COLUMN]",
    "RENAME TO",
    // - set schema
    "SET SCHEMA"
  ]);
  var reservedSetOperations3 = expandPhrases(["UNION [ALL]", "EXCEPT", "INTERSECT"]);
  var reservedJoins3 = expandPhrases([
    "JOIN",
    "{LEFT | RIGHT | FULL} [OUTER] JOIN",
    "{INNER | CROSS} JOIN",
    "NATURAL [INNER] JOIN",
    "NATURAL {LEFT | RIGHT | FULL} [OUTER] JOIN"
  ]);
  var reservedKeywordPhrases3 = expandPhrases([
    "ON {UPDATE | DELETE} [SET NULL | SET DEFAULT]",
    "{ROWS | RANGE | GROUPS} BETWEEN",
    "DO UPDATE"
  ]);
  var reservedDataTypePhrases3 = expandPhrases([]);
  var sqlite = {
    name: "sqlite",
    tokenizerOptions: {
      reservedSelect: reservedSelect3,
      reservedClauses: [...reservedClauses3, ...standardOnelineClauses3, ...tabularOnelineClauses3],
      reservedSetOperations: reservedSetOperations3,
      reservedJoins: reservedJoins3,
      reservedKeywordPhrases: reservedKeywordPhrases3,
      reservedDataTypePhrases: reservedDataTypePhrases3,
      reservedKeywords: keywords3,
      reservedDataTypes: dataTypes3,
      reservedFunctionNames: functions3,
      stringTypes: [
        "''-qq",
        { quote: "''-raw", prefixes: ["X"], requirePrefix: true }
        // Depending on context SQLite also supports double-quotes for strings,
        // and single-quotes for identifiers.
      ],
      identTypes: [`""-qq`, "``", "[]"],
      // https://www.sqlite.org/lang_expr.html#parameters
      // Note: the $-prefixed form follows Tcl variable syntax and may include
      // one or more "::"-separated suffixes and an optional "(...)" trailer.
      paramTypes: {
        positional: true,
        numbered: ["?"],
        named: [":", "@"],
        custom: [
          {
            regex: String.raw`\$[a-zA-Z_][a-zA-Z0-9_]*(?:::[a-zA-Z_][a-zA-Z0-9_]*)*(?:\([^)]*\))?`,
            key: (v) => v.slice(1)
          }
        ]
      },
      operators: ["%", "~", "&", "|", "<<", ">>", "==", "->", "->>", "||"]
    },
    formatOptions: {
      onelineClauses: [...standardOnelineClauses3, ...tabularOnelineClauses3],
      tabularOnelineClauses: tabularOnelineClauses3
    }
  };

  // node_modules/sql-formatter/dist/esm/utils.js
  var last = (arr) => arr[arr.length - 1];
  var sortByLengthDesc = (strings) => strings.sort((a, b) => b.length - a.length || a.localeCompare(b));
  var equalizeWhitespace = (s) => s.replace(/\s+/gu, " ");
  var isMultiline = (text) => /\n/.test(text);

  // node_modules/sql-formatter/dist/esm/lexer/regexUtil.js
  var escapeRegExp = (string2) => string2.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  var WHITESPACE_REGEX = /\s+/uy;
  var patternToRegex = (pattern) => new RegExp(`(?:${pattern})`, "uy");
  var toCaseInsensitivePattern = (prefix) => prefix.split("").map((char) => / /gu.test(char) ? "\\s+" : `[${char.toUpperCase()}${char.toLowerCase()}]`).join("");
  var withDashes = (pattern) => pattern + "(?:-" + pattern + ")*";
  var prefixesPattern = ({ prefixes, requirePrefix }) => `(?:${prefixes.map(toCaseInsensitivePattern).join("|")}${requirePrefix ? "" : "|"})`;

  // node_modules/sql-formatter/dist/esm/lexer/regexFactory.js
  var lineComment = (lineCommentTypes) => new RegExp(`(?:${lineCommentTypes.map(escapeRegExp).join("|")}).*?(?=\r
|\r|
|$)`, "uy");
  var parenthesis = (kind, extraParens = []) => {
    const index = kind === "open" ? 0 : 1;
    const parens = ["()", ...extraParens].map((pair) => pair[index]);
    return patternToRegex(parens.map(escapeRegExp).join("|"));
  };
  var operator = (operators) => patternToRegex(`${sortByLengthDesc(operators).map(escapeRegExp).join("|")}`);
  var rejectIdentCharsPattern = ({ rest, dashes }) => rest || dashes ? `(?![${rest || ""}${dashes ? "-" : ""}])` : "";
  var reservedWord = (reservedKeywords, identChars = {}) => {
    if (reservedKeywords.length === 0) {
      return /^\b$/u;
    }
    const avoidIdentChars = rejectIdentCharsPattern(identChars);
    const reservedKeywordsPattern = sortByLengthDesc(reservedKeywords).map(escapeRegExp).join("|").replace(/ /gu, "\\s+");
    return new RegExp(`(?:${reservedKeywordsPattern})${avoidIdentChars}\\b`, "iuy");
  };
  var parameter = (paramTypes, pattern) => {
    if (!paramTypes.length) {
      return void 0;
    }
    const typesRegex = paramTypes.map(escapeRegExp).join("|");
    return patternToRegex(`(?:${typesRegex})(?:${pattern})`);
  };
  var buildQStringPatterns = () => {
    const specialDelimiterMap = {
      "<": ">",
      "[": "]",
      "(": ")",
      "{": "}"
    };
    const singlePattern = "{left}(?:(?!{right}').)*?{right}";
    const patternList = Object.entries(specialDelimiterMap).map(([left, right]) => singlePattern.replace(/{left}/g, escapeRegExp(left)).replace(/{right}/g, escapeRegExp(right)));
    const specialDelimiters = escapeRegExp(Object.keys(specialDelimiterMap).join(""));
    const standardDelimiterPattern = String.raw`(?<tag>[^\s${specialDelimiters}])(?:(?!\k<tag>').)*?\k<tag>`;
    const qStringPattern = `[Qq]'(?:${standardDelimiterPattern}|${patternList.join("|")})'`;
    return qStringPattern;
  };
  var quotePatterns = {
    // - backtick quoted (using `` to escape)
    "``": "(?:`[^`]*`)+",
    // - Transact-SQL square bracket quoted (using ]] to escape)
    "[]": String.raw`(?:\[[^\]]*\])(?:\][^\]]*\])*`,
    // double-quoted
    '""-qq': String.raw`(?:"[^"]*")+`,
    '""-bs': String.raw`(?:"[^"\\]*(?:\\.[^"\\]*)*")`,
    '""-qq-bs': String.raw`(?:"[^"\\]*(?:\\.[^"\\]*)*")+`,
    '""-raw': String.raw`(?:"[^"]*")`,
    // single-quoted
    "''-qq": String.raw`(?:'[^']*')+`,
    "''-bs": String.raw`(?:'[^'\\]*(?:\\.[^'\\]*)*')`,
    "''-qq-bs": String.raw`(?:'[^'\\]*(?:\\.[^'\\]*)*')+`,
    "''-raw": String.raw`(?:'[^']*')`,
    // PostgreSQL dollar-quoted
    "$$": String.raw`(?<tag>\$\w*\$)[\s\S]*?\k<tag>`,
    // BigQuery '''triple-quoted''' (using \' to escape)
    "'''..'''": String.raw`'''[^\\]*?(?:\\.[^\\]*?)*?'''`,
    // BigQuery """triple-quoted""" (using \" to escape)
    '""".."""': String.raw`"""[^\\]*?(?:\\.[^\\]*?)*?"""`,
    // Hive and Spark variables: ${name}
    "{}": String.raw`(?:\{[^\}]*\})`,
    // Oracle q'' strings: q'<text>' q'|text|' ...
    "q''": buildQStringPatterns()
  };
  var singleQuotePattern = (quoteTypes) => {
    if (typeof quoteTypes === "string") {
      return quotePatterns[quoteTypes];
    } else if ("regex" in quoteTypes) {
      return quoteTypes.regex;
    } else {
      return prefixesPattern(quoteTypes) + quotePatterns[quoteTypes.quote];
    }
  };
  var variable = (varTypes) => patternToRegex(varTypes.map((varType) => "regex" in varType ? varType.regex : singleQuotePattern(varType)).join("|"));
  var stringPattern = (quoteTypes) => quoteTypes.map(singleQuotePattern).join("|");
  var string = (quoteTypes) => patternToRegex(stringPattern(quoteTypes));
  var identifier = (specialChars = {}) => patternToRegex(identifierPattern(specialChars));
  var identifierPattern = ({ first, rest, dashes, allowFirstCharNumber } = {}) => {
    const letter = "\\p{Alphabetic}\\p{Mark}_";
    const number = "\\p{Decimal_Number}";
    const firstChars = escapeRegExp(first !== null && first !== void 0 ? first : "");
    const restChars = escapeRegExp(rest !== null && rest !== void 0 ? rest : "");
    const pattern = allowFirstCharNumber ? `[${letter}${number}${firstChars}][${letter}${number}${restChars}]*` : `[${letter}${firstChars}][${letter}${number}${restChars}]*`;
    return dashes ? withDashes(pattern) : pattern;
  };

  // node_modules/sql-formatter/dist/esm/lexer/lineColFromIndex.js
  function lineColFromIndex(source, index) {
    const lines = source.slice(0, index).split(/\n/);
    return { line: lines.length, col: lines[lines.length - 1].length + 1 };
  }

  // node_modules/sql-formatter/dist/esm/lexer/TokenizerEngine.js
  var TokenizerEngine = class {
    constructor(rules, dialectName) {
      this.rules = rules;
      this.dialectName = dialectName;
      this.input = "";
      this.index = 0;
    }
    /**
     * Takes a SQL string and breaks it into tokens.
     * Each token is an object with type and value.
     *
     * @param {string} input - The SQL string
     * @returns {Token[]} output token stream
     */
    tokenize(input) {
      this.input = input;
      this.index = 0;
      const tokens = [];
      let token;
      while (this.index < this.input.length) {
        const precedingWhitespace = this.getWhitespace();
        if (this.index < this.input.length) {
          token = this.getNextToken();
          if (!token) {
            throw this.createParseError();
          }
          tokens.push(Object.assign(Object.assign({}, token), { precedingWhitespace }));
        }
      }
      return tokens;
    }
    createParseError() {
      const text = this.input.slice(this.index, this.index + 10);
      const { line, col } = lineColFromIndex(this.input, this.index);
      return new Error(`Parse error: Unexpected "${text}" at line ${line} column ${col}.
${this.dialectInfo()}`);
    }
    dialectInfo() {
      if (this.dialectName === "sql") {
        return `This likely happens because you're using the default "sql" dialect.
If possible, please select a more specific dialect (like sqlite, postgresql, etc).`;
      } else {
        return `SQL dialect used: "${this.dialectName}".`;
      }
    }
    getWhitespace() {
      WHITESPACE_REGEX.lastIndex = this.index;
      const matches = WHITESPACE_REGEX.exec(this.input);
      if (matches) {
        this.index += matches[0].length;
        return matches[0];
      }
      return void 0;
    }
    getNextToken() {
      for (const rule of this.rules) {
        const token = this.match(rule);
        if (token) {
          return token;
        }
      }
      return void 0;
    }
    // Attempts to match token rule regex at current position in input
    match(rule) {
      rule.regex.lastIndex = this.index;
      const matches = rule.regex.exec(this.input);
      if (matches) {
        const matchedText = matches[0];
        const token = {
          type: rule.type,
          raw: matchedText,
          text: rule.text ? rule.text(matchedText) : matchedText,
          start: this.index
        };
        if (rule.key) {
          token.key = rule.key(matchedText);
        }
        this.index += matchedText.length;
        return token;
      }
      return void 0;
    }
  };

  // node_modules/sql-formatter/dist/esm/lexer/NestedComment.js
  var START = /\/\*/uy;
  var ANY_CHAR = /[\s\S]/uy;
  var END2 = /\*\//uy;
  var NestedComment = class {
    constructor() {
      this.lastIndex = 0;
    }
    exec(input) {
      let result = "";
      let match;
      let nestLevel = 0;
      if (match = this.matchSection(START, input)) {
        result += match;
        nestLevel++;
      } else {
        return null;
      }
      while (nestLevel > 0) {
        if (match = this.matchSection(START, input)) {
          result += match;
          nestLevel++;
        } else if (match = this.matchSection(END2, input)) {
          result += match;
          nestLevel--;
        } else if (match = this.matchSection(ANY_CHAR, input)) {
          result += match;
        } else {
          return null;
        }
      }
      return [result];
    }
    matchSection(regex, input) {
      regex.lastIndex = this.lastIndex;
      const matches = regex.exec(input);
      if (matches) {
        this.lastIndex += matches[0].length;
      }
      return matches ? matches[0] : null;
    }
  };

  // node_modules/sql-formatter/dist/esm/lexer/Tokenizer.js
  var Tokenizer = class {
    constructor(cfg, dialectName) {
      this.cfg = cfg;
      this.dialectName = dialectName;
      this.rulesBeforeParams = this.buildRulesBeforeParams(cfg);
      this.rulesAfterParams = this.buildRulesAfterParams(cfg);
    }
    tokenize(input, paramTypesOverrides) {
      const rules = [
        ...this.rulesBeforeParams,
        ...this.buildParamRules(this.cfg, paramTypesOverrides),
        ...this.rulesAfterParams
      ];
      const tokens = new TokenizerEngine(rules, this.dialectName).tokenize(input);
      return this.cfg.postProcess ? this.cfg.postProcess(tokens) : tokens;
    }
    // These rules can be cached as they only depend on
    // the Tokenizer config options specified for each SQL dialect
    buildRulesBeforeParams(cfg) {
      var _a, _b, _c;
      return this.validRules([
        {
          type: TokenType.DISABLE_COMMENT,
          regex: /(\/\* *sql-formatter-disable *\*\/[\s\S]*?(?:\/\* *sql-formatter-enable *\*\/|$))/uy
        },
        {
          type: TokenType.BLOCK_COMMENT,
          regex: cfg.nestedBlockComments ? new NestedComment() : /(\/\*[^]*?\*\/)/uy
        },
        {
          type: TokenType.LINE_COMMENT,
          regex: lineComment((_a = cfg.lineCommentTypes) !== null && _a !== void 0 ? _a : ["--"])
        },
        {
          type: TokenType.QUOTED_IDENTIFIER,
          regex: string(cfg.identTypes)
        },
        {
          type: TokenType.NUMBER,
          regex: cfg.underscoresInNumbers ? /(?:0x[0-9a-fA-F_]+|0b[01_]+|(?:-\s*)?(?:[0-9_]*\.[0-9_]+|[0-9_]+(?:\.[0-9_]*)?)(?:[eE][-+]?[0-9_]+(?:\.[0-9_]+)?)?)(?![\w\p{Alphabetic}])/uy : /(?:0x[0-9a-fA-F]+|0b[01]+|(?:-\s*)?(?:[0-9]*\.[0-9]+|[0-9]+(?:\.[0-9]*)?)(?:[eE][-+]?[0-9]+(?:\.[0-9]+)?)?)(?![\w\p{Alphabetic}])/uy
        },
        // RESERVED_KEYWORD_PHRASE and RESERVED_DATA_TYPE_PHRASE  is matched before all other keyword tokens
        // to e.g. prioritize matching "TIMESTAMP WITH TIME ZONE" phrase over "WITH" clause.
        {
          type: TokenType.RESERVED_KEYWORD_PHRASE,
          regex: reservedWord((_b = cfg.reservedKeywordPhrases) !== null && _b !== void 0 ? _b : [], cfg.identChars),
          text: toCanonical
        },
        {
          type: TokenType.RESERVED_DATA_TYPE_PHRASE,
          regex: reservedWord((_c = cfg.reservedDataTypePhrases) !== null && _c !== void 0 ? _c : [], cfg.identChars),
          text: toCanonical
        },
        {
          type: TokenType.CASE,
          regex: /CASE\b/iuy,
          text: toCanonical
        },
        {
          type: TokenType.END,
          regex: /END\b/iuy,
          text: toCanonical
        },
        {
          type: TokenType.BETWEEN,
          regex: /BETWEEN\b/iuy,
          text: toCanonical
        },
        {
          type: TokenType.LIMIT,
          regex: cfg.reservedClauses.includes("LIMIT") ? /LIMIT\b/iuy : void 0,
          text: toCanonical
        },
        {
          type: TokenType.RESERVED_CLAUSE,
          regex: reservedWord(cfg.reservedClauses, cfg.identChars),
          text: toCanonical
        },
        {
          type: TokenType.RESERVED_SELECT,
          regex: reservedWord(cfg.reservedSelect, cfg.identChars),
          text: toCanonical
        },
        {
          type: TokenType.RESERVED_SET_OPERATION,
          regex: reservedWord(cfg.reservedSetOperations, cfg.identChars),
          text: toCanonical
        },
        {
          type: TokenType.WHEN,
          regex: /WHEN\b/iuy,
          text: toCanonical
        },
        {
          type: TokenType.ELSE,
          regex: /ELSE\b/iuy,
          text: toCanonical
        },
        {
          type: TokenType.THEN,
          regex: /THEN\b/iuy,
          text: toCanonical
        },
        {
          type: TokenType.RESERVED_JOIN,
          regex: reservedWord(cfg.reservedJoins, cfg.identChars),
          text: toCanonical
        },
        {
          type: TokenType.AND,
          regex: /AND\b/iuy,
          text: toCanonical
        },
        {
          type: TokenType.OR,
          regex: /OR\b/iuy,
          text: toCanonical
        },
        {
          type: TokenType.XOR,
          regex: cfg.supportsXor ? /XOR\b/iuy : void 0,
          text: toCanonical
        },
        ...cfg.operatorKeyword ? [
          {
            type: TokenType.OPERATOR,
            regex: /OPERATOR *\([^)]+\)/iuy
          }
        ] : [],
        {
          type: TokenType.RESERVED_FUNCTION_NAME,
          regex: reservedWord(cfg.reservedFunctionNames, cfg.identChars),
          text: toCanonical
        },
        {
          type: TokenType.RESERVED_DATA_TYPE,
          regex: reservedWord(cfg.reservedDataTypes, cfg.identChars),
          text: toCanonical
        },
        {
          type: TokenType.RESERVED_KEYWORD,
          regex: reservedWord(cfg.reservedKeywords, cfg.identChars),
          text: toCanonical
        }
      ]);
    }
    // These rules can also be cached as they only depend on
    // the Tokenizer config options specified for each SQL dialect
    buildRulesAfterParams(cfg) {
      var _a, _b;
      return this.validRules([
        {
          type: TokenType.VARIABLE,
          regex: cfg.variableTypes ? variable(cfg.variableTypes) : void 0
        },
        { type: TokenType.STRING, regex: string(cfg.stringTypes) },
        {
          type: TokenType.IDENTIFIER,
          regex: identifier(cfg.identChars)
        },
        { type: TokenType.DELIMITER, regex: /[;]/uy },
        { type: TokenType.COMMA, regex: /[,]/y },
        {
          type: TokenType.OPEN_PAREN,
          regex: parenthesis("open", cfg.extraParens)
        },
        {
          type: TokenType.CLOSE_PAREN,
          regex: parenthesis("close", cfg.extraParens)
        },
        {
          type: TokenType.OPERATOR,
          regex: operator([
            // standard operators
            "+",
            "-",
            "/",
            ">",
            "<",
            "=",
            "<>",
            "<=",
            ">=",
            "!=",
            ...(_a = cfg.operators) !== null && _a !== void 0 ? _a : []
          ])
        },
        { type: TokenType.ASTERISK, regex: /[*]/uy },
        {
          type: TokenType.PROPERTY_ACCESS_OPERATOR,
          regex: operator([".", ...(_b = cfg.propertyAccessOperators) !== null && _b !== void 0 ? _b : []])
        }
      ]);
    }
    // These rules can't be blindly cached as the paramTypesOverrides object
    // can differ on each invocation of the format() function.
    buildParamRules(cfg, paramTypesOverrides) {
      var _a, _b, _c, _d, _e;
      const paramTypes = {
        named: (paramTypesOverrides === null || paramTypesOverrides === void 0 ? void 0 : paramTypesOverrides.named) || ((_a = cfg.paramTypes) === null || _a === void 0 ? void 0 : _a.named) || [],
        quoted: (paramTypesOverrides === null || paramTypesOverrides === void 0 ? void 0 : paramTypesOverrides.quoted) || ((_b = cfg.paramTypes) === null || _b === void 0 ? void 0 : _b.quoted) || [],
        numbered: (paramTypesOverrides === null || paramTypesOverrides === void 0 ? void 0 : paramTypesOverrides.numbered) || ((_c = cfg.paramTypes) === null || _c === void 0 ? void 0 : _c.numbered) || [],
        positional: typeof (paramTypesOverrides === null || paramTypesOverrides === void 0 ? void 0 : paramTypesOverrides.positional) === "boolean" ? paramTypesOverrides.positional : (_d = cfg.paramTypes) === null || _d === void 0 ? void 0 : _d.positional,
        custom: (paramTypesOverrides === null || paramTypesOverrides === void 0 ? void 0 : paramTypesOverrides.custom) || ((_e = cfg.paramTypes) === null || _e === void 0 ? void 0 : _e.custom) || []
      };
      return this.validRules([
        {
          type: TokenType.NAMED_PARAMETER,
          regex: parameter(paramTypes.named, identifierPattern(cfg.paramChars || cfg.identChars)),
          key: (v) => v.slice(1)
        },
        {
          type: TokenType.QUOTED_PARAMETER,
          regex: parameter(paramTypes.quoted, stringPattern(cfg.identTypes)),
          key: (v) => (({ tokenKey, quoteChar }) => tokenKey.replace(new RegExp(escapeRegExp("\\" + quoteChar), "gu"), quoteChar))({
            tokenKey: v.slice(2, -1),
            quoteChar: v.slice(-1)
          })
        },
        {
          type: TokenType.NUMBERED_PARAMETER,
          regex: parameter(paramTypes.numbered, "[0-9]+"),
          key: (v) => v.slice(1)
        },
        {
          type: TokenType.POSITIONAL_PARAMETER,
          regex: paramTypes.positional ? /[?]/y : void 0
        },
        ...paramTypes.custom.map((customParam) => {
          var _a2;
          return {
            type: TokenType.CUSTOM_PARAMETER,
            regex: patternToRegex(customParam.regex),
            key: (_a2 = customParam.key) !== null && _a2 !== void 0 ? _a2 : (v) => v
          };
        })
      ]);
    }
    // filters out rules for token types whose regex is undefined
    validRules(rules) {
      return rules.filter((rule) => Boolean(rule.regex));
    }
  };
  var toCanonical = (v) => equalizeWhitespace(v.toUpperCase());

  // node_modules/sql-formatter/dist/esm/dialect.js
  var cache = /* @__PURE__ */ new Map();
  var createDialect = (options) => {
    let dialect = cache.get(options);
    if (!dialect) {
      dialect = dialectFromOptions(options);
      cache.set(options, dialect);
    }
    return dialect;
  };
  var dialectFromOptions = (dialectOptions) => ({
    tokenizer: new Tokenizer(dialectOptions.tokenizerOptions, dialectOptions.name),
    formatOptions: processDialectFormatOptions(dialectOptions)
  });
  var processDialectFormatOptions = ({ tokenizerOptions, formatOptions: options }) => {
    var _a, _b;
    return {
      alwaysDenseOperators: options.alwaysDenseOperators || [],
      onelineClauses: Object.fromEntries(options.onelineClauses.map((name) => [name, true])),
      tabularOnelineClauses: Object.fromEntries(((_a = options.tabularOnelineClauses) !== null && _a !== void 0 ? _a : options.onelineClauses).map((name) => [name, true])),
      identifierDashes: Boolean((_b = tokenizerOptions.identChars) === null || _b === void 0 ? void 0 : _b.dashes)
    };
  };

  // node_modules/sql-formatter/dist/esm/formatter/config.js
  function indentString(cfg) {
    if (cfg.indentStyle === "tabularLeft" || cfg.indentStyle === "tabularRight") {
      return " ".repeat(10);
    }
    if (cfg.useTabs) {
      return "	";
    }
    return " ".repeat(cfg.tabWidth);
  }
  function isTabularStyle(cfg) {
    return cfg.indentStyle === "tabularLeft" || cfg.indentStyle === "tabularRight";
  }

  // node_modules/sql-formatter/dist/esm/formatter/Params.js
  var Params = class {
    constructor(params) {
      this.params = params;
      this.index = 0;
    }
    /**
     * Returns param value that matches given placeholder with param key.
     */
    get({ key, text }) {
      if (!this.params) {
        return text;
      }
      if (key) {
        return this.params[key];
      }
      return this.params[this.index++];
    }
    /**
     * Returns index of current positional parameter.
     */
    getPositionalParameterIndex() {
      return this.index;
    }
    /**
     * Sets index of current positional parameter.
     */
    setPositionalParameterIndex(i) {
      this.index = i;
    }
  };

  // node_modules/sql-formatter/dist/esm/parser/createParser.js
  var import_nearley = __toESM(require_nearley(), 1);

  // node_modules/sql-formatter/dist/esm/lexer/disambiguateTokens.js
  function disambiguateTokens(tokens) {
    return tokens.map(propertyNameKeywordToIdent).map(funcNameToIdent).map(dataTypeToParameterizedDataType).map(identToArrayIdent).map(dataTypeToArrayKeyword);
  }
  var propertyNameKeywordToIdent = (token, i, tokens) => {
    if (isReserved(token.type)) {
      const prevToken = prevNonCommentToken(tokens, i);
      if (prevToken && prevToken.type === TokenType.PROPERTY_ACCESS_OPERATOR) {
        return Object.assign(Object.assign({}, token), { type: TokenType.IDENTIFIER, text: token.raw });
      }
      const nextToken = nextNonCommentToken(tokens, i);
      if (nextToken && nextToken.type === TokenType.PROPERTY_ACCESS_OPERATOR) {
        return Object.assign(Object.assign({}, token), { type: TokenType.IDENTIFIER, text: token.raw });
      }
    }
    return token;
  };
  var funcNameToIdent = (token, i, tokens) => {
    if (token.type === TokenType.RESERVED_FUNCTION_NAME) {
      const nextToken = nextNonCommentToken(tokens, i);
      if (!nextToken || !isOpenParen(nextToken)) {
        return Object.assign(Object.assign({}, token), { type: TokenType.IDENTIFIER, text: token.raw });
      }
    }
    return token;
  };
  var dataTypeToParameterizedDataType = (token, i, tokens) => {
    if (token.type === TokenType.RESERVED_DATA_TYPE) {
      const nextToken = nextNonCommentToken(tokens, i);
      if (nextToken && isOpenParen(nextToken)) {
        return Object.assign(Object.assign({}, token), { type: TokenType.RESERVED_PARAMETERIZED_DATA_TYPE });
      }
    }
    return token;
  };
  var identToArrayIdent = (token, i, tokens) => {
    if (token.type === TokenType.IDENTIFIER) {
      const nextToken = nextNonCommentToken(tokens, i);
      if (nextToken && isOpenBracket(nextToken)) {
        return Object.assign(Object.assign({}, token), { type: TokenType.ARRAY_IDENTIFIER });
      }
    }
    return token;
  };
  var dataTypeToArrayKeyword = (token, i, tokens) => {
    if (token.type === TokenType.RESERVED_DATA_TYPE) {
      const nextToken = nextNonCommentToken(tokens, i);
      if (nextToken && isOpenBracket(nextToken)) {
        return Object.assign(Object.assign({}, token), { type: TokenType.ARRAY_KEYWORD });
      }
    }
    return token;
  };
  var prevNonCommentToken = (tokens, index) => nextNonCommentToken(tokens, index, -1);
  var nextNonCommentToken = (tokens, index, dir = 1) => {
    let i = 1;
    while (tokens[index + i * dir] && isComment(tokens[index + i * dir])) {
      i++;
    }
    return tokens[index + i * dir];
  };
  var isOpenParen = (t) => t.type === TokenType.OPEN_PAREN && t.text === "(";
  var isOpenBracket = (t) => t.type === TokenType.OPEN_PAREN && t.text === "[";
  var isComment = (t) => t.type === TokenType.BLOCK_COMMENT || t.type === TokenType.LINE_COMMENT;

  // node_modules/sql-formatter/dist/esm/parser/LexerAdapter.js
  var LexerAdapter = class {
    constructor(tokenize) {
      this.tokenize = tokenize;
      this.index = 0;
      this.tokens = [];
      this.input = "";
    }
    reset(chunk, _info) {
      this.input = chunk;
      this.index = 0;
      this.tokens = this.tokenize(chunk);
    }
    next() {
      return this.tokens[this.index++];
    }
    save() {
    }
    formatError(token) {
      const { line, col } = lineColFromIndex(this.input, token.start);
      return `Parse error at token: ${token.text} at line ${line} column ${col}`;
    }
    has(name) {
      return name in TokenType;
    }
  };

  // node_modules/sql-formatter/dist/esm/parser/ast.js
  var NodeType;
  (function(NodeType2) {
    NodeType2["statement"] = "statement";
    NodeType2["clause"] = "clause";
    NodeType2["set_operation"] = "set_operation";
    NodeType2["function_call"] = "function_call";
    NodeType2["parameterized_data_type"] = "parameterized_data_type";
    NodeType2["array_subscript"] = "array_subscript";
    NodeType2["property_access"] = "property_access";
    NodeType2["parenthesis"] = "parenthesis";
    NodeType2["between_predicate"] = "between_predicate";
    NodeType2["case_expression"] = "case_expression";
    NodeType2["case_when"] = "case_when";
    NodeType2["case_else"] = "case_else";
    NodeType2["limit_clause"] = "limit_clause";
    NodeType2["all_columns_asterisk"] = "all_columns_asterisk";
    NodeType2["literal"] = "literal";
    NodeType2["identifier"] = "identifier";
    NodeType2["keyword"] = "keyword";
    NodeType2["data_type"] = "data_type";
    NodeType2["parameter"] = "parameter";
    NodeType2["operator"] = "operator";
    NodeType2["comma"] = "comma";
    NodeType2["line_comment"] = "line_comment";
    NodeType2["block_comment"] = "block_comment";
    NodeType2["disable_comment"] = "disable_comment";
  })(NodeType = NodeType || (NodeType = {}));

  // node_modules/sql-formatter/dist/esm/parser/grammar.js
  function id(d) {
    return d[0];
  }
  var lexer = new LexerAdapter((chunk) => []);
  var unwrap = ([[el]]) => el;
  var toKeywordNode = (token) => ({
    type: NodeType.keyword,
    tokenType: token.type,
    text: token.text,
    raw: token.raw
  });
  var toDataTypeNode = (token) => ({
    type: NodeType.data_type,
    text: token.text,
    raw: token.raw
  });
  var addComments = (node, { leading, trailing }) => {
    if (leading === null || leading === void 0 ? void 0 : leading.length) {
      node = Object.assign(Object.assign({}, node), { leadingComments: leading });
    }
    if (trailing === null || trailing === void 0 ? void 0 : trailing.length) {
      node = Object.assign(Object.assign({}, node), { trailingComments: trailing });
    }
    return node;
  };
  var addCommentsToArray = (nodes, { leading, trailing }) => {
    if (leading === null || leading === void 0 ? void 0 : leading.length) {
      const [first, ...rest] = nodes;
      nodes = [addComments(first, { leading }), ...rest];
    }
    if (trailing === null || trailing === void 0 ? void 0 : trailing.length) {
      const lead = nodes.slice(0, -1);
      const last2 = nodes[nodes.length - 1];
      nodes = [...lead, addComments(last2, { trailing })];
    }
    return nodes;
  };
  var grammar = {
    Lexer: lexer,
    ParserRules: [
      { "name": "main$ebnf$1", "symbols": [] },
      { "name": "main$ebnf$1", "symbols": ["main$ebnf$1", "statement"], "postprocess": (d) => d[0].concat([d[1]]) },
      {
        "name": "main",
        "symbols": ["main$ebnf$1"],
        "postprocess": ([statements]) => {
          const last2 = statements[statements.length - 1];
          if (last2 && !last2.hasSemicolon) {
            return last2.children.length > 0 ? statements : statements.slice(0, -1);
          } else {
            return statements;
          }
        }
      },
      { "name": "statement$subexpression$1", "symbols": [lexer.has("DELIMITER") ? { type: "DELIMITER" } : DELIMITER] },
      { "name": "statement$subexpression$1", "symbols": [lexer.has("EOF") ? { type: "EOF" } : EOF] },
      {
        "name": "statement",
        "symbols": ["expressions_or_clauses", "statement$subexpression$1"],
        "postprocess": ([children, [delimiter]]) => ({
          type: NodeType.statement,
          children,
          hasSemicolon: delimiter.type === TokenType.DELIMITER
        })
      },
      { "name": "expressions_or_clauses$ebnf$1", "symbols": [] },
      { "name": "expressions_or_clauses$ebnf$1", "symbols": ["expressions_or_clauses$ebnf$1", "free_form_sql"], "postprocess": (d) => d[0].concat([d[1]]) },
      { "name": "expressions_or_clauses$ebnf$2", "symbols": [] },
      { "name": "expressions_or_clauses$ebnf$2", "symbols": ["expressions_or_clauses$ebnf$2", "clause"], "postprocess": (d) => d[0].concat([d[1]]) },
      {
        "name": "expressions_or_clauses",
        "symbols": ["expressions_or_clauses$ebnf$1", "expressions_or_clauses$ebnf$2"],
        "postprocess": ([expressions, clauses]) => [...expressions, ...clauses]
      },
      { "name": "clause$subexpression$1", "symbols": ["limit_clause"] },
      { "name": "clause$subexpression$1", "symbols": ["select_clause"] },
      { "name": "clause$subexpression$1", "symbols": ["other_clause"] },
      { "name": "clause$subexpression$1", "symbols": ["set_operation"] },
      { "name": "clause", "symbols": ["clause$subexpression$1"], "postprocess": unwrap },
      { "name": "limit_clause$ebnf$1$subexpression$1$ebnf$1", "symbols": ["free_form_sql"] },
      { "name": "limit_clause$ebnf$1$subexpression$1$ebnf$1", "symbols": ["limit_clause$ebnf$1$subexpression$1$ebnf$1", "free_form_sql"], "postprocess": (d) => d[0].concat([d[1]]) },
      { "name": "limit_clause$ebnf$1$subexpression$1", "symbols": [lexer.has("COMMA") ? { type: "COMMA" } : COMMA, "limit_clause$ebnf$1$subexpression$1$ebnf$1"] },
      { "name": "limit_clause$ebnf$1", "symbols": ["limit_clause$ebnf$1$subexpression$1"], "postprocess": id },
      { "name": "limit_clause$ebnf$1", "symbols": [], "postprocess": () => null },
      {
        "name": "limit_clause",
        "symbols": [lexer.has("LIMIT") ? { type: "LIMIT" } : LIMIT, "_", "expression_chain_", "limit_clause$ebnf$1"],
        "postprocess": ([limitToken, _, exp1, optional]) => {
          if (optional) {
            const [comma, exp2] = optional;
            return {
              type: NodeType.limit_clause,
              limitKw: addComments(toKeywordNode(limitToken), { trailing: _ }),
              offset: exp1,
              count: exp2
            };
          } else {
            return {
              type: NodeType.limit_clause,
              limitKw: addComments(toKeywordNode(limitToken), { trailing: _ }),
              count: exp1
            };
          }
        }
      },
      { "name": "select_clause$subexpression$1$ebnf$1", "symbols": [] },
      { "name": "select_clause$subexpression$1$ebnf$1", "symbols": ["select_clause$subexpression$1$ebnf$1", "free_form_sql"], "postprocess": (d) => d[0].concat([d[1]]) },
      { "name": "select_clause$subexpression$1", "symbols": ["all_columns_asterisk", "select_clause$subexpression$1$ebnf$1"] },
      { "name": "select_clause$subexpression$1$ebnf$2", "symbols": [] },
      { "name": "select_clause$subexpression$1$ebnf$2", "symbols": ["select_clause$subexpression$1$ebnf$2", "free_form_sql"], "postprocess": (d) => d[0].concat([d[1]]) },
      { "name": "select_clause$subexpression$1", "symbols": ["asteriskless_free_form_sql", "select_clause$subexpression$1$ebnf$2"] },
      {
        "name": "select_clause",
        "symbols": [lexer.has("RESERVED_SELECT") ? { type: "RESERVED_SELECT" } : RESERVED_SELECT, "select_clause$subexpression$1"],
        "postprocess": ([nameToken, [exp, expressions]]) => ({
          type: NodeType.clause,
          nameKw: toKeywordNode(nameToken),
          children: [exp, ...expressions]
        })
      },
      {
        "name": "select_clause",
        "symbols": [lexer.has("RESERVED_SELECT") ? { type: "RESERVED_SELECT" } : RESERVED_SELECT],
        "postprocess": ([nameToken]) => ({
          type: NodeType.clause,
          nameKw: toKeywordNode(nameToken),
          children: []
        })
      },
      {
        "name": "all_columns_asterisk",
        "symbols": [lexer.has("ASTERISK") ? { type: "ASTERISK" } : ASTERISK],
        "postprocess": () => ({ type: NodeType.all_columns_asterisk })
      },
      { "name": "other_clause$ebnf$1", "symbols": [] },
      { "name": "other_clause$ebnf$1", "symbols": ["other_clause$ebnf$1", "free_form_sql"], "postprocess": (d) => d[0].concat([d[1]]) },
      {
        "name": "other_clause",
        "symbols": [lexer.has("RESERVED_CLAUSE") ? { type: "RESERVED_CLAUSE" } : RESERVED_CLAUSE, "other_clause$ebnf$1"],
        "postprocess": ([nameToken, children]) => ({
          type: NodeType.clause,
          nameKw: toKeywordNode(nameToken),
          children
        })
      },
      { "name": "set_operation$ebnf$1", "symbols": [] },
      { "name": "set_operation$ebnf$1", "symbols": ["set_operation$ebnf$1", "free_form_sql"], "postprocess": (d) => d[0].concat([d[1]]) },
      {
        "name": "set_operation",
        "symbols": [lexer.has("RESERVED_SET_OPERATION") ? { type: "RESERVED_SET_OPERATION" } : RESERVED_SET_OPERATION, "set_operation$ebnf$1"],
        "postprocess": ([nameToken, children]) => ({
          type: NodeType.set_operation,
          nameKw: toKeywordNode(nameToken),
          children
        })
      },
      { "name": "expression_chain_$ebnf$1", "symbols": ["expression_with_comments_"] },
      { "name": "expression_chain_$ebnf$1", "symbols": ["expression_chain_$ebnf$1", "expression_with_comments_"], "postprocess": (d) => d[0].concat([d[1]]) },
      { "name": "expression_chain_", "symbols": ["expression_chain_$ebnf$1"], "postprocess": id },
      { "name": "expression_chain$ebnf$1", "symbols": [] },
      { "name": "expression_chain$ebnf$1", "symbols": ["expression_chain$ebnf$1", "_expression_with_comments"], "postprocess": (d) => d[0].concat([d[1]]) },
      {
        "name": "expression_chain",
        "symbols": ["expression", "expression_chain$ebnf$1"],
        "postprocess": ([expr, chain]) => [expr, ...chain]
      },
      { "name": "andless_expression_chain$ebnf$1", "symbols": [] },
      { "name": "andless_expression_chain$ebnf$1", "symbols": ["andless_expression_chain$ebnf$1", "_andless_expression_with_comments"], "postprocess": (d) => d[0].concat([d[1]]) },
      {
        "name": "andless_expression_chain",
        "symbols": ["andless_expression", "andless_expression_chain$ebnf$1"],
        "postprocess": ([expr, chain]) => [expr, ...chain]
      },
      {
        "name": "expression_with_comments_",
        "symbols": ["expression", "_"],
        "postprocess": ([expr, _]) => addComments(expr, { trailing: _ })
      },
      {
        "name": "_expression_with_comments",
        "symbols": ["_", "expression"],
        "postprocess": ([_, expr]) => addComments(expr, { leading: _ })
      },
      {
        "name": "_andless_expression_with_comments",
        "symbols": ["_", "andless_expression"],
        "postprocess": ([_, expr]) => addComments(expr, { leading: _ })
      },
      { "name": "free_form_sql$subexpression$1", "symbols": ["asteriskless_free_form_sql"] },
      { "name": "free_form_sql$subexpression$1", "symbols": ["asterisk"] },
      { "name": "free_form_sql", "symbols": ["free_form_sql$subexpression$1"], "postprocess": unwrap },
      { "name": "asteriskless_free_form_sql$subexpression$1", "symbols": ["asteriskless_andless_expression"] },
      { "name": "asteriskless_free_form_sql$subexpression$1", "symbols": ["logic_operator"] },
      { "name": "asteriskless_free_form_sql$subexpression$1", "symbols": ["comma"] },
      { "name": "asteriskless_free_form_sql$subexpression$1", "symbols": ["comment"] },
      { "name": "asteriskless_free_form_sql$subexpression$1", "symbols": ["other_keyword"] },
      { "name": "asteriskless_free_form_sql", "symbols": ["asteriskless_free_form_sql$subexpression$1"], "postprocess": unwrap },
      { "name": "expression$subexpression$1", "symbols": ["andless_expression"] },
      { "name": "expression$subexpression$1", "symbols": ["logic_operator"] },
      { "name": "expression", "symbols": ["expression$subexpression$1"], "postprocess": unwrap },
      { "name": "andless_expression$subexpression$1", "symbols": ["asteriskless_andless_expression"] },
      { "name": "andless_expression$subexpression$1", "symbols": ["asterisk"] },
      { "name": "andless_expression", "symbols": ["andless_expression$subexpression$1"], "postprocess": unwrap },
      { "name": "asteriskless_andless_expression$subexpression$1", "symbols": ["atomic_expression"] },
      { "name": "asteriskless_andless_expression$subexpression$1", "symbols": ["between_predicate"] },
      { "name": "asteriskless_andless_expression$subexpression$1", "symbols": ["case_expression"] },
      { "name": "asteriskless_andless_expression", "symbols": ["asteriskless_andless_expression$subexpression$1"], "postprocess": unwrap },
      { "name": "atomic_expression$subexpression$1", "symbols": ["array_subscript"] },
      { "name": "atomic_expression$subexpression$1", "symbols": ["function_call"] },
      { "name": "atomic_expression$subexpression$1", "symbols": ["property_access"] },
      { "name": "atomic_expression$subexpression$1", "symbols": ["parenthesis"] },
      { "name": "atomic_expression$subexpression$1", "symbols": ["curly_braces"] },
      { "name": "atomic_expression$subexpression$1", "symbols": ["square_brackets"] },
      { "name": "atomic_expression$subexpression$1", "symbols": ["operator"] },
      { "name": "atomic_expression$subexpression$1", "symbols": ["identifier"] },
      { "name": "atomic_expression$subexpression$1", "symbols": ["parameter"] },
      { "name": "atomic_expression$subexpression$1", "symbols": ["literal"] },
      { "name": "atomic_expression$subexpression$1", "symbols": ["data_type"] },
      { "name": "atomic_expression$subexpression$1", "symbols": ["keyword"] },
      { "name": "atomic_expression", "symbols": ["atomic_expression$subexpression$1"], "postprocess": unwrap },
      {
        "name": "array_subscript",
        "symbols": [lexer.has("ARRAY_IDENTIFIER") ? { type: "ARRAY_IDENTIFIER" } : ARRAY_IDENTIFIER, "_", "square_brackets"],
        "postprocess": ([arrayToken, _, brackets]) => ({
          type: NodeType.array_subscript,
          array: addComments({ type: NodeType.identifier, quoted: false, text: arrayToken.text }, { trailing: _ }),
          parenthesis: brackets
        })
      },
      {
        "name": "array_subscript",
        "symbols": [lexer.has("ARRAY_KEYWORD") ? { type: "ARRAY_KEYWORD" } : ARRAY_KEYWORD, "_", "square_brackets"],
        "postprocess": ([arrayToken, _, brackets]) => ({
          type: NodeType.array_subscript,
          array: addComments(toKeywordNode(arrayToken), { trailing: _ }),
          parenthesis: brackets
        })
      },
      {
        "name": "function_call",
        "symbols": [lexer.has("RESERVED_FUNCTION_NAME") ? { type: "RESERVED_FUNCTION_NAME" } : RESERVED_FUNCTION_NAME, "_", "parenthesis"],
        "postprocess": ([nameToken, _, parens]) => ({
          type: NodeType.function_call,
          nameKw: addComments(toKeywordNode(nameToken), { trailing: _ }),
          parenthesis: parens
        })
      },
      {
        "name": "parenthesis",
        "symbols": [{ "literal": "(" }, "expressions_or_clauses", { "literal": ")" }],
        "postprocess": ([open, children, close]) => ({
          type: NodeType.parenthesis,
          children,
          openParen: "(",
          closeParen: ")"
        })
      },
      { "name": "curly_braces$ebnf$1", "symbols": [] },
      { "name": "curly_braces$ebnf$1", "symbols": ["curly_braces$ebnf$1", "free_form_sql"], "postprocess": (d) => d[0].concat([d[1]]) },
      {
        "name": "curly_braces",
        "symbols": [{ "literal": "{" }, "curly_braces$ebnf$1", { "literal": "}" }],
        "postprocess": ([open, children, close]) => ({
          type: NodeType.parenthesis,
          children,
          openParen: "{",
          closeParen: "}"
        })
      },
      { "name": "square_brackets$ebnf$1", "symbols": [] },
      { "name": "square_brackets$ebnf$1", "symbols": ["square_brackets$ebnf$1", "free_form_sql"], "postprocess": (d) => d[0].concat([d[1]]) },
      {
        "name": "square_brackets",
        "symbols": [{ "literal": "[" }, "square_brackets$ebnf$1", { "literal": "]" }],
        "postprocess": ([open, children, close]) => ({
          type: NodeType.parenthesis,
          children,
          openParen: "[",
          closeParen: "]"
        })
      },
      { "name": "property_access$subexpression$1", "symbols": ["identifier"] },
      { "name": "property_access$subexpression$1", "symbols": ["array_subscript"] },
      { "name": "property_access$subexpression$1", "symbols": ["all_columns_asterisk"] },
      { "name": "property_access$subexpression$1", "symbols": ["parameter"] },
      {
        "name": "property_access",
        "symbols": ["atomic_expression", "_", lexer.has("PROPERTY_ACCESS_OPERATOR") ? { type: "PROPERTY_ACCESS_OPERATOR" } : PROPERTY_ACCESS_OPERATOR, "_", "property_access$subexpression$1"],
        "postprocess": (
          // Allowing property to be <array_subscript> is currently a hack.
          // A better way would be to allow <property_access> on the left side of array_subscript,
          // but we currently can't do that because of another hack that requires
          // %ARRAY_IDENTIFIER on the left side of <array_subscript>.
          ([object, _1, dot, _2, [property]]) => {
            return {
              type: NodeType.property_access,
              object: addComments(object, { trailing: _1 }),
              operator: dot.text,
              property: addComments(property, { leading: _2 })
            };
          }
        )
      },
      {
        "name": "between_predicate",
        "symbols": [lexer.has("BETWEEN") ? { type: "BETWEEN" } : BETWEEN, "_", "andless_expression_chain", "_", lexer.has("AND") ? { type: "AND" } : AND, "_", "andless_expression"],
        "postprocess": ([betweenToken, _1, expr1, _2, andToken, _3, expr2]) => ({
          type: NodeType.between_predicate,
          betweenKw: toKeywordNode(betweenToken),
          expr1: addCommentsToArray(expr1, { leading: _1, trailing: _2 }),
          andKw: toKeywordNode(andToken),
          expr2: [addComments(expr2, { leading: _3 })]
        })
      },
      { "name": "case_expression$ebnf$1", "symbols": ["expression_chain_"], "postprocess": id },
      { "name": "case_expression$ebnf$1", "symbols": [], "postprocess": () => null },
      { "name": "case_expression$ebnf$2", "symbols": [] },
      { "name": "case_expression$ebnf$2", "symbols": ["case_expression$ebnf$2", "case_clause"], "postprocess": (d) => d[0].concat([d[1]]) },
      {
        "name": "case_expression",
        "symbols": [lexer.has("CASE") ? { type: "CASE" } : CASE, "_", "case_expression$ebnf$1", "case_expression$ebnf$2", lexer.has("END") ? { type: "END" } : END],
        "postprocess": ([caseToken, _, expr, clauses, endToken]) => ({
          type: NodeType.case_expression,
          caseKw: addComments(toKeywordNode(caseToken), { trailing: _ }),
          endKw: toKeywordNode(endToken),
          expr: expr || [],
          clauses
        })
      },
      {
        "name": "case_clause",
        "symbols": [lexer.has("WHEN") ? { type: "WHEN" } : WHEN, "_", "expression_chain_", lexer.has("THEN") ? { type: "THEN" } : THEN, "_", "expression_chain_"],
        "postprocess": ([whenToken, _1, cond, thenToken, _2, expr]) => ({
          type: NodeType.case_when,
          whenKw: addComments(toKeywordNode(whenToken), { trailing: _1 }),
          thenKw: addComments(toKeywordNode(thenToken), { trailing: _2 }),
          condition: cond,
          result: expr
        })
      },
      {
        "name": "case_clause",
        "symbols": [lexer.has("ELSE") ? { type: "ELSE" } : ELSE, "_", "expression_chain_"],
        "postprocess": ([elseToken, _, expr]) => ({
          type: NodeType.case_else,
          elseKw: addComments(toKeywordNode(elseToken), { trailing: _ }),
          result: expr
        })
      },
      { "name": "comma$subexpression$1", "symbols": [lexer.has("COMMA") ? { type: "COMMA" } : COMMA] },
      { "name": "comma", "symbols": ["comma$subexpression$1"], "postprocess": ([[token]]) => ({ type: NodeType.comma }) },
      { "name": "asterisk$subexpression$1", "symbols": [lexer.has("ASTERISK") ? { type: "ASTERISK" } : ASTERISK] },
      { "name": "asterisk", "symbols": ["asterisk$subexpression$1"], "postprocess": ([[token]]) => ({ type: NodeType.operator, text: token.text }) },
      { "name": "operator$subexpression$1", "symbols": [lexer.has("OPERATOR") ? { type: "OPERATOR" } : OPERATOR] },
      { "name": "operator", "symbols": ["operator$subexpression$1"], "postprocess": ([[token]]) => ({ type: NodeType.operator, text: token.text }) },
      { "name": "identifier$subexpression$1", "symbols": [lexer.has("IDENTIFIER") ? { type: "IDENTIFIER" } : IDENTIFIER] },
      { "name": "identifier$subexpression$1", "symbols": [lexer.has("QUOTED_IDENTIFIER") ? { type: "QUOTED_IDENTIFIER" } : QUOTED_IDENTIFIER] },
      { "name": "identifier$subexpression$1", "symbols": [lexer.has("VARIABLE") ? { type: "VARIABLE" } : VARIABLE] },
      { "name": "identifier", "symbols": ["identifier$subexpression$1"], "postprocess": ([[token]]) => ({ type: NodeType.identifier, quoted: token.type !== "IDENTIFIER", text: token.text }) },
      { "name": "parameter$subexpression$1", "symbols": [lexer.has("NAMED_PARAMETER") ? { type: "NAMED_PARAMETER" } : NAMED_PARAMETER] },
      { "name": "parameter$subexpression$1", "symbols": [lexer.has("QUOTED_PARAMETER") ? { type: "QUOTED_PARAMETER" } : QUOTED_PARAMETER] },
      { "name": "parameter$subexpression$1", "symbols": [lexer.has("NUMBERED_PARAMETER") ? { type: "NUMBERED_PARAMETER" } : NUMBERED_PARAMETER] },
      { "name": "parameter$subexpression$1", "symbols": [lexer.has("POSITIONAL_PARAMETER") ? { type: "POSITIONAL_PARAMETER" } : POSITIONAL_PARAMETER] },
      { "name": "parameter$subexpression$1", "symbols": [lexer.has("CUSTOM_PARAMETER") ? { type: "CUSTOM_PARAMETER" } : CUSTOM_PARAMETER] },
      { "name": "parameter", "symbols": ["parameter$subexpression$1"], "postprocess": ([[token]]) => ({ type: NodeType.parameter, key: token.key, text: token.text }) },
      { "name": "literal$subexpression$1", "symbols": [lexer.has("NUMBER") ? { type: "NUMBER" } : NUMBER] },
      { "name": "literal$subexpression$1", "symbols": [lexer.has("STRING") ? { type: "STRING" } : STRING] },
      { "name": "literal", "symbols": ["literal$subexpression$1"], "postprocess": ([[token]]) => ({ type: NodeType.literal, text: token.text }) },
      { "name": "keyword$subexpression$1", "symbols": [lexer.has("RESERVED_KEYWORD") ? { type: "RESERVED_KEYWORD" } : RESERVED_KEYWORD] },
      { "name": "keyword$subexpression$1", "symbols": [lexer.has("RESERVED_KEYWORD_PHRASE") ? { type: "RESERVED_KEYWORD_PHRASE" } : RESERVED_KEYWORD_PHRASE] },
      { "name": "keyword$subexpression$1", "symbols": [lexer.has("RESERVED_JOIN") ? { type: "RESERVED_JOIN" } : RESERVED_JOIN] },
      {
        "name": "keyword",
        "symbols": ["keyword$subexpression$1"],
        "postprocess": ([[token]]) => toKeywordNode(token)
      },
      { "name": "data_type$subexpression$1", "symbols": [lexer.has("RESERVED_DATA_TYPE") ? { type: "RESERVED_DATA_TYPE" } : RESERVED_DATA_TYPE] },
      { "name": "data_type$subexpression$1", "symbols": [lexer.has("RESERVED_DATA_TYPE_PHRASE") ? { type: "RESERVED_DATA_TYPE_PHRASE" } : RESERVED_DATA_TYPE_PHRASE] },
      {
        "name": "data_type",
        "symbols": ["data_type$subexpression$1"],
        "postprocess": ([[token]]) => toDataTypeNode(token)
      },
      {
        "name": "data_type",
        "symbols": [lexer.has("RESERVED_PARAMETERIZED_DATA_TYPE") ? { type: "RESERVED_PARAMETERIZED_DATA_TYPE" } : RESERVED_PARAMETERIZED_DATA_TYPE, "_", "parenthesis"],
        "postprocess": ([nameToken, _, parens]) => ({
          type: NodeType.parameterized_data_type,
          dataType: addComments(toDataTypeNode(nameToken), { trailing: _ }),
          parenthesis: parens
        })
      },
      { "name": "logic_operator$subexpression$1", "symbols": [lexer.has("AND") ? { type: "AND" } : AND] },
      { "name": "logic_operator$subexpression$1", "symbols": [lexer.has("OR") ? { type: "OR" } : OR] },
      { "name": "logic_operator$subexpression$1", "symbols": [lexer.has("XOR") ? { type: "XOR" } : XOR] },
      {
        "name": "logic_operator",
        "symbols": ["logic_operator$subexpression$1"],
        "postprocess": ([[token]]) => toKeywordNode(token)
      },
      { "name": "other_keyword$subexpression$1", "symbols": [lexer.has("WHEN") ? { type: "WHEN" } : WHEN] },
      { "name": "other_keyword$subexpression$1", "symbols": [lexer.has("THEN") ? { type: "THEN" } : THEN] },
      { "name": "other_keyword$subexpression$1", "symbols": [lexer.has("ELSE") ? { type: "ELSE" } : ELSE] },
      { "name": "other_keyword$subexpression$1", "symbols": [lexer.has("END") ? { type: "END" } : END] },
      {
        "name": "other_keyword",
        "symbols": ["other_keyword$subexpression$1"],
        "postprocess": ([[token]]) => toKeywordNode(token)
      },
      { "name": "_$ebnf$1", "symbols": [] },
      { "name": "_$ebnf$1", "symbols": ["_$ebnf$1", "comment"], "postprocess": (d) => d[0].concat([d[1]]) },
      { "name": "_", "symbols": ["_$ebnf$1"], "postprocess": ([comments]) => comments },
      {
        "name": "comment",
        "symbols": [lexer.has("LINE_COMMENT") ? { type: "LINE_COMMENT" } : LINE_COMMENT],
        "postprocess": ([token]) => ({
          type: NodeType.line_comment,
          text: token.text,
          precedingWhitespace: token.precedingWhitespace
        })
      },
      {
        "name": "comment",
        "symbols": [lexer.has("BLOCK_COMMENT") ? { type: "BLOCK_COMMENT" } : BLOCK_COMMENT],
        "postprocess": ([token]) => ({
          type: NodeType.block_comment,
          text: token.text,
          precedingWhitespace: token.precedingWhitespace
        })
      },
      {
        "name": "comment",
        "symbols": [lexer.has("DISABLE_COMMENT") ? { type: "DISABLE_COMMENT" } : DISABLE_COMMENT],
        "postprocess": ([token]) => ({
          type: NodeType.disable_comment,
          text: token.text,
          precedingWhitespace: token.precedingWhitespace
        })
      }
    ],
    ParserStart: "main"
  };
  var grammar_default = grammar;

  // node_modules/sql-formatter/dist/esm/parser/createParser.js
  var { Parser: NearleyParser, Grammar } = import_nearley.default;
  function createParser(tokenizer) {
    let paramTypesOverrides = {};
    const lexer2 = new LexerAdapter((chunk) => [
      ...disambiguateTokens(tokenizer.tokenize(chunk, paramTypesOverrides)),
      createEofToken(chunk.length)
    ]);
    const parser = new NearleyParser(Grammar.fromCompiled(grammar_default), { lexer: lexer2 });
    return {
      parse: (sql, paramTypes) => {
        paramTypesOverrides = paramTypes;
        const { results } = parser.feed(sql);
        if (results.length === 1) {
          return results[0];
        } else if (results.length === 0) {
          throw new Error("Parse error: Invalid SQL");
        } else {
          throw new Error(`Parse error: Ambiguous grammar
${JSON.stringify(results, void 0, 2)}`);
        }
      }
    };
  }

  // node_modules/sql-formatter/dist/esm/formatter/Layout.js
  var WS;
  (function(WS2) {
    WS2[WS2["SPACE"] = 0] = "SPACE";
    WS2[WS2["NO_SPACE"] = 1] = "NO_SPACE";
    WS2[WS2["NO_NEWLINE"] = 2] = "NO_NEWLINE";
    WS2[WS2["NEWLINE"] = 3] = "NEWLINE";
    WS2[WS2["MANDATORY_NEWLINE"] = 4] = "MANDATORY_NEWLINE";
    WS2[WS2["INDENT"] = 5] = "INDENT";
    WS2[WS2["SINGLE_INDENT"] = 6] = "SINGLE_INDENT";
  })(WS = WS || (WS = {}));
  var Layout = class {
    constructor(indentation) {
      this.indentation = indentation;
      this.items = [];
    }
    /**
     * Appends token strings and whitespace modifications to SQL string.
     */
    add(...items) {
      for (const item of items) {
        switch (item) {
          case WS.SPACE:
            this.items.push(WS.SPACE);
            break;
          case WS.NO_SPACE:
            this.trimHorizontalWhitespace();
            break;
          case WS.NO_NEWLINE:
            this.trimWhitespace();
            break;
          case WS.NEWLINE:
            this.trimHorizontalWhitespace();
            this.addNewline(WS.NEWLINE);
            break;
          case WS.MANDATORY_NEWLINE:
            this.trimHorizontalWhitespace();
            this.addNewline(WS.MANDATORY_NEWLINE);
            break;
          case WS.INDENT:
            this.addIndentation();
            break;
          case WS.SINGLE_INDENT:
            this.items.push(WS.SINGLE_INDENT);
            break;
          default:
            this.items.push(item);
        }
      }
    }
    trimHorizontalWhitespace() {
      while (isHorizontalWhitespace(last(this.items))) {
        this.items.pop();
      }
    }
    trimWhitespace() {
      while (isRemovableWhitespace(last(this.items))) {
        this.items.pop();
      }
    }
    addNewline(newline) {
      if (this.items.length > 0) {
        switch (last(this.items)) {
          case WS.NEWLINE:
            this.items.pop();
            this.items.push(newline);
            break;
          case WS.MANDATORY_NEWLINE:
            break;
          default:
            this.items.push(newline);
            break;
        }
      }
    }
    addIndentation() {
      for (let i = 0; i < this.indentation.getLevel(); i++) {
        this.items.push(WS.SINGLE_INDENT);
      }
    }
    /**
     * Returns the final SQL string.
     */
    toString() {
      return this.items.map((item) => this.itemToString(item)).join("");
    }
    /**
     * Returns the internal layout data
     */
    getLayoutItems() {
      return this.items;
    }
    /**
     * True when some content has already been added and nothing but indentation
     * has been emitted since the last newline, meaning the next token would be
     * placed at the start of a fresh (non-first) line.
     */
    isAtStartOfLine() {
      for (let i = this.items.length - 1; i >= 0; i--) {
        const item = this.items[i];
        if (item === WS.SINGLE_INDENT) {
          continue;
        }
        return item === WS.NEWLINE || item === WS.MANDATORY_NEWLINE;
      }
      return false;
    }
    itemToString(item) {
      switch (item) {
        case WS.SPACE:
          return " ";
        case WS.NEWLINE:
        case WS.MANDATORY_NEWLINE:
          return "\n";
        case WS.SINGLE_INDENT:
          return this.indentation.getSingleIndent();
        default:
          return item;
      }
    }
  };
  var isHorizontalWhitespace = (item) => item === WS.SPACE || item === WS.SINGLE_INDENT;
  var isRemovableWhitespace = (item) => item === WS.SPACE || item === WS.SINGLE_INDENT || item === WS.NEWLINE;

  // node_modules/sql-formatter/dist/esm/formatter/tabularStyle.js
  function toTabularFormat(tokenText, indentStyle) {
    if (indentStyle === "standard") {
      return tokenText;
    }
    let tail = [];
    if (tokenText.length >= 10 && tokenText.includes(" ")) {
      [tokenText, ...tail] = tokenText.split(" ");
    }
    if (indentStyle === "tabularLeft") {
      tokenText = tokenText.padEnd(9, " ");
    } else {
      tokenText = tokenText.padStart(9, " ");
    }
    return tokenText + ["", ...tail].join(" ");
  }
  function isTabularToken(type) {
    return isLogicalOperator(type) || type === TokenType.RESERVED_CLAUSE || type === TokenType.RESERVED_SELECT || type === TokenType.RESERVED_SET_OPERATION || type === TokenType.RESERVED_JOIN || type === TokenType.LIMIT;
  }

  // node_modules/sql-formatter/dist/esm/formatter/Indentation.js
  var INDENT_TYPE_TOP_LEVEL = "top-level";
  var INDENT_TYPE_BLOCK_LEVEL = "block-level";
  var Indentation = class {
    /**
     * @param {string} indent A string to indent with
     */
    constructor(indent) {
      this.indent = indent;
      this.indentTypes = [];
    }
    /**
     * Returns indentation string for single indentation step.
     */
    getSingleIndent() {
      return this.indent;
    }
    /**
     * Returns current indentation level
     */
    getLevel() {
      return this.indentTypes.length;
    }
    /**
     * Increases indentation by one top-level indent.
     */
    increaseTopLevel() {
      this.indentTypes.push(INDENT_TYPE_TOP_LEVEL);
    }
    /**
     * Increases indentation by one block-level indent.
     */
    increaseBlockLevel() {
      this.indentTypes.push(INDENT_TYPE_BLOCK_LEVEL);
    }
    /**
     * Decreases indentation by one top-level indent.
     * Does nothing when the previous indent is not top-level.
     */
    decreaseTopLevel() {
      if (this.indentTypes.length > 0 && last(this.indentTypes) === INDENT_TYPE_TOP_LEVEL) {
        this.indentTypes.pop();
      }
    }
    /**
     * Decreases indentation by one block-level indent.
     * If there are top-level indents within the block-level indent,
     * throws away these as well.
     */
    decreaseBlockLevel() {
      while (this.indentTypes.length > 0) {
        const type = this.indentTypes.pop();
        if (type !== INDENT_TYPE_TOP_LEVEL) {
          break;
        }
      }
    }
  };

  // node_modules/sql-formatter/dist/esm/formatter/InlineLayout.js
  var InlineLayout = class extends Layout {
    constructor(expressionWidth) {
      super(new Indentation(""));
      this.expressionWidth = expressionWidth;
      this.length = 0;
      this.trailingSpace = false;
    }
    add(...items) {
      items.forEach((item) => this.addToLength(item));
      if (this.length > this.expressionWidth) {
        throw new InlineLayoutError();
      }
      super.add(...items);
    }
    addToLength(item) {
      if (typeof item === "string") {
        this.length += item.length;
        this.trailingSpace = false;
      } else if (item === WS.MANDATORY_NEWLINE || item === WS.NEWLINE) {
        throw new InlineLayoutError();
      } else if (item === WS.INDENT || item === WS.SINGLE_INDENT || item === WS.SPACE) {
        if (!this.trailingSpace) {
          this.length++;
          this.trailingSpace = true;
        }
      } else if (item === WS.NO_NEWLINE || item === WS.NO_SPACE) {
        if (this.trailingSpace) {
          this.trailingSpace = false;
          this.length--;
        }
      }
    }
  };
  var InlineLayoutError = class extends Error {
  };

  // node_modules/sql-formatter/dist/esm/formatter/ExpressionFormatter.js
  var ExpressionFormatter = class _ExpressionFormatter {
    constructor({ cfg, dialectCfg, params, layout, inline = false }) {
      this.inline = false;
      this.nodes = [];
      this.index = -1;
      this.cfg = cfg;
      this.dialectCfg = dialectCfg;
      this.inline = inline;
      this.params = params;
      this.layout = layout;
    }
    format(nodes) {
      this.nodes = nodes;
      for (this.index = 0; this.index < this.nodes.length; this.index++) {
        this.formatNode(this.nodes[this.index]);
      }
      return this.layout;
    }
    formatNode(node) {
      this.formatComments(node.leadingComments);
      this.formatNodeWithoutComments(node);
      this.formatComments(node.trailingComments);
    }
    formatNodeWithoutComments(node) {
      switch (node.type) {
        case NodeType.function_call:
          return this.formatFunctionCall(node);
        case NodeType.parameterized_data_type:
          return this.formatParameterizedDataType(node);
        case NodeType.array_subscript:
          return this.formatArraySubscript(node);
        case NodeType.property_access:
          return this.formatPropertyAccess(node);
        case NodeType.parenthesis:
          return this.formatParenthesis(node);
        case NodeType.between_predicate:
          return this.formatBetweenPredicate(node);
        case NodeType.case_expression:
          return this.formatCaseExpression(node);
        case NodeType.case_when:
          return this.formatCaseWhen(node);
        case NodeType.case_else:
          return this.formatCaseElse(node);
        case NodeType.clause:
          return this.formatClause(node);
        case NodeType.set_operation:
          return this.formatSetOperation(node);
        case NodeType.limit_clause:
          return this.formatLimitClause(node);
        case NodeType.all_columns_asterisk:
          return this.formatAllColumnsAsterisk(node);
        case NodeType.literal:
          return this.formatLiteral(node);
        case NodeType.identifier:
          return this.formatIdentifier(node);
        case NodeType.parameter:
          return this.formatParameter(node);
        case NodeType.operator:
          return this.formatOperator(node);
        case NodeType.comma:
          return this.formatComma(node);
        case NodeType.line_comment:
          return this.formatLineComment(node);
        case NodeType.block_comment:
          return this.formatBlockComment(node);
        case NodeType.disable_comment:
          return this.formatBlockComment(node);
        case NodeType.data_type:
          return this.formatDataType(node);
        case NodeType.keyword:
          return this.formatKeywordNode(node);
      }
    }
    formatFunctionCall(node) {
      this.withComments(node.nameKw, () => {
        this.layout.add(this.showFunctionKw(node.nameKw));
      });
      this.formatNode(node.parenthesis);
    }
    formatParameterizedDataType(node) {
      this.withComments(node.dataType, () => {
        this.layout.add(this.showDataType(node.dataType));
      });
      this.formatNode(node.parenthesis);
    }
    formatArraySubscript(node) {
      let formattedArray;
      switch (node.array.type) {
        case NodeType.data_type:
          formattedArray = this.showDataType(node.array);
          break;
        case NodeType.keyword:
          formattedArray = this.showKw(node.array);
          break;
        default:
          formattedArray = this.showIdentifier(node.array);
          break;
      }
      this.withComments(node.array, () => {
        this.layout.add(formattedArray);
      });
      this.formatNode(node.parenthesis);
    }
    formatPropertyAccess(node) {
      this.formatNode(node.object);
      this.layout.add(WS.NO_SPACE, node.operator);
      this.formatNode(node.property);
    }
    formatParenthesis(node) {
      const inlineLayout = this.formatInlineExpression(node.children);
      if (inlineLayout) {
        this.layout.add(node.openParen);
        this.layout.add(...inlineLayout.getLayoutItems());
        this.layout.add(WS.NO_SPACE, node.closeParen, WS.SPACE);
      } else {
        this.layout.add(node.openParen, WS.NEWLINE);
        if (isTabularStyle(this.cfg)) {
          this.layout.add(WS.INDENT);
          this.layout = this.formatSubExpression(node.children);
        } else {
          this.layout.indentation.increaseBlockLevel();
          this.layout.add(WS.INDENT);
          this.layout = this.formatSubExpression(node.children);
          this.layout.indentation.decreaseBlockLevel();
        }
        this.layout.add(WS.NEWLINE, WS.INDENT, node.closeParen, WS.SPACE);
      }
    }
    formatBetweenPredicate(node) {
      this.layout.add(this.showKw(node.betweenKw), WS.SPACE);
      this.layout = this.formatSubExpression(node.expr1);
      this.layout.add(WS.NO_SPACE, WS.SPACE, this.showNonTabularKw(node.andKw), WS.SPACE);
      this.layout = this.formatSubExpression(node.expr2);
      this.layout.add(WS.SPACE);
    }
    formatCaseExpression(node) {
      this.formatNode(node.caseKw);
      this.layout.indentation.increaseBlockLevel();
      this.layout = this.formatSubExpression(node.expr);
      this.layout = this.formatSubExpression(node.clauses);
      this.layout.indentation.decreaseBlockLevel();
      this.layout.add(WS.NEWLINE, WS.INDENT);
      this.formatNode(node.endKw);
    }
    formatCaseWhen(node) {
      this.layout.add(WS.NEWLINE, WS.INDENT);
      this.formatNode(node.whenKw);
      this.layout = this.formatSubExpression(node.condition);
      this.formatNode(node.thenKw);
      this.layout = this.formatSubExpression(node.result);
    }
    formatCaseElse(node) {
      this.layout.add(WS.NEWLINE, WS.INDENT);
      this.formatNode(node.elseKw);
      this.layout = this.formatSubExpression(node.result);
    }
    formatClause(node) {
      if (this.isOnelineClause(node)) {
        this.formatClauseInOnelineStyle(node);
      } else if (isTabularStyle(this.cfg)) {
        this.formatClauseInTabularStyle(node);
      } else {
        this.formatClauseInIndentedStyle(node);
      }
    }
    isOnelineClause(node) {
      if (isTabularStyle(this.cfg)) {
        return this.dialectCfg.tabularOnelineClauses[node.nameKw.text];
      } else {
        return this.dialectCfg.onelineClauses[node.nameKw.text];
      }
    }
    formatClauseInIndentedStyle(node) {
      this.layout.add(WS.NEWLINE, WS.INDENT, this.showKw(node.nameKw), WS.NEWLINE);
      this.layout.indentation.increaseTopLevel();
      this.layout.add(WS.INDENT);
      this.layout = this.formatSubExpression(node.children);
      this.layout.indentation.decreaseTopLevel();
    }
    formatClauseInOnelineStyle(node) {
      this.layout.add(WS.NEWLINE, WS.INDENT, this.showKw(node.nameKw), WS.SPACE);
      this.layout = this.formatSubExpression(node.children);
    }
    formatClauseInTabularStyle(node) {
      this.layout.add(WS.NEWLINE, WS.INDENT, this.showKw(node.nameKw), WS.SPACE);
      this.layout.indentation.increaseTopLevel();
      this.layout = this.formatSubExpression(node.children);
      this.layout.indentation.decreaseTopLevel();
    }
    formatSetOperation(node) {
      this.layout.add(WS.NEWLINE, WS.INDENT, this.showKw(node.nameKw), WS.NEWLINE);
      this.layout.add(WS.INDENT);
      this.layout = this.formatSubExpression(node.children);
    }
    formatLimitClause(node) {
      this.withComments(node.limitKw, () => {
        this.layout.add(WS.NEWLINE, WS.INDENT, this.showKw(node.limitKw));
      });
      this.layout.indentation.increaseTopLevel();
      if (isTabularStyle(this.cfg)) {
        this.layout.add(WS.SPACE);
      } else {
        this.layout.add(WS.NEWLINE, WS.INDENT);
      }
      if (node.offset) {
        this.layout = this.formatSubExpression(node.offset);
        this.layout.add(WS.NO_SPACE, ",", WS.SPACE);
        this.layout = this.formatSubExpression(node.count);
      } else {
        this.layout = this.formatSubExpression(node.count);
      }
      this.layout.indentation.decreaseTopLevel();
    }
    formatAllColumnsAsterisk(_node) {
      this.layout.add("*", WS.SPACE);
    }
    formatLiteral(node) {
      this.layout.add(node.text, WS.SPACE);
    }
    formatIdentifier(node) {
      this.layout.add(this.showIdentifier(node), WS.SPACE);
    }
    formatParameter(node) {
      this.layout.add(this.params.get(node), WS.SPACE);
    }
    formatOperator({ text }) {
      if (text === "-" && this.dialectCfg.identifierDashes) {
        this.layout.add(text, WS.SPACE);
      } else if (this.cfg.denseOperators || this.dialectCfg.alwaysDenseOperators.includes(text)) {
        this.layout.add(WS.NO_SPACE, text);
      } else if (text === ":") {
        this.layout.add(WS.NO_SPACE, text, WS.SPACE);
      } else {
        this.layout.add(text, WS.SPACE);
      }
    }
    formatComma(_node) {
      if (!this.inline) {
        this.layout.add(WS.NO_SPACE, ",", WS.NEWLINE, WS.INDENT);
      } else {
        this.layout.add(WS.NO_SPACE, ",", WS.SPACE);
      }
    }
    withComments(node, fn) {
      this.formatComments(node.leadingComments);
      fn();
      this.formatComments(node.trailingComments);
    }
    formatComments(comments) {
      if (!comments) {
        return;
      }
      comments.forEach((com) => {
        if (com.type === NodeType.line_comment) {
          this.formatLineComment(com);
        } else {
          this.formatBlockComment(com);
        }
      });
    }
    formatLineComment(node) {
      if (isMultiline(node.precedingWhitespace || "")) {
        this.layout.add(WS.NEWLINE, WS.INDENT, node.text, WS.MANDATORY_NEWLINE, WS.INDENT);
      } else if (this.layout.getLayoutItems().length > 0) {
        this.layout.add(WS.NO_NEWLINE, WS.SPACE, node.text, WS.MANDATORY_NEWLINE, WS.INDENT);
      } else {
        this.layout.add(node.text, WS.MANDATORY_NEWLINE, WS.INDENT);
      }
    }
    formatBlockComment(node) {
      if (node.type === NodeType.block_comment && this.isStandaloneBlockComment(node)) {
        this.splitBlockComment(node.text).forEach((line) => {
          this.layout.add(WS.NEWLINE, WS.INDENT, line);
        });
        this.layout.add(WS.NEWLINE, WS.INDENT);
      } else {
        this.layout.add(node.text, WS.SPACE);
      }
    }
    // True when:
    //
    // - the source text had a newline before the comment
    // - the comment itself is multi-line
    // - we have already added a newline to output text (right before this to-be added comment)
    //
    // The last one will ensure the comment position stays idempotent - so that
    // re-formatting the same SQL won't result in comment position changing.
    isStandaloneBlockComment(node) {
      return isMultiline(node.text) || isMultiline(node.precedingWhitespace || "") || this.layout.isAtStartOfLine();
    }
    isDocComment(comment) {
      const lines = comment.split(/\n/);
      return (
        // first line starts with /* or /**
        /^\/\*\*?$/.test(lines[0]) && // intermediate lines start with *
        lines.slice(1, lines.length - 1).every((line) => /^\s*\*/.test(line)) && // last line ends with */
        /^\s*\*\/$/.test(last(lines))
      );
    }
    // Breaks up block comment to multiple lines.
    // For example this doc-comment (dots representing leading whitespace):
    //
    //   ..../**
    //   .....* Some description here
    //   .....* and here too
    //   .....*/
    //
    // gets broken to this array (note the leading single spaces):
    //
    //   [ '/**',
    //     '.* Some description here',
    //     '.* and here too',
    //     '.*/' ]
    //
    // However, a normal comment (non-doc-comment) like this:
    //
    //   ..../*
    //   ....Some description here
    //   ....*/
    //
    // gets broken to this array (no leading spaces):
    //
    //   [ '/*',
    //     'Some description here',
    //     '*/' ]
    //
    splitBlockComment(comment) {
      if (this.isDocComment(comment)) {
        return comment.split(/\n/).map((line) => {
          if (/^\s*\*/.test(line)) {
            return " " + line.replace(/^\s*/, "");
          } else {
            return line;
          }
        });
      } else {
        return comment.split(/\n/).map((line) => line.replace(/^\s*/, ""));
      }
    }
    formatSubExpression(nodes) {
      return new _ExpressionFormatter({
        cfg: this.cfg,
        dialectCfg: this.dialectCfg,
        params: this.params,
        layout: this.layout,
        inline: this.inline
      }).format(nodes);
    }
    formatInlineExpression(nodes) {
      const oldParamIndex = this.params.getPositionalParameterIndex();
      try {
        return new _ExpressionFormatter({
          cfg: this.cfg,
          dialectCfg: this.dialectCfg,
          params: this.params,
          layout: new InlineLayout(this.cfg.expressionWidth),
          inline: true
        }).format(nodes);
      } catch (e) {
        if (e instanceof InlineLayoutError) {
          this.params.setPositionalParameterIndex(oldParamIndex);
          return void 0;
        } else {
          throw e;
        }
      }
    }
    formatKeywordNode(node) {
      switch (node.tokenType) {
        case TokenType.RESERVED_JOIN:
          return this.formatJoin(node);
        case TokenType.AND:
        case TokenType.OR:
        case TokenType.XOR:
          return this.formatLogicalOperator(node);
        default:
          return this.formatKeyword(node);
      }
    }
    formatJoin(node) {
      if (isTabularStyle(this.cfg)) {
        this.layout.indentation.decreaseTopLevel();
        this.layout.add(WS.NEWLINE, WS.INDENT, this.showKw(node), WS.SPACE);
        this.layout.indentation.increaseTopLevel();
      } else {
        this.layout.add(WS.NEWLINE, WS.INDENT, this.showKw(node), WS.SPACE);
      }
    }
    formatKeyword(node) {
      this.layout.add(this.showKw(node), WS.SPACE);
    }
    formatLogicalOperator(node) {
      if (this.cfg.logicalOperatorNewline === "before") {
        if (isTabularStyle(this.cfg)) {
          this.layout.indentation.decreaseTopLevel();
          this.layout.add(WS.NEWLINE, WS.INDENT, this.showKw(node), WS.SPACE);
          this.layout.indentation.increaseTopLevel();
        } else {
          this.layout.add(WS.NEWLINE, WS.INDENT, this.showKw(node), WS.SPACE);
        }
      } else {
        this.layout.add(this.showKw(node), WS.NEWLINE, WS.INDENT);
      }
    }
    formatDataType(node) {
      this.layout.add(this.showDataType(node), WS.SPACE);
    }
    showKw(node) {
      if (isTabularToken(node.tokenType)) {
        return toTabularFormat(this.showNonTabularKw(node), this.cfg.indentStyle);
      } else {
        return this.showNonTabularKw(node);
      }
    }
    // Like showKw(), but skips tabular formatting
    showNonTabularKw(node) {
      switch (this.cfg.keywordCase) {
        case "preserve":
          return equalizeWhitespace(node.raw);
        case "upper":
          return node.text;
        case "lower":
          return node.text.toLowerCase();
      }
    }
    showFunctionKw(node) {
      if (isTabularToken(node.tokenType)) {
        return toTabularFormat(this.showNonTabularFunctionKw(node), this.cfg.indentStyle);
      } else {
        return this.showNonTabularFunctionKw(node);
      }
    }
    // Like showFunctionKw(), but skips tabular formatting
    showNonTabularFunctionKw(node) {
      switch (this.cfg.functionCase) {
        case "preserve":
          return equalizeWhitespace(node.raw);
        case "upper":
          return node.text;
        case "lower":
          return node.text.toLowerCase();
      }
    }
    showIdentifier(node) {
      if (node.quoted) {
        return node.text;
      } else {
        switch (this.cfg.identifierCase) {
          case "preserve":
            return node.text;
          case "upper":
            return node.text.toUpperCase();
          case "lower":
            return node.text.toLowerCase();
        }
      }
    }
    showDataType(node) {
      switch (this.cfg.dataTypeCase) {
        case "preserve":
          return equalizeWhitespace(node.raw);
        case "upper":
          return node.text;
        case "lower":
          return node.text.toLowerCase();
      }
    }
  };

  // node_modules/sql-formatter/dist/esm/formatter/Formatter.js
  var Formatter = class {
    constructor(dialect, cfg) {
      this.dialect = dialect;
      this.cfg = cfg;
      this.params = new Params(this.cfg.params);
    }
    /**
     * Formats an SQL query.
     * @param {string} query - The SQL query string to be formatted
     * @return {string} The formatter query
     */
    format(query) {
      const ast = this.parse(query);
      const formattedQuery = this.formatAst(ast);
      return formattedQuery.trimEnd();
    }
    parse(query) {
      return createParser(this.dialect.tokenizer).parse(query, this.cfg.paramTypes || {});
    }
    formatAst(statements) {
      return statements.map((stat) => this.formatStatement(stat)).join("\n".repeat(this.cfg.linesBetweenQueries + 1));
    }
    formatStatement(statement) {
      const layout = new ExpressionFormatter({
        cfg: this.cfg,
        dialectCfg: this.dialect.formatOptions,
        params: this.params,
        layout: new Layout(new Indentation(indentString(this.cfg)))
      }).format(statement.children);
      if (!statement.hasSemicolon) {
      } else if (this.cfg.newlineBeforeSemicolon) {
        layout.add(WS.NEWLINE, ";");
      } else {
        layout.add(WS.NO_NEWLINE, ";");
      }
      return layout.toString();
    }
  };

  // node_modules/sql-formatter/dist/esm/validateConfig.js
  var ConfigError = class extends Error {
  };
  function validateConfig(cfg) {
    const removedOptions = [
      "multilineLists",
      "newlineBeforeOpenParen",
      "newlineBeforeCloseParen",
      "aliasAs",
      "commaPosition",
      "tabulateAlias"
    ];
    for (const optionName of removedOptions) {
      if (optionName in cfg) {
        throw new ConfigError(`${optionName} config is no more supported.`);
      }
    }
    if (cfg.expressionWidth <= 0) {
      throw new ConfigError(`expressionWidth config must be positive number. Received ${cfg.expressionWidth} instead.`);
    }
    if (cfg.params && !validateParams(cfg.params)) {
      console.warn('WARNING: All "params" option values should be strings.');
    }
    if (cfg.paramTypes && !validateParamTypes(cfg.paramTypes)) {
      throw new ConfigError("Empty regex given in custom paramTypes. That would result in matching infinite amount of parameters.");
    }
    return cfg;
  }
  function validateParams(params) {
    const paramValues = params instanceof Array ? params : Object.values(params);
    return paramValues.every((p) => typeof p === "string");
  }
  function validateParamTypes(paramTypes) {
    if (paramTypes.custom && Array.isArray(paramTypes.custom)) {
      return paramTypes.custom.every((p) => p.regex !== "");
    }
    return true;
  }

  // node_modules/sql-formatter/dist/esm/sqlFormatter.js
  var __rest = function(s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
      t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
      for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
        if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
          t[p[i]] = s[p[i]];
      }
    return t;
  };
  var dialectNameMap = {
    bigquery: "bigquery",
    clickhouse: "clickhouse",
    db2: "db2",
    db2i: "db2i",
    duckdb: "duckdb",
    hive: "hive",
    mariadb: "mariadb",
    mysql: "mysql",
    n1ql: "n1ql",
    plsql: "plsql",
    postgresql: "postgresql",
    redshift: "redshift",
    spark: "spark",
    sqlite: "sqlite",
    sql: "sql",
    tidb: "tidb",
    trino: "trino",
    transactsql: "transactsql",
    tsql: "transactsql",
    singlestoredb: "singlestoredb",
    snowflake: "snowflake"
  };
  var supportedDialects = Object.keys(dialectNameMap);
  var defaultOptions = {
    tabWidth: 2,
    useTabs: false,
    keywordCase: "preserve",
    identifierCase: "preserve",
    dataTypeCase: "preserve",
    functionCase: "preserve",
    indentStyle: "standard",
    logicalOperatorNewline: "before",
    expressionWidth: 50,
    linesBetweenQueries: 1,
    denseOperators: false,
    newlineBeforeSemicolon: false
  };
  var formatDialect = (query, _a) => {
    var { dialect } = _a, cfg = __rest(_a, ["dialect"]);
    if (typeof query !== "string") {
      throw new Error("Invalid query argument. Expected string, instead got " + typeof query);
    }
    const options = validateConfig(Object.assign(Object.assign({}, defaultOptions), cfg));
    return new Formatter(createDialect(dialect), options).format(query);
  };

  // src/webview/console.ts
  var api = acquireVsCodeApi();
  var editor = byId("editor");
  var highlightCode = byId("highlightCode");
  var runButton = byId("run");
  var formatButton = byId("format");
  var syntaxHint = byId("syntaxHint");
  var status = byId("status");
  var resultTable = byId("result");
  var resultTabs = byId("resultTabs");
  var resultFooter = byId("resultFooter");
  var acList = byId("autocomplete");
  var historyToggle = byId("historyToggle");
  var historyPanel = byId("historyPanel");
  var historyClose = byId("historyClose");
  var historyList = byId("historyList");
  var historyEmpty = byId("historyEmpty");
  var historyCount = byId("historyCount");
  var historyFilter = byId("historyFilter");
  var editBar = byId("editBar");
  var editCount = byId("editCount");
  var editSqlToggle = byId("editSqlToggle");
  var editSql = byId("editSql");
  var editRevert = byId("editRevert");
  var editCommit = byId("editCommit");
  var historyExportCsv = byId("historyExportCsv");
  var historyExportMd = byId("historyExportMd");
  var historyClear = byId("historyClear");
  var historyEntries = [];
  var schemaSelect = byId("schema");
  var currentNamespace = "";
  var FORMATTER_DIALECTS = { mysql, postgres: postgresql, sqlite };
  var driverKind = "mysql";
  var KEYWORDS = [
    "SELECT",
    "FROM",
    "WHERE",
    "INSERT INTO",
    "UPDATE",
    "DELETE FROM",
    "SET",
    "VALUES",
    "INNER JOIN",
    "LEFT JOIN",
    "RIGHT JOIN",
    "JOIN",
    "ON",
    "GROUP BY",
    "ORDER BY",
    "HAVING",
    "LIMIT",
    "OFFSET",
    "AS",
    "AND",
    "OR",
    "NOT",
    "NULL",
    "IS NULL",
    "IS NOT NULL",
    "IN",
    "LIKE",
    "BETWEEN",
    "DISTINCT",
    "COUNT",
    "SUM",
    "AVG",
    "MIN",
    "MAX",
    "ASC",
    "DESC"
  ];
  var TABLE_KEYWORDS = /* @__PURE__ */ new Set(["FROM", "JOIN", "INTO", "UPDATE", "TABLE"]);
  var schema = [];
  var columnsByTable = /* @__PURE__ */ new Map();
  var suggestions = [];
  var activeIndex = 0;
  var tokenStart = 0;
  var saveTimer = 0;
  runButton.addEventListener("click", run);
  formatButton.addEventListener("click", formatEditor);
  historyToggle.addEventListener("click", toggleHistory);
  historyClose.addEventListener("click", () => setHistoryOpen(false));
  historyFilter.addEventListener("input", drawHistory);
  historyExportCsv.addEventListener("click", () => exportHistory("csv"));
  historyExportMd.addEventListener("click", () => exportHistory("markdown"));
  historyClear.addEventListener("click", () => api.postMessage({ type: "clearHistory" }));
  schemaSelect.addEventListener("change", () => {
    currentNamespace = schemaSelect.value;
    cachedColumns = null;
    api.postMessage({ type: "schemaChange", namespace: currentNamespace });
  });
  editor.addEventListener("input", () => {
    scheduleSave();
    updateAutocomplete();
  });
  editor.addEventListener("keydown", onEditorKeydown);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !historyPanel.hidden) {
      setHistoryOpen(false);
    }
  });
  editor.addEventListener("blur", () => window.setTimeout(closeAutocomplete, 120));
  editor.addEventListener("scroll", () => {
    closeAutocomplete();
    syncHighlightScroll();
  });
  window.addEventListener("message", (event) => {
    const message = event.data;
    if (message.type === "init") {
      editor.value = message.sql;
      driverKind = message.driver;
      highlightEditor();
      showSyntaxHint();
      populateSchemas(message.namespaces, message.namespace);
      return;
    }
    if (message.type === "selectSchema") {
      schemaSelect.value = message.namespace;
      currentNamespace = message.namespace;
      cachedColumns = null;
      api.postMessage({ type: "schemaChange", namespace: currentNamespace });
      return;
    }
    if (message.type === "schema") {
      schema = message.tables;
      columnsByTable = new Map(schema.map((table) => [table.name.toLowerCase(), table.columns]));
      cachedColumns = null;
      return;
    }
    if (message.type === "history") {
      renderHistory(message.items);
      return;
    }
    if (message.type === "results") {
      renderResults(message.results);
      return;
    }
    if (message.type === "updateResult") {
      onUpdateResult(message.count, message.error);
    }
  });
  api.postMessage({ type: "ready" });
  editRevert.addEventListener("click", revertEdits);
  editCommit.addEventListener("click", commitEdits);
  editSqlToggle.addEventListener("click", togglePendingSql);
  setupEditorResizer();
  function scheduleSave() {
    highlightEditor();
    showSyntaxHint();
    clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => api.postMessage({ type: "save", sql: editor.value }), 400);
  }
  function showSyntaxHint() {
    const warning = sqlSyntaxWarning(editor.value);
    syntaxHint.textContent = warning ? `\u26A0 ${warning}` : "";
    syntaxHint.hidden = warning === null;
  }
  function sqlSyntaxWarning(sql) {
    let depth = 0;
    let index = 0;
    while (index < sql.length) {
      const char = sql[index];
      if (char === "-" && sql[index + 1] === "-") {
        index = advancePast(sql, index, "\n");
        continue;
      }
      if (char === "/" && sql[index + 1] === "*") {
        const close = sql.indexOf("*/", index + 2);
        if (close === -1) {
          return "Unclosed /* comment */";
        }
        index = close + 2;
        continue;
      }
      if (char === "'" || char === '"' || char === "`") {
        const end = skipString(sql, index, char);
        if (end === -1) {
          return `Unterminated ${char === "`" ? "identifier" : "string"} (${char})`;
        }
        index = end;
        continue;
      }
      if (char === "(") {
        depth += 1;
      } else if (char === ")") {
        depth -= 1;
        if (depth < 0) {
          return "Unexpected )";
        }
      }
      index += 1;
    }
    if (depth > 0) {
      return `Missing ${depth} closing )`;
    }
    return null;
  }
  function advancePast(sql, from, needle) {
    const at = sql.indexOf(needle, from);
    return at === -1 ? sql.length : at + needle.length;
  }
  function skipString(sql, from, quote) {
    let index = from + 1;
    while (index < sql.length) {
      if (sql[index] === quote) {
        if (sql[index + 1] === quote) {
          index += 2;
          continue;
        }
        return index + 1;
      }
      index += 1;
    }
    return -1;
  }
  function onEditorKeydown(event) {
    if (!acList.hidden) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        moveActive(1);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        moveActive(-1);
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        acceptSuggestion(suggestions[activeIndex]);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        closeAutocomplete();
        return;
      }
    }
    if ((event.ctrlKey || event.metaKey) && (event.key === "z" || event.key === "Z" || event.key === "y" || event.key === "Y")) {
      window.setTimeout(collapseFullSelection, 0);
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      run();
    } else if (event.altKey && event.shiftKey && event.code === "KeyF") {
      event.preventDefault();
      event.stopPropagation();
      formatEditor();
    } else if (event.key === "Tab") {
      event.preventDefault();
      insertAtCursor("  ");
    }
  }
  function collapseFullSelection() {
    if (editor.selectionStart === 0 && editor.selectionEnd === editor.value.length && editor.value.length > 0) {
      editor.setSelectionRange(editor.value.length, editor.value.length);
    }
  }
  function formatEditor() {
    const options = {
      dialect: FORMATTER_DIALECTS[driverKind],
      tabWidth: 2,
      keywordCase: "upper",
      // Keep more on each line before wrapping, so the output is compact rather than one item per line.
      expressionWidth: 120
    };
    const { selectionStart: start, selectionEnd: end } = editor;
    const hasSelection = start !== end;
    let formatted;
    try {
      formatted = compactSql(formatDialect(hasSelection ? editor.value.slice(start, end) : editor.value, options));
    } catch {
      return;
    }
    editor.focus();
    if (hasSelection) {
      editor.setSelectionRange(start, end);
    } else {
      editor.select();
    }
    const inserted = document.execCommand("insertText", false, formatted);
    if (!inserted) {
      editor.value = hasSelection ? editor.value.slice(0, start) + formatted + editor.value.slice(end) : formatted;
    }
    const caret = hasSelection ? start + formatted.length : editor.value.length;
    editor.setSelectionRange(caret, caret);
    scheduleSave();
    closeAutocomplete();
  }
  function compactSql(sql) {
    const lines = sql.split("\n");
    const out = [];
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const next = lines[index + 1];
      const after = lines[index + 2];
      const isLoneKeyword = /^[A-Z][A-Z_ ]*$/.test(line.trim());
      const nextIsIndentedItem = next !== void 0 && /^\s+\S/.test(next);
      const nextIsSingleItem = nextIsIndentedItem && !next.trim().endsWith(",") && !(after !== void 0 && /^\s+\S/.test(after));
      if (isLoneKeyword && nextIsSingleItem) {
        out.push(`${line} ${next.trim()}`);
        index += 1;
      } else {
        out.push(line);
      }
    }
    return out.join("\n");
  }
  var HIGHLIGHT_KEYWORDS = /* @__PURE__ */ new Set([
    "SELECT",
    "FROM",
    "WHERE",
    "INSERT",
    "INTO",
    "UPDATE",
    "DELETE",
    "SET",
    "VALUES",
    "CREATE",
    "ALTER",
    "DROP",
    "TABLE",
    "VIEW",
    "INDEX",
    "DATABASE",
    "SCHEMA",
    "TRUNCATE",
    "REPLACE",
    "INNER",
    "LEFT",
    "RIGHT",
    "FULL",
    "OUTER",
    "CROSS",
    "JOIN",
    "ON",
    "USING",
    "GROUP",
    "BY",
    "ORDER",
    "HAVING",
    "LIMIT",
    "OFFSET",
    "AS",
    "AND",
    "OR",
    "NOT",
    "NULL",
    "IS",
    "IN",
    "LIKE",
    "BETWEEN",
    "DISTINCT",
    "UNION",
    "ALL",
    "EXISTS",
    "CASE",
    "WHEN",
    "THEN",
    "ELSE",
    "END",
    "ASC",
    "DESC",
    "PRIMARY",
    "KEY",
    "FOREIGN",
    "REFERENCES",
    "CONSTRAINT",
    "UNIQUE",
    "DEFAULT",
    "AUTO_INCREMENT",
    "ADD",
    "COLUMN",
    "MODIFY",
    "RENAME",
    "TO",
    "IF",
    "CASCADE",
    "RETURNING",
    "WITH",
    "INT",
    "INTEGER",
    "BIGINT",
    "VARCHAR",
    "TEXT",
    "BOOLEAN",
    "BOOL",
    "DATE",
    "DATETIME",
    "TIMESTAMP",
    "DECIMAL",
    "NUMERIC",
    "FLOAT",
    "DOUBLE",
    "JSON",
    "UUID",
    "SERIAL"
  ]);
  var TOKEN_RE = /(--[^\n]*|\/\*[\s\S]*?\*\/)|('(?:[^']|'')*'|"(?:[^"]|"")*"|`[^`]*`)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_]\w*)/g;
  function highlightEditor() {
    highlightCode.innerHTML = tokenizeSql(editor.value);
    syncHighlightScroll();
  }
  function syncHighlightScroll() {
    highlightCode.parentElement.scrollTop = editor.scrollTop;
    highlightCode.parentElement.scrollLeft = editor.scrollLeft;
  }
  function tokenizeSql(sql) {
    let html = "";
    let last2 = 0;
    for (let match = TOKEN_RE.exec(sql); match !== null; match = TOKEN_RE.exec(sql)) {
      html += escapeHtml(sql.slice(last2, match.index));
      const [text, comment, string2, number, word] = match;
      if (comment !== void 0) {
        html += `<span class="tok-comment">${escapeHtml(text)}</span>`;
      } else if (string2 !== void 0) {
        html += `<span class="tok-string">${escapeHtml(text)}</span>`;
      } else if (number !== void 0) {
        html += `<span class="tok-number">${escapeHtml(text)}</span>`;
      } else if (word !== void 0) {
        html += highlightWord(sql, word, match.index + text.length);
      }
      last2 = match.index + text.length;
    }
    html += escapeHtml(sql.slice(last2));
    return html.endsWith("\n") ? `${html} ` : html;
  }
  function highlightWord(sql, word, endIndex) {
    if (HIGHLIGHT_KEYWORDS.has(word.toUpperCase())) {
      return `<span class="tok-keyword">${escapeHtml(word)}</span>`;
    }
    if (sql[endIndex] === "(") {
      return `<span class="tok-function">${escapeHtml(word)}</span>`;
    }
    return escapeHtml(word);
  }
  function escapeHtml(text) {
    return text.replace(/[&<>]/g, (char) => char === "&" ? "&amp;" : char === "<" ? "&lt;" : "&gt;");
  }
  function updateAutocomplete() {
    const caret = editor.selectionStart;
    const before = editor.value.slice(0, caret);
    const match = /([A-Za-z_][\w]*\.)?([A-Za-z_]\w*)?$/.exec(before);
    const qualifier = match?.[1]?.slice(0, -1) ?? "";
    const partial = match?.[2] ?? "";
    tokenStart = caret - partial.length;
    if (qualifier) {
      suggestions = columnSuggestions(qualifier, partial);
    } else if (partial.length === 0) {
      closeAutocomplete();
      return;
    } else {
      suggestions = wordSuggestions(before, partial);
    }
    if (suggestions.length === 0) {
      closeAutocomplete();
      return;
    }
    activeIndex = 0;
    renderAutocomplete();
  }
  function columnSuggestions(qualifier, partial) {
    const table = resolveAlias(qualifier);
    const columns = columnsByTable.get(table.toLowerCase()) ?? [];
    return columns.filter((column) => column.toLowerCase().startsWith(partial.toLowerCase())).map((column) => ({ label: column, kind: "column" }));
  }
  function wordSuggestions(before, partial) {
    const lower = partial.toLowerCase();
    const previousWord = /(\w+)\s+$/.exec(before.slice(0, before.length - partial.length))?.[1]?.toUpperCase() ?? "";
    const preferTables = TABLE_KEYWORDS.has(previousWord);
    const tables = schema.filter((table) => table.name.toLowerCase().startsWith(lower)).map((table) => ({ label: table.name, kind: "table" }));
    const columns = uniqueColumns().filter((column) => column.toLowerCase().startsWith(lower)).map((column) => ({ label: column, kind: "column" }));
    const keywords4 = KEYWORDS.filter((keyword) => keyword.toLowerCase().startsWith(lower)).map((keyword) => ({ label: keyword, kind: "keyword" }));
    const ordered = preferTables ? [...tables, ...keywords4, ...columns] : [...keywords4, ...tables, ...columns];
    return ordered.slice(0, 50);
  }
  function resolveAlias(qualifier) {
    const pattern = new RegExp(`(?:from|join|update|into)\\s+([A-Za-z_]\\w*)\\s+(?:as\\s+)?${escapeRegExp2(qualifier)}\\b`, "i");
    return pattern.exec(editor.value)?.[1] ?? qualifier;
  }
  var cachedColumns = null;
  function uniqueColumns() {
    if (cachedColumns && cachedColumns.length > 0) {
      return cachedColumns;
    }
    const seen = /* @__PURE__ */ new Set();
    for (const table of schema) {
      for (const column of table.columns) {
        seen.add(column);
      }
    }
    cachedColumns = [...seen];
    return cachedColumns;
  }
  function renderAutocomplete() {
    acList.replaceChildren();
    suggestions.forEach((suggestion, index) => {
      const item = document.createElement("li");
      if (index === activeIndex) {
        item.classList.add("active");
      }
      const label = document.createElement("span");
      label.textContent = suggestion.label;
      const kind = document.createElement("span");
      kind.className = "kind";
      kind.textContent = suggestion.kind;
      item.append(label, kind);
      item.addEventListener("mousedown", (event) => {
        event.preventDefault();
        acceptSuggestion(suggestion);
      });
      acList.appendChild(item);
    });
    positionAutocomplete();
    acList.hidden = false;
  }
  function moveActive(delta) {
    activeIndex = (activeIndex + delta + suggestions.length) % suggestions.length;
    const items = acList.children;
    for (let index = 0; index < items.length; index += 1) {
      items[index].classList.toggle("active", index === activeIndex);
    }
    items[activeIndex]?.scrollIntoView({ block: "nearest" });
  }
  function acceptSuggestion(suggestion) {
    if (!suggestion) {
      return;
    }
    const caret = editor.selectionStart;
    const value = editor.value;
    editor.value = value.slice(0, tokenStart) + suggestion.label + value.slice(caret);
    const nextCaret = tokenStart + suggestion.label.length;
    editor.selectionStart = editor.selectionEnd = nextCaret;
    closeAutocomplete();
    editor.focus();
    scheduleSave();
  }
  function closeAutocomplete() {
    acList.hidden = true;
    suggestions = [];
  }
  function positionAutocomplete() {
    const coords = caretCoordinates(editor, tokenStart);
    acList.style.left = `${coords.left}px`;
    acList.style.top = `${coords.top + coords.height}px`;
  }
  var MIRROR_PROPS = [
    "boxSizing",
    "width",
    "paddingTop",
    "paddingRight",
    "paddingBottom",
    "paddingLeft",
    "borderTopWidth",
    "borderRightWidth",
    "borderBottomWidth",
    "borderLeftWidth",
    "fontFamily",
    "fontSize",
    "fontWeight",
    "lineHeight",
    "letterSpacing",
    "whiteSpace"
  ];
  function caretCoordinates(field, position) {
    const mirror = document.createElement("div");
    const style = getComputedStyle(field);
    for (const prop of MIRROR_PROPS) {
      mirror.style[prop] = style[prop];
    }
    mirror.style.position = "absolute";
    mirror.style.visibility = "hidden";
    mirror.style.whiteSpace = "pre-wrap";
    mirror.style.overflowWrap = "break-word";
    mirror.textContent = field.value.slice(0, position);
    const marker = document.createElement("span");
    marker.textContent = field.value.slice(position) || ".";
    mirror.appendChild(marker);
    field.parentElement.appendChild(mirror);
    const left = marker.offsetLeft - field.scrollLeft;
    const top = marker.offsetTop - field.scrollTop;
    const height = parseFloat(style.lineHeight) || marker.offsetHeight;
    field.parentElement.removeChild(mirror);
    return { left, top, height };
  }
  function escapeRegExp2(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  function toggleHistory() {
    setHistoryOpen(historyPanel.hidden);
  }
  function setHistoryOpen(open) {
    historyPanel.hidden = !open;
    historyToggle.setAttribute("aria-pressed", String(open));
    historyToggle.classList.toggle("active", open);
  }
  function renderHistory(items) {
    historyEntries = items;
    drawHistory();
  }
  function drawHistory() {
    const entries = filteredHistory();
    historyList.replaceChildren();
    historyEmpty.hidden = historyEntries.length > 0;
    const total = historyEntries.length;
    const isFiltered = entries.length !== total;
    historyCount.textContent = total === 0 ? "" : isFiltered ? `(${entries.length} / ${total})` : `(${total})`;
    for (const entry of entries) {
      historyList.appendChild(buildHistoryItem(entry));
    }
  }
  function filteredHistory() {
    const needle = historyFilter.value.trim().toLowerCase();
    if (needle === "") {
      return historyEntries;
    }
    return historyEntries.filter((entry) => entry.sql.toLowerCase().includes(needle));
  }
  function buildHistoryItem(entry) {
    const item = document.createElement("li");
    item.title = entry.sql;
    item.addEventListener("click", () => applyHistory(entry.sql));
    const sql = document.createElement("div");
    sql.className = "history-sql";
    sql.textContent = entry.sql;
    const meta = document.createElement("div");
    meta.className = "history-meta";
    const when = document.createElement("span");
    when.textContent = formatTime(entry.at);
    const rows = document.createElement("span");
    rows.className = "history-rows";
    rows.textContent = formatRows(entry);
    meta.append(when, rows);
    item.append(sql, meta);
    return item;
  }
  function formatTime(at) {
    if (!at) {
      return "\u2014";
    }
    return new Date(at).toLocaleString();
  }
  function formatRows(entry) {
    if (entry.affectedRows !== void 0) {
      return `${entry.affectedRows} affected`;
    }
    if (entry.rowCount !== void 0) {
      return `${entry.rowCount} returned`;
    }
    return "";
  }
  function exportHistory(format2) {
    const entries = filteredHistory();
    if (entries.length === 0) {
      return;
    }
    const content = format2 === "csv" ? toHistoryCsv(entries) : toHistoryMarkdown(entries);
    api.postMessage({ type: "exportHistory", format: format2, content, count: entries.length });
  }
  function toHistoryCsv(entries) {
    const header = ["executed_at", "sql", "rows_returned", "rows_affected"];
    const lines = entries.map(
      (entry) => [
        formatTime(entry.at),
        entry.sql,
        entry.rowCount ?? "",
        entry.affectedRows ?? ""
      ].map(csvCell).join(",")
    );
    return [header.join(","), ...lines].join("\n");
  }
  function csvCell(value) {
    const text = String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }
  function toHistoryMarkdown(entries) {
    const header = "| Executed at | Query | Returned | Affected |\n| --- | --- | --- | --- |";
    const rows = entries.map((entry) => {
      const sql = entry.sql.replace(/\s*\n\s*/g, " ").replace(/\|/g, "\\|");
      return `| ${formatTime(entry.at)} | \`${sql}\` | ${entry.rowCount ?? ""} | ${entry.affectedRows ?? ""} |`;
    });
    return [header, ...rows].join("\n");
  }
  function applyHistory(sql) {
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    editor.value = editor.value.slice(0, start) + sql + editor.value.slice(end);
    editor.selectionStart = editor.selectionEnd = start + sql.length;
    editor.focus();
    scheduleSave();
  }
  function run() {
    const selection = editor.value.slice(editor.selectionStart, editor.selectionEnd);
    const sql = selection.trim() !== "" ? selection : editor.value;
    if (sql.trim() === "") {
      return;
    }
    closeAutocomplete();
    status.textContent = "Running\u2026";
    api.postMessage({ type: "run", sql, namespace: currentNamespace });
  }
  function populateSchemas(namespaces, selected) {
    schemaSelect.replaceChildren(...namespaces.map((name) => new Option(name, name)));
    schemaSelect.value = selected;
    currentNamespace = selected;
  }
  var tabs = [];
  var activeTab = 0;
  var pendingEdits = /* @__PURE__ */ new Map();
  var MIN_EDITOR_HEIGHT = 90;
  function setupEditorResizer() {
    const resizer = byId("editorResizer");
    resizer.addEventListener("mousedown", (event) => {
      event.preventDefault();
      const startY = event.clientY;
      const startHeight = editor.offsetHeight;
      document.body.classList.add("resizing-editor");
      const onMove = (moveEvent) => {
        editor.style.height = `${Math.max(MIN_EDITOR_HEIGHT, startHeight + moveEvent.clientY - startY)}px`;
      };
      const onUp = () => {
        document.body.classList.remove("resizing-editor");
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });
  }
  function setResultFooter(text) {
    resultFooter.textContent = text;
    resultFooter.hidden = text === "";
  }
  function renderResults(results) {
    pendingEdits.clear();
    refreshEditBar();
    status.textContent = "";
    tabs = results.length > 0 ? results : [{ label: "", columns: [], rows: [] }];
    activeTab = 0;
    renderTabBar();
    renderActiveResult();
  }
  function renderTabBar() {
    resultTabs.replaceChildren();
    resultTabs.hidden = tabs.length <= 1;
    if (tabs.length <= 1) {
      return;
    }
    tabs.forEach((tab, index) => {
      const button = document.createElement("button");
      button.className = "result-tab";
      button.classList.toggle("active", index === activeTab);
      button.classList.toggle("error", !!tab.error);
      button.textContent = `${index + 1}. ${tab.error ? "\u26A0 " : ""}${tab.label}`;
      button.title = tab.label;
      button.addEventListener("click", () => {
        activeTab = index;
        renderTabBar();
        renderActiveResult();
      });
      resultTabs.appendChild(button);
    });
  }
  function renderActiveResult() {
    const tab = tabs[activeTab];
    resultTable.classList.remove("error-view");
    resultTable.textContent = "";
    if (tab.error) {
      setResultFooter("");
      resultTable.classList.add("error-view");
      resultTable.textContent = tab.error;
      return;
    }
    if (tab.columns.length === 0) {
      setResultFooter(`Query OK \xB7 ${tab.affectedRows ?? 0} row(s) affected`);
      resultTable.replaceChildren();
      return;
    }
    setResultFooter(`${tab.rows.length} row(s)`);
    const meta = tab.columnsMeta ?? [];
    const head = document.createElement("thead");
    const headRow = document.createElement("tr");
    tab.columns.forEach((column, index) => {
      const th = document.createElement("th");
      th.textContent = column;
      if (meta[index]?.editable) {
        th.classList.add("editable");
        th.title = "Editable \u2014 double-click a cell";
      }
      headRow.appendChild(th);
    });
    head.appendChild(headRow);
    const bodyEl = document.createElement("tbody");
    tab.rows.forEach((row, rowIndex) => {
      const tr = document.createElement("tr");
      row.forEach((cell, colIndex) => {
        tr.appendChild(buildResultCell(rowIndex, colIndex, cell));
      });
      bodyEl.appendChild(tr);
    });
    resultTable.replaceChildren(head, bodyEl);
  }
  function buildResultCell(rowIndex, colIndex, baseValue) {
    const td = document.createElement("td");
    const key = editKey(rowIndex, colIndex);
    const edited = pendingEdits.has(key);
    paintResultCell(td, edited ? pendingEdits.get(key) : baseValue);
    td.classList.toggle("dirty", edited);
    if (tabs[activeTab].columnsMeta?.[colIndex]?.editable) {
      td.classList.add("editable");
      td.addEventListener("dblclick", () => beginCellEdit(td, rowIndex, colIndex));
    }
    return td;
  }
  function editKey(rowIndex, colIndex) {
    return `${activeTab}:${rowIndex}:${colIndex}`;
  }
  function parseEditKey(key) {
    const [tabIndex, rowIndex, colIndex] = key.split(":").map(Number);
    return { tabIndex, rowIndex, colIndex };
  }
  function paintResultCell(td, value) {
    td.classList.toggle("null", value === null);
    td.textContent = value === null ? "NULL" : value;
  }
  function beginCellEdit(td, rowIndex, colIndex) {
    if (td.querySelector("input")) {
      return;
    }
    const key = editKey(rowIndex, colIndex);
    const base = tabs[activeTab].rows[rowIndex][colIndex];
    const current = pendingEdits.has(key) ? pendingEdits.get(key) : base;
    const input = document.createElement("input");
    input.className = "cell-edit";
    input.value = current ?? "";
    const finish = (commit) => {
      if (commit) {
        setCellEdit(td, rowIndex, colIndex, input.value);
      } else {
        td.classList.toggle("dirty", pendingEdits.has(key));
        paintResultCell(td, pendingEdits.has(key) ? pendingEdits.get(key) : base);
      }
    };
    const onBlur = () => finish(true);
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        input.blur();
      } else if (event.key === "Escape") {
        event.preventDefault();
        input.removeEventListener("blur", onBlur);
        finish(false);
      }
    });
    input.addEventListener("blur", onBlur);
    td.replaceChildren(input);
    input.focus();
    input.select();
  }
  function setCellEdit(td, rowIndex, colIndex, value) {
    const key = editKey(rowIndex, colIndex);
    const original = tabs[activeTab].rows[rowIndex][colIndex];
    if (value === (original ?? "")) {
      pendingEdits.delete(key);
      td.classList.remove("dirty");
      paintResultCell(td, original);
    } else {
      pendingEdits.set(key, value);
      td.classList.add("dirty");
      paintResultCell(td, value);
    }
    refreshEditBar();
  }
  function refreshEditBar() {
    const count = pendingEdits.size;
    editBar.hidden = count === 0;
    editCount.textContent = `${count} pending change${count === 1 ? "" : "s"}`;
    if (count === 0) {
      editSql.hidden = true;
      editSqlToggle.setAttribute("aria-pressed", "false");
    }
    renderPendingSql();
  }
  function togglePendingSql() {
    const willShow = editSql.hidden;
    editSql.hidden = !willShow;
    editSqlToggle.setAttribute("aria-pressed", String(willShow));
    editSqlToggle.textContent = willShow ? "Hide SQL" : "Show SQL";
    renderPendingSql();
  }
  function renderPendingSql() {
    if (editSql.hidden) {
      return;
    }
    editSql.textContent = buildEditPayload().map(pendingEditToSql).join("\n");
  }
  function pendingEditToSql(edit) {
    const where = edit.pk.map((part) => `${part.column} = ${sqlLiteral(part.value)}`).join(" AND ");
    return `UPDATE ${edit.table} SET ${edit.column} = ${sqlLiteral(edit.value)} WHERE ${where};`;
  }
  function sqlLiteral(value) {
    return value === null ? "NULL" : `'${value.replace(/'/g, "''")}'`;
  }
  function revertEdits() {
    pendingEdits.clear();
    refreshEditBar();
    renderActiveResult();
  }
  function commitEdits() {
    const edits = buildEditPayload();
    if (edits.length === 0) {
      return;
    }
    editCommit.disabled = true;
    api.postMessage({ type: "updateCells", namespace: currentNamespace, edits });
  }
  function buildEditPayload() {
    const edits = [];
    for (const [key, value] of pendingEdits) {
      const { tabIndex, rowIndex, colIndex } = parseEditKey(key);
      const tab = tabs[tabIndex];
      const meta = tab?.columnsMeta?.[colIndex];
      if (!meta?.editable || !meta.sourceTable || !meta.sourceColumn) {
        continue;
      }
      const table = tab.editableTables?.find((entry) => entry.table === meta.sourceTable);
      if (!table) {
        continue;
      }
      const pk = table.pkColumns.map((column, index) => ({
        column,
        value: tab.rows[rowIndex][table.pkIndexes[index]]
      }));
      edits.push({ table: meta.sourceTable, column: meta.sourceColumn, value, pk });
    }
    return edits;
  }
  function onUpdateResult(count, error) {
    editCommit.disabled = false;
    if (error) {
      status.textContent = `Update failed: ${error}`;
      return;
    }
    for (const [key, value] of pendingEdits) {
      const { tabIndex, rowIndex, colIndex } = parseEditKey(key);
      if (tabs[tabIndex]) {
        tabs[tabIndex].rows[rowIndex][colIndex] = value;
      }
    }
    pendingEdits.clear();
    refreshEditBar();
    renderActiveResult();
    status.textContent = `${count} cell${count === 1 ? "" : "s"} updated`;
  }
  function insertAtCursor(text) {
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    editor.value = editor.value.slice(0, start) + text + editor.value.slice(end);
    editor.selectionStart = editor.selectionEnd = start + text.length;
    api.postMessage({ type: "save", sql: editor.value });
  }
  function byId(id2) {
    const found = document.getElementById(id2);
    if (!found) {
      throw new Error(`Missing element #${id2}`);
    }
    return found;
  }
})();
//# sourceMappingURL=console.js.map
