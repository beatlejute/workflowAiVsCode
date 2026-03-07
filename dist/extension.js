"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
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
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// node_modules/ajv/dist/compile/codegen/code.js
var require_code = __commonJS({
  "node_modules/ajv/dist/compile/codegen/code.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.regexpCode = exports2.getEsmExportName = exports2.getProperty = exports2.safeStringify = exports2.stringify = exports2.strConcat = exports2.addCodeArg = exports2.str = exports2._ = exports2.nil = exports2._Code = exports2.Name = exports2.IDENTIFIER = exports2._CodeOrName = void 0;
    var _CodeOrName = class {
    };
    exports2._CodeOrName = _CodeOrName;
    exports2.IDENTIFIER = /^[a-z$_][a-z$_0-9]*$/i;
    var Name = class extends _CodeOrName {
      constructor(s) {
        super();
        if (!exports2.IDENTIFIER.test(s))
          throw new Error("CodeGen: name must be a valid identifier");
        this.str = s;
      }
      toString() {
        return this.str;
      }
      emptyStr() {
        return false;
      }
      get names() {
        return { [this.str]: 1 };
      }
    };
    exports2.Name = Name;
    var _Code = class extends _CodeOrName {
      constructor(code) {
        super();
        this._items = typeof code === "string" ? [code] : code;
      }
      toString() {
        return this.str;
      }
      emptyStr() {
        if (this._items.length > 1)
          return false;
        const item = this._items[0];
        return item === "" || item === '""';
      }
      get str() {
        var _a;
        return (_a = this._str) !== null && _a !== void 0 ? _a : this._str = this._items.reduce((s, c) => `${s}${c}`, "");
      }
      get names() {
        var _a;
        return (_a = this._names) !== null && _a !== void 0 ? _a : this._names = this._items.reduce((names, c) => {
          if (c instanceof Name)
            names[c.str] = (names[c.str] || 0) + 1;
          return names;
        }, {});
      }
    };
    exports2._Code = _Code;
    exports2.nil = new _Code("");
    function _(strs, ...args) {
      const code = [strs[0]];
      let i = 0;
      while (i < args.length) {
        addCodeArg(code, args[i]);
        code.push(strs[++i]);
      }
      return new _Code(code);
    }
    exports2._ = _;
    var plus = new _Code("+");
    function str2(strs, ...args) {
      const expr = [safeStringify(strs[0])];
      let i = 0;
      while (i < args.length) {
        expr.push(plus);
        addCodeArg(expr, args[i]);
        expr.push(plus, safeStringify(strs[++i]));
      }
      optimize(expr);
      return new _Code(expr);
    }
    exports2.str = str2;
    function addCodeArg(code, arg) {
      if (arg instanceof _Code)
        code.push(...arg._items);
      else if (arg instanceof Name)
        code.push(arg);
      else
        code.push(interpolate(arg));
    }
    exports2.addCodeArg = addCodeArg;
    function optimize(expr) {
      let i = 1;
      while (i < expr.length - 1) {
        if (expr[i] === plus) {
          const res = mergeExprItems(expr[i - 1], expr[i + 1]);
          if (res !== void 0) {
            expr.splice(i - 1, 3, res);
            continue;
          }
          expr[i++] = "+";
        }
        i++;
      }
    }
    function mergeExprItems(a, b) {
      if (b === '""')
        return a;
      if (a === '""')
        return b;
      if (typeof a == "string") {
        if (b instanceof Name || a[a.length - 1] !== '"')
          return;
        if (typeof b != "string")
          return `${a.slice(0, -1)}${b}"`;
        if (b[0] === '"')
          return a.slice(0, -1) + b.slice(1);
        return;
      }
      if (typeof b == "string" && b[0] === '"' && !(a instanceof Name))
        return `"${a}${b.slice(1)}`;
      return;
    }
    function strConcat(c1, c2) {
      return c2.emptyStr() ? c1 : c1.emptyStr() ? c2 : str2`${c1}${c2}`;
    }
    exports2.strConcat = strConcat;
    function interpolate(x) {
      return typeof x == "number" || typeof x == "boolean" || x === null ? x : safeStringify(Array.isArray(x) ? x.join(",") : x);
    }
    function stringify(x) {
      return new _Code(safeStringify(x));
    }
    exports2.stringify = stringify;
    function safeStringify(x) {
      return JSON.stringify(x).replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
    }
    exports2.safeStringify = safeStringify;
    function getProperty(key) {
      return typeof key == "string" && exports2.IDENTIFIER.test(key) ? new _Code(`.${key}`) : _`[${key}]`;
    }
    exports2.getProperty = getProperty;
    function getEsmExportName(key) {
      if (typeof key == "string" && exports2.IDENTIFIER.test(key)) {
        return new _Code(`${key}`);
      }
      throw new Error(`CodeGen: invalid export name: ${key}, use explicit $id name mapping`);
    }
    exports2.getEsmExportName = getEsmExportName;
    function regexpCode(rx) {
      return new _Code(rx.toString());
    }
    exports2.regexpCode = regexpCode;
  }
});

// node_modules/ajv/dist/compile/codegen/scope.js
var require_scope = __commonJS({
  "node_modules/ajv/dist/compile/codegen/scope.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.ValueScope = exports2.ValueScopeName = exports2.Scope = exports2.varKinds = exports2.UsedValueState = void 0;
    var code_1 = require_code();
    var ValueError = class extends Error {
      constructor(name) {
        super(`CodeGen: "code" for ${name} not defined`);
        this.value = name.value;
      }
    };
    var UsedValueState;
    (function(UsedValueState2) {
      UsedValueState2[UsedValueState2["Started"] = 0] = "Started";
      UsedValueState2[UsedValueState2["Completed"] = 1] = "Completed";
    })(UsedValueState || (exports2.UsedValueState = UsedValueState = {}));
    exports2.varKinds = {
      const: new code_1.Name("const"),
      let: new code_1.Name("let"),
      var: new code_1.Name("var")
    };
    var Scope = class {
      constructor({ prefixes, parent } = {}) {
        this._names = {};
        this._prefixes = prefixes;
        this._parent = parent;
      }
      toName(nameOrPrefix) {
        return nameOrPrefix instanceof code_1.Name ? nameOrPrefix : this.name(nameOrPrefix);
      }
      name(prefix) {
        return new code_1.Name(this._newName(prefix));
      }
      _newName(prefix) {
        const ng = this._names[prefix] || this._nameGroup(prefix);
        return `${prefix}${ng.index++}`;
      }
      _nameGroup(prefix) {
        var _a, _b;
        if (((_b = (_a = this._parent) === null || _a === void 0 ? void 0 : _a._prefixes) === null || _b === void 0 ? void 0 : _b.has(prefix)) || this._prefixes && !this._prefixes.has(prefix)) {
          throw new Error(`CodeGen: prefix "${prefix}" is not allowed in this scope`);
        }
        return this._names[prefix] = { prefix, index: 0 };
      }
    };
    exports2.Scope = Scope;
    var ValueScopeName = class extends code_1.Name {
      constructor(prefix, nameStr) {
        super(nameStr);
        this.prefix = prefix;
      }
      setValue(value, { property, itemIndex }) {
        this.value = value;
        this.scopePath = (0, code_1._)`.${new code_1.Name(property)}[${itemIndex}]`;
      }
    };
    exports2.ValueScopeName = ValueScopeName;
    var line = (0, code_1._)`\n`;
    var ValueScope = class extends Scope {
      constructor(opts) {
        super(opts);
        this._values = {};
        this._scope = opts.scope;
        this.opts = { ...opts, _n: opts.lines ? line : code_1.nil };
      }
      get() {
        return this._scope;
      }
      name(prefix) {
        return new ValueScopeName(prefix, this._newName(prefix));
      }
      value(nameOrPrefix, value) {
        var _a;
        if (value.ref === void 0)
          throw new Error("CodeGen: ref must be passed in value");
        const name = this.toName(nameOrPrefix);
        const { prefix } = name;
        const valueKey = (_a = value.key) !== null && _a !== void 0 ? _a : value.ref;
        let vs = this._values[prefix];
        if (vs) {
          const _name = vs.get(valueKey);
          if (_name)
            return _name;
        } else {
          vs = this._values[prefix] = /* @__PURE__ */ new Map();
        }
        vs.set(valueKey, name);
        const s = this._scope[prefix] || (this._scope[prefix] = []);
        const itemIndex = s.length;
        s[itemIndex] = value.ref;
        name.setValue(value, { property: prefix, itemIndex });
        return name;
      }
      getValue(prefix, keyOrRef) {
        const vs = this._values[prefix];
        if (!vs)
          return;
        return vs.get(keyOrRef);
      }
      scopeRefs(scopeName, values = this._values) {
        return this._reduceValues(values, (name) => {
          if (name.scopePath === void 0)
            throw new Error(`CodeGen: name "${name}" has no value`);
          return (0, code_1._)`${scopeName}${name.scopePath}`;
        });
      }
      scopeCode(values = this._values, usedValues, getCode) {
        return this._reduceValues(values, (name) => {
          if (name.value === void 0)
            throw new Error(`CodeGen: name "${name}" has no value`);
          return name.value.code;
        }, usedValues, getCode);
      }
      _reduceValues(values, valueCode, usedValues = {}, getCode) {
        let code = code_1.nil;
        for (const prefix in values) {
          const vs = values[prefix];
          if (!vs)
            continue;
          const nameSet = usedValues[prefix] = usedValues[prefix] || /* @__PURE__ */ new Map();
          vs.forEach((name) => {
            if (nameSet.has(name))
              return;
            nameSet.set(name, UsedValueState.Started);
            let c = valueCode(name);
            if (c) {
              const def = this.opts.es5 ? exports2.varKinds.var : exports2.varKinds.const;
              code = (0, code_1._)`${code}${def} ${name} = ${c};${this.opts._n}`;
            } else if (c = getCode === null || getCode === void 0 ? void 0 : getCode(name)) {
              code = (0, code_1._)`${code}${c}${this.opts._n}`;
            } else {
              throw new ValueError(name);
            }
            nameSet.set(name, UsedValueState.Completed);
          });
        }
        return code;
      }
    };
    exports2.ValueScope = ValueScope;
  }
});

// node_modules/ajv/dist/compile/codegen/index.js
var require_codegen = __commonJS({
  "node_modules/ajv/dist/compile/codegen/index.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.or = exports2.and = exports2.not = exports2.CodeGen = exports2.operators = exports2.varKinds = exports2.ValueScopeName = exports2.ValueScope = exports2.Scope = exports2.Name = exports2.regexpCode = exports2.stringify = exports2.getProperty = exports2.nil = exports2.strConcat = exports2.str = exports2._ = void 0;
    var code_1 = require_code();
    var scope_1 = require_scope();
    var code_2 = require_code();
    Object.defineProperty(exports2, "_", { enumerable: true, get: function() {
      return code_2._;
    } });
    Object.defineProperty(exports2, "str", { enumerable: true, get: function() {
      return code_2.str;
    } });
    Object.defineProperty(exports2, "strConcat", { enumerable: true, get: function() {
      return code_2.strConcat;
    } });
    Object.defineProperty(exports2, "nil", { enumerable: true, get: function() {
      return code_2.nil;
    } });
    Object.defineProperty(exports2, "getProperty", { enumerable: true, get: function() {
      return code_2.getProperty;
    } });
    Object.defineProperty(exports2, "stringify", { enumerable: true, get: function() {
      return code_2.stringify;
    } });
    Object.defineProperty(exports2, "regexpCode", { enumerable: true, get: function() {
      return code_2.regexpCode;
    } });
    Object.defineProperty(exports2, "Name", { enumerable: true, get: function() {
      return code_2.Name;
    } });
    var scope_2 = require_scope();
    Object.defineProperty(exports2, "Scope", { enumerable: true, get: function() {
      return scope_2.Scope;
    } });
    Object.defineProperty(exports2, "ValueScope", { enumerable: true, get: function() {
      return scope_2.ValueScope;
    } });
    Object.defineProperty(exports2, "ValueScopeName", { enumerable: true, get: function() {
      return scope_2.ValueScopeName;
    } });
    Object.defineProperty(exports2, "varKinds", { enumerable: true, get: function() {
      return scope_2.varKinds;
    } });
    exports2.operators = {
      GT: new code_1._Code(">"),
      GTE: new code_1._Code(">="),
      LT: new code_1._Code("<"),
      LTE: new code_1._Code("<="),
      EQ: new code_1._Code("==="),
      NEQ: new code_1._Code("!=="),
      NOT: new code_1._Code("!"),
      OR: new code_1._Code("||"),
      AND: new code_1._Code("&&"),
      ADD: new code_1._Code("+")
    };
    var Node = class {
      optimizeNodes() {
        return this;
      }
      optimizeNames(_names, _constants) {
        return this;
      }
    };
    var Def = class extends Node {
      constructor(varKind, name, rhs) {
        super();
        this.varKind = varKind;
        this.name = name;
        this.rhs = rhs;
      }
      render({ es5, _n }) {
        const varKind = es5 ? scope_1.varKinds.var : this.varKind;
        const rhs = this.rhs === void 0 ? "" : ` = ${this.rhs}`;
        return `${varKind} ${this.name}${rhs};` + _n;
      }
      optimizeNames(names, constants) {
        if (!names[this.name.str])
          return;
        if (this.rhs)
          this.rhs = optimizeExpr(this.rhs, names, constants);
        return this;
      }
      get names() {
        return this.rhs instanceof code_1._CodeOrName ? this.rhs.names : {};
      }
    };
    var Assign = class extends Node {
      constructor(lhs, rhs, sideEffects) {
        super();
        this.lhs = lhs;
        this.rhs = rhs;
        this.sideEffects = sideEffects;
      }
      render({ _n }) {
        return `${this.lhs} = ${this.rhs};` + _n;
      }
      optimizeNames(names, constants) {
        if (this.lhs instanceof code_1.Name && !names[this.lhs.str] && !this.sideEffects)
          return;
        this.rhs = optimizeExpr(this.rhs, names, constants);
        return this;
      }
      get names() {
        const names = this.lhs instanceof code_1.Name ? {} : { ...this.lhs.names };
        return addExprNames(names, this.rhs);
      }
    };
    var AssignOp = class extends Assign {
      constructor(lhs, op, rhs, sideEffects) {
        super(lhs, rhs, sideEffects);
        this.op = op;
      }
      render({ _n }) {
        return `${this.lhs} ${this.op}= ${this.rhs};` + _n;
      }
    };
    var Label = class extends Node {
      constructor(label) {
        super();
        this.label = label;
        this.names = {};
      }
      render({ _n }) {
        return `${this.label}:` + _n;
      }
    };
    var Break = class extends Node {
      constructor(label) {
        super();
        this.label = label;
        this.names = {};
      }
      render({ _n }) {
        const label = this.label ? ` ${this.label}` : "";
        return `break${label};` + _n;
      }
    };
    var Throw = class extends Node {
      constructor(error) {
        super();
        this.error = error;
      }
      render({ _n }) {
        return `throw ${this.error};` + _n;
      }
      get names() {
        return this.error.names;
      }
    };
    var AnyCode = class extends Node {
      constructor(code) {
        super();
        this.code = code;
      }
      render({ _n }) {
        return `${this.code};` + _n;
      }
      optimizeNodes() {
        return `${this.code}` ? this : void 0;
      }
      optimizeNames(names, constants) {
        this.code = optimizeExpr(this.code, names, constants);
        return this;
      }
      get names() {
        return this.code instanceof code_1._CodeOrName ? this.code.names : {};
      }
    };
    var ParentNode = class extends Node {
      constructor(nodes = []) {
        super();
        this.nodes = nodes;
      }
      render(opts) {
        return this.nodes.reduce((code, n) => code + n.render(opts), "");
      }
      optimizeNodes() {
        const { nodes } = this;
        let i = nodes.length;
        while (i--) {
          const n = nodes[i].optimizeNodes();
          if (Array.isArray(n))
            nodes.splice(i, 1, ...n);
          else if (n)
            nodes[i] = n;
          else
            nodes.splice(i, 1);
        }
        return nodes.length > 0 ? this : void 0;
      }
      optimizeNames(names, constants) {
        const { nodes } = this;
        let i = nodes.length;
        while (i--) {
          const n = nodes[i];
          if (n.optimizeNames(names, constants))
            continue;
          subtractNames(names, n.names);
          nodes.splice(i, 1);
        }
        return nodes.length > 0 ? this : void 0;
      }
      get names() {
        return this.nodes.reduce((names, n) => addNames(names, n.names), {});
      }
    };
    var BlockNode = class extends ParentNode {
      render(opts) {
        return "{" + opts._n + super.render(opts) + "}" + opts._n;
      }
    };
    var Root = class extends ParentNode {
    };
    var Else = class extends BlockNode {
    };
    Else.kind = "else";
    var If = class _If extends BlockNode {
      constructor(condition, nodes) {
        super(nodes);
        this.condition = condition;
      }
      render(opts) {
        let code = `if(${this.condition})` + super.render(opts);
        if (this.else)
          code += "else " + this.else.render(opts);
        return code;
      }
      optimizeNodes() {
        super.optimizeNodes();
        const cond = this.condition;
        if (cond === true)
          return this.nodes;
        let e = this.else;
        if (e) {
          const ns = e.optimizeNodes();
          e = this.else = Array.isArray(ns) ? new Else(ns) : ns;
        }
        if (e) {
          if (cond === false)
            return e instanceof _If ? e : e.nodes;
          if (this.nodes.length)
            return this;
          return new _If(not(cond), e instanceof _If ? [e] : e.nodes);
        }
        if (cond === false || !this.nodes.length)
          return void 0;
        return this;
      }
      optimizeNames(names, constants) {
        var _a;
        this.else = (_a = this.else) === null || _a === void 0 ? void 0 : _a.optimizeNames(names, constants);
        if (!(super.optimizeNames(names, constants) || this.else))
          return;
        this.condition = optimizeExpr(this.condition, names, constants);
        return this;
      }
      get names() {
        const names = super.names;
        addExprNames(names, this.condition);
        if (this.else)
          addNames(names, this.else.names);
        return names;
      }
    };
    If.kind = "if";
    var For = class extends BlockNode {
    };
    For.kind = "for";
    var ForLoop = class extends For {
      constructor(iteration) {
        super();
        this.iteration = iteration;
      }
      render(opts) {
        return `for(${this.iteration})` + super.render(opts);
      }
      optimizeNames(names, constants) {
        if (!super.optimizeNames(names, constants))
          return;
        this.iteration = optimizeExpr(this.iteration, names, constants);
        return this;
      }
      get names() {
        return addNames(super.names, this.iteration.names);
      }
    };
    var ForRange = class extends For {
      constructor(varKind, name, from, to) {
        super();
        this.varKind = varKind;
        this.name = name;
        this.from = from;
        this.to = to;
      }
      render(opts) {
        const varKind = opts.es5 ? scope_1.varKinds.var : this.varKind;
        const { name, from, to } = this;
        return `for(${varKind} ${name}=${from}; ${name}<${to}; ${name}++)` + super.render(opts);
      }
      get names() {
        const names = addExprNames(super.names, this.from);
        return addExprNames(names, this.to);
      }
    };
    var ForIter = class extends For {
      constructor(loop, varKind, name, iterable) {
        super();
        this.loop = loop;
        this.varKind = varKind;
        this.name = name;
        this.iterable = iterable;
      }
      render(opts) {
        return `for(${this.varKind} ${this.name} ${this.loop} ${this.iterable})` + super.render(opts);
      }
      optimizeNames(names, constants) {
        if (!super.optimizeNames(names, constants))
          return;
        this.iterable = optimizeExpr(this.iterable, names, constants);
        return this;
      }
      get names() {
        return addNames(super.names, this.iterable.names);
      }
    };
    var Func = class extends BlockNode {
      constructor(name, args, async) {
        super();
        this.name = name;
        this.args = args;
        this.async = async;
      }
      render(opts) {
        const _async = this.async ? "async " : "";
        return `${_async}function ${this.name}(${this.args})` + super.render(opts);
      }
    };
    Func.kind = "func";
    var Return = class extends ParentNode {
      render(opts) {
        return "return " + super.render(opts);
      }
    };
    Return.kind = "return";
    var Try = class extends BlockNode {
      render(opts) {
        let code = "try" + super.render(opts);
        if (this.catch)
          code += this.catch.render(opts);
        if (this.finally)
          code += this.finally.render(opts);
        return code;
      }
      optimizeNodes() {
        var _a, _b;
        super.optimizeNodes();
        (_a = this.catch) === null || _a === void 0 ? void 0 : _a.optimizeNodes();
        (_b = this.finally) === null || _b === void 0 ? void 0 : _b.optimizeNodes();
        return this;
      }
      optimizeNames(names, constants) {
        var _a, _b;
        super.optimizeNames(names, constants);
        (_a = this.catch) === null || _a === void 0 ? void 0 : _a.optimizeNames(names, constants);
        (_b = this.finally) === null || _b === void 0 ? void 0 : _b.optimizeNames(names, constants);
        return this;
      }
      get names() {
        const names = super.names;
        if (this.catch)
          addNames(names, this.catch.names);
        if (this.finally)
          addNames(names, this.finally.names);
        return names;
      }
    };
    var Catch = class extends BlockNode {
      constructor(error) {
        super();
        this.error = error;
      }
      render(opts) {
        return `catch(${this.error})` + super.render(opts);
      }
    };
    Catch.kind = "catch";
    var Finally = class extends BlockNode {
      render(opts) {
        return "finally" + super.render(opts);
      }
    };
    Finally.kind = "finally";
    var CodeGen = class {
      constructor(extScope, opts = {}) {
        this._values = {};
        this._blockStarts = [];
        this._constants = {};
        this.opts = { ...opts, _n: opts.lines ? "\n" : "" };
        this._extScope = extScope;
        this._scope = new scope_1.Scope({ parent: extScope });
        this._nodes = [new Root()];
      }
      toString() {
        return this._root.render(this.opts);
      }
      // returns unique name in the internal scope
      name(prefix) {
        return this._scope.name(prefix);
      }
      // reserves unique name in the external scope
      scopeName(prefix) {
        return this._extScope.name(prefix);
      }
      // reserves unique name in the external scope and assigns value to it
      scopeValue(prefixOrName, value) {
        const name = this._extScope.value(prefixOrName, value);
        const vs = this._values[name.prefix] || (this._values[name.prefix] = /* @__PURE__ */ new Set());
        vs.add(name);
        return name;
      }
      getScopeValue(prefix, keyOrRef) {
        return this._extScope.getValue(prefix, keyOrRef);
      }
      // return code that assigns values in the external scope to the names that are used internally
      // (same names that were returned by gen.scopeName or gen.scopeValue)
      scopeRefs(scopeName) {
        return this._extScope.scopeRefs(scopeName, this._values);
      }
      scopeCode() {
        return this._extScope.scopeCode(this._values);
      }
      _def(varKind, nameOrPrefix, rhs, constant) {
        const name = this._scope.toName(nameOrPrefix);
        if (rhs !== void 0 && constant)
          this._constants[name.str] = rhs;
        this._leafNode(new Def(varKind, name, rhs));
        return name;
      }
      // `const` declaration (`var` in es5 mode)
      const(nameOrPrefix, rhs, _constant) {
        return this._def(scope_1.varKinds.const, nameOrPrefix, rhs, _constant);
      }
      // `let` declaration with optional assignment (`var` in es5 mode)
      let(nameOrPrefix, rhs, _constant) {
        return this._def(scope_1.varKinds.let, nameOrPrefix, rhs, _constant);
      }
      // `var` declaration with optional assignment
      var(nameOrPrefix, rhs, _constant) {
        return this._def(scope_1.varKinds.var, nameOrPrefix, rhs, _constant);
      }
      // assignment code
      assign(lhs, rhs, sideEffects) {
        return this._leafNode(new Assign(lhs, rhs, sideEffects));
      }
      // `+=` code
      add(lhs, rhs) {
        return this._leafNode(new AssignOp(lhs, exports2.operators.ADD, rhs));
      }
      // appends passed SafeExpr to code or executes Block
      code(c) {
        if (typeof c == "function")
          c();
        else if (c !== code_1.nil)
          this._leafNode(new AnyCode(c));
        return this;
      }
      // returns code for object literal for the passed argument list of key-value pairs
      object(...keyValues) {
        const code = ["{"];
        for (const [key, value] of keyValues) {
          if (code.length > 1)
            code.push(",");
          code.push(key);
          if (key !== value || this.opts.es5) {
            code.push(":");
            (0, code_1.addCodeArg)(code, value);
          }
        }
        code.push("}");
        return new code_1._Code(code);
      }
      // `if` clause (or statement if `thenBody` and, optionally, `elseBody` are passed)
      if(condition, thenBody, elseBody) {
        this._blockNode(new If(condition));
        if (thenBody && elseBody) {
          this.code(thenBody).else().code(elseBody).endIf();
        } else if (thenBody) {
          this.code(thenBody).endIf();
        } else if (elseBody) {
          throw new Error('CodeGen: "else" body without "then" body');
        }
        return this;
      }
      // `else if` clause - invalid without `if` or after `else` clauses
      elseIf(condition) {
        return this._elseNode(new If(condition));
      }
      // `else` clause - only valid after `if` or `else if` clauses
      else() {
        return this._elseNode(new Else());
      }
      // end `if` statement (needed if gen.if was used only with condition)
      endIf() {
        return this._endBlockNode(If, Else);
      }
      _for(node, forBody) {
        this._blockNode(node);
        if (forBody)
          this.code(forBody).endFor();
        return this;
      }
      // a generic `for` clause (or statement if `forBody` is passed)
      for(iteration, forBody) {
        return this._for(new ForLoop(iteration), forBody);
      }
      // `for` statement for a range of values
      forRange(nameOrPrefix, from, to, forBody, varKind = this.opts.es5 ? scope_1.varKinds.var : scope_1.varKinds.let) {
        const name = this._scope.toName(nameOrPrefix);
        return this._for(new ForRange(varKind, name, from, to), () => forBody(name));
      }
      // `for-of` statement (in es5 mode replace with a normal for loop)
      forOf(nameOrPrefix, iterable, forBody, varKind = scope_1.varKinds.const) {
        const name = this._scope.toName(nameOrPrefix);
        if (this.opts.es5) {
          const arr = iterable instanceof code_1.Name ? iterable : this.var("_arr", iterable);
          return this.forRange("_i", 0, (0, code_1._)`${arr}.length`, (i) => {
            this.var(name, (0, code_1._)`${arr}[${i}]`);
            forBody(name);
          });
        }
        return this._for(new ForIter("of", varKind, name, iterable), () => forBody(name));
      }
      // `for-in` statement.
      // With option `ownProperties` replaced with a `for-of` loop for object keys
      forIn(nameOrPrefix, obj, forBody, varKind = this.opts.es5 ? scope_1.varKinds.var : scope_1.varKinds.const) {
        if (this.opts.ownProperties) {
          return this.forOf(nameOrPrefix, (0, code_1._)`Object.keys(${obj})`, forBody);
        }
        const name = this._scope.toName(nameOrPrefix);
        return this._for(new ForIter("in", varKind, name, obj), () => forBody(name));
      }
      // end `for` loop
      endFor() {
        return this._endBlockNode(For);
      }
      // `label` statement
      label(label) {
        return this._leafNode(new Label(label));
      }
      // `break` statement
      break(label) {
        return this._leafNode(new Break(label));
      }
      // `return` statement
      return(value) {
        const node = new Return();
        this._blockNode(node);
        this.code(value);
        if (node.nodes.length !== 1)
          throw new Error('CodeGen: "return" should have one node');
        return this._endBlockNode(Return);
      }
      // `try` statement
      try(tryBody, catchCode, finallyCode) {
        if (!catchCode && !finallyCode)
          throw new Error('CodeGen: "try" without "catch" and "finally"');
        const node = new Try();
        this._blockNode(node);
        this.code(tryBody);
        if (catchCode) {
          const error = this.name("e");
          this._currNode = node.catch = new Catch(error);
          catchCode(error);
        }
        if (finallyCode) {
          this._currNode = node.finally = new Finally();
          this.code(finallyCode);
        }
        return this._endBlockNode(Catch, Finally);
      }
      // `throw` statement
      throw(error) {
        return this._leafNode(new Throw(error));
      }
      // start self-balancing block
      block(body, nodeCount) {
        this._blockStarts.push(this._nodes.length);
        if (body)
          this.code(body).endBlock(nodeCount);
        return this;
      }
      // end the current self-balancing block
      endBlock(nodeCount) {
        const len = this._blockStarts.pop();
        if (len === void 0)
          throw new Error("CodeGen: not in self-balancing block");
        const toClose = this._nodes.length - len;
        if (toClose < 0 || nodeCount !== void 0 && toClose !== nodeCount) {
          throw new Error(`CodeGen: wrong number of nodes: ${toClose} vs ${nodeCount} expected`);
        }
        this._nodes.length = len;
        return this;
      }
      // `function` heading (or definition if funcBody is passed)
      func(name, args = code_1.nil, async, funcBody) {
        this._blockNode(new Func(name, args, async));
        if (funcBody)
          this.code(funcBody).endFunc();
        return this;
      }
      // end function definition
      endFunc() {
        return this._endBlockNode(Func);
      }
      optimize(n = 1) {
        while (n-- > 0) {
          this._root.optimizeNodes();
          this._root.optimizeNames(this._root.names, this._constants);
        }
      }
      _leafNode(node) {
        this._currNode.nodes.push(node);
        return this;
      }
      _blockNode(node) {
        this._currNode.nodes.push(node);
        this._nodes.push(node);
      }
      _endBlockNode(N1, N2) {
        const n = this._currNode;
        if (n instanceof N1 || N2 && n instanceof N2) {
          this._nodes.pop();
          return this;
        }
        throw new Error(`CodeGen: not in block "${N2 ? `${N1.kind}/${N2.kind}` : N1.kind}"`);
      }
      _elseNode(node) {
        const n = this._currNode;
        if (!(n instanceof If)) {
          throw new Error('CodeGen: "else" without "if"');
        }
        this._currNode = n.else = node;
        return this;
      }
      get _root() {
        return this._nodes[0];
      }
      get _currNode() {
        const ns = this._nodes;
        return ns[ns.length - 1];
      }
      set _currNode(node) {
        const ns = this._nodes;
        ns[ns.length - 1] = node;
      }
    };
    exports2.CodeGen = CodeGen;
    function addNames(names, from) {
      for (const n in from)
        names[n] = (names[n] || 0) + (from[n] || 0);
      return names;
    }
    function addExprNames(names, from) {
      return from instanceof code_1._CodeOrName ? addNames(names, from.names) : names;
    }
    function optimizeExpr(expr, names, constants) {
      if (expr instanceof code_1.Name)
        return replaceName(expr);
      if (!canOptimize(expr))
        return expr;
      return new code_1._Code(expr._items.reduce((items, c) => {
        if (c instanceof code_1.Name)
          c = replaceName(c);
        if (c instanceof code_1._Code)
          items.push(...c._items);
        else
          items.push(c);
        return items;
      }, []));
      function replaceName(n) {
        const c = constants[n.str];
        if (c === void 0 || names[n.str] !== 1)
          return n;
        delete names[n.str];
        return c;
      }
      function canOptimize(e) {
        return e instanceof code_1._Code && e._items.some((c) => c instanceof code_1.Name && names[c.str] === 1 && constants[c.str] !== void 0);
      }
    }
    function subtractNames(names, from) {
      for (const n in from)
        names[n] = (names[n] || 0) - (from[n] || 0);
    }
    function not(x) {
      return typeof x == "boolean" || typeof x == "number" || x === null ? !x : (0, code_1._)`!${par(x)}`;
    }
    exports2.not = not;
    var andCode = mappend(exports2.operators.AND);
    function and(...args) {
      return args.reduce(andCode);
    }
    exports2.and = and;
    var orCode = mappend(exports2.operators.OR);
    function or(...args) {
      return args.reduce(orCode);
    }
    exports2.or = or;
    function mappend(op) {
      return (x, y) => x === code_1.nil ? y : y === code_1.nil ? x : (0, code_1._)`${par(x)} ${op} ${par(y)}`;
    }
    function par(x) {
      return x instanceof code_1.Name ? x : (0, code_1._)`(${x})`;
    }
  }
});

// node_modules/ajv/dist/compile/util.js
var require_util = __commonJS({
  "node_modules/ajv/dist/compile/util.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.checkStrictMode = exports2.getErrorPath = exports2.Type = exports2.useFunc = exports2.setEvaluated = exports2.evaluatedPropsToName = exports2.mergeEvaluated = exports2.eachItem = exports2.unescapeJsonPointer = exports2.escapeJsonPointer = exports2.escapeFragment = exports2.unescapeFragment = exports2.schemaRefOrVal = exports2.schemaHasRulesButRef = exports2.schemaHasRules = exports2.checkUnknownRules = exports2.alwaysValidSchema = exports2.toHash = void 0;
    var codegen_1 = require_codegen();
    var code_1 = require_code();
    function toHash(arr) {
      const hash = {};
      for (const item of arr)
        hash[item] = true;
      return hash;
    }
    exports2.toHash = toHash;
    function alwaysValidSchema(it, schema2) {
      if (typeof schema2 == "boolean")
        return schema2;
      if (Object.keys(schema2).length === 0)
        return true;
      checkUnknownRules(it, schema2);
      return !schemaHasRules(schema2, it.self.RULES.all);
    }
    exports2.alwaysValidSchema = alwaysValidSchema;
    function checkUnknownRules(it, schema2 = it.schema) {
      const { opts, self } = it;
      if (!opts.strictSchema)
        return;
      if (typeof schema2 === "boolean")
        return;
      const rules = self.RULES.keywords;
      for (const key in schema2) {
        if (!rules[key])
          checkStrictMode(it, `unknown keyword: "${key}"`);
      }
    }
    exports2.checkUnknownRules = checkUnknownRules;
    function schemaHasRules(schema2, rules) {
      if (typeof schema2 == "boolean")
        return !schema2;
      for (const key in schema2)
        if (rules[key])
          return true;
      return false;
    }
    exports2.schemaHasRules = schemaHasRules;
    function schemaHasRulesButRef(schema2, RULES) {
      if (typeof schema2 == "boolean")
        return !schema2;
      for (const key in schema2)
        if (key !== "$ref" && RULES.all[key])
          return true;
      return false;
    }
    exports2.schemaHasRulesButRef = schemaHasRulesButRef;
    function schemaRefOrVal({ topSchemaRef, schemaPath }, schema2, keyword, $data) {
      if (!$data) {
        if (typeof schema2 == "number" || typeof schema2 == "boolean")
          return schema2;
        if (typeof schema2 == "string")
          return (0, codegen_1._)`${schema2}`;
      }
      return (0, codegen_1._)`${topSchemaRef}${schemaPath}${(0, codegen_1.getProperty)(keyword)}`;
    }
    exports2.schemaRefOrVal = schemaRefOrVal;
    function unescapeFragment(str2) {
      return unescapeJsonPointer(decodeURIComponent(str2));
    }
    exports2.unescapeFragment = unescapeFragment;
    function escapeFragment(str2) {
      return encodeURIComponent(escapeJsonPointer(str2));
    }
    exports2.escapeFragment = escapeFragment;
    function escapeJsonPointer(str2) {
      if (typeof str2 == "number")
        return `${str2}`;
      return str2.replace(/~/g, "~0").replace(/\//g, "~1");
    }
    exports2.escapeJsonPointer = escapeJsonPointer;
    function unescapeJsonPointer(str2) {
      return str2.replace(/~1/g, "/").replace(/~0/g, "~");
    }
    exports2.unescapeJsonPointer = unescapeJsonPointer;
    function eachItem(xs, f) {
      if (Array.isArray(xs)) {
        for (const x of xs)
          f(x);
      } else {
        f(xs);
      }
    }
    exports2.eachItem = eachItem;
    function makeMergeEvaluated({ mergeNames, mergeToName, mergeValues, resultToName }) {
      return (gen, from, to, toName) => {
        const res = to === void 0 ? from : to instanceof codegen_1.Name ? (from instanceof codegen_1.Name ? mergeNames(gen, from, to) : mergeToName(gen, from, to), to) : from instanceof codegen_1.Name ? (mergeToName(gen, to, from), from) : mergeValues(from, to);
        return toName === codegen_1.Name && !(res instanceof codegen_1.Name) ? resultToName(gen, res) : res;
      };
    }
    exports2.mergeEvaluated = {
      props: makeMergeEvaluated({
        mergeNames: (gen, from, to) => gen.if((0, codegen_1._)`${to} !== true && ${from} !== undefined`, () => {
          gen.if((0, codegen_1._)`${from} === true`, () => gen.assign(to, true), () => gen.assign(to, (0, codegen_1._)`${to} || {}`).code((0, codegen_1._)`Object.assign(${to}, ${from})`));
        }),
        mergeToName: (gen, from, to) => gen.if((0, codegen_1._)`${to} !== true`, () => {
          if (from === true) {
            gen.assign(to, true);
          } else {
            gen.assign(to, (0, codegen_1._)`${to} || {}`);
            setEvaluated(gen, to, from);
          }
        }),
        mergeValues: (from, to) => from === true ? true : { ...from, ...to },
        resultToName: evaluatedPropsToName
      }),
      items: makeMergeEvaluated({
        mergeNames: (gen, from, to) => gen.if((0, codegen_1._)`${to} !== true && ${from} !== undefined`, () => gen.assign(to, (0, codegen_1._)`${from} === true ? true : ${to} > ${from} ? ${to} : ${from}`)),
        mergeToName: (gen, from, to) => gen.if((0, codegen_1._)`${to} !== true`, () => gen.assign(to, from === true ? true : (0, codegen_1._)`${to} > ${from} ? ${to} : ${from}`)),
        mergeValues: (from, to) => from === true ? true : Math.max(from, to),
        resultToName: (gen, items) => gen.var("items", items)
      })
    };
    function evaluatedPropsToName(gen, ps) {
      if (ps === true)
        return gen.var("props", true);
      const props = gen.var("props", (0, codegen_1._)`{}`);
      if (ps !== void 0)
        setEvaluated(gen, props, ps);
      return props;
    }
    exports2.evaluatedPropsToName = evaluatedPropsToName;
    function setEvaluated(gen, props, ps) {
      Object.keys(ps).forEach((p) => gen.assign((0, codegen_1._)`${props}${(0, codegen_1.getProperty)(p)}`, true));
    }
    exports2.setEvaluated = setEvaluated;
    var snippets = {};
    function useFunc(gen, f) {
      return gen.scopeValue("func", {
        ref: f,
        code: snippets[f.code] || (snippets[f.code] = new code_1._Code(f.code))
      });
    }
    exports2.useFunc = useFunc;
    var Type;
    (function(Type2) {
      Type2[Type2["Num"] = 0] = "Num";
      Type2[Type2["Str"] = 1] = "Str";
    })(Type || (exports2.Type = Type = {}));
    function getErrorPath(dataProp, dataPropType, jsPropertySyntax) {
      if (dataProp instanceof codegen_1.Name) {
        const isNumber = dataPropType === Type.Num;
        return jsPropertySyntax ? isNumber ? (0, codegen_1._)`"[" + ${dataProp} + "]"` : (0, codegen_1._)`"['" + ${dataProp} + "']"` : isNumber ? (0, codegen_1._)`"/" + ${dataProp}` : (0, codegen_1._)`"/" + ${dataProp}.replace(/~/g, "~0").replace(/\\//g, "~1")`;
      }
      return jsPropertySyntax ? (0, codegen_1.getProperty)(dataProp).toString() : "/" + escapeJsonPointer(dataProp);
    }
    exports2.getErrorPath = getErrorPath;
    function checkStrictMode(it, msg, mode = it.opts.strictSchema) {
      if (!mode)
        return;
      msg = `strict mode: ${msg}`;
      if (mode === true)
        throw new Error(msg);
      it.self.logger.warn(msg);
    }
    exports2.checkStrictMode = checkStrictMode;
  }
});

// node_modules/ajv/dist/compile/names.js
var require_names = __commonJS({
  "node_modules/ajv/dist/compile/names.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var names = {
      // validation function arguments
      data: new codegen_1.Name("data"),
      // data passed to validation function
      // args passed from referencing schema
      valCxt: new codegen_1.Name("valCxt"),
      // validation/data context - should not be used directly, it is destructured to the names below
      instancePath: new codegen_1.Name("instancePath"),
      parentData: new codegen_1.Name("parentData"),
      parentDataProperty: new codegen_1.Name("parentDataProperty"),
      rootData: new codegen_1.Name("rootData"),
      // root data - same as the data passed to the first/top validation function
      dynamicAnchors: new codegen_1.Name("dynamicAnchors"),
      // used to support recursiveRef and dynamicRef
      // function scoped variables
      vErrors: new codegen_1.Name("vErrors"),
      // null or array of validation errors
      errors: new codegen_1.Name("errors"),
      // counter of validation errors
      this: new codegen_1.Name("this"),
      // "globals"
      self: new codegen_1.Name("self"),
      scope: new codegen_1.Name("scope"),
      // JTD serialize/parse name for JSON string and position
      json: new codegen_1.Name("json"),
      jsonPos: new codegen_1.Name("jsonPos"),
      jsonLen: new codegen_1.Name("jsonLen"),
      jsonPart: new codegen_1.Name("jsonPart")
    };
    exports2.default = names;
  }
});

// node_modules/ajv/dist/compile/errors.js
var require_errors = __commonJS({
  "node_modules/ajv/dist/compile/errors.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.extendErrors = exports2.resetErrorsCount = exports2.reportExtraError = exports2.reportError = exports2.keyword$DataError = exports2.keywordError = void 0;
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var names_1 = require_names();
    exports2.keywordError = {
      message: ({ keyword }) => (0, codegen_1.str)`must pass "${keyword}" keyword validation`
    };
    exports2.keyword$DataError = {
      message: ({ keyword, schemaType }) => schemaType ? (0, codegen_1.str)`"${keyword}" keyword must be ${schemaType} ($data)` : (0, codegen_1.str)`"${keyword}" keyword is invalid ($data)`
    };
    function reportError(cxt, error = exports2.keywordError, errorPaths, overrideAllErrors) {
      const { it } = cxt;
      const { gen, compositeRule, allErrors } = it;
      const errObj = errorObjectCode(cxt, error, errorPaths);
      if (overrideAllErrors !== null && overrideAllErrors !== void 0 ? overrideAllErrors : compositeRule || allErrors) {
        addError(gen, errObj);
      } else {
        returnErrors(it, (0, codegen_1._)`[${errObj}]`);
      }
    }
    exports2.reportError = reportError;
    function reportExtraError(cxt, error = exports2.keywordError, errorPaths) {
      const { it } = cxt;
      const { gen, compositeRule, allErrors } = it;
      const errObj = errorObjectCode(cxt, error, errorPaths);
      addError(gen, errObj);
      if (!(compositeRule || allErrors)) {
        returnErrors(it, names_1.default.vErrors);
      }
    }
    exports2.reportExtraError = reportExtraError;
    function resetErrorsCount(gen, errsCount) {
      gen.assign(names_1.default.errors, errsCount);
      gen.if((0, codegen_1._)`${names_1.default.vErrors} !== null`, () => gen.if(errsCount, () => gen.assign((0, codegen_1._)`${names_1.default.vErrors}.length`, errsCount), () => gen.assign(names_1.default.vErrors, null)));
    }
    exports2.resetErrorsCount = resetErrorsCount;
    function extendErrors({ gen, keyword, schemaValue, data, errsCount, it }) {
      if (errsCount === void 0)
        throw new Error("ajv implementation error");
      const err = gen.name("err");
      gen.forRange("i", errsCount, names_1.default.errors, (i) => {
        gen.const(err, (0, codegen_1._)`${names_1.default.vErrors}[${i}]`);
        gen.if((0, codegen_1._)`${err}.instancePath === undefined`, () => gen.assign((0, codegen_1._)`${err}.instancePath`, (0, codegen_1.strConcat)(names_1.default.instancePath, it.errorPath)));
        gen.assign((0, codegen_1._)`${err}.schemaPath`, (0, codegen_1.str)`${it.errSchemaPath}/${keyword}`);
        if (it.opts.verbose) {
          gen.assign((0, codegen_1._)`${err}.schema`, schemaValue);
          gen.assign((0, codegen_1._)`${err}.data`, data);
        }
      });
    }
    exports2.extendErrors = extendErrors;
    function addError(gen, errObj) {
      const err = gen.const("err", errObj);
      gen.if((0, codegen_1._)`${names_1.default.vErrors} === null`, () => gen.assign(names_1.default.vErrors, (0, codegen_1._)`[${err}]`), (0, codegen_1._)`${names_1.default.vErrors}.push(${err})`);
      gen.code((0, codegen_1._)`${names_1.default.errors}++`);
    }
    function returnErrors(it, errs) {
      const { gen, validateName, schemaEnv } = it;
      if (schemaEnv.$async) {
        gen.throw((0, codegen_1._)`new ${it.ValidationError}(${errs})`);
      } else {
        gen.assign((0, codegen_1._)`${validateName}.errors`, errs);
        gen.return(false);
      }
    }
    var E = {
      keyword: new codegen_1.Name("keyword"),
      schemaPath: new codegen_1.Name("schemaPath"),
      // also used in JTD errors
      params: new codegen_1.Name("params"),
      propertyName: new codegen_1.Name("propertyName"),
      message: new codegen_1.Name("message"),
      schema: new codegen_1.Name("schema"),
      parentSchema: new codegen_1.Name("parentSchema")
    };
    function errorObjectCode(cxt, error, errorPaths) {
      const { createErrors } = cxt.it;
      if (createErrors === false)
        return (0, codegen_1._)`{}`;
      return errorObject(cxt, error, errorPaths);
    }
    function errorObject(cxt, error, errorPaths = {}) {
      const { gen, it } = cxt;
      const keyValues = [
        errorInstancePath(it, errorPaths),
        errorSchemaPath(cxt, errorPaths)
      ];
      extraErrorProps(cxt, error, keyValues);
      return gen.object(...keyValues);
    }
    function errorInstancePath({ errorPath }, { instancePath }) {
      const instPath = instancePath ? (0, codegen_1.str)`${errorPath}${(0, util_1.getErrorPath)(instancePath, util_1.Type.Str)}` : errorPath;
      return [names_1.default.instancePath, (0, codegen_1.strConcat)(names_1.default.instancePath, instPath)];
    }
    function errorSchemaPath({ keyword, it: { errSchemaPath } }, { schemaPath, parentSchema }) {
      let schPath = parentSchema ? errSchemaPath : (0, codegen_1.str)`${errSchemaPath}/${keyword}`;
      if (schemaPath) {
        schPath = (0, codegen_1.str)`${schPath}${(0, util_1.getErrorPath)(schemaPath, util_1.Type.Str)}`;
      }
      return [E.schemaPath, schPath];
    }
    function extraErrorProps(cxt, { params, message }, keyValues) {
      const { keyword, data, schemaValue, it } = cxt;
      const { opts, propertyName, topSchemaRef, schemaPath } = it;
      keyValues.push([E.keyword, keyword], [E.params, typeof params == "function" ? params(cxt) : params || (0, codegen_1._)`{}`]);
      if (opts.messages) {
        keyValues.push([E.message, typeof message == "function" ? message(cxt) : message]);
      }
      if (opts.verbose) {
        keyValues.push([E.schema, schemaValue], [E.parentSchema, (0, codegen_1._)`${topSchemaRef}${schemaPath}`], [names_1.default.data, data]);
      }
      if (propertyName)
        keyValues.push([E.propertyName, propertyName]);
    }
  }
});

// node_modules/ajv/dist/compile/validate/boolSchema.js
var require_boolSchema = __commonJS({
  "node_modules/ajv/dist/compile/validate/boolSchema.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.boolOrEmptySchema = exports2.topBoolOrEmptySchema = void 0;
    var errors_1 = require_errors();
    var codegen_1 = require_codegen();
    var names_1 = require_names();
    var boolError = {
      message: "boolean schema is false"
    };
    function topBoolOrEmptySchema(it) {
      const { gen, schema: schema2, validateName } = it;
      if (schema2 === false) {
        falseSchemaError(it, false);
      } else if (typeof schema2 == "object" && schema2.$async === true) {
        gen.return(names_1.default.data);
      } else {
        gen.assign((0, codegen_1._)`${validateName}.errors`, null);
        gen.return(true);
      }
    }
    exports2.topBoolOrEmptySchema = topBoolOrEmptySchema;
    function boolOrEmptySchema(it, valid) {
      const { gen, schema: schema2 } = it;
      if (schema2 === false) {
        gen.var(valid, false);
        falseSchemaError(it);
      } else {
        gen.var(valid, true);
      }
    }
    exports2.boolOrEmptySchema = boolOrEmptySchema;
    function falseSchemaError(it, overrideAllErrors) {
      const { gen, data } = it;
      const cxt = {
        gen,
        keyword: "false schema",
        data,
        schema: false,
        schemaCode: false,
        schemaValue: false,
        params: {},
        it
      };
      (0, errors_1.reportError)(cxt, boolError, void 0, overrideAllErrors);
    }
  }
});

// node_modules/ajv/dist/compile/rules.js
var require_rules = __commonJS({
  "node_modules/ajv/dist/compile/rules.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.getRules = exports2.isJSONType = void 0;
    var _jsonTypes = ["string", "number", "integer", "boolean", "null", "object", "array"];
    var jsonTypes = new Set(_jsonTypes);
    function isJSONType(x) {
      return typeof x == "string" && jsonTypes.has(x);
    }
    exports2.isJSONType = isJSONType;
    function getRules() {
      const groups = {
        number: { type: "number", rules: [] },
        string: { type: "string", rules: [] },
        array: { type: "array", rules: [] },
        object: { type: "object", rules: [] }
      };
      return {
        types: { ...groups, integer: true, boolean: true, null: true },
        rules: [{ rules: [] }, groups.number, groups.string, groups.array, groups.object],
        post: { rules: [] },
        all: {},
        keywords: {}
      };
    }
    exports2.getRules = getRules;
  }
});

// node_modules/ajv/dist/compile/validate/applicability.js
var require_applicability = __commonJS({
  "node_modules/ajv/dist/compile/validate/applicability.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.shouldUseRule = exports2.shouldUseGroup = exports2.schemaHasRulesForType = void 0;
    function schemaHasRulesForType({ schema: schema2, self }, type2) {
      const group = self.RULES.types[type2];
      return group && group !== true && shouldUseGroup(schema2, group);
    }
    exports2.schemaHasRulesForType = schemaHasRulesForType;
    function shouldUseGroup(schema2, group) {
      return group.rules.some((rule) => shouldUseRule(schema2, rule));
    }
    exports2.shouldUseGroup = shouldUseGroup;
    function shouldUseRule(schema2, rule) {
      var _a;
      return schema2[rule.keyword] !== void 0 || ((_a = rule.definition.implements) === null || _a === void 0 ? void 0 : _a.some((kwd) => schema2[kwd] !== void 0));
    }
    exports2.shouldUseRule = shouldUseRule;
  }
});

// node_modules/ajv/dist/compile/validate/dataType.js
var require_dataType = __commonJS({
  "node_modules/ajv/dist/compile/validate/dataType.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.reportTypeError = exports2.checkDataTypes = exports2.checkDataType = exports2.coerceAndCheckDataType = exports2.getJSONTypes = exports2.getSchemaTypes = exports2.DataType = void 0;
    var rules_1 = require_rules();
    var applicability_1 = require_applicability();
    var errors_1 = require_errors();
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var DataType;
    (function(DataType2) {
      DataType2[DataType2["Correct"] = 0] = "Correct";
      DataType2[DataType2["Wrong"] = 1] = "Wrong";
    })(DataType || (exports2.DataType = DataType = {}));
    function getSchemaTypes(schema2) {
      const types = getJSONTypes(schema2.type);
      const hasNull = types.includes("null");
      if (hasNull) {
        if (schema2.nullable === false)
          throw new Error("type: null contradicts nullable: false");
      } else {
        if (!types.length && schema2.nullable !== void 0) {
          throw new Error('"nullable" cannot be used without "type"');
        }
        if (schema2.nullable === true)
          types.push("null");
      }
      return types;
    }
    exports2.getSchemaTypes = getSchemaTypes;
    function getJSONTypes(ts) {
      const types = Array.isArray(ts) ? ts : ts ? [ts] : [];
      if (types.every(rules_1.isJSONType))
        return types;
      throw new Error("type must be JSONType or JSONType[]: " + types.join(","));
    }
    exports2.getJSONTypes = getJSONTypes;
    function coerceAndCheckDataType(it, types) {
      const { gen, data, opts } = it;
      const coerceTo = coerceToTypes(types, opts.coerceTypes);
      const checkTypes = types.length > 0 && !(coerceTo.length === 0 && types.length === 1 && (0, applicability_1.schemaHasRulesForType)(it, types[0]));
      if (checkTypes) {
        const wrongType = checkDataTypes(types, data, opts.strictNumbers, DataType.Wrong);
        gen.if(wrongType, () => {
          if (coerceTo.length)
            coerceData(it, types, coerceTo);
          else
            reportTypeError(it);
        });
      }
      return checkTypes;
    }
    exports2.coerceAndCheckDataType = coerceAndCheckDataType;
    var COERCIBLE = /* @__PURE__ */ new Set(["string", "number", "integer", "boolean", "null"]);
    function coerceToTypes(types, coerceTypes) {
      return coerceTypes ? types.filter((t) => COERCIBLE.has(t) || coerceTypes === "array" && t === "array") : [];
    }
    function coerceData(it, types, coerceTo) {
      const { gen, data, opts } = it;
      const dataType = gen.let("dataType", (0, codegen_1._)`typeof ${data}`);
      const coerced = gen.let("coerced", (0, codegen_1._)`undefined`);
      if (opts.coerceTypes === "array") {
        gen.if((0, codegen_1._)`${dataType} == 'object' && Array.isArray(${data}) && ${data}.length == 1`, () => gen.assign(data, (0, codegen_1._)`${data}[0]`).assign(dataType, (0, codegen_1._)`typeof ${data}`).if(checkDataTypes(types, data, opts.strictNumbers), () => gen.assign(coerced, data)));
      }
      gen.if((0, codegen_1._)`${coerced} !== undefined`);
      for (const t of coerceTo) {
        if (COERCIBLE.has(t) || t === "array" && opts.coerceTypes === "array") {
          coerceSpecificType(t);
        }
      }
      gen.else();
      reportTypeError(it);
      gen.endIf();
      gen.if((0, codegen_1._)`${coerced} !== undefined`, () => {
        gen.assign(data, coerced);
        assignParentData(it, coerced);
      });
      function coerceSpecificType(t) {
        switch (t) {
          case "string":
            gen.elseIf((0, codegen_1._)`${dataType} == "number" || ${dataType} == "boolean"`).assign(coerced, (0, codegen_1._)`"" + ${data}`).elseIf((0, codegen_1._)`${data} === null`).assign(coerced, (0, codegen_1._)`""`);
            return;
          case "number":
            gen.elseIf((0, codegen_1._)`${dataType} == "boolean" || ${data} === null
              || (${dataType} == "string" && ${data} && ${data} == +${data})`).assign(coerced, (0, codegen_1._)`+${data}`);
            return;
          case "integer":
            gen.elseIf((0, codegen_1._)`${dataType} === "boolean" || ${data} === null
              || (${dataType} === "string" && ${data} && ${data} == +${data} && !(${data} % 1))`).assign(coerced, (0, codegen_1._)`+${data}`);
            return;
          case "boolean":
            gen.elseIf((0, codegen_1._)`${data} === "false" || ${data} === 0 || ${data} === null`).assign(coerced, false).elseIf((0, codegen_1._)`${data} === "true" || ${data} === 1`).assign(coerced, true);
            return;
          case "null":
            gen.elseIf((0, codegen_1._)`${data} === "" || ${data} === 0 || ${data} === false`);
            gen.assign(coerced, null);
            return;
          case "array":
            gen.elseIf((0, codegen_1._)`${dataType} === "string" || ${dataType} === "number"
              || ${dataType} === "boolean" || ${data} === null`).assign(coerced, (0, codegen_1._)`[${data}]`);
        }
      }
    }
    function assignParentData({ gen, parentData, parentDataProperty }, expr) {
      gen.if((0, codegen_1._)`${parentData} !== undefined`, () => gen.assign((0, codegen_1._)`${parentData}[${parentDataProperty}]`, expr));
    }
    function checkDataType(dataType, data, strictNums, correct = DataType.Correct) {
      const EQ = correct === DataType.Correct ? codegen_1.operators.EQ : codegen_1.operators.NEQ;
      let cond;
      switch (dataType) {
        case "null":
          return (0, codegen_1._)`${data} ${EQ} null`;
        case "array":
          cond = (0, codegen_1._)`Array.isArray(${data})`;
          break;
        case "object":
          cond = (0, codegen_1._)`${data} && typeof ${data} == "object" && !Array.isArray(${data})`;
          break;
        case "integer":
          cond = numCond((0, codegen_1._)`!(${data} % 1) && !isNaN(${data})`);
          break;
        case "number":
          cond = numCond();
          break;
        default:
          return (0, codegen_1._)`typeof ${data} ${EQ} ${dataType}`;
      }
      return correct === DataType.Correct ? cond : (0, codegen_1.not)(cond);
      function numCond(_cond = codegen_1.nil) {
        return (0, codegen_1.and)((0, codegen_1._)`typeof ${data} == "number"`, _cond, strictNums ? (0, codegen_1._)`isFinite(${data})` : codegen_1.nil);
      }
    }
    exports2.checkDataType = checkDataType;
    function checkDataTypes(dataTypes, data, strictNums, correct) {
      if (dataTypes.length === 1) {
        return checkDataType(dataTypes[0], data, strictNums, correct);
      }
      let cond;
      const types = (0, util_1.toHash)(dataTypes);
      if (types.array && types.object) {
        const notObj = (0, codegen_1._)`typeof ${data} != "object"`;
        cond = types.null ? notObj : (0, codegen_1._)`!${data} || ${notObj}`;
        delete types.null;
        delete types.array;
        delete types.object;
      } else {
        cond = codegen_1.nil;
      }
      if (types.number)
        delete types.integer;
      for (const t in types)
        cond = (0, codegen_1.and)(cond, checkDataType(t, data, strictNums, correct));
      return cond;
    }
    exports2.checkDataTypes = checkDataTypes;
    var typeError = {
      message: ({ schema: schema2 }) => `must be ${schema2}`,
      params: ({ schema: schema2, schemaValue }) => typeof schema2 == "string" ? (0, codegen_1._)`{type: ${schema2}}` : (0, codegen_1._)`{type: ${schemaValue}}`
    };
    function reportTypeError(it) {
      const cxt = getTypeErrorContext(it);
      (0, errors_1.reportError)(cxt, typeError);
    }
    exports2.reportTypeError = reportTypeError;
    function getTypeErrorContext(it) {
      const { gen, data, schema: schema2 } = it;
      const schemaCode = (0, util_1.schemaRefOrVal)(it, schema2, "type");
      return {
        gen,
        keyword: "type",
        data,
        schema: schema2.type,
        schemaCode,
        schemaValue: schemaCode,
        parentSchema: schema2,
        params: {},
        it
      };
    }
  }
});

// node_modules/ajv/dist/compile/validate/defaults.js
var require_defaults = __commonJS({
  "node_modules/ajv/dist/compile/validate/defaults.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.assignDefaults = void 0;
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    function assignDefaults(it, ty) {
      const { properties, items } = it.schema;
      if (ty === "object" && properties) {
        for (const key in properties) {
          assignDefault(it, key, properties[key].default);
        }
      } else if (ty === "array" && Array.isArray(items)) {
        items.forEach((sch, i) => assignDefault(it, i, sch.default));
      }
    }
    exports2.assignDefaults = assignDefaults;
    function assignDefault(it, prop, defaultValue) {
      const { gen, compositeRule, data, opts } = it;
      if (defaultValue === void 0)
        return;
      const childData = (0, codegen_1._)`${data}${(0, codegen_1.getProperty)(prop)}`;
      if (compositeRule) {
        (0, util_1.checkStrictMode)(it, `default is ignored for: ${childData}`);
        return;
      }
      let condition = (0, codegen_1._)`${childData} === undefined`;
      if (opts.useDefaults === "empty") {
        condition = (0, codegen_1._)`${condition} || ${childData} === null || ${childData} === ""`;
      }
      gen.if(condition, (0, codegen_1._)`${childData} = ${(0, codegen_1.stringify)(defaultValue)}`);
    }
  }
});

// node_modules/ajv/dist/vocabularies/code.js
var require_code2 = __commonJS({
  "node_modules/ajv/dist/vocabularies/code.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.validateUnion = exports2.validateArray = exports2.usePattern = exports2.callValidateCode = exports2.schemaProperties = exports2.allSchemaProperties = exports2.noPropertyInData = exports2.propertyInData = exports2.isOwnProperty = exports2.hasPropFunc = exports2.reportMissingProp = exports2.checkMissingProp = exports2.checkReportMissingProp = void 0;
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var names_1 = require_names();
    var util_2 = require_util();
    function checkReportMissingProp(cxt, prop) {
      const { gen, data, it } = cxt;
      gen.if(noPropertyInData(gen, data, prop, it.opts.ownProperties), () => {
        cxt.setParams({ missingProperty: (0, codegen_1._)`${prop}` }, true);
        cxt.error();
      });
    }
    exports2.checkReportMissingProp = checkReportMissingProp;
    function checkMissingProp({ gen, data, it: { opts } }, properties, missing) {
      return (0, codegen_1.or)(...properties.map((prop) => (0, codegen_1.and)(noPropertyInData(gen, data, prop, opts.ownProperties), (0, codegen_1._)`${missing} = ${prop}`)));
    }
    exports2.checkMissingProp = checkMissingProp;
    function reportMissingProp(cxt, missing) {
      cxt.setParams({ missingProperty: missing }, true);
      cxt.error();
    }
    exports2.reportMissingProp = reportMissingProp;
    function hasPropFunc(gen) {
      return gen.scopeValue("func", {
        // eslint-disable-next-line @typescript-eslint/unbound-method
        ref: Object.prototype.hasOwnProperty,
        code: (0, codegen_1._)`Object.prototype.hasOwnProperty`
      });
    }
    exports2.hasPropFunc = hasPropFunc;
    function isOwnProperty(gen, data, property) {
      return (0, codegen_1._)`${hasPropFunc(gen)}.call(${data}, ${property})`;
    }
    exports2.isOwnProperty = isOwnProperty;
    function propertyInData(gen, data, property, ownProperties) {
      const cond = (0, codegen_1._)`${data}${(0, codegen_1.getProperty)(property)} !== undefined`;
      return ownProperties ? (0, codegen_1._)`${cond} && ${isOwnProperty(gen, data, property)}` : cond;
    }
    exports2.propertyInData = propertyInData;
    function noPropertyInData(gen, data, property, ownProperties) {
      const cond = (0, codegen_1._)`${data}${(0, codegen_1.getProperty)(property)} === undefined`;
      return ownProperties ? (0, codegen_1.or)(cond, (0, codegen_1.not)(isOwnProperty(gen, data, property))) : cond;
    }
    exports2.noPropertyInData = noPropertyInData;
    function allSchemaProperties(schemaMap) {
      return schemaMap ? Object.keys(schemaMap).filter((p) => p !== "__proto__") : [];
    }
    exports2.allSchemaProperties = allSchemaProperties;
    function schemaProperties(it, schemaMap) {
      return allSchemaProperties(schemaMap).filter((p) => !(0, util_1.alwaysValidSchema)(it, schemaMap[p]));
    }
    exports2.schemaProperties = schemaProperties;
    function callValidateCode({ schemaCode, data, it: { gen, topSchemaRef, schemaPath, errorPath }, it }, func, context, passSchema) {
      const dataAndSchema = passSchema ? (0, codegen_1._)`${schemaCode}, ${data}, ${topSchemaRef}${schemaPath}` : data;
      const valCxt = [
        [names_1.default.instancePath, (0, codegen_1.strConcat)(names_1.default.instancePath, errorPath)],
        [names_1.default.parentData, it.parentData],
        [names_1.default.parentDataProperty, it.parentDataProperty],
        [names_1.default.rootData, names_1.default.rootData]
      ];
      if (it.opts.dynamicRef)
        valCxt.push([names_1.default.dynamicAnchors, names_1.default.dynamicAnchors]);
      const args = (0, codegen_1._)`${dataAndSchema}, ${gen.object(...valCxt)}`;
      return context !== codegen_1.nil ? (0, codegen_1._)`${func}.call(${context}, ${args})` : (0, codegen_1._)`${func}(${args})`;
    }
    exports2.callValidateCode = callValidateCode;
    var newRegExp = (0, codegen_1._)`new RegExp`;
    function usePattern({ gen, it: { opts } }, pattern) {
      const u = opts.unicodeRegExp ? "u" : "";
      const { regExp } = opts.code;
      const rx = regExp(pattern, u);
      return gen.scopeValue("pattern", {
        key: rx.toString(),
        ref: rx,
        code: (0, codegen_1._)`${regExp.code === "new RegExp" ? newRegExp : (0, util_2.useFunc)(gen, regExp)}(${pattern}, ${u})`
      });
    }
    exports2.usePattern = usePattern;
    function validateArray(cxt) {
      const { gen, data, keyword, it } = cxt;
      const valid = gen.name("valid");
      if (it.allErrors) {
        const validArr = gen.let("valid", true);
        validateItems(() => gen.assign(validArr, false));
        return validArr;
      }
      gen.var(valid, true);
      validateItems(() => gen.break());
      return valid;
      function validateItems(notValid) {
        const len = gen.const("len", (0, codegen_1._)`${data}.length`);
        gen.forRange("i", 0, len, (i) => {
          cxt.subschema({
            keyword,
            dataProp: i,
            dataPropType: util_1.Type.Num
          }, valid);
          gen.if((0, codegen_1.not)(valid), notValid);
        });
      }
    }
    exports2.validateArray = validateArray;
    function validateUnion(cxt) {
      const { gen, schema: schema2, keyword, it } = cxt;
      if (!Array.isArray(schema2))
        throw new Error("ajv implementation error");
      const alwaysValid = schema2.some((sch) => (0, util_1.alwaysValidSchema)(it, sch));
      if (alwaysValid && !it.opts.unevaluated)
        return;
      const valid = gen.let("valid", false);
      const schValid = gen.name("_valid");
      gen.block(() => schema2.forEach((_sch, i) => {
        const schCxt = cxt.subschema({
          keyword,
          schemaProp: i,
          compositeRule: true
        }, schValid);
        gen.assign(valid, (0, codegen_1._)`${valid} || ${schValid}`);
        const merged = cxt.mergeValidEvaluated(schCxt, schValid);
        if (!merged)
          gen.if((0, codegen_1.not)(valid));
      }));
      cxt.result(valid, () => cxt.reset(), () => cxt.error(true));
    }
    exports2.validateUnion = validateUnion;
  }
});

// node_modules/ajv/dist/compile/validate/keyword.js
var require_keyword = __commonJS({
  "node_modules/ajv/dist/compile/validate/keyword.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.validateKeywordUsage = exports2.validSchemaType = exports2.funcKeywordCode = exports2.macroKeywordCode = void 0;
    var codegen_1 = require_codegen();
    var names_1 = require_names();
    var code_1 = require_code2();
    var errors_1 = require_errors();
    function macroKeywordCode(cxt, def) {
      const { gen, keyword, schema: schema2, parentSchema, it } = cxt;
      const macroSchema = def.macro.call(it.self, schema2, parentSchema, it);
      const schemaRef = useKeyword(gen, keyword, macroSchema);
      if (it.opts.validateSchema !== false)
        it.self.validateSchema(macroSchema, true);
      const valid = gen.name("valid");
      cxt.subschema({
        schema: macroSchema,
        schemaPath: codegen_1.nil,
        errSchemaPath: `${it.errSchemaPath}/${keyword}`,
        topSchemaRef: schemaRef,
        compositeRule: true
      }, valid);
      cxt.pass(valid, () => cxt.error(true));
    }
    exports2.macroKeywordCode = macroKeywordCode;
    function funcKeywordCode(cxt, def) {
      var _a;
      const { gen, keyword, schema: schema2, parentSchema, $data, it } = cxt;
      checkAsyncKeyword(it, def);
      const validate = !$data && def.compile ? def.compile.call(it.self, schema2, parentSchema, it) : def.validate;
      const validateRef = useKeyword(gen, keyword, validate);
      const valid = gen.let("valid");
      cxt.block$data(valid, validateKeyword);
      cxt.ok((_a = def.valid) !== null && _a !== void 0 ? _a : valid);
      function validateKeyword() {
        if (def.errors === false) {
          assignValid();
          if (def.modifying)
            modifyData(cxt);
          reportErrs(() => cxt.error());
        } else {
          const ruleErrs = def.async ? validateAsync() : validateSync();
          if (def.modifying)
            modifyData(cxt);
          reportErrs(() => addErrs(cxt, ruleErrs));
        }
      }
      function validateAsync() {
        const ruleErrs = gen.let("ruleErrs", null);
        gen.try(() => assignValid((0, codegen_1._)`await `), (e) => gen.assign(valid, false).if((0, codegen_1._)`${e} instanceof ${it.ValidationError}`, () => gen.assign(ruleErrs, (0, codegen_1._)`${e}.errors`), () => gen.throw(e)));
        return ruleErrs;
      }
      function validateSync() {
        const validateErrs = (0, codegen_1._)`${validateRef}.errors`;
        gen.assign(validateErrs, null);
        assignValid(codegen_1.nil);
        return validateErrs;
      }
      function assignValid(_await = def.async ? (0, codegen_1._)`await ` : codegen_1.nil) {
        const passCxt = it.opts.passContext ? names_1.default.this : names_1.default.self;
        const passSchema = !("compile" in def && !$data || def.schema === false);
        gen.assign(valid, (0, codegen_1._)`${_await}${(0, code_1.callValidateCode)(cxt, validateRef, passCxt, passSchema)}`, def.modifying);
      }
      function reportErrs(errors) {
        var _a2;
        gen.if((0, codegen_1.not)((_a2 = def.valid) !== null && _a2 !== void 0 ? _a2 : valid), errors);
      }
    }
    exports2.funcKeywordCode = funcKeywordCode;
    function modifyData(cxt) {
      const { gen, data, it } = cxt;
      gen.if(it.parentData, () => gen.assign(data, (0, codegen_1._)`${it.parentData}[${it.parentDataProperty}]`));
    }
    function addErrs(cxt, errs) {
      const { gen } = cxt;
      gen.if((0, codegen_1._)`Array.isArray(${errs})`, () => {
        gen.assign(names_1.default.vErrors, (0, codegen_1._)`${names_1.default.vErrors} === null ? ${errs} : ${names_1.default.vErrors}.concat(${errs})`).assign(names_1.default.errors, (0, codegen_1._)`${names_1.default.vErrors}.length`);
        (0, errors_1.extendErrors)(cxt);
      }, () => cxt.error());
    }
    function checkAsyncKeyword({ schemaEnv }, def) {
      if (def.async && !schemaEnv.$async)
        throw new Error("async keyword in sync schema");
    }
    function useKeyword(gen, keyword, result) {
      if (result === void 0)
        throw new Error(`keyword "${keyword}" failed to compile`);
      return gen.scopeValue("keyword", typeof result == "function" ? { ref: result } : { ref: result, code: (0, codegen_1.stringify)(result) });
    }
    function validSchemaType(schema2, schemaType, allowUndefined = false) {
      return !schemaType.length || schemaType.some((st) => st === "array" ? Array.isArray(schema2) : st === "object" ? schema2 && typeof schema2 == "object" && !Array.isArray(schema2) : typeof schema2 == st || allowUndefined && typeof schema2 == "undefined");
    }
    exports2.validSchemaType = validSchemaType;
    function validateKeywordUsage({ schema: schema2, opts, self, errSchemaPath }, def, keyword) {
      if (Array.isArray(def.keyword) ? !def.keyword.includes(keyword) : def.keyword !== keyword) {
        throw new Error("ajv implementation error");
      }
      const deps = def.dependencies;
      if (deps === null || deps === void 0 ? void 0 : deps.some((kwd) => !Object.prototype.hasOwnProperty.call(schema2, kwd))) {
        throw new Error(`parent schema must have dependencies of ${keyword}: ${deps.join(",")}`);
      }
      if (def.validateSchema) {
        const valid = def.validateSchema(schema2[keyword]);
        if (!valid) {
          const msg = `keyword "${keyword}" value is invalid at path "${errSchemaPath}": ` + self.errorsText(def.validateSchema.errors);
          if (opts.validateSchema === "log")
            self.logger.error(msg);
          else
            throw new Error(msg);
        }
      }
    }
    exports2.validateKeywordUsage = validateKeywordUsage;
  }
});

// node_modules/ajv/dist/compile/validate/subschema.js
var require_subschema = __commonJS({
  "node_modules/ajv/dist/compile/validate/subschema.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.extendSubschemaMode = exports2.extendSubschemaData = exports2.getSubschema = void 0;
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    function getSubschema(it, { keyword, schemaProp, schema: schema2, schemaPath, errSchemaPath, topSchemaRef }) {
      if (keyword !== void 0 && schema2 !== void 0) {
        throw new Error('both "keyword" and "schema" passed, only one allowed');
      }
      if (keyword !== void 0) {
        const sch = it.schema[keyword];
        return schemaProp === void 0 ? {
          schema: sch,
          schemaPath: (0, codegen_1._)`${it.schemaPath}${(0, codegen_1.getProperty)(keyword)}`,
          errSchemaPath: `${it.errSchemaPath}/${keyword}`
        } : {
          schema: sch[schemaProp],
          schemaPath: (0, codegen_1._)`${it.schemaPath}${(0, codegen_1.getProperty)(keyword)}${(0, codegen_1.getProperty)(schemaProp)}`,
          errSchemaPath: `${it.errSchemaPath}/${keyword}/${(0, util_1.escapeFragment)(schemaProp)}`
        };
      }
      if (schema2 !== void 0) {
        if (schemaPath === void 0 || errSchemaPath === void 0 || topSchemaRef === void 0) {
          throw new Error('"schemaPath", "errSchemaPath" and "topSchemaRef" are required with "schema"');
        }
        return {
          schema: schema2,
          schemaPath,
          topSchemaRef,
          errSchemaPath
        };
      }
      throw new Error('either "keyword" or "schema" must be passed');
    }
    exports2.getSubschema = getSubschema;
    function extendSubschemaData(subschema, it, { dataProp, dataPropType: dpType, data, dataTypes, propertyName }) {
      if (data !== void 0 && dataProp !== void 0) {
        throw new Error('both "data" and "dataProp" passed, only one allowed');
      }
      const { gen } = it;
      if (dataProp !== void 0) {
        const { errorPath, dataPathArr, opts } = it;
        const nextData = gen.let("data", (0, codegen_1._)`${it.data}${(0, codegen_1.getProperty)(dataProp)}`, true);
        dataContextProps(nextData);
        subschema.errorPath = (0, codegen_1.str)`${errorPath}${(0, util_1.getErrorPath)(dataProp, dpType, opts.jsPropertySyntax)}`;
        subschema.parentDataProperty = (0, codegen_1._)`${dataProp}`;
        subschema.dataPathArr = [...dataPathArr, subschema.parentDataProperty];
      }
      if (data !== void 0) {
        const nextData = data instanceof codegen_1.Name ? data : gen.let("data", data, true);
        dataContextProps(nextData);
        if (propertyName !== void 0)
          subschema.propertyName = propertyName;
      }
      if (dataTypes)
        subschema.dataTypes = dataTypes;
      function dataContextProps(_nextData) {
        subschema.data = _nextData;
        subschema.dataLevel = it.dataLevel + 1;
        subschema.dataTypes = [];
        it.definedProperties = /* @__PURE__ */ new Set();
        subschema.parentData = it.data;
        subschema.dataNames = [...it.dataNames, _nextData];
      }
    }
    exports2.extendSubschemaData = extendSubschemaData;
    function extendSubschemaMode(subschema, { jtdDiscriminator, jtdMetadata, compositeRule, createErrors, allErrors }) {
      if (compositeRule !== void 0)
        subschema.compositeRule = compositeRule;
      if (createErrors !== void 0)
        subschema.createErrors = createErrors;
      if (allErrors !== void 0)
        subschema.allErrors = allErrors;
      subschema.jtdDiscriminator = jtdDiscriminator;
      subschema.jtdMetadata = jtdMetadata;
    }
    exports2.extendSubschemaMode = extendSubschemaMode;
  }
});

// node_modules/fast-deep-equal/index.js
var require_fast_deep_equal = __commonJS({
  "node_modules/fast-deep-equal/index.js"(exports2, module2) {
    "use strict";
    module2.exports = function equal(a, b) {
      if (a === b) return true;
      if (a && b && typeof a == "object" && typeof b == "object") {
        if (a.constructor !== b.constructor) return false;
        var length, i, keys;
        if (Array.isArray(a)) {
          length = a.length;
          if (length != b.length) return false;
          for (i = length; i-- !== 0; )
            if (!equal(a[i], b[i])) return false;
          return true;
        }
        if (a.constructor === RegExp) return a.source === b.source && a.flags === b.flags;
        if (a.valueOf !== Object.prototype.valueOf) return a.valueOf() === b.valueOf();
        if (a.toString !== Object.prototype.toString) return a.toString() === b.toString();
        keys = Object.keys(a);
        length = keys.length;
        if (length !== Object.keys(b).length) return false;
        for (i = length; i-- !== 0; )
          if (!Object.prototype.hasOwnProperty.call(b, keys[i])) return false;
        for (i = length; i-- !== 0; ) {
          var key = keys[i];
          if (!equal(a[key], b[key])) return false;
        }
        return true;
      }
      return a !== a && b !== b;
    };
  }
});

// node_modules/json-schema-traverse/index.js
var require_json_schema_traverse = __commonJS({
  "node_modules/json-schema-traverse/index.js"(exports2, module2) {
    "use strict";
    var traverse = module2.exports = function(schema2, opts, cb) {
      if (typeof opts == "function") {
        cb = opts;
        opts = {};
      }
      cb = opts.cb || cb;
      var pre = typeof cb == "function" ? cb : cb.pre || function() {
      };
      var post = cb.post || function() {
      };
      _traverse(opts, pre, post, schema2, "", schema2);
    };
    traverse.keywords = {
      additionalItems: true,
      items: true,
      contains: true,
      additionalProperties: true,
      propertyNames: true,
      not: true,
      if: true,
      then: true,
      else: true
    };
    traverse.arrayKeywords = {
      items: true,
      allOf: true,
      anyOf: true,
      oneOf: true
    };
    traverse.propsKeywords = {
      $defs: true,
      definitions: true,
      properties: true,
      patternProperties: true,
      dependencies: true
    };
    traverse.skipKeywords = {
      default: true,
      enum: true,
      const: true,
      required: true,
      maximum: true,
      minimum: true,
      exclusiveMaximum: true,
      exclusiveMinimum: true,
      multipleOf: true,
      maxLength: true,
      minLength: true,
      pattern: true,
      format: true,
      maxItems: true,
      minItems: true,
      uniqueItems: true,
      maxProperties: true,
      minProperties: true
    };
    function _traverse(opts, pre, post, schema2, jsonPtr, rootSchema, parentJsonPtr, parentKeyword, parentSchema, keyIndex) {
      if (schema2 && typeof schema2 == "object" && !Array.isArray(schema2)) {
        pre(schema2, jsonPtr, rootSchema, parentJsonPtr, parentKeyword, parentSchema, keyIndex);
        for (var key in schema2) {
          var sch = schema2[key];
          if (Array.isArray(sch)) {
            if (key in traverse.arrayKeywords) {
              for (var i = 0; i < sch.length; i++)
                _traverse(opts, pre, post, sch[i], jsonPtr + "/" + key + "/" + i, rootSchema, jsonPtr, key, schema2, i);
            }
          } else if (key in traverse.propsKeywords) {
            if (sch && typeof sch == "object") {
              for (var prop in sch)
                _traverse(opts, pre, post, sch[prop], jsonPtr + "/" + key + "/" + escapeJsonPtr(prop), rootSchema, jsonPtr, key, schema2, prop);
            }
          } else if (key in traverse.keywords || opts.allKeys && !(key in traverse.skipKeywords)) {
            _traverse(opts, pre, post, sch, jsonPtr + "/" + key, rootSchema, jsonPtr, key, schema2);
          }
        }
        post(schema2, jsonPtr, rootSchema, parentJsonPtr, parentKeyword, parentSchema, keyIndex);
      }
    }
    function escapeJsonPtr(str2) {
      return str2.replace(/~/g, "~0").replace(/\//g, "~1");
    }
  }
});

// node_modules/ajv/dist/compile/resolve.js
var require_resolve = __commonJS({
  "node_modules/ajv/dist/compile/resolve.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.getSchemaRefs = exports2.resolveUrl = exports2.normalizeId = exports2._getFullPath = exports2.getFullPath = exports2.inlineRef = void 0;
    var util_1 = require_util();
    var equal = require_fast_deep_equal();
    var traverse = require_json_schema_traverse();
    var SIMPLE_INLINED = /* @__PURE__ */ new Set([
      "type",
      "format",
      "pattern",
      "maxLength",
      "minLength",
      "maxProperties",
      "minProperties",
      "maxItems",
      "minItems",
      "maximum",
      "minimum",
      "uniqueItems",
      "multipleOf",
      "required",
      "enum",
      "const"
    ]);
    function inlineRef(schema2, limit = true) {
      if (typeof schema2 == "boolean")
        return true;
      if (limit === true)
        return !hasRef(schema2);
      if (!limit)
        return false;
      return countKeys(schema2) <= limit;
    }
    exports2.inlineRef = inlineRef;
    var REF_KEYWORDS = /* @__PURE__ */ new Set([
      "$ref",
      "$recursiveRef",
      "$recursiveAnchor",
      "$dynamicRef",
      "$dynamicAnchor"
    ]);
    function hasRef(schema2) {
      for (const key in schema2) {
        if (REF_KEYWORDS.has(key))
          return true;
        const sch = schema2[key];
        if (Array.isArray(sch) && sch.some(hasRef))
          return true;
        if (typeof sch == "object" && hasRef(sch))
          return true;
      }
      return false;
    }
    function countKeys(schema2) {
      let count = 0;
      for (const key in schema2) {
        if (key === "$ref")
          return Infinity;
        count++;
        if (SIMPLE_INLINED.has(key))
          continue;
        if (typeof schema2[key] == "object") {
          (0, util_1.eachItem)(schema2[key], (sch) => count += countKeys(sch));
        }
        if (count === Infinity)
          return Infinity;
      }
      return count;
    }
    function getFullPath(resolver, id = "", normalize) {
      if (normalize !== false)
        id = normalizeId(id);
      const p = resolver.parse(id);
      return _getFullPath(resolver, p);
    }
    exports2.getFullPath = getFullPath;
    function _getFullPath(resolver, p) {
      const serialized = resolver.serialize(p);
      return serialized.split("#")[0] + "#";
    }
    exports2._getFullPath = _getFullPath;
    var TRAILING_SLASH_HASH = /#\/?$/;
    function normalizeId(id) {
      return id ? id.replace(TRAILING_SLASH_HASH, "") : "";
    }
    exports2.normalizeId = normalizeId;
    function resolveUrl(resolver, baseId, id) {
      id = normalizeId(id);
      return resolver.resolve(baseId, id);
    }
    exports2.resolveUrl = resolveUrl;
    var ANCHOR = /^[a-z_][-a-z0-9._]*$/i;
    function getSchemaRefs(schema2, baseId) {
      if (typeof schema2 == "boolean")
        return {};
      const { schemaId, uriResolver } = this.opts;
      const schId = normalizeId(schema2[schemaId] || baseId);
      const baseIds = { "": schId };
      const pathPrefix = getFullPath(uriResolver, schId, false);
      const localRefs = {};
      const schemaRefs = /* @__PURE__ */ new Set();
      traverse(schema2, { allKeys: true }, (sch, jsonPtr, _, parentJsonPtr) => {
        if (parentJsonPtr === void 0)
          return;
        const fullPath = pathPrefix + jsonPtr;
        let innerBaseId = baseIds[parentJsonPtr];
        if (typeof sch[schemaId] == "string")
          innerBaseId = addRef.call(this, sch[schemaId]);
        addAnchor.call(this, sch.$anchor);
        addAnchor.call(this, sch.$dynamicAnchor);
        baseIds[jsonPtr] = innerBaseId;
        function addRef(ref) {
          const _resolve = this.opts.uriResolver.resolve;
          ref = normalizeId(innerBaseId ? _resolve(innerBaseId, ref) : ref);
          if (schemaRefs.has(ref))
            throw ambiguos(ref);
          schemaRefs.add(ref);
          let schOrRef = this.refs[ref];
          if (typeof schOrRef == "string")
            schOrRef = this.refs[schOrRef];
          if (typeof schOrRef == "object") {
            checkAmbiguosRef(sch, schOrRef.schema, ref);
          } else if (ref !== normalizeId(fullPath)) {
            if (ref[0] === "#") {
              checkAmbiguosRef(sch, localRefs[ref], ref);
              localRefs[ref] = sch;
            } else {
              this.refs[ref] = fullPath;
            }
          }
          return ref;
        }
        function addAnchor(anchor) {
          if (typeof anchor == "string") {
            if (!ANCHOR.test(anchor))
              throw new Error(`invalid anchor "${anchor}"`);
            addRef.call(this, `#${anchor}`);
          }
        }
      });
      return localRefs;
      function checkAmbiguosRef(sch1, sch2, ref) {
        if (sch2 !== void 0 && !equal(sch1, sch2))
          throw ambiguos(ref);
      }
      function ambiguos(ref) {
        return new Error(`reference "${ref}" resolves to more than one schema`);
      }
    }
    exports2.getSchemaRefs = getSchemaRefs;
  }
});

// node_modules/ajv/dist/compile/validate/index.js
var require_validate = __commonJS({
  "node_modules/ajv/dist/compile/validate/index.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.getData = exports2.KeywordCxt = exports2.validateFunctionCode = void 0;
    var boolSchema_1 = require_boolSchema();
    var dataType_1 = require_dataType();
    var applicability_1 = require_applicability();
    var dataType_2 = require_dataType();
    var defaults_1 = require_defaults();
    var keyword_1 = require_keyword();
    var subschema_1 = require_subschema();
    var codegen_1 = require_codegen();
    var names_1 = require_names();
    var resolve_1 = require_resolve();
    var util_1 = require_util();
    var errors_1 = require_errors();
    function validateFunctionCode(it) {
      if (isSchemaObj(it)) {
        checkKeywords(it);
        if (schemaCxtHasRules(it)) {
          topSchemaObjCode(it);
          return;
        }
      }
      validateFunction(it, () => (0, boolSchema_1.topBoolOrEmptySchema)(it));
    }
    exports2.validateFunctionCode = validateFunctionCode;
    function validateFunction({ gen, validateName, schema: schema2, schemaEnv, opts }, body) {
      if (opts.code.es5) {
        gen.func(validateName, (0, codegen_1._)`${names_1.default.data}, ${names_1.default.valCxt}`, schemaEnv.$async, () => {
          gen.code((0, codegen_1._)`"use strict"; ${funcSourceUrl(schema2, opts)}`);
          destructureValCxtES5(gen, opts);
          gen.code(body);
        });
      } else {
        gen.func(validateName, (0, codegen_1._)`${names_1.default.data}, ${destructureValCxt(opts)}`, schemaEnv.$async, () => gen.code(funcSourceUrl(schema2, opts)).code(body));
      }
    }
    function destructureValCxt(opts) {
      return (0, codegen_1._)`{${names_1.default.instancePath}="", ${names_1.default.parentData}, ${names_1.default.parentDataProperty}, ${names_1.default.rootData}=${names_1.default.data}${opts.dynamicRef ? (0, codegen_1._)`, ${names_1.default.dynamicAnchors}={}` : codegen_1.nil}}={}`;
    }
    function destructureValCxtES5(gen, opts) {
      gen.if(names_1.default.valCxt, () => {
        gen.var(names_1.default.instancePath, (0, codegen_1._)`${names_1.default.valCxt}.${names_1.default.instancePath}`);
        gen.var(names_1.default.parentData, (0, codegen_1._)`${names_1.default.valCxt}.${names_1.default.parentData}`);
        gen.var(names_1.default.parentDataProperty, (0, codegen_1._)`${names_1.default.valCxt}.${names_1.default.parentDataProperty}`);
        gen.var(names_1.default.rootData, (0, codegen_1._)`${names_1.default.valCxt}.${names_1.default.rootData}`);
        if (opts.dynamicRef)
          gen.var(names_1.default.dynamicAnchors, (0, codegen_1._)`${names_1.default.valCxt}.${names_1.default.dynamicAnchors}`);
      }, () => {
        gen.var(names_1.default.instancePath, (0, codegen_1._)`""`);
        gen.var(names_1.default.parentData, (0, codegen_1._)`undefined`);
        gen.var(names_1.default.parentDataProperty, (0, codegen_1._)`undefined`);
        gen.var(names_1.default.rootData, names_1.default.data);
        if (opts.dynamicRef)
          gen.var(names_1.default.dynamicAnchors, (0, codegen_1._)`{}`);
      });
    }
    function topSchemaObjCode(it) {
      const { schema: schema2, opts, gen } = it;
      validateFunction(it, () => {
        if (opts.$comment && schema2.$comment)
          commentKeyword(it);
        checkNoDefault(it);
        gen.let(names_1.default.vErrors, null);
        gen.let(names_1.default.errors, 0);
        if (opts.unevaluated)
          resetEvaluated(it);
        typeAndKeywords(it);
        returnResults(it);
      });
      return;
    }
    function resetEvaluated(it) {
      const { gen, validateName } = it;
      it.evaluated = gen.const("evaluated", (0, codegen_1._)`${validateName}.evaluated`);
      gen.if((0, codegen_1._)`${it.evaluated}.dynamicProps`, () => gen.assign((0, codegen_1._)`${it.evaluated}.props`, (0, codegen_1._)`undefined`));
      gen.if((0, codegen_1._)`${it.evaluated}.dynamicItems`, () => gen.assign((0, codegen_1._)`${it.evaluated}.items`, (0, codegen_1._)`undefined`));
    }
    function funcSourceUrl(schema2, opts) {
      const schId = typeof schema2 == "object" && schema2[opts.schemaId];
      return schId && (opts.code.source || opts.code.process) ? (0, codegen_1._)`/*# sourceURL=${schId} */` : codegen_1.nil;
    }
    function subschemaCode(it, valid) {
      if (isSchemaObj(it)) {
        checkKeywords(it);
        if (schemaCxtHasRules(it)) {
          subSchemaObjCode(it, valid);
          return;
        }
      }
      (0, boolSchema_1.boolOrEmptySchema)(it, valid);
    }
    function schemaCxtHasRules({ schema: schema2, self }) {
      if (typeof schema2 == "boolean")
        return !schema2;
      for (const key in schema2)
        if (self.RULES.all[key])
          return true;
      return false;
    }
    function isSchemaObj(it) {
      return typeof it.schema != "boolean";
    }
    function subSchemaObjCode(it, valid) {
      const { schema: schema2, gen, opts } = it;
      if (opts.$comment && schema2.$comment)
        commentKeyword(it);
      updateContext(it);
      checkAsyncSchema(it);
      const errsCount = gen.const("_errs", names_1.default.errors);
      typeAndKeywords(it, errsCount);
      gen.var(valid, (0, codegen_1._)`${errsCount} === ${names_1.default.errors}`);
    }
    function checkKeywords(it) {
      (0, util_1.checkUnknownRules)(it);
      checkRefsAndKeywords(it);
    }
    function typeAndKeywords(it, errsCount) {
      if (it.opts.jtd)
        return schemaKeywords(it, [], false, errsCount);
      const types = (0, dataType_1.getSchemaTypes)(it.schema);
      const checkedTypes = (0, dataType_1.coerceAndCheckDataType)(it, types);
      schemaKeywords(it, types, !checkedTypes, errsCount);
    }
    function checkRefsAndKeywords(it) {
      const { schema: schema2, errSchemaPath, opts, self } = it;
      if (schema2.$ref && opts.ignoreKeywordsWithRef && (0, util_1.schemaHasRulesButRef)(schema2, self.RULES)) {
        self.logger.warn(`$ref: keywords ignored in schema at path "${errSchemaPath}"`);
      }
    }
    function checkNoDefault(it) {
      const { schema: schema2, opts } = it;
      if (schema2.default !== void 0 && opts.useDefaults && opts.strictSchema) {
        (0, util_1.checkStrictMode)(it, "default is ignored in the schema root");
      }
    }
    function updateContext(it) {
      const schId = it.schema[it.opts.schemaId];
      if (schId)
        it.baseId = (0, resolve_1.resolveUrl)(it.opts.uriResolver, it.baseId, schId);
    }
    function checkAsyncSchema(it) {
      if (it.schema.$async && !it.schemaEnv.$async)
        throw new Error("async schema in sync schema");
    }
    function commentKeyword({ gen, schemaEnv, schema: schema2, errSchemaPath, opts }) {
      const msg = schema2.$comment;
      if (opts.$comment === true) {
        gen.code((0, codegen_1._)`${names_1.default.self}.logger.log(${msg})`);
      } else if (typeof opts.$comment == "function") {
        const schemaPath = (0, codegen_1.str)`${errSchemaPath}/$comment`;
        const rootName = gen.scopeValue("root", { ref: schemaEnv.root });
        gen.code((0, codegen_1._)`${names_1.default.self}.opts.$comment(${msg}, ${schemaPath}, ${rootName}.schema)`);
      }
    }
    function returnResults(it) {
      const { gen, schemaEnv, validateName, ValidationError, opts } = it;
      if (schemaEnv.$async) {
        gen.if((0, codegen_1._)`${names_1.default.errors} === 0`, () => gen.return(names_1.default.data), () => gen.throw((0, codegen_1._)`new ${ValidationError}(${names_1.default.vErrors})`));
      } else {
        gen.assign((0, codegen_1._)`${validateName}.errors`, names_1.default.vErrors);
        if (opts.unevaluated)
          assignEvaluated(it);
        gen.return((0, codegen_1._)`${names_1.default.errors} === 0`);
      }
    }
    function assignEvaluated({ gen, evaluated, props, items }) {
      if (props instanceof codegen_1.Name)
        gen.assign((0, codegen_1._)`${evaluated}.props`, props);
      if (items instanceof codegen_1.Name)
        gen.assign((0, codegen_1._)`${evaluated}.items`, items);
    }
    function schemaKeywords(it, types, typeErrors, errsCount) {
      const { gen, schema: schema2, data, allErrors, opts, self } = it;
      const { RULES } = self;
      if (schema2.$ref && (opts.ignoreKeywordsWithRef || !(0, util_1.schemaHasRulesButRef)(schema2, RULES))) {
        gen.block(() => keywordCode(it, "$ref", RULES.all.$ref.definition));
        return;
      }
      if (!opts.jtd)
        checkStrictTypes(it, types);
      gen.block(() => {
        for (const group of RULES.rules)
          groupKeywords(group);
        groupKeywords(RULES.post);
      });
      function groupKeywords(group) {
        if (!(0, applicability_1.shouldUseGroup)(schema2, group))
          return;
        if (group.type) {
          gen.if((0, dataType_2.checkDataType)(group.type, data, opts.strictNumbers));
          iterateKeywords(it, group);
          if (types.length === 1 && types[0] === group.type && typeErrors) {
            gen.else();
            (0, dataType_2.reportTypeError)(it);
          }
          gen.endIf();
        } else {
          iterateKeywords(it, group);
        }
        if (!allErrors)
          gen.if((0, codegen_1._)`${names_1.default.errors} === ${errsCount || 0}`);
      }
    }
    function iterateKeywords(it, group) {
      const { gen, schema: schema2, opts: { useDefaults } } = it;
      if (useDefaults)
        (0, defaults_1.assignDefaults)(it, group.type);
      gen.block(() => {
        for (const rule of group.rules) {
          if ((0, applicability_1.shouldUseRule)(schema2, rule)) {
            keywordCode(it, rule.keyword, rule.definition, group.type);
          }
        }
      });
    }
    function checkStrictTypes(it, types) {
      if (it.schemaEnv.meta || !it.opts.strictTypes)
        return;
      checkContextTypes(it, types);
      if (!it.opts.allowUnionTypes)
        checkMultipleTypes(it, types);
      checkKeywordTypes(it, it.dataTypes);
    }
    function checkContextTypes(it, types) {
      if (!types.length)
        return;
      if (!it.dataTypes.length) {
        it.dataTypes = types;
        return;
      }
      types.forEach((t) => {
        if (!includesType(it.dataTypes, t)) {
          strictTypesError(it, `type "${t}" not allowed by context "${it.dataTypes.join(",")}"`);
        }
      });
      narrowSchemaTypes(it, types);
    }
    function checkMultipleTypes(it, ts) {
      if (ts.length > 1 && !(ts.length === 2 && ts.includes("null"))) {
        strictTypesError(it, "use allowUnionTypes to allow union type keyword");
      }
    }
    function checkKeywordTypes(it, ts) {
      const rules = it.self.RULES.all;
      for (const keyword in rules) {
        const rule = rules[keyword];
        if (typeof rule == "object" && (0, applicability_1.shouldUseRule)(it.schema, rule)) {
          const { type: type2 } = rule.definition;
          if (type2.length && !type2.some((t) => hasApplicableType(ts, t))) {
            strictTypesError(it, `missing type "${type2.join(",")}" for keyword "${keyword}"`);
          }
        }
      }
    }
    function hasApplicableType(schTs, kwdT) {
      return schTs.includes(kwdT) || kwdT === "number" && schTs.includes("integer");
    }
    function includesType(ts, t) {
      return ts.includes(t) || t === "integer" && ts.includes("number");
    }
    function narrowSchemaTypes(it, withTypes) {
      const ts = [];
      for (const t of it.dataTypes) {
        if (includesType(withTypes, t))
          ts.push(t);
        else if (withTypes.includes("integer") && t === "number")
          ts.push("integer");
      }
      it.dataTypes = ts;
    }
    function strictTypesError(it, msg) {
      const schemaPath = it.schemaEnv.baseId + it.errSchemaPath;
      msg += ` at "${schemaPath}" (strictTypes)`;
      (0, util_1.checkStrictMode)(it, msg, it.opts.strictTypes);
    }
    var KeywordCxt = class {
      constructor(it, def, keyword) {
        (0, keyword_1.validateKeywordUsage)(it, def, keyword);
        this.gen = it.gen;
        this.allErrors = it.allErrors;
        this.keyword = keyword;
        this.data = it.data;
        this.schema = it.schema[keyword];
        this.$data = def.$data && it.opts.$data && this.schema && this.schema.$data;
        this.schemaValue = (0, util_1.schemaRefOrVal)(it, this.schema, keyword, this.$data);
        this.schemaType = def.schemaType;
        this.parentSchema = it.schema;
        this.params = {};
        this.it = it;
        this.def = def;
        if (this.$data) {
          this.schemaCode = it.gen.const("vSchema", getData(this.$data, it));
        } else {
          this.schemaCode = this.schemaValue;
          if (!(0, keyword_1.validSchemaType)(this.schema, def.schemaType, def.allowUndefined)) {
            throw new Error(`${keyword} value must be ${JSON.stringify(def.schemaType)}`);
          }
        }
        if ("code" in def ? def.trackErrors : def.errors !== false) {
          this.errsCount = it.gen.const("_errs", names_1.default.errors);
        }
      }
      result(condition, successAction, failAction) {
        this.failResult((0, codegen_1.not)(condition), successAction, failAction);
      }
      failResult(condition, successAction, failAction) {
        this.gen.if(condition);
        if (failAction)
          failAction();
        else
          this.error();
        if (successAction) {
          this.gen.else();
          successAction();
          if (this.allErrors)
            this.gen.endIf();
        } else {
          if (this.allErrors)
            this.gen.endIf();
          else
            this.gen.else();
        }
      }
      pass(condition, failAction) {
        this.failResult((0, codegen_1.not)(condition), void 0, failAction);
      }
      fail(condition) {
        if (condition === void 0) {
          this.error();
          if (!this.allErrors)
            this.gen.if(false);
          return;
        }
        this.gen.if(condition);
        this.error();
        if (this.allErrors)
          this.gen.endIf();
        else
          this.gen.else();
      }
      fail$data(condition) {
        if (!this.$data)
          return this.fail(condition);
        const { schemaCode } = this;
        this.fail((0, codegen_1._)`${schemaCode} !== undefined && (${(0, codegen_1.or)(this.invalid$data(), condition)})`);
      }
      error(append, errorParams, errorPaths) {
        if (errorParams) {
          this.setParams(errorParams);
          this._error(append, errorPaths);
          this.setParams({});
          return;
        }
        this._error(append, errorPaths);
      }
      _error(append, errorPaths) {
        ;
        (append ? errors_1.reportExtraError : errors_1.reportError)(this, this.def.error, errorPaths);
      }
      $dataError() {
        (0, errors_1.reportError)(this, this.def.$dataError || errors_1.keyword$DataError);
      }
      reset() {
        if (this.errsCount === void 0)
          throw new Error('add "trackErrors" to keyword definition');
        (0, errors_1.resetErrorsCount)(this.gen, this.errsCount);
      }
      ok(cond) {
        if (!this.allErrors)
          this.gen.if(cond);
      }
      setParams(obj, assign) {
        if (assign)
          Object.assign(this.params, obj);
        else
          this.params = obj;
      }
      block$data(valid, codeBlock, $dataValid = codegen_1.nil) {
        this.gen.block(() => {
          this.check$data(valid, $dataValid);
          codeBlock();
        });
      }
      check$data(valid = codegen_1.nil, $dataValid = codegen_1.nil) {
        if (!this.$data)
          return;
        const { gen, schemaCode, schemaType, def } = this;
        gen.if((0, codegen_1.or)((0, codegen_1._)`${schemaCode} === undefined`, $dataValid));
        if (valid !== codegen_1.nil)
          gen.assign(valid, true);
        if (schemaType.length || def.validateSchema) {
          gen.elseIf(this.invalid$data());
          this.$dataError();
          if (valid !== codegen_1.nil)
            gen.assign(valid, false);
        }
        gen.else();
      }
      invalid$data() {
        const { gen, schemaCode, schemaType, def, it } = this;
        return (0, codegen_1.or)(wrong$DataType(), invalid$DataSchema());
        function wrong$DataType() {
          if (schemaType.length) {
            if (!(schemaCode instanceof codegen_1.Name))
              throw new Error("ajv implementation error");
            const st = Array.isArray(schemaType) ? schemaType : [schemaType];
            return (0, codegen_1._)`${(0, dataType_2.checkDataTypes)(st, schemaCode, it.opts.strictNumbers, dataType_2.DataType.Wrong)}`;
          }
          return codegen_1.nil;
        }
        function invalid$DataSchema() {
          if (def.validateSchema) {
            const validateSchemaRef = gen.scopeValue("validate$data", { ref: def.validateSchema });
            return (0, codegen_1._)`!${validateSchemaRef}(${schemaCode})`;
          }
          return codegen_1.nil;
        }
      }
      subschema(appl, valid) {
        const subschema = (0, subschema_1.getSubschema)(this.it, appl);
        (0, subschema_1.extendSubschemaData)(subschema, this.it, appl);
        (0, subschema_1.extendSubschemaMode)(subschema, appl);
        const nextContext = { ...this.it, ...subschema, items: void 0, props: void 0 };
        subschemaCode(nextContext, valid);
        return nextContext;
      }
      mergeEvaluated(schemaCxt, toName) {
        const { it, gen } = this;
        if (!it.opts.unevaluated)
          return;
        if (it.props !== true && schemaCxt.props !== void 0) {
          it.props = util_1.mergeEvaluated.props(gen, schemaCxt.props, it.props, toName);
        }
        if (it.items !== true && schemaCxt.items !== void 0) {
          it.items = util_1.mergeEvaluated.items(gen, schemaCxt.items, it.items, toName);
        }
      }
      mergeValidEvaluated(schemaCxt, valid) {
        const { it, gen } = this;
        if (it.opts.unevaluated && (it.props !== true || it.items !== true)) {
          gen.if(valid, () => this.mergeEvaluated(schemaCxt, codegen_1.Name));
          return true;
        }
      }
    };
    exports2.KeywordCxt = KeywordCxt;
    function keywordCode(it, keyword, def, ruleType) {
      const cxt = new KeywordCxt(it, def, keyword);
      if ("code" in def) {
        def.code(cxt, ruleType);
      } else if (cxt.$data && def.validate) {
        (0, keyword_1.funcKeywordCode)(cxt, def);
      } else if ("macro" in def) {
        (0, keyword_1.macroKeywordCode)(cxt, def);
      } else if (def.compile || def.validate) {
        (0, keyword_1.funcKeywordCode)(cxt, def);
      }
    }
    var JSON_POINTER = /^\/(?:[^~]|~0|~1)*$/;
    var RELATIVE_JSON_POINTER = /^([0-9]+)(#|\/(?:[^~]|~0|~1)*)?$/;
    function getData($data, { dataLevel, dataNames, dataPathArr }) {
      let jsonPointer;
      let data;
      if ($data === "")
        return names_1.default.rootData;
      if ($data[0] === "/") {
        if (!JSON_POINTER.test($data))
          throw new Error(`Invalid JSON-pointer: ${$data}`);
        jsonPointer = $data;
        data = names_1.default.rootData;
      } else {
        const matches = RELATIVE_JSON_POINTER.exec($data);
        if (!matches)
          throw new Error(`Invalid JSON-pointer: ${$data}`);
        const up = +matches[1];
        jsonPointer = matches[2];
        if (jsonPointer === "#") {
          if (up >= dataLevel)
            throw new Error(errorMsg("property/index", up));
          return dataPathArr[dataLevel - up];
        }
        if (up > dataLevel)
          throw new Error(errorMsg("data", up));
        data = dataNames[dataLevel - up];
        if (!jsonPointer)
          return data;
      }
      let expr = data;
      const segments = jsonPointer.split("/");
      for (const segment of segments) {
        if (segment) {
          data = (0, codegen_1._)`${data}${(0, codegen_1.getProperty)((0, util_1.unescapeJsonPointer)(segment))}`;
          expr = (0, codegen_1._)`${expr} && ${data}`;
        }
      }
      return expr;
      function errorMsg(pointerType, up) {
        return `Cannot access ${pointerType} ${up} levels up, current level is ${dataLevel}`;
      }
    }
    exports2.getData = getData;
  }
});

// node_modules/ajv/dist/runtime/validation_error.js
var require_validation_error = __commonJS({
  "node_modules/ajv/dist/runtime/validation_error.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    var ValidationError = class extends Error {
      constructor(errors) {
        super("validation failed");
        this.errors = errors;
        this.ajv = this.validation = true;
      }
    };
    exports2.default = ValidationError;
  }
});

// node_modules/ajv/dist/compile/ref_error.js
var require_ref_error = __commonJS({
  "node_modules/ajv/dist/compile/ref_error.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    var resolve_1 = require_resolve();
    var MissingRefError = class extends Error {
      constructor(resolver, baseId, ref, msg) {
        super(msg || `can't resolve reference ${ref} from id ${baseId}`);
        this.missingRef = (0, resolve_1.resolveUrl)(resolver, baseId, ref);
        this.missingSchema = (0, resolve_1.normalizeId)((0, resolve_1.getFullPath)(resolver, this.missingRef));
      }
    };
    exports2.default = MissingRefError;
  }
});

// node_modules/ajv/dist/compile/index.js
var require_compile = __commonJS({
  "node_modules/ajv/dist/compile/index.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.resolveSchema = exports2.getCompilingSchema = exports2.resolveRef = exports2.compileSchema = exports2.SchemaEnv = void 0;
    var codegen_1 = require_codegen();
    var validation_error_1 = require_validation_error();
    var names_1 = require_names();
    var resolve_1 = require_resolve();
    var util_1 = require_util();
    var validate_1 = require_validate();
    var SchemaEnv = class {
      constructor(env3) {
        var _a;
        this.refs = {};
        this.dynamicAnchors = {};
        let schema2;
        if (typeof env3.schema == "object")
          schema2 = env3.schema;
        this.schema = env3.schema;
        this.schemaId = env3.schemaId;
        this.root = env3.root || this;
        this.baseId = (_a = env3.baseId) !== null && _a !== void 0 ? _a : (0, resolve_1.normalizeId)(schema2 === null || schema2 === void 0 ? void 0 : schema2[env3.schemaId || "$id"]);
        this.schemaPath = env3.schemaPath;
        this.localRefs = env3.localRefs;
        this.meta = env3.meta;
        this.$async = schema2 === null || schema2 === void 0 ? void 0 : schema2.$async;
        this.refs = {};
      }
    };
    exports2.SchemaEnv = SchemaEnv;
    function compileSchema(sch) {
      const _sch = getCompilingSchema.call(this, sch);
      if (_sch)
        return _sch;
      const rootId = (0, resolve_1.getFullPath)(this.opts.uriResolver, sch.root.baseId);
      const { es5, lines } = this.opts.code;
      const { ownProperties } = this.opts;
      const gen = new codegen_1.CodeGen(this.scope, { es5, lines, ownProperties });
      let _ValidationError;
      if (sch.$async) {
        _ValidationError = gen.scopeValue("Error", {
          ref: validation_error_1.default,
          code: (0, codegen_1._)`require("ajv/dist/runtime/validation_error").default`
        });
      }
      const validateName = gen.scopeName("validate");
      sch.validateName = validateName;
      const schemaCxt = {
        gen,
        allErrors: this.opts.allErrors,
        data: names_1.default.data,
        parentData: names_1.default.parentData,
        parentDataProperty: names_1.default.parentDataProperty,
        dataNames: [names_1.default.data],
        dataPathArr: [codegen_1.nil],
        // TODO can its length be used as dataLevel if nil is removed?
        dataLevel: 0,
        dataTypes: [],
        definedProperties: /* @__PURE__ */ new Set(),
        topSchemaRef: gen.scopeValue("schema", this.opts.code.source === true ? { ref: sch.schema, code: (0, codegen_1.stringify)(sch.schema) } : { ref: sch.schema }),
        validateName,
        ValidationError: _ValidationError,
        schema: sch.schema,
        schemaEnv: sch,
        rootId,
        baseId: sch.baseId || rootId,
        schemaPath: codegen_1.nil,
        errSchemaPath: sch.schemaPath || (this.opts.jtd ? "" : "#"),
        errorPath: (0, codegen_1._)`""`,
        opts: this.opts,
        self: this
      };
      let sourceCode;
      try {
        this._compilations.add(sch);
        (0, validate_1.validateFunctionCode)(schemaCxt);
        gen.optimize(this.opts.code.optimize);
        const validateCode = gen.toString();
        sourceCode = `${gen.scopeRefs(names_1.default.scope)}return ${validateCode}`;
        if (this.opts.code.process)
          sourceCode = this.opts.code.process(sourceCode, sch);
        const makeValidate = new Function(`${names_1.default.self}`, `${names_1.default.scope}`, sourceCode);
        const validate = makeValidate(this, this.scope.get());
        this.scope.value(validateName, { ref: validate });
        validate.errors = null;
        validate.schema = sch.schema;
        validate.schemaEnv = sch;
        if (sch.$async)
          validate.$async = true;
        if (this.opts.code.source === true) {
          validate.source = { validateName, validateCode, scopeValues: gen._values };
        }
        if (this.opts.unevaluated) {
          const { props, items } = schemaCxt;
          validate.evaluated = {
            props: props instanceof codegen_1.Name ? void 0 : props,
            items: items instanceof codegen_1.Name ? void 0 : items,
            dynamicProps: props instanceof codegen_1.Name,
            dynamicItems: items instanceof codegen_1.Name
          };
          if (validate.source)
            validate.source.evaluated = (0, codegen_1.stringify)(validate.evaluated);
        }
        sch.validate = validate;
        return sch;
      } catch (e) {
        delete sch.validate;
        delete sch.validateName;
        if (sourceCode)
          this.logger.error("Error compiling schema, function code:", sourceCode);
        throw e;
      } finally {
        this._compilations.delete(sch);
      }
    }
    exports2.compileSchema = compileSchema;
    function resolveRef(root, baseId, ref) {
      var _a;
      ref = (0, resolve_1.resolveUrl)(this.opts.uriResolver, baseId, ref);
      const schOrFunc = root.refs[ref];
      if (schOrFunc)
        return schOrFunc;
      let _sch = resolve.call(this, root, ref);
      if (_sch === void 0) {
        const schema2 = (_a = root.localRefs) === null || _a === void 0 ? void 0 : _a[ref];
        const { schemaId } = this.opts;
        if (schema2)
          _sch = new SchemaEnv({ schema: schema2, schemaId, root, baseId });
      }
      if (_sch === void 0)
        return;
      return root.refs[ref] = inlineOrCompile.call(this, _sch);
    }
    exports2.resolveRef = resolveRef;
    function inlineOrCompile(sch) {
      if ((0, resolve_1.inlineRef)(sch.schema, this.opts.inlineRefs))
        return sch.schema;
      return sch.validate ? sch : compileSchema.call(this, sch);
    }
    function getCompilingSchema(schEnv) {
      for (const sch of this._compilations) {
        if (sameSchemaEnv(sch, schEnv))
          return sch;
      }
    }
    exports2.getCompilingSchema = getCompilingSchema;
    function sameSchemaEnv(s1, s2) {
      return s1.schema === s2.schema && s1.root === s2.root && s1.baseId === s2.baseId;
    }
    function resolve(root, ref) {
      let sch;
      while (typeof (sch = this.refs[ref]) == "string")
        ref = sch;
      return sch || this.schemas[ref] || resolveSchema.call(this, root, ref);
    }
    function resolveSchema(root, ref) {
      const p = this.opts.uriResolver.parse(ref);
      const refPath = (0, resolve_1._getFullPath)(this.opts.uriResolver, p);
      let baseId = (0, resolve_1.getFullPath)(this.opts.uriResolver, root.baseId, void 0);
      if (Object.keys(root.schema).length > 0 && refPath === baseId) {
        return getJsonPointer.call(this, p, root);
      }
      const id = (0, resolve_1.normalizeId)(refPath);
      const schOrRef = this.refs[id] || this.schemas[id];
      if (typeof schOrRef == "string") {
        const sch = resolveSchema.call(this, root, schOrRef);
        if (typeof (sch === null || sch === void 0 ? void 0 : sch.schema) !== "object")
          return;
        return getJsonPointer.call(this, p, sch);
      }
      if (typeof (schOrRef === null || schOrRef === void 0 ? void 0 : schOrRef.schema) !== "object")
        return;
      if (!schOrRef.validate)
        compileSchema.call(this, schOrRef);
      if (id === (0, resolve_1.normalizeId)(ref)) {
        const { schema: schema2 } = schOrRef;
        const { schemaId } = this.opts;
        const schId = schema2[schemaId];
        if (schId)
          baseId = (0, resolve_1.resolveUrl)(this.opts.uriResolver, baseId, schId);
        return new SchemaEnv({ schema: schema2, schemaId, root, baseId });
      }
      return getJsonPointer.call(this, p, schOrRef);
    }
    exports2.resolveSchema = resolveSchema;
    var PREVENT_SCOPE_CHANGE = /* @__PURE__ */ new Set([
      "properties",
      "patternProperties",
      "enum",
      "dependencies",
      "definitions"
    ]);
    function getJsonPointer(parsedRef, { baseId, schema: schema2, root }) {
      var _a;
      if (((_a = parsedRef.fragment) === null || _a === void 0 ? void 0 : _a[0]) !== "/")
        return;
      for (const part of parsedRef.fragment.slice(1).split("/")) {
        if (typeof schema2 === "boolean")
          return;
        const partSchema = schema2[(0, util_1.unescapeFragment)(part)];
        if (partSchema === void 0)
          return;
        schema2 = partSchema;
        const schId = typeof schema2 === "object" && schema2[this.opts.schemaId];
        if (!PREVENT_SCOPE_CHANGE.has(part) && schId) {
          baseId = (0, resolve_1.resolveUrl)(this.opts.uriResolver, baseId, schId);
        }
      }
      let env3;
      if (typeof schema2 != "boolean" && schema2.$ref && !(0, util_1.schemaHasRulesButRef)(schema2, this.RULES)) {
        const $ref = (0, resolve_1.resolveUrl)(this.opts.uriResolver, baseId, schema2.$ref);
        env3 = resolveSchema.call(this, root, $ref);
      }
      const { schemaId } = this.opts;
      env3 = env3 || new SchemaEnv({ schema: schema2, schemaId, root, baseId });
      if (env3.schema !== env3.root.schema)
        return env3;
      return void 0;
    }
  }
});

// node_modules/ajv/dist/refs/data.json
var require_data = __commonJS({
  "node_modules/ajv/dist/refs/data.json"(exports2, module2) {
    module2.exports = {
      $id: "https://raw.githubusercontent.com/ajv-validator/ajv/master/lib/refs/data.json#",
      description: "Meta-schema for $data reference (JSON AnySchema extension proposal)",
      type: "object",
      required: ["$data"],
      properties: {
        $data: {
          type: "string",
          anyOf: [{ format: "relative-json-pointer" }, { format: "json-pointer" }]
        }
      },
      additionalProperties: false
    };
  }
});

// node_modules/fast-uri/lib/utils.js
var require_utils = __commonJS({
  "node_modules/fast-uri/lib/utils.js"(exports2, module2) {
    "use strict";
    var isUUID = RegExp.prototype.test.bind(/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/iu);
    var isIPv4 = RegExp.prototype.test.bind(/^(?:(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]\d|\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]\d|\d)$/u);
    function stringArrayToHexStripped(input) {
      let acc = "";
      let code = 0;
      let i = 0;
      for (i = 0; i < input.length; i++) {
        code = input[i].charCodeAt(0);
        if (code === 48) {
          continue;
        }
        if (!(code >= 48 && code <= 57 || code >= 65 && code <= 70 || code >= 97 && code <= 102)) {
          return "";
        }
        acc += input[i];
        break;
      }
      for (i += 1; i < input.length; i++) {
        code = input[i].charCodeAt(0);
        if (!(code >= 48 && code <= 57 || code >= 65 && code <= 70 || code >= 97 && code <= 102)) {
          return "";
        }
        acc += input[i];
      }
      return acc;
    }
    var nonSimpleDomain = RegExp.prototype.test.bind(/[^!"$&'()*+,\-.;=_`a-z{}~]/u);
    function consumeIsZone(buffer) {
      buffer.length = 0;
      return true;
    }
    function consumeHextets(buffer, address, output) {
      if (buffer.length) {
        const hex = stringArrayToHexStripped(buffer);
        if (hex !== "") {
          address.push(hex);
        } else {
          output.error = true;
          return false;
        }
        buffer.length = 0;
      }
      return true;
    }
    function getIPV6(input) {
      let tokenCount = 0;
      const output = { error: false, address: "", zone: "" };
      const address = [];
      const buffer = [];
      let endipv6Encountered = false;
      let endIpv6 = false;
      let consume = consumeHextets;
      for (let i = 0; i < input.length; i++) {
        const cursor = input[i];
        if (cursor === "[" || cursor === "]") {
          continue;
        }
        if (cursor === ":") {
          if (endipv6Encountered === true) {
            endIpv6 = true;
          }
          if (!consume(buffer, address, output)) {
            break;
          }
          if (++tokenCount > 7) {
            output.error = true;
            break;
          }
          if (i > 0 && input[i - 1] === ":") {
            endipv6Encountered = true;
          }
          address.push(":");
          continue;
        } else if (cursor === "%") {
          if (!consume(buffer, address, output)) {
            break;
          }
          consume = consumeIsZone;
        } else {
          buffer.push(cursor);
          continue;
        }
      }
      if (buffer.length) {
        if (consume === consumeIsZone) {
          output.zone = buffer.join("");
        } else if (endIpv6) {
          address.push(buffer.join(""));
        } else {
          address.push(stringArrayToHexStripped(buffer));
        }
      }
      output.address = address.join("");
      return output;
    }
    function normalizeIPv6(host) {
      if (findToken(host, ":") < 2) {
        return { host, isIPV6: false };
      }
      const ipv6 = getIPV6(host);
      if (!ipv6.error) {
        let newHost = ipv6.address;
        let escapedHost = ipv6.address;
        if (ipv6.zone) {
          newHost += "%" + ipv6.zone;
          escapedHost += "%25" + ipv6.zone;
        }
        return { host: newHost, isIPV6: true, escapedHost };
      } else {
        return { host, isIPV6: false };
      }
    }
    function findToken(str2, token) {
      let ind = 0;
      for (let i = 0; i < str2.length; i++) {
        if (str2[i] === token) ind++;
      }
      return ind;
    }
    function removeDotSegments(path15) {
      let input = path15;
      const output = [];
      let nextSlash = -1;
      let len = 0;
      while (len = input.length) {
        if (len === 1) {
          if (input === ".") {
            break;
          } else if (input === "/") {
            output.push("/");
            break;
          } else {
            output.push(input);
            break;
          }
        } else if (len === 2) {
          if (input[0] === ".") {
            if (input[1] === ".") {
              break;
            } else if (input[1] === "/") {
              input = input.slice(2);
              continue;
            }
          } else if (input[0] === "/") {
            if (input[1] === "." || input[1] === "/") {
              output.push("/");
              break;
            }
          }
        } else if (len === 3) {
          if (input === "/..") {
            if (output.length !== 0) {
              output.pop();
            }
            output.push("/");
            break;
          }
        }
        if (input[0] === ".") {
          if (input[1] === ".") {
            if (input[2] === "/") {
              input = input.slice(3);
              continue;
            }
          } else if (input[1] === "/") {
            input = input.slice(2);
            continue;
          }
        } else if (input[0] === "/") {
          if (input[1] === ".") {
            if (input[2] === "/") {
              input = input.slice(2);
              continue;
            } else if (input[2] === ".") {
              if (input[3] === "/") {
                input = input.slice(3);
                if (output.length !== 0) {
                  output.pop();
                }
                continue;
              }
            }
          }
        }
        if ((nextSlash = input.indexOf("/", 1)) === -1) {
          output.push(input);
          break;
        } else {
          output.push(input.slice(0, nextSlash));
          input = input.slice(nextSlash);
        }
      }
      return output.join("");
    }
    function normalizeComponentEncoding(component, esc) {
      const func = esc !== true ? escape : unescape;
      if (component.scheme !== void 0) {
        component.scheme = func(component.scheme);
      }
      if (component.userinfo !== void 0) {
        component.userinfo = func(component.userinfo);
      }
      if (component.host !== void 0) {
        component.host = func(component.host);
      }
      if (component.path !== void 0) {
        component.path = func(component.path);
      }
      if (component.query !== void 0) {
        component.query = func(component.query);
      }
      if (component.fragment !== void 0) {
        component.fragment = func(component.fragment);
      }
      return component;
    }
    function recomposeAuthority(component) {
      const uriTokens = [];
      if (component.userinfo !== void 0) {
        uriTokens.push(component.userinfo);
        uriTokens.push("@");
      }
      if (component.host !== void 0) {
        let host = unescape(component.host);
        if (!isIPv4(host)) {
          const ipV6res = normalizeIPv6(host);
          if (ipV6res.isIPV6 === true) {
            host = `[${ipV6res.escapedHost}]`;
          } else {
            host = component.host;
          }
        }
        uriTokens.push(host);
      }
      if (typeof component.port === "number" || typeof component.port === "string") {
        uriTokens.push(":");
        uriTokens.push(String(component.port));
      }
      return uriTokens.length ? uriTokens.join("") : void 0;
    }
    module2.exports = {
      nonSimpleDomain,
      recomposeAuthority,
      normalizeComponentEncoding,
      removeDotSegments,
      isIPv4,
      isUUID,
      normalizeIPv6,
      stringArrayToHexStripped
    };
  }
});

// node_modules/fast-uri/lib/schemes.js
var require_schemes = __commonJS({
  "node_modules/fast-uri/lib/schemes.js"(exports2, module2) {
    "use strict";
    var { isUUID } = require_utils();
    var URN_REG = /([\da-z][\d\-a-z]{0,31}):((?:[\w!$'()*+,\-.:;=@]|%[\da-f]{2})+)/iu;
    var supportedSchemeNames = (
      /** @type {const} */
      [
        "http",
        "https",
        "ws",
        "wss",
        "urn",
        "urn:uuid"
      ]
    );
    function isValidSchemeName(name) {
      return supportedSchemeNames.indexOf(
        /** @type {*} */
        name
      ) !== -1;
    }
    function wsIsSecure(wsComponent) {
      if (wsComponent.secure === true) {
        return true;
      } else if (wsComponent.secure === false) {
        return false;
      } else if (wsComponent.scheme) {
        return wsComponent.scheme.length === 3 && (wsComponent.scheme[0] === "w" || wsComponent.scheme[0] === "W") && (wsComponent.scheme[1] === "s" || wsComponent.scheme[1] === "S") && (wsComponent.scheme[2] === "s" || wsComponent.scheme[2] === "S");
      } else {
        return false;
      }
    }
    function httpParse(component) {
      if (!component.host) {
        component.error = component.error || "HTTP URIs must have a host.";
      }
      return component;
    }
    function httpSerialize(component) {
      const secure = String(component.scheme).toLowerCase() === "https";
      if (component.port === (secure ? 443 : 80) || component.port === "") {
        component.port = void 0;
      }
      if (!component.path) {
        component.path = "/";
      }
      return component;
    }
    function wsParse(wsComponent) {
      wsComponent.secure = wsIsSecure(wsComponent);
      wsComponent.resourceName = (wsComponent.path || "/") + (wsComponent.query ? "?" + wsComponent.query : "");
      wsComponent.path = void 0;
      wsComponent.query = void 0;
      return wsComponent;
    }
    function wsSerialize(wsComponent) {
      if (wsComponent.port === (wsIsSecure(wsComponent) ? 443 : 80) || wsComponent.port === "") {
        wsComponent.port = void 0;
      }
      if (typeof wsComponent.secure === "boolean") {
        wsComponent.scheme = wsComponent.secure ? "wss" : "ws";
        wsComponent.secure = void 0;
      }
      if (wsComponent.resourceName) {
        const [path15, query] = wsComponent.resourceName.split("?");
        wsComponent.path = path15 && path15 !== "/" ? path15 : void 0;
        wsComponent.query = query;
        wsComponent.resourceName = void 0;
      }
      wsComponent.fragment = void 0;
      return wsComponent;
    }
    function urnParse(urnComponent, options) {
      if (!urnComponent.path) {
        urnComponent.error = "URN can not be parsed";
        return urnComponent;
      }
      const matches = urnComponent.path.match(URN_REG);
      if (matches) {
        const scheme = options.scheme || urnComponent.scheme || "urn";
        urnComponent.nid = matches[1].toLowerCase();
        urnComponent.nss = matches[2];
        const urnScheme = `${scheme}:${options.nid || urnComponent.nid}`;
        const schemeHandler = getSchemeHandler(urnScheme);
        urnComponent.path = void 0;
        if (schemeHandler) {
          urnComponent = schemeHandler.parse(urnComponent, options);
        }
      } else {
        urnComponent.error = urnComponent.error || "URN can not be parsed.";
      }
      return urnComponent;
    }
    function urnSerialize(urnComponent, options) {
      if (urnComponent.nid === void 0) {
        throw new Error("URN without nid cannot be serialized");
      }
      const scheme = options.scheme || urnComponent.scheme || "urn";
      const nid = urnComponent.nid.toLowerCase();
      const urnScheme = `${scheme}:${options.nid || nid}`;
      const schemeHandler = getSchemeHandler(urnScheme);
      if (schemeHandler) {
        urnComponent = schemeHandler.serialize(urnComponent, options);
      }
      const uriComponent = urnComponent;
      const nss = urnComponent.nss;
      uriComponent.path = `${nid || options.nid}:${nss}`;
      options.skipEscape = true;
      return uriComponent;
    }
    function urnuuidParse(urnComponent, options) {
      const uuidComponent = urnComponent;
      uuidComponent.uuid = uuidComponent.nss;
      uuidComponent.nss = void 0;
      if (!options.tolerant && (!uuidComponent.uuid || !isUUID(uuidComponent.uuid))) {
        uuidComponent.error = uuidComponent.error || "UUID is not valid.";
      }
      return uuidComponent;
    }
    function urnuuidSerialize(uuidComponent) {
      const urnComponent = uuidComponent;
      urnComponent.nss = (uuidComponent.uuid || "").toLowerCase();
      return urnComponent;
    }
    var http = (
      /** @type {SchemeHandler} */
      {
        scheme: "http",
        domainHost: true,
        parse: httpParse,
        serialize: httpSerialize
      }
    );
    var https = (
      /** @type {SchemeHandler} */
      {
        scheme: "https",
        domainHost: http.domainHost,
        parse: httpParse,
        serialize: httpSerialize
      }
    );
    var ws = (
      /** @type {SchemeHandler} */
      {
        scheme: "ws",
        domainHost: true,
        parse: wsParse,
        serialize: wsSerialize
      }
    );
    var wss = (
      /** @type {SchemeHandler} */
      {
        scheme: "wss",
        domainHost: ws.domainHost,
        parse: ws.parse,
        serialize: ws.serialize
      }
    );
    var urn = (
      /** @type {SchemeHandler} */
      {
        scheme: "urn",
        parse: urnParse,
        serialize: urnSerialize,
        skipNormalize: true
      }
    );
    var urnuuid = (
      /** @type {SchemeHandler} */
      {
        scheme: "urn:uuid",
        parse: urnuuidParse,
        serialize: urnuuidSerialize,
        skipNormalize: true
      }
    );
    var SCHEMES = (
      /** @type {Record<SchemeName, SchemeHandler>} */
      {
        http,
        https,
        ws,
        wss,
        urn,
        "urn:uuid": urnuuid
      }
    );
    Object.setPrototypeOf(SCHEMES, null);
    function getSchemeHandler(scheme) {
      return scheme && (SCHEMES[
        /** @type {SchemeName} */
        scheme
      ] || SCHEMES[
        /** @type {SchemeName} */
        scheme.toLowerCase()
      ]) || void 0;
    }
    module2.exports = {
      wsIsSecure,
      SCHEMES,
      isValidSchemeName,
      getSchemeHandler
    };
  }
});

// node_modules/fast-uri/index.js
var require_fast_uri = __commonJS({
  "node_modules/fast-uri/index.js"(exports2, module2) {
    "use strict";
    var { normalizeIPv6, removeDotSegments, recomposeAuthority, normalizeComponentEncoding, isIPv4, nonSimpleDomain } = require_utils();
    var { SCHEMES, getSchemeHandler } = require_schemes();
    function normalize(uri, options) {
      if (typeof uri === "string") {
        uri = /** @type {T} */
        serialize2(parse2(uri, options), options);
      } else if (typeof uri === "object") {
        uri = /** @type {T} */
        parse2(serialize2(uri, options), options);
      }
      return uri;
    }
    function resolve(baseURI, relativeURI, options) {
      const schemelessOptions = options ? Object.assign({ scheme: "null" }, options) : { scheme: "null" };
      const resolved = resolveComponent(parse2(baseURI, schemelessOptions), parse2(relativeURI, schemelessOptions), schemelessOptions, true);
      schemelessOptions.skipEscape = true;
      return serialize2(resolved, schemelessOptions);
    }
    function resolveComponent(base, relative2, options, skipNormalization) {
      const target = {};
      if (!skipNormalization) {
        base = parse2(serialize2(base, options), options);
        relative2 = parse2(serialize2(relative2, options), options);
      }
      options = options || {};
      if (!options.tolerant && relative2.scheme) {
        target.scheme = relative2.scheme;
        target.userinfo = relative2.userinfo;
        target.host = relative2.host;
        target.port = relative2.port;
        target.path = removeDotSegments(relative2.path || "");
        target.query = relative2.query;
      } else {
        if (relative2.userinfo !== void 0 || relative2.host !== void 0 || relative2.port !== void 0) {
          target.userinfo = relative2.userinfo;
          target.host = relative2.host;
          target.port = relative2.port;
          target.path = removeDotSegments(relative2.path || "");
          target.query = relative2.query;
        } else {
          if (!relative2.path) {
            target.path = base.path;
            if (relative2.query !== void 0) {
              target.query = relative2.query;
            } else {
              target.query = base.query;
            }
          } else {
            if (relative2.path[0] === "/") {
              target.path = removeDotSegments(relative2.path);
            } else {
              if ((base.userinfo !== void 0 || base.host !== void 0 || base.port !== void 0) && !base.path) {
                target.path = "/" + relative2.path;
              } else if (!base.path) {
                target.path = relative2.path;
              } else {
                target.path = base.path.slice(0, base.path.lastIndexOf("/") + 1) + relative2.path;
              }
              target.path = removeDotSegments(target.path);
            }
            target.query = relative2.query;
          }
          target.userinfo = base.userinfo;
          target.host = base.host;
          target.port = base.port;
        }
        target.scheme = base.scheme;
      }
      target.fragment = relative2.fragment;
      return target;
    }
    function equal(uriA, uriB, options) {
      if (typeof uriA === "string") {
        uriA = unescape(uriA);
        uriA = serialize2(normalizeComponentEncoding(parse2(uriA, options), true), { ...options, skipEscape: true });
      } else if (typeof uriA === "object") {
        uriA = serialize2(normalizeComponentEncoding(uriA, true), { ...options, skipEscape: true });
      }
      if (typeof uriB === "string") {
        uriB = unescape(uriB);
        uriB = serialize2(normalizeComponentEncoding(parse2(uriB, options), true), { ...options, skipEscape: true });
      } else if (typeof uriB === "object") {
        uriB = serialize2(normalizeComponentEncoding(uriB, true), { ...options, skipEscape: true });
      }
      return uriA.toLowerCase() === uriB.toLowerCase();
    }
    function serialize2(cmpts, opts) {
      const component = {
        host: cmpts.host,
        scheme: cmpts.scheme,
        userinfo: cmpts.userinfo,
        port: cmpts.port,
        path: cmpts.path,
        query: cmpts.query,
        nid: cmpts.nid,
        nss: cmpts.nss,
        uuid: cmpts.uuid,
        fragment: cmpts.fragment,
        reference: cmpts.reference,
        resourceName: cmpts.resourceName,
        secure: cmpts.secure,
        error: ""
      };
      const options = Object.assign({}, opts);
      const uriTokens = [];
      const schemeHandler = getSchemeHandler(options.scheme || component.scheme);
      if (schemeHandler && schemeHandler.serialize) schemeHandler.serialize(component, options);
      if (component.path !== void 0) {
        if (!options.skipEscape) {
          component.path = escape(component.path);
          if (component.scheme !== void 0) {
            component.path = component.path.split("%3A").join(":");
          }
        } else {
          component.path = unescape(component.path);
        }
      }
      if (options.reference !== "suffix" && component.scheme) {
        uriTokens.push(component.scheme, ":");
      }
      const authority = recomposeAuthority(component);
      if (authority !== void 0) {
        if (options.reference !== "suffix") {
          uriTokens.push("//");
        }
        uriTokens.push(authority);
        if (component.path && component.path[0] !== "/") {
          uriTokens.push("/");
        }
      }
      if (component.path !== void 0) {
        let s = component.path;
        if (!options.absolutePath && (!schemeHandler || !schemeHandler.absolutePath)) {
          s = removeDotSegments(s);
        }
        if (authority === void 0 && s[0] === "/" && s[1] === "/") {
          s = "/%2F" + s.slice(2);
        }
        uriTokens.push(s);
      }
      if (component.query !== void 0) {
        uriTokens.push("?", component.query);
      }
      if (component.fragment !== void 0) {
        uriTokens.push("#", component.fragment);
      }
      return uriTokens.join("");
    }
    var URI_PARSE = /^(?:([^#/:?]+):)?(?:\/\/((?:([^#/?@]*)@)?(\[[^#/?\]]+\]|[^#/:?]*)(?::(\d*))?))?([^#?]*)(?:\?([^#]*))?(?:#((?:.|[\n\r])*))?/u;
    function parse2(uri, opts) {
      const options = Object.assign({}, opts);
      const parsed = {
        scheme: void 0,
        userinfo: void 0,
        host: "",
        port: void 0,
        path: "",
        query: void 0,
        fragment: void 0
      };
      let isIP = false;
      if (options.reference === "suffix") {
        if (options.scheme) {
          uri = options.scheme + ":" + uri;
        } else {
          uri = "//" + uri;
        }
      }
      const matches = uri.match(URI_PARSE);
      if (matches) {
        parsed.scheme = matches[1];
        parsed.userinfo = matches[3];
        parsed.host = matches[4];
        parsed.port = parseInt(matches[5], 10);
        parsed.path = matches[6] || "";
        parsed.query = matches[7];
        parsed.fragment = matches[8];
        if (isNaN(parsed.port)) {
          parsed.port = matches[5];
        }
        if (parsed.host) {
          const ipv4result = isIPv4(parsed.host);
          if (ipv4result === false) {
            const ipv6result = normalizeIPv6(parsed.host);
            parsed.host = ipv6result.host.toLowerCase();
            isIP = ipv6result.isIPV6;
          } else {
            isIP = true;
          }
        }
        if (parsed.scheme === void 0 && parsed.userinfo === void 0 && parsed.host === void 0 && parsed.port === void 0 && parsed.query === void 0 && !parsed.path) {
          parsed.reference = "same-document";
        } else if (parsed.scheme === void 0) {
          parsed.reference = "relative";
        } else if (parsed.fragment === void 0) {
          parsed.reference = "absolute";
        } else {
          parsed.reference = "uri";
        }
        if (options.reference && options.reference !== "suffix" && options.reference !== parsed.reference) {
          parsed.error = parsed.error || "URI is not a " + options.reference + " reference.";
        }
        const schemeHandler = getSchemeHandler(options.scheme || parsed.scheme);
        if (!options.unicodeSupport && (!schemeHandler || !schemeHandler.unicodeSupport)) {
          if (parsed.host && (options.domainHost || schemeHandler && schemeHandler.domainHost) && isIP === false && nonSimpleDomain(parsed.host)) {
            try {
              parsed.host = URL.domainToASCII(parsed.host.toLowerCase());
            } catch (e) {
              parsed.error = parsed.error || "Host's domain name can not be converted to ASCII: " + e;
            }
          }
        }
        if (!schemeHandler || schemeHandler && !schemeHandler.skipNormalize) {
          if (uri.indexOf("%") !== -1) {
            if (parsed.scheme !== void 0) {
              parsed.scheme = unescape(parsed.scheme);
            }
            if (parsed.host !== void 0) {
              parsed.host = unescape(parsed.host);
            }
          }
          if (parsed.path) {
            parsed.path = escape(unescape(parsed.path));
          }
          if (parsed.fragment) {
            parsed.fragment = encodeURI(decodeURIComponent(parsed.fragment));
          }
        }
        if (schemeHandler && schemeHandler.parse) {
          schemeHandler.parse(parsed, options);
        }
      } else {
        parsed.error = parsed.error || "URI can not be parsed.";
      }
      return parsed;
    }
    var fastUri = {
      SCHEMES,
      normalize,
      resolve,
      resolveComponent,
      equal,
      serialize: serialize2,
      parse: parse2
    };
    module2.exports = fastUri;
    module2.exports.default = fastUri;
    module2.exports.fastUri = fastUri;
  }
});

// node_modules/ajv/dist/runtime/uri.js
var require_uri = __commonJS({
  "node_modules/ajv/dist/runtime/uri.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    var uri = require_fast_uri();
    uri.code = 'require("ajv/dist/runtime/uri").default';
    exports2.default = uri;
  }
});

// node_modules/ajv/dist/core.js
var require_core = __commonJS({
  "node_modules/ajv/dist/core.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.CodeGen = exports2.Name = exports2.nil = exports2.stringify = exports2.str = exports2._ = exports2.KeywordCxt = void 0;
    var validate_1 = require_validate();
    Object.defineProperty(exports2, "KeywordCxt", { enumerable: true, get: function() {
      return validate_1.KeywordCxt;
    } });
    var codegen_1 = require_codegen();
    Object.defineProperty(exports2, "_", { enumerable: true, get: function() {
      return codegen_1._;
    } });
    Object.defineProperty(exports2, "str", { enumerable: true, get: function() {
      return codegen_1.str;
    } });
    Object.defineProperty(exports2, "stringify", { enumerable: true, get: function() {
      return codegen_1.stringify;
    } });
    Object.defineProperty(exports2, "nil", { enumerable: true, get: function() {
      return codegen_1.nil;
    } });
    Object.defineProperty(exports2, "Name", { enumerable: true, get: function() {
      return codegen_1.Name;
    } });
    Object.defineProperty(exports2, "CodeGen", { enumerable: true, get: function() {
      return codegen_1.CodeGen;
    } });
    var validation_error_1 = require_validation_error();
    var ref_error_1 = require_ref_error();
    var rules_1 = require_rules();
    var compile_1 = require_compile();
    var codegen_2 = require_codegen();
    var resolve_1 = require_resolve();
    var dataType_1 = require_dataType();
    var util_1 = require_util();
    var $dataRefSchema = require_data();
    var uri_1 = require_uri();
    var defaultRegExp = (str2, flags) => new RegExp(str2, flags);
    defaultRegExp.code = "new RegExp";
    var META_IGNORE_OPTIONS = ["removeAdditional", "useDefaults", "coerceTypes"];
    var EXT_SCOPE_NAMES = /* @__PURE__ */ new Set([
      "validate",
      "serialize",
      "parse",
      "wrapper",
      "root",
      "schema",
      "keyword",
      "pattern",
      "formats",
      "validate$data",
      "func",
      "obj",
      "Error"
    ]);
    var removedOptions = {
      errorDataPath: "",
      format: "`validateFormats: false` can be used instead.",
      nullable: '"nullable" keyword is supported by default.',
      jsonPointers: "Deprecated jsPropertySyntax can be used instead.",
      extendRefs: "Deprecated ignoreKeywordsWithRef can be used instead.",
      missingRefs: "Pass empty schema with $id that should be ignored to ajv.addSchema.",
      processCode: "Use option `code: {process: (code, schemaEnv: object) => string}`",
      sourceCode: "Use option `code: {source: true}`",
      strictDefaults: "It is default now, see option `strict`.",
      strictKeywords: "It is default now, see option `strict`.",
      uniqueItems: '"uniqueItems" keyword is always validated.',
      unknownFormats: "Disable strict mode or pass `true` to `ajv.addFormat` (or `formats` option).",
      cache: "Map is used as cache, schema object as key.",
      serialize: "Map is used as cache, schema object as key.",
      ajvErrors: "It is default now."
    };
    var deprecatedOptions = {
      ignoreKeywordsWithRef: "",
      jsPropertySyntax: "",
      unicode: '"minLength"/"maxLength" account for unicode characters by default.'
    };
    var MAX_EXPRESSION = 200;
    function requiredOptions(o) {
      var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0;
      const s = o.strict;
      const _optz = (_a = o.code) === null || _a === void 0 ? void 0 : _a.optimize;
      const optimize = _optz === true || _optz === void 0 ? 1 : _optz || 0;
      const regExp = (_c = (_b = o.code) === null || _b === void 0 ? void 0 : _b.regExp) !== null && _c !== void 0 ? _c : defaultRegExp;
      const uriResolver = (_d = o.uriResolver) !== null && _d !== void 0 ? _d : uri_1.default;
      return {
        strictSchema: (_f = (_e = o.strictSchema) !== null && _e !== void 0 ? _e : s) !== null && _f !== void 0 ? _f : true,
        strictNumbers: (_h = (_g = o.strictNumbers) !== null && _g !== void 0 ? _g : s) !== null && _h !== void 0 ? _h : true,
        strictTypes: (_k = (_j = o.strictTypes) !== null && _j !== void 0 ? _j : s) !== null && _k !== void 0 ? _k : "log",
        strictTuples: (_m = (_l = o.strictTuples) !== null && _l !== void 0 ? _l : s) !== null && _m !== void 0 ? _m : "log",
        strictRequired: (_p = (_o = o.strictRequired) !== null && _o !== void 0 ? _o : s) !== null && _p !== void 0 ? _p : false,
        code: o.code ? { ...o.code, optimize, regExp } : { optimize, regExp },
        loopRequired: (_q = o.loopRequired) !== null && _q !== void 0 ? _q : MAX_EXPRESSION,
        loopEnum: (_r = o.loopEnum) !== null && _r !== void 0 ? _r : MAX_EXPRESSION,
        meta: (_s = o.meta) !== null && _s !== void 0 ? _s : true,
        messages: (_t = o.messages) !== null && _t !== void 0 ? _t : true,
        inlineRefs: (_u = o.inlineRefs) !== null && _u !== void 0 ? _u : true,
        schemaId: (_v = o.schemaId) !== null && _v !== void 0 ? _v : "$id",
        addUsedSchema: (_w = o.addUsedSchema) !== null && _w !== void 0 ? _w : true,
        validateSchema: (_x = o.validateSchema) !== null && _x !== void 0 ? _x : true,
        validateFormats: (_y = o.validateFormats) !== null && _y !== void 0 ? _y : true,
        unicodeRegExp: (_z = o.unicodeRegExp) !== null && _z !== void 0 ? _z : true,
        int32range: (_0 = o.int32range) !== null && _0 !== void 0 ? _0 : true,
        uriResolver
      };
    }
    var Ajv2 = class {
      constructor(opts = {}) {
        this.schemas = {};
        this.refs = {};
        this.formats = {};
        this._compilations = /* @__PURE__ */ new Set();
        this._loading = {};
        this._cache = /* @__PURE__ */ new Map();
        opts = this.opts = { ...opts, ...requiredOptions(opts) };
        const { es5, lines } = this.opts.code;
        this.scope = new codegen_2.ValueScope({ scope: {}, prefixes: EXT_SCOPE_NAMES, es5, lines });
        this.logger = getLogger(opts.logger);
        const formatOpt = opts.validateFormats;
        opts.validateFormats = false;
        this.RULES = (0, rules_1.getRules)();
        checkOptions.call(this, removedOptions, opts, "NOT SUPPORTED");
        checkOptions.call(this, deprecatedOptions, opts, "DEPRECATED", "warn");
        this._metaOpts = getMetaSchemaOptions.call(this);
        if (opts.formats)
          addInitialFormats.call(this);
        this._addVocabularies();
        this._addDefaultMetaSchema();
        if (opts.keywords)
          addInitialKeywords.call(this, opts.keywords);
        if (typeof opts.meta == "object")
          this.addMetaSchema(opts.meta);
        addInitialSchemas.call(this);
        opts.validateFormats = formatOpt;
      }
      _addVocabularies() {
        this.addKeyword("$async");
      }
      _addDefaultMetaSchema() {
        const { $data, meta, schemaId } = this.opts;
        let _dataRefSchema = $dataRefSchema;
        if (schemaId === "id") {
          _dataRefSchema = { ...$dataRefSchema };
          _dataRefSchema.id = _dataRefSchema.$id;
          delete _dataRefSchema.$id;
        }
        if (meta && $data)
          this.addMetaSchema(_dataRefSchema, _dataRefSchema[schemaId], false);
      }
      defaultMeta() {
        const { meta, schemaId } = this.opts;
        return this.opts.defaultMeta = typeof meta == "object" ? meta[schemaId] || meta : void 0;
      }
      validate(schemaKeyRef, data) {
        let v;
        if (typeof schemaKeyRef == "string") {
          v = this.getSchema(schemaKeyRef);
          if (!v)
            throw new Error(`no schema with key or ref "${schemaKeyRef}"`);
        } else {
          v = this.compile(schemaKeyRef);
        }
        const valid = v(data);
        if (!("$async" in v))
          this.errors = v.errors;
        return valid;
      }
      compile(schema2, _meta) {
        const sch = this._addSchema(schema2, _meta);
        return sch.validate || this._compileSchemaEnv(sch);
      }
      compileAsync(schema2, meta) {
        if (typeof this.opts.loadSchema != "function") {
          throw new Error("options.loadSchema should be a function");
        }
        const { loadSchema } = this.opts;
        return runCompileAsync.call(this, schema2, meta);
        async function runCompileAsync(_schema, _meta) {
          await loadMetaSchema.call(this, _schema.$schema);
          const sch = this._addSchema(_schema, _meta);
          return sch.validate || _compileAsync.call(this, sch);
        }
        async function loadMetaSchema($ref) {
          if ($ref && !this.getSchema($ref)) {
            await runCompileAsync.call(this, { $ref }, true);
          }
        }
        async function _compileAsync(sch) {
          try {
            return this._compileSchemaEnv(sch);
          } catch (e) {
            if (!(e instanceof ref_error_1.default))
              throw e;
            checkLoaded.call(this, e);
            await loadMissingSchema.call(this, e.missingSchema);
            return _compileAsync.call(this, sch);
          }
        }
        function checkLoaded({ missingSchema: ref, missingRef }) {
          if (this.refs[ref]) {
            throw new Error(`AnySchema ${ref} is loaded but ${missingRef} cannot be resolved`);
          }
        }
        async function loadMissingSchema(ref) {
          const _schema = await _loadSchema.call(this, ref);
          if (!this.refs[ref])
            await loadMetaSchema.call(this, _schema.$schema);
          if (!this.refs[ref])
            this.addSchema(_schema, ref, meta);
        }
        async function _loadSchema(ref) {
          const p = this._loading[ref];
          if (p)
            return p;
          try {
            return await (this._loading[ref] = loadSchema(ref));
          } finally {
            delete this._loading[ref];
          }
        }
      }
      // Adds schema to the instance
      addSchema(schema2, key, _meta, _validateSchema = this.opts.validateSchema) {
        if (Array.isArray(schema2)) {
          for (const sch of schema2)
            this.addSchema(sch, void 0, _meta, _validateSchema);
          return this;
        }
        let id;
        if (typeof schema2 === "object") {
          const { schemaId } = this.opts;
          id = schema2[schemaId];
          if (id !== void 0 && typeof id != "string") {
            throw new Error(`schema ${schemaId} must be string`);
          }
        }
        key = (0, resolve_1.normalizeId)(key || id);
        this._checkUnique(key);
        this.schemas[key] = this._addSchema(schema2, _meta, key, _validateSchema, true);
        return this;
      }
      // Add schema that will be used to validate other schemas
      // options in META_IGNORE_OPTIONS are alway set to false
      addMetaSchema(schema2, key, _validateSchema = this.opts.validateSchema) {
        this.addSchema(schema2, key, true, _validateSchema);
        return this;
      }
      //  Validate schema against its meta-schema
      validateSchema(schema2, throwOrLogError) {
        if (typeof schema2 == "boolean")
          return true;
        let $schema;
        $schema = schema2.$schema;
        if ($schema !== void 0 && typeof $schema != "string") {
          throw new Error("$schema must be a string");
        }
        $schema = $schema || this.opts.defaultMeta || this.defaultMeta();
        if (!$schema) {
          this.logger.warn("meta-schema not available");
          this.errors = null;
          return true;
        }
        const valid = this.validate($schema, schema2);
        if (!valid && throwOrLogError) {
          const message = "schema is invalid: " + this.errorsText();
          if (this.opts.validateSchema === "log")
            this.logger.error(message);
          else
            throw new Error(message);
        }
        return valid;
      }
      // Get compiled schema by `key` or `ref`.
      // (`key` that was passed to `addSchema` or full schema reference - `schema.$id` or resolved id)
      getSchema(keyRef) {
        let sch;
        while (typeof (sch = getSchEnv.call(this, keyRef)) == "string")
          keyRef = sch;
        if (sch === void 0) {
          const { schemaId } = this.opts;
          const root = new compile_1.SchemaEnv({ schema: {}, schemaId });
          sch = compile_1.resolveSchema.call(this, root, keyRef);
          if (!sch)
            return;
          this.refs[keyRef] = sch;
        }
        return sch.validate || this._compileSchemaEnv(sch);
      }
      // Remove cached schema(s).
      // If no parameter is passed all schemas but meta-schemas are removed.
      // If RegExp is passed all schemas with key/id matching pattern but meta-schemas are removed.
      // Even if schema is referenced by other schemas it still can be removed as other schemas have local references.
      removeSchema(schemaKeyRef) {
        if (schemaKeyRef instanceof RegExp) {
          this._removeAllSchemas(this.schemas, schemaKeyRef);
          this._removeAllSchemas(this.refs, schemaKeyRef);
          return this;
        }
        switch (typeof schemaKeyRef) {
          case "undefined":
            this._removeAllSchemas(this.schemas);
            this._removeAllSchemas(this.refs);
            this._cache.clear();
            return this;
          case "string": {
            const sch = getSchEnv.call(this, schemaKeyRef);
            if (typeof sch == "object")
              this._cache.delete(sch.schema);
            delete this.schemas[schemaKeyRef];
            delete this.refs[schemaKeyRef];
            return this;
          }
          case "object": {
            const cacheKey = schemaKeyRef;
            this._cache.delete(cacheKey);
            let id = schemaKeyRef[this.opts.schemaId];
            if (id) {
              id = (0, resolve_1.normalizeId)(id);
              delete this.schemas[id];
              delete this.refs[id];
            }
            return this;
          }
          default:
            throw new Error("ajv.removeSchema: invalid parameter");
        }
      }
      // add "vocabulary" - a collection of keywords
      addVocabulary(definitions) {
        for (const def of definitions)
          this.addKeyword(def);
        return this;
      }
      addKeyword(kwdOrDef, def) {
        let keyword;
        if (typeof kwdOrDef == "string") {
          keyword = kwdOrDef;
          if (typeof def == "object") {
            this.logger.warn("these parameters are deprecated, see docs for addKeyword");
            def.keyword = keyword;
          }
        } else if (typeof kwdOrDef == "object" && def === void 0) {
          def = kwdOrDef;
          keyword = def.keyword;
          if (Array.isArray(keyword) && !keyword.length) {
            throw new Error("addKeywords: keyword must be string or non-empty array");
          }
        } else {
          throw new Error("invalid addKeywords parameters");
        }
        checkKeyword.call(this, keyword, def);
        if (!def) {
          (0, util_1.eachItem)(keyword, (kwd) => addRule.call(this, kwd));
          return this;
        }
        keywordMetaschema.call(this, def);
        const definition = {
          ...def,
          type: (0, dataType_1.getJSONTypes)(def.type),
          schemaType: (0, dataType_1.getJSONTypes)(def.schemaType)
        };
        (0, util_1.eachItem)(keyword, definition.type.length === 0 ? (k) => addRule.call(this, k, definition) : (k) => definition.type.forEach((t) => addRule.call(this, k, definition, t)));
        return this;
      }
      getKeyword(keyword) {
        const rule = this.RULES.all[keyword];
        return typeof rule == "object" ? rule.definition : !!rule;
      }
      // Remove keyword
      removeKeyword(keyword) {
        const { RULES } = this;
        delete RULES.keywords[keyword];
        delete RULES.all[keyword];
        for (const group of RULES.rules) {
          const i = group.rules.findIndex((rule) => rule.keyword === keyword);
          if (i >= 0)
            group.rules.splice(i, 1);
        }
        return this;
      }
      // Add format
      addFormat(name, format) {
        if (typeof format == "string")
          format = new RegExp(format);
        this.formats[name] = format;
        return this;
      }
      errorsText(errors = this.errors, { separator = ", ", dataVar = "data" } = {}) {
        if (!errors || errors.length === 0)
          return "No errors";
        return errors.map((e) => `${dataVar}${e.instancePath} ${e.message}`).reduce((text, msg) => text + separator + msg);
      }
      $dataMetaSchema(metaSchema, keywordsJsonPointers) {
        const rules = this.RULES.all;
        metaSchema = JSON.parse(JSON.stringify(metaSchema));
        for (const jsonPointer of keywordsJsonPointers) {
          const segments = jsonPointer.split("/").slice(1);
          let keywords = metaSchema;
          for (const seg of segments)
            keywords = keywords[seg];
          for (const key in rules) {
            const rule = rules[key];
            if (typeof rule != "object")
              continue;
            const { $data } = rule.definition;
            const schema2 = keywords[key];
            if ($data && schema2)
              keywords[key] = schemaOrData(schema2);
          }
        }
        return metaSchema;
      }
      _removeAllSchemas(schemas, regex) {
        for (const keyRef in schemas) {
          const sch = schemas[keyRef];
          if (!regex || regex.test(keyRef)) {
            if (typeof sch == "string") {
              delete schemas[keyRef];
            } else if (sch && !sch.meta) {
              this._cache.delete(sch.schema);
              delete schemas[keyRef];
            }
          }
        }
      }
      _addSchema(schema2, meta, baseId, validateSchema2 = this.opts.validateSchema, addSchema = this.opts.addUsedSchema) {
        let id;
        const { schemaId } = this.opts;
        if (typeof schema2 == "object") {
          id = schema2[schemaId];
        } else {
          if (this.opts.jtd)
            throw new Error("schema must be object");
          else if (typeof schema2 != "boolean")
            throw new Error("schema must be object or boolean");
        }
        let sch = this._cache.get(schema2);
        if (sch !== void 0)
          return sch;
        baseId = (0, resolve_1.normalizeId)(id || baseId);
        const localRefs = resolve_1.getSchemaRefs.call(this, schema2, baseId);
        sch = new compile_1.SchemaEnv({ schema: schema2, schemaId, meta, baseId, localRefs });
        this._cache.set(sch.schema, sch);
        if (addSchema && !baseId.startsWith("#")) {
          if (baseId)
            this._checkUnique(baseId);
          this.refs[baseId] = sch;
        }
        if (validateSchema2)
          this.validateSchema(schema2, true);
        return sch;
      }
      _checkUnique(id) {
        if (this.schemas[id] || this.refs[id]) {
          throw new Error(`schema with key or id "${id}" already exists`);
        }
      }
      _compileSchemaEnv(sch) {
        if (sch.meta)
          this._compileMetaSchema(sch);
        else
          compile_1.compileSchema.call(this, sch);
        if (!sch.validate)
          throw new Error("ajv implementation error");
        return sch.validate;
      }
      _compileMetaSchema(sch) {
        const currentOpts = this.opts;
        this.opts = this._metaOpts;
        try {
          compile_1.compileSchema.call(this, sch);
        } finally {
          this.opts = currentOpts;
        }
      }
    };
    Ajv2.ValidationError = validation_error_1.default;
    Ajv2.MissingRefError = ref_error_1.default;
    exports2.default = Ajv2;
    function checkOptions(checkOpts, options, msg, log = "error") {
      for (const key in checkOpts) {
        const opt = key;
        if (opt in options)
          this.logger[log](`${msg}: option ${key}. ${checkOpts[opt]}`);
      }
    }
    function getSchEnv(keyRef) {
      keyRef = (0, resolve_1.normalizeId)(keyRef);
      return this.schemas[keyRef] || this.refs[keyRef];
    }
    function addInitialSchemas() {
      const optsSchemas = this.opts.schemas;
      if (!optsSchemas)
        return;
      if (Array.isArray(optsSchemas))
        this.addSchema(optsSchemas);
      else
        for (const key in optsSchemas)
          this.addSchema(optsSchemas[key], key);
    }
    function addInitialFormats() {
      for (const name in this.opts.formats) {
        const format = this.opts.formats[name];
        if (format)
          this.addFormat(name, format);
      }
    }
    function addInitialKeywords(defs) {
      if (Array.isArray(defs)) {
        this.addVocabulary(defs);
        return;
      }
      this.logger.warn("keywords option as map is deprecated, pass array");
      for (const keyword in defs) {
        const def = defs[keyword];
        if (!def.keyword)
          def.keyword = keyword;
        this.addKeyword(def);
      }
    }
    function getMetaSchemaOptions() {
      const metaOpts = { ...this.opts };
      for (const opt of META_IGNORE_OPTIONS)
        delete metaOpts[opt];
      return metaOpts;
    }
    var noLogs = { log() {
    }, warn() {
    }, error() {
    } };
    function getLogger(logger) {
      if (logger === false)
        return noLogs;
      if (logger === void 0)
        return console;
      if (logger.log && logger.warn && logger.error)
        return logger;
      throw new Error("logger must implement log, warn and error methods");
    }
    var KEYWORD_NAME = /^[a-z_$][a-z0-9_$:-]*$/i;
    function checkKeyword(keyword, def) {
      const { RULES } = this;
      (0, util_1.eachItem)(keyword, (kwd) => {
        if (RULES.keywords[kwd])
          throw new Error(`Keyword ${kwd} is already defined`);
        if (!KEYWORD_NAME.test(kwd))
          throw new Error(`Keyword ${kwd} has invalid name`);
      });
      if (!def)
        return;
      if (def.$data && !("code" in def || "validate" in def)) {
        throw new Error('$data keyword must have "code" or "validate" function');
      }
    }
    function addRule(keyword, definition, dataType) {
      var _a;
      const post = definition === null || definition === void 0 ? void 0 : definition.post;
      if (dataType && post)
        throw new Error('keyword with "post" flag cannot have "type"');
      const { RULES } = this;
      let ruleGroup = post ? RULES.post : RULES.rules.find(({ type: t }) => t === dataType);
      if (!ruleGroup) {
        ruleGroup = { type: dataType, rules: [] };
        RULES.rules.push(ruleGroup);
      }
      RULES.keywords[keyword] = true;
      if (!definition)
        return;
      const rule = {
        keyword,
        definition: {
          ...definition,
          type: (0, dataType_1.getJSONTypes)(definition.type),
          schemaType: (0, dataType_1.getJSONTypes)(definition.schemaType)
        }
      };
      if (definition.before)
        addBeforeRule.call(this, ruleGroup, rule, definition.before);
      else
        ruleGroup.rules.push(rule);
      RULES.all[keyword] = rule;
      (_a = definition.implements) === null || _a === void 0 ? void 0 : _a.forEach((kwd) => this.addKeyword(kwd));
    }
    function addBeforeRule(ruleGroup, rule, before) {
      const i = ruleGroup.rules.findIndex((_rule) => _rule.keyword === before);
      if (i >= 0) {
        ruleGroup.rules.splice(i, 0, rule);
      } else {
        ruleGroup.rules.push(rule);
        this.logger.warn(`rule ${before} is not defined`);
      }
    }
    function keywordMetaschema(def) {
      let { metaSchema } = def;
      if (metaSchema === void 0)
        return;
      if (def.$data && this.opts.$data)
        metaSchema = schemaOrData(metaSchema);
      def.validateSchema = this.compile(metaSchema, true);
    }
    var $dataRef = {
      $ref: "https://raw.githubusercontent.com/ajv-validator/ajv/master/lib/refs/data.json#"
    };
    function schemaOrData(schema2) {
      return { anyOf: [schema2, $dataRef] };
    }
  }
});

// node_modules/ajv/dist/vocabularies/core/id.js
var require_id = __commonJS({
  "node_modules/ajv/dist/vocabularies/core/id.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    var def = {
      keyword: "id",
      code() {
        throw new Error('NOT SUPPORTED: keyword "id", use "$id" for schema ID');
      }
    };
    exports2.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/core/ref.js
var require_ref = __commonJS({
  "node_modules/ajv/dist/vocabularies/core/ref.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.callRef = exports2.getValidate = void 0;
    var ref_error_1 = require_ref_error();
    var code_1 = require_code2();
    var codegen_1 = require_codegen();
    var names_1 = require_names();
    var compile_1 = require_compile();
    var util_1 = require_util();
    var def = {
      keyword: "$ref",
      schemaType: "string",
      code(cxt) {
        const { gen, schema: $ref, it } = cxt;
        const { baseId, schemaEnv: env3, validateName, opts, self } = it;
        const { root } = env3;
        if (($ref === "#" || $ref === "#/") && baseId === root.baseId)
          return callRootRef();
        const schOrEnv = compile_1.resolveRef.call(self, root, baseId, $ref);
        if (schOrEnv === void 0)
          throw new ref_error_1.default(it.opts.uriResolver, baseId, $ref);
        if (schOrEnv instanceof compile_1.SchemaEnv)
          return callValidate(schOrEnv);
        return inlineRefSchema(schOrEnv);
        function callRootRef() {
          if (env3 === root)
            return callRef(cxt, validateName, env3, env3.$async);
          const rootName = gen.scopeValue("root", { ref: root });
          return callRef(cxt, (0, codegen_1._)`${rootName}.validate`, root, root.$async);
        }
        function callValidate(sch) {
          const v = getValidate(cxt, sch);
          callRef(cxt, v, sch, sch.$async);
        }
        function inlineRefSchema(sch) {
          const schName = gen.scopeValue("schema", opts.code.source === true ? { ref: sch, code: (0, codegen_1.stringify)(sch) } : { ref: sch });
          const valid = gen.name("valid");
          const schCxt = cxt.subschema({
            schema: sch,
            dataTypes: [],
            schemaPath: codegen_1.nil,
            topSchemaRef: schName,
            errSchemaPath: $ref
          }, valid);
          cxt.mergeEvaluated(schCxt);
          cxt.ok(valid);
        }
      }
    };
    function getValidate(cxt, sch) {
      const { gen } = cxt;
      return sch.validate ? gen.scopeValue("validate", { ref: sch.validate }) : (0, codegen_1._)`${gen.scopeValue("wrapper", { ref: sch })}.validate`;
    }
    exports2.getValidate = getValidate;
    function callRef(cxt, v, sch, $async) {
      const { gen, it } = cxt;
      const { allErrors, schemaEnv: env3, opts } = it;
      const passCxt = opts.passContext ? names_1.default.this : codegen_1.nil;
      if ($async)
        callAsyncRef();
      else
        callSyncRef();
      function callAsyncRef() {
        if (!env3.$async)
          throw new Error("async schema referenced by sync schema");
        const valid = gen.let("valid");
        gen.try(() => {
          gen.code((0, codegen_1._)`await ${(0, code_1.callValidateCode)(cxt, v, passCxt)}`);
          addEvaluatedFrom(v);
          if (!allErrors)
            gen.assign(valid, true);
        }, (e) => {
          gen.if((0, codegen_1._)`!(${e} instanceof ${it.ValidationError})`, () => gen.throw(e));
          addErrorsFrom(e);
          if (!allErrors)
            gen.assign(valid, false);
        });
        cxt.ok(valid);
      }
      function callSyncRef() {
        cxt.result((0, code_1.callValidateCode)(cxt, v, passCxt), () => addEvaluatedFrom(v), () => addErrorsFrom(v));
      }
      function addErrorsFrom(source) {
        const errs = (0, codegen_1._)`${source}.errors`;
        gen.assign(names_1.default.vErrors, (0, codegen_1._)`${names_1.default.vErrors} === null ? ${errs} : ${names_1.default.vErrors}.concat(${errs})`);
        gen.assign(names_1.default.errors, (0, codegen_1._)`${names_1.default.vErrors}.length`);
      }
      function addEvaluatedFrom(source) {
        var _a;
        if (!it.opts.unevaluated)
          return;
        const schEvaluated = (_a = sch === null || sch === void 0 ? void 0 : sch.validate) === null || _a === void 0 ? void 0 : _a.evaluated;
        if (it.props !== true) {
          if (schEvaluated && !schEvaluated.dynamicProps) {
            if (schEvaluated.props !== void 0) {
              it.props = util_1.mergeEvaluated.props(gen, schEvaluated.props, it.props);
            }
          } else {
            const props = gen.var("props", (0, codegen_1._)`${source}.evaluated.props`);
            it.props = util_1.mergeEvaluated.props(gen, props, it.props, codegen_1.Name);
          }
        }
        if (it.items !== true) {
          if (schEvaluated && !schEvaluated.dynamicItems) {
            if (schEvaluated.items !== void 0) {
              it.items = util_1.mergeEvaluated.items(gen, schEvaluated.items, it.items);
            }
          } else {
            const items = gen.var("items", (0, codegen_1._)`${source}.evaluated.items`);
            it.items = util_1.mergeEvaluated.items(gen, items, it.items, codegen_1.Name);
          }
        }
      }
    }
    exports2.callRef = callRef;
    exports2.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/core/index.js
var require_core2 = __commonJS({
  "node_modules/ajv/dist/vocabularies/core/index.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    var id_1 = require_id();
    var ref_1 = require_ref();
    var core2 = [
      "$schema",
      "$id",
      "$defs",
      "$vocabulary",
      { keyword: "$comment" },
      "definitions",
      id_1.default,
      ref_1.default
    ];
    exports2.default = core2;
  }
});

// node_modules/ajv/dist/vocabularies/validation/limitNumber.js
var require_limitNumber = __commonJS({
  "node_modules/ajv/dist/vocabularies/validation/limitNumber.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var ops = codegen_1.operators;
    var KWDs = {
      maximum: { okStr: "<=", ok: ops.LTE, fail: ops.GT },
      minimum: { okStr: ">=", ok: ops.GTE, fail: ops.LT },
      exclusiveMaximum: { okStr: "<", ok: ops.LT, fail: ops.GTE },
      exclusiveMinimum: { okStr: ">", ok: ops.GT, fail: ops.LTE }
    };
    var error = {
      message: ({ keyword, schemaCode }) => (0, codegen_1.str)`must be ${KWDs[keyword].okStr} ${schemaCode}`,
      params: ({ keyword, schemaCode }) => (0, codegen_1._)`{comparison: ${KWDs[keyword].okStr}, limit: ${schemaCode}}`
    };
    var def = {
      keyword: Object.keys(KWDs),
      type: "number",
      schemaType: "number",
      $data: true,
      error,
      code(cxt) {
        const { keyword, data, schemaCode } = cxt;
        cxt.fail$data((0, codegen_1._)`${data} ${KWDs[keyword].fail} ${schemaCode} || isNaN(${data})`);
      }
    };
    exports2.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/validation/multipleOf.js
var require_multipleOf = __commonJS({
  "node_modules/ajv/dist/vocabularies/validation/multipleOf.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var error = {
      message: ({ schemaCode }) => (0, codegen_1.str)`must be multiple of ${schemaCode}`,
      params: ({ schemaCode }) => (0, codegen_1._)`{multipleOf: ${schemaCode}}`
    };
    var def = {
      keyword: "multipleOf",
      type: "number",
      schemaType: "number",
      $data: true,
      error,
      code(cxt) {
        const { gen, data, schemaCode, it } = cxt;
        const prec = it.opts.multipleOfPrecision;
        const res = gen.let("res");
        const invalid = prec ? (0, codegen_1._)`Math.abs(Math.round(${res}) - ${res}) > 1e-${prec}` : (0, codegen_1._)`${res} !== parseInt(${res})`;
        cxt.fail$data((0, codegen_1._)`(${schemaCode} === 0 || (${res} = ${data}/${schemaCode}, ${invalid}))`);
      }
    };
    exports2.default = def;
  }
});

// node_modules/ajv/dist/runtime/ucs2length.js
var require_ucs2length = __commonJS({
  "node_modules/ajv/dist/runtime/ucs2length.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    function ucs2length(str2) {
      const len = str2.length;
      let length = 0;
      let pos = 0;
      let value;
      while (pos < len) {
        length++;
        value = str2.charCodeAt(pos++);
        if (value >= 55296 && value <= 56319 && pos < len) {
          value = str2.charCodeAt(pos);
          if ((value & 64512) === 56320)
            pos++;
        }
      }
      return length;
    }
    exports2.default = ucs2length;
    ucs2length.code = 'require("ajv/dist/runtime/ucs2length").default';
  }
});

// node_modules/ajv/dist/vocabularies/validation/limitLength.js
var require_limitLength = __commonJS({
  "node_modules/ajv/dist/vocabularies/validation/limitLength.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var ucs2length_1 = require_ucs2length();
    var error = {
      message({ keyword, schemaCode }) {
        const comp = keyword === "maxLength" ? "more" : "fewer";
        return (0, codegen_1.str)`must NOT have ${comp} than ${schemaCode} characters`;
      },
      params: ({ schemaCode }) => (0, codegen_1._)`{limit: ${schemaCode}}`
    };
    var def = {
      keyword: ["maxLength", "minLength"],
      type: "string",
      schemaType: "number",
      $data: true,
      error,
      code(cxt) {
        const { keyword, data, schemaCode, it } = cxt;
        const op = keyword === "maxLength" ? codegen_1.operators.GT : codegen_1.operators.LT;
        const len = it.opts.unicode === false ? (0, codegen_1._)`${data}.length` : (0, codegen_1._)`${(0, util_1.useFunc)(cxt.gen, ucs2length_1.default)}(${data})`;
        cxt.fail$data((0, codegen_1._)`${len} ${op} ${schemaCode}`);
      }
    };
    exports2.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/validation/pattern.js
var require_pattern = __commonJS({
  "node_modules/ajv/dist/vocabularies/validation/pattern.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    var code_1 = require_code2();
    var util_1 = require_util();
    var codegen_1 = require_codegen();
    var error = {
      message: ({ schemaCode }) => (0, codegen_1.str)`must match pattern "${schemaCode}"`,
      params: ({ schemaCode }) => (0, codegen_1._)`{pattern: ${schemaCode}}`
    };
    var def = {
      keyword: "pattern",
      type: "string",
      schemaType: "string",
      $data: true,
      error,
      code(cxt) {
        const { gen, data, $data, schema: schema2, schemaCode, it } = cxt;
        const u = it.opts.unicodeRegExp ? "u" : "";
        if ($data) {
          const { regExp } = it.opts.code;
          const regExpCode = regExp.code === "new RegExp" ? (0, codegen_1._)`new RegExp` : (0, util_1.useFunc)(gen, regExp);
          const valid = gen.let("valid");
          gen.try(() => gen.assign(valid, (0, codegen_1._)`${regExpCode}(${schemaCode}, ${u}).test(${data})`), () => gen.assign(valid, false));
          cxt.fail$data((0, codegen_1._)`!${valid}`);
        } else {
          const regExp = (0, code_1.usePattern)(cxt, schema2);
          cxt.fail$data((0, codegen_1._)`!${regExp}.test(${data})`);
        }
      }
    };
    exports2.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/validation/limitProperties.js
var require_limitProperties = __commonJS({
  "node_modules/ajv/dist/vocabularies/validation/limitProperties.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var error = {
      message({ keyword, schemaCode }) {
        const comp = keyword === "maxProperties" ? "more" : "fewer";
        return (0, codegen_1.str)`must NOT have ${comp} than ${schemaCode} properties`;
      },
      params: ({ schemaCode }) => (0, codegen_1._)`{limit: ${schemaCode}}`
    };
    var def = {
      keyword: ["maxProperties", "minProperties"],
      type: "object",
      schemaType: "number",
      $data: true,
      error,
      code(cxt) {
        const { keyword, data, schemaCode } = cxt;
        const op = keyword === "maxProperties" ? codegen_1.operators.GT : codegen_1.operators.LT;
        cxt.fail$data((0, codegen_1._)`Object.keys(${data}).length ${op} ${schemaCode}`);
      }
    };
    exports2.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/validation/required.js
var require_required = __commonJS({
  "node_modules/ajv/dist/vocabularies/validation/required.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    var code_1 = require_code2();
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var error = {
      message: ({ params: { missingProperty } }) => (0, codegen_1.str)`must have required property '${missingProperty}'`,
      params: ({ params: { missingProperty } }) => (0, codegen_1._)`{missingProperty: ${missingProperty}}`
    };
    var def = {
      keyword: "required",
      type: "object",
      schemaType: "array",
      $data: true,
      error,
      code(cxt) {
        const { gen, schema: schema2, schemaCode, data, $data, it } = cxt;
        const { opts } = it;
        if (!$data && schema2.length === 0)
          return;
        const useLoop = schema2.length >= opts.loopRequired;
        if (it.allErrors)
          allErrorsMode();
        else
          exitOnErrorMode();
        if (opts.strictRequired) {
          const props = cxt.parentSchema.properties;
          const { definedProperties } = cxt.it;
          for (const requiredKey of schema2) {
            if ((props === null || props === void 0 ? void 0 : props[requiredKey]) === void 0 && !definedProperties.has(requiredKey)) {
              const schemaPath = it.schemaEnv.baseId + it.errSchemaPath;
              const msg = `required property "${requiredKey}" is not defined at "${schemaPath}" (strictRequired)`;
              (0, util_1.checkStrictMode)(it, msg, it.opts.strictRequired);
            }
          }
        }
        function allErrorsMode() {
          if (useLoop || $data) {
            cxt.block$data(codegen_1.nil, loopAllRequired);
          } else {
            for (const prop of schema2) {
              (0, code_1.checkReportMissingProp)(cxt, prop);
            }
          }
        }
        function exitOnErrorMode() {
          const missing = gen.let("missing");
          if (useLoop || $data) {
            const valid = gen.let("valid", true);
            cxt.block$data(valid, () => loopUntilMissing(missing, valid));
            cxt.ok(valid);
          } else {
            gen.if((0, code_1.checkMissingProp)(cxt, schema2, missing));
            (0, code_1.reportMissingProp)(cxt, missing);
            gen.else();
          }
        }
        function loopAllRequired() {
          gen.forOf("prop", schemaCode, (prop) => {
            cxt.setParams({ missingProperty: prop });
            gen.if((0, code_1.noPropertyInData)(gen, data, prop, opts.ownProperties), () => cxt.error());
          });
        }
        function loopUntilMissing(missing, valid) {
          cxt.setParams({ missingProperty: missing });
          gen.forOf(missing, schemaCode, () => {
            gen.assign(valid, (0, code_1.propertyInData)(gen, data, missing, opts.ownProperties));
            gen.if((0, codegen_1.not)(valid), () => {
              cxt.error();
              gen.break();
            });
          }, codegen_1.nil);
        }
      }
    };
    exports2.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/validation/limitItems.js
var require_limitItems = __commonJS({
  "node_modules/ajv/dist/vocabularies/validation/limitItems.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var error = {
      message({ keyword, schemaCode }) {
        const comp = keyword === "maxItems" ? "more" : "fewer";
        return (0, codegen_1.str)`must NOT have ${comp} than ${schemaCode} items`;
      },
      params: ({ schemaCode }) => (0, codegen_1._)`{limit: ${schemaCode}}`
    };
    var def = {
      keyword: ["maxItems", "minItems"],
      type: "array",
      schemaType: "number",
      $data: true,
      error,
      code(cxt) {
        const { keyword, data, schemaCode } = cxt;
        const op = keyword === "maxItems" ? codegen_1.operators.GT : codegen_1.operators.LT;
        cxt.fail$data((0, codegen_1._)`${data}.length ${op} ${schemaCode}`);
      }
    };
    exports2.default = def;
  }
});

// node_modules/ajv/dist/runtime/equal.js
var require_equal = __commonJS({
  "node_modules/ajv/dist/runtime/equal.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    var equal = require_fast_deep_equal();
    equal.code = 'require("ajv/dist/runtime/equal").default';
    exports2.default = equal;
  }
});

// node_modules/ajv/dist/vocabularies/validation/uniqueItems.js
var require_uniqueItems = __commonJS({
  "node_modules/ajv/dist/vocabularies/validation/uniqueItems.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    var dataType_1 = require_dataType();
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var equal_1 = require_equal();
    var error = {
      message: ({ params: { i, j } }) => (0, codegen_1.str)`must NOT have duplicate items (items ## ${j} and ${i} are identical)`,
      params: ({ params: { i, j } }) => (0, codegen_1._)`{i: ${i}, j: ${j}}`
    };
    var def = {
      keyword: "uniqueItems",
      type: "array",
      schemaType: "boolean",
      $data: true,
      error,
      code(cxt) {
        const { gen, data, $data, schema: schema2, parentSchema, schemaCode, it } = cxt;
        if (!$data && !schema2)
          return;
        const valid = gen.let("valid");
        const itemTypes = parentSchema.items ? (0, dataType_1.getSchemaTypes)(parentSchema.items) : [];
        cxt.block$data(valid, validateUniqueItems, (0, codegen_1._)`${schemaCode} === false`);
        cxt.ok(valid);
        function validateUniqueItems() {
          const i = gen.let("i", (0, codegen_1._)`${data}.length`);
          const j = gen.let("j");
          cxt.setParams({ i, j });
          gen.assign(valid, true);
          gen.if((0, codegen_1._)`${i} > 1`, () => (canOptimize() ? loopN : loopN2)(i, j));
        }
        function canOptimize() {
          return itemTypes.length > 0 && !itemTypes.some((t) => t === "object" || t === "array");
        }
        function loopN(i, j) {
          const item = gen.name("item");
          const wrongType = (0, dataType_1.checkDataTypes)(itemTypes, item, it.opts.strictNumbers, dataType_1.DataType.Wrong);
          const indices = gen.const("indices", (0, codegen_1._)`{}`);
          gen.for((0, codegen_1._)`;${i}--;`, () => {
            gen.let(item, (0, codegen_1._)`${data}[${i}]`);
            gen.if(wrongType, (0, codegen_1._)`continue`);
            if (itemTypes.length > 1)
              gen.if((0, codegen_1._)`typeof ${item} == "string"`, (0, codegen_1._)`${item} += "_"`);
            gen.if((0, codegen_1._)`typeof ${indices}[${item}] == "number"`, () => {
              gen.assign(j, (0, codegen_1._)`${indices}[${item}]`);
              cxt.error();
              gen.assign(valid, false).break();
            }).code((0, codegen_1._)`${indices}[${item}] = ${i}`);
          });
        }
        function loopN2(i, j) {
          const eql = (0, util_1.useFunc)(gen, equal_1.default);
          const outer = gen.name("outer");
          gen.label(outer).for((0, codegen_1._)`;${i}--;`, () => gen.for((0, codegen_1._)`${j} = ${i}; ${j}--;`, () => gen.if((0, codegen_1._)`${eql}(${data}[${i}], ${data}[${j}])`, () => {
            cxt.error();
            gen.assign(valid, false).break(outer);
          })));
        }
      }
    };
    exports2.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/validation/const.js
var require_const = __commonJS({
  "node_modules/ajv/dist/vocabularies/validation/const.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var equal_1 = require_equal();
    var error = {
      message: "must be equal to constant",
      params: ({ schemaCode }) => (0, codegen_1._)`{allowedValue: ${schemaCode}}`
    };
    var def = {
      keyword: "const",
      $data: true,
      error,
      code(cxt) {
        const { gen, data, $data, schemaCode, schema: schema2 } = cxt;
        if ($data || schema2 && typeof schema2 == "object") {
          cxt.fail$data((0, codegen_1._)`!${(0, util_1.useFunc)(gen, equal_1.default)}(${data}, ${schemaCode})`);
        } else {
          cxt.fail((0, codegen_1._)`${schema2} !== ${data}`);
        }
      }
    };
    exports2.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/validation/enum.js
var require_enum = __commonJS({
  "node_modules/ajv/dist/vocabularies/validation/enum.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var equal_1 = require_equal();
    var error = {
      message: "must be equal to one of the allowed values",
      params: ({ schemaCode }) => (0, codegen_1._)`{allowedValues: ${schemaCode}}`
    };
    var def = {
      keyword: "enum",
      schemaType: "array",
      $data: true,
      error,
      code(cxt) {
        const { gen, data, $data, schema: schema2, schemaCode, it } = cxt;
        if (!$data && schema2.length === 0)
          throw new Error("enum must have non-empty array");
        const useLoop = schema2.length >= it.opts.loopEnum;
        let eql;
        const getEql = () => eql !== null && eql !== void 0 ? eql : eql = (0, util_1.useFunc)(gen, equal_1.default);
        let valid;
        if (useLoop || $data) {
          valid = gen.let("valid");
          cxt.block$data(valid, loopEnum);
        } else {
          if (!Array.isArray(schema2))
            throw new Error("ajv implementation error");
          const vSchema = gen.const("vSchema", schemaCode);
          valid = (0, codegen_1.or)(...schema2.map((_x, i) => equalCode(vSchema, i)));
        }
        cxt.pass(valid);
        function loopEnum() {
          gen.assign(valid, false);
          gen.forOf("v", schemaCode, (v) => gen.if((0, codegen_1._)`${getEql()}(${data}, ${v})`, () => gen.assign(valid, true).break()));
        }
        function equalCode(vSchema, i) {
          const sch = schema2[i];
          return typeof sch === "object" && sch !== null ? (0, codegen_1._)`${getEql()}(${data}, ${vSchema}[${i}])` : (0, codegen_1._)`${data} === ${sch}`;
        }
      }
    };
    exports2.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/validation/index.js
var require_validation = __commonJS({
  "node_modules/ajv/dist/vocabularies/validation/index.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    var limitNumber_1 = require_limitNumber();
    var multipleOf_1 = require_multipleOf();
    var limitLength_1 = require_limitLength();
    var pattern_1 = require_pattern();
    var limitProperties_1 = require_limitProperties();
    var required_1 = require_required();
    var limitItems_1 = require_limitItems();
    var uniqueItems_1 = require_uniqueItems();
    var const_1 = require_const();
    var enum_1 = require_enum();
    var validation = [
      // number
      limitNumber_1.default,
      multipleOf_1.default,
      // string
      limitLength_1.default,
      pattern_1.default,
      // object
      limitProperties_1.default,
      required_1.default,
      // array
      limitItems_1.default,
      uniqueItems_1.default,
      // any
      { keyword: "type", schemaType: ["string", "array"] },
      { keyword: "nullable", schemaType: "boolean" },
      const_1.default,
      enum_1.default
    ];
    exports2.default = validation;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/additionalItems.js
var require_additionalItems = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/additionalItems.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.validateAdditionalItems = void 0;
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var error = {
      message: ({ params: { len } }) => (0, codegen_1.str)`must NOT have more than ${len} items`,
      params: ({ params: { len } }) => (0, codegen_1._)`{limit: ${len}}`
    };
    var def = {
      keyword: "additionalItems",
      type: "array",
      schemaType: ["boolean", "object"],
      before: "uniqueItems",
      error,
      code(cxt) {
        const { parentSchema, it } = cxt;
        const { items } = parentSchema;
        if (!Array.isArray(items)) {
          (0, util_1.checkStrictMode)(it, '"additionalItems" is ignored when "items" is not an array of schemas');
          return;
        }
        validateAdditionalItems(cxt, items);
      }
    };
    function validateAdditionalItems(cxt, items) {
      const { gen, schema: schema2, data, keyword, it } = cxt;
      it.items = true;
      const len = gen.const("len", (0, codegen_1._)`${data}.length`);
      if (schema2 === false) {
        cxt.setParams({ len: items.length });
        cxt.pass((0, codegen_1._)`${len} <= ${items.length}`);
      } else if (typeof schema2 == "object" && !(0, util_1.alwaysValidSchema)(it, schema2)) {
        const valid = gen.var("valid", (0, codegen_1._)`${len} <= ${items.length}`);
        gen.if((0, codegen_1.not)(valid), () => validateItems(valid));
        cxt.ok(valid);
      }
      function validateItems(valid) {
        gen.forRange("i", items.length, len, (i) => {
          cxt.subschema({ keyword, dataProp: i, dataPropType: util_1.Type.Num }, valid);
          if (!it.allErrors)
            gen.if((0, codegen_1.not)(valid), () => gen.break());
        });
      }
    }
    exports2.validateAdditionalItems = validateAdditionalItems;
    exports2.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/items.js
var require_items = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/items.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.validateTuple = void 0;
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var code_1 = require_code2();
    var def = {
      keyword: "items",
      type: "array",
      schemaType: ["object", "array", "boolean"],
      before: "uniqueItems",
      code(cxt) {
        const { schema: schema2, it } = cxt;
        if (Array.isArray(schema2))
          return validateTuple(cxt, "additionalItems", schema2);
        it.items = true;
        if ((0, util_1.alwaysValidSchema)(it, schema2))
          return;
        cxt.ok((0, code_1.validateArray)(cxt));
      }
    };
    function validateTuple(cxt, extraItems, schArr = cxt.schema) {
      const { gen, parentSchema, data, keyword, it } = cxt;
      checkStrictTuple(parentSchema);
      if (it.opts.unevaluated && schArr.length && it.items !== true) {
        it.items = util_1.mergeEvaluated.items(gen, schArr.length, it.items);
      }
      const valid = gen.name("valid");
      const len = gen.const("len", (0, codegen_1._)`${data}.length`);
      schArr.forEach((sch, i) => {
        if ((0, util_1.alwaysValidSchema)(it, sch))
          return;
        gen.if((0, codegen_1._)`${len} > ${i}`, () => cxt.subschema({
          keyword,
          schemaProp: i,
          dataProp: i
        }, valid));
        cxt.ok(valid);
      });
      function checkStrictTuple(sch) {
        const { opts, errSchemaPath } = it;
        const l = schArr.length;
        const fullTuple = l === sch.minItems && (l === sch.maxItems || sch[extraItems] === false);
        if (opts.strictTuples && !fullTuple) {
          const msg = `"${keyword}" is ${l}-tuple, but minItems or maxItems/${extraItems} are not specified or different at path "${errSchemaPath}"`;
          (0, util_1.checkStrictMode)(it, msg, opts.strictTuples);
        }
      }
    }
    exports2.validateTuple = validateTuple;
    exports2.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/prefixItems.js
var require_prefixItems = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/prefixItems.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    var items_1 = require_items();
    var def = {
      keyword: "prefixItems",
      type: "array",
      schemaType: ["array"],
      before: "uniqueItems",
      code: (cxt) => (0, items_1.validateTuple)(cxt, "items")
    };
    exports2.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/items2020.js
var require_items2020 = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/items2020.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var code_1 = require_code2();
    var additionalItems_1 = require_additionalItems();
    var error = {
      message: ({ params: { len } }) => (0, codegen_1.str)`must NOT have more than ${len} items`,
      params: ({ params: { len } }) => (0, codegen_1._)`{limit: ${len}}`
    };
    var def = {
      keyword: "items",
      type: "array",
      schemaType: ["object", "boolean"],
      before: "uniqueItems",
      error,
      code(cxt) {
        const { schema: schema2, parentSchema, it } = cxt;
        const { prefixItems } = parentSchema;
        it.items = true;
        if ((0, util_1.alwaysValidSchema)(it, schema2))
          return;
        if (prefixItems)
          (0, additionalItems_1.validateAdditionalItems)(cxt, prefixItems);
        else
          cxt.ok((0, code_1.validateArray)(cxt));
      }
    };
    exports2.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/contains.js
var require_contains = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/contains.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var error = {
      message: ({ params: { min, max } }) => max === void 0 ? (0, codegen_1.str)`must contain at least ${min} valid item(s)` : (0, codegen_1.str)`must contain at least ${min} and no more than ${max} valid item(s)`,
      params: ({ params: { min, max } }) => max === void 0 ? (0, codegen_1._)`{minContains: ${min}}` : (0, codegen_1._)`{minContains: ${min}, maxContains: ${max}}`
    };
    var def = {
      keyword: "contains",
      type: "array",
      schemaType: ["object", "boolean"],
      before: "uniqueItems",
      trackErrors: true,
      error,
      code(cxt) {
        const { gen, schema: schema2, parentSchema, data, it } = cxt;
        let min;
        let max;
        const { minContains, maxContains } = parentSchema;
        if (it.opts.next) {
          min = minContains === void 0 ? 1 : minContains;
          max = maxContains;
        } else {
          min = 1;
        }
        const len = gen.const("len", (0, codegen_1._)`${data}.length`);
        cxt.setParams({ min, max });
        if (max === void 0 && min === 0) {
          (0, util_1.checkStrictMode)(it, `"minContains" == 0 without "maxContains": "contains" keyword ignored`);
          return;
        }
        if (max !== void 0 && min > max) {
          (0, util_1.checkStrictMode)(it, `"minContains" > "maxContains" is always invalid`);
          cxt.fail();
          return;
        }
        if ((0, util_1.alwaysValidSchema)(it, schema2)) {
          let cond = (0, codegen_1._)`${len} >= ${min}`;
          if (max !== void 0)
            cond = (0, codegen_1._)`${cond} && ${len} <= ${max}`;
          cxt.pass(cond);
          return;
        }
        it.items = true;
        const valid = gen.name("valid");
        if (max === void 0 && min === 1) {
          validateItems(valid, () => gen.if(valid, () => gen.break()));
        } else if (min === 0) {
          gen.let(valid, true);
          if (max !== void 0)
            gen.if((0, codegen_1._)`${data}.length > 0`, validateItemsWithCount);
        } else {
          gen.let(valid, false);
          validateItemsWithCount();
        }
        cxt.result(valid, () => cxt.reset());
        function validateItemsWithCount() {
          const schValid = gen.name("_valid");
          const count = gen.let("count", 0);
          validateItems(schValid, () => gen.if(schValid, () => checkLimits(count)));
        }
        function validateItems(_valid, block) {
          gen.forRange("i", 0, len, (i) => {
            cxt.subschema({
              keyword: "contains",
              dataProp: i,
              dataPropType: util_1.Type.Num,
              compositeRule: true
            }, _valid);
            block();
          });
        }
        function checkLimits(count) {
          gen.code((0, codegen_1._)`${count}++`);
          if (max === void 0) {
            gen.if((0, codegen_1._)`${count} >= ${min}`, () => gen.assign(valid, true).break());
          } else {
            gen.if((0, codegen_1._)`${count} > ${max}`, () => gen.assign(valid, false).break());
            if (min === 1)
              gen.assign(valid, true);
            else
              gen.if((0, codegen_1._)`${count} >= ${min}`, () => gen.assign(valid, true));
          }
        }
      }
    };
    exports2.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/dependencies.js
var require_dependencies = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/dependencies.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.validateSchemaDeps = exports2.validatePropertyDeps = exports2.error = void 0;
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var code_1 = require_code2();
    exports2.error = {
      message: ({ params: { property, depsCount, deps } }) => {
        const property_ies = depsCount === 1 ? "property" : "properties";
        return (0, codegen_1.str)`must have ${property_ies} ${deps} when property ${property} is present`;
      },
      params: ({ params: { property, depsCount, deps, missingProperty } }) => (0, codegen_1._)`{property: ${property},
    missingProperty: ${missingProperty},
    depsCount: ${depsCount},
    deps: ${deps}}`
      // TODO change to reference
    };
    var def = {
      keyword: "dependencies",
      type: "object",
      schemaType: "object",
      error: exports2.error,
      code(cxt) {
        const [propDeps, schDeps] = splitDependencies(cxt);
        validatePropertyDeps(cxt, propDeps);
        validateSchemaDeps(cxt, schDeps);
      }
    };
    function splitDependencies({ schema: schema2 }) {
      const propertyDeps = {};
      const schemaDeps = {};
      for (const key in schema2) {
        if (key === "__proto__")
          continue;
        const deps = Array.isArray(schema2[key]) ? propertyDeps : schemaDeps;
        deps[key] = schema2[key];
      }
      return [propertyDeps, schemaDeps];
    }
    function validatePropertyDeps(cxt, propertyDeps = cxt.schema) {
      const { gen, data, it } = cxt;
      if (Object.keys(propertyDeps).length === 0)
        return;
      const missing = gen.let("missing");
      for (const prop in propertyDeps) {
        const deps = propertyDeps[prop];
        if (deps.length === 0)
          continue;
        const hasProperty = (0, code_1.propertyInData)(gen, data, prop, it.opts.ownProperties);
        cxt.setParams({
          property: prop,
          depsCount: deps.length,
          deps: deps.join(", ")
        });
        if (it.allErrors) {
          gen.if(hasProperty, () => {
            for (const depProp of deps) {
              (0, code_1.checkReportMissingProp)(cxt, depProp);
            }
          });
        } else {
          gen.if((0, codegen_1._)`${hasProperty} && (${(0, code_1.checkMissingProp)(cxt, deps, missing)})`);
          (0, code_1.reportMissingProp)(cxt, missing);
          gen.else();
        }
      }
    }
    exports2.validatePropertyDeps = validatePropertyDeps;
    function validateSchemaDeps(cxt, schemaDeps = cxt.schema) {
      const { gen, data, keyword, it } = cxt;
      const valid = gen.name("valid");
      for (const prop in schemaDeps) {
        if ((0, util_1.alwaysValidSchema)(it, schemaDeps[prop]))
          continue;
        gen.if(
          (0, code_1.propertyInData)(gen, data, prop, it.opts.ownProperties),
          () => {
            const schCxt = cxt.subschema({ keyword, schemaProp: prop }, valid);
            cxt.mergeValidEvaluated(schCxt, valid);
          },
          () => gen.var(valid, true)
          // TODO var
        );
        cxt.ok(valid);
      }
    }
    exports2.validateSchemaDeps = validateSchemaDeps;
    exports2.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/propertyNames.js
var require_propertyNames = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/propertyNames.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var error = {
      message: "property name must be valid",
      params: ({ params }) => (0, codegen_1._)`{propertyName: ${params.propertyName}}`
    };
    var def = {
      keyword: "propertyNames",
      type: "object",
      schemaType: ["object", "boolean"],
      error,
      code(cxt) {
        const { gen, schema: schema2, data, it } = cxt;
        if ((0, util_1.alwaysValidSchema)(it, schema2))
          return;
        const valid = gen.name("valid");
        gen.forIn("key", data, (key) => {
          cxt.setParams({ propertyName: key });
          cxt.subschema({
            keyword: "propertyNames",
            data: key,
            dataTypes: ["string"],
            propertyName: key,
            compositeRule: true
          }, valid);
          gen.if((0, codegen_1.not)(valid), () => {
            cxt.error(true);
            if (!it.allErrors)
              gen.break();
          });
        });
        cxt.ok(valid);
      }
    };
    exports2.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/additionalProperties.js
var require_additionalProperties = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/additionalProperties.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    var code_1 = require_code2();
    var codegen_1 = require_codegen();
    var names_1 = require_names();
    var util_1 = require_util();
    var error = {
      message: "must NOT have additional properties",
      params: ({ params }) => (0, codegen_1._)`{additionalProperty: ${params.additionalProperty}}`
    };
    var def = {
      keyword: "additionalProperties",
      type: ["object"],
      schemaType: ["boolean", "object"],
      allowUndefined: true,
      trackErrors: true,
      error,
      code(cxt) {
        const { gen, schema: schema2, parentSchema, data, errsCount, it } = cxt;
        if (!errsCount)
          throw new Error("ajv implementation error");
        const { allErrors, opts } = it;
        it.props = true;
        if (opts.removeAdditional !== "all" && (0, util_1.alwaysValidSchema)(it, schema2))
          return;
        const props = (0, code_1.allSchemaProperties)(parentSchema.properties);
        const patProps = (0, code_1.allSchemaProperties)(parentSchema.patternProperties);
        checkAdditionalProperties();
        cxt.ok((0, codegen_1._)`${errsCount} === ${names_1.default.errors}`);
        function checkAdditionalProperties() {
          gen.forIn("key", data, (key) => {
            if (!props.length && !patProps.length)
              additionalPropertyCode(key);
            else
              gen.if(isAdditional(key), () => additionalPropertyCode(key));
          });
        }
        function isAdditional(key) {
          let definedProp;
          if (props.length > 8) {
            const propsSchema = (0, util_1.schemaRefOrVal)(it, parentSchema.properties, "properties");
            definedProp = (0, code_1.isOwnProperty)(gen, propsSchema, key);
          } else if (props.length) {
            definedProp = (0, codegen_1.or)(...props.map((p) => (0, codegen_1._)`${key} === ${p}`));
          } else {
            definedProp = codegen_1.nil;
          }
          if (patProps.length) {
            definedProp = (0, codegen_1.or)(definedProp, ...patProps.map((p) => (0, codegen_1._)`${(0, code_1.usePattern)(cxt, p)}.test(${key})`));
          }
          return (0, codegen_1.not)(definedProp);
        }
        function deleteAdditional(key) {
          gen.code((0, codegen_1._)`delete ${data}[${key}]`);
        }
        function additionalPropertyCode(key) {
          if (opts.removeAdditional === "all" || opts.removeAdditional && schema2 === false) {
            deleteAdditional(key);
            return;
          }
          if (schema2 === false) {
            cxt.setParams({ additionalProperty: key });
            cxt.error();
            if (!allErrors)
              gen.break();
            return;
          }
          if (typeof schema2 == "object" && !(0, util_1.alwaysValidSchema)(it, schema2)) {
            const valid = gen.name("valid");
            if (opts.removeAdditional === "failing") {
              applyAdditionalSchema(key, valid, false);
              gen.if((0, codegen_1.not)(valid), () => {
                cxt.reset();
                deleteAdditional(key);
              });
            } else {
              applyAdditionalSchema(key, valid);
              if (!allErrors)
                gen.if((0, codegen_1.not)(valid), () => gen.break());
            }
          }
        }
        function applyAdditionalSchema(key, valid, errors) {
          const subschema = {
            keyword: "additionalProperties",
            dataProp: key,
            dataPropType: util_1.Type.Str
          };
          if (errors === false) {
            Object.assign(subschema, {
              compositeRule: true,
              createErrors: false,
              allErrors: false
            });
          }
          cxt.subschema(subschema, valid);
        }
      }
    };
    exports2.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/properties.js
var require_properties = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/properties.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    var validate_1 = require_validate();
    var code_1 = require_code2();
    var util_1 = require_util();
    var additionalProperties_1 = require_additionalProperties();
    var def = {
      keyword: "properties",
      type: "object",
      schemaType: "object",
      code(cxt) {
        const { gen, schema: schema2, parentSchema, data, it } = cxt;
        if (it.opts.removeAdditional === "all" && parentSchema.additionalProperties === void 0) {
          additionalProperties_1.default.code(new validate_1.KeywordCxt(it, additionalProperties_1.default, "additionalProperties"));
        }
        const allProps = (0, code_1.allSchemaProperties)(schema2);
        for (const prop of allProps) {
          it.definedProperties.add(prop);
        }
        if (it.opts.unevaluated && allProps.length && it.props !== true) {
          it.props = util_1.mergeEvaluated.props(gen, (0, util_1.toHash)(allProps), it.props);
        }
        const properties = allProps.filter((p) => !(0, util_1.alwaysValidSchema)(it, schema2[p]));
        if (properties.length === 0)
          return;
        const valid = gen.name("valid");
        for (const prop of properties) {
          if (hasDefault(prop)) {
            applyPropertySchema(prop);
          } else {
            gen.if((0, code_1.propertyInData)(gen, data, prop, it.opts.ownProperties));
            applyPropertySchema(prop);
            if (!it.allErrors)
              gen.else().var(valid, true);
            gen.endIf();
          }
          cxt.it.definedProperties.add(prop);
          cxt.ok(valid);
        }
        function hasDefault(prop) {
          return it.opts.useDefaults && !it.compositeRule && schema2[prop].default !== void 0;
        }
        function applyPropertySchema(prop) {
          cxt.subschema({
            keyword: "properties",
            schemaProp: prop,
            dataProp: prop
          }, valid);
        }
      }
    };
    exports2.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/patternProperties.js
var require_patternProperties = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/patternProperties.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    var code_1 = require_code2();
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var util_2 = require_util();
    var def = {
      keyword: "patternProperties",
      type: "object",
      schemaType: "object",
      code(cxt) {
        const { gen, schema: schema2, data, parentSchema, it } = cxt;
        const { opts } = it;
        const patterns = (0, code_1.allSchemaProperties)(schema2);
        const alwaysValidPatterns = patterns.filter((p) => (0, util_1.alwaysValidSchema)(it, schema2[p]));
        if (patterns.length === 0 || alwaysValidPatterns.length === patterns.length && (!it.opts.unevaluated || it.props === true)) {
          return;
        }
        const checkProperties = opts.strictSchema && !opts.allowMatchingProperties && parentSchema.properties;
        const valid = gen.name("valid");
        if (it.props !== true && !(it.props instanceof codegen_1.Name)) {
          it.props = (0, util_2.evaluatedPropsToName)(gen, it.props);
        }
        const { props } = it;
        validatePatternProperties();
        function validatePatternProperties() {
          for (const pat of patterns) {
            if (checkProperties)
              checkMatchingProperties(pat);
            if (it.allErrors) {
              validateProperties(pat);
            } else {
              gen.var(valid, true);
              validateProperties(pat);
              gen.if(valid);
            }
          }
        }
        function checkMatchingProperties(pat) {
          for (const prop in checkProperties) {
            if (new RegExp(pat).test(prop)) {
              (0, util_1.checkStrictMode)(it, `property ${prop} matches pattern ${pat} (use allowMatchingProperties)`);
            }
          }
        }
        function validateProperties(pat) {
          gen.forIn("key", data, (key) => {
            gen.if((0, codegen_1._)`${(0, code_1.usePattern)(cxt, pat)}.test(${key})`, () => {
              const alwaysValid = alwaysValidPatterns.includes(pat);
              if (!alwaysValid) {
                cxt.subschema({
                  keyword: "patternProperties",
                  schemaProp: pat,
                  dataProp: key,
                  dataPropType: util_2.Type.Str
                }, valid);
              }
              if (it.opts.unevaluated && props !== true) {
                gen.assign((0, codegen_1._)`${props}[${key}]`, true);
              } else if (!alwaysValid && !it.allErrors) {
                gen.if((0, codegen_1.not)(valid), () => gen.break());
              }
            });
          });
        }
      }
    };
    exports2.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/not.js
var require_not = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/not.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    var util_1 = require_util();
    var def = {
      keyword: "not",
      schemaType: ["object", "boolean"],
      trackErrors: true,
      code(cxt) {
        const { gen, schema: schema2, it } = cxt;
        if ((0, util_1.alwaysValidSchema)(it, schema2)) {
          cxt.fail();
          return;
        }
        const valid = gen.name("valid");
        cxt.subschema({
          keyword: "not",
          compositeRule: true,
          createErrors: false,
          allErrors: false
        }, valid);
        cxt.failResult(valid, () => cxt.reset(), () => cxt.error());
      },
      error: { message: "must NOT be valid" }
    };
    exports2.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/anyOf.js
var require_anyOf = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/anyOf.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    var code_1 = require_code2();
    var def = {
      keyword: "anyOf",
      schemaType: "array",
      trackErrors: true,
      code: code_1.validateUnion,
      error: { message: "must match a schema in anyOf" }
    };
    exports2.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/oneOf.js
var require_oneOf = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/oneOf.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var error = {
      message: "must match exactly one schema in oneOf",
      params: ({ params }) => (0, codegen_1._)`{passingSchemas: ${params.passing}}`
    };
    var def = {
      keyword: "oneOf",
      schemaType: "array",
      trackErrors: true,
      error,
      code(cxt) {
        const { gen, schema: schema2, parentSchema, it } = cxt;
        if (!Array.isArray(schema2))
          throw new Error("ajv implementation error");
        if (it.opts.discriminator && parentSchema.discriminator)
          return;
        const schArr = schema2;
        const valid = gen.let("valid", false);
        const passing = gen.let("passing", null);
        const schValid = gen.name("_valid");
        cxt.setParams({ passing });
        gen.block(validateOneOf);
        cxt.result(valid, () => cxt.reset(), () => cxt.error(true));
        function validateOneOf() {
          schArr.forEach((sch, i) => {
            let schCxt;
            if ((0, util_1.alwaysValidSchema)(it, sch)) {
              gen.var(schValid, true);
            } else {
              schCxt = cxt.subschema({
                keyword: "oneOf",
                schemaProp: i,
                compositeRule: true
              }, schValid);
            }
            if (i > 0) {
              gen.if((0, codegen_1._)`${schValid} && ${valid}`).assign(valid, false).assign(passing, (0, codegen_1._)`[${passing}, ${i}]`).else();
            }
            gen.if(schValid, () => {
              gen.assign(valid, true);
              gen.assign(passing, i);
              if (schCxt)
                cxt.mergeEvaluated(schCxt, codegen_1.Name);
            });
          });
        }
      }
    };
    exports2.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/allOf.js
var require_allOf = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/allOf.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    var util_1 = require_util();
    var def = {
      keyword: "allOf",
      schemaType: "array",
      code(cxt) {
        const { gen, schema: schema2, it } = cxt;
        if (!Array.isArray(schema2))
          throw new Error("ajv implementation error");
        const valid = gen.name("valid");
        schema2.forEach((sch, i) => {
          if ((0, util_1.alwaysValidSchema)(it, sch))
            return;
          const schCxt = cxt.subschema({ keyword: "allOf", schemaProp: i }, valid);
          cxt.ok(valid);
          cxt.mergeEvaluated(schCxt);
        });
      }
    };
    exports2.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/if.js
var require_if = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/if.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var util_1 = require_util();
    var error = {
      message: ({ params }) => (0, codegen_1.str)`must match "${params.ifClause}" schema`,
      params: ({ params }) => (0, codegen_1._)`{failingKeyword: ${params.ifClause}}`
    };
    var def = {
      keyword: "if",
      schemaType: ["object", "boolean"],
      trackErrors: true,
      error,
      code(cxt) {
        const { gen, parentSchema, it } = cxt;
        if (parentSchema.then === void 0 && parentSchema.else === void 0) {
          (0, util_1.checkStrictMode)(it, '"if" without "then" and "else" is ignored');
        }
        const hasThen = hasSchema(it, "then");
        const hasElse = hasSchema(it, "else");
        if (!hasThen && !hasElse)
          return;
        const valid = gen.let("valid", true);
        const schValid = gen.name("_valid");
        validateIf();
        cxt.reset();
        if (hasThen && hasElse) {
          const ifClause = gen.let("ifClause");
          cxt.setParams({ ifClause });
          gen.if(schValid, validateClause("then", ifClause), validateClause("else", ifClause));
        } else if (hasThen) {
          gen.if(schValid, validateClause("then"));
        } else {
          gen.if((0, codegen_1.not)(schValid), validateClause("else"));
        }
        cxt.pass(valid, () => cxt.error(true));
        function validateIf() {
          const schCxt = cxt.subschema({
            keyword: "if",
            compositeRule: true,
            createErrors: false,
            allErrors: false
          }, schValid);
          cxt.mergeEvaluated(schCxt);
        }
        function validateClause(keyword, ifClause) {
          return () => {
            const schCxt = cxt.subschema({ keyword }, schValid);
            gen.assign(valid, schValid);
            cxt.mergeValidEvaluated(schCxt, valid);
            if (ifClause)
              gen.assign(ifClause, (0, codegen_1._)`${keyword}`);
            else
              cxt.setParams({ ifClause: keyword });
          };
        }
      }
    };
    function hasSchema(it, keyword) {
      const schema2 = it.schema[keyword];
      return schema2 !== void 0 && !(0, util_1.alwaysValidSchema)(it, schema2);
    }
    exports2.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/thenElse.js
var require_thenElse = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/thenElse.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    var util_1 = require_util();
    var def = {
      keyword: ["then", "else"],
      schemaType: ["object", "boolean"],
      code({ keyword, parentSchema, it }) {
        if (parentSchema.if === void 0)
          (0, util_1.checkStrictMode)(it, `"${keyword}" without "if" is ignored`);
      }
    };
    exports2.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/applicator/index.js
var require_applicator = __commonJS({
  "node_modules/ajv/dist/vocabularies/applicator/index.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    var additionalItems_1 = require_additionalItems();
    var prefixItems_1 = require_prefixItems();
    var items_1 = require_items();
    var items2020_1 = require_items2020();
    var contains_1 = require_contains();
    var dependencies_1 = require_dependencies();
    var propertyNames_1 = require_propertyNames();
    var additionalProperties_1 = require_additionalProperties();
    var properties_1 = require_properties();
    var patternProperties_1 = require_patternProperties();
    var not_1 = require_not();
    var anyOf_1 = require_anyOf();
    var oneOf_1 = require_oneOf();
    var allOf_1 = require_allOf();
    var if_1 = require_if();
    var thenElse_1 = require_thenElse();
    function getApplicator(draft2020 = false) {
      const applicator = [
        // any
        not_1.default,
        anyOf_1.default,
        oneOf_1.default,
        allOf_1.default,
        if_1.default,
        thenElse_1.default,
        // object
        propertyNames_1.default,
        additionalProperties_1.default,
        dependencies_1.default,
        properties_1.default,
        patternProperties_1.default
      ];
      if (draft2020)
        applicator.push(prefixItems_1.default, items2020_1.default);
      else
        applicator.push(additionalItems_1.default, items_1.default);
      applicator.push(contains_1.default);
      return applicator;
    }
    exports2.default = getApplicator;
  }
});

// node_modules/ajv/dist/vocabularies/format/format.js
var require_format = __commonJS({
  "node_modules/ajv/dist/vocabularies/format/format.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var error = {
      message: ({ schemaCode }) => (0, codegen_1.str)`must match format "${schemaCode}"`,
      params: ({ schemaCode }) => (0, codegen_1._)`{format: ${schemaCode}}`
    };
    var def = {
      keyword: "format",
      type: ["number", "string"],
      schemaType: "string",
      $data: true,
      error,
      code(cxt, ruleType) {
        const { gen, data, $data, schema: schema2, schemaCode, it } = cxt;
        const { opts, errSchemaPath, schemaEnv, self } = it;
        if (!opts.validateFormats)
          return;
        if ($data)
          validate$DataFormat();
        else
          validateFormat();
        function validate$DataFormat() {
          const fmts = gen.scopeValue("formats", {
            ref: self.formats,
            code: opts.code.formats
          });
          const fDef = gen.const("fDef", (0, codegen_1._)`${fmts}[${schemaCode}]`);
          const fType = gen.let("fType");
          const format = gen.let("format");
          gen.if((0, codegen_1._)`typeof ${fDef} == "object" && !(${fDef} instanceof RegExp)`, () => gen.assign(fType, (0, codegen_1._)`${fDef}.type || "string"`).assign(format, (0, codegen_1._)`${fDef}.validate`), () => gen.assign(fType, (0, codegen_1._)`"string"`).assign(format, fDef));
          cxt.fail$data((0, codegen_1.or)(unknownFmt(), invalidFmt()));
          function unknownFmt() {
            if (opts.strictSchema === false)
              return codegen_1.nil;
            return (0, codegen_1._)`${schemaCode} && !${format}`;
          }
          function invalidFmt() {
            const callFormat = schemaEnv.$async ? (0, codegen_1._)`(${fDef}.async ? await ${format}(${data}) : ${format}(${data}))` : (0, codegen_1._)`${format}(${data})`;
            const validData = (0, codegen_1._)`(typeof ${format} == "function" ? ${callFormat} : ${format}.test(${data}))`;
            return (0, codegen_1._)`${format} && ${format} !== true && ${fType} === ${ruleType} && !${validData}`;
          }
        }
        function validateFormat() {
          const formatDef = self.formats[schema2];
          if (!formatDef) {
            unknownFormat();
            return;
          }
          if (formatDef === true)
            return;
          const [fmtType, format, fmtRef] = getFormat(formatDef);
          if (fmtType === ruleType)
            cxt.pass(validCondition());
          function unknownFormat() {
            if (opts.strictSchema === false) {
              self.logger.warn(unknownMsg());
              return;
            }
            throw new Error(unknownMsg());
            function unknownMsg() {
              return `unknown format "${schema2}" ignored in schema at path "${errSchemaPath}"`;
            }
          }
          function getFormat(fmtDef) {
            const code = fmtDef instanceof RegExp ? (0, codegen_1.regexpCode)(fmtDef) : opts.code.formats ? (0, codegen_1._)`${opts.code.formats}${(0, codegen_1.getProperty)(schema2)}` : void 0;
            const fmt = gen.scopeValue("formats", { key: schema2, ref: fmtDef, code });
            if (typeof fmtDef == "object" && !(fmtDef instanceof RegExp)) {
              return [fmtDef.type || "string", fmtDef.validate, (0, codegen_1._)`${fmt}.validate`];
            }
            return ["string", fmtDef, fmt];
          }
          function validCondition() {
            if (typeof formatDef == "object" && !(formatDef instanceof RegExp) && formatDef.async) {
              if (!schemaEnv.$async)
                throw new Error("async format in sync schema");
              return (0, codegen_1._)`await ${fmtRef}(${data})`;
            }
            return typeof format == "function" ? (0, codegen_1._)`${fmtRef}(${data})` : (0, codegen_1._)`${fmtRef}.test(${data})`;
          }
        }
      }
    };
    exports2.default = def;
  }
});

// node_modules/ajv/dist/vocabularies/format/index.js
var require_format2 = __commonJS({
  "node_modules/ajv/dist/vocabularies/format/index.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    var format_1 = require_format();
    var format = [format_1.default];
    exports2.default = format;
  }
});

// node_modules/ajv/dist/vocabularies/metadata.js
var require_metadata = __commonJS({
  "node_modules/ajv/dist/vocabularies/metadata.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.contentVocabulary = exports2.metadataVocabulary = void 0;
    exports2.metadataVocabulary = [
      "title",
      "description",
      "default",
      "deprecated",
      "readOnly",
      "writeOnly",
      "examples"
    ];
    exports2.contentVocabulary = [
      "contentMediaType",
      "contentEncoding",
      "contentSchema"
    ];
  }
});

// node_modules/ajv/dist/vocabularies/draft7.js
var require_draft7 = __commonJS({
  "node_modules/ajv/dist/vocabularies/draft7.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    var core_1 = require_core2();
    var validation_1 = require_validation();
    var applicator_1 = require_applicator();
    var format_1 = require_format2();
    var metadata_1 = require_metadata();
    var draft7Vocabularies = [
      core_1.default,
      validation_1.default,
      (0, applicator_1.default)(),
      format_1.default,
      metadata_1.metadataVocabulary,
      metadata_1.contentVocabulary
    ];
    exports2.default = draft7Vocabularies;
  }
});

// node_modules/ajv/dist/vocabularies/discriminator/types.js
var require_types = __commonJS({
  "node_modules/ajv/dist/vocabularies/discriminator/types.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.DiscrError = void 0;
    var DiscrError;
    (function(DiscrError2) {
      DiscrError2["Tag"] = "tag";
      DiscrError2["Mapping"] = "mapping";
    })(DiscrError || (exports2.DiscrError = DiscrError = {}));
  }
});

// node_modules/ajv/dist/vocabularies/discriminator/index.js
var require_discriminator = __commonJS({
  "node_modules/ajv/dist/vocabularies/discriminator/index.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    var codegen_1 = require_codegen();
    var types_1 = require_types();
    var compile_1 = require_compile();
    var ref_error_1 = require_ref_error();
    var util_1 = require_util();
    var error = {
      message: ({ params: { discrError, tagName } }) => discrError === types_1.DiscrError.Tag ? `tag "${tagName}" must be string` : `value of tag "${tagName}" must be in oneOf`,
      params: ({ params: { discrError, tag, tagName } }) => (0, codegen_1._)`{error: ${discrError}, tag: ${tagName}, tagValue: ${tag}}`
    };
    var def = {
      keyword: "discriminator",
      type: "object",
      schemaType: "object",
      error,
      code(cxt) {
        const { gen, data, schema: schema2, parentSchema, it } = cxt;
        const { oneOf } = parentSchema;
        if (!it.opts.discriminator) {
          throw new Error("discriminator: requires discriminator option");
        }
        const tagName = schema2.propertyName;
        if (typeof tagName != "string")
          throw new Error("discriminator: requires propertyName");
        if (schema2.mapping)
          throw new Error("discriminator: mapping is not supported");
        if (!oneOf)
          throw new Error("discriminator: requires oneOf keyword");
        const valid = gen.let("valid", false);
        const tag = gen.const("tag", (0, codegen_1._)`${data}${(0, codegen_1.getProperty)(tagName)}`);
        gen.if((0, codegen_1._)`typeof ${tag} == "string"`, () => validateMapping(), () => cxt.error(false, { discrError: types_1.DiscrError.Tag, tag, tagName }));
        cxt.ok(valid);
        function validateMapping() {
          const mapping = getMapping();
          gen.if(false);
          for (const tagValue in mapping) {
            gen.elseIf((0, codegen_1._)`${tag} === ${tagValue}`);
            gen.assign(valid, applyTagSchema(mapping[tagValue]));
          }
          gen.else();
          cxt.error(false, { discrError: types_1.DiscrError.Mapping, tag, tagName });
          gen.endIf();
        }
        function applyTagSchema(schemaProp) {
          const _valid = gen.name("valid");
          const schCxt = cxt.subschema({ keyword: "oneOf", schemaProp }, _valid);
          cxt.mergeEvaluated(schCxt, codegen_1.Name);
          return _valid;
        }
        function getMapping() {
          var _a;
          const oneOfMapping = {};
          const topRequired = hasRequired(parentSchema);
          let tagRequired = true;
          for (let i = 0; i < oneOf.length; i++) {
            let sch = oneOf[i];
            if ((sch === null || sch === void 0 ? void 0 : sch.$ref) && !(0, util_1.schemaHasRulesButRef)(sch, it.self.RULES)) {
              const ref = sch.$ref;
              sch = compile_1.resolveRef.call(it.self, it.schemaEnv.root, it.baseId, ref);
              if (sch instanceof compile_1.SchemaEnv)
                sch = sch.schema;
              if (sch === void 0)
                throw new ref_error_1.default(it.opts.uriResolver, it.baseId, ref);
            }
            const propSch = (_a = sch === null || sch === void 0 ? void 0 : sch.properties) === null || _a === void 0 ? void 0 : _a[tagName];
            if (typeof propSch != "object") {
              throw new Error(`discriminator: oneOf subschemas (or referenced schemas) must have "properties/${tagName}"`);
            }
            tagRequired = tagRequired && (topRequired || hasRequired(sch));
            addMappings(propSch, i);
          }
          if (!tagRequired)
            throw new Error(`discriminator: "${tagName}" must be required`);
          return oneOfMapping;
          function hasRequired({ required }) {
            return Array.isArray(required) && required.includes(tagName);
          }
          function addMappings(sch, i) {
            if (sch.const) {
              addMapping(sch.const, i);
            } else if (sch.enum) {
              for (const tagValue of sch.enum) {
                addMapping(tagValue, i);
              }
            } else {
              throw new Error(`discriminator: "properties/${tagName}" must have "const" or "enum"`);
            }
          }
          function addMapping(tagValue, i) {
            if (typeof tagValue != "string" || tagValue in oneOfMapping) {
              throw new Error(`discriminator: "${tagName}" values must be unique strings`);
            }
            oneOfMapping[tagValue] = i;
          }
        }
      }
    };
    exports2.default = def;
  }
});

// node_modules/ajv/dist/refs/json-schema-draft-07.json
var require_json_schema_draft_07 = __commonJS({
  "node_modules/ajv/dist/refs/json-schema-draft-07.json"(exports2, module2) {
    module2.exports = {
      $schema: "http://json-schema.org/draft-07/schema#",
      $id: "http://json-schema.org/draft-07/schema#",
      title: "Core schema meta-schema",
      definitions: {
        schemaArray: {
          type: "array",
          minItems: 1,
          items: { $ref: "#" }
        },
        nonNegativeInteger: {
          type: "integer",
          minimum: 0
        },
        nonNegativeIntegerDefault0: {
          allOf: [{ $ref: "#/definitions/nonNegativeInteger" }, { default: 0 }]
        },
        simpleTypes: {
          enum: ["array", "boolean", "integer", "null", "number", "object", "string"]
        },
        stringArray: {
          type: "array",
          items: { type: "string" },
          uniqueItems: true,
          default: []
        }
      },
      type: ["object", "boolean"],
      properties: {
        $id: {
          type: "string",
          format: "uri-reference"
        },
        $schema: {
          type: "string",
          format: "uri"
        },
        $ref: {
          type: "string",
          format: "uri-reference"
        },
        $comment: {
          type: "string"
        },
        title: {
          type: "string"
        },
        description: {
          type: "string"
        },
        default: true,
        readOnly: {
          type: "boolean",
          default: false
        },
        examples: {
          type: "array",
          items: true
        },
        multipleOf: {
          type: "number",
          exclusiveMinimum: 0
        },
        maximum: {
          type: "number"
        },
        exclusiveMaximum: {
          type: "number"
        },
        minimum: {
          type: "number"
        },
        exclusiveMinimum: {
          type: "number"
        },
        maxLength: { $ref: "#/definitions/nonNegativeInteger" },
        minLength: { $ref: "#/definitions/nonNegativeIntegerDefault0" },
        pattern: {
          type: "string",
          format: "regex"
        },
        additionalItems: { $ref: "#" },
        items: {
          anyOf: [{ $ref: "#" }, { $ref: "#/definitions/schemaArray" }],
          default: true
        },
        maxItems: { $ref: "#/definitions/nonNegativeInteger" },
        minItems: { $ref: "#/definitions/nonNegativeIntegerDefault0" },
        uniqueItems: {
          type: "boolean",
          default: false
        },
        contains: { $ref: "#" },
        maxProperties: { $ref: "#/definitions/nonNegativeInteger" },
        minProperties: { $ref: "#/definitions/nonNegativeIntegerDefault0" },
        required: { $ref: "#/definitions/stringArray" },
        additionalProperties: { $ref: "#" },
        definitions: {
          type: "object",
          additionalProperties: { $ref: "#" },
          default: {}
        },
        properties: {
          type: "object",
          additionalProperties: { $ref: "#" },
          default: {}
        },
        patternProperties: {
          type: "object",
          additionalProperties: { $ref: "#" },
          propertyNames: { format: "regex" },
          default: {}
        },
        dependencies: {
          type: "object",
          additionalProperties: {
            anyOf: [{ $ref: "#" }, { $ref: "#/definitions/stringArray" }]
          }
        },
        propertyNames: { $ref: "#" },
        const: true,
        enum: {
          type: "array",
          items: true,
          minItems: 1,
          uniqueItems: true
        },
        type: {
          anyOf: [
            { $ref: "#/definitions/simpleTypes" },
            {
              type: "array",
              items: { $ref: "#/definitions/simpleTypes" },
              minItems: 1,
              uniqueItems: true
            }
          ]
        },
        format: { type: "string" },
        contentMediaType: { type: "string" },
        contentEncoding: { type: "string" },
        if: { $ref: "#" },
        then: { $ref: "#" },
        else: { $ref: "#" },
        allOf: { $ref: "#/definitions/schemaArray" },
        anyOf: { $ref: "#/definitions/schemaArray" },
        oneOf: { $ref: "#/definitions/schemaArray" },
        not: { $ref: "#" }
      },
      default: true
    };
  }
});

// node_modules/ajv/dist/ajv.js
var require_ajv = __commonJS({
  "node_modules/ajv/dist/ajv.js"(exports2, module2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.MissingRefError = exports2.ValidationError = exports2.CodeGen = exports2.Name = exports2.nil = exports2.stringify = exports2.str = exports2._ = exports2.KeywordCxt = exports2.Ajv = void 0;
    var core_1 = require_core();
    var draft7_1 = require_draft7();
    var discriminator_1 = require_discriminator();
    var draft7MetaSchema = require_json_schema_draft_07();
    var META_SUPPORT_DATA = ["/properties"];
    var META_SCHEMA_ID = "http://json-schema.org/draft-07/schema";
    var Ajv2 = class extends core_1.default {
      _addVocabularies() {
        super._addVocabularies();
        draft7_1.default.forEach((v) => this.addVocabulary(v));
        if (this.opts.discriminator)
          this.addKeyword(discriminator_1.default);
      }
      _addDefaultMetaSchema() {
        super._addDefaultMetaSchema();
        if (!this.opts.meta)
          return;
        const metaSchema = this.opts.$data ? this.$dataMetaSchema(draft7MetaSchema, META_SUPPORT_DATA) : draft7MetaSchema;
        this.addMetaSchema(metaSchema, META_SCHEMA_ID, false);
        this.refs["http://json-schema.org/schema"] = META_SCHEMA_ID;
      }
      defaultMeta() {
        return this.opts.defaultMeta = super.defaultMeta() || (this.getSchema(META_SCHEMA_ID) ? META_SCHEMA_ID : void 0);
      }
    };
    exports2.Ajv = Ajv2;
    module2.exports = exports2 = Ajv2;
    module2.exports.Ajv = Ajv2;
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.default = Ajv2;
    var validate_1 = require_validate();
    Object.defineProperty(exports2, "KeywordCxt", { enumerable: true, get: function() {
      return validate_1.KeywordCxt;
    } });
    var codegen_1 = require_codegen();
    Object.defineProperty(exports2, "_", { enumerable: true, get: function() {
      return codegen_1._;
    } });
    Object.defineProperty(exports2, "str", { enumerable: true, get: function() {
      return codegen_1.str;
    } });
    Object.defineProperty(exports2, "stringify", { enumerable: true, get: function() {
      return codegen_1.stringify;
    } });
    Object.defineProperty(exports2, "nil", { enumerable: true, get: function() {
      return codegen_1.nil;
    } });
    Object.defineProperty(exports2, "Name", { enumerable: true, get: function() {
      return codegen_1.Name;
    } });
    Object.defineProperty(exports2, "CodeGen", { enumerable: true, get: function() {
      return codegen_1.CodeGen;
    } });
    var validation_error_1 = require_validation_error();
    Object.defineProperty(exports2, "ValidationError", { enumerable: true, get: function() {
      return validation_error_1.default;
    } });
    var ref_error_1 = require_ref_error();
    Object.defineProperty(exports2, "MissingRefError", { enumerable: true, get: function() {
      return ref_error_1.default;
    } });
  }
});

// src/extension.ts
var extension_exports = {};
__export(extension_exports, {
  activate: () => activate,
  checkCliInstalled: () => checkCliInstalled,
  checkWorkflowDir: () => checkWorkflowDir,
  deactivate: () => deactivate,
  updateContextKeys: () => updateContextKeys
});
module.exports = __toCommonJS(extension_exports);
var vscode21 = __toESM(require("vscode"));
var import_child_process3 = require("child_process");
var import_util = require("util");
var path14 = __toESM(require("path"));
var fs6 = __toESM(require("fs"));

// src/data/workflow-store.ts
var fs2 = __toESM(require("fs/promises"));
var path2 = __toESM(require("path"));
var import_events2 = require("events");

// src/data/types.ts
var TicketStatus = /* @__PURE__ */ ((TicketStatus2) => {
  TicketStatus2["Backlog"] = "backlog";
  TicketStatus2["Ready"] = "ready";
  TicketStatus2["InProgress"] = "in-progress";
  TicketStatus2["Blocked"] = "blocked";
  TicketStatus2["Review"] = "review";
  TicketStatus2["Done"] = "done";
  return TicketStatus2;
})(TicketStatus || {});

// node_modules/js-yaml/dist/js-yaml.mjs
function isNothing(subject) {
  return typeof subject === "undefined" || subject === null;
}
function isObject(subject) {
  return typeof subject === "object" && subject !== null;
}
function toArray(sequence) {
  if (Array.isArray(sequence)) return sequence;
  else if (isNothing(sequence)) return [];
  return [sequence];
}
function extend(target, source) {
  var index, length, key, sourceKeys;
  if (source) {
    sourceKeys = Object.keys(source);
    for (index = 0, length = sourceKeys.length; index < length; index += 1) {
      key = sourceKeys[index];
      target[key] = source[key];
    }
  }
  return target;
}
function repeat(string, count) {
  var result = "", cycle;
  for (cycle = 0; cycle < count; cycle += 1) {
    result += string;
  }
  return result;
}
function isNegativeZero(number) {
  return number === 0 && Number.NEGATIVE_INFINITY === 1 / number;
}
var isNothing_1 = isNothing;
var isObject_1 = isObject;
var toArray_1 = toArray;
var repeat_1 = repeat;
var isNegativeZero_1 = isNegativeZero;
var extend_1 = extend;
var common = {
  isNothing: isNothing_1,
  isObject: isObject_1,
  toArray: toArray_1,
  repeat: repeat_1,
  isNegativeZero: isNegativeZero_1,
  extend: extend_1
};
function formatError(exception2, compact) {
  var where = "", message = exception2.reason || "(unknown reason)";
  if (!exception2.mark) return message;
  if (exception2.mark.name) {
    where += 'in "' + exception2.mark.name + '" ';
  }
  where += "(" + (exception2.mark.line + 1) + ":" + (exception2.mark.column + 1) + ")";
  if (!compact && exception2.mark.snippet) {
    where += "\n\n" + exception2.mark.snippet;
  }
  return message + " " + where;
}
function YAMLException$1(reason, mark) {
  Error.call(this);
  this.name = "YAMLException";
  this.reason = reason;
  this.mark = mark;
  this.message = formatError(this, false);
  if (Error.captureStackTrace) {
    Error.captureStackTrace(this, this.constructor);
  } else {
    this.stack = new Error().stack || "";
  }
}
YAMLException$1.prototype = Object.create(Error.prototype);
YAMLException$1.prototype.constructor = YAMLException$1;
YAMLException$1.prototype.toString = function toString(compact) {
  return this.name + ": " + formatError(this, compact);
};
var exception = YAMLException$1;
function getLine(buffer, lineStart, lineEnd, position, maxLineLength) {
  var head = "";
  var tail = "";
  var maxHalfLength = Math.floor(maxLineLength / 2) - 1;
  if (position - lineStart > maxHalfLength) {
    head = " ... ";
    lineStart = position - maxHalfLength + head.length;
  }
  if (lineEnd - position > maxHalfLength) {
    tail = " ...";
    lineEnd = position + maxHalfLength - tail.length;
  }
  return {
    str: head + buffer.slice(lineStart, lineEnd).replace(/\t/g, "\u2192") + tail,
    pos: position - lineStart + head.length
    // relative position
  };
}
function padStart(string, max) {
  return common.repeat(" ", max - string.length) + string;
}
function makeSnippet(mark, options) {
  options = Object.create(options || null);
  if (!mark.buffer) return null;
  if (!options.maxLength) options.maxLength = 79;
  if (typeof options.indent !== "number") options.indent = 1;
  if (typeof options.linesBefore !== "number") options.linesBefore = 3;
  if (typeof options.linesAfter !== "number") options.linesAfter = 2;
  var re = /\r?\n|\r|\0/g;
  var lineStarts = [0];
  var lineEnds = [];
  var match;
  var foundLineNo = -1;
  while (match = re.exec(mark.buffer)) {
    lineEnds.push(match.index);
    lineStarts.push(match.index + match[0].length);
    if (mark.position <= match.index && foundLineNo < 0) {
      foundLineNo = lineStarts.length - 2;
    }
  }
  if (foundLineNo < 0) foundLineNo = lineStarts.length - 1;
  var result = "", i, line;
  var lineNoLength = Math.min(mark.line + options.linesAfter, lineEnds.length).toString().length;
  var maxLineLength = options.maxLength - (options.indent + lineNoLength + 3);
  for (i = 1; i <= options.linesBefore; i++) {
    if (foundLineNo - i < 0) break;
    line = getLine(
      mark.buffer,
      lineStarts[foundLineNo - i],
      lineEnds[foundLineNo - i],
      mark.position - (lineStarts[foundLineNo] - lineStarts[foundLineNo - i]),
      maxLineLength
    );
    result = common.repeat(" ", options.indent) + padStart((mark.line - i + 1).toString(), lineNoLength) + " | " + line.str + "\n" + result;
  }
  line = getLine(mark.buffer, lineStarts[foundLineNo], lineEnds[foundLineNo], mark.position, maxLineLength);
  result += common.repeat(" ", options.indent) + padStart((mark.line + 1).toString(), lineNoLength) + " | " + line.str + "\n";
  result += common.repeat("-", options.indent + lineNoLength + 3 + line.pos) + "^\n";
  for (i = 1; i <= options.linesAfter; i++) {
    if (foundLineNo + i >= lineEnds.length) break;
    line = getLine(
      mark.buffer,
      lineStarts[foundLineNo + i],
      lineEnds[foundLineNo + i],
      mark.position - (lineStarts[foundLineNo] - lineStarts[foundLineNo + i]),
      maxLineLength
    );
    result += common.repeat(" ", options.indent) + padStart((mark.line + i + 1).toString(), lineNoLength) + " | " + line.str + "\n";
  }
  return result.replace(/\n$/, "");
}
var snippet = makeSnippet;
var TYPE_CONSTRUCTOR_OPTIONS = [
  "kind",
  "multi",
  "resolve",
  "construct",
  "instanceOf",
  "predicate",
  "represent",
  "representName",
  "defaultStyle",
  "styleAliases"
];
var YAML_NODE_KINDS = [
  "scalar",
  "sequence",
  "mapping"
];
function compileStyleAliases(map2) {
  var result = {};
  if (map2 !== null) {
    Object.keys(map2).forEach(function(style) {
      map2[style].forEach(function(alias) {
        result[String(alias)] = style;
      });
    });
  }
  return result;
}
function Type$1(tag, options) {
  options = options || {};
  Object.keys(options).forEach(function(name) {
    if (TYPE_CONSTRUCTOR_OPTIONS.indexOf(name) === -1) {
      throw new exception('Unknown option "' + name + '" is met in definition of "' + tag + '" YAML type.');
    }
  });
  this.options = options;
  this.tag = tag;
  this.kind = options["kind"] || null;
  this.resolve = options["resolve"] || function() {
    return true;
  };
  this.construct = options["construct"] || function(data) {
    return data;
  };
  this.instanceOf = options["instanceOf"] || null;
  this.predicate = options["predicate"] || null;
  this.represent = options["represent"] || null;
  this.representName = options["representName"] || null;
  this.defaultStyle = options["defaultStyle"] || null;
  this.multi = options["multi"] || false;
  this.styleAliases = compileStyleAliases(options["styleAliases"] || null);
  if (YAML_NODE_KINDS.indexOf(this.kind) === -1) {
    throw new exception('Unknown kind "' + this.kind + '" is specified for "' + tag + '" YAML type.');
  }
}
var type = Type$1;
function compileList(schema2, name) {
  var result = [];
  schema2[name].forEach(function(currentType) {
    var newIndex = result.length;
    result.forEach(function(previousType, previousIndex) {
      if (previousType.tag === currentType.tag && previousType.kind === currentType.kind && previousType.multi === currentType.multi) {
        newIndex = previousIndex;
      }
    });
    result[newIndex] = currentType;
  });
  return result;
}
function compileMap() {
  var result = {
    scalar: {},
    sequence: {},
    mapping: {},
    fallback: {},
    multi: {
      scalar: [],
      sequence: [],
      mapping: [],
      fallback: []
    }
  }, index, length;
  function collectType(type2) {
    if (type2.multi) {
      result.multi[type2.kind].push(type2);
      result.multi["fallback"].push(type2);
    } else {
      result[type2.kind][type2.tag] = result["fallback"][type2.tag] = type2;
    }
  }
  for (index = 0, length = arguments.length; index < length; index += 1) {
    arguments[index].forEach(collectType);
  }
  return result;
}
function Schema$1(definition) {
  return this.extend(definition);
}
Schema$1.prototype.extend = function extend2(definition) {
  var implicit = [];
  var explicit = [];
  if (definition instanceof type) {
    explicit.push(definition);
  } else if (Array.isArray(definition)) {
    explicit = explicit.concat(definition);
  } else if (definition && (Array.isArray(definition.implicit) || Array.isArray(definition.explicit))) {
    if (definition.implicit) implicit = implicit.concat(definition.implicit);
    if (definition.explicit) explicit = explicit.concat(definition.explicit);
  } else {
    throw new exception("Schema.extend argument should be a Type, [ Type ], or a schema definition ({ implicit: [...], explicit: [...] })");
  }
  implicit.forEach(function(type$1) {
    if (!(type$1 instanceof type)) {
      throw new exception("Specified list of YAML types (or a single Type object) contains a non-Type object.");
    }
    if (type$1.loadKind && type$1.loadKind !== "scalar") {
      throw new exception("There is a non-scalar type in the implicit list of a schema. Implicit resolving of such types is not supported.");
    }
    if (type$1.multi) {
      throw new exception("There is a multi type in the implicit list of a schema. Multi tags can only be listed as explicit.");
    }
  });
  explicit.forEach(function(type$1) {
    if (!(type$1 instanceof type)) {
      throw new exception("Specified list of YAML types (or a single Type object) contains a non-Type object.");
    }
  });
  var result = Object.create(Schema$1.prototype);
  result.implicit = (this.implicit || []).concat(implicit);
  result.explicit = (this.explicit || []).concat(explicit);
  result.compiledImplicit = compileList(result, "implicit");
  result.compiledExplicit = compileList(result, "explicit");
  result.compiledTypeMap = compileMap(result.compiledImplicit, result.compiledExplicit);
  return result;
};
var schema = Schema$1;
var str = new type("tag:yaml.org,2002:str", {
  kind: "scalar",
  construct: function(data) {
    return data !== null ? data : "";
  }
});
var seq = new type("tag:yaml.org,2002:seq", {
  kind: "sequence",
  construct: function(data) {
    return data !== null ? data : [];
  }
});
var map = new type("tag:yaml.org,2002:map", {
  kind: "mapping",
  construct: function(data) {
    return data !== null ? data : {};
  }
});
var failsafe = new schema({
  explicit: [
    str,
    seq,
    map
  ]
});
function resolveYamlNull(data) {
  if (data === null) return true;
  var max = data.length;
  return max === 1 && data === "~" || max === 4 && (data === "null" || data === "Null" || data === "NULL");
}
function constructYamlNull() {
  return null;
}
function isNull(object) {
  return object === null;
}
var _null = new type("tag:yaml.org,2002:null", {
  kind: "scalar",
  resolve: resolveYamlNull,
  construct: constructYamlNull,
  predicate: isNull,
  represent: {
    canonical: function() {
      return "~";
    },
    lowercase: function() {
      return "null";
    },
    uppercase: function() {
      return "NULL";
    },
    camelcase: function() {
      return "Null";
    },
    empty: function() {
      return "";
    }
  },
  defaultStyle: "lowercase"
});
function resolveYamlBoolean(data) {
  if (data === null) return false;
  var max = data.length;
  return max === 4 && (data === "true" || data === "True" || data === "TRUE") || max === 5 && (data === "false" || data === "False" || data === "FALSE");
}
function constructYamlBoolean(data) {
  return data === "true" || data === "True" || data === "TRUE";
}
function isBoolean(object) {
  return Object.prototype.toString.call(object) === "[object Boolean]";
}
var bool = new type("tag:yaml.org,2002:bool", {
  kind: "scalar",
  resolve: resolveYamlBoolean,
  construct: constructYamlBoolean,
  predicate: isBoolean,
  represent: {
    lowercase: function(object) {
      return object ? "true" : "false";
    },
    uppercase: function(object) {
      return object ? "TRUE" : "FALSE";
    },
    camelcase: function(object) {
      return object ? "True" : "False";
    }
  },
  defaultStyle: "lowercase"
});
function isHexCode(c) {
  return 48 <= c && c <= 57 || 65 <= c && c <= 70 || 97 <= c && c <= 102;
}
function isOctCode(c) {
  return 48 <= c && c <= 55;
}
function isDecCode(c) {
  return 48 <= c && c <= 57;
}
function resolveYamlInteger(data) {
  if (data === null) return false;
  var max = data.length, index = 0, hasDigits = false, ch;
  if (!max) return false;
  ch = data[index];
  if (ch === "-" || ch === "+") {
    ch = data[++index];
  }
  if (ch === "0") {
    if (index + 1 === max) return true;
    ch = data[++index];
    if (ch === "b") {
      index++;
      for (; index < max; index++) {
        ch = data[index];
        if (ch === "_") continue;
        if (ch !== "0" && ch !== "1") return false;
        hasDigits = true;
      }
      return hasDigits && ch !== "_";
    }
    if (ch === "x") {
      index++;
      for (; index < max; index++) {
        ch = data[index];
        if (ch === "_") continue;
        if (!isHexCode(data.charCodeAt(index))) return false;
        hasDigits = true;
      }
      return hasDigits && ch !== "_";
    }
    if (ch === "o") {
      index++;
      for (; index < max; index++) {
        ch = data[index];
        if (ch === "_") continue;
        if (!isOctCode(data.charCodeAt(index))) return false;
        hasDigits = true;
      }
      return hasDigits && ch !== "_";
    }
  }
  if (ch === "_") return false;
  for (; index < max; index++) {
    ch = data[index];
    if (ch === "_") continue;
    if (!isDecCode(data.charCodeAt(index))) {
      return false;
    }
    hasDigits = true;
  }
  if (!hasDigits || ch === "_") return false;
  return true;
}
function constructYamlInteger(data) {
  var value = data, sign = 1, ch;
  if (value.indexOf("_") !== -1) {
    value = value.replace(/_/g, "");
  }
  ch = value[0];
  if (ch === "-" || ch === "+") {
    if (ch === "-") sign = -1;
    value = value.slice(1);
    ch = value[0];
  }
  if (value === "0") return 0;
  if (ch === "0") {
    if (value[1] === "b") return sign * parseInt(value.slice(2), 2);
    if (value[1] === "x") return sign * parseInt(value.slice(2), 16);
    if (value[1] === "o") return sign * parseInt(value.slice(2), 8);
  }
  return sign * parseInt(value, 10);
}
function isInteger(object) {
  return Object.prototype.toString.call(object) === "[object Number]" && (object % 1 === 0 && !common.isNegativeZero(object));
}
var int = new type("tag:yaml.org,2002:int", {
  kind: "scalar",
  resolve: resolveYamlInteger,
  construct: constructYamlInteger,
  predicate: isInteger,
  represent: {
    binary: function(obj) {
      return obj >= 0 ? "0b" + obj.toString(2) : "-0b" + obj.toString(2).slice(1);
    },
    octal: function(obj) {
      return obj >= 0 ? "0o" + obj.toString(8) : "-0o" + obj.toString(8).slice(1);
    },
    decimal: function(obj) {
      return obj.toString(10);
    },
    /* eslint-disable max-len */
    hexadecimal: function(obj) {
      return obj >= 0 ? "0x" + obj.toString(16).toUpperCase() : "-0x" + obj.toString(16).toUpperCase().slice(1);
    }
  },
  defaultStyle: "decimal",
  styleAliases: {
    binary: [2, "bin"],
    octal: [8, "oct"],
    decimal: [10, "dec"],
    hexadecimal: [16, "hex"]
  }
});
var YAML_FLOAT_PATTERN = new RegExp(
  // 2.5e4, 2.5 and integers
  "^(?:[-+]?(?:[0-9][0-9_]*)(?:\\.[0-9_]*)?(?:[eE][-+]?[0-9]+)?|\\.[0-9_]+(?:[eE][-+]?[0-9]+)?|[-+]?\\.(?:inf|Inf|INF)|\\.(?:nan|NaN|NAN))$"
);
function resolveYamlFloat(data) {
  if (data === null) return false;
  if (!YAML_FLOAT_PATTERN.test(data) || // Quick hack to not allow integers end with `_`
  // Probably should update regexp & check speed
  data[data.length - 1] === "_") {
    return false;
  }
  return true;
}
function constructYamlFloat(data) {
  var value, sign;
  value = data.replace(/_/g, "").toLowerCase();
  sign = value[0] === "-" ? -1 : 1;
  if ("+-".indexOf(value[0]) >= 0) {
    value = value.slice(1);
  }
  if (value === ".inf") {
    return sign === 1 ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
  } else if (value === ".nan") {
    return NaN;
  }
  return sign * parseFloat(value, 10);
}
var SCIENTIFIC_WITHOUT_DOT = /^[-+]?[0-9]+e/;
function representYamlFloat(object, style) {
  var res;
  if (isNaN(object)) {
    switch (style) {
      case "lowercase":
        return ".nan";
      case "uppercase":
        return ".NAN";
      case "camelcase":
        return ".NaN";
    }
  } else if (Number.POSITIVE_INFINITY === object) {
    switch (style) {
      case "lowercase":
        return ".inf";
      case "uppercase":
        return ".INF";
      case "camelcase":
        return ".Inf";
    }
  } else if (Number.NEGATIVE_INFINITY === object) {
    switch (style) {
      case "lowercase":
        return "-.inf";
      case "uppercase":
        return "-.INF";
      case "camelcase":
        return "-.Inf";
    }
  } else if (common.isNegativeZero(object)) {
    return "-0.0";
  }
  res = object.toString(10);
  return SCIENTIFIC_WITHOUT_DOT.test(res) ? res.replace("e", ".e") : res;
}
function isFloat(object) {
  return Object.prototype.toString.call(object) === "[object Number]" && (object % 1 !== 0 || common.isNegativeZero(object));
}
var float = new type("tag:yaml.org,2002:float", {
  kind: "scalar",
  resolve: resolveYamlFloat,
  construct: constructYamlFloat,
  predicate: isFloat,
  represent: representYamlFloat,
  defaultStyle: "lowercase"
});
var json = failsafe.extend({
  implicit: [
    _null,
    bool,
    int,
    float
  ]
});
var core = json;
var YAML_DATE_REGEXP = new RegExp(
  "^([0-9][0-9][0-9][0-9])-([0-9][0-9])-([0-9][0-9])$"
);
var YAML_TIMESTAMP_REGEXP = new RegExp(
  "^([0-9][0-9][0-9][0-9])-([0-9][0-9]?)-([0-9][0-9]?)(?:[Tt]|[ \\t]+)([0-9][0-9]?):([0-9][0-9]):([0-9][0-9])(?:\\.([0-9]*))?(?:[ \\t]*(Z|([-+])([0-9][0-9]?)(?::([0-9][0-9]))?))?$"
);
function resolveYamlTimestamp(data) {
  if (data === null) return false;
  if (YAML_DATE_REGEXP.exec(data) !== null) return true;
  if (YAML_TIMESTAMP_REGEXP.exec(data) !== null) return true;
  return false;
}
function constructYamlTimestamp(data) {
  var match, year, month, day, hour, minute, second, fraction = 0, delta = null, tz_hour, tz_minute, date;
  match = YAML_DATE_REGEXP.exec(data);
  if (match === null) match = YAML_TIMESTAMP_REGEXP.exec(data);
  if (match === null) throw new Error("Date resolve error");
  year = +match[1];
  month = +match[2] - 1;
  day = +match[3];
  if (!match[4]) {
    return new Date(Date.UTC(year, month, day));
  }
  hour = +match[4];
  minute = +match[5];
  second = +match[6];
  if (match[7]) {
    fraction = match[7].slice(0, 3);
    while (fraction.length < 3) {
      fraction += "0";
    }
    fraction = +fraction;
  }
  if (match[9]) {
    tz_hour = +match[10];
    tz_minute = +(match[11] || 0);
    delta = (tz_hour * 60 + tz_minute) * 6e4;
    if (match[9] === "-") delta = -delta;
  }
  date = new Date(Date.UTC(year, month, day, hour, minute, second, fraction));
  if (delta) date.setTime(date.getTime() - delta);
  return date;
}
function representYamlTimestamp(object) {
  return object.toISOString();
}
var timestamp = new type("tag:yaml.org,2002:timestamp", {
  kind: "scalar",
  resolve: resolveYamlTimestamp,
  construct: constructYamlTimestamp,
  instanceOf: Date,
  represent: representYamlTimestamp
});
function resolveYamlMerge(data) {
  return data === "<<" || data === null;
}
var merge = new type("tag:yaml.org,2002:merge", {
  kind: "scalar",
  resolve: resolveYamlMerge
});
var BASE64_MAP = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=\n\r";
function resolveYamlBinary(data) {
  if (data === null) return false;
  var code, idx, bitlen = 0, max = data.length, map2 = BASE64_MAP;
  for (idx = 0; idx < max; idx++) {
    code = map2.indexOf(data.charAt(idx));
    if (code > 64) continue;
    if (code < 0) return false;
    bitlen += 6;
  }
  return bitlen % 8 === 0;
}
function constructYamlBinary(data) {
  var idx, tailbits, input = data.replace(/[\r\n=]/g, ""), max = input.length, map2 = BASE64_MAP, bits = 0, result = [];
  for (idx = 0; idx < max; idx++) {
    if (idx % 4 === 0 && idx) {
      result.push(bits >> 16 & 255);
      result.push(bits >> 8 & 255);
      result.push(bits & 255);
    }
    bits = bits << 6 | map2.indexOf(input.charAt(idx));
  }
  tailbits = max % 4 * 6;
  if (tailbits === 0) {
    result.push(bits >> 16 & 255);
    result.push(bits >> 8 & 255);
    result.push(bits & 255);
  } else if (tailbits === 18) {
    result.push(bits >> 10 & 255);
    result.push(bits >> 2 & 255);
  } else if (tailbits === 12) {
    result.push(bits >> 4 & 255);
  }
  return new Uint8Array(result);
}
function representYamlBinary(object) {
  var result = "", bits = 0, idx, tail, max = object.length, map2 = BASE64_MAP;
  for (idx = 0; idx < max; idx++) {
    if (idx % 3 === 0 && idx) {
      result += map2[bits >> 18 & 63];
      result += map2[bits >> 12 & 63];
      result += map2[bits >> 6 & 63];
      result += map2[bits & 63];
    }
    bits = (bits << 8) + object[idx];
  }
  tail = max % 3;
  if (tail === 0) {
    result += map2[bits >> 18 & 63];
    result += map2[bits >> 12 & 63];
    result += map2[bits >> 6 & 63];
    result += map2[bits & 63];
  } else if (tail === 2) {
    result += map2[bits >> 10 & 63];
    result += map2[bits >> 4 & 63];
    result += map2[bits << 2 & 63];
    result += map2[64];
  } else if (tail === 1) {
    result += map2[bits >> 2 & 63];
    result += map2[bits << 4 & 63];
    result += map2[64];
    result += map2[64];
  }
  return result;
}
function isBinary(obj) {
  return Object.prototype.toString.call(obj) === "[object Uint8Array]";
}
var binary = new type("tag:yaml.org,2002:binary", {
  kind: "scalar",
  resolve: resolveYamlBinary,
  construct: constructYamlBinary,
  predicate: isBinary,
  represent: representYamlBinary
});
var _hasOwnProperty$3 = Object.prototype.hasOwnProperty;
var _toString$2 = Object.prototype.toString;
function resolveYamlOmap(data) {
  if (data === null) return true;
  var objectKeys = [], index, length, pair, pairKey, pairHasKey, object = data;
  for (index = 0, length = object.length; index < length; index += 1) {
    pair = object[index];
    pairHasKey = false;
    if (_toString$2.call(pair) !== "[object Object]") return false;
    for (pairKey in pair) {
      if (_hasOwnProperty$3.call(pair, pairKey)) {
        if (!pairHasKey) pairHasKey = true;
        else return false;
      }
    }
    if (!pairHasKey) return false;
    if (objectKeys.indexOf(pairKey) === -1) objectKeys.push(pairKey);
    else return false;
  }
  return true;
}
function constructYamlOmap(data) {
  return data !== null ? data : [];
}
var omap = new type("tag:yaml.org,2002:omap", {
  kind: "sequence",
  resolve: resolveYamlOmap,
  construct: constructYamlOmap
});
var _toString$1 = Object.prototype.toString;
function resolveYamlPairs(data) {
  if (data === null) return true;
  var index, length, pair, keys, result, object = data;
  result = new Array(object.length);
  for (index = 0, length = object.length; index < length; index += 1) {
    pair = object[index];
    if (_toString$1.call(pair) !== "[object Object]") return false;
    keys = Object.keys(pair);
    if (keys.length !== 1) return false;
    result[index] = [keys[0], pair[keys[0]]];
  }
  return true;
}
function constructYamlPairs(data) {
  if (data === null) return [];
  var index, length, pair, keys, result, object = data;
  result = new Array(object.length);
  for (index = 0, length = object.length; index < length; index += 1) {
    pair = object[index];
    keys = Object.keys(pair);
    result[index] = [keys[0], pair[keys[0]]];
  }
  return result;
}
var pairs = new type("tag:yaml.org,2002:pairs", {
  kind: "sequence",
  resolve: resolveYamlPairs,
  construct: constructYamlPairs
});
var _hasOwnProperty$2 = Object.prototype.hasOwnProperty;
function resolveYamlSet(data) {
  if (data === null) return true;
  var key, object = data;
  for (key in object) {
    if (_hasOwnProperty$2.call(object, key)) {
      if (object[key] !== null) return false;
    }
  }
  return true;
}
function constructYamlSet(data) {
  return data !== null ? data : {};
}
var set = new type("tag:yaml.org,2002:set", {
  kind: "mapping",
  resolve: resolveYamlSet,
  construct: constructYamlSet
});
var _default = core.extend({
  implicit: [
    timestamp,
    merge
  ],
  explicit: [
    binary,
    omap,
    pairs,
    set
  ]
});
var _hasOwnProperty$1 = Object.prototype.hasOwnProperty;
var CONTEXT_FLOW_IN = 1;
var CONTEXT_FLOW_OUT = 2;
var CONTEXT_BLOCK_IN = 3;
var CONTEXT_BLOCK_OUT = 4;
var CHOMPING_CLIP = 1;
var CHOMPING_STRIP = 2;
var CHOMPING_KEEP = 3;
var PATTERN_NON_PRINTABLE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x84\x86-\x9F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF]/;
var PATTERN_NON_ASCII_LINE_BREAKS = /[\x85\u2028\u2029]/;
var PATTERN_FLOW_INDICATORS = /[,\[\]\{\}]/;
var PATTERN_TAG_HANDLE = /^(?:!|!!|![a-z\-]+!)$/i;
var PATTERN_TAG_URI = /^(?:!|[^,\[\]\{\}])(?:%[0-9a-f]{2}|[0-9a-z\-#;\/\?:@&=\+\$,_\.!~\*'\(\)\[\]])*$/i;
function _class(obj) {
  return Object.prototype.toString.call(obj);
}
function is_EOL(c) {
  return c === 10 || c === 13;
}
function is_WHITE_SPACE(c) {
  return c === 9 || c === 32;
}
function is_WS_OR_EOL(c) {
  return c === 9 || c === 32 || c === 10 || c === 13;
}
function is_FLOW_INDICATOR(c) {
  return c === 44 || c === 91 || c === 93 || c === 123 || c === 125;
}
function fromHexCode(c) {
  var lc;
  if (48 <= c && c <= 57) {
    return c - 48;
  }
  lc = c | 32;
  if (97 <= lc && lc <= 102) {
    return lc - 97 + 10;
  }
  return -1;
}
function escapedHexLen(c) {
  if (c === 120) {
    return 2;
  }
  if (c === 117) {
    return 4;
  }
  if (c === 85) {
    return 8;
  }
  return 0;
}
function fromDecimalCode(c) {
  if (48 <= c && c <= 57) {
    return c - 48;
  }
  return -1;
}
function simpleEscapeSequence(c) {
  return c === 48 ? "\0" : c === 97 ? "\x07" : c === 98 ? "\b" : c === 116 ? "	" : c === 9 ? "	" : c === 110 ? "\n" : c === 118 ? "\v" : c === 102 ? "\f" : c === 114 ? "\r" : c === 101 ? "\x1B" : c === 32 ? " " : c === 34 ? '"' : c === 47 ? "/" : c === 92 ? "\\" : c === 78 ? "\x85" : c === 95 ? "\xA0" : c === 76 ? "\u2028" : c === 80 ? "\u2029" : "";
}
function charFromCodepoint(c) {
  if (c <= 65535) {
    return String.fromCharCode(c);
  }
  return String.fromCharCode(
    (c - 65536 >> 10) + 55296,
    (c - 65536 & 1023) + 56320
  );
}
function setProperty(object, key, value) {
  if (key === "__proto__") {
    Object.defineProperty(object, key, {
      configurable: true,
      enumerable: true,
      writable: true,
      value
    });
  } else {
    object[key] = value;
  }
}
var simpleEscapeCheck = new Array(256);
var simpleEscapeMap = new Array(256);
for (i = 0; i < 256; i++) {
  simpleEscapeCheck[i] = simpleEscapeSequence(i) ? 1 : 0;
  simpleEscapeMap[i] = simpleEscapeSequence(i);
}
var i;
function State$1(input, options) {
  this.input = input;
  this.filename = options["filename"] || null;
  this.schema = options["schema"] || _default;
  this.onWarning = options["onWarning"] || null;
  this.legacy = options["legacy"] || false;
  this.json = options["json"] || false;
  this.listener = options["listener"] || null;
  this.implicitTypes = this.schema.compiledImplicit;
  this.typeMap = this.schema.compiledTypeMap;
  this.length = input.length;
  this.position = 0;
  this.line = 0;
  this.lineStart = 0;
  this.lineIndent = 0;
  this.firstTabInLine = -1;
  this.documents = [];
}
function generateError(state, message) {
  var mark = {
    name: state.filename,
    buffer: state.input.slice(0, -1),
    // omit trailing \0
    position: state.position,
    line: state.line,
    column: state.position - state.lineStart
  };
  mark.snippet = snippet(mark);
  return new exception(message, mark);
}
function throwError(state, message) {
  throw generateError(state, message);
}
function throwWarning(state, message) {
  if (state.onWarning) {
    state.onWarning.call(null, generateError(state, message));
  }
}
var directiveHandlers = {
  YAML: function handleYamlDirective(state, name, args) {
    var match, major, minor;
    if (state.version !== null) {
      throwError(state, "duplication of %YAML directive");
    }
    if (args.length !== 1) {
      throwError(state, "YAML directive accepts exactly one argument");
    }
    match = /^([0-9]+)\.([0-9]+)$/.exec(args[0]);
    if (match === null) {
      throwError(state, "ill-formed argument of the YAML directive");
    }
    major = parseInt(match[1], 10);
    minor = parseInt(match[2], 10);
    if (major !== 1) {
      throwError(state, "unacceptable YAML version of the document");
    }
    state.version = args[0];
    state.checkLineBreaks = minor < 2;
    if (minor !== 1 && minor !== 2) {
      throwWarning(state, "unsupported YAML version of the document");
    }
  },
  TAG: function handleTagDirective(state, name, args) {
    var handle, prefix;
    if (args.length !== 2) {
      throwError(state, "TAG directive accepts exactly two arguments");
    }
    handle = args[0];
    prefix = args[1];
    if (!PATTERN_TAG_HANDLE.test(handle)) {
      throwError(state, "ill-formed tag handle (first argument) of the TAG directive");
    }
    if (_hasOwnProperty$1.call(state.tagMap, handle)) {
      throwError(state, 'there is a previously declared suffix for "' + handle + '" tag handle');
    }
    if (!PATTERN_TAG_URI.test(prefix)) {
      throwError(state, "ill-formed tag prefix (second argument) of the TAG directive");
    }
    try {
      prefix = decodeURIComponent(prefix);
    } catch (err) {
      throwError(state, "tag prefix is malformed: " + prefix);
    }
    state.tagMap[handle] = prefix;
  }
};
function captureSegment(state, start, end, checkJson) {
  var _position, _length, _character, _result;
  if (start < end) {
    _result = state.input.slice(start, end);
    if (checkJson) {
      for (_position = 0, _length = _result.length; _position < _length; _position += 1) {
        _character = _result.charCodeAt(_position);
        if (!(_character === 9 || 32 <= _character && _character <= 1114111)) {
          throwError(state, "expected valid JSON character");
        }
      }
    } else if (PATTERN_NON_PRINTABLE.test(_result)) {
      throwError(state, "the stream contains non-printable characters");
    }
    state.result += _result;
  }
}
function mergeMappings(state, destination, source, overridableKeys) {
  var sourceKeys, key, index, quantity;
  if (!common.isObject(source)) {
    throwError(state, "cannot merge mappings; the provided source object is unacceptable");
  }
  sourceKeys = Object.keys(source);
  for (index = 0, quantity = sourceKeys.length; index < quantity; index += 1) {
    key = sourceKeys[index];
    if (!_hasOwnProperty$1.call(destination, key)) {
      setProperty(destination, key, source[key]);
      overridableKeys[key] = true;
    }
  }
}
function storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, valueNode, startLine, startLineStart, startPos) {
  var index, quantity;
  if (Array.isArray(keyNode)) {
    keyNode = Array.prototype.slice.call(keyNode);
    for (index = 0, quantity = keyNode.length; index < quantity; index += 1) {
      if (Array.isArray(keyNode[index])) {
        throwError(state, "nested arrays are not supported inside keys");
      }
      if (typeof keyNode === "object" && _class(keyNode[index]) === "[object Object]") {
        keyNode[index] = "[object Object]";
      }
    }
  }
  if (typeof keyNode === "object" && _class(keyNode) === "[object Object]") {
    keyNode = "[object Object]";
  }
  keyNode = String(keyNode);
  if (_result === null) {
    _result = {};
  }
  if (keyTag === "tag:yaml.org,2002:merge") {
    if (Array.isArray(valueNode)) {
      for (index = 0, quantity = valueNode.length; index < quantity; index += 1) {
        mergeMappings(state, _result, valueNode[index], overridableKeys);
      }
    } else {
      mergeMappings(state, _result, valueNode, overridableKeys);
    }
  } else {
    if (!state.json && !_hasOwnProperty$1.call(overridableKeys, keyNode) && _hasOwnProperty$1.call(_result, keyNode)) {
      state.line = startLine || state.line;
      state.lineStart = startLineStart || state.lineStart;
      state.position = startPos || state.position;
      throwError(state, "duplicated mapping key");
    }
    setProperty(_result, keyNode, valueNode);
    delete overridableKeys[keyNode];
  }
  return _result;
}
function readLineBreak(state) {
  var ch;
  ch = state.input.charCodeAt(state.position);
  if (ch === 10) {
    state.position++;
  } else if (ch === 13) {
    state.position++;
    if (state.input.charCodeAt(state.position) === 10) {
      state.position++;
    }
  } else {
    throwError(state, "a line break is expected");
  }
  state.line += 1;
  state.lineStart = state.position;
  state.firstTabInLine = -1;
}
function skipSeparationSpace(state, allowComments, checkIndent) {
  var lineBreaks = 0, ch = state.input.charCodeAt(state.position);
  while (ch !== 0) {
    while (is_WHITE_SPACE(ch)) {
      if (ch === 9 && state.firstTabInLine === -1) {
        state.firstTabInLine = state.position;
      }
      ch = state.input.charCodeAt(++state.position);
    }
    if (allowComments && ch === 35) {
      do {
        ch = state.input.charCodeAt(++state.position);
      } while (ch !== 10 && ch !== 13 && ch !== 0);
    }
    if (is_EOL(ch)) {
      readLineBreak(state);
      ch = state.input.charCodeAt(state.position);
      lineBreaks++;
      state.lineIndent = 0;
      while (ch === 32) {
        state.lineIndent++;
        ch = state.input.charCodeAt(++state.position);
      }
    } else {
      break;
    }
  }
  if (checkIndent !== -1 && lineBreaks !== 0 && state.lineIndent < checkIndent) {
    throwWarning(state, "deficient indentation");
  }
  return lineBreaks;
}
function testDocumentSeparator(state) {
  var _position = state.position, ch;
  ch = state.input.charCodeAt(_position);
  if ((ch === 45 || ch === 46) && ch === state.input.charCodeAt(_position + 1) && ch === state.input.charCodeAt(_position + 2)) {
    _position += 3;
    ch = state.input.charCodeAt(_position);
    if (ch === 0 || is_WS_OR_EOL(ch)) {
      return true;
    }
  }
  return false;
}
function writeFoldedLines(state, count) {
  if (count === 1) {
    state.result += " ";
  } else if (count > 1) {
    state.result += common.repeat("\n", count - 1);
  }
}
function readPlainScalar(state, nodeIndent, withinFlowCollection) {
  var preceding, following, captureStart, captureEnd, hasPendingContent, _line, _lineStart, _lineIndent, _kind = state.kind, _result = state.result, ch;
  ch = state.input.charCodeAt(state.position);
  if (is_WS_OR_EOL(ch) || is_FLOW_INDICATOR(ch) || ch === 35 || ch === 38 || ch === 42 || ch === 33 || ch === 124 || ch === 62 || ch === 39 || ch === 34 || ch === 37 || ch === 64 || ch === 96) {
    return false;
  }
  if (ch === 63 || ch === 45) {
    following = state.input.charCodeAt(state.position + 1);
    if (is_WS_OR_EOL(following) || withinFlowCollection && is_FLOW_INDICATOR(following)) {
      return false;
    }
  }
  state.kind = "scalar";
  state.result = "";
  captureStart = captureEnd = state.position;
  hasPendingContent = false;
  while (ch !== 0) {
    if (ch === 58) {
      following = state.input.charCodeAt(state.position + 1);
      if (is_WS_OR_EOL(following) || withinFlowCollection && is_FLOW_INDICATOR(following)) {
        break;
      }
    } else if (ch === 35) {
      preceding = state.input.charCodeAt(state.position - 1);
      if (is_WS_OR_EOL(preceding)) {
        break;
      }
    } else if (state.position === state.lineStart && testDocumentSeparator(state) || withinFlowCollection && is_FLOW_INDICATOR(ch)) {
      break;
    } else if (is_EOL(ch)) {
      _line = state.line;
      _lineStart = state.lineStart;
      _lineIndent = state.lineIndent;
      skipSeparationSpace(state, false, -1);
      if (state.lineIndent >= nodeIndent) {
        hasPendingContent = true;
        ch = state.input.charCodeAt(state.position);
        continue;
      } else {
        state.position = captureEnd;
        state.line = _line;
        state.lineStart = _lineStart;
        state.lineIndent = _lineIndent;
        break;
      }
    }
    if (hasPendingContent) {
      captureSegment(state, captureStart, captureEnd, false);
      writeFoldedLines(state, state.line - _line);
      captureStart = captureEnd = state.position;
      hasPendingContent = false;
    }
    if (!is_WHITE_SPACE(ch)) {
      captureEnd = state.position + 1;
    }
    ch = state.input.charCodeAt(++state.position);
  }
  captureSegment(state, captureStart, captureEnd, false);
  if (state.result) {
    return true;
  }
  state.kind = _kind;
  state.result = _result;
  return false;
}
function readSingleQuotedScalar(state, nodeIndent) {
  var ch, captureStart, captureEnd;
  ch = state.input.charCodeAt(state.position);
  if (ch !== 39) {
    return false;
  }
  state.kind = "scalar";
  state.result = "";
  state.position++;
  captureStart = captureEnd = state.position;
  while ((ch = state.input.charCodeAt(state.position)) !== 0) {
    if (ch === 39) {
      captureSegment(state, captureStart, state.position, true);
      ch = state.input.charCodeAt(++state.position);
      if (ch === 39) {
        captureStart = state.position;
        state.position++;
        captureEnd = state.position;
      } else {
        return true;
      }
    } else if (is_EOL(ch)) {
      captureSegment(state, captureStart, captureEnd, true);
      writeFoldedLines(state, skipSeparationSpace(state, false, nodeIndent));
      captureStart = captureEnd = state.position;
    } else if (state.position === state.lineStart && testDocumentSeparator(state)) {
      throwError(state, "unexpected end of the document within a single quoted scalar");
    } else {
      state.position++;
      captureEnd = state.position;
    }
  }
  throwError(state, "unexpected end of the stream within a single quoted scalar");
}
function readDoubleQuotedScalar(state, nodeIndent) {
  var captureStart, captureEnd, hexLength, hexResult, tmp, ch;
  ch = state.input.charCodeAt(state.position);
  if (ch !== 34) {
    return false;
  }
  state.kind = "scalar";
  state.result = "";
  state.position++;
  captureStart = captureEnd = state.position;
  while ((ch = state.input.charCodeAt(state.position)) !== 0) {
    if (ch === 34) {
      captureSegment(state, captureStart, state.position, true);
      state.position++;
      return true;
    } else if (ch === 92) {
      captureSegment(state, captureStart, state.position, true);
      ch = state.input.charCodeAt(++state.position);
      if (is_EOL(ch)) {
        skipSeparationSpace(state, false, nodeIndent);
      } else if (ch < 256 && simpleEscapeCheck[ch]) {
        state.result += simpleEscapeMap[ch];
        state.position++;
      } else if ((tmp = escapedHexLen(ch)) > 0) {
        hexLength = tmp;
        hexResult = 0;
        for (; hexLength > 0; hexLength--) {
          ch = state.input.charCodeAt(++state.position);
          if ((tmp = fromHexCode(ch)) >= 0) {
            hexResult = (hexResult << 4) + tmp;
          } else {
            throwError(state, "expected hexadecimal character");
          }
        }
        state.result += charFromCodepoint(hexResult);
        state.position++;
      } else {
        throwError(state, "unknown escape sequence");
      }
      captureStart = captureEnd = state.position;
    } else if (is_EOL(ch)) {
      captureSegment(state, captureStart, captureEnd, true);
      writeFoldedLines(state, skipSeparationSpace(state, false, nodeIndent));
      captureStart = captureEnd = state.position;
    } else if (state.position === state.lineStart && testDocumentSeparator(state)) {
      throwError(state, "unexpected end of the document within a double quoted scalar");
    } else {
      state.position++;
      captureEnd = state.position;
    }
  }
  throwError(state, "unexpected end of the stream within a double quoted scalar");
}
function readFlowCollection(state, nodeIndent) {
  var readNext = true, _line, _lineStart, _pos, _tag = state.tag, _result, _anchor = state.anchor, following, terminator, isPair, isExplicitPair, isMapping, overridableKeys = /* @__PURE__ */ Object.create(null), keyNode, keyTag, valueNode, ch;
  ch = state.input.charCodeAt(state.position);
  if (ch === 91) {
    terminator = 93;
    isMapping = false;
    _result = [];
  } else if (ch === 123) {
    terminator = 125;
    isMapping = true;
    _result = {};
  } else {
    return false;
  }
  if (state.anchor !== null) {
    state.anchorMap[state.anchor] = _result;
  }
  ch = state.input.charCodeAt(++state.position);
  while (ch !== 0) {
    skipSeparationSpace(state, true, nodeIndent);
    ch = state.input.charCodeAt(state.position);
    if (ch === terminator) {
      state.position++;
      state.tag = _tag;
      state.anchor = _anchor;
      state.kind = isMapping ? "mapping" : "sequence";
      state.result = _result;
      return true;
    } else if (!readNext) {
      throwError(state, "missed comma between flow collection entries");
    } else if (ch === 44) {
      throwError(state, "expected the node content, but found ','");
    }
    keyTag = keyNode = valueNode = null;
    isPair = isExplicitPair = false;
    if (ch === 63) {
      following = state.input.charCodeAt(state.position + 1);
      if (is_WS_OR_EOL(following)) {
        isPair = isExplicitPair = true;
        state.position++;
        skipSeparationSpace(state, true, nodeIndent);
      }
    }
    _line = state.line;
    _lineStart = state.lineStart;
    _pos = state.position;
    composeNode(state, nodeIndent, CONTEXT_FLOW_IN, false, true);
    keyTag = state.tag;
    keyNode = state.result;
    skipSeparationSpace(state, true, nodeIndent);
    ch = state.input.charCodeAt(state.position);
    if ((isExplicitPair || state.line === _line) && ch === 58) {
      isPair = true;
      ch = state.input.charCodeAt(++state.position);
      skipSeparationSpace(state, true, nodeIndent);
      composeNode(state, nodeIndent, CONTEXT_FLOW_IN, false, true);
      valueNode = state.result;
    }
    if (isMapping) {
      storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, valueNode, _line, _lineStart, _pos);
    } else if (isPair) {
      _result.push(storeMappingPair(state, null, overridableKeys, keyTag, keyNode, valueNode, _line, _lineStart, _pos));
    } else {
      _result.push(keyNode);
    }
    skipSeparationSpace(state, true, nodeIndent);
    ch = state.input.charCodeAt(state.position);
    if (ch === 44) {
      readNext = true;
      ch = state.input.charCodeAt(++state.position);
    } else {
      readNext = false;
    }
  }
  throwError(state, "unexpected end of the stream within a flow collection");
}
function readBlockScalar(state, nodeIndent) {
  var captureStart, folding, chomping = CHOMPING_CLIP, didReadContent = false, detectedIndent = false, textIndent = nodeIndent, emptyLines = 0, atMoreIndented = false, tmp, ch;
  ch = state.input.charCodeAt(state.position);
  if (ch === 124) {
    folding = false;
  } else if (ch === 62) {
    folding = true;
  } else {
    return false;
  }
  state.kind = "scalar";
  state.result = "";
  while (ch !== 0) {
    ch = state.input.charCodeAt(++state.position);
    if (ch === 43 || ch === 45) {
      if (CHOMPING_CLIP === chomping) {
        chomping = ch === 43 ? CHOMPING_KEEP : CHOMPING_STRIP;
      } else {
        throwError(state, "repeat of a chomping mode identifier");
      }
    } else if ((tmp = fromDecimalCode(ch)) >= 0) {
      if (tmp === 0) {
        throwError(state, "bad explicit indentation width of a block scalar; it cannot be less than one");
      } else if (!detectedIndent) {
        textIndent = nodeIndent + tmp - 1;
        detectedIndent = true;
      } else {
        throwError(state, "repeat of an indentation width identifier");
      }
    } else {
      break;
    }
  }
  if (is_WHITE_SPACE(ch)) {
    do {
      ch = state.input.charCodeAt(++state.position);
    } while (is_WHITE_SPACE(ch));
    if (ch === 35) {
      do {
        ch = state.input.charCodeAt(++state.position);
      } while (!is_EOL(ch) && ch !== 0);
    }
  }
  while (ch !== 0) {
    readLineBreak(state);
    state.lineIndent = 0;
    ch = state.input.charCodeAt(state.position);
    while ((!detectedIndent || state.lineIndent < textIndent) && ch === 32) {
      state.lineIndent++;
      ch = state.input.charCodeAt(++state.position);
    }
    if (!detectedIndent && state.lineIndent > textIndent) {
      textIndent = state.lineIndent;
    }
    if (is_EOL(ch)) {
      emptyLines++;
      continue;
    }
    if (state.lineIndent < textIndent) {
      if (chomping === CHOMPING_KEEP) {
        state.result += common.repeat("\n", didReadContent ? 1 + emptyLines : emptyLines);
      } else if (chomping === CHOMPING_CLIP) {
        if (didReadContent) {
          state.result += "\n";
        }
      }
      break;
    }
    if (folding) {
      if (is_WHITE_SPACE(ch)) {
        atMoreIndented = true;
        state.result += common.repeat("\n", didReadContent ? 1 + emptyLines : emptyLines);
      } else if (atMoreIndented) {
        atMoreIndented = false;
        state.result += common.repeat("\n", emptyLines + 1);
      } else if (emptyLines === 0) {
        if (didReadContent) {
          state.result += " ";
        }
      } else {
        state.result += common.repeat("\n", emptyLines);
      }
    } else {
      state.result += common.repeat("\n", didReadContent ? 1 + emptyLines : emptyLines);
    }
    didReadContent = true;
    detectedIndent = true;
    emptyLines = 0;
    captureStart = state.position;
    while (!is_EOL(ch) && ch !== 0) {
      ch = state.input.charCodeAt(++state.position);
    }
    captureSegment(state, captureStart, state.position, false);
  }
  return true;
}
function readBlockSequence(state, nodeIndent) {
  var _line, _tag = state.tag, _anchor = state.anchor, _result = [], following, detected = false, ch;
  if (state.firstTabInLine !== -1) return false;
  if (state.anchor !== null) {
    state.anchorMap[state.anchor] = _result;
  }
  ch = state.input.charCodeAt(state.position);
  while (ch !== 0) {
    if (state.firstTabInLine !== -1) {
      state.position = state.firstTabInLine;
      throwError(state, "tab characters must not be used in indentation");
    }
    if (ch !== 45) {
      break;
    }
    following = state.input.charCodeAt(state.position + 1);
    if (!is_WS_OR_EOL(following)) {
      break;
    }
    detected = true;
    state.position++;
    if (skipSeparationSpace(state, true, -1)) {
      if (state.lineIndent <= nodeIndent) {
        _result.push(null);
        ch = state.input.charCodeAt(state.position);
        continue;
      }
    }
    _line = state.line;
    composeNode(state, nodeIndent, CONTEXT_BLOCK_IN, false, true);
    _result.push(state.result);
    skipSeparationSpace(state, true, -1);
    ch = state.input.charCodeAt(state.position);
    if ((state.line === _line || state.lineIndent > nodeIndent) && ch !== 0) {
      throwError(state, "bad indentation of a sequence entry");
    } else if (state.lineIndent < nodeIndent) {
      break;
    }
  }
  if (detected) {
    state.tag = _tag;
    state.anchor = _anchor;
    state.kind = "sequence";
    state.result = _result;
    return true;
  }
  return false;
}
function readBlockMapping(state, nodeIndent, flowIndent) {
  var following, allowCompact, _line, _keyLine, _keyLineStart, _keyPos, _tag = state.tag, _anchor = state.anchor, _result = {}, overridableKeys = /* @__PURE__ */ Object.create(null), keyTag = null, keyNode = null, valueNode = null, atExplicitKey = false, detected = false, ch;
  if (state.firstTabInLine !== -1) return false;
  if (state.anchor !== null) {
    state.anchorMap[state.anchor] = _result;
  }
  ch = state.input.charCodeAt(state.position);
  while (ch !== 0) {
    if (!atExplicitKey && state.firstTabInLine !== -1) {
      state.position = state.firstTabInLine;
      throwError(state, "tab characters must not be used in indentation");
    }
    following = state.input.charCodeAt(state.position + 1);
    _line = state.line;
    if ((ch === 63 || ch === 58) && is_WS_OR_EOL(following)) {
      if (ch === 63) {
        if (atExplicitKey) {
          storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, null, _keyLine, _keyLineStart, _keyPos);
          keyTag = keyNode = valueNode = null;
        }
        detected = true;
        atExplicitKey = true;
        allowCompact = true;
      } else if (atExplicitKey) {
        atExplicitKey = false;
        allowCompact = true;
      } else {
        throwError(state, "incomplete explicit mapping pair; a key node is missed; or followed by a non-tabulated empty line");
      }
      state.position += 1;
      ch = following;
    } else {
      _keyLine = state.line;
      _keyLineStart = state.lineStart;
      _keyPos = state.position;
      if (!composeNode(state, flowIndent, CONTEXT_FLOW_OUT, false, true)) {
        break;
      }
      if (state.line === _line) {
        ch = state.input.charCodeAt(state.position);
        while (is_WHITE_SPACE(ch)) {
          ch = state.input.charCodeAt(++state.position);
        }
        if (ch === 58) {
          ch = state.input.charCodeAt(++state.position);
          if (!is_WS_OR_EOL(ch)) {
            throwError(state, "a whitespace character is expected after the key-value separator within a block mapping");
          }
          if (atExplicitKey) {
            storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, null, _keyLine, _keyLineStart, _keyPos);
            keyTag = keyNode = valueNode = null;
          }
          detected = true;
          atExplicitKey = false;
          allowCompact = false;
          keyTag = state.tag;
          keyNode = state.result;
        } else if (detected) {
          throwError(state, "can not read an implicit mapping pair; a colon is missed");
        } else {
          state.tag = _tag;
          state.anchor = _anchor;
          return true;
        }
      } else if (detected) {
        throwError(state, "can not read a block mapping entry; a multiline key may not be an implicit key");
      } else {
        state.tag = _tag;
        state.anchor = _anchor;
        return true;
      }
    }
    if (state.line === _line || state.lineIndent > nodeIndent) {
      if (atExplicitKey) {
        _keyLine = state.line;
        _keyLineStart = state.lineStart;
        _keyPos = state.position;
      }
      if (composeNode(state, nodeIndent, CONTEXT_BLOCK_OUT, true, allowCompact)) {
        if (atExplicitKey) {
          keyNode = state.result;
        } else {
          valueNode = state.result;
        }
      }
      if (!atExplicitKey) {
        storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, valueNode, _keyLine, _keyLineStart, _keyPos);
        keyTag = keyNode = valueNode = null;
      }
      skipSeparationSpace(state, true, -1);
      ch = state.input.charCodeAt(state.position);
    }
    if ((state.line === _line || state.lineIndent > nodeIndent) && ch !== 0) {
      throwError(state, "bad indentation of a mapping entry");
    } else if (state.lineIndent < nodeIndent) {
      break;
    }
  }
  if (atExplicitKey) {
    storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, null, _keyLine, _keyLineStart, _keyPos);
  }
  if (detected) {
    state.tag = _tag;
    state.anchor = _anchor;
    state.kind = "mapping";
    state.result = _result;
  }
  return detected;
}
function readTagProperty(state) {
  var _position, isVerbatim = false, isNamed = false, tagHandle, tagName, ch;
  ch = state.input.charCodeAt(state.position);
  if (ch !== 33) return false;
  if (state.tag !== null) {
    throwError(state, "duplication of a tag property");
  }
  ch = state.input.charCodeAt(++state.position);
  if (ch === 60) {
    isVerbatim = true;
    ch = state.input.charCodeAt(++state.position);
  } else if (ch === 33) {
    isNamed = true;
    tagHandle = "!!";
    ch = state.input.charCodeAt(++state.position);
  } else {
    tagHandle = "!";
  }
  _position = state.position;
  if (isVerbatim) {
    do {
      ch = state.input.charCodeAt(++state.position);
    } while (ch !== 0 && ch !== 62);
    if (state.position < state.length) {
      tagName = state.input.slice(_position, state.position);
      ch = state.input.charCodeAt(++state.position);
    } else {
      throwError(state, "unexpected end of the stream within a verbatim tag");
    }
  } else {
    while (ch !== 0 && !is_WS_OR_EOL(ch)) {
      if (ch === 33) {
        if (!isNamed) {
          tagHandle = state.input.slice(_position - 1, state.position + 1);
          if (!PATTERN_TAG_HANDLE.test(tagHandle)) {
            throwError(state, "named tag handle cannot contain such characters");
          }
          isNamed = true;
          _position = state.position + 1;
        } else {
          throwError(state, "tag suffix cannot contain exclamation marks");
        }
      }
      ch = state.input.charCodeAt(++state.position);
    }
    tagName = state.input.slice(_position, state.position);
    if (PATTERN_FLOW_INDICATORS.test(tagName)) {
      throwError(state, "tag suffix cannot contain flow indicator characters");
    }
  }
  if (tagName && !PATTERN_TAG_URI.test(tagName)) {
    throwError(state, "tag name cannot contain such characters: " + tagName);
  }
  try {
    tagName = decodeURIComponent(tagName);
  } catch (err) {
    throwError(state, "tag name is malformed: " + tagName);
  }
  if (isVerbatim) {
    state.tag = tagName;
  } else if (_hasOwnProperty$1.call(state.tagMap, tagHandle)) {
    state.tag = state.tagMap[tagHandle] + tagName;
  } else if (tagHandle === "!") {
    state.tag = "!" + tagName;
  } else if (tagHandle === "!!") {
    state.tag = "tag:yaml.org,2002:" + tagName;
  } else {
    throwError(state, 'undeclared tag handle "' + tagHandle + '"');
  }
  return true;
}
function readAnchorProperty(state) {
  var _position, ch;
  ch = state.input.charCodeAt(state.position);
  if (ch !== 38) return false;
  if (state.anchor !== null) {
    throwError(state, "duplication of an anchor property");
  }
  ch = state.input.charCodeAt(++state.position);
  _position = state.position;
  while (ch !== 0 && !is_WS_OR_EOL(ch) && !is_FLOW_INDICATOR(ch)) {
    ch = state.input.charCodeAt(++state.position);
  }
  if (state.position === _position) {
    throwError(state, "name of an anchor node must contain at least one character");
  }
  state.anchor = state.input.slice(_position, state.position);
  return true;
}
function readAlias(state) {
  var _position, alias, ch;
  ch = state.input.charCodeAt(state.position);
  if (ch !== 42) return false;
  ch = state.input.charCodeAt(++state.position);
  _position = state.position;
  while (ch !== 0 && !is_WS_OR_EOL(ch) && !is_FLOW_INDICATOR(ch)) {
    ch = state.input.charCodeAt(++state.position);
  }
  if (state.position === _position) {
    throwError(state, "name of an alias node must contain at least one character");
  }
  alias = state.input.slice(_position, state.position);
  if (!_hasOwnProperty$1.call(state.anchorMap, alias)) {
    throwError(state, 'unidentified alias "' + alias + '"');
  }
  state.result = state.anchorMap[alias];
  skipSeparationSpace(state, true, -1);
  return true;
}
function composeNode(state, parentIndent, nodeContext, allowToSeek, allowCompact) {
  var allowBlockStyles, allowBlockScalars, allowBlockCollections, indentStatus = 1, atNewLine = false, hasContent = false, typeIndex, typeQuantity, typeList, type2, flowIndent, blockIndent;
  if (state.listener !== null) {
    state.listener("open", state);
  }
  state.tag = null;
  state.anchor = null;
  state.kind = null;
  state.result = null;
  allowBlockStyles = allowBlockScalars = allowBlockCollections = CONTEXT_BLOCK_OUT === nodeContext || CONTEXT_BLOCK_IN === nodeContext;
  if (allowToSeek) {
    if (skipSeparationSpace(state, true, -1)) {
      atNewLine = true;
      if (state.lineIndent > parentIndent) {
        indentStatus = 1;
      } else if (state.lineIndent === parentIndent) {
        indentStatus = 0;
      } else if (state.lineIndent < parentIndent) {
        indentStatus = -1;
      }
    }
  }
  if (indentStatus === 1) {
    while (readTagProperty(state) || readAnchorProperty(state)) {
      if (skipSeparationSpace(state, true, -1)) {
        atNewLine = true;
        allowBlockCollections = allowBlockStyles;
        if (state.lineIndent > parentIndent) {
          indentStatus = 1;
        } else if (state.lineIndent === parentIndent) {
          indentStatus = 0;
        } else if (state.lineIndent < parentIndent) {
          indentStatus = -1;
        }
      } else {
        allowBlockCollections = false;
      }
    }
  }
  if (allowBlockCollections) {
    allowBlockCollections = atNewLine || allowCompact;
  }
  if (indentStatus === 1 || CONTEXT_BLOCK_OUT === nodeContext) {
    if (CONTEXT_FLOW_IN === nodeContext || CONTEXT_FLOW_OUT === nodeContext) {
      flowIndent = parentIndent;
    } else {
      flowIndent = parentIndent + 1;
    }
    blockIndent = state.position - state.lineStart;
    if (indentStatus === 1) {
      if (allowBlockCollections && (readBlockSequence(state, blockIndent) || readBlockMapping(state, blockIndent, flowIndent)) || readFlowCollection(state, flowIndent)) {
        hasContent = true;
      } else {
        if (allowBlockScalars && readBlockScalar(state, flowIndent) || readSingleQuotedScalar(state, flowIndent) || readDoubleQuotedScalar(state, flowIndent)) {
          hasContent = true;
        } else if (readAlias(state)) {
          hasContent = true;
          if (state.tag !== null || state.anchor !== null) {
            throwError(state, "alias node should not have any properties");
          }
        } else if (readPlainScalar(state, flowIndent, CONTEXT_FLOW_IN === nodeContext)) {
          hasContent = true;
          if (state.tag === null) {
            state.tag = "?";
          }
        }
        if (state.anchor !== null) {
          state.anchorMap[state.anchor] = state.result;
        }
      }
    } else if (indentStatus === 0) {
      hasContent = allowBlockCollections && readBlockSequence(state, blockIndent);
    }
  }
  if (state.tag === null) {
    if (state.anchor !== null) {
      state.anchorMap[state.anchor] = state.result;
    }
  } else if (state.tag === "?") {
    if (state.result !== null && state.kind !== "scalar") {
      throwError(state, 'unacceptable node kind for !<?> tag; it should be "scalar", not "' + state.kind + '"');
    }
    for (typeIndex = 0, typeQuantity = state.implicitTypes.length; typeIndex < typeQuantity; typeIndex += 1) {
      type2 = state.implicitTypes[typeIndex];
      if (type2.resolve(state.result)) {
        state.result = type2.construct(state.result);
        state.tag = type2.tag;
        if (state.anchor !== null) {
          state.anchorMap[state.anchor] = state.result;
        }
        break;
      }
    }
  } else if (state.tag !== "!") {
    if (_hasOwnProperty$1.call(state.typeMap[state.kind || "fallback"], state.tag)) {
      type2 = state.typeMap[state.kind || "fallback"][state.tag];
    } else {
      type2 = null;
      typeList = state.typeMap.multi[state.kind || "fallback"];
      for (typeIndex = 0, typeQuantity = typeList.length; typeIndex < typeQuantity; typeIndex += 1) {
        if (state.tag.slice(0, typeList[typeIndex].tag.length) === typeList[typeIndex].tag) {
          type2 = typeList[typeIndex];
          break;
        }
      }
    }
    if (!type2) {
      throwError(state, "unknown tag !<" + state.tag + ">");
    }
    if (state.result !== null && type2.kind !== state.kind) {
      throwError(state, "unacceptable node kind for !<" + state.tag + '> tag; it should be "' + type2.kind + '", not "' + state.kind + '"');
    }
    if (!type2.resolve(state.result, state.tag)) {
      throwError(state, "cannot resolve a node with !<" + state.tag + "> explicit tag");
    } else {
      state.result = type2.construct(state.result, state.tag);
      if (state.anchor !== null) {
        state.anchorMap[state.anchor] = state.result;
      }
    }
  }
  if (state.listener !== null) {
    state.listener("close", state);
  }
  return state.tag !== null || state.anchor !== null || hasContent;
}
function readDocument(state) {
  var documentStart = state.position, _position, directiveName, directiveArgs, hasDirectives = false, ch;
  state.version = null;
  state.checkLineBreaks = state.legacy;
  state.tagMap = /* @__PURE__ */ Object.create(null);
  state.anchorMap = /* @__PURE__ */ Object.create(null);
  while ((ch = state.input.charCodeAt(state.position)) !== 0) {
    skipSeparationSpace(state, true, -1);
    ch = state.input.charCodeAt(state.position);
    if (state.lineIndent > 0 || ch !== 37) {
      break;
    }
    hasDirectives = true;
    ch = state.input.charCodeAt(++state.position);
    _position = state.position;
    while (ch !== 0 && !is_WS_OR_EOL(ch)) {
      ch = state.input.charCodeAt(++state.position);
    }
    directiveName = state.input.slice(_position, state.position);
    directiveArgs = [];
    if (directiveName.length < 1) {
      throwError(state, "directive name must not be less than one character in length");
    }
    while (ch !== 0) {
      while (is_WHITE_SPACE(ch)) {
        ch = state.input.charCodeAt(++state.position);
      }
      if (ch === 35) {
        do {
          ch = state.input.charCodeAt(++state.position);
        } while (ch !== 0 && !is_EOL(ch));
        break;
      }
      if (is_EOL(ch)) break;
      _position = state.position;
      while (ch !== 0 && !is_WS_OR_EOL(ch)) {
        ch = state.input.charCodeAt(++state.position);
      }
      directiveArgs.push(state.input.slice(_position, state.position));
    }
    if (ch !== 0) readLineBreak(state);
    if (_hasOwnProperty$1.call(directiveHandlers, directiveName)) {
      directiveHandlers[directiveName](state, directiveName, directiveArgs);
    } else {
      throwWarning(state, 'unknown document directive "' + directiveName + '"');
    }
  }
  skipSeparationSpace(state, true, -1);
  if (state.lineIndent === 0 && state.input.charCodeAt(state.position) === 45 && state.input.charCodeAt(state.position + 1) === 45 && state.input.charCodeAt(state.position + 2) === 45) {
    state.position += 3;
    skipSeparationSpace(state, true, -1);
  } else if (hasDirectives) {
    throwError(state, "directives end mark is expected");
  }
  composeNode(state, state.lineIndent - 1, CONTEXT_BLOCK_OUT, false, true);
  skipSeparationSpace(state, true, -1);
  if (state.checkLineBreaks && PATTERN_NON_ASCII_LINE_BREAKS.test(state.input.slice(documentStart, state.position))) {
    throwWarning(state, "non-ASCII line breaks are interpreted as content");
  }
  state.documents.push(state.result);
  if (state.position === state.lineStart && testDocumentSeparator(state)) {
    if (state.input.charCodeAt(state.position) === 46) {
      state.position += 3;
      skipSeparationSpace(state, true, -1);
    }
    return;
  }
  if (state.position < state.length - 1) {
    throwError(state, "end of the stream or a document separator is expected");
  } else {
    return;
  }
}
function loadDocuments(input, options) {
  input = String(input);
  options = options || {};
  if (input.length !== 0) {
    if (input.charCodeAt(input.length - 1) !== 10 && input.charCodeAt(input.length - 1) !== 13) {
      input += "\n";
    }
    if (input.charCodeAt(0) === 65279) {
      input = input.slice(1);
    }
  }
  var state = new State$1(input, options);
  var nullpos = input.indexOf("\0");
  if (nullpos !== -1) {
    state.position = nullpos;
    throwError(state, "null byte is not allowed in input");
  }
  state.input += "\0";
  while (state.input.charCodeAt(state.position) === 32) {
    state.lineIndent += 1;
    state.position += 1;
  }
  while (state.position < state.length - 1) {
    readDocument(state);
  }
  return state.documents;
}
function loadAll$1(input, iterator, options) {
  if (iterator !== null && typeof iterator === "object" && typeof options === "undefined") {
    options = iterator;
    iterator = null;
  }
  var documents = loadDocuments(input, options);
  if (typeof iterator !== "function") {
    return documents;
  }
  for (var index = 0, length = documents.length; index < length; index += 1) {
    iterator(documents[index]);
  }
}
function load$1(input, options) {
  var documents = loadDocuments(input, options);
  if (documents.length === 0) {
    return void 0;
  } else if (documents.length === 1) {
    return documents[0];
  }
  throw new exception("expected a single document in the stream, but found more");
}
var loadAll_1 = loadAll$1;
var load_1 = load$1;
var loader = {
  loadAll: loadAll_1,
  load: load_1
};
var _toString = Object.prototype.toString;
var _hasOwnProperty = Object.prototype.hasOwnProperty;
var CHAR_BOM = 65279;
var CHAR_TAB = 9;
var CHAR_LINE_FEED = 10;
var CHAR_CARRIAGE_RETURN = 13;
var CHAR_SPACE = 32;
var CHAR_EXCLAMATION = 33;
var CHAR_DOUBLE_QUOTE = 34;
var CHAR_SHARP = 35;
var CHAR_PERCENT = 37;
var CHAR_AMPERSAND = 38;
var CHAR_SINGLE_QUOTE = 39;
var CHAR_ASTERISK = 42;
var CHAR_COMMA = 44;
var CHAR_MINUS = 45;
var CHAR_COLON = 58;
var CHAR_EQUALS = 61;
var CHAR_GREATER_THAN = 62;
var CHAR_QUESTION = 63;
var CHAR_COMMERCIAL_AT = 64;
var CHAR_LEFT_SQUARE_BRACKET = 91;
var CHAR_RIGHT_SQUARE_BRACKET = 93;
var CHAR_GRAVE_ACCENT = 96;
var CHAR_LEFT_CURLY_BRACKET = 123;
var CHAR_VERTICAL_LINE = 124;
var CHAR_RIGHT_CURLY_BRACKET = 125;
var ESCAPE_SEQUENCES = {};
ESCAPE_SEQUENCES[0] = "\\0";
ESCAPE_SEQUENCES[7] = "\\a";
ESCAPE_SEQUENCES[8] = "\\b";
ESCAPE_SEQUENCES[9] = "\\t";
ESCAPE_SEQUENCES[10] = "\\n";
ESCAPE_SEQUENCES[11] = "\\v";
ESCAPE_SEQUENCES[12] = "\\f";
ESCAPE_SEQUENCES[13] = "\\r";
ESCAPE_SEQUENCES[27] = "\\e";
ESCAPE_SEQUENCES[34] = '\\"';
ESCAPE_SEQUENCES[92] = "\\\\";
ESCAPE_SEQUENCES[133] = "\\N";
ESCAPE_SEQUENCES[160] = "\\_";
ESCAPE_SEQUENCES[8232] = "\\L";
ESCAPE_SEQUENCES[8233] = "\\P";
var DEPRECATED_BOOLEANS_SYNTAX = [
  "y",
  "Y",
  "yes",
  "Yes",
  "YES",
  "on",
  "On",
  "ON",
  "n",
  "N",
  "no",
  "No",
  "NO",
  "off",
  "Off",
  "OFF"
];
var DEPRECATED_BASE60_SYNTAX = /^[-+]?[0-9_]+(?::[0-9_]+)+(?:\.[0-9_]*)?$/;
function compileStyleMap(schema2, map2) {
  var result, keys, index, length, tag, style, type2;
  if (map2 === null) return {};
  result = {};
  keys = Object.keys(map2);
  for (index = 0, length = keys.length; index < length; index += 1) {
    tag = keys[index];
    style = String(map2[tag]);
    if (tag.slice(0, 2) === "!!") {
      tag = "tag:yaml.org,2002:" + tag.slice(2);
    }
    type2 = schema2.compiledTypeMap["fallback"][tag];
    if (type2 && _hasOwnProperty.call(type2.styleAliases, style)) {
      style = type2.styleAliases[style];
    }
    result[tag] = style;
  }
  return result;
}
function encodeHex(character) {
  var string, handle, length;
  string = character.toString(16).toUpperCase();
  if (character <= 255) {
    handle = "x";
    length = 2;
  } else if (character <= 65535) {
    handle = "u";
    length = 4;
  } else if (character <= 4294967295) {
    handle = "U";
    length = 8;
  } else {
    throw new exception("code point within a string may not be greater than 0xFFFFFFFF");
  }
  return "\\" + handle + common.repeat("0", length - string.length) + string;
}
var QUOTING_TYPE_SINGLE = 1;
var QUOTING_TYPE_DOUBLE = 2;
function State(options) {
  this.schema = options["schema"] || _default;
  this.indent = Math.max(1, options["indent"] || 2);
  this.noArrayIndent = options["noArrayIndent"] || false;
  this.skipInvalid = options["skipInvalid"] || false;
  this.flowLevel = common.isNothing(options["flowLevel"]) ? -1 : options["flowLevel"];
  this.styleMap = compileStyleMap(this.schema, options["styles"] || null);
  this.sortKeys = options["sortKeys"] || false;
  this.lineWidth = options["lineWidth"] || 80;
  this.noRefs = options["noRefs"] || false;
  this.noCompatMode = options["noCompatMode"] || false;
  this.condenseFlow = options["condenseFlow"] || false;
  this.quotingType = options["quotingType"] === '"' ? QUOTING_TYPE_DOUBLE : QUOTING_TYPE_SINGLE;
  this.forceQuotes = options["forceQuotes"] || false;
  this.replacer = typeof options["replacer"] === "function" ? options["replacer"] : null;
  this.implicitTypes = this.schema.compiledImplicit;
  this.explicitTypes = this.schema.compiledExplicit;
  this.tag = null;
  this.result = "";
  this.duplicates = [];
  this.usedDuplicates = null;
}
function indentString(string, spaces) {
  var ind = common.repeat(" ", spaces), position = 0, next = -1, result = "", line, length = string.length;
  while (position < length) {
    next = string.indexOf("\n", position);
    if (next === -1) {
      line = string.slice(position);
      position = length;
    } else {
      line = string.slice(position, next + 1);
      position = next + 1;
    }
    if (line.length && line !== "\n") result += ind;
    result += line;
  }
  return result;
}
function generateNextLine(state, level) {
  return "\n" + common.repeat(" ", state.indent * level);
}
function testImplicitResolving(state, str2) {
  var index, length, type2;
  for (index = 0, length = state.implicitTypes.length; index < length; index += 1) {
    type2 = state.implicitTypes[index];
    if (type2.resolve(str2)) {
      return true;
    }
  }
  return false;
}
function isWhitespace(c) {
  return c === CHAR_SPACE || c === CHAR_TAB;
}
function isPrintable(c) {
  return 32 <= c && c <= 126 || 161 <= c && c <= 55295 && c !== 8232 && c !== 8233 || 57344 <= c && c <= 65533 && c !== CHAR_BOM || 65536 <= c && c <= 1114111;
}
function isNsCharOrWhitespace(c) {
  return isPrintable(c) && c !== CHAR_BOM && c !== CHAR_CARRIAGE_RETURN && c !== CHAR_LINE_FEED;
}
function isPlainSafe(c, prev, inblock) {
  var cIsNsCharOrWhitespace = isNsCharOrWhitespace(c);
  var cIsNsChar = cIsNsCharOrWhitespace && !isWhitespace(c);
  return (
    // ns-plain-safe
    (inblock ? (
      // c = flow-in
      cIsNsCharOrWhitespace
    ) : cIsNsCharOrWhitespace && c !== CHAR_COMMA && c !== CHAR_LEFT_SQUARE_BRACKET && c !== CHAR_RIGHT_SQUARE_BRACKET && c !== CHAR_LEFT_CURLY_BRACKET && c !== CHAR_RIGHT_CURLY_BRACKET) && c !== CHAR_SHARP && !(prev === CHAR_COLON && !cIsNsChar) || isNsCharOrWhitespace(prev) && !isWhitespace(prev) && c === CHAR_SHARP || prev === CHAR_COLON && cIsNsChar
  );
}
function isPlainSafeFirst(c) {
  return isPrintable(c) && c !== CHAR_BOM && !isWhitespace(c) && c !== CHAR_MINUS && c !== CHAR_QUESTION && c !== CHAR_COLON && c !== CHAR_COMMA && c !== CHAR_LEFT_SQUARE_BRACKET && c !== CHAR_RIGHT_SQUARE_BRACKET && c !== CHAR_LEFT_CURLY_BRACKET && c !== CHAR_RIGHT_CURLY_BRACKET && c !== CHAR_SHARP && c !== CHAR_AMPERSAND && c !== CHAR_ASTERISK && c !== CHAR_EXCLAMATION && c !== CHAR_VERTICAL_LINE && c !== CHAR_EQUALS && c !== CHAR_GREATER_THAN && c !== CHAR_SINGLE_QUOTE && c !== CHAR_DOUBLE_QUOTE && c !== CHAR_PERCENT && c !== CHAR_COMMERCIAL_AT && c !== CHAR_GRAVE_ACCENT;
}
function isPlainSafeLast(c) {
  return !isWhitespace(c) && c !== CHAR_COLON;
}
function codePointAt(string, pos) {
  var first = string.charCodeAt(pos), second;
  if (first >= 55296 && first <= 56319 && pos + 1 < string.length) {
    second = string.charCodeAt(pos + 1);
    if (second >= 56320 && second <= 57343) {
      return (first - 55296) * 1024 + second - 56320 + 65536;
    }
  }
  return first;
}
function needIndentIndicator(string) {
  var leadingSpaceRe = /^\n* /;
  return leadingSpaceRe.test(string);
}
var STYLE_PLAIN = 1;
var STYLE_SINGLE = 2;
var STYLE_LITERAL = 3;
var STYLE_FOLDED = 4;
var STYLE_DOUBLE = 5;
function chooseScalarStyle(string, singleLineOnly, indentPerLevel, lineWidth, testAmbiguousType, quotingType, forceQuotes, inblock) {
  var i;
  var char = 0;
  var prevChar = null;
  var hasLineBreak = false;
  var hasFoldableLine = false;
  var shouldTrackWidth = lineWidth !== -1;
  var previousLineBreak = -1;
  var plain = isPlainSafeFirst(codePointAt(string, 0)) && isPlainSafeLast(codePointAt(string, string.length - 1));
  if (singleLineOnly || forceQuotes) {
    for (i = 0; i < string.length; char >= 65536 ? i += 2 : i++) {
      char = codePointAt(string, i);
      if (!isPrintable(char)) {
        return STYLE_DOUBLE;
      }
      plain = plain && isPlainSafe(char, prevChar, inblock);
      prevChar = char;
    }
  } else {
    for (i = 0; i < string.length; char >= 65536 ? i += 2 : i++) {
      char = codePointAt(string, i);
      if (char === CHAR_LINE_FEED) {
        hasLineBreak = true;
        if (shouldTrackWidth) {
          hasFoldableLine = hasFoldableLine || // Foldable line = too long, and not more-indented.
          i - previousLineBreak - 1 > lineWidth && string[previousLineBreak + 1] !== " ";
          previousLineBreak = i;
        }
      } else if (!isPrintable(char)) {
        return STYLE_DOUBLE;
      }
      plain = plain && isPlainSafe(char, prevChar, inblock);
      prevChar = char;
    }
    hasFoldableLine = hasFoldableLine || shouldTrackWidth && (i - previousLineBreak - 1 > lineWidth && string[previousLineBreak + 1] !== " ");
  }
  if (!hasLineBreak && !hasFoldableLine) {
    if (plain && !forceQuotes && !testAmbiguousType(string)) {
      return STYLE_PLAIN;
    }
    return quotingType === QUOTING_TYPE_DOUBLE ? STYLE_DOUBLE : STYLE_SINGLE;
  }
  if (indentPerLevel > 9 && needIndentIndicator(string)) {
    return STYLE_DOUBLE;
  }
  if (!forceQuotes) {
    return hasFoldableLine ? STYLE_FOLDED : STYLE_LITERAL;
  }
  return quotingType === QUOTING_TYPE_DOUBLE ? STYLE_DOUBLE : STYLE_SINGLE;
}
function writeScalar(state, string, level, iskey, inblock) {
  state.dump = function() {
    if (string.length === 0) {
      return state.quotingType === QUOTING_TYPE_DOUBLE ? '""' : "''";
    }
    if (!state.noCompatMode) {
      if (DEPRECATED_BOOLEANS_SYNTAX.indexOf(string) !== -1 || DEPRECATED_BASE60_SYNTAX.test(string)) {
        return state.quotingType === QUOTING_TYPE_DOUBLE ? '"' + string + '"' : "'" + string + "'";
      }
    }
    var indent = state.indent * Math.max(1, level);
    var lineWidth = state.lineWidth === -1 ? -1 : Math.max(Math.min(state.lineWidth, 40), state.lineWidth - indent);
    var singleLineOnly = iskey || state.flowLevel > -1 && level >= state.flowLevel;
    function testAmbiguity(string2) {
      return testImplicitResolving(state, string2);
    }
    switch (chooseScalarStyle(
      string,
      singleLineOnly,
      state.indent,
      lineWidth,
      testAmbiguity,
      state.quotingType,
      state.forceQuotes && !iskey,
      inblock
    )) {
      case STYLE_PLAIN:
        return string;
      case STYLE_SINGLE:
        return "'" + string.replace(/'/g, "''") + "'";
      case STYLE_LITERAL:
        return "|" + blockHeader(string, state.indent) + dropEndingNewline(indentString(string, indent));
      case STYLE_FOLDED:
        return ">" + blockHeader(string, state.indent) + dropEndingNewline(indentString(foldString(string, lineWidth), indent));
      case STYLE_DOUBLE:
        return '"' + escapeString(string) + '"';
      default:
        throw new exception("impossible error: invalid scalar style");
    }
  }();
}
function blockHeader(string, indentPerLevel) {
  var indentIndicator = needIndentIndicator(string) ? String(indentPerLevel) : "";
  var clip = string[string.length - 1] === "\n";
  var keep = clip && (string[string.length - 2] === "\n" || string === "\n");
  var chomp = keep ? "+" : clip ? "" : "-";
  return indentIndicator + chomp + "\n";
}
function dropEndingNewline(string) {
  return string[string.length - 1] === "\n" ? string.slice(0, -1) : string;
}
function foldString(string, width) {
  var lineRe = /(\n+)([^\n]*)/g;
  var result = function() {
    var nextLF = string.indexOf("\n");
    nextLF = nextLF !== -1 ? nextLF : string.length;
    lineRe.lastIndex = nextLF;
    return foldLine(string.slice(0, nextLF), width);
  }();
  var prevMoreIndented = string[0] === "\n" || string[0] === " ";
  var moreIndented;
  var match;
  while (match = lineRe.exec(string)) {
    var prefix = match[1], line = match[2];
    moreIndented = line[0] === " ";
    result += prefix + (!prevMoreIndented && !moreIndented && line !== "" ? "\n" : "") + foldLine(line, width);
    prevMoreIndented = moreIndented;
  }
  return result;
}
function foldLine(line, width) {
  if (line === "" || line[0] === " ") return line;
  var breakRe = / [^ ]/g;
  var match;
  var start = 0, end, curr = 0, next = 0;
  var result = "";
  while (match = breakRe.exec(line)) {
    next = match.index;
    if (next - start > width) {
      end = curr > start ? curr : next;
      result += "\n" + line.slice(start, end);
      start = end + 1;
    }
    curr = next;
  }
  result += "\n";
  if (line.length - start > width && curr > start) {
    result += line.slice(start, curr) + "\n" + line.slice(curr + 1);
  } else {
    result += line.slice(start);
  }
  return result.slice(1);
}
function escapeString(string) {
  var result = "";
  var char = 0;
  var escapeSeq;
  for (var i = 0; i < string.length; char >= 65536 ? i += 2 : i++) {
    char = codePointAt(string, i);
    escapeSeq = ESCAPE_SEQUENCES[char];
    if (!escapeSeq && isPrintable(char)) {
      result += string[i];
      if (char >= 65536) result += string[i + 1];
    } else {
      result += escapeSeq || encodeHex(char);
    }
  }
  return result;
}
function writeFlowSequence(state, level, object) {
  var _result = "", _tag = state.tag, index, length, value;
  for (index = 0, length = object.length; index < length; index += 1) {
    value = object[index];
    if (state.replacer) {
      value = state.replacer.call(object, String(index), value);
    }
    if (writeNode(state, level, value, false, false) || typeof value === "undefined" && writeNode(state, level, null, false, false)) {
      if (_result !== "") _result += "," + (!state.condenseFlow ? " " : "");
      _result += state.dump;
    }
  }
  state.tag = _tag;
  state.dump = "[" + _result + "]";
}
function writeBlockSequence(state, level, object, compact) {
  var _result = "", _tag = state.tag, index, length, value;
  for (index = 0, length = object.length; index < length; index += 1) {
    value = object[index];
    if (state.replacer) {
      value = state.replacer.call(object, String(index), value);
    }
    if (writeNode(state, level + 1, value, true, true, false, true) || typeof value === "undefined" && writeNode(state, level + 1, null, true, true, false, true)) {
      if (!compact || _result !== "") {
        _result += generateNextLine(state, level);
      }
      if (state.dump && CHAR_LINE_FEED === state.dump.charCodeAt(0)) {
        _result += "-";
      } else {
        _result += "- ";
      }
      _result += state.dump;
    }
  }
  state.tag = _tag;
  state.dump = _result || "[]";
}
function writeFlowMapping(state, level, object) {
  var _result = "", _tag = state.tag, objectKeyList = Object.keys(object), index, length, objectKey, objectValue, pairBuffer;
  for (index = 0, length = objectKeyList.length; index < length; index += 1) {
    pairBuffer = "";
    if (_result !== "") pairBuffer += ", ";
    if (state.condenseFlow) pairBuffer += '"';
    objectKey = objectKeyList[index];
    objectValue = object[objectKey];
    if (state.replacer) {
      objectValue = state.replacer.call(object, objectKey, objectValue);
    }
    if (!writeNode(state, level, objectKey, false, false)) {
      continue;
    }
    if (state.dump.length > 1024) pairBuffer += "? ";
    pairBuffer += state.dump + (state.condenseFlow ? '"' : "") + ":" + (state.condenseFlow ? "" : " ");
    if (!writeNode(state, level, objectValue, false, false)) {
      continue;
    }
    pairBuffer += state.dump;
    _result += pairBuffer;
  }
  state.tag = _tag;
  state.dump = "{" + _result + "}";
}
function writeBlockMapping(state, level, object, compact) {
  var _result = "", _tag = state.tag, objectKeyList = Object.keys(object), index, length, objectKey, objectValue, explicitPair, pairBuffer;
  if (state.sortKeys === true) {
    objectKeyList.sort();
  } else if (typeof state.sortKeys === "function") {
    objectKeyList.sort(state.sortKeys);
  } else if (state.sortKeys) {
    throw new exception("sortKeys must be a boolean or a function");
  }
  for (index = 0, length = objectKeyList.length; index < length; index += 1) {
    pairBuffer = "";
    if (!compact || _result !== "") {
      pairBuffer += generateNextLine(state, level);
    }
    objectKey = objectKeyList[index];
    objectValue = object[objectKey];
    if (state.replacer) {
      objectValue = state.replacer.call(object, objectKey, objectValue);
    }
    if (!writeNode(state, level + 1, objectKey, true, true, true)) {
      continue;
    }
    explicitPair = state.tag !== null && state.tag !== "?" || state.dump && state.dump.length > 1024;
    if (explicitPair) {
      if (state.dump && CHAR_LINE_FEED === state.dump.charCodeAt(0)) {
        pairBuffer += "?";
      } else {
        pairBuffer += "? ";
      }
    }
    pairBuffer += state.dump;
    if (explicitPair) {
      pairBuffer += generateNextLine(state, level);
    }
    if (!writeNode(state, level + 1, objectValue, true, explicitPair)) {
      continue;
    }
    if (state.dump && CHAR_LINE_FEED === state.dump.charCodeAt(0)) {
      pairBuffer += ":";
    } else {
      pairBuffer += ": ";
    }
    pairBuffer += state.dump;
    _result += pairBuffer;
  }
  state.tag = _tag;
  state.dump = _result || "{}";
}
function detectType(state, object, explicit) {
  var _result, typeList, index, length, type2, style;
  typeList = explicit ? state.explicitTypes : state.implicitTypes;
  for (index = 0, length = typeList.length; index < length; index += 1) {
    type2 = typeList[index];
    if ((type2.instanceOf || type2.predicate) && (!type2.instanceOf || typeof object === "object" && object instanceof type2.instanceOf) && (!type2.predicate || type2.predicate(object))) {
      if (explicit) {
        if (type2.multi && type2.representName) {
          state.tag = type2.representName(object);
        } else {
          state.tag = type2.tag;
        }
      } else {
        state.tag = "?";
      }
      if (type2.represent) {
        style = state.styleMap[type2.tag] || type2.defaultStyle;
        if (_toString.call(type2.represent) === "[object Function]") {
          _result = type2.represent(object, style);
        } else if (_hasOwnProperty.call(type2.represent, style)) {
          _result = type2.represent[style](object, style);
        } else {
          throw new exception("!<" + type2.tag + '> tag resolver accepts not "' + style + '" style');
        }
        state.dump = _result;
      }
      return true;
    }
  }
  return false;
}
function writeNode(state, level, object, block, compact, iskey, isblockseq) {
  state.tag = null;
  state.dump = object;
  if (!detectType(state, object, false)) {
    detectType(state, object, true);
  }
  var type2 = _toString.call(state.dump);
  var inblock = block;
  var tagStr;
  if (block) {
    block = state.flowLevel < 0 || state.flowLevel > level;
  }
  var objectOrArray = type2 === "[object Object]" || type2 === "[object Array]", duplicateIndex, duplicate;
  if (objectOrArray) {
    duplicateIndex = state.duplicates.indexOf(object);
    duplicate = duplicateIndex !== -1;
  }
  if (state.tag !== null && state.tag !== "?" || duplicate || state.indent !== 2 && level > 0) {
    compact = false;
  }
  if (duplicate && state.usedDuplicates[duplicateIndex]) {
    state.dump = "*ref_" + duplicateIndex;
  } else {
    if (objectOrArray && duplicate && !state.usedDuplicates[duplicateIndex]) {
      state.usedDuplicates[duplicateIndex] = true;
    }
    if (type2 === "[object Object]") {
      if (block && Object.keys(state.dump).length !== 0) {
        writeBlockMapping(state, level, state.dump, compact);
        if (duplicate) {
          state.dump = "&ref_" + duplicateIndex + state.dump;
        }
      } else {
        writeFlowMapping(state, level, state.dump);
        if (duplicate) {
          state.dump = "&ref_" + duplicateIndex + " " + state.dump;
        }
      }
    } else if (type2 === "[object Array]") {
      if (block && state.dump.length !== 0) {
        if (state.noArrayIndent && !isblockseq && level > 0) {
          writeBlockSequence(state, level - 1, state.dump, compact);
        } else {
          writeBlockSequence(state, level, state.dump, compact);
        }
        if (duplicate) {
          state.dump = "&ref_" + duplicateIndex + state.dump;
        }
      } else {
        writeFlowSequence(state, level, state.dump);
        if (duplicate) {
          state.dump = "&ref_" + duplicateIndex + " " + state.dump;
        }
      }
    } else if (type2 === "[object String]") {
      if (state.tag !== "?") {
        writeScalar(state, state.dump, level, iskey, inblock);
      }
    } else if (type2 === "[object Undefined]") {
      return false;
    } else {
      if (state.skipInvalid) return false;
      throw new exception("unacceptable kind of an object to dump " + type2);
    }
    if (state.tag !== null && state.tag !== "?") {
      tagStr = encodeURI(
        state.tag[0] === "!" ? state.tag.slice(1) : state.tag
      ).replace(/!/g, "%21");
      if (state.tag[0] === "!") {
        tagStr = "!" + tagStr;
      } else if (tagStr.slice(0, 18) === "tag:yaml.org,2002:") {
        tagStr = "!!" + tagStr.slice(18);
      } else {
        tagStr = "!<" + tagStr + ">";
      }
      state.dump = tagStr + " " + state.dump;
    }
  }
  return true;
}
function getDuplicateReferences(object, state) {
  var objects = [], duplicatesIndexes = [], index, length;
  inspectNode(object, objects, duplicatesIndexes);
  for (index = 0, length = duplicatesIndexes.length; index < length; index += 1) {
    state.duplicates.push(objects[duplicatesIndexes[index]]);
  }
  state.usedDuplicates = new Array(length);
}
function inspectNode(object, objects, duplicatesIndexes) {
  var objectKeyList, index, length;
  if (object !== null && typeof object === "object") {
    index = objects.indexOf(object);
    if (index !== -1) {
      if (duplicatesIndexes.indexOf(index) === -1) {
        duplicatesIndexes.push(index);
      }
    } else {
      objects.push(object);
      if (Array.isArray(object)) {
        for (index = 0, length = object.length; index < length; index += 1) {
          inspectNode(object[index], objects, duplicatesIndexes);
        }
      } else {
        objectKeyList = Object.keys(object);
        for (index = 0, length = objectKeyList.length; index < length; index += 1) {
          inspectNode(object[objectKeyList[index]], objects, duplicatesIndexes);
        }
      }
    }
  }
}
function dump$1(input, options) {
  options = options || {};
  var state = new State(options);
  if (!state.noRefs) getDuplicateReferences(input, state);
  var value = input;
  if (state.replacer) {
    value = state.replacer.call({ "": value }, "", value);
  }
  if (writeNode(state, 0, value, true, true)) return state.dump + "\n";
  return "";
}
var dump_1 = dump$1;
var dumper = {
  dump: dump_1
};
function renamed(from, to) {
  return function() {
    throw new Error("Function yaml." + from + " is removed in js-yaml 4. Use yaml." + to + " instead, which is now safe by default.");
  };
}
var DEFAULT_SCHEMA = _default;
var load = loader.load;
var loadAll = loader.loadAll;
var dump = dumper.dump;
var YAMLException = exception;
var safeLoad = renamed("safeLoad", "load");
var safeLoadAll = renamed("safeLoadAll", "loadAll");
var safeDump = renamed("safeDump", "dump");

// src/data/frontmatter-parser.ts
var FRONTMATTER_REGEX = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;
function parse(content) {
  const match = FRONTMATTER_REGEX.exec(content);
  if (!match) {
    return {
      frontmatter: {},
      body: content
    };
  }
  const frontmatterYaml = match[1];
  const body = content.slice(match[0].length);
  const frontmatter = load(frontmatterYaml, {
    schema: DEFAULT_SCHEMA,
    json: true
  });
  return {
    frontmatter,
    body
  };
}
function serialize(frontmatter, body) {
  const frontmatterYaml = dump(frontmatter, {
    schema: DEFAULT_SCHEMA,
    indent: 2,
    lineWidth: -1,
    // No line width limit
    noRefs: true,
    // Disable aliases
    quotingType: '"',
    forceQuotes: false
  });
  return `---
${frontmatterYaml}---
${body}`;
}

// src/data/config-manager.ts
var fs = __toESM(require("fs/promises"));
var path = __toESM(require("path"));
var import_events = require("events");
var CONFIG_SCHEMA = {
  type: "object",
  required: ["version", "paths"],
  properties: {
    version: { type: "string" },
    project: { type: "object" },
    task_types: { type: "object" },
    priorities: { type: "object" },
    statuses: { type: "object" },
    condition_types: { type: "object" },
    paths: {
      type: "object",
      required: ["tickets", "plans", "reports", "archive"],
      properties: {
        tickets: { type: "string" },
        plans: { type: "string" },
        reports: { type: "string" },
        archive: { type: "string" },
        templates: { type: "string" }
      }
    },
    reporting: { type: "object" }
  }
};
var PIPELINE_SCHEMA = {
  type: "object",
  required: ["pipeline"],
  properties: {
    pipeline: {
      type: "object",
      required: ["agents", "stages", "entry"],
      properties: {
        name: { type: "string" },
        version: { type: "string" },
        agents: {
          type: "object",
          additionalProperties: {
            type: "object",
            required: ["command", "args"],
            properties: {
              command: { type: "string" },
              args: { type: "array", items: { type: "string" } },
              workdir: { type: "string" },
              description: { type: "string" }
            }
          }
        },
        stages: {
          type: "object",
          additionalProperties: {
            type: "object",
            required: ["description"],
            properties: {
              description: { type: "string" },
              agent: { type: "string" },
              fallback_agent: { type: "string" },
              skill: { type: "string" },
              type: { type: "string" },
              counter: { type: "string" },
              max: { type: "number" },
              timeout: { type: "number" },
              goto: { type: "object" }
            }
          }
        },
        entry: { type: "string" },
        entry_point: { type: "string" },
        context: { type: "object" },
        execution: {
          type: "object",
          properties: {
            max_steps: { type: "number" },
            delay_between_stages: { type: "number" },
            timeout_per_stage: { type: "number" },
            log_file: { type: "string" }
          }
        },
        protected_files: { type: "array", items: { type: "string" } }
      }
    }
  }
};
function validateSchema(data, schema2, fieldPrefix = "") {
  const errors = [];
  if (!data || typeof data !== "object") {
    errors.push({ field: fieldPrefix || "root", message: "Configuration must be an object" });
    return errors;
  }
  const obj = data;
  const required = schema2.required;
  if (required) {
    for (const field of required) {
      if (!(field in obj)) {
        errors.push({ field: fieldPrefix ? `${fieldPrefix}.${field}` : field, message: `Required field "${field}" is missing` });
      }
    }
  }
  const properties = schema2.properties;
  if (properties) {
    for (const [key, propSchema] of Object.entries(properties)) {
      if (key in obj && propSchema.type) {
        const value = obj[key];
        const expectedType = propSchema.type;
        const actualType = Array.isArray(value) ? "array" : typeof value;
        if (expectedType === "array" && !Array.isArray(value)) {
          errors.push({ field: fieldPrefix ? `${fieldPrefix}.${key}` : key, message: `Field "${key}" must be an array` });
        } else if (expectedType !== "array" && typeof value !== expectedType) {
          errors.push({ field: fieldPrefix ? `${fieldPrefix}.${key}` : key, message: `Field "${key}" must be of type ${expectedType}` });
        }
        if (expectedType === "object" && typeof value === "object" && value !== null) {
          const nestedRequired = propSchema.required;
          const nestedProperties = propSchema.properties;
          if (nestedRequired || nestedProperties) {
            const nestedSchema = {};
            if (nestedRequired) nestedSchema.required = nestedRequired;
            if (nestedProperties) nestedSchema.properties = nestedProperties;
            const nestedErrors = validateSchema(value, nestedSchema, fieldPrefix ? `${fieldPrefix}.${key}` : key);
            errors.push(...nestedErrors);
          }
          if (propSchema.additionalProperties) {
            const nestedSchema = propSchema.additionalProperties;
            const nestedReq = nestedSchema.required;
            const nestedProps = nestedSchema.properties;
            for (const [nestedKey, nestedValue] of Object.entries(value)) {
              if (typeof nestedValue !== "object" || nestedValue === null) {
                errors.push({ field: fieldPrefix ? `${fieldPrefix}.${key}.${nestedKey}` : `${key}.${nestedKey}`, message: `Field "${key}.${nestedKey}" must be an object` });
                continue;
              }
              const nestedObj = nestedValue;
              if (nestedReq) {
                for (const reqField of nestedReq) {
                  if (!(reqField in nestedObj)) {
                    errors.push({ field: fieldPrefix ? `${fieldPrefix}.${key}.${nestedKey}.${reqField}` : `${key}.${nestedKey}.${reqField}`, message: `Required field "${reqField}" is missing in "${key}.${nestedKey}"` });
                  }
                }
              }
              if (nestedProps) {
                for (const [propKey, propSchema2] of Object.entries(nestedProps)) {
                  if (propKey in nestedObj && propSchema2.type) {
                    const propValue = nestedObj[propKey];
                    const expectedPropType = propSchema2.type;
                    const actualPropType = Array.isArray(propValue) ? "array" : typeof propValue;
                    if (expectedPropType === "array" && !Array.isArray(propValue)) {
                      errors.push({ field: fieldPrefix ? `${fieldPrefix}.${key}.${nestedKey}.${propKey}` : `${key}.${nestedKey}.${propKey}`, message: `Field "${key}.${nestedKey}.${propKey}" must be an array` });
                    } else if (expectedPropType !== "array" && typeof propValue !== expectedPropType) {
                      errors.push({ field: fieldPrefix ? `${fieldPrefix}.${key}.${nestedKey}.${propKey}` : `${key}.${nestedKey}.${propKey}`, message: `Field "${key}.${nestedKey}.${propKey}" must be of type ${expectedPropType}` });
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
  return errors;
}
var ConfigManager = class {
  workflowConfig = null;
  pipelineConfig = null;
  workflowRoot = null;
  eventEmitter;
  /**
   * Event fired when configuration is reloaded
   */
  onDidChange;
  constructor() {
    this.eventEmitter = new import_events.EventEmitter();
    this.onDidChange = (listener) => {
      this.eventEmitter.on("change", listener);
    };
  }
  /**
   * Reads and parses a YAML file
   */
  async readYamlFile(filePath) {
    try {
      const content = await fs.readFile(filePath, "utf-8");
      return load(content);
    } catch (error) {
      if (error instanceof Error) {
        if (error.code === "ENOENT") {
          throw new Error(`Configuration file not found: ${filePath}`);
        }
        if (error instanceof YAMLException) {
          throw new Error(`Invalid YAML in ${filePath}: ${error.message}`);
        }
      }
      throw new Error(`Failed to read ${filePath}: ${error}`);
    }
  }
  /**
   * Loads workflow configuration from config.yaml
   */
  async loadConfig(workflowRoot) {
    if (this.workflowConfig && this.workflowRoot === workflowRoot) {
      return this.workflowConfig;
    }
    const configPath = path.join(workflowRoot, "config", "config.yaml");
    const data = await this.readYamlFile(configPath);
    const errors = validateSchema(data, CONFIG_SCHEMA);
    if (errors.length > 0) {
      throw new ConfigValidationError(errors);
    }
    this.workflowConfig = data;
    this.workflowRoot = workflowRoot;
    return this.workflowConfig;
  }
  /**
   * Loads pipeline configuration from pipeline.yaml
   */
  async loadPipeline(workflowRoot) {
    if (this.pipelineConfig && this.workflowRoot === workflowRoot) {
      return this.pipelineConfig;
    }
    const pipelinePath = path.join(workflowRoot, "config", "pipeline.yaml");
    const data = await this.readYamlFile(pipelinePath);
    const errors = validateSchema(data, PIPELINE_SCHEMA);
    if (errors.length > 0) {
      throw new ConfigValidationError(errors);
    }
    this.pipelineConfig = data;
    this.workflowRoot = workflowRoot;
    return this.pipelineConfig;
  }
  /**
   * Reloads configuration from disk, clearing cache
   */
  async reload() {
    const oldRoot = this.workflowRoot;
    this.workflowConfig = null;
    this.pipelineConfig = null;
    if (oldRoot) {
      await this.loadConfig(oldRoot);
      await this.loadPipeline(oldRoot);
    }
    this.eventEmitter.emit("change");
  }
  /**
   * Gets cached workflow configuration
   * Returns null if not loaded
   */
  getConfig() {
    return this.workflowConfig;
  }
  /**
   * Gets cached pipeline configuration
   * Returns null if not loaded
   */
  getPipeline() {
    return this.pipelineConfig;
  }
  /**
   * Clears configuration cache
   */
  clearCache() {
    this.workflowConfig = null;
    this.pipelineConfig = null;
  }
};
var ConfigValidationError = class extends Error {
  errors;
  constructor(errors) {
    super(`Configuration validation failed: ${errors.map((e) => e.message).join(", ")}`);
    this.name = "ConfigValidationError";
    this.errors = errors;
  }
};

// src/data/workflow-store.ts
var WorkflowStore = class _WorkflowStore {
  // Data storage
  tickets = /* @__PURE__ */ new Map();
  plans = /* @__PURE__ */ new Map();
  reports = [];
  config;
  pipeline;
  // Event handling
  eventEmitter = new import_events2.EventEmitter();
  configManager;
  workflowRoot = null;
  /**
   * Event listener registration
   * Subscribe to store changes for reactive UI updates
   */
  onDidChange;
  constructor() {
    this.configManager = new ConfigManager();
    this.onDidChange = (listener) => {
      this.eventEmitter.on("change", listener);
    };
  }
  /**
   * Refresh all data from disk
   * Scans all ticket folders, plans, reports, and configuration
   * Emits a single 'refresh' event when complete (batching)
   *
   * @param workflowRoot - Root directory of the workflow project
   */
  async refresh(workflowRoot) {
    this.workflowRoot = workflowRoot;
    this.tickets.clear();
    this.plans.clear();
    this.reports = [];
    try {
      this.config = await this.configManager.loadConfig(workflowRoot);
      this.pipeline = await this.configManager.loadPipeline(workflowRoot);
    } catch (error) {
      console.error("Failed to load configuration:", error);
    }
    const ticketStatuses = [
      "backlog" /* Backlog */,
      "ready" /* Ready */,
      "in-progress" /* InProgress */,
      "blocked" /* Blocked */,
      "review" /* Review */,
      "done" /* Done */
    ];
    for (const status of ticketStatuses) {
      await this.scanTicketsForStatus(workflowRoot, status);
    }
    await this.scanPlans(workflowRoot);
    await this.scanReports(workflowRoot);
    this.emitEvent({ type: "ticket", operation: "refresh" });
    this.emitEvent({ type: "plan", operation: "refresh" });
    this.emitEvent({ type: "report", operation: "refresh" });
    if (this.config || this.pipeline) {
      this.emitEvent({ type: "config", operation: "refresh" });
    }
  }
  /**
   * Scan tickets for a specific status folder
   */
  async scanTicketsForStatus(workflowRoot, status) {
    const statusDir = path2.join(workflowRoot, "tickets", status);
    try {
      const entries = await fs2.readdir(statusDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith(".md") && !entry.name.startsWith(".")) {
          const filePath = path2.join(statusDir, entry.name);
          try {
            const content = await fs2.readFile(filePath, "utf-8");
            const { frontmatter, body } = parse(content);
            if (!frontmatter.id) {
              continue;
            }
            const reviews = _WorkflowStore.parseReviews(body);
            const ticket = { ...frontmatter, status, ...reviews.length > 0 ? { reviews } : {} };
            this.tickets.set(ticket.id, ticket);
          } catch (error) {
            console.error(`Failed to parse ticket ${filePath}:`, error);
          }
        }
      }
    } catch (error) {
      if (error.code !== "ENOENT") {
        console.error(`Failed to scan tickets for status ${status}:`, error);
      }
    }
  }
  /**
   * Parse review entries from ticket markdown body.
   * Expects a table under ## Ревью or ## Review with rows like:
   * | date | ✅ passed / ❌ failed | summary |
   */
  static parseReviews(body) {
    const sectionMatch = body.match(/## (?:Ревью|Review)([\s\S]*?)(?=\n## |\n---|\s*$)/);
    if (!sectionMatch) {
      return [];
    }
    const section = sectionMatch[1];
    const reviews = [];
    const rowRegex = /\|\s*(\d{4}-\d{2}-\d{2})\s*\|\s*(?:✅|❌)\s*(passed|failed)\s*\|\s*([^|]*)\|/g;
    let match;
    while ((match = rowRegex.exec(section)) !== null) {
      reviews.push({
        date: match[1],
        status: match[2],
        summary: match[3].trim()
      });
    }
    return reviews;
  }
  /**
   * Scan plans from current and archive folders
   */
  async scanPlans(workflowRoot) {
    const planDirs = [
      path2.join(workflowRoot, "plans", "current"),
      path2.join(workflowRoot, "plans", "archive")
    ];
    for (const planDir of planDirs) {
      const folder = planDir.endsWith("current") ? "current" : "archive";
      try {
        const entries = await fs2.readdir(planDir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isFile() && entry.name.endsWith(".md") && !entry.name.startsWith(".")) {
            const filePath = path2.join(planDir, entry.name);
            try {
              const content = await fs2.readFile(filePath, "utf-8");
              const { frontmatter } = parse(content);
              if (!frontmatter.id) {
                continue;
              }
              this.plans.set(frontmatter.id, { ...frontmatter, folder });
            } catch (error) {
              console.error(`Failed to parse plan ${filePath}:`, error);
            }
          }
        }
      } catch (error) {
        if (error.code !== "ENOENT") {
          console.error(`Failed to scan plans in ${planDir}:`, error);
        }
      }
    }
  }
  /**
   * Scan reports from reports folder
   */
  async scanReports(workflowRoot) {
    const reportsDir = path2.join(workflowRoot, "reports");
    try {
      const entries = await fs2.readdir(reportsDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith(".md") && !entry.name.startsWith(".")) {
          const filePath = path2.join(reportsDir, entry.name);
          try {
            const content = await fs2.readFile(filePath, "utf-8");
            const { frontmatter } = parse(content);
            if (!frontmatter.id) {
              continue;
            }
            this.reports.push(frontmatter);
          } catch (error) {
            console.error(`Failed to parse report ${filePath}:`, error);
          }
        }
      }
    } catch (error) {
      if (error.code !== "ENOENT") {
        console.error(`Failed to scan reports:`, error);
      }
    }
  }
  /**
   * Emit a store change event
   */
  emitEvent(event) {
    this.eventEmitter.emit("change", event);
  }
  // ==================== Incremental Update Methods ====================
  /**
   * Add a new ticket to the store
   * Emits an 'add' event for the ticket
   */
  addTicket(ticket) {
    const isNew = !this.tickets.has(ticket.id);
    this.tickets.set(ticket.id, ticket);
    this.emitEvent({
      type: "ticket",
      id: ticket.id,
      operation: isNew ? "add" : "update"
    });
  }
  /**
   * Update an existing ticket
   * Emits an 'update' event for the ticket
   */
  updateTicket(id, ticket) {
    if (!this.tickets.has(id)) {
      throw new Error(`Ticket ${id} not found for update`);
    }
    this.tickets.set(id, ticket);
    this.emitEvent({ type: "ticket", id, operation: "update" });
  }
  /**
   * Remove a ticket from the store
   * Emits a 'delete' event for the ticket
   */
  removeTicket(id) {
    if (!this.tickets.has(id)) {
      throw new Error(`Ticket ${id} not found for removal`);
    }
    this.tickets.delete(id);
    this.emitEvent({ type: "ticket", id, operation: "delete" });
  }
  /**
   * Add a new plan to the store
   * Emits an 'add' event for the plan
   */
  addPlan(plan) {
    const isNew = !this.plans.has(plan.id);
    this.plans.set(plan.id, plan);
    this.emitEvent({
      type: "plan",
      id: plan.id,
      operation: isNew ? "add" : "update"
    });
  }
  /**
   * Update an existing plan
   * Emits an 'update' event for the plan
   */
  updatePlan(id, plan) {
    if (!this.plans.has(id)) {
      throw new Error(`Plan ${id} not found for update`);
    }
    this.plans.set(id, plan);
    this.emitEvent({ type: "plan", id, operation: "update" });
  }
  /**
   * Remove a plan from the store
   * Emits a 'delete' event for the plan
   */
  removePlan(id) {
    if (!this.plans.has(id)) {
      throw new Error(`Plan ${id} not found for removal`);
    }
    this.plans.delete(id);
    this.emitEvent({ type: "plan", id, operation: "delete" });
  }
  /**
   * Add a new report to the store
   * Emits an 'add' event for the report
   */
  addReport(report) {
    this.reports.push(report);
    this.emitEvent({
      type: "report",
      id: report.id,
      operation: "add"
    });
  }
  /**
   * Update an existing report
   * Emits an 'update' event for the report
   */
  updateReport(id, report) {
    const index = this.reports.findIndex((r) => r.id === id);
    if (index === -1) {
      throw new Error(`Report ${id} not found for update`);
    }
    this.reports[index] = report;
    this.emitEvent({ type: "report", id, operation: "update" });
  }
  /**
   * Remove a report from the store
   * Emits a 'delete' event for the report
   */
  removeReport(id) {
    const index = this.reports.findIndex((r) => r.id === id);
    if (index === -1) {
      throw new Error(`Report ${id} not found for removal`);
    }
    this.reports.splice(index, 1);
    this.emitEvent({ type: "report", id, operation: "delete" });
  }
  /**
   * Update configuration
   * Emits a 'config' event
   */
  setConfig(config) {
    this.config = config;
    this.emitEvent({ type: "config", operation: "update" });
  }
  /**
   * Update pipeline configuration
   * Emits a 'config' event
   */
  setPipeline(pipeline) {
    this.pipeline = pipeline;
    this.emitEvent({ type: "config", operation: "update" });
  }
  // ==================== Query Methods ====================
  /**
   * Get all tickets
   */
  getTickets() {
    return Array.from(this.tickets.values());
  }
  /**
   * Get a ticket by ID
   */
  getTicketById(id) {
    return this.tickets.get(id);
  }
  /**
   * Get tickets filtered by status
   */
  getTicketsByStatus(status) {
    return Array.from(this.tickets.values()).filter((t) => t.status === status);
  }
  /**
   * Get tickets filtered by priority
   */
  getTicketsByPriority(priority) {
    return Array.from(this.tickets.values()).filter((t) => t.priority === priority);
  }
  /**
   * Get tickets that depend on a specific ticket
   */
  getTicketsWithDependency(dependencyId) {
    return Array.from(this.tickets.values()).filter(
      (t) => t.dependencies.includes(dependencyId)
    );
  }
  /**
   * Get all plans
   */
  getPlans() {
    return Array.from(this.plans.values());
  }
  /**
   * Get a plan by ID
   */
  getPlanById(id) {
    return this.plans.get(id);
  }
  /**
   * Get plans from current folder only
   */
  getCurrentPlans() {
    return Array.from(this.plans.values()).filter((p) => p.folder === "current");
  }
  /**
   * Get plans from archive folder only
   */
  getArchivedPlans() {
    return Array.from(this.plans.values()).filter((p) => p.folder === "archive");
  }
  /**
   * Get all reports
   */
  getReports() {
    return this.reports;
  }
  /**
   * Get a report by ID
   */
  getReportById(id) {
    return this.reports.find((r) => r.id === id);
  }
  /**
   * Get workflow configuration
   */
  getConfig() {
    return this.config;
  }
  /**
   * Get pipeline configuration
   */
  getPipeline() {
    return this.pipeline;
  }
  /**
   * Get the workflow root directory
   */
  getWorkflowRoot() {
    return this.workflowRoot;
  }
  /**
   * Clear all data from the store
   */
  clear() {
    this.tickets.clear();
    this.plans.clear();
    this.reports = [];
    this.config = void 0;
    this.pipeline = void 0;
    this.workflowRoot = null;
  }
  /**
   * Get store statistics
   */
  getStats() {
    return {
      ticketCount: this.tickets.size,
      planCount: this.plans.size,
      reportCount: this.reports.length,
      hasConfig: !!this.config,
      hasPipeline: !!this.pipeline
    };
  }
};

// src/ui/sidebar-tree-provider.ts
var vscode = __toESM(require("vscode"));
var path3 = __toESM(require("path"));
var SidebarTreeItem = class extends vscode.TreeItem {
  constructor(label, collapsibleState, itemType, id) {
    super(label, collapsibleState);
    this.itemType = itemType;
    this.id = id;
    this.id = id;
  }
};
var TicketTreeItem = class extends SidebarTreeItem {
  constructor(ticket, workflowRoot) {
    const label = ticket.id;
    const description = ticket.title;
    super(label, vscode.TreeItemCollapsibleState.None, "ticket", ticket.id);
    this.ticket = ticket;
    this.description = description;
    this.tooltip = buildTicketTooltip(ticket);
    this.iconPath = getTicketIcon(ticket.priority);
    this.contextValue = "ticket";
    this.command = {
      command: "vscode.open",
      title: vscode.l10n.t("Open Ticket"),
      arguments: [vscode.Uri.file(getTicketPath(ticket, workflowRoot))]
    };
  }
};
var StatusGroupTreeItem = class extends SidebarTreeItem {
  constructor(status, count) {
    const label = `${status} (${count})`;
    super(label, vscode.TreeItemCollapsibleState.Expanded, "status-group", status);
    this.status = status;
    this.count = count;
    this.contextValue = "status-group";
  }
};
var PlanTreeItem = class extends SidebarTreeItem {
  constructor(plan, workflowRoot, isCurrent) {
    const label = plan.id;
    const description = plan.title;
    const groupId = isCurrent ? "current" : "archive";
    super(label, vscode.TreeItemCollapsibleState.None, "plan", plan.id);
    this.plan = plan;
    this.description = description;
    this.tooltip = `${plan.id}: ${plan.title}
${vscode.l10n.t("Status")}: ${plan.status}`;
    this.iconPath = new vscode.ThemeIcon("notebook");
    const planPath = path3.join(
      workflowRoot,
      "plans",
      groupId,
      `${plan.id}.md`
    );
    this.command = {
      command: "vscode.open",
      title: vscode.l10n.t("Open Plan"),
      arguments: [vscode.Uri.file(planPath)]
    };
  }
};
var PlanGroupTreeItem = class extends SidebarTreeItem {
  constructor(groupType, count) {
    const label = groupType === "current" ? vscode.l10n.t("Current") : vscode.l10n.t("Archive");
    super(`${label} (${count})`, vscode.TreeItemCollapsibleState.Collapsed, "plan-group", groupType);
    this.groupType = groupType;
    this.count = count;
    this.contextValue = "plan-group";
  }
};
var ReportTreeItem = class extends SidebarTreeItem {
  constructor(report, workflowRoot) {
    const label = report.id;
    const description = report.title;
    super(label, vscode.TreeItemCollapsibleState.None, "report", report.id);
    this.report = report;
    this.description = description;
    this.tooltip = `${report.id}: ${report.title}
${vscode.l10n.t("Type")}: ${report.type}
${vscode.l10n.t("Created")}: ${report.created_at}`;
    this.iconPath = new vscode.ThemeIcon("document");
    const reportPath = path3.join(
      workflowRoot,
      "reports",
      `${report.id}.md`
    );
    this.command = {
      command: "vscode.open",
      title: vscode.l10n.t("Open Report"),
      arguments: [vscode.Uri.file(reportPath)]
    };
  }
};
function buildTicketTooltip(ticket) {
  const md = new vscode.MarkdownString();
  md.isTrusted = true;
  md.appendMarkdown(`**${ticket.id}: ${ticket.title}**

`);
  md.appendMarkdown(`| ${vscode.l10n.t("Field")} | ${vscode.l10n.t("Value")} |
|---|---|
`);
  md.appendMarkdown(`| **${vscode.l10n.t("Status")}** | ${ticket.status} |
`);
  md.appendMarkdown(`| **${vscode.l10n.t("Priority")}** | ${ticket.priority} |
`);
  md.appendMarkdown(`| **${vscode.l10n.t("Type")}** | ${ticket.type} |
`);
  if (ticket.dependencies?.length) {
    md.appendMarkdown(`| **${vscode.l10n.t("Deps")}** | ${ticket.dependencies.join(", ")} |
`);
  }
  if (ticket.parent_plan) {
    md.appendMarkdown(`| **${vscode.l10n.t("Plan")}** | ${ticket.parent_plan} |
`);
  }
  if (ticket.context?.notes) {
    md.appendMarkdown(`
**${vscode.l10n.t("Notes")}:** ${ticket.context.notes}
`);
  }
  if (ticket.reviews?.length) {
    md.appendMarkdown(`
**${vscode.l10n.t("Review")}:**

`);
    md.appendMarkdown(`| ${vscode.l10n.t("Date")} | ${vscode.l10n.t("Status")} | ${vscode.l10n.t("Summary")} |
|---|---|---|
`);
    for (const r of ticket.reviews) {
      const icon = r.status === "passed" ? "\u2705" : "\u274C";
      md.appendMarkdown(`| ${r.date} | ${icon} ${r.status} | ${r.summary} |
`);
    }
  }
  return md;
}
function getTicketIcon(priority) {
  if (priority <= 1) {
    return new vscode.ThemeIcon("circle-filled", new vscode.ThemeColor("notificationsErrorIcon.foreground"));
  } else if (priority === 2) {
    return new vscode.ThemeIcon("circle-filled", new vscode.ThemeColor("notificationsWarningIcon.foreground"));
  } else if (priority === 3) {
    return new vscode.ThemeIcon("circle-filled", new vscode.ThemeColor("notificationsInfoIcon.foreground"));
  } else {
    return new vscode.ThemeIcon("circle-filled", new vscode.ThemeColor("terminal.ansiGreen"));
  }
}
function getTicketPath(ticket, workflowRoot) {
  return path3.join(
    workflowRoot,
    "tickets",
    ticket.status,
    `${ticket.id}.md`
  );
}
var TicketsTreeProvider = class {
  constructor(store) {
    this.store = store;
    store.onDidChange((event) => {
      if (event.type === "ticket") {
        this.refresh();
      }
    });
  }
  _onDidChangeTreeData = new vscode.EventEmitter();
  onDidChangeTreeData = this._onDidChangeTreeData.event;
  workflowRoot = null;
  filterPlan = null;
  /**
   * Set workflow root directory
   */
  setWorkflowRoot(root) {
    this.workflowRoot = root;
    this.refresh();
  }
  /**
   * Set plan filter for tickets
   * @param planId Plan ID to filter by, or null to clear filter
   */
  setPlanFilter(planId) {
    this.filterPlan = planId;
    this.refresh();
  }
  /**
   * Get current plan filter
   */
  getPlanFilter() {
    return this.filterPlan;
  }
  /**
   * Refresh tree data
   */
  refresh() {
    this._onDidChangeTreeData.fire(void 0);
  }
  /**
   * Get tree item for element
   */
  getTreeItem(element) {
    return element;
  }
  /**
   * Get children for element
   */
  getChildren(element) {
    if (!this.workflowRoot) {
      return Promise.resolve([]);
    }
    if (!element) {
      return this.getStatusGroups();
    }
    if (element.itemType === "status-group") {
      const statusGroup = element;
      return this.getTicketsForStatus(statusGroup.status);
    }
    return Promise.resolve([]);
  }
  /**
   * Get status groups with ticket counts
   */
  getStatusGroups() {
    let tickets = this.store.getTickets();
    if (this.filterPlan) {
      tickets = tickets.filter((ticket) => ticket.parent_plan === this.filterPlan);
    }
    const counts = {
      ["backlog" /* Backlog */]: 0,
      ["ready" /* Ready */]: 0,
      ["in-progress" /* InProgress */]: 0,
      ["blocked" /* Blocked */]: 0,
      ["review" /* Review */]: 0,
      ["done" /* Done */]: 0
    };
    for (const ticket of tickets) {
      counts[ticket.status]++;
    }
    const groups = [];
    const statusOrder = [
      "blocked" /* Blocked */,
      "backlog" /* Backlog */,
      "ready" /* Ready */,
      "in-progress" /* InProgress */,
      "review" /* Review */,
      "done" /* Done */
    ];
    for (const status of statusOrder) {
      if (counts[status] > 0) {
        groups.push(new StatusGroupTreeItem(status, counts[status]));
      }
    }
    return Promise.resolve(groups);
  }
  /**
   * Get tickets for a specific status
   */
  getTicketsForStatus(status) {
    let tickets = this.store.getTicketsByStatus(status);
    if (this.filterPlan) {
      tickets = tickets.filter((ticket) => ticket.parent_plan === this.filterPlan);
    }
    tickets.sort((a, b) => a.priority - b.priority);
    const items = tickets.map(
      (ticket) => new TicketTreeItem(ticket, this.workflowRoot)
    );
    return Promise.resolve(items);
  }
};
var PlansTreeProvider = class {
  constructor(store) {
    this.store = store;
    store.onDidChange((event) => {
      if (event.type === "plan") {
        this.refresh();
      }
    });
  }
  _onDidChangeTreeData = new vscode.EventEmitter();
  onDidChangeTreeData = this._onDidChangeTreeData.event;
  workflowRoot = null;
  /**
   * Set workflow root directory
   */
  setWorkflowRoot(root) {
    this.workflowRoot = root;
    this.refresh();
  }
  /**
   * Refresh tree data
   */
  refresh() {
    this._onDidChangeTreeData.fire(void 0);
  }
  /**
   * Get tree item for element
   */
  getTreeItem(element) {
    return element;
  }
  /**
   * Get children for element
   */
  getChildren(element) {
    if (!this.workflowRoot) {
      return Promise.resolve([]);
    }
    if (!element) {
      return this.getPlanGroups();
    }
    if (element.itemType === "plan-group") {
      const planGroup = element;
      return this.getPlansForGroup(planGroup.groupType);
    }
    return Promise.resolve([]);
  }
  /**
   * Get plan groups (current/archive) with counts
   */
  getPlanGroups() {
    const plans = this.store.getPlans();
    const currentPlans = plans.filter((p) => p.folder === "current");
    const archivedPlans = plans.filter((p) => p.folder === "archive");
    const groups = [];
    if (currentPlans.length > 0) {
      groups.push(new PlanGroupTreeItem("current", currentPlans.length));
    }
    if (archivedPlans.length > 0) {
      groups.push(new PlanGroupTreeItem("archive", archivedPlans.length));
    }
    return Promise.resolve(groups);
  }
  /**
   * Get plans for a specific group
   */
  getPlansForGroup(groupType) {
    const plans = this.store.getPlans();
    const filteredPlans = plans.filter((p) => p.folder === groupType);
    filteredPlans.sort((a, b) => a.id.localeCompare(b.id));
    const items = filteredPlans.map(
      (plan) => new PlanTreeItem(plan, this.workflowRoot, groupType === "current")
    );
    return Promise.resolve(items);
  }
};
var ReportsTreeProvider = class {
  constructor(store) {
    this.store = store;
    store.onDidChange((event) => {
      if (event.type === "report") {
        this.refresh();
      }
    });
  }
  _onDidChangeTreeData = new vscode.EventEmitter();
  onDidChangeTreeData = this._onDidChangeTreeData.event;
  workflowRoot = null;
  /**
   * Set workflow root directory
   */
  setWorkflowRoot(root) {
    this.workflowRoot = root;
    this.refresh();
  }
  /**
   * Refresh tree data
   */
  refresh() {
    this._onDidChangeTreeData.fire(void 0);
  }
  /**
   * Get tree item for element
   */
  getTreeItem(element) {
    return element;
  }
  /**
   * Get children for element
   */
  getChildren(element) {
    if (!this.workflowRoot) {
      return Promise.resolve([]);
    }
    if (element) {
      return Promise.resolve([]);
    }
    return this.getReports();
  }
  /**
   * Get reports sorted by creation date (newest first)
   */
  getReports() {
    const reports = this.store.getReports();
    reports.sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
    const items = reports.map(
      (report) => new ReportTreeItem(report, this.workflowRoot)
    );
    return Promise.resolve(items);
  }
};
var SkillTreeItem = class extends SidebarTreeItem {
  constructor(skillId, skillPath, stagesCount, isUnlinked) {
    const label = skillId;
    const description = `${stagesCount} stage${stagesCount !== 1 ? "s" : ""}`;
    super(label, vscode.TreeItemCollapsibleState.None, "skill", skillId);
    this.skillId = skillId;
    this.skillPath = skillPath;
    this.stagesCount = stagesCount;
    this.isUnlinked = isUnlinked;
    this.description = description;
    this.tooltip = `${skillId}
Stages: ${stagesCount}
Path: ${skillPath}`;
    this.iconPath = isUnlinked ? new vscode.ThemeIcon("warning", new vscode.ThemeColor("notificationsWarningIcon.foreground")) : new vscode.ThemeIcon("symbol-method");
    this.command = {
      command: "vscode.open",
      title: vscode.l10n.t("Open Skill"),
      arguments: [vscode.Uri.file(skillPath)]
    };
  }
};
var SkillsTreeProvider = class {
  constructor(store) {
    this.store = store;
    store.onDidChange((event) => {
      if (event.type === "config") {
        this.refresh();
      }
    });
  }
  _onDidChangeTreeData = new vscode.EventEmitter();
  onDidChangeTreeData = this._onDidChangeTreeData.event;
  workflowRoot = null;
  skillsWatcher = null;
  /**
   * Set workflow root directory and setup file watcher
   */
  setWorkflowRoot(root) {
    this.workflowRoot = root;
    if (this.skillsWatcher) {
      this.skillsWatcher.dispose();
    }
    const skillsPattern = path3.join(root, "src", "skills", "*", "SKILL.md");
    this.skillsWatcher = vscode.workspace.createFileSystemWatcher(skillsPattern);
    this.skillsWatcher.onDidChange(() => this.refresh());
    this.skillsWatcher.onDidCreate(() => this.refresh());
    this.skillsWatcher.onDidDelete(() => this.refresh());
    this.refresh();
  }
  /**
   * Dispose file watcher
   */
  dispose() {
    if (this.skillsWatcher) {
      this.skillsWatcher.dispose();
    }
  }
  /**
   * Refresh tree data
   */
  refresh() {
    this._onDidChangeTreeData.fire(void 0);
  }
  /**
   * Get tree item for element
   */
  getTreeItem(element) {
    return element;
  }
  /**
   * Get children for element
   */
  getChildren(element) {
    if (!this.workflowRoot) {
      return Promise.resolve([]);
    }
    if (element) {
      return Promise.resolve([]);
    }
    return this.getSkills();
  }
  /**
   * Scan and return all skills as tree items
   */
  async getSkills() {
    const skillsDir = path3.join(this.workflowRoot, "src", "skills");
    try {
      const entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(skillsDir));
      const items = [];
      const skillDirs = entries.filter(([_, type2]) => type2 === vscode.FileType.Directory).map(([name]) => name).sort();
      const pipeline = this.store.getPipeline();
      const stageSkills = this.getStageSkillsFromPipeline(pipeline);
      for (const skillDir of skillDirs) {
        const skillPath = path3.join(skillsDir, skillDir, "SKILL.md");
        const skillUri = vscode.Uri.file(skillPath);
        try {
          await vscode.workspace.fs.stat(skillUri);
        } catch {
          continue;
        }
        const stagesCount = stageSkills.get(skillDir) || 0;
        const isUnlinked = stagesCount === 0;
        items.push(new SkillTreeItem(skillDir, skillPath, stagesCount, isUnlinked));
      }
      return items;
    } catch (error) {
      console.error("Failed to read skills directory:", error);
      return [];
    }
  }
  /**
   * Extract skill bindings from pipeline configuration
   * Returns a map of skillId -> stages count
   */
  getStageSkillsFromPipeline(pipeline) {
    const skillCounts = /* @__PURE__ */ new Map();
    if (!pipeline?.pipeline?.stages) {
      return skillCounts;
    }
    const stages = pipeline.pipeline.stages;
    for (const stageConfig of Object.values(stages)) {
      const stage = stageConfig;
      if (stage.skill && typeof stage.skill === "string") {
        const count = skillCounts.get(stage.skill) || 0;
        skillCounts.set(stage.skill, count + 1);
      }
    }
    return skillCounts;
  }
};
var LogFileTreeItem = class extends SidebarTreeItem {
  constructor(fileName, filePath, modifiedDate) {
    const label = fileName;
    const description = modifiedDate.toLocaleString();
    super(label, vscode.TreeItemCollapsibleState.None, "log", fileName);
    this.fileName = fileName;
    this.filePath = filePath;
    this.modifiedDate = modifiedDate;
    this.description = description;
    this.tooltip = `${fileName}
Modified: ${modifiedDate.toLocaleString()}`;
    this.iconPath = new vscode.ThemeIcon("output");
    this.command = {
      command: "vscode.open",
      title: vscode.l10n.t("Open Log"),
      arguments: [vscode.Uri.file(filePath)]
    };
  }
};
var LogsTreeProvider = class {
  constructor(store) {
    this.store = store;
    store.onDidChange((event) => {
      if (event.type === "config") {
        this.refresh();
      }
    });
  }
  _onDidChangeTreeData = new vscode.EventEmitter();
  onDidChangeTreeData = this._onDidChangeTreeData.event;
  workflowRoot = null;
  logsWatcher = null;
  /**
   * Set workflow root directory and setup file watcher
   */
  setWorkflowRoot(root) {
    this.workflowRoot = root;
    if (this.logsWatcher) {
      this.logsWatcher.dispose();
    }
    const logsPattern = path3.join(root, "logs", "*");
    this.logsWatcher = vscode.workspace.createFileSystemWatcher(logsPattern);
    this.logsWatcher.onDidChange(() => this.refresh());
    this.logsWatcher.onDidCreate(() => this.refresh());
    this.logsWatcher.onDidDelete(() => this.refresh());
    this.refresh();
  }
  /**
   * Dispose file watcher
   */
  dispose() {
    if (this.logsWatcher) {
      this.logsWatcher.dispose();
    }
  }
  /**
   * Refresh tree data
   */
  refresh() {
    this._onDidChangeTreeData.fire(void 0);
  }
  /**
   * Get tree item for element
   */
  getTreeItem(element) {
    return element;
  }
  /**
   * Get children for element
   */
  getChildren(element) {
    if (!this.workflowRoot) {
      return Promise.resolve([]);
    }
    if (element) {
      return Promise.resolve([]);
    }
    return this.getLogFiles();
  }
  /**
   * Scan and return all log files sorted by modification date (newest first)
   */
  async getLogFiles() {
    const logsDir = path3.join(this.workflowRoot, "logs");
    try {
      const entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(logsDir));
      const items = [];
      for (const [fileName, fileType] of entries) {
        if (fileType === vscode.FileType.File) {
          const filePath = path3.join(logsDir, fileName);
          try {
            const stats = await vscode.workspace.fs.stat(vscode.Uri.file(filePath));
            const modifiedDate = new Date(stats.mtime);
            items.push(new LogFileTreeItem(fileName, filePath, modifiedDate));
          } catch {
          }
        }
      }
      items.sort((a, b) => b.modifiedDate.getTime() - a.modifiedDate.getTime());
      return items;
    } catch (error) {
      console.error("Failed to read logs directory:", error);
      return [];
    }
  }
};

// src/ui/kanban-tree-provider.ts
var vscode2 = __toESM(require("vscode"));
var path4 = __toESM(require("path"));
var KanbanTicketTreeItem = class extends vscode2.TreeItem {
  constructor(ticket, workflowRoot) {
    const label = ticket.id;
    const description = ticket.title;
    super(label, vscode2.TreeItemCollapsibleState.None);
    this.ticket = ticket;
    this.description = description;
    this.tooltip = createTicketTooltip(ticket);
    this.iconPath = getTicketIcon2(ticket.priority);
    this.contextValue = "kanban-ticket";
    const ticketPath = path4.join(
      workflowRoot,
      "tickets",
      ticket.status,
      `${ticket.id}.md`
    );
    this.command = {
      command: "vscode.open",
      title: vscode2.l10n.t("Open Ticket"),
      arguments: [vscode2.Uri.file(ticketPath)]
    };
  }
};
function createTicketTooltip(ticket) {
  const priorityLabels = {
    1: vscode2.l10n.t("Critical"),
    2: vscode2.l10n.t("High"),
    3: vscode2.l10n.t("Medium"),
    4: vscode2.l10n.t("Low"),
    5: vscode2.l10n.t("Trivial")
  };
  const priorityLabel = priorityLabels[ticket.priority] || `${vscode2.l10n.t("Priority")} ${ticket.priority}`;
  const deps = ticket.dependencies.length > 0 ? ticket.dependencies.join(", ") : vscode2.l10n.t("None");
  const markdown = new vscode2.MarkdownString();
  markdown.isTrusted = true;
  markdown.supportHtml = true;
  markdown.appendMarkdown(`**${ticket.id}: ${ticket.title}**

`);
  markdown.appendMarkdown(`| ${vscode2.l10n.t("Field")} | ${vscode2.l10n.t("Value")} |
`);
  markdown.appendMarkdown(`|-------|-------|
`);
  markdown.appendMarkdown(`| **${vscode2.l10n.t("Status")}** | ${ticket.status} |
`);
  markdown.appendMarkdown(`| **${vscode2.l10n.t("Priority")}** | ${priorityLabel} |
`);
  markdown.appendMarkdown(`| **${vscode2.l10n.t("Type")}** | ${ticket.type} |
`);
  markdown.appendMarkdown(`| **${vscode2.l10n.t("Dependencies")}** | ${deps} |
`);
  markdown.appendMarkdown(`| **${vscode2.l10n.t("Parent Plan")}** | ${ticket.parent_plan} |
`);
  if (ticket.context?.notes) {
    markdown.appendMarkdown(`
---

**${vscode2.l10n.t("Notes")}:**
${ticket.context.notes}
`);
  }
  if (ticket.reviews?.length) {
    markdown.appendMarkdown(`
**${vscode2.l10n.t("Review")}:**

`);
    markdown.appendMarkdown(`| ${vscode2.l10n.t("Date")} | ${vscode2.l10n.t("Status")} | ${vscode2.l10n.t("Summary")} |
|---|---|---|
`);
    for (const r of ticket.reviews) {
      const icon = r.status === "passed" ? "\u2705" : "\u274C";
      markdown.appendMarkdown(`| ${r.date} | ${icon} ${r.status} | ${r.summary} |
`);
    }
  }
  return markdown;
}
function getTicketIcon2(priority) {
  if (priority <= 1) {
    return new vscode2.ThemeIcon("circle-filled", new vscode2.ThemeColor("notificationsErrorIcon.foreground"));
  } else if (priority === 2) {
    return new vscode2.ThemeIcon("circle-filled", new vscode2.ThemeColor("notificationsWarningIcon.foreground"));
  } else if (priority === 3) {
    return new vscode2.ThemeIcon("circle-filled", new vscode2.ThemeColor("notificationsInfoIcon.foreground"));
  } else {
    return new vscode2.ThemeIcon("circle-filled", new vscode2.ThemeColor("terminal.ansiGreen"));
  }
}
var KanbanTreeProvider = class {
  constructor(store, status) {
    this.store = store;
    this.status = status;
    store.onDidChange((event) => {
      if (event.type === "ticket") {
        this.refresh();
      }
    });
  }
  _onDidChangeTreeData = new vscode2.EventEmitter();
  onDidChangeTreeData = this._onDidChangeTreeData.event;
  workflowRoot = null;
  sortMode = "priority";
  /**
   * Set workflow root directory
   */
  setWorkflowRoot(root) {
    this.workflowRoot = root;
    this.refresh();
  }
  /**
   * Set sort mode and refresh
   */
  setSortMode(mode) {
    this.sortMode = mode;
    this.refresh();
  }
  /**
   * Refresh tree data
   */
  refresh() {
    this._onDidChangeTreeData.fire(void 0);
  }
  /**
   * Get tree item for element
   */
  getTreeItem(element) {
    return element;
  }
  /**
   * Get children for element
   */
  getChildren(element) {
    if (!this.workflowRoot) {
      return Promise.resolve([]);
    }
    if (element) {
      return Promise.resolve([]);
    }
    return this.getTicketsForStatus();
  }
  /**
   * Get tickets for the configured status
   */
  getTicketsForStatus() {
    const tickets = this.store.getTicketsByStatus(this.status);
    switch (this.sortMode) {
      case "id":
        tickets.sort((a, b) => a.id.localeCompare(b.id));
        break;
      case "title":
        tickets.sort((a, b) => a.title.localeCompare(b.title));
        break;
      case "priority":
      default:
        tickets.sort((a, b) => a.priority - b.priority);
        break;
    }
    const items = tickets.map(
      (ticket) => new KanbanTicketTreeItem(ticket, this.workflowRoot)
    );
    return Promise.resolve(items);
  }
  /**
   * Get the ticket count for this status
   * Used for column header display
   */
  getCount() {
    return this.store.getTicketsByStatus(this.status).length;
  }
  /**
   * Get badge for this status
   * Used for TreeView.badge property
   */
  getBadge() {
    const count = this.getCount();
    if (count === 0) {
      return void 0;
    }
    return {
      value: count,
      tooltip: vscode2.l10n.t("{0} tickets ready", count)
    };
  }
};
function createKanbanProviders(store) {
  return {
    backlog: new KanbanTreeProvider(store, "backlog" /* Backlog */),
    ready: new KanbanTreeProvider(store, "ready" /* Ready */),
    inProgress: new KanbanTreeProvider(store, "in-progress" /* InProgress */),
    blocked: new KanbanTreeProvider(store, "blocked" /* Blocked */),
    review: new KanbanTreeProvider(store, "review" /* Review */),
    done: new KanbanTreeProvider(store, "done" /* Done */)
  };
}

// src/ui/pipeline-tree-provider.ts
var vscode4 = __toESM(require("vscode"));

// src/services/pipeline-service.ts
var import_child_process = require("child_process");
var import_events3 = require("events");
var vscode3 = __toESM(require("vscode"));
var PipelineService = class extends import_events3.EventEmitter {
  currentState = "idle" /* Idle */;
  childProcess = null;
  currentStage;
  currentAgent;
  currentTicket;
  retryCount = 0;
  stopping = false;
  spawnFn;
  workflowRoot;
  progress;
  progressCancellationToken;
  startTime;
  totalStages = 0;
  completedStages = 0;
  fallbackUsed = false;
  /**
   * Create PipelineService
   * @param spawnFn - Optional spawn function for dependency injection (testing)
   */
  constructor(spawnFn) {
    super();
    this.spawnFn = spawnFn || import_child_process.spawn;
  }
  /**
   * Set the project root directory (used as cwd for spawned processes)
   */
  setWorkflowRoot(root) {
    this.workflowRoot = root;
  }
  /**
   * Get current pipeline state
   */
  getState() {
    return this.currentState;
  }
  /**
   * Get current stage being executed
   */
  getCurrentStage() {
    return this.currentStage;
  }
  /**
   * Get current agent
   */
  getCurrentAgent() {
    return this.currentAgent;
  }
  /**
   * Get current ticket ID
   */
  getCurrentTicket() {
    return this.currentTicket;
  }
  /**
   * Get retry count
   */
  getRetryCount() {
    return this.retryCount;
  }
  /**
   * Register state change listener
   */
  onStateChange(listener) {
    this.on("stateChange", listener);
    return this;
  }
  /**
   * Register log listener
   */
  onLog(listener) {
    this.on("log", listener);
    return this;
  }
  /**
   * Start pipeline execution
   */
  async start() {
    if (this.currentState === "running" /* Running */) {
      throw new Error("Pipeline is already running");
    }
    this.setState("running" /* Running */);
    this.stopping = false;
    this.retryCount = 0;
    this.fallbackUsed = false;
    this.currentStage = void 0;
    this.currentAgent = void 0;
    this.currentTicket = void 0;
    const args = ["run"];
    try {
      const env3 = { ...process.env };
      delete env3.CLAUDECODE;
      await vscode3.window.withProgress(
        {
          location: vscode3.ProgressLocation.Notification,
          title: "Pipeline",
          cancellable: true
        },
        async (progress, token) => {
          this.progress = progress;
          this.startTime = Date.now();
          this.completedStages = 0;
          token.onCancellationRequested(() => {
            this.emit("log", "[PIPELINE] Cancellation requested\n");
            this.stop();
          });
          this.progressCancellationToken = new vscode3.CancellationTokenSource();
          token.onCancellationRequested(() => {
            this.progressCancellationToken?.cancel();
          });
          this.reportProgress("Starting pipeline...", 0);
          this.spawnWithFallback("workflow", args, env3);
        }
      );
    } catch (error) {
      this.setState("error" /* Error */);
      throw error;
    }
  }
  /**
   * Spawn process with fallback to workflow-ai on ENOENT
   */
  spawnWithFallback(command, args, env3) {
    const child = this.spawnFn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: env3,
      cwd: this.workflowRoot,
      shell: process.platform === "win32"
    });
    this.childProcess = child;
    child.stdout?.on("data", (data) => {
      const output = data.toString();
      this.emit("log", output);
      this.parseStdout(output);
    });
    child.stderr?.on("data", (data) => {
      const output = data.toString();
      this.emit("log", `[ERROR] ${output}`);
    });
    child.on("close", (code) => {
      this.childProcess = null;
      this.emit("log", `[PIPELINE] Process exited with code: ${code}
`);
      if (this.progressCancellationToken) {
        this.progressCancellationToken.dispose();
        this.progressCancellationToken = void 0;
      }
      if (this.stopping) {
        this.stopping = false;
        return;
      }
      if (code === 0) {
        this.reportProgress("Pipeline completed", 100);
        this.setState("completed" /* Completed */);
      } else {
        this.reportProgress("Pipeline failed", 100);
        this.setState("error" /* Error */);
      }
    });
    child.on("error", (err) => {
      this.emit("log", `[PIPELINE] Spawn error: ${err.message} (code: ${err.code})
`);
      this.childProcess = null;
      if (this.progressCancellationToken) {
        this.progressCancellationToken.dispose();
        this.progressCancellationToken = void 0;
      }
      if (err.code === "ENOENT" && command === "workflow" && !this.fallbackUsed) {
        this.fallbackUsed = true;
        this.emit("log", "[PIPELINE] workflow not found, trying workflow-ai...\n");
        this.spawnWithFallback("workflow-ai", args, env3);
      } else {
        this.setState("error" /* Error */);
      }
    });
  }
  /**
   * Stop pipeline execution (graceful shutdown via SIGTERM)
   */
  stop() {
    if (!this.childProcess) {
      return;
    }
    this.stopping = true;
    const pid = this.childProcess.pid;
    if (process.platform === "win32" && pid) {
      try {
        (0, import_child_process.execSync)(`taskkill /pid ${pid} /T /F`, { stdio: "ignore" });
      } catch {
      }
    } else {
      this.childProcess.kill("SIGTERM");
    }
    this.childProcess = null;
    this.setState("idle" /* Idle */);
  }
  /**
   * Parse stdout for stage transitions and metadata
   */
  parseStdout(output) {
    const lines = output.split("\n");
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;
      const parsed = this.parseLine(trimmedLine);
      if (parsed.stage && (parsed.type === "goto" || parsed.type === "start")) {
        this.currentStage = parsed.stage;
      }
      if (parsed.type === "goto" && parsed.stage) {
        this.completedStages++;
        this.updateStageProgress(parsed.stage, parsed.elapsed);
      }
      if (parsed.agent) {
        this.currentAgent = parsed.agent;
      }
      if (parsed.ticket) {
        this.currentTicket = parsed.ticket;
      }
      if (parsed.retry !== void 0) {
        this.retryCount = parsed.retry;
      }
    }
  }
  /**
   * Parse a single line of stdout
   * 
   * Real CLI format:
   * [2024-01-01T12:00:00] [INFO] [stage-name] message
   * [2024-01-01T12:00:00] [INFO] [Runner] GOTO next-stage
   * [2024-01-01T12:00:00] [INFO] [Runner] START stage="X" agent="Y" skill="Z"
   * [2024-01-01T12:00:00] [WARN] [stage] RETRY stage="X" attempt=N/M
   */
  parseLine(line) {
    const clean = line.replace(/\x1b\[[0-9;]*m/g, "");
    const basePattern = /^\[(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2})\]\s+\[(\w+)\]\s+\[([^\]]+)\]\s+(.*)$/;
    const baseMatch = clean.match(basePattern);
    if (!baseMatch) {
      return this.parseLineLegacy(line);
    }
    const [, timestamp2, level, stage, message] = baseMatch;
    const gotoMatch = message.match(/^GOTO\s+([^\s(]+)(?:\s*\(elapsed:\s*([^)]+)\))?/);
    if (gotoMatch) {
      return {
        type: "goto",
        raw: line,
        timestamp: timestamp2,
        stage: gotoMatch[1],
        elapsed: gotoMatch[2]
      };
    }
    const startMatch = message.match(/^START(?:\s+stage="([^"]*)")?(?:\s+agent="([^"]*)")?(?:\s+skill="([^"]*)")?/);
    if (startMatch) {
      return {
        type: "start",
        raw: line,
        timestamp: timestamp2,
        stage: startMatch[1],
        agent: startMatch[2],
        skill: startMatch[3]
      };
    }
    const retryMatch = message.match(/^RETRY\s+stage="([^"]+)"\s+attempt=(\d+)\/(\d+)/);
    if (retryMatch) {
      return {
        type: "info",
        raw: line,
        timestamp: timestamp2,
        stage: retryMatch[1],
        retry: parseInt(retryMatch[2], 10),
        maxAttempts: parseInt(retryMatch[3], 10)
      };
    }
    if (level === "INFO") {
      return {
        type: "info",
        raw: line,
        timestamp: timestamp2,
        stage
      };
    }
    return {
      type: level.toLowerCase(),
      raw: line,
      timestamp: timestamp2,
      stage
    };
  }
  /**
   * Legacy parser for old format (fallback)
   */
  parseLineLegacy(line) {
    const gotoMatch = line.match(/\[GOTO\]\s+([^\s(]+)(?:\s*\(elapsed:\s*([^)]+)\))?/);
    if (gotoMatch) {
      return {
        type: "goto",
        raw: line,
        stage: gotoMatch[1],
        elapsed: gotoMatch[2]
      };
    }
    const infoMatch = line.match(/\[INFO\](?:\s+agent:\s*([^,]+))?(?:\s*,?\s*ticket:\s*([A-Z]+-\d+))?(?:\s*,?\s*retry:\s*(\d+)\/(\d+))?/);
    if (infoMatch) {
      return {
        type: "info",
        raw: line,
        agent: infoMatch[1]?.trim(),
        ticket: infoMatch[2],
        retry: infoMatch[3] ? parseInt(infoMatch[3], 10) : void 0,
        maxAttempts: infoMatch[4] ? parseInt(infoMatch[4], 10) : void 0
      };
    }
    const retryOnlyMatch = line.match(/\[INFO\]\s*retry:\s*(\d+)\/(\d+)/);
    if (retryOnlyMatch) {
      return {
        type: "info",
        raw: line,
        retry: parseInt(retryOnlyMatch[1], 10),
        maxAttempts: parseInt(retryOnlyMatch[2], 10)
      };
    }
    const ctxMatch = line.match(/\[CTX\]\s+([^:]+):\s*(.+)/);
    if (ctxMatch) {
      return {
        type: "ctx",
        raw: line,
        stage: ctxMatch[1].trim(),
        elapsed: ctxMatch[2].trim()
      };
    }
    return {
      type: "raw",
      raw: line
    };
  }
  /**
   * Update state and emit event
   */
  setState(newState) {
    if (this.currentState !== newState) {
      this.currentState = newState;
      this.emit("stateChange", newState);
    }
  }
  /**
   * Report progress to the progress bar
   */
  reportProgress(message, increment) {
    if (this.progress && !this.progressCancellationToken?.token.isCancellationRequested) {
      this.progress.report({ message, increment });
    }
  }
  /**
   * Update progress when transitioning to a new stage
   */
  updateStageProgress(stageName, elapsed) {
    const elapsedText = elapsed ? ` \u2022 ${elapsed}` : "";
    const timeText = this.startTime ? ` \u2022 ${(Date.now() - this.startTime) / 1e3}s` : "";
    const message = `Stage: ${stageName}${elapsedText}${timeText}`;
    this.reportProgress(message, 10);
  }
  /**
   * Dispose resources
   */
  dispose() {
    this.stop();
    this.removeAllListeners();
    if (this.progressCancellationToken) {
      this.progressCancellationToken.dispose();
      this.progressCancellationToken = void 0;
    }
  }
};

// src/ui/pipeline-tree-provider.ts
var PipelineTreeItem = class extends vscode4.TreeItem {
  constructor(label, collapsibleState, itemType, id) {
    super(label, collapsibleState);
    this.itemType = itemType;
    this.id = id;
    this.id = id;
  }
};
var PipelineRunTreeItem = class extends PipelineTreeItem {
  constructor(state, elapsed) {
    const label = getPipelineRunLabel(state);
    super(
      label,
      vscode4.TreeItemCollapsibleState.Expanded,
      "pipeline-run",
      "pipeline-run"
    );
    this.state = state;
    this.elapsed = elapsed;
    this.description = elapsed ? `Elapsed: ${elapsed}` : "";
    this.tooltip = createPipelineRunTooltip(state, elapsed);
    this.iconPath = getPipelineStateIcon(state);
    this.contextValue = "pipeline-run";
  }
};
var CurrentStageTreeItem = class extends PipelineTreeItem {
  constructor(stage, agent, fallbackAgent, skill, ticket, attempt, maxAttempts) {
    super(
      stage,
      vscode4.TreeItemCollapsibleState.None,
      "current-stage",
      "current-stage"
    );
    this.stage = stage;
    this.agent = agent;
    this.fallbackAgent = fallbackAgent;
    this.skill = skill;
    this.ticket = ticket;
    this.attempt = attempt;
    this.maxAttempts = maxAttempts;
    this.iconPath = new vscode4.ThemeIcon("gear~spin");
    const agentInfo = agent ? `${vscode4.l10n.t("Agent")}: ${agent}` : "";
    const ticketInfo = ticket ? `${vscode4.l10n.t("Ticket")}: ${ticket}` : "";
    const attemptInfo = attempt && maxAttempts ? `${vscode4.l10n.t("Attempt")}: ${attempt}/${maxAttempts}` : "";
    this.description = [agentInfo, ticketInfo, attemptInfo].filter(Boolean).join(" | ");
    this.tooltip = createCurrentStageTooltip(
      stage,
      agent,
      fallbackAgent,
      skill,
      ticket,
      attempt,
      maxAttempts
    );
    this.contextValue = "current-stage";
  }
};
var CompletedStageTreeItem = class _CompletedStageTreeItem extends PipelineTreeItem {
  constructor(stage, elapsed, success) {
    const icon = success ? "\u2705" : "\u274C";
    const label = `${icon} ${stage}`;
    super(
      label,
      vscode4.TreeItemCollapsibleState.None,
      "completed-stage",
      `completed-stage-${_CompletedStageTreeItem.counter++}-${stage}`
    );
    this.stage = stage;
    this.elapsed = elapsed;
    this.success = success;
    this.description = elapsed ? `${vscode4.l10n.t("Elapsed")}: ${elapsed}` : "";
    this.tooltip = createCompletedStageTooltip(stage, elapsed, success);
    this.contextValue = "completed-stage";
  }
  static counter = 0;
};
var StatisticsTreeItem = class extends PipelineTreeItem {
  constructor(stagesStarted, retries, gotos) {
    super(
      "Statistics",
      vscode4.TreeItemCollapsibleState.Collapsed,
      "statistics",
      "statistics"
    );
    this.stagesStarted = stagesStarted;
    this.retries = retries;
    this.gotos = gotos;
    this.iconPath = new vscode4.ThemeIcon("graph");
    this.description = `${vscode4.l10n.t("Stages Started")}: ${stagesStarted} | ${vscode4.l10n.t("Retries")}: ${retries} | ${vscode4.l10n.t("Goto Transitions")}: ${gotos}`;
    this.tooltip = createStatisticsTooltip(stagesStarted, retries, gotos);
    this.contextValue = "statistics";
  }
};
var HistoryTreeItem = class extends PipelineTreeItem {
  constructor(history) {
    super(
      "History",
      vscode4.TreeItemCollapsibleState.Collapsed,
      "history",
      "history"
    );
    this.history = history;
    this.iconPath = new vscode4.ThemeIcon("history");
    this.description = history.length > 0 ? `${history.length} ${vscode4.l10n.t("runs")}` : vscode4.l10n.t("No runs yet");
    this.tooltip = createHistoryTooltip(history);
    this.contextValue = "history";
  }
};
var HistoryItemTreeItem = class extends PipelineTreeItem {
  constructor(entry) {
    const icon = entry.result === "success" ? "\u2705" : entry.result === "error" ? "\u274C" : "\u23F9\uFE0F";
    const label = `${icon} #${entry.runNumber}`;
    super(
      label,
      vscode4.TreeItemCollapsibleState.None,
      "history-item",
      `history-${entry.runNumber}`
    );
    this.entry = entry;
    this.description = entry.date;
    this.tooltip = createHistoryItemTooltip(entry);
    this.contextValue = "history-item";
  }
};
function getPipelineRunLabel(state) {
  const stateLabels = {
    ["idle" /* Idle */]: "Idle",
    ["running" /* Running */]: "Running",
    ["error" /* Error */]: "Error",
    ["completed" /* Completed */]: "Completed"
  };
  return stateLabels[state];
}
function getPipelineStateIcon(state) {
  switch (state) {
    case "idle" /* Idle */:
      return new vscode4.ThemeIcon("circle-outline");
    case "running" /* Running */:
      return new vscode4.ThemeIcon("loading~spin");
    case "error" /* Error */:
      return new vscode4.ThemeIcon("error", new vscode4.ThemeColor("notificationsErrorIcon.foreground"));
    case "completed" /* Completed */:
      return new vscode4.ThemeIcon("check", new vscode4.ThemeColor("terminal.ansiGreen"));
    default:
      return new vscode4.ThemeIcon("circle-outline");
  }
}
function createPipelineRunTooltip(state, elapsed) {
  const markdown = new vscode4.MarkdownString();
  markdown.isTrusted = true;
  markdown.appendMarkdown(`**${vscode4.l10n.t("Pipeline Run")}**

`);
  markdown.appendMarkdown(`| ${vscode4.l10n.t("Field")} | ${vscode4.l10n.t("Value")} |
`);
  markdown.appendMarkdown(`|-------|-------|
`);
  markdown.appendMarkdown(`| **${vscode4.l10n.t("State")}** | ${state} |
`);
  if (elapsed) {
    markdown.appendMarkdown(`| **${vscode4.l10n.t("Elapsed")}** | ${elapsed} |
`);
  }
  return markdown;
}
function createCurrentStageTooltip(stage, agent, fallbackAgent, skill, ticket, attempt, maxAttempts) {
  const markdown = new vscode4.MarkdownString();
  markdown.isTrusted = true;
  markdown.appendMarkdown(`**${vscode4.l10n.t("Current Stage")}: ${stage}**

`);
  markdown.appendMarkdown(`| ${vscode4.l10n.t("Field")} | ${vscode4.l10n.t("Value")} |
`);
  markdown.appendMarkdown(`|-------|-------|
`);
  if (agent) {
    markdown.appendMarkdown(`| **${vscode4.l10n.t("Agent")}** | ${agent} |
`);
  }
  if (fallbackAgent) {
    markdown.appendMarkdown(`| **${vscode4.l10n.t("Fallback Agent")}** | ${fallbackAgent} |
`);
  }
  if (skill) {
    markdown.appendMarkdown(`| **${vscode4.l10n.t("Skill")}** | ${skill} |
`);
  }
  if (ticket) {
    markdown.appendMarkdown(`| **${vscode4.l10n.t("Ticket")}** | ${ticket} |
`);
  }
  if (attempt !== void 0 && maxAttempts !== void 0) {
    markdown.appendMarkdown(`| **${vscode4.l10n.t("Attempt")}** | ${attempt}/${maxAttempts} |
`);
  }
  return markdown;
}
function createCompletedStageTooltip(stage, elapsed, success) {
  const markdown = new vscode4.MarkdownString();
  markdown.isTrusted = true;
  markdown.appendMarkdown(`**${vscode4.l10n.t("Completed Stage")}: ${stage}**

`);
  markdown.appendMarkdown(`| ${vscode4.l10n.t("Field")} | ${vscode4.l10n.t("Value")} |
`);
  markdown.appendMarkdown(`|-------|-------|
`);
  markdown.appendMarkdown(`| **${vscode4.l10n.t("Result")}** | ${success ? "\u2705 Success" : "\u274C Failed"} |
`);
  if (elapsed) {
    markdown.appendMarkdown(`| **${vscode4.l10n.t("Elapsed")}** | ${elapsed} |
`);
  }
  return markdown;
}
function createStatisticsTooltip(stagesStarted, retries, gotos) {
  const markdown = new vscode4.MarkdownString();
  markdown.isTrusted = true;
  markdown.appendMarkdown(`**${vscode4.l10n.t("Pipeline Statistics")}**

`);
  markdown.appendMarkdown(`| ${vscode4.l10n.t("Metric")} | ${vscode4.l10n.t("Count")} |
`);
  markdown.appendMarkdown(`|--------|-------|
`);
  markdown.appendMarkdown(`| **${vscode4.l10n.t("Stages Started")}** | ${stagesStarted} |
`);
  markdown.appendMarkdown(`| **${vscode4.l10n.t("Retries")}** | ${retries} |
`);
  markdown.appendMarkdown(`| **${vscode4.l10n.t("Goto Transitions")}** | ${gotos} |
`);
  return markdown;
}
function createHistoryTooltip(history) {
  const markdown = new vscode4.MarkdownString();
  markdown.isTrusted = true;
  markdown.appendMarkdown(`**${vscode4.l10n.t("Run History")}**

`);
  if (history.length === 0) {
    markdown.appendMarkdown(`_${vscode4.l10n.t("No runs yet")}_`);
  } else {
    markdown.appendMarkdown(`| # | ${vscode4.l10n.t("Date")} | ${vscode4.l10n.t("Result")} |
`);
    markdown.appendMarkdown(`|---|------|--------|
`);
    history.slice(0, 10).forEach((entry) => {
      const icon = entry.result === "success" ? "\u2705" : entry.result === "error" ? "\u274C" : "\u23F9\uFE0F";
      markdown.appendMarkdown(`| ${entry.runNumber} | ${entry.date} | ${icon} |
`);
    });
  }
  return markdown;
}
function createHistoryItemTooltip(entry) {
  const markdown = new vscode4.MarkdownString();
  markdown.isTrusted = true;
  markdown.appendMarkdown(`**${vscode4.l10n.t("Run")} ${entry.runNumber}**

`);
  markdown.appendMarkdown(`| ${vscode4.l10n.t("Field")} | ${vscode4.l10n.t("Value")} |
`);
  markdown.appendMarkdown(`|-------|-------|
`);
  markdown.appendMarkdown(`| **${vscode4.l10n.t("Date")}** | ${entry.date} |
`);
  markdown.appendMarkdown(`| **${vscode4.l10n.t("Result")}** | ${entry.result} |
`);
  return markdown;
}
var PipelineTreeProvider = class {
  constructor(store, pipelineService) {
    this.store = store;
    this.pipelineService = pipelineService || null;
    store.onDidChange((event) => {
      if (event.type === "config") {
        this.refresh();
      }
    });
  }
  _onDidChangeTreeData = new vscode4.EventEmitter();
  onDidChangeTreeData = this._onDidChangeTreeData.event;
  workflowRoot = null;
  pipelineService = null;
  outputChannel = null;
  listenersSetup = false;
  runHistory = [];
  runCounter = 0;
  // Statistics
  stagesStarted = 0;
  retries = 0;
  gotos = 0;
  // Current state tracking
  currentState = "idle" /* Idle */;
  currentStage;
  currentAgent;
  currentFallbackAgent;
  currentSkill;
  currentTicket;
  currentAttempt;
  currentMaxAttempts;
  elapsed;
  completedStages = [];
  /**
   * Set workflow root directory and initialize services
   */
  setWorkflowRoot(root) {
    this.workflowRoot = root;
    if (!this.pipelineService) {
      this.pipelineService = new PipelineService();
    }
    if (!this.outputChannel) {
      this.outputChannel = vscode4.window.createOutputChannel("WF: Pipeline");
    }
    this.setupPipelineListeners();
    this.refresh();
  }
  /**
   * Setup listeners for pipeline service events
   */
  setupPipelineListeners() {
    if (!this.pipelineService || this.listenersSetup) return;
    this.listenersSetup = true;
    this.pipelineService.onStateChange((state) => {
      this.currentState = state;
      if (state === "completed" /* Completed */ || state === "error" /* Error */) {
        this.runCounter++;
        this.runHistory.unshift({
          runNumber: this.runCounter,
          date: (/* @__PURE__ */ new Date()).toLocaleString(),
          result: state === "completed" /* Completed */ ? "success" : "error"
        });
        if (this.runHistory.length > 50) {
          this.runHistory = this.runHistory.slice(0, 50);
        }
      }
      this.refresh();
    });
    this.pipelineService.onLog((log) => {
      const timestamp2 = (/* @__PURE__ */ new Date()).toLocaleTimeString();
      const logEntry = `[${timestamp2}] ${log}`;
      if (this.outputChannel) {
        this.outputChannel.appendLine(logEntry);
      }
      let changed = false;
      const lines = log.split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed) {
          if (this.parseLogLine(trimmed)) {
            changed = true;
          }
        }
      }
      if (changed) {
        this.refresh();
      }
    });
  }
  /**
   * Parse a single log line to update stage tracking.
   * Returns true if any state changed (caller should refresh).
   *
   * Real CLI format:
   * [2024-01-01T12:00:00] [INFO] [stage-name] message
   * [2024-01-01T12:00:00] [INFO] [Runner] GOTO next-stage
   * [2024-01-01T12:00:00] [INFO] [Runner] START stage="X" agent="Y" skill="Z"
   * [2024-01-01T12:00:00] [WARN] [stage] RETRY stage="X" attempt=N/M
   */
  parseLogLine(line) {
    const clean = line.replace(/\x1b\[[0-9;]*m/g, "");
    const basePattern = /^\[(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2})\]\s+\[(\w+)\]\s+\[([^\]]+)\]\s+(.*)$/;
    const baseMatch = clean.match(basePattern);
    if (!baseMatch) {
      return this.parseLogLineLegacy(line);
    }
    const [, _timestamp, level, _stage, message] = baseMatch;
    const gotoMatch = message.match(/^GOTO\s+([^\s(]+)(?:\s*\(elapsed:\s*([^)]+)\))?/);
    if (gotoMatch) {
      this.gotos++;
      const gotoStage = gotoMatch[1];
      const elapsed = gotoMatch[2];
      if (this.currentStage) {
        this.completedStages.push({
          stage: this.currentStage,
          elapsed: this.elapsed,
          success: true
        });
      }
      this.currentStage = gotoStage;
      this.elapsed = elapsed;
      this.stagesStarted++;
      return true;
    }
    const startMatch = message.match(/^START(?:\s+stage="([^"]*)")?(?:\s+agent="([^"]*)")?(?:\s+skill="([^"]*)")?/);
    if (startMatch && (startMatch[1] || startMatch[2] || startMatch[3])) {
      if (startMatch[1]) this.currentStage = startMatch[1];
      if (startMatch[2]) this.currentAgent = startMatch[2];
      if (startMatch[3]) this.currentSkill = startMatch[3];
      return true;
    }
    const retryMatch = message.match(/^RETRY\s+stage="([^"]+)"\s+attempt=(\d+)\/(\d+)/);
    if (retryMatch) {
      this.currentStage = retryMatch[1];
      this.currentAttempt = parseInt(retryMatch[2], 10);
      this.currentMaxAttempts = parseInt(retryMatch[3], 10);
      this.retries++;
      return true;
    }
    if (level === "INFO") {
      let changed = false;
      const agentMatch = message.match(/agent:\s*([^,]+)/);
      const ticketMatch = message.match(/ticket:\s*([A-Z]+-\d+)/);
      const retryInfoMatch = message.match(/retry:\s*(\d+)\/(\d+)/);
      if (agentMatch) {
        this.currentAgent = agentMatch[1].trim();
        changed = true;
      }
      if (ticketMatch) {
        this.currentTicket = ticketMatch[1];
        changed = true;
      }
      if (retryInfoMatch) {
        this.currentAttempt = parseInt(retryInfoMatch[1], 10);
        this.currentMaxAttempts = parseInt(retryInfoMatch[2], 10);
        this.retries++;
        changed = true;
      }
      return changed;
    }
    return false;
  }
  /**
   * Legacy parser for old format (fallback).
   * Returns true if any state changed.
   */
  parseLogLineLegacy(line) {
    let changed = false;
    if (line.includes("[GOTO]")) {
      this.gotos++;
      const gotoMatch = line.match(/\[GOTO\]\s+([^\s(]+)(?:\s*\(elapsed:\s*([^)]+)\))?/);
      if (gotoMatch) {
        if (this.currentStage) {
          this.completedStages.push({
            stage: this.currentStage,
            elapsed: this.elapsed,
            success: true
          });
        }
        this.currentStage = gotoMatch[1];
        this.elapsed = gotoMatch[2];
        this.stagesStarted++;
        changed = true;
      }
    }
    if (line.includes("[INFO]")) {
      const infoMatch = line.match(/\[INFO\](?:\s+agent:\s*([^,]+))?(?:\s*,?\s*ticket:\s*([A-Z]+-\d+))?(?:\s*,?\s*retry:\s*(\d+)\/(\d+))?/);
      if (infoMatch) {
        if (infoMatch[1]) {
          this.currentAgent = infoMatch[1].trim();
          changed = true;
        }
        if (infoMatch[2]) {
          this.currentTicket = infoMatch[2];
          changed = true;
        }
        if (infoMatch[3]) {
          this.currentAttempt = parseInt(infoMatch[3], 10);
          this.currentMaxAttempts = parseInt(infoMatch[4], 10);
          this.retries++;
          changed = true;
        }
      }
      if (!changed) {
        const retryOnlyMatch = line.match(/\[INFO\]\s*retry:\s*(\d+)\/(\d+)/);
        if (retryOnlyMatch) {
          this.currentAttempt = parseInt(retryOnlyMatch[1], 10);
          this.currentMaxAttempts = parseInt(retryOnlyMatch[2], 10);
          this.retries++;
          changed = true;
        }
      }
    }
    if (line.includes("[CTX]")) {
      const ctxMatch = line.match(/\[CTX\]\s+([^:]+):\s*(.+)/);
      if (ctxMatch) {
        const key = ctxMatch[1].trim();
        const value = ctxMatch[2].trim();
        if (key.toLowerCase() === "skill") {
          this.currentSkill = value;
          changed = true;
        }
      }
    }
    return changed;
  }
  /**
   * Get pipeline service instance
   */
  getPipelineService() {
    return this.pipelineService;
  }
  /**
   * Get output channel instance
   */
  getOutputChannel() {
    return this.outputChannel;
  }
  /**
   * Refresh tree data
   */
  refresh() {
    this._onDidChangeTreeData.fire(void 0);
  }
  /**
   * Get tree item for element
   */
  getTreeItem(element) {
    return element;
  }
  /**
   * Get children for element
   */
  getChildren(element) {
    if (!this.workflowRoot) {
      return Promise.resolve([]);
    }
    if (!element) {
      return this.getRootItems();
    }
    if (element.itemType === "statistics") {
      const stats = element;
      const items = [];
      const addStat = (label, value, icon, id) => {
        const item = new PipelineTreeItem(
          `${label}: ${value}`,
          vscode4.TreeItemCollapsibleState.None,
          "statistics",
          id
        );
        item.iconPath = new vscode4.ThemeIcon(icon);
        items.push(item);
      };
      addStat(vscode4.l10n.t("Stages Started"), stats.stagesStarted, "play", "stat-stages");
      addStat(vscode4.l10n.t("Retries"), stats.retries, "refresh", "stat-retries");
      addStat(vscode4.l10n.t("Goto Transitions"), stats.gotos, "arrow-right", "stat-gotos");
      return Promise.resolve(items);
    }
    if (element.itemType === "history") {
      return Promise.resolve(
        this.runHistory.map((entry) => new HistoryItemTreeItem(entry))
      );
    }
    return Promise.resolve([]);
  }
  /**
   * Get root level items
   */
  getRootItems() {
    const items = [];
    items.push(new PipelineRunTreeItem(
      this.currentState,
      this.elapsed
    ));
    if (this.currentState === "running" /* Running */ && this.currentStage) {
      items.push(new CurrentStageTreeItem(
        this.currentStage,
        this.currentAgent,
        this.currentFallbackAgent,
        this.currentSkill,
        this.currentTicket,
        this.currentAttempt,
        this.currentMaxAttempts
      ));
    }
    for (let i = this.completedStages.length - 1; i >= 0; i--) {
      const info = this.completedStages[i];
      items.push(new CompletedStageTreeItem(info.stage, info.elapsed, info.success));
    }
    items.push(new StatisticsTreeItem(
      this.stagesStarted,
      this.retries,
      this.gotos
    ));
    items.push(new HistoryTreeItem(this.runHistory));
    return Promise.resolve(items);
  }
  /**
   * Start pipeline execution
   */
  async startPipeline() {
    if (!this.pipelineService) {
      vscode4.window.showErrorMessage(vscode4.l10n.t("Pipeline service not available"));
      return;
    }
    this.completedStages = [];
    this.currentStage = void 0;
    this.currentAgent = void 0;
    this.currentFallbackAgent = void 0;
    this.currentSkill = void 0;
    this.currentTicket = void 0;
    this.currentAttempt = void 0;
    this.currentMaxAttempts = void 0;
    this.elapsed = void 0;
    this.stagesStarted = 0;
    this.retries = 0;
    this.gotos = 0;
    try {
      await this.pipelineService.start();
      if (this.outputChannel) {
        this.outputChannel.show(true);
      }
      vscode4.window.showInformationMessage(vscode4.l10n.t("Pipeline started"));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      vscode4.window.showErrorMessage(vscode4.l10n.t("Failed to start pipeline: {0}", message));
    }
  }
  /**
   * Stop pipeline execution
   */
  stopPipeline() {
    if (!this.pipelineService) {
      vscode4.window.showErrorMessage(vscode4.l10n.t("Pipeline service not available"));
      return;
    }
    this.pipelineService.stop();
    vscode4.window.showInformationMessage(vscode4.l10n.t("Pipeline stopped"));
  }
  /**
   * Show output channel
   */
  showOutput() {
    if (this.outputChannel) {
      this.outputChannel.show();
    }
  }
  /**
   * Clear history
   */
  clearHistory() {
    this.runHistory = [];
    this.runCounter = 0;
    this.stagesStarted = 0;
    this.retries = 0;
    this.gotos = 0;
    this.completedStages = [];
    this.refresh();
    vscode4.window.showInformationMessage(vscode4.l10n.t("Pipeline history cleared"));
  }
  /**
   * Dispose resources
   */
  dispose() {
    if (this.pipelineService) {
      this.pipelineService.dispose();
    }
    if (this.outputChannel) {
      this.outputChannel.dispose();
    }
  }
};

// src/ui/diagnostic-provider.ts
var vscode7 = __toESM(require("vscode"));
var path5 = __toESM(require("path"));
var fs3 = __toESM(require("fs"));

// src/services/validation-service.ts
var vscode6 = __toESM(require("vscode"));
var import_ajv = __toESM(require_ajv());

// src/services/dependency-service.ts
var vscode5 = __toESM(require("vscode"));
var DependencyService = class {
  store;
  /**
   * Create DependencyService
   * @param store - WorkflowStore for data access
   */
  constructor(store) {
    this.store = store;
  }
  // ==================== Direct Dependencies ====================
  /**
   * Get tickets that a given ticket depends on
   * Reads from ticket.dependencies field
   *
   * @param id - Ticket ID
   * @returns Array of tickets that this ticket depends on
   */
  getDependencies(id) {
    const ticket = this.store.getTicketById(id);
    if (!ticket) {
      return [];
    }
    const dependencies = [];
    for (const depId of ticket.dependencies) {
      const depTicket = this.store.getTicketById(depId);
      if (depTicket) {
        dependencies.push(depTicket);
      }
    }
    return dependencies;
  }
  /**
   * Get tickets that depend on a given ticket (block it)
   * Finds all tickets where the given id is in their dependencies
   *
   * @param id - Ticket ID
   * @returns Array of tickets that depend on this ticket
   */
  getDependents(id) {
    const allTickets = this.store.getTickets();
    return allTickets.filter(
      (ticket) => ticket.dependencies.includes(id)
    );
  }
  // ==================== Transitive Dependencies ====================
  /**
   * Get full transitive chain of dependencies (BFS)
   * Returns all tickets that this ticket transitively depends on
   *
   * @param id - Ticket ID
   * @returns Array of all transitive dependencies (excludes starting ticket, no duplicates)
   */
  getTransitiveChain(id) {
    const ticket = this.store.getTicketById(id);
    if (!ticket) {
      return [];
    }
    const result = [];
    const visited = /* @__PURE__ */ new Set();
    const queue = [...ticket.dependencies];
    visited.add(id);
    while (queue.length > 0) {
      const currentId = queue.shift();
      if (visited.has(currentId)) {
        continue;
      }
      visited.add(currentId);
      const currentTicket = this.store.getTicketById(currentId);
      if (currentTicket) {
        result.push(currentTicket);
        for (const depId of currentTicket.dependencies) {
          if (!visited.has(depId)) {
            queue.push(depId);
          }
        }
      }
    }
    return result;
  }
  /**
   * Get full transitive chain of tickets that are blocked by this ticket
   * Returns all tickets that transitively depend on this ticket
   *
   * @param id - Ticket ID
   * @returns Array of all tickets in blocking chain (excludes starting ticket, no duplicates)
   */
  getBlockingChain(id) {
    const ticket = this.store.getTicketById(id);
    if (!ticket) {
      return [];
    }
    const result = [];
    const visited = /* @__PURE__ */ new Set();
    const queue = [];
    const directDependents = this.getDependents(id);
    for (const dep of directDependents) {
      queue.push(dep.id);
    }
    visited.add(id);
    while (queue.length > 0) {
      const currentId = queue.shift();
      if (visited.has(currentId)) {
        continue;
      }
      visited.add(currentId);
      const currentTicket = this.store.getTicketById(currentId);
      if (currentTicket) {
        result.push(currentTicket);
        const dependents = this.getDependents(currentId);
        for (const dep of dependents) {
          if (!visited.has(dep.id)) {
            queue.push(dep.id);
          }
        }
      }
    }
    return result;
  }
  // ==================== Cycle Detection ====================
  /**
   * Detect all cycles in the dependency graph
   * Uses DFS with coloring (white=0, gray=1, black=2)
   *
   * Algorithm:
   * 1. Start DFS from each unvisited (white) node
   * 2. Mark node as gray when entering (in current path)
   * 3. If we encounter a gray node, we found a cycle
   * 4. Mark node as black when leaving (completely visited)
   *
   * @returns Array of cyclic dependencies found
   */
  detectCycles() {
    const allTickets = this.store.getTickets();
    const colors = /* @__PURE__ */ new Map();
    const cycles = [];
    const foundCycles = /* @__PURE__ */ new Set();
    for (const ticket of allTickets) {
      colors.set(ticket.id, 0 /* White */);
    }
    for (const ticket of allTickets) {
      if (colors.get(ticket.id) === 0 /* White */) {
        this.dfsVisit(ticket.id, colors, cycles, foundCycles, []);
      }
    }
    return cycles;
  }
  /**
   * DFS visit helper for cycle detection
   *
   * @param id - Current ticket ID
   * @param colors - Map of node colors
   * @param cycles - Array to collect found cycles
   * @param foundCycles - Set of normalized cycle signatures to avoid duplicates
   * @param path - Current DFS path
   */
  dfsVisit(id, colors, cycles, foundCycles, path15) {
    colors.set(id, 1 /* Gray */);
    path15.push(id);
    const ticket = this.store.getTicketById(id);
    if (!ticket) {
      colors.set(id, 2 /* Black */);
      path15.pop();
      return;
    }
    for (const depId of ticket.dependencies) {
      const depColor = colors.get(depId) ?? 0 /* White */;
      if (depColor === 1 /* Gray */) {
        const cycleStart = path15.indexOf(depId);
        if (cycleStart !== -1) {
          const cycle = path15.slice(cycleStart);
          const normalizedCycle = this.normalizeCycle(cycle);
          const cycleSignature = normalizedCycle.join("->");
          if (!foundCycles.has(cycleSignature)) {
            foundCycles.add(cycleSignature);
            cycles.push({ cycle: normalizedCycle });
          }
        }
      } else if (depColor === 0 /* White */) {
        this.dfsVisit(depId, colors, cycles, foundCycles, path15);
      }
    }
    colors.set(id, 2 /* Black */);
    path15.pop();
  }
  /**
   * Normalize a cycle to start from the lexicographically smallest ID
   * This helps avoid detecting the same cycle multiple times
   *
   * @param cycle - Array of ticket IDs forming a cycle
   * @returns Normalized cycle array
   */
  normalizeCycle(cycle) {
    if (cycle.length === 0) {
      return cycle;
    }
    let minIndex = 0;
    for (let i = 1; i < cycle.length; i++) {
      if (cycle[i] < cycle[minIndex]) {
        minIndex = i;
      }
    }
    return [...cycle.slice(minIndex), ...cycle.slice(0, minIndex)];
  }
  // ==================== Readiness Check ====================
  /**
   * Check if a ticket can move to ready status
   * All direct dependencies must have status='done'
   *
   * @param id - Ticket ID to check
   * @returns Readiness result with ok flag and list of blocker IDs
   */
  canMoveToReady(id) {
    const ticket = this.store.getTicketById(id);
    if (!ticket) {
      return { ok: false, blockers: [vscode5.l10n.t("Ticket {0} not found in dependency check", id)] };
    }
    const blockers = [];
    for (const depId of ticket.dependencies) {
      const depTicket = this.store.getTicketById(depId);
      if (!depTicket) {
        blockers.push(vscode5.l10n.t('Dependency "{0}" does not exist', depId));
      } else if (depTicket.status !== "done" /* Done */) {
        blockers.push(depId);
      }
    }
    return {
      ok: blockers.length === 0,
      blockers
    };
  }
};

// src/services/validation-service.ts
var TICKET_SCHEMA = {
  type: "object",
  required: ["id", "title", "status", "priority", "type"],
  additionalProperties: true,
  properties: {
    id: {
      type: "string",
      pattern: "^[A-Z]+-\\d+$"
    },
    title: {
      type: "string",
      minLength: 1
    },
    status: {
      type: "string",
      enum: ["backlog", "ready", "in-progress", "blocked", "review", "done"]
    },
    priority: {
      type: "integer",
      minimum: 1,
      maximum: 5
    },
    type: {
      type: "string"
    },
    dependencies: {
      type: "array",
      items: { type: "string" }
    },
    conditions: {
      type: "array"
    },
    context: {
      type: "object"
    },
    tags: {
      type: "array",
      items: { type: "string" }
    },
    complexity: {
      type: "string"
    },
    parent_plan: {
      type: "string"
    },
    parent_task: {
      type: "string"
    },
    created_at: {
      type: "string"
    },
    updated_at: {
      type: "string"
    },
    completed_at: {
      type: "string"
    }
  }
};
var PIPELINE_SCHEMA2 = {
  type: "object",
  required: ["pipeline"],
  properties: {
    pipeline: {
      type: "object",
      required: ["agents", "stages", "entry_point"],
      properties: {
        name: { type: "string" },
        version: { type: "string" },
        agents: {
          type: "object",
          additionalProperties: {
            type: "object",
            required: ["command", "args"],
            properties: {
              command: { type: "string" },
              args: { type: "array", items: { type: "string" } },
              workdir: { type: "string" },
              description: { type: "string" }
            }
          }
        },
        stages: {
          type: "object",
          additionalProperties: {
            type: "object",
            required: ["description"],
            properties: {
              description: { type: "string" },
              agent: { type: "string" },
              fallback_agent: { type: "string" },
              skill: { type: "string" },
              type: { type: "string" },
              counter: { type: "string" },
              max: { type: "number" },
              timeout: { type: "number" },
              goto: {
                type: "object",
                additionalProperties: {
                  type: "object",
                  required: ["stage"],
                  properties: {
                    stage: { type: "string" },
                    params: { type: "object" }
                  }
                }
              }
            }
          }
        },
        entry: { type: "string" },
        entry_point: { type: "string" },
        context: { type: "object" },
        execution: {
          type: "object",
          required: ["max_steps", "delay_between_stages", "timeout_per_stage", "log_file"],
          properties: {
            max_steps: { type: "number" },
            delay_between_stages: { type: "number" },
            timeout_per_stage: { type: "number" },
            log_file: { type: "string" }
          }
        },
        protected_files: { type: "array", items: { type: "string" } }
      }
    }
  }
};
var ValidationService = class {
  ajv;
  store;
  dependencyService;
  configManager;
  ticketValidator = null;
  pipelineValidator = null;
  /**
   * Create ValidationService
   * @param store - WorkflowStore for data access
   */
  constructor(store) {
    this.store = store;
    this.ajv = new import_ajv.default({ allErrors: true, strict: false });
    this.dependencyService = new DependencyService(store);
    this.configManager = new ConfigManager();
  }
  /**
   * Initialize validators (load schemas)
   */
  initializeValidators() {
    if (!this.ticketValidator) {
      this.ticketValidator = this.ajv.compile(TICKET_SCHEMA);
    }
    if (!this.pipelineValidator) {
      this.pipelineValidator = this.ajv.compile(PIPELINE_SCHEMA2);
    }
  }
  // ==================== Ticket Validation ====================
  /**
   * Validate a ticket using JSON Schema + imperative rules
   *
   * @param uri - URI of the ticket file
   * @param ticket - Ticket object to validate
   * @returns Array of diagnostics
   */
  validateTicket(uri, ticket) {
    this.initializeValidators();
    const diagnostics = [];
    if (!ticket) {
      diagnostics.push(this.createDiagnostic(
        uri,
        vscode6.l10n.t("Ticket is undefined or could not be parsed"),
        vscode6.DiagnosticSeverity.Error,
        "ticket"
      ));
      return diagnostics;
    }
    if (this.ticketValidator) {
      const valid = this.ticketValidator(ticket);
      if (!valid && this.ticketValidator.errors) {
        const schemaErrors = this.formatAjvErrors(this.ticketValidator.errors, uri);
        diagnostics.push(...schemaErrors);
      }
    }
    const config = this.store.getConfig();
    if (config && config.task_types && !(ticket.type in config.task_types)) {
      diagnostics.push(this.createDiagnostic(
        uri,
        vscode6.l10n.t('Unknown task type "{0}". Valid types: {1}', ticket.type, Object.keys(config.task_types).join(", ")),
        vscode6.DiagnosticSeverity.Warning,
        "type"
      ));
    }
    const imperativeErrors = this.validateTicketImperative(ticket, uri);
    diagnostics.push(...imperativeErrors);
    return diagnostics;
  }
  /**
   * Imperative validation rules for tickets
   */
  validateTicketImperative(ticket, uri) {
    const diagnostics = [];
    const depErrors = this.validateDependencyRefs(ticket, uri);
    diagnostics.push(...depErrors);
    if (ticket.dependencies && ticket.dependencies.length > 0) {
      const cycleErrors = this.validateNoCycles(uri);
      diagnostics.push(...cycleErrors);
    }
    return diagnostics;
  }
  /**
   * Validate that all dependency IDs reference existing tickets
   */
  validateDependencyRefs(ticket, uri) {
    const diagnostics = [];
    for (const depId of ticket.dependencies) {
      const depTicket = this.store.getTicketById(depId);
      if (!depTicket) {
        diagnostics.push(this.createDiagnostic(
          uri,
          vscode6.l10n.t('Dependency "{0}" does not exist', depId),
          vscode6.DiagnosticSeverity.Error,
          "dependencies"
        ));
      }
    }
    return diagnostics;
  }
  /**
   * Validate no cycles in dependency graph
   */
  validateNoCycles(uri) {
    const diagnostics = [];
    const cycles = this.dependencyService.detectCycles();
    if (cycles.length > 0) {
      for (const cycle of cycles) {
        const cycleStr = cycle.cycle.join(" \u2192 ");
        diagnostics.push(this.createDiagnostic(
          uri,
          vscode6.l10n.t("Cyclic dependency detected: {0}", cycleStr),
          vscode6.DiagnosticSeverity.Error,
          "dependencies"
        ));
      }
    }
    return diagnostics;
  }
  // ==================== Pipeline Validation ====================
  /**
   * Validate pipeline configuration
   *
   * @param uri - URI of the pipeline file
   * @param config - PipelineConfig to validate
   * @returns Array of diagnostics
   */
  validatePipeline(uri, config) {
    this.initializeValidators();
    const diagnostics = [];
    if (this.pipelineValidator) {
      const valid = this.pipelineValidator(config);
      if (!valid && this.pipelineValidator.errors) {
        const schemaErrors = this.formatAjvErrors(this.pipelineValidator.errors, uri);
        diagnostics.push(...schemaErrors);
      }
    }
    const imperativeErrors = this.validatePipelineRefs(config, uri);
    diagnostics.push(...imperativeErrors);
    return diagnostics;
  }
  /**
   * Imperative validation rules for pipeline
   */
  validatePipelineRefs(config, uri) {
    const diagnostics = [];
    const pipeline = config.pipeline;
    const entryPoint = pipeline.entry_point || pipeline.entry;
    if (entryPoint && pipeline.stages) {
      if (!(entryPoint in pipeline.stages)) {
        diagnostics.push(this.createDiagnostic(
          uri,
          vscode6.l10n.t('Entry point "{0}" does not exist in stages', entryPoint),
          vscode6.DiagnosticSeverity.Error,
          "entry_point"
        ));
      }
    }
    if (pipeline.stages) {
      for (const [stageName, stage] of Object.entries(pipeline.stages)) {
        if (stage.goto) {
          for (const [gotoName, goto] of Object.entries(stage.goto)) {
            if (goto.stage && !(goto.stage in pipeline.stages)) {
              diagnostics.push(this.createDiagnostic(
                uri,
                vscode6.l10n.t('Stage "{0}" goto "{1}" references non-existent stage "{2}"', stageName, gotoName, goto.stage),
                vscode6.DiagnosticSeverity.Error,
                `stages.${stageName}.goto.${gotoName}`
              ));
            }
          }
        }
        if (stage.agent && pipeline.agents && !(stage.agent in pipeline.agents)) {
          diagnostics.push(this.createDiagnostic(
            uri,
            vscode6.l10n.t('Stage "{0}" references non-existent agent "{1}"', stageName, stage.agent),
            vscode6.DiagnosticSeverity.Error,
            `stages.${stageName}.agent`
          ));
        }
      }
    }
    return diagnostics;
  }
  // ==================== Config Validation ====================
  /**
   * Validate workflow configuration
   *
   * @param uri - URI of the config file
   * @param config - WorkflowConfig to validate
   * @returns Array of diagnostics
   */
  validateConfig(uri, config) {
    const diagnostics = [];
    if (!config.version) {
      diagnostics.push(this.createDiagnostic(
        uri,
        vscode6.l10n.t('Missing required field "{0}"', "version"),
        vscode6.DiagnosticSeverity.Error,
        "version"
      ));
    }
    if (!config.paths) {
      diagnostics.push(this.createDiagnostic(
        uri,
        vscode6.l10n.t('Missing required field "{0}"', "paths"),
        vscode6.DiagnosticSeverity.Error,
        "paths"
      ));
    } else {
      const requiredPaths = ["tickets", "plans", "reports", "archive"];
      for (const pathField of requiredPaths) {
        if (!(pathField in config.paths)) {
          diagnostics.push(this.createDiagnostic(
            uri,
            vscode6.l10n.t('Missing required path "{0}"', pathField),
            vscode6.DiagnosticSeverity.Error,
            `paths.${pathField}`
          ));
        }
      }
    }
    return diagnostics;
  }
  // ==================== Bulk Validation ====================
  /**
   * Validate all tickets and return diagnostics map
   *
   * @returns Map of file URI strings to diagnostics arrays
   */
  validateAll() {
    const result = /* @__PURE__ */ new Map();
    const workflowRoot = this.store.getWorkflowRoot();
    if (!workflowRoot) {
      return result;
    }
    const tickets = this.store.getTickets();
    for (const ticket of tickets) {
      const uri = vscode6.Uri.file(
        require("path").join(workflowRoot, ".workflow", "tickets", ticket.status, `${ticket.id}.md`)
      );
      const diagnostics = this.validateTicket(uri, ticket);
      if (diagnostics.length > 0) {
        result.set(uri.toString(), diagnostics);
      }
    }
    try {
      const pipeline = this.store.getPipeline();
      if (pipeline) {
        const pipelinePath = require("path").join(workflowRoot, ".workflow", "config", "pipeline.yaml");
        const uri = vscode6.Uri.file(pipelinePath);
        const diagnostics = this.validatePipeline(uri, pipeline);
        if (diagnostics.length > 0) {
          result.set(uri.toString(), diagnostics);
        }
      }
    } catch (error) {
    }
    try {
      const config = this.store.getConfig();
      if (config) {
        const configPath = require("path").join(workflowRoot, ".workflow", "config", "config.yaml");
        const uri = vscode6.Uri.file(configPath);
        const diagnostics = this.validateConfig(uri, config);
        if (diagnostics.length > 0) {
          result.set(uri.toString(), diagnostics);
        }
      }
    } catch (error) {
    }
    return result;
  }
  // ==================== Helper Methods ====================
  /**
   * Format AJV errors into vscode.Diagnostics
   */
  formatAjvErrors(errors, uri) {
    const diagnostics = [];
    for (const error of errors) {
      const message = this.formatAjvError(error);
      const field = error.instancePath.slice(1) || "root";
      diagnostics.push(this.createDiagnostic(
        uri,
        message,
        vscode6.DiagnosticSeverity.Error,
        field
      ));
    }
    return diagnostics;
  }
  /**
   * Format a single AJV error into human-readable message
   */
  formatAjvError(error) {
    const { keyword, params, message } = error;
    const field = error.instancePath.slice(1) || "root";
    switch (keyword) {
      case "required":
        return vscode6.l10n.t('Missing required field "{0}"', params.missingProperty);
      case "type":
        return vscode6.l10n.t('Field "{0}" must be of type {1}', field, params.type);
      case "pattern":
        return vscode6.l10n.t('Field "{0}" does not match required pattern', field);
      case "enum":
        return vscode6.l10n.t('Field "{0}" must be one of: {1}', field, params.allowedValues?.join(", "));
      case "minimum":
        return vscode6.l10n.t('Field "{0}" must be >= {1}', field, params.limit);
      case "maximum":
        return vscode6.l10n.t('Field "{0}" must be <= {1}', field, params.limit);
      case "minLength":
        return vscode6.l10n.t('Field "{0}" cannot be empty', field);
      default:
        return vscode6.l10n.t("Validation error: {0}", keyword);
    }
  }
  /**
   * Create a vscode.Diagnostic with the given parameters
   */
  createDiagnostic(uri, message, severity, field) {
    const range = new vscode6.Range(0, 0, 0, 0);
    const diagnostic = new vscode6.Diagnostic(range, message, severity);
    diagnostic.source = "workflow-ai";
    if (field) {
      diagnostic.code = field;
    }
    return diagnostic;
  }
};

// src/ui/diagnostic-provider.ts
var DebounceMap = class {
  timers = /* @__PURE__ */ new Map();
  /**
   * Debounce a function call by key
   */
  debounce(key, fn, delayMs) {
    const existingTimer = this.timers.get(key);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }
    const timer = setTimeout(() => {
      fn();
      this.timers.delete(key);
    }, delayMs);
    this.timers.set(key, timer);
  }
  /**
   * Clear all timers
   */
  clearAll() {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
  }
};
var DiagnosticProvider = class {
  /**
   * Create DiagnosticProvider
   * @param store - WorkflowStore for data access
   */
  constructor(store) {
    this.store = store;
    this.workflowRoot = store.getWorkflowRoot();
    this.validationService = new ValidationService(store);
    this.debounceMap = new DebounceMap();
    this.diagnosticCollection = vscode7.languages.createDiagnosticCollection("workflow");
    this.disposables.push(this.diagnosticCollection);
    this.registerFileWatchers();
    const storeDisposable = store.onDidChange((event) => {
      if (event.operation === "refresh") {
        this.validateAll();
      }
    });
    this.disposables.push({ dispose: () => storeDisposable });
    this.validateAll();
  }
  diagnosticCollection;
  validationService;
  debounceMap;
  disposables = [];
  workflowRoot;
  /**
   * Register file watchers for tickets, pipeline.yaml, and config.yaml
   */
  registerFileWatchers() {
    if (!this.workflowRoot) {
      return;
    }
    const ticketPattern = new vscode7.RelativePattern(
      path5.join(this.workflowRoot, ".workflow", "tickets"),
      "**/*.md"
    );
    const ticketWatcher = vscode7.workspace.createFileSystemWatcher(ticketPattern);
    this.disposables.push(
      ticketWatcher.onDidChange((uri) => this.onFileChanged(uri)),
      ticketWatcher.onDidCreate((uri) => this.onFileChanged(uri)),
      ticketWatcher.onDidDelete((uri) => this.onFileDeleted(uri)),
      ticketWatcher
    );
    const pipelineWatcher = vscode7.workspace.createFileSystemWatcher(
      new vscode7.RelativePattern(this.workflowRoot, ".workflow/config/pipeline.yaml")
    );
    this.disposables.push(
      pipelineWatcher.onDidChange((uri) => this.onFileChanged(uri)),
      pipelineWatcher.onDidCreate((uri) => this.onFileChanged(uri)),
      pipelineWatcher.onDidDelete((uri) => this.onFileDeleted(uri)),
      pipelineWatcher
    );
    const configWatcher = vscode7.workspace.createFileSystemWatcher(
      new vscode7.RelativePattern(this.workflowRoot, ".workflow/config/config.yaml")
    );
    this.disposables.push(
      configWatcher.onDidChange((uri) => this.onFileChanged(uri)),
      configWatcher.onDidCreate((uri) => this.onFileChanged(uri)),
      configWatcher.onDidDelete((uri) => this.onFileDeleted(uri)),
      configWatcher
    );
    const textDocumentChangeListener = vscode7.workspace.onDidChangeTextDocument((event) => {
      const uri = event.document.uri;
      if (this.isWorkflowFile(uri)) {
        this.onDocumentChanged(event.document);
      }
    });
    this.disposables.push(textDocumentChangeListener);
    const textDocumentOpenListener = vscode7.workspace.onDidOpenTextDocument((doc) => {
      if (this.isWorkflowFile(doc.uri)) {
        this.validateDocument(doc);
      }
    });
    this.disposables.push(textDocumentOpenListener);
    const textDocumentSaveListener = vscode7.workspace.onDidSaveTextDocument((doc) => {
      if (this.isWorkflowFile(doc.uri)) {
        this.validateDocument(doc);
      }
    });
    this.disposables.push(textDocumentSaveListener);
  }
  /**
   * Check if URI is a workflow file (ticket, pipeline, or config)
   */
  isWorkflowFile(uri) {
    const fsPath = uri.fsPath;
    if (!this.workflowRoot) {
      return false;
    }
    return fsPath.includes(path5.join(".workflow", "tickets")) || fsPath.endsWith(path5.join(".workflow", "config", "pipeline.yaml")) || fsPath.endsWith(path5.join(".workflow", "config", "config.yaml"));
  }
  /**
   * Handle file change event with debounce
   */
  onFileChanged(uri) {
    this.debounceMap.debounce(uri.toString(), () => {
      this.validateFile(uri);
    }, 300);
  }
  /**
   * Handle file save event
   */
  onFileSaved(uri) {
    this.debounceMap.debounce(uri.toString(), () => {
      this.validateFile(uri);
    }, 50);
  }
  /**
   * Handle document change event with debounce
   */
  onDocumentChanged(doc) {
    this.debounceMap.debounce(doc.uri.toString(), () => {
      this.validateDocument(doc);
    }, 300);
  }
  /**
   * Handle file deletion
   */
  onFileDeleted(uri) {
    this.diagnosticCollection.delete(uri);
  }
  /**
   * Validate a file by URI
   */
  validateFile(uri) {
    const document = vscode7.workspace.textDocuments.find(
      (doc) => doc.uri.toString() === uri.toString()
    );
    if (document) {
      this.validateDocument(document);
    } else {
      this.validateFileFromDisk(uri);
    }
  }
  /**
   * Validate a text document
   */
  validateDocument(doc) {
    const uri = doc.uri;
    const fsPath = doc.uri.fsPath;
    if (!this.workflowRoot) {
      return;
    }
    if (fsPath.endsWith(".md") && fsPath.includes(path5.join(".workflow", "tickets"))) {
      this.validateTicketDocument(uri, doc.getText());
    } else if (fsPath.endsWith(path5.join(".workflow", "config", "pipeline.yaml"))) {
      this.validatePipelineDocument(uri, doc.getText());
    } else if (fsPath.endsWith(path5.join(".workflow", "config", "config.yaml"))) {
      this.validateConfigDocument(uri, doc.getText());
    }
  }
  /**
   * Validate a file from disk (not open in editor)
   */
  validateFileFromDisk(uri) {
    try {
      const content = fs3.readFileSync(uri.fsPath, "utf-8");
      const fsPath = uri.fsPath;
      if (fsPath.endsWith(".md") && fsPath.includes(path5.join(".workflow", "tickets"))) {
        this.validateTicketDocument(uri, content);
      } else if (fsPath.endsWith(path5.join(".workflow", "config", "pipeline.yaml"))) {
        this.validatePipelineDocument(uri, content);
      } else if (fsPath.endsWith(path5.join(".workflow", "config", "config.yaml"))) {
        this.validateConfigDocument(uri, content);
      }
    } catch (error) {
      this.diagnosticCollection.delete(uri);
    }
  }
  /**
   * Validate a ticket document
   */
  validateTicketDocument(uri, content) {
    try {
      const { frontmatter } = parse(content);
      const diagnostics = this.validationService.validateTicket(uri, frontmatter);
      this.diagnosticCollection.set(uri, diagnostics);
    } catch (error) {
      const diagnostics = [
        new vscode7.Diagnostic(
          new vscode7.Range(0, 0, 0, 0),
          vscode7.l10n.t("Failed to parse ticket frontmatter: {0}", error.message),
          vscode7.DiagnosticSeverity.Error
        )
      ];
      diagnostics[0].source = "workflow-ai";
      this.diagnosticCollection.set(uri, diagnostics);
    }
  }
  /**
   * Validate a pipeline document
   */
  validatePipelineDocument(uri, content) {
    try {
      const config = load(content);
      const diagnostics = this.validationService.validatePipeline(uri, config);
      this.diagnosticCollection.set(uri, diagnostics);
    } catch (error) {
      const diagnostics = [
        new vscode7.Diagnostic(
          new vscode7.Range(0, 0, 0, 0),
          vscode7.l10n.t("Failed to parse pipeline YAML: {0}", error.message),
          vscode7.DiagnosticSeverity.Error
        )
      ];
      diagnostics[0].source = "workflow-ai";
      this.diagnosticCollection.set(uri, diagnostics);
    }
  }
  /**
   * Validate a config document
   */
  validateConfigDocument(uri, content) {
    try {
      const config = load(content);
      const diagnostics = this.validationService.validateConfig(uri, config);
      this.diagnosticCollection.set(uri, diagnostics);
    } catch (error) {
      const diagnostics = [
        new vscode7.Diagnostic(
          new vscode7.Range(0, 0, 0, 0),
          vscode7.l10n.t("Failed to parse config YAML: {0}", error.message),
          vscode7.DiagnosticSeverity.Error
        )
      ];
      diagnostics[0].source = "workflow-ai";
      this.diagnosticCollection.set(uri, diagnostics);
    }
  }
  /**
   * Validate all workflow files
   */
  validateAll() {
    if (!this.workflowRoot) {
      return;
    }
    const validationResults = this.validationService.validateAll();
    for (const [uriString, diagnostics] of validationResults.entries()) {
      const uri = vscode7.Uri.parse(uriString);
      this.diagnosticCollection.set(uri, diagnostics);
    }
  }
  /**
   * Clear all diagnostics
   */
  clearAll() {
    this.diagnosticCollection.clear();
  }
  /**
   * Dispose of resources
   */
  dispose() {
    this.debounceMap.clearAll();
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables.length = 0;
  }
};

// src/ui/document-link-provider.ts
var vscode8 = __toESM(require("vscode"));
var path6 = __toESM(require("path"));
var fs4 = __toESM(require("fs"));
var TicketDocumentLinkProvider = class {
  constructor(store) {
    this.store = store;
  }
  workflowRoot = null;
  /**
   * Set workflow root directory
   */
  setWorkflowRoot(root) {
    this.workflowRoot = root;
  }
  /**
   * Provide document links for a ticket .md file
   */
  provideDocumentLinks(document) {
    if (!this.workflowRoot) {
      return [];
    }
    const content = document.getText();
    const links = [];
    const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!frontmatterMatch) {
      return [];
    }
    const frontmatterText = frontmatterMatch[1];
    const lines = frontmatterText.split("\n");
    this.extractContextFilesLinks(lines, document, links);
    this.extractDependenciesLinks(lines, document, links);
    return links;
  }
  /**
   * Extract context.files links from frontmatter lines
   */
  extractContextFilesLinks(lines, document, links) {
    let inContextFiles = false;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i;
      if (line.trim().match(/^context:\s*$/)) {
        continue;
      }
      const filesMatch = line.match(/^\s+files:\s*$/);
      if (filesMatch) {
        inContextFiles = true;
        continue;
      }
      if (inContextFiles && line.match(/^\s+[a-z_]+:\s*/)) {
        inContextFiles = false;
        continue;
      }
      if (inContextFiles) {
        const pathMatch = line.match(/^\s+-\s+(.+?)\s*$/);
        if (pathMatch) {
          const filePath = pathMatch[1].trim();
          const charStart = line.indexOf(filePath);
          const charEnd = charStart + filePath.length;
          let targetUri;
          if (path6.isAbsolute(filePath)) {
            targetUri = vscode8.Uri.file(filePath);
          } else {
            targetUri = vscode8.Uri.file(path6.join(this.workflowRoot, filePath));
          }
          if (fs4.existsSync(targetUri.fsPath)) {
            const range = new vscode8.Range(lineNum, charStart, lineNum, charEnd);
            const link = new vscode8.DocumentLink(range, targetUri);
            link.tooltip = `Open file: ${filePath}`;
            links.push(link);
          }
        }
      }
    }
  }
  /**
   * Extract dependencies links from frontmatter lines
   */
  extractDependenciesLinks(lines, document, links) {
    let inDependencies = false;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i;
      const depsMatch = line.match(/^dependencies:\s*$/);
      if (depsMatch) {
        inDependencies = true;
        continue;
      }
      if (inDependencies && line.match(/^[a-z_]+:\s*/)) {
        inDependencies = false;
        continue;
      }
      if (inDependencies) {
        const idMatch = line.match(/^\s+-\s+([A-Z]+-\d+)\s*$/);
        if (idMatch) {
          const ticketId = idMatch[1];
          const charStart = line.indexOf(ticketId);
          const charEnd = charStart + ticketId.length;
          const ticket = this.store.getTicketById(ticketId);
          if (ticket) {
            const ticketPath = path6.join(
              this.workflowRoot,
              ".workflow",
              "tickets",
              ticket.status,
              `${ticketId}.md`
            );
            if (fs4.existsSync(ticketPath)) {
              const range = new vscode8.Range(lineNum, charStart, lineNum, charEnd);
              const targetUri = vscode8.Uri.file(ticketPath);
              const link = new vscode8.DocumentLink(range, targetUri);
              link.tooltip = `Open ticket: ${ticketId} - ${ticket.title}`;
              links.push(link);
            }
          }
        }
      }
    }
  }
};
var PipelineDocumentLinkProvider = class {
  constructor(store) {
    this.store = store;
  }
  workflowRoot = null;
  /**
   * Set workflow root directory
   */
  setWorkflowRoot(root) {
    this.workflowRoot = root;
  }
  /**
   * Provide document links for a pipeline.yaml file
   */
  provideDocumentLinks(document) {
    if (!this.workflowRoot) {
      return [];
    }
    const content = document.getText();
    const links = [];
    try {
      const config = load(content);
      if (!config?.pipeline?.stages) {
        return links;
      }
      const lines = content.split("\n");
      const stages = config.pipeline.stages;
      for (let lineNum = 0; lineNum < lines.length; lineNum++) {
        const line = lines[lineNum];
        this.extractSkillLinks(line, lineNum, stages, links);
        this.extractGotoStageLinks(line, lineNum, stages, document, links);
      }
    } catch (error) {
      console.error("Failed to parse pipeline.yaml for document links:", error);
    }
    return links;
  }
  /**
   * Extract skill links from a line
   */
  extractSkillLinks(line, lineNum, stages, links) {
    const skillMatch = line.match(/skill:\s*["']?([a-z0-9-_]+)["']?/i);
    if (!skillMatch) {
      return;
    }
    const skillId = skillMatch[1];
    const skillIndex = line.indexOf(`skill:`);
    const valueStart = skillIndex + skillMatch.index - skillIndex + "skill:".length;
    const valueMatch = line.substring(valueStart).match(/\s*["']?([a-z0-9-_]+)["']?/);
    if (!valueMatch) {
      return;
    }
    const actualStart = valueStart + valueMatch.index + valueMatch[0].indexOf(skillId);
    const actualEnd = actualStart + skillId.length;
    const skillPath = path6.join(
      this.workflowRoot,
      ".workflow",
      "src",
      "skills",
      skillId,
      "SKILL.md"
    );
    if (fs4.existsSync(skillPath)) {
      const range = new vscode8.Range(lineNum, actualStart, lineNum, actualEnd);
      const targetUri = vscode8.Uri.file(skillPath);
      const link = new vscode8.DocumentLink(range, targetUri);
      link.tooltip = `Open skill: ${skillId}`;
      links.push(link);
    }
  }
  /**
   * Extract stage reference links from a line
   * Matches `stage: <id>` nested under `goto:` block in pipeline.yaml
   */
  extractGotoStageLinks(line, lineNum, stages, document, links) {
    const stageMatch = line.match(/^\s{2,}stage:\s*["']?([a-z0-9-_]+)["']?/i);
    if (!stageMatch) {
      return;
    }
    const stageId = stageMatch[1];
    if (!stages[stageId]) {
      return;
    }
    const content = document.getText();
    const stageDefPattern = new RegExp(`^    ${stageId}:`, "m");
    const defMatch = stageDefPattern.exec(content);
    if (defMatch) {
      const textBeforeMatch = content.substring(0, defMatch.index);
      const targetLine = textBeforeMatch.split("\n").length - 1;
      const valueIndex = line.indexOf(stageId, line.indexOf("stage:"));
      const range = new vscode8.Range(lineNum, valueIndex, lineNum, valueIndex + stageId.length);
      const targetUri = document.uri.with({
        fragment: `L${targetLine + 1}`
      });
      const link = new vscode8.DocumentLink(range, targetUri);
      link.tooltip = `Go to stage: ${stageId}`;
      links.push(link);
    }
  }
};
var WorkflowDocumentLinkProvider = class {
  ticketProvider;
  pipelineProvider;
  constructor(store) {
    this.ticketProvider = new TicketDocumentLinkProvider(store);
    this.pipelineProvider = new PipelineDocumentLinkProvider(store);
  }
  /**
   * Set workflow root directory
   */
  setWorkflowRoot(root) {
    this.ticketProvider.setWorkflowRoot(root);
    this.pipelineProvider.setWorkflowRoot(root);
  }
  /**
   * Provide document links based on file type
   */
  provideDocumentLinks(document) {
    const fsPath = document.uri.fsPath;
    const normalizedPath = fsPath.replace(/\\/g, "/");
    if (normalizedPath.endsWith(".md") && normalizedPath.includes(".workflow/tickets/")) {
      return this.ticketProvider.provideDocumentLinks(document);
    }
    if (normalizedPath.endsWith(".workflow/config/pipeline.yaml") || normalizedPath.endsWith(".workflow/config/pipeline.yml")) {
      return this.pipelineProvider.provideDocumentLinks(document);
    }
    return [];
  }
};

// src/ui/codelens-provider.ts
var vscode10 = __toESM(require("vscode"));
var path8 = __toESM(require("path"));

// src/ui/pipeline-codelens-provider.ts
var vscode9 = __toESM(require("vscode"));
var path7 = __toESM(require("path"));
var PipelineCodeLensProvider = class {
  workflowRoot = null;
  _onDidChangeCodeLenses = new vscode9.EventEmitter();
  onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;
  /**
   * Set workflow root directory
   */
  setWorkflowRoot(root) {
    this.workflowRoot = root;
  }
  /**
   * Refresh code lenses when pipeline.yaml changes
   */
  refresh() {
    this._onDidChangeCodeLenses.fire();
  }
  /**
   * Provide CodeLenses for a pipeline.yaml file
   */
  provideCodeLenses(document) {
    if (!this.workflowRoot) {
      return [];
    }
    const fileName = path7.basename(document.fileName);
    if (fileName !== "pipeline.yaml") {
      return [];
    }
    const content = document.getText();
    const lenses = [];
    try {
      const config = load(content);
      if (!config?.pipeline?.stages) {
        return lenses;
      }
      const stages = config.pipeline.stages;
      const stageIds = Object.keys(stages);
      const totalStages = stageIds.length;
      stageIds.forEach((stageId, index) => {
        const stage = stages[stageId];
        if (!stage) {
          return;
        }
        const stagePosition = this.findStagePosition(content, stageId);
        if (!stagePosition) {
          return;
        }
        const stageInfoLens = this.createStageInfoLens(
          stagePosition,
          stageId,
          index + 1,
          totalStages,
          stage
        );
        if (stageInfoLens) {
          lenses.push(stageInfoLens);
        }
        const gotoLenses = this.createGotoLenses(stagePosition, stage);
        lenses.push(...gotoLenses);
      });
    } catch (error) {
      console.error("Failed to parse pipeline.yaml for code lenses:", error);
    }
    return lenses;
  }
  /**
   * Find the line number where a stage is defined
   * Uses regex to match stage-id: pattern
   */
  findStagePosition(content, stageId) {
    const escapedStageId = stageId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const stageRegex = new RegExp(`^\\s{4}${escapedStageId}:\\s*$`, "m");
    const match = stageRegex.exec(content);
    if (!match) {
      return null;
    }
    const textBeforeMatch = content.substring(0, match.index);
    const lineNumber = (textBeforeMatch.match(/\n/g) || []).length;
    return new vscode9.Position(lineNumber, 0);
  }
  /**
   * Create CodeLens with stage info
   * Format: Stage N/total | Agent: X | Skill: Y
   */
  createStageInfoLens(position, stageId, stageNum, totalStages, stage) {
    const range = new vscode9.Range(position, position);
    const agent = stage.agent || stage.fallback_agent || "N/A";
    const skill = stage.skill || "N/A";
    const title = `Stage ${stageNum}/${totalStages} | Agent: ${agent} | Skill: ${skill}`;
    const command = {
      title,
      command: "workflow.focusPipelineStage",
      arguments: [stageId]
    };
    return new vscode9.CodeLens(range, command);
  }
  /**
   * Create Goto CodeLenses for stage transitions
   * Format: Goto: passed->stage, failed->stage, default->stage
   */
  createGotoLenses(position, stage) {
    const lenses = [];
    const goto = stage.goto;
    if (!goto) {
      return lenses;
    }
    const range = new vscode9.Range(position, position);
    const transitions = [];
    Object.entries(goto).forEach(([status, target]) => {
      const targetStage = this.extractTargetStage(target);
      if (targetStage) {
        transitions.push(`${status}->${targetStage}`);
      }
    });
    if (transitions.length === 0) {
      return lenses;
    }
    const title = `Goto: ${transitions.join(", ")}`;
    const command = {
      title,
      command: "workflow.focusPipelineStage",
      arguments: [Object.keys(goto)[0]]
    };
    lenses.push(new vscode9.CodeLens(range, command));
    return lenses;
  }
  /**
   * Extract target stage from goto configuration
   * Supports both string and object formats:
   * - String: "stage-id"
   * - Object: { stage: "stage-id", params: {...} }
   */
  extractTargetStage(target) {
    if (typeof target === "string") {
      return target;
    }
    if (typeof target === "object" && target !== null) {
      return target.stage || null;
    }
    return null;
  }
};

// src/ui/codelens-provider.ts
var STATUS_ICONS = {
  ["backlog" /* Backlog */]: "\u{1F4CB}",
  ["ready" /* Ready */]: "\u2705",
  ["in-progress" /* InProgress */]: "\u{1F504}",
  ["review" /* Review */]: "\u{1F440}",
  ["blocked" /* Blocked */]: "\u{1F6AB}",
  ["done" /* Done */]: "\u2728"
};
var DEP_STATUS_ICONS = {
  ["backlog" /* Backlog */]: "\u2B1C",
  ["ready" /* Ready */]: "\u{1F535}",
  ["in-progress" /* InProgress */]: "\u{1F537}",
  ["review" /* Review */]: "\u{1F441}\uFE0F",
  ["blocked" /* Blocked */]: "\u{1F534}",
  ["done" /* Done */]: "\u2705"
};
var TicketCodeLensProvider = class {
  store;
  ticketService;
  dependencyService;
  workflowRoot = null;
  constructor(store, ticketService, dependencyService) {
    this.store = store;
    this.ticketService = ticketService;
    this.dependencyService = dependencyService;
  }
  /**
   * Set workflow root directory
   */
  setWorkflowRoot(root) {
    this.workflowRoot = root;
  }
  /**
   * Provide CodeLenses for a ticket .md file
   */
  provideCodeLenses(document) {
    if (!this.workflowRoot) {
      return [];
    }
    const content = document.getText();
    const lenses = [];
    const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!frontmatterMatch) {
      return [];
    }
    const frontmatterText = frontmatterMatch[1];
    const idMatch = frontmatterText.match(/^id:\s*["']?([A-Z]+-\d+)["']?/m);
    if (!idMatch) {
      return [];
    }
    const ticketId = idMatch[1];
    const ticket = this.store.getTicketById(ticketId);
    if (!ticket) {
      return [];
    }
    const statusLens = this.createStatusLens(document, ticket);
    if (statusLens) {
      lenses.push(statusLens);
    }
    const depsLenses = this.createDependenciesLenses(document, ticket);
    lenses.push(...depsLenses);
    const reviewLens = this.createReviewLens(document, frontmatterText);
    if (reviewLens) {
      lenses.push(reviewLens);
    }
    return lenses;
  }
  /**
   * Create CodeLens for status line with Move actions
   * Format: {status_icon} {status} | Move: [ready] [review] [done] [blocked]
   */
  createStatusLens(document, ticket) {
    const range = new vscode10.Range(0, 0, 0, 0);
    const statusIcon = STATUS_ICONS[ticket.status] || "\u{1F4C4}";
    const validTransitions = this.ticketService.getValidTransitions(ticket.status);
    const moveActions = validTransitions.map((status) => `[${status}]`).join(" ");
    const title = `${statusIcon} ${ticket.status} | ${vscode10.l10n.t("Move")}: ${moveActions}`;
    const command = {
      title,
      command: "workflow.moveTicket",
      arguments: [ticket.id]
    };
    return new vscode10.CodeLens(range, command);
  }
  /**
   * Create CodeLenses for dependencies and plan
   * Format: Deps: {dep1_id} {status_icon} | Blocks: {dep2_id} | Plan: {plan_id}
   */
  createDependenciesLenses(document, ticket) {
    const lenses = [];
    const range = new vscode10.Range(1, 0, 1, 0);
    const dependencies = this.dependencyService.getDependencies(ticket.id);
    const depsStr = dependencies.map((dep) => `${dep.id} ${DEP_STATUS_ICONS[dep.status] || "\u2B1C"}`).join(" ");
    const dependents = this.dependencyService.getDependents(ticket.id);
    const blocksStr = dependents.map((dep) => `${dep.id}`).join(" ");
    const planId = ticket.parent_plan || "";
    const parts = [];
    if (dependencies.length > 0) {
      parts.push(`${vscode10.l10n.t("Deps")}: ${depsStr}`);
    }
    if (dependents.length > 0) {
      parts.push(`${vscode10.l10n.t("Blocks")}: ${blocksStr}`);
    }
    if (planId) {
      parts.push(`${vscode10.l10n.t("Plan")}: ${planId}`);
    }
    if (parts.length === 0) {
      return lenses;
    }
    const title = parts.join(" | ");
    const command = {
      title,
      command: "workflow.showDependencies",
      arguments: [ticket.id]
    };
    lenses.push(new vscode10.CodeLens(range, command));
    return lenses;
  }
  /**
   * Create CodeLens for review status
   * Format: Review: ✅ passed (3/3) or Review: ❌ failed (1/3)
   */
  createReviewLens(document, frontmatterText) {
    const range = new vscode10.Range(2, 0, 2, 0);
    const content = document.getText();
    const bodyReviewMatch = content.match(/## Review[\s\S]*?\|.*\|/);
    if (!bodyReviewMatch) {
      return null;
    }
    const reviewTable = bodyReviewMatch[0];
    const lastReviewMatch = reviewTable.match(/\| ([^|]+) \| ([✅❌])\s*(passed|failed) \|/g);
    if (!lastReviewMatch || lastReviewMatch.length === 0) {
      return null;
    }
    const lastReview = lastReviewMatch[lastReviewMatch.length - 1];
    const statusMatch = lastReview.match(/([✅❌])\s*(passed|failed)/);
    if (!statusMatch) {
      return null;
    }
    const icon = statusMatch[1];
    const status = statusMatch[2];
    const totalReviews = lastReviewMatch.length;
    const passedReviews = lastReviewMatch.filter((r) => r.includes("\u2705")).length;
    const title = `${vscode10.l10n.t("Review")}: ${icon} ${status} (${passedReviews}/${totalReviews})`;
    const command = {
      title,
      command: "workflow.gotoReviewSection"
    };
    return new vscode10.CodeLens(range, command);
  }
};
var ConfigCodeLensProvider = class {
  workflowRoot = null;
  _onDidChangeCodeLenses = new vscode10.EventEmitter();
  onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;
  /**
   * Set workflow root directory
   */
  setWorkflowRoot(root) {
    this.workflowRoot = root;
  }
  /**
   * Refresh code lenses when config.yaml changes
   */
  refresh() {
    this._onDidChangeCodeLenses.fire();
  }
  /**
   * Provide CodeLenses for a config.yaml file
   */
  provideCodeLenses(document) {
    if (!this.workflowRoot) {
      return [];
    }
    const fileName = path8.basename(document.fileName);
    if (fileName !== "config.yaml") {
      return [];
    }
    const content = document.getText();
    const lenses = [];
    try {
      const config = load(content);
      if (!config) {
        return lenses;
      }
      const firstLine = new vscode10.Position(0, 0);
      const infoLens = this.createInfoLens(firstLine, config);
      if (infoLens) {
        lenses.push(infoLens);
      }
    } catch (error) {
      console.error("Failed to parse config.yaml for code lenses:", error);
    }
    return lenses;
  }
  /**
   * Create CodeLens with project info
   * Format: Project: {name} | {N} task types | {M} priorities
   */
  createInfoLens(position, config) {
    const range = new vscode10.Range(position, position);
    const projectName = config.project?.name || "Untitled";
    const taskTypesCount = Object.keys(config.task_types || {}).length;
    const prioritiesCount = Object.keys(config.priorities || {}).length;
    const title = `Project: ${projectName} | ${taskTypesCount} task types | ${prioritiesCount} priorities`;
    const command = {
      title,
      command: "workflow.openConfig"
    };
    return new vscode10.CodeLens(range, command);
  }
};
var WorkflowCodeLensProvider = class {
  ticketProvider;
  pipelineProvider;
  configProvider;
  constructor(store, ticketService, dependencyService) {
    this.ticketProvider = new TicketCodeLensProvider(
      store,
      ticketService,
      dependencyService
    );
    this.pipelineProvider = new PipelineCodeLensProvider();
    this.configProvider = new ConfigCodeLensProvider();
  }
  /**
   * Set workflow root directory
   */
  setWorkflowRoot(root) {
    this.ticketProvider.setWorkflowRoot(root);
    this.pipelineProvider.setWorkflowRoot(root);
    this.configProvider.setWorkflowRoot(root);
  }
  /**
   * Provide CodeLenses based on document type
   */
  provideCodeLenses(document) {
    const fileName = document.fileName;
    const normalizedPath = fileName.replace(/\\/g, "/");
    if (normalizedPath.includes(".workflow/tickets/") && normalizedPath.endsWith(".md")) {
      return this.ticketProvider.provideCodeLenses(document);
    }
    if (normalizedPath.includes(".workflow/config/pipeline.yaml")) {
      return this.pipelineProvider.provideCodeLenses(document);
    }
    if (normalizedPath.includes(".workflow/config/config.yaml")) {
      return this.configProvider.provideCodeLenses(document);
    }
    return [];
  }
};

// src/ui/completion-provider.ts
var vscode11 = __toESM(require("vscode"));
var STATUS_ICONS2 = {
  ["backlog" /* Backlog */]: "\u{1F4CB}",
  ["ready" /* Ready */]: "\u2705",
  ["in-progress" /* InProgress */]: "\u{1F504}",
  ["review" /* Review */]: "\u{1F440}",
  ["blocked" /* Blocked */]: "\u{1F6AB}",
  ["done" /* Done */]: "\u2728"
};
var TicketCompletionProvider = class {
  store;
  workflowRoot = null;
  constructor(store) {
    this.store = store;
  }
  /**
   * Set workflow root directory
   */
  setWorkflowRoot(root) {
    this.workflowRoot = root;
  }
  /**
   * Provide completions for a .md ticket file
   */
  provideCompletionItems(document, position) {
    if (!this.workflowRoot) {
      return void 0;
    }
    const line = document.lineAt(position).text;
    const lineText = line.substring(0, position.character);
    const inDependencies = this.isInField(lineText, "dependencies");
    const inConditions = this.isInField(lineText, "value");
    if (!inDependencies && !inConditions) {
      return void 0;
    }
    const tickets = this.store.getTickets();
    const currentTicketId = this.getCurrentTicketId(document);
    const items = [];
    for (const ticket of tickets) {
      if (ticket.id === currentTicketId) {
        continue;
      }
      const item = new vscode11.CompletionItem(ticket.id, vscode11.CompletionItemKind.Reference);
      item.detail = `${ticket.title} (${ticket.status})`;
      item.documentation = new vscode11.MarkdownString(
        `**${ticket.title}**

${vscode11.l10n.t("Status")}: ${STATUS_ICONS2[ticket.status]} ${ticket.status}

${vscode11.l10n.t("Priority")}: ${ticket.priority}`
      );
      item.sortText = ticket.id;
      items.push(item);
    }
    return items;
  }
  /**
   * Check if cursor is in a specific YAML field
   */
  isInField(lineText, fieldName) {
    const fieldPattern = new RegExp(`^\\s*${fieldName}\\s*:`, "i");
    const arrayItemPattern = new RegExp(`^\\s*-\\s*["']?${fieldName}`, "i");
    if (fieldPattern.test(lineText) || arrayItemPattern.test(lineText)) {
      return true;
    }
    if (/^\s*-\s*["']?[A-Z]+-\d+["']?\s*$/.test(lineText)) {
      return fieldName === "dependencies" || fieldName === "value";
    }
    return false;
  }
  /**
   * Get current ticket ID from document frontmatter
   */
  getCurrentTicketId(document) {
    const content = document.getText();
    const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!frontmatterMatch) {
      return null;
    }
    const frontmatterText = frontmatterMatch[1];
    const idMatch = frontmatterText.match(/^id:\s*["']?([A-Z]+-\d+)["']?/m);
    return idMatch ? idMatch[1] : null;
  }
};
var PipelineCompletionProvider = class {
  store;
  workflowRoot = null;
  constructor(store) {
    this.store = store;
  }
  /**
   * Set workflow root directory
   */
  setWorkflowRoot(root) {
    this.workflowRoot = root;
  }
  /**
   * Provide completions for a pipeline.yaml file
   */
  provideCompletionItems(document, position) {
    if (!this.workflowRoot) {
      return void 0;
    }
    const pipeline = this.store.getPipeline();
    if (!pipeline) {
      return void 0;
    }
    const line = document.lineAt(position).text;
    const lineText = line.substring(0, position.character);
    const stageMatch = lineText.match(/^\s*(goto:)?\s*stage:\s*/i);
    const agentMatch = lineText.match(/^\s*(agent|fallback_agent):\s*/i);
    const skillMatch = lineText.match(/^\s*skill:\s*/i);
    const items = [];
    if (stageMatch) {
      const stages = Object.entries(pipeline.pipeline.stages || {});
      for (const [stageId, stageConfig] of stages) {
        const item = new vscode11.CompletionItem(stageId, vscode11.CompletionItemKind.Class);
        item.detail = typeof stageConfig === "string" ? stageConfig : stageConfig.description || vscode11.l10n.t("Stage");
        item.documentation = this.createStageDocumentation(stageId, stageConfig);
        item.sortText = `1_${stageId}`;
        items.push(item);
      }
    } else if (agentMatch) {
      const agents = Object.entries(pipeline.pipeline.agents || {});
      for (const [agentId, agentConfig] of agents) {
        const item = new vscode11.CompletionItem(agentId, vscode11.CompletionItemKind.Module);
        const command = typeof agentConfig === "string" ? agentConfig : agentConfig.command;
        item.detail = command;
        item.documentation = this.createAgentDocumentation(agentId, agentConfig);
        item.sortText = `2_${agentId}`;
        items.push(item);
      }
    } else if (skillMatch) {
      const skills = this.extractSkillsFromPipeline(pipeline);
      for (const skillId of skills) {
        const item = new vscode11.CompletionItem(skillId, vscode11.CompletionItemKind.Method);
        item.detail = `${vscode11.l10n.t("Skill")}: ${skillId}`;
        item.documentation = new vscode11.MarkdownString(
          `**${vscode11.l10n.t("Skill")}: ${skillId}**

${vscode11.l10n.t("Located at")}: \`.workflow/src/skills/${skillId}/SKILL.md\``
        );
        item.sortText = `3_${skillId}`;
        items.push(item);
      }
    }
    return items.length > 0 ? items : void 0;
  }
  /**
   * Extract unique skill IDs from pipeline stages
   */
  extractSkillsFromPipeline(pipeline) {
    const skills = /* @__PURE__ */ new Set();
    const stages = pipeline.pipeline.stages || {};
    for (const [, stageConfig] of Object.entries(stages)) {
      if (typeof stageConfig === "object" && stageConfig !== null) {
        const config = stageConfig;
        if (config.skill) {
          skills.add(config.skill);
        }
      }
    }
    return Array.from(skills);
  }
  /**
   * Create Markdown documentation for a stage
   */
  createStageDocumentation(stageId, stageConfig) {
    const description = typeof stageConfig === "string" ? stageConfig : stageConfig.description || vscode11.l10n.t("No description");
    const doc = new vscode11.MarkdownString(`**${vscode11.l10n.t("Stage")}: ${stageId}**

${description}`);
    if (typeof stageConfig === "object" && stageConfig !== null) {
      if (stageConfig.agent) {
        doc.appendMarkdown(`

**${vscode11.l10n.t("Agent")}:** \`${stageConfig.agent}\``);
      }
      if (stageConfig.skill) {
        doc.appendMarkdown(`

**${vscode11.l10n.t("Skill")}:** \`${stageConfig.skill}\``);
      }
      if (stageConfig.type) {
        doc.appendMarkdown(`

**${vscode11.l10n.t("Type")}:** \`${stageConfig.type}\``);
      }
      if (stageConfig.goto) {
        doc.appendMarkdown(`

**${vscode11.l10n.t("Transitions")}:**`);
        for (const [trigger, target] of Object.entries(stageConfig.goto)) {
          const targetStage = typeof target === "string" ? target : target.stage;
          doc.appendMarkdown(`
- \`${trigger}\` \u2192 \`${targetStage}\``);
        }
      }
    }
    return doc;
  }
  /**
   * Create Markdown documentation for an agent
   */
  createAgentDocumentation(agentId, agentConfig) {
    const command = typeof agentConfig === "string" ? agentConfig : agentConfig.command;
    const args = typeof agentConfig === "object" && agentConfig !== null ? agentConfig.args || [] : [];
    const description = typeof agentConfig === "object" && agentConfig !== null ? agentConfig.description : void 0;
    const doc = new vscode11.MarkdownString(`**${vscode11.l10n.t("Agent")}: ${agentId}**

\`\`\`bash
${command} ${args.join(" ")}
\`\`\``);
    if (description) {
      doc.appendMarkdown(`

${description}`);
    }
    if (typeof agentConfig === "object" && agentConfig !== null && agentConfig.workdir) {
      doc.appendMarkdown(`

**${vscode11.l10n.t("Working Directory")}:** \`${agentConfig.workdir}\``);
    }
    return doc;
  }
};
var WorkflowCompletionProvider = class {
  ticketProvider;
  pipelineProvider;
  constructor(store) {
    this.ticketProvider = new TicketCompletionProvider(store);
    this.pipelineProvider = new PipelineCompletionProvider(store);
  }
  /**
   * Set workflow root directory
   */
  setWorkflowRoot(root) {
    this.ticketProvider.setWorkflowRoot(root);
    this.pipelineProvider.setWorkflowRoot(root);
  }
  /**
   * Provide completions based on document type
   */
  provideCompletionItems(document, position, token, context) {
    const fileName = document.fileName;
    const normalizedPath = fileName.replace(/\\/g, "/");
    if (normalizedPath.includes(".workflow/tickets/") && normalizedPath.endsWith(".md")) {
      return this.ticketProvider.provideCompletionItems(document, position);
    }
    if (fileName.endsWith("pipeline.yaml") || fileName.endsWith("pipeline.yml")) {
      return this.pipelineProvider.provideCompletionItems(document, position);
    }
    return void 0;
  }
};

// src/ui/hover-provider.ts
var vscode12 = __toESM(require("vscode"));
var STATUS_ICONS3 = {
  ["backlog" /* Backlog */]: "\u{1F4CB}",
  ["ready" /* Ready */]: "\u2705",
  ["in-progress" /* InProgress */]: "\u{1F504}",
  ["review" /* Review */]: "\u{1F440}",
  ["blocked" /* Blocked */]: "\u{1F6AB}",
  ["done" /* Done */]: "\u2728"
};
var PRIORITY_ICONS = {
  1: "\u{1F525}",
  2: "\u26A0\uFE0F",
  3: "\u{1F4CC}",
  4: "\u2139\uFE0F",
  5: "\u{1F4A1}"
};
var TYPE_ICONS = {
  IMPL: "\u{1F528}",
  FIX: "\u{1F41B}",
  DOCS: "\u{1F4C4}",
  REVIEW: "\u{1F50D}",
  ADMIN: "\u2699\uFE0F",
  ARCH: "\u{1F3D7}\uFE0F"
};
var COMPLEXITY_ICONS = {
  low: "\u{1F7E2}",
  medium: "\u{1F7E1}",
  high: "\u{1F534}"
};
var TicketHoverProvider = class {
  constructor(store) {
    this.store = store;
  }
  workflowRoot = null;
  /**
   * Set workflow root directory
   */
  setWorkflowRoot(root) {
    this.workflowRoot = root;
  }
  /**
   * Provide hover for a ticket ID
   */
  provideHover(document, position) {
    if (!this.workflowRoot) {
      return void 0;
    }
    const line = document.lineAt(position.line).text;
    const ticketId = this.extractTicketIdAtPosition(line, position.character);
    if (!ticketId) {
      return void 0;
    }
    const ticket = this.store.getTicketById(ticketId);
    if (!ticket) {
      return void 0;
    }
    const hoverContent = this.buildHoverContent(ticket);
    return new vscode12.Hover(hoverContent);
  }
  /**
   * Extract ticket ID at cursor position
   * Regex: \b[A-Z]+-\d+\b
   */
  extractTicketIdAtPosition(line, charPosition) {
    const ticketIdRegex = /\b([A-Z]+-\d+)\b/g;
    let match;
    while ((match = ticketIdRegex.exec(line)) !== null) {
      const start = match.index;
      const end = start + match[0].length;
      if (charPosition >= start && charPosition <= end) {
        return match[1];
      }
    }
    return null;
  }
  /**
   * Build MarkdownString hover content from ticket
   */
  buildHoverContent(ticket) {
    const statusIcon = STATUS_ICONS3[ticket.status] || "\u{1F4CB}";
    const priorityIcon = PRIORITY_ICONS[ticket.priority] || "\u{1F4CC}";
    const typeIcon = TYPE_ICONS[ticket.type?.toUpperCase()] || "\u{1F4DD}";
    const complexityIcon = COMPLEXITY_ICONS[ticket.complexity] || "\u{1F7E1}";
    const markdown = new vscode12.MarkdownString();
    markdown.isTrusted = true;
    markdown.supportHtml = true;
    markdown.appendMarkdown(`#### ${ticket.id}: ${ticket.title}

`);
    markdown.appendMarkdown(
      `**${vscode12.l10n.t("Status")}:** ${statusIcon} \`${ticket.status}\`  | **${vscode12.l10n.t("Priority")}:** ${priorityIcon} \`${ticket.priority}\`  | **${vscode12.l10n.t("Type")}:** ${typeIcon} \`${ticket.type}\`  | **${vscode12.l10n.t("Complexity")}:** ${complexityIcon} \`${ticket.complexity}\`

`
    );
    if (ticket.parent_plan) {
      markdown.appendMarkdown(`**${vscode12.l10n.t("Plan")}:** [${ticket.parent_plan}](command:workflow.openPlan?id=${ticket.parent_plan})  `);
    }
    if (ticket.dependencies && ticket.dependencies.length > 0) {
      const depsWithStatus = ticket.dependencies.map((depId) => {
        const depTicket = this.store.getTicketById(depId);
        const depStatusIcon = depTicket ? STATUS_ICONS3[depTicket.status] : "\u2B1C";
        return `${depId} ${depStatusIcon}`;
      });
      markdown.appendMarkdown(`**${vscode12.l10n.t("Deps")}:** ${depsWithStatus.join(", ")}

`);
    } else {
      markdown.appendMarkdown(`**${vscode12.l10n.t("Deps")}:** ${vscode12.l10n.t("No dependencies")}

`);
    }
    if (ticket.tags && ticket.tags.length > 0) {
      markdown.appendMarkdown(`**${vscode12.l10n.t("Tags")}:** ${ticket.tags.join(", ")}

`);
    }
    if (ticket.reviews && ticket.reviews.length > 0) {
      markdown.appendMarkdown(`**${vscode12.l10n.t("Review")}:**

`);
      markdown.appendMarkdown(`| ${vscode12.l10n.t("Date")} | ${vscode12.l10n.t("Status")} | ${vscode12.l10n.t("Summary")} |
|---|---|---|
`);
      for (const r of ticket.reviews) {
        const icon = r.status === "passed" ? "\u2705" : "\u274C";
        markdown.appendMarkdown(`| ${r.date} | ${icon} ${r.status} | ${r.summary} |
`);
      }
    }
    return markdown;
  }
};
var AgentHoverProvider = class {
  workflowRoot = null;
  agentsCache = /* @__PURE__ */ new Map();
  lastParsedFile = null;
  /**
   * Set workflow root directory
   */
  setWorkflowRoot(root) {
    this.workflowRoot = root;
    this.agentsCache.clear();
    this.lastParsedFile = null;
  }
  /**
   * Parse pipeline.yaml and extract agents definitions
   */
  parsePipelineYaml(document) {
    const fsPath = document.uri.fsPath;
    if (this.lastParsedFile === fsPath && this.agentsCache.size > 0) {
      return this.agentsCache;
    }
    try {
      const content = document.getText();
      const parsed = load(content);
      if (parsed?.pipeline?.agents) {
        this.agentsCache.clear();
        const agents = parsed.pipeline.agents;
        for (const [agentId, agentData] of Object.entries(agents)) {
          const data = agentData;
          this.agentsCache.set(agentId, {
            command: data.command || "",
            args: data.args || [],
            workdir: data.workdir || ".",
            description: data.description || ""
          });
        }
        this.lastParsedFile = fsPath;
      }
    } catch (error) {
      console.error("Failed to parse pipeline.yaml:", error);
      this.agentsCache.clear();
      this.lastParsedFile = null;
    }
    return this.agentsCache;
  }
  /**
   * Check if pipeline.yaml has agents section
   */
  hasAgents(document) {
    const agents = this.parsePipelineYaml(document);
    return agents.size > 0;
  }
  /**
   * Extract agent name at cursor position for agent: or fallback_agent:
   */
  extractAgentNameAtPosition(line, charPosition) {
    const agentValueRegex = /(agent|fallback_agent):\s*([a-zA-Z0-9_-]+)/g;
    let match;
    while ((match = agentValueRegex.exec(line)) !== null) {
      const fullMatchStart = match.index;
      const valueStart = fullMatchStart + match[1].length + 1;
      const valueEnd = fullMatchStart + match[0].length;
      const trimmedValueStart = line.indexOf(match[2], valueStart);
      const trimmedValueEnd = trimmedValueStart + match[2].length;
      if (charPosition >= trimmedValueStart && charPosition <= trimmedValueEnd) {
        return match[2];
      }
    }
    return null;
  }
  /**
   * Provide hover for agent values in pipeline.yaml
   */
  provideHover(document, position) {
    if (!this.workflowRoot) {
      return void 0;
    }
    const fsPath = document.uri.fsPath;
    if (!fsPath.endsWith("pipeline.yaml") && !fsPath.endsWith("pipeline.yml")) {
      return void 0;
    }
    const line = document.lineAt(position.line).text;
    const agentName = this.extractAgentNameAtPosition(line, position.character);
    if (!agentName) {
      return void 0;
    }
    const agents = this.parsePipelineYaml(document);
    const agent = agents.get(agentName);
    if (!agent) {
      return void 0;
    }
    const hoverContent = this.buildAgentHoverContent(agentName, agent);
    return new vscode12.Hover(hoverContent);
  }
  /**
   * Build MarkdownString hover content for agent
   */
  buildAgentHoverContent(agentId, agent) {
    const markdown = new vscode12.MarkdownString();
    markdown.isTrusted = true;
    markdown.supportHtml = true;
    markdown.appendMarkdown(`#### \u{1F916} ${agentId}

`);
    markdown.appendMarkdown(`**${vscode12.l10n.t("Command")}:** \`${agent.command}\`

`);
    if (agent.args && agent.args.length > 0) {
      markdown.appendMarkdown(`**${vscode12.l10n.t("Args")}:**
`);
      markdown.appendMarkdown("```json\n" + JSON.stringify(agent.args, null, 2) + "\n```\n\n");
    }
    if (agent.workdir) {
      markdown.appendMarkdown(`**${vscode12.l10n.t("Workdir")}:** \`${agent.workdir}\`

`);
    }
    if (agent.description) {
      markdown.appendMarkdown(`**${vscode12.l10n.t("Description")}:** ${agent.description}

`);
    }
    return markdown;
  }
};
var WorkflowHoverProvider = class {
  ticketProvider;
  agentProvider;
  constructor(store) {
    this.ticketProvider = new TicketHoverProvider(store);
    this.agentProvider = new AgentHoverProvider();
  }
  /**
   * Set workflow root directory
   */
  setWorkflowRoot(root) {
    this.ticketProvider.setWorkflowRoot(root);
    this.agentProvider.setWorkflowRoot(root);
  }
  /**
   * Provide hover for any supported file type
   */
  provideHover(document, position) {
    const fsPath = document.uri.fsPath;
    if (fsPath.endsWith("pipeline.yaml") || fsPath.endsWith("pipeline.yml")) {
      const agentHover = this.agentProvider.provideHover(document, position);
      if (agentHover) {
        return agentHover;
      }
      return this.ticketProvider.provideHover(document, position);
    }
    if (fsPath.endsWith(".md") || fsPath.endsWith(".yaml") || fsPath.endsWith(".yml")) {
      return this.ticketProvider.provideHover(document, position);
    }
    return void 0;
  }
};

// src/ui/status-bar.ts
var vscode13 = __toESM(require("vscode"));
var StatusBar = class {
  statusBarItem;
  pipelineService;
  store;
  disposables = [];
  /**
   * Create StatusBar controller
   * @param pipelineService - Service for pipeline state monitoring
   * @param store - Store for ticket data
   */
  constructor(pipelineService, store) {
    this.pipelineService = pipelineService;
    this.store = store;
    this.statusBarItem = vscode13.window.createStatusBarItem(
      vscode13.StatusBarAlignment.Left,
      100
      // High priority
    );
    this.statusBarItem.command = "workflow.statusBarClick";
    this.subscribeToEvents();
    this.render();
  }
  /**
   * Subscribe to pipeline and store events
   */
  subscribeToEvents() {
    this.pipelineService.onStateChange(() => {
      this.render();
    });
    const storeDisposable = this.store.onDidChange(() => {
      this.render();
    });
    this.disposables.push({ dispose: () => {
    } });
  }
  /**
   * Render status bar based on current state
   */
  render() {
    const pipelineState = this.pipelineService.getState();
    const currentStage = this.pipelineService.getCurrentStage();
    const currentAgent = this.pipelineService.getCurrentAgent();
    const currentTicket = this.pipelineService.getCurrentTicket();
    const retryCount = this.pipelineService.getRetryCount();
    const readyCount = this.store.getTicketsByStatus("ready" /* Ready */).length;
    const blockedCount = this.store.getTicketsByStatus("blocked" /* Blocked */).length;
    switch (pipelineState) {
      case "idle" /* Idle */:
        this.statusBarItem.text = `$(wf) ${vscode13.l10n.t("WF: Idle")}`;
        this.statusBarItem.tooltip = this.buildIdleTooltip(readyCount, blockedCount);
        this.statusBarItem.color = void 0;
        break;
      case "running" /* Running */:
        this.statusBarItem.text = this.buildRunningText(currentStage, currentTicket, retryCount);
        this.statusBarItem.tooltip = this.buildRunningTooltip(
          currentStage,
          currentAgent,
          currentTicket,
          retryCount,
          readyCount,
          blockedCount
        );
        this.statusBarItem.color = void 0;
        break;
      case "error" /* Error */:
        this.statusBarItem.text = `$(error) ${vscode13.l10n.t("WF: Error")}`;
        this.statusBarItem.tooltip = this.buildErrorTooltip(readyCount, blockedCount);
        this.statusBarItem.color = new vscode13.ThemeColor("statusBarItem.errorForeground");
        break;
      case "completed" /* Completed */:
        this.statusBarItem.text = `$(check) ${vscode13.l10n.t("WF: Completed")}`;
        this.statusBarItem.tooltip = this.buildCompletedTooltip(readyCount, blockedCount);
        this.statusBarItem.color = void 0;
        break;
    }
    this.statusBarItem.show();
  }
  /**
   * Build text for running state
   */
  buildRunningText(stage, ticket, retryCount) {
    const stageText = stage || vscode13.l10n.t("unknown");
    const ticketText = ticket ? `| ${ticket}` : "";
    const retryText = retryCount > 0 ? ` (retry: ${retryCount})` : "";
    return `$(loading~spin) ${vscode13.l10n.t("WF: Running")} | ${stageText}${ticketText}${retryText}`;
  }
  /**
   * Build tooltip for idle state
   */
  buildIdleTooltip(readyCount, blockedCount) {
    const tooltip = new vscode13.MarkdownString();
    tooltip.appendMarkdown(`**${vscode13.l10n.t("Workflow AI - Idle")}**

`);
    tooltip.appendMarkdown("---\n\n");
    tooltip.appendMarkdown(`**${vscode13.l10n.t("Ticket Counters")}**

`);
    tooltip.appendMarkdown(`- ${vscode13.l10n.t("Ready")}: ${readyCount}
`);
    tooltip.appendMarkdown(`- ${vscode13.l10n.t("Blocked")}: ${blockedCount}

`);
    tooltip.appendMarkdown(vscode13.l10n.t("Click to open command palette."));
    return tooltip;
  }
  /**
   * Build tooltip for running state
   */
  buildRunningTooltip(stage, agent, ticket, retryCount, readyCount, blockedCount) {
    const tooltip = new vscode13.MarkdownString();
    tooltip.appendMarkdown(`**${vscode13.l10n.t("Workflow AI - Running")}**

`);
    tooltip.appendMarkdown("---\n\n");
    tooltip.appendMarkdown(`**${vscode13.l10n.t("Current Execution")}**

`);
    if (stage) {
      tooltip.appendMarkdown(`- ${vscode13.l10n.t("Stage")}: \`${stage}\`
`);
    }
    if (agent) {
      tooltip.appendMarkdown(`- ${vscode13.l10n.t("Agent")}: \`${agent}\`
`);
    }
    if (ticket) {
      tooltip.appendMarkdown(`- ${vscode13.l10n.t("Ticket")}: \`${ticket}\`
`);
    }
    if (retryCount > 0) {
      tooltip.appendMarkdown(`- ${vscode13.l10n.t("Retry")}: ${retryCount}
`);
    }
    tooltip.appendMarkdown(`
**${vscode13.l10n.t("Ticket Counters")}**

`);
    tooltip.appendMarkdown(`- ${vscode13.l10n.t("Ready")}: ${readyCount}
`);
    tooltip.appendMarkdown(`- ${vscode13.l10n.t("Blocked")}: ${blockedCount}

`);
    tooltip.appendMarkdown(vscode13.l10n.t("Click to open command palette."));
    return tooltip;
  }
  /**
   * Build tooltip for error state
   */
  buildErrorTooltip(readyCount, blockedCount) {
    const tooltip = new vscode13.MarkdownString();
    tooltip.appendMarkdown(`**${vscode13.l10n.t("Workflow AI - Error")}**

`);
    tooltip.appendMarkdown(`$(error) ${vscode13.l10n.t("Pipeline execution failed")}

`);
    tooltip.appendMarkdown("---\n\n");
    tooltip.appendMarkdown(`**${vscode13.l10n.t("Ticket Counters")}**

`);
    tooltip.appendMarkdown(`- ${vscode13.l10n.t("Ready")}: ${readyCount}
`);
    tooltip.appendMarkdown(`- ${vscode13.l10n.t("Blocked")}: ${blockedCount}

`);
    tooltip.appendMarkdown(vscode13.l10n.t("Click to open command palette."));
    return tooltip;
  }
  /**
   * Build tooltip for completed state
   */
  buildCompletedTooltip(readyCount, blockedCount) {
    const tooltip = new vscode13.MarkdownString();
    tooltip.appendMarkdown(`**${vscode13.l10n.t("Workflow AI - Completed")}**

`);
    tooltip.appendMarkdown(`$(check) ${vscode13.l10n.t("Pipeline execution completed successfully")}

`);
    tooltip.appendMarkdown("---\n\n");
    tooltip.appendMarkdown(`**${vscode13.l10n.t("Ticket Counters")}**

`);
    tooltip.appendMarkdown(`- ${vscode13.l10n.t("Ready")}: ${readyCount}
`);
    tooltip.appendMarkdown(`- ${vscode13.l10n.t("Blocked")}: ${blockedCount}

`);
    tooltip.appendMarkdown(vscode13.l10n.t("Click to open command palette."));
    return tooltip;
  }
  /**
   * Show the status bar item
   */
  show() {
    this.statusBarItem.show();
  }
  /**
   * Hide the status bar item
   */
  hide() {
    this.statusBarItem.hide();
  }
  /**
   * Dispose resources
   */
  dispose() {
    this.statusBarItem.dispose();
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables.length = 0;
  }
};

// src/ui/notifications.ts
var vscode14 = __toESM(require("vscode"));
var path9 = __toESM(require("path"));
var NotificationsManager = class {
  store;
  pipelineService;
  workflowRoot = null;
  ticketStatusCache = /* @__PURE__ */ new Map();
  disposables = [];
  /**
   * Create NotificationsManager
   * @param store - WorkflowStore for ticket tracking
   * @param pipelineService - PipelineService for pipeline state tracking
   */
  constructor(store, pipelineService) {
    this.store = store;
    this.pipelineService = pipelineService;
  }
  /**
   * Initialize notifications - subscribe to all events
   */
  initialize() {
    this.store.onDidChange((event) => {
      if (event.type === "ticket" && event.operation === "add" && event.id) {
        const ticket = this.store.getTicketById(event.id);
        if (ticket) {
          this.ticketStatusCache.set(ticket.id, ticket.status);
        }
      }
      if (event.type === "ticket" && event.operation === "update") {
        this.handleTicketUpdate(event.id);
      }
    });
    this.pipelineService.onStateChange((state) => {
      this.handlePipelineStateChange(state);
    });
    this.initializeCache();
  }
  /**
   * Initialize ticket status cache from store
   */
  initializeCache() {
    const tickets = this.store.getTickets();
    for (const ticket of tickets) {
      this.ticketStatusCache.set(ticket.id, ticket.status);
    }
  }
  /**
   * Handle ticket update - detect transitions to done/blocked
   */
  handleTicketUpdate(ticketId) {
    const ticket = this.store.getTicketById(ticketId);
    if (!ticket) {
      return;
    }
    const previousStatus = this.ticketStatusCache.get(ticketId);
    const currentStatus = ticket.status;
    this.ticketStatusCache.set(ticketId, currentStatus);
    if (previousStatus && previousStatus !== currentStatus) {
      const transition = {
        ticketId,
        fromStatus: previousStatus,
        toStatus: currentStatus
      };
      this.handleTicketTransition(transition, ticket);
    }
  }
  /**
   * Handle ticket transition - show appropriate notification
   */
  handleTicketTransition(transition, ticket) {
    if (transition.toStatus === "done" /* Done */) {
      this.showTicketCompletedNotification(transition.ticketId, ticket);
    }
    if (transition.toStatus === "blocked" /* Blocked */) {
      this.showTicketBlockedNotification(transition.ticketId, ticket);
    }
  }
  /**
   * Handle pipeline state change - show notifications for error/completed
   */
  handlePipelineStateChange(state) {
    switch (state) {
      case "error" /* Error */:
        this.showPipelineErrorNotification();
        break;
      case "completed" /* Completed */:
        this.showPipelineCompletedNotification();
        break;
    }
  }
  /**
   * Show ticket completed notification
   * @param ticketId - Ticket ID
   * @param _ticket - Ticket data
   */
  showTicketCompletedNotification(ticketId, _ticket) {
    const message = vscode14.l10n.t("Ticket {0} completed", ticketId);
    vscode14.window.showInformationMessage(message, vscode14.l10n.t("Open")).then((selection) => {
      if (selection === "Open") {
        this.openTicketFile(ticketId, "done" /* Done */);
      }
    });
  }
  /**
   * Show ticket blocked notification
   * @param ticketId - Ticket ID
   * @param _ticket - Ticket data
   */
  showTicketBlockedNotification(ticketId, _ticket) {
    const message = vscode14.l10n.t("Ticket {0} is blocked", ticketId);
    vscode14.window.showWarningMessage(message, vscode14.l10n.t("Details")).then((selection) => {
      if (selection === "Details") {
        this.openTicketFile(ticketId, "blocked" /* Blocked */);
      }
    });
  }
  /**
   * Show pipeline error notification
   */
  showPipelineErrorNotification() {
    const message = vscode14.l10n.t("Pipeline error occurred");
    vscode14.window.showErrorMessage(message, vscode14.l10n.t("View Log")).then((selection) => {
      if (selection === "View Log") {
        this.showPipelineOutput();
      }
    });
  }
  /**
   * Show pipeline completed notification
   */
  showPipelineCompletedNotification() {
    const message = vscode14.l10n.t("Pipeline completed successfully");
    vscode14.window.showInformationMessage(message, vscode14.l10n.t("Report")).then((selection) => {
      if (selection === "Report") {
        this.openLatestReport();
      }
    });
  }
  /**
   * Open ticket file in editor
   */
  async openTicketFile(ticketId, status) {
    if (!this.workflowRoot) {
      vscode14.window.showErrorMessage(vscode14.l10n.t("Workflow root not available"));
      return;
    }
    const ticketPath = path9.join(
      this.workflowRoot,
      ".workflow",
      "tickets",
      status,
      `${ticketId}.md`
    );
    try {
      await vscode14.commands.executeCommand("vscode.open", vscode14.Uri.file(ticketPath));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      vscode14.window.showErrorMessage(vscode14.l10n.t("Failed to open ticket: {0}", message));
    }
  }
  /**
   * Show pipeline output channel
   */
  showPipelineOutput() {
    vscode14.commands.executeCommand("workflow.showPipelineOutput");
  }
  /**
   * Open latest report file
   */
  async openLatestReport() {
    if (!this.workflowRoot) {
      vscode14.window.showErrorMessage(vscode14.l10n.t("Workflow root not available"));
      return;
    }
    const reports = this.store.getReports();
    if (reports.length === 0) {
      vscode14.window.showInformationMessage(vscode14.l10n.t("No reports available"));
      return;
    }
    const latestReport = reports.filter((r) => r.created_at).sort((a, b) => {
      const dateA = new Date(a.created_at).getTime();
      const dateB = new Date(b.created_at).getTime();
      return dateB - dateA;
    })[0];
    if (!latestReport) {
      vscode14.window.showInformationMessage(vscode14.l10n.t("No reports with date available"));
      return;
    }
    const reportPath = path9.join(
      this.workflowRoot,
      ".workflow",
      "reports",
      `${latestReport.id}.md`
    );
    try {
      await vscode14.commands.executeCommand("vscode.open", vscode14.Uri.file(reportPath));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      vscode14.window.showErrorMessage(vscode14.l10n.t("Failed to open report: {0}", message));
    }
  }
  /**
   * Set workflow root directory
   */
  setWorkflowRoot(root) {
    this.workflowRoot = root;
  }
  /**
   * Dispose resources
   */
  dispose() {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];
  }
};

// src/services/ticket-service.ts
var vscode15 = __toESM(require("vscode"));
var fs5 = __toESM(require("fs/promises"));
var path10 = __toESM(require("path"));
var import_child_process2 = require("child_process");
var VALID_TRANSITIONS = {
  ["backlog" /* Backlog */]: ["ready" /* Ready */],
  ["ready" /* Ready */]: ["in-progress" /* InProgress */, "review" /* Review */, "backlog" /* Backlog */],
  ["in-progress" /* InProgress */]: ["review" /* Review */, "blocked" /* Blocked */, "done" /* Done */, "backlog" /* Backlog */],
  ["review" /* Review */]: ["done" /* Done */, "in-progress" /* InProgress */, "ready" /* Ready */, "blocked" /* Blocked */, "backlog" /* Backlog */],
  ["blocked" /* Blocked */]: ["ready" /* Ready */, "backlog" /* Backlog */],
  ["done" /* Done */]: ["backlog" /* Backlog */]
};
var TicketService = class {
  store;
  workflowRoot;
  spawnFn;
  /**
   * Create TicketService
   * @param store - WorkflowStore for data access
   * @param workflowRoot - Root directory of the workflow project
   * @param spawnFn - Optional spawn function for testing (defaults to child_process.spawn)
   */
  constructor(store, workflowRoot, spawnFn) {
    this.store = store;
    this.workflowRoot = workflowRoot;
    this.spawnFn = spawnFn || import_child_process2.spawn;
  }
  // ==================== Read Operations ====================
  /**
   * Get all tickets from the store
   */
  getAll() {
    return this.store.getTickets();
  }
  /**
   * Get tickets filtered by status
   */
  getByStatus(status) {
    return this.store.getTicketsByStatus(status);
  }
  /**
   * Get ticket by ID
   */
  getById(id) {
    return this.store.getTicketById(id);
  }
  /**
   * Get tickets filtered by parent plan
   */
  getByPlan(planId) {
    return this.getAll().filter((t) => t.parent_plan === planId);
  }
  /**
   * Get tickets filtered by type
   */
  getByType(type2) {
    return this.getAll().filter((t) => t.type === type2);
  }
  // ==================== State Machine ====================
  /**
   * Get valid transitions for a given status
   */
  getValidTransitions(currentStatus) {
    return VALID_TRANSITIONS[currentStatus] || [];
  }
  /**
   * Validate if a transition is allowed
   */
  isValidTransition(from, to) {
    const validTransitions = this.getValidTransitions(from);
    return validTransitions.includes(to);
  }
  // ==================== Create Operation ====================
  /**
   * Create a new ticket
   *
   * @param type - Ticket type (e.g., 'IMPL', 'FIX', 'ARCH')
   * @param title - Ticket title
   * @param fields - Optional fields to override
   * @returns Created ticket
   */
  async create(type2, title, fields) {
    const id = await this.generateTicketId(type2);
    const templatePath = path10.join(this.workflowRoot, "templates", "ticket-template.md");
    let templateContent;
    try {
      templateContent = await fs5.readFile(templatePath, "utf-8");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(vscode15.l10n.t("Failed to read ticket template: {0}", errorMessage));
    }
    const { frontmatter: templateFrontmatter, body } = parse(templateContent);
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const frontmatter = {
      id,
      title,
      status: "backlog",
      priority: 3,
      type: type2.toLowerCase(),
      required_capabilities: [],
      created_at: now,
      updated_at: now,
      completed_at: "",
      parent_plan: "",
      parent_task: "",
      dependencies: [],
      conditions: [],
      context: {
        files: [],
        references: [],
        notes: ""
      },
      complexity: "medium",
      tags: [],
      // Override with provided fields (these take precedence)
      ...fields
    };
    const content = serialize(frontmatter, body);
    const backlogDir = path10.join(this.workflowRoot, "tickets", "backlog");
    const filePath = path10.join(backlogDir, `${id}.md`);
    await fs5.mkdir(backlogDir, { recursive: true });
    await this.withOwnWrite(async () => {
      await fs5.writeFile(filePath, content, "utf-8");
    });
    const ticket = {
      id,
      title,
      status: "backlog" /* Backlog */,
      priority: frontmatter.priority || 3,
      type: frontmatter.type || type2.toLowerCase(),
      dependencies: frontmatter.dependencies || [],
      conditions: frontmatter.conditions || [],
      context: frontmatter.context || {},
      tags: frontmatter.tags || [],
      complexity: frontmatter.complexity || "medium",
      parent_plan: frontmatter.parent_plan || "",
      parent_task: frontmatter.parent_task || "",
      created_at: now,
      updated_at: now,
      completed_at: ""
    };
    this.store.addTicket(ticket);
    return ticket;
  }
  /**
   * Generate next sequential ticket ID for a given type
   */
  async generateTicketId(type2) {
    const allTickets = this.getAll();
    const typePrefix = type2.toUpperCase();
    let maxNum = 0;
    for (const ticket of allTickets) {
      const match = ticket.id.match(/^([A-Z]+)-(\d+)$/);
      if (match && match[1] === typePrefix) {
        const num = parseInt(match[2], 10);
        if (num > maxNum) {
          maxNum = num;
        }
      }
    }
    const nextNum = maxNum + 1;
    return `${typePrefix}-${String(nextNum).padStart(3, "0")}`;
  }
  // ==================== Move Operation ====================
  /**
   * Move a ticket to a new status
   *
   * @param id - Ticket ID to move
   * @param targetStatus - Target status
   * @throws Error if transition is invalid or file operation fails
   */
  async move(id, targetStatus) {
    const ticket = this.getById(id);
    if (!ticket) {
      throw new Error(vscode15.l10n.t("Ticket {0} not found", id));
    }
    if (!this.isValidTransition(ticket.status, targetStatus)) {
      throw new Error(
        vscode15.l10n.t("Invalid transition from {0} to {1}. Valid transitions: {2}", ticket.status, targetStatus, this.getValidTransitions(ticket.status).join(", "))
      );
    }
    await this.moveTicketDirect(id, ticket.status, targetStatus);
    const updatedTicket = {
      ...ticket,
      status: targetStatus,
      updated_at: (/* @__PURE__ */ new Date()).toISOString(),
      completed_at: targetStatus === "done" /* Done */ ? (/* @__PURE__ */ new Date()).toISOString() : ""
    };
    this.store.updateTicket(id, updatedTicket);
  }
  /**
   * Move a ticket directly via file system operations
   *
   * Reads the ticket file, updates frontmatter (status, updated_at),
   * and moves it to the target status directory.
   *
   * @param id - Ticket ID
   * @param currentStatus - Current ticket status
   * @param targetStatus - Target ticket status
   */
  async moveTicketDirect(id, currentStatus, targetStatus) {
    const sourcePath = path10.join(this.workflowRoot, "tickets", currentStatus, `${id}.md`);
    const targetDir = path10.join(this.workflowRoot, "tickets", targetStatus);
    const targetPath = path10.join(targetDir, `${id}.md`);
    let content;
    try {
      content = await fs5.readFile(sourcePath, "utf-8");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(vscode15.l10n.t("Failed to read ticket file: {0}", errorMessage));
    }
    const { frontmatter, body } = parse(content);
    const updatedFrontmatter = {
      ...frontmatter,
      status: targetStatus,
      updated_at: (/* @__PURE__ */ new Date()).toISOString()
    };
    if (targetStatus === "done" /* Done */) {
      updatedFrontmatter.completed_at = (/* @__PURE__ */ new Date()).toISOString();
    }
    const updatedContent = serialize(updatedFrontmatter, body);
    await fs5.mkdir(targetDir, { recursive: true });
    await this.withOwnWrite(async () => {
      await fs5.writeFile(targetPath, updatedContent, "utf-8");
    });
    await this.withOwnWrite(async () => {
      await fs5.unlink(sourcePath);
    });
  }
  // Flag to prevent file watcher from triggering on our own writes
  isOwnWrite = false;
  /**
   * Execute a write operation with isOwnWrite flag set
   */
  async withOwnWrite(operation) {
    this.isOwnWrite = true;
    try {
      return await operation();
    } finally {
      setTimeout(() => {
        this.isOwnWrite = false;
      }, 200);
    }
  }
  /**
   * Get the workflow root directory
   */
  getWorkflowRoot() {
    return this.workflowRoot;
  }
  // ==================== Update Operation ====================
  /**
   * Update ticket fields
   *
   * @param id - Ticket ID to update
   * @param fields - Fields to update
   */
  async update(id, fields) {
    const ticket = this.getById(id);
    if (!ticket) {
      throw new Error(vscode15.l10n.t("Ticket {0} not found", id));
    }
    const filePath = path10.join(
      this.workflowRoot,
      "tickets",
      ticket.status,
      `${id}.md`
    );
    let content;
    try {
      content = await fs5.readFile(filePath, "utf-8");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(vscode15.l10n.t("Failed to read ticket file: {0}", errorMessage));
    }
    const { frontmatter, body } = parse(content);
    const updatedFields = {
      ...frontmatter,
      ...fields,
      updated_at: (/* @__PURE__ */ new Date()).toISOString()
    };
    const updatedContent = serialize(updatedFields, body);
    await this.withOwnWrite(async () => {
      await fs5.writeFile(filePath, updatedContent, "utf-8");
    });
    const updatedTicket = {
      ...ticket,
      ...fields,
      updated_at: updatedFields.updated_at
    };
    this.store.updateTicket(id, updatedTicket);
  }
};

// src/services/file-watcher-service.ts
var vscode16 = __toESM(require("vscode"));
var path11 = __toESM(require("path"));
var FileWatcherService = class {
  store;
  workflowRoot;
  fileWatcher;
  debounceTimer;
  isOwnWrite = false;
  debounceDelay = 100;
  // ms
  /**
   * Create FileWatcherService
   * @param store - WorkflowStore to update on file changes
   * @param workflowRoot - Root directory of the workflow project
   */
  constructor(store, workflowRoot) {
    this.store = store;
    this.workflowRoot = workflowRoot;
    this.createWatcher();
  }
  /**
   * Create and configure FileSystemWatcher
   * Pattern: glob pattern for .workflow directory with md, yaml, yml extensions
   */
  createWatcher() {
    const pattern = new vscode16.RelativePattern(
      this.workflowRoot,
      "**/*.{md,yaml,yml}"
    );
    this.fileWatcher = vscode16.workspace.createFileSystemWatcher(
      pattern,
      false,
      // ignoreCreateEvents
      false,
      // ignoreChangeEvents
      false
      // ignoreDeleteEvents
    );
    this.fileWatcher.onDidCreate((uri) => this.handleFileCreate(uri));
    this.fileWatcher.onDidChange((uri) => this.handleFileChange(uri));
    this.fileWatcher.onDidDelete((uri) => this.handleFileDelete(uri));
  }
  /**
   * Schedule a debounced refresh
   * Resets timer on each call, executes after debounceDelay
   */
  scheduleRefresh() {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      this.performRefresh();
    }, this.debounceDelay);
  }
  /**
   * Perform the actual store refresh
   */
  async performRefresh() {
    try {
      await this.store.refresh(this.workflowRoot);
    } catch (error) {
      console.error("FileWatcherService: Failed to refresh store:", error);
    }
  }
  /**
   * Classify file change based on URI path
   * Maps file path to entity type and ID
   */
  classifyChange(uri) {
    const relativePath = path11.relative(this.workflowRoot, uri.fsPath);
    const pathParts = relativePath.split(path11.sep);
    if (pathParts[0] === "tickets" && pathParts.length >= 3) {
      const status = pathParts[1];
      const fileName = pathParts[2];
      const id = fileName.replace(".md", "");
      const validStatuses = Object.values(TicketStatus);
      if (validStatuses.includes(status)) {
        return { entityType: "ticket", id, status };
      }
    }
    if (pathParts[0] === "plans" && pathParts.length >= 3) {
      const fileName = pathParts[2];
      const id = fileName.replace(".md", "");
      return { entityType: "plan", id };
    }
    if (pathParts[0] === "reports" && pathParts.length >= 2) {
      const fileName = pathParts[1];
      const id = fileName.replace(".md", "");
      return { entityType: "report", id };
    }
    if (pathParts[0] === "config") {
      return { entityType: "config" };
    }
    return { entityType: "config" };
  }
  /**
   * Handle file creation event
   */
  handleFileCreate(uri) {
    if (this.isOwnWrite) {
      return;
    }
    const classification = this.classifyChange(uri);
    switch (classification.entityType) {
      case "ticket":
        this.scheduleRefresh();
        break;
      case "plan":
        this.scheduleRefresh();
        break;
      case "report":
        this.scheduleRefresh();
        break;
      case "config":
        this.scheduleRefresh();
        break;
    }
  }
  /**
   * Handle file change event
   */
  handleFileChange(uri) {
    if (this.isOwnWrite) {
      return;
    }
    const classification = this.classifyChange(uri);
    switch (classification.entityType) {
      case "ticket":
        if (classification.id) {
          this.scheduleRefresh();
        } else {
          this.scheduleRefresh();
        }
        break;
      case "plan":
      case "report":
      case "config":
        this.scheduleRefresh();
        break;
    }
  }
  /**
   * Handle file deletion event
   */
  handleFileDelete(uri) {
    if (this.isOwnWrite) {
      return;
    }
    const classification = this.classifyChange(uri);
    switch (classification.entityType) {
      case "ticket":
        if (classification.id) {
          this.store.removeTicket(classification.id);
        } else {
          this.scheduleRefresh();
        }
        break;
      case "plan":
        if (classification.id) {
          this.store.removePlan(classification.id);
        } else {
          this.scheduleRefresh();
        }
        break;
      case "report":
        this.scheduleRefresh();
        break;
      case "config":
        this.scheduleRefresh();
        break;
    }
  }
  /**
   * Execute a write operation with isOwnWrite flag set
   * Prevents the watcher from triggering on our own writes
   */
  async withOwnWrite(operation) {
    this.isOwnWrite = true;
    try {
      return await operation();
    } finally {
      setTimeout(() => {
        this.isOwnWrite = false;
      }, this.debounceDelay * 2);
    }
  }
  /**
   * Dispose of the file watcher
   * Cleans up resources when service is no longer needed
   */
  dispose() {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = void 0;
    }
    if (this.fileWatcher) {
      this.fileWatcher.dispose();
      this.fileWatcher = void 0;
    }
  }
};

// src/commands/new-ticket.ts
var vscode17 = __toESM(require("vscode"));
var path12 = __toESM(require("path"));
async function executeNewTicket(ticketService) {
  const type2 = await vscode17.window.showQuickPick(
    [
      { label: "IMPL", description: vscode17.l10n.t("Implementation task") },
      { label: "FIX", description: vscode17.l10n.t("Bug fix") },
      { label: "DOCS", description: vscode17.l10n.t("Documentation") },
      { label: "REVIEW", description: vscode17.l10n.t("Code review") },
      { label: "ARCH", description: vscode17.l10n.t("Architecture task") },
      { label: "ADMIN", description: vscode17.l10n.t("Administrative task") }
    ],
    {
      placeHolder: vscode17.l10n.t("Select ticket type"),
      title: vscode17.l10n.t("Create New Ticket")
    }
  );
  if (!type2) {
    return;
  }
  const title = await vscode17.window.showInputBox({
    prompt: vscode17.l10n.t("Enter ticket title"),
    placeHolder: vscode17.l10n.t("e.g., Add feature X"),
    title: vscode17.l10n.t("Create New Ticket"),
    validateInput: (value) => {
      if (!value || value.trim().length === 0) {
        return vscode17.l10n.t("Title is required");
      }
      return void 0;
    }
  });
  if (!title) {
    return;
  }
  try {
    const ticket = await ticketService.create(type2.label, title);
    vscode17.window.showInformationMessage(vscode17.l10n.t("Created ticket {0}: {1}", ticket.id, ticket.title));
    const workflowRoot = ticketService.getWorkflowRoot();
    if (workflowRoot) {
      const ticketPath = vscode17.Uri.file(
        path12.join(workflowRoot, "tickets", "backlog", `${ticket.id}.md`)
      );
      await vscode17.commands.executeCommand("vscode.open", ticketPath);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    vscode17.window.showErrorMessage(vscode17.l10n.t("Failed to create ticket: {0}", message));
  }
}

// src/commands/show-dependencies.ts
var vscode18 = __toESM(require("vscode"));
async function executeShowDependencies(store, dependencyService, ticketId) {
  if (!ticketId) {
    const editor = vscode18.window.activeTextEditor;
    if (editor) {
      const fileName = editor.document.fileName;
      const match = fileName.match(/\/([^\/]+)\.md$/);
      if (match) {
        ticketId = match[1];
      }
    }
  }
  if (!ticketId) {
    const tickets = store.getTickets();
    if (tickets.length === 0) {
      vscode18.window.showInformationMessage(vscode18.l10n.t("No tickets available"));
      return;
    }
    const selected2 = await vscode18.window.showQuickPick(
      tickets.map((t) => ({
        label: t.id,
        description: t.title,
        detail: vscode18.l10n.t("Status: {0}", t.status)
      })),
      {
        placeHolder: vscode18.l10n.t("Select ticket to show dependencies"),
        title: vscode18.l10n.t("Show Dependencies")
      }
    );
    if (!selected2) {
      return;
    }
    ticketId = selected2.label;
  }
  const ticket = store.getTicketById(ticketId);
  if (!ticket) {
    vscode18.window.showErrorMessage(vscode18.l10n.t("Ticket {0} not found", ticketId));
    return;
  }
  const dependencies = dependencyService.getDependencies(ticketId);
  const dependents = dependencyService.getDependents(ticketId);
  const chain = buildDependencyChain(ticketId, dependencyService);
  const depList = dependencies.length > 0 ? dependencies.map((d) => `- ${d.id}: ${d.title} (${d.status})`).join("\n") : vscode18.l10n.t("No dependencies");
  const blocksList = dependents.length > 0 ? dependents.map((d) => `- ${d.id}: ${d.title} (${d.status})`).join("\n") : vscode18.l10n.t("No tickets blocked by this one");
  const chainList = chain.length > 0 ? chain.map((id, index) => `${"  ".repeat(index)}\u2514\u2500 ${id}`).join("\n") : vscode18.l10n.t("No dependency chain");
  const items = [
    {
      label: `$(git-pull-request) ${ticketId}: ${ticket.title}`,
      description: "",
      detail: `${vscode18.l10n.t("Status")}: ${ticket.status} | ${vscode18.l10n.t("Priority")}: ${ticket.priority} | ${vscode18.l10n.t("Type")}: ${ticket.type}`
    },
    {
      label: "",
      description: "\u2500\u2500\u2500 Dependencies \u2500\u2500\u2500",
      detail: depList
    },
    {
      label: "",
      description: "\u2500\u2500\u2500 Blocks \u2500\u2500\u2500",
      detail: blocksList
    },
    {
      label: "",
      description: "\u2500\u2500\u2500 Chain \u2500\u2500\u2500",
      detail: chainList
    }
  ];
  const selected = await vscode18.window.showQuickPick(items, {
    placeHolder: vscode18.l10n.t("Dependencies for {0}", ticketId),
    title: vscode18.l10n.t("Ticket Dependencies"),
    matchOnDescription: false,
    matchOnDetail: false
  });
  if (selected && selected.label.startsWith("$(git-pull-request)")) {
    const openAction = await vscode18.window.showInformationMessage(
      vscode18.l10n.t("Open {0}?", ticketId),
      vscode18.l10n.t("Open")
    );
    if (openAction === "Open") {
      await vscode18.commands.executeCommand("workflow.openTicket", ticketId);
    }
  }
}
function buildDependencyChain(ticketId, dependencyService, visited = /* @__PURE__ */ new Set(), depth = 0) {
  if (visited.has(ticketId) || depth > 10) {
    return [];
  }
  visited.add(ticketId);
  const dependencies = dependencyService.getDependencies(ticketId);
  const dependents = dependencyService.getDependents(ticketId);
  const chain = [ticketId];
  for (const dep of dependencies) {
    const ancestorChain = buildDependencyChain(dep.id, dependencyService, visited, depth + 1);
    chain.unshift(...ancestorChain);
  }
  for (const dependent of dependents) {
    const descendantChain = buildDependencyChain(dependent.id, dependencyService, visited, depth + 1);
    chain.push(...descendantChain);
  }
  return chain;
}

// src/commands/show-statistics.ts
var vscode19 = __toESM(require("vscode"));
async function executeShowStatistics(store) {
  const tickets = store.getTickets();
  if (tickets.length === 0) {
    vscode19.window.showInformationMessage(vscode19.l10n.t("No tickets to analyze"));
    return;
  }
  const byStatus = calculateByStatus(tickets);
  const byType = calculateByType(tickets);
  const byPriority = calculateByPriority(tickets);
  const maxStatus = Math.max(...Object.values(byStatus), 1);
  const maxType = Math.max(...Object.values(byType), 1);
  const maxPriority = Math.max(...Object.values(byPriority), 1);
  const statusBars = buildAsciiBars(byStatus, maxStatus, 40);
  const typeBars = buildAsciiBars(byType, maxType, 40);
  const priorityBars = buildAsciiBars(byPriority, maxPriority, 40);
  const summary = [
    vscode19.l10n.t("\u{1F4CA} Workflow Statistics"),
    ``,
    vscode19.l10n.t("Total Tickets: {0}", tickets.length),
    ``,
    vscode19.l10n.t("\u2501\u2501\u2501 By Status \u2501\u2501\u2501"),
    ...statusBars,
    ``,
    vscode19.l10n.t("\u2501\u2501\u2501 By Type \u2501\u2501\u2501"),
    ...typeBars,
    ``,
    vscode19.l10n.t("\u2501\u2501\u2501 By Priority \u2501\u2501\u2501"),
    ...priorityBars
  ].join("\n");
  const items = [
    {
      label: `$(graph) ${vscode19.l10n.t("Statistics Summary")}`,
      description: "",
      detail: summary
    }
  ];
  await vscode19.window.showQuickPick(items, {
    placeHolder: vscode19.l10n.t("Statistics"),
    title: vscode19.l10n.t("Statistics"),
    matchOnDescription: false,
    matchOnDetail: false
  });
  const copyAction = await vscode19.window.showInformationMessage(
    vscode19.l10n.t("Copy statistics to clipboard?"),
    vscode19.l10n.t("Copy")
  );
  if (copyAction === "Copy") {
    await vscode19.env.clipboard.writeText(summary);
    vscode19.window.showInformationMessage(vscode19.l10n.t("Statistics copied to clipboard"));
  }
}
function calculateByStatus(tickets) {
  const result = {};
  const statusOrder = [
    "backlog" /* Backlog */,
    "ready" /* Ready */,
    "in-progress" /* InProgress */,
    "review" /* Review */,
    "blocked" /* Blocked */,
    "done" /* Done */
  ];
  for (const status of statusOrder) {
    result[status] = 0;
  }
  for (const ticket of tickets) {
    result[ticket.status] = (result[ticket.status] || 0) + 1;
  }
  return result;
}
function calculateByType(tickets) {
  const result = {};
  for (const ticket of tickets) {
    const type2 = ticket.type.toUpperCase();
    result[type2] = (result[type2] || 0) + 1;
  }
  return result;
}
function calculateByPriority(tickets) {
  const result = {};
  for (let i = 1; i <= 5; i++) {
    result[i.toString()] = 0;
  }
  for (const ticket of tickets) {
    const priority = ticket.priority.toString();
    result[priority] = (result[priority] || 0) + 1;
  }
  return result;
}
function buildAsciiBars(data, maxValue, maxWidth) {
  const bars = [];
  for (const [label, count] of Object.entries(data)) {
    const barLength = Math.round(count / maxValue * maxWidth);
    const bar = "\u2588".repeat(barLength);
    const percentage = (count / maxValue * 100).toFixed(0);
    bars.push(`${label.padEnd(12)} \u2502${bar.padEnd(maxWidth, "\u2591")}\u2502 ${count} (${percentage}%)`);
  }
  return bars;
}

// src/commands/index.ts
var vscode20 = __toESM(require("vscode"));
var path13 = __toESM(require("path"));
async function executeOpenPipelineConfig(workflowRoot) {
  if (!workflowRoot) {
    vscode20.window.showErrorMessage(vscode20.l10n.t("Workflow not found"));
    return;
  }
  const configPath = path13.join(workflowRoot, "config", "pipeline.yaml");
  const uri = vscode20.Uri.file(configPath);
  try {
    await vscode20.commands.executeCommand("vscode.open", uri);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    vscode20.window.showErrorMessage(vscode20.l10n.t("Failed to open pipeline config: {0}", message));
  }
}
async function executeOpenConfig(workflowRoot) {
  if (!workflowRoot) {
    vscode20.window.showErrorMessage(vscode20.l10n.t("Workflow not found"));
    return;
  }
  const configPath = path13.join(workflowRoot, "config", "config.yaml");
  const uri = vscode20.Uri.file(configPath);
  try {
    await vscode20.commands.executeCommand("vscode.open", uri);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    vscode20.window.showErrorMessage(vscode20.l10n.t("Failed to open config: {0}", message));
  }
}
async function executeFocusTicketsView() {
  await vscode20.commands.executeCommand("workbench.view.extension.workflow-sidebar");
  await vscode20.commands.executeCommand("workbench.action.focusSideBar");
}
async function executeFocusKanban() {
  await vscode20.commands.executeCommand("workbench.panel.workflow-kanban.view.wf-kanban-backlog");
}
async function executeRefreshAll(workflowRoot, store, refreshCallbacks) {
  if (workflowRoot) {
    await store.refresh(workflowRoot);
  }
  for (const refresh of refreshCallbacks) {
    refresh();
  }
  vscode20.window.showInformationMessage(vscode20.l10n.t("Workflow data refreshed"));
}
async function executeCopyTicketId(ticketId) {
  if (!ticketId) {
    const editor = vscode20.window.activeTextEditor;
    if (editor) {
      const fileName = editor.document.fileName;
      const match = fileName.match(/\/([^\/]+)\.md$/);
      if (match) {
        ticketId = match[1];
      }
    }
  }
  if (!ticketId) {
    vscode20.window.showErrorMessage(vscode20.l10n.t("No ticket ID provided or found"));
    return;
  }
  await vscode20.env.clipboard.writeText(ticketId);
  vscode20.window.showInformationMessage(vscode20.l10n.t("Copied {0} to clipboard", ticketId));
}
async function executeFilterTicketsByPlan(store, ticketsProvider) {
  const plans = store.getPlans();
  if (plans.length === 0) {
    vscode20.window.showInformationMessage(vscode20.l10n.t("No plans available"));
    return;
  }
  plans.sort((a, b) => a.id.localeCompare(b.id));
  const currentFilter = ticketsProvider.getPlanFilter();
  const planItems = plans.map((plan) => ({
    label: plan.id,
    description: plan.title,
    planId: plan.id,
    isCurrent: plan.folder === "current"
  }));
  const quickPickItems = currentFilter ? [{
    label: vscode20.l10n.t("$(clear-all) Clear Filter"),
    description: vscode20.l10n.t("Show all tickets"),
    planId: null,
    isCurrent: false
  }, ...planItems] : planItems;
  const selected = await vscode20.window.showQuickPick(quickPickItems, {
    placeHolder: vscode20.l10n.t("Select a plan to filter tickets"),
    title: vscode20.l10n.t("Filter Tickets by Plan"),
    matchOnDescription: true
  });
  if (!selected) {
    return;
  }
  ticketsProvider.setPlanFilter(selected.planId);
  if (selected.planId) {
    vscode20.window.showInformationMessage(
      vscode20.l10n.t("Filtered tickets by plan: {0}", selected.planId)
    );
  }
}

// src/extension.ts
var execAsync = (0, import_util.promisify)(import_child_process3.exec);
function resolveTicketId(arg) {
  if (typeof arg === "string") {
    return arg;
  }
  if (arg && typeof arg === "object") {
    const item = arg;
    if (item.ticket && typeof item.ticket === "object") {
      const ticket = item.ticket;
      if (typeof ticket.id === "string") {
        return ticket.id;
      }
    }
    if (typeof item.id === "string") {
      return item.id;
    }
  }
  return void 0;
}
async function checkCliInstalled() {
  try {
    const platform = process.platform;
    const config = vscode21.workspace.getConfiguration("workflow");
    const customCliPath = config.get("cliPath", "");
    if (customCliPath) {
      try {
        await execAsync(`"${customCliPath}" --version`);
        return true;
      } catch {
      }
    }
    if (platform === "win32") {
      try {
        await execAsync("where workflow");
        return true;
      } catch {
      }
      await execAsync("where workflow-ai");
    } else {
      try {
        await execAsync("which workflow");
        return true;
      } catch {
      }
      await execAsync("which workflow-ai");
    }
    return true;
  } catch {
    return false;
  }
}
function checkWorkflowDir() {
  const workspaceRoot = vscode21.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) {
    return false;
  }
  const workflowDir = path14.join(workspaceRoot, ".workflow");
  const configPath = path14.join(workflowDir, "config", "config.yaml");
  const pipelinePath = path14.join(workflowDir, "config", "pipeline.yaml");
  try {
    const dirExists = fs6.existsSync(workflowDir);
    const configExists = fs6.existsSync(configPath);
    const pipelineExists = fs6.existsSync(pipelinePath);
    return dirExists && configExists && pipelineExists;
  } catch {
    return false;
  }
}
async function setContextKey(key, value) {
  await vscode21.commands.executeCommand("setContext", key, value);
}
async function updateContextKeys(pipelineService) {
  const cliInstalled = await checkCliInstalled();
  const workflowFound = checkWorkflowDir();
  const pipelineRunning = pipelineService?.getState() === "running" /* Running */;
  await setContextKey("workflow.cliInstalled", cliInstalled);
  await setContextKey("workflow.workflowFound", workflowFound);
  await setContextKey("workflow.pipelineRunning", pipelineRunning);
}
async function installCli() {
  await vscode21.window.withProgress(
    {
      location: vscode21.ProgressLocation.Notification,
      title: "Installing workflow-ai CLI...",
      cancellable: false
    },
    async (progress) => {
      progress.report({ increment: 0 });
      try {
        await execAsync("npm install -g workflow-ai");
        progress.report({ increment: 100 });
        await updateContextKeys();
        vscode21.window.showInformationMessage(vscode21.l10n.t("workflow-ai CLI installed successfully!"));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        vscode21.window.showErrorMessage(vscode21.l10n.t("Failed to install workflow-ai CLI: {0}", message));
      }
    }
  );
}
async function initWorkflow() {
  await vscode21.window.withProgress(
    {
      location: vscode21.ProgressLocation.Notification,
      title: vscode21.l10n.t("Initializing Workflow..."),
      cancellable: false
    },
    async (progress) => {
      progress.report({ increment: 0 });
      try {
        const workspaceRoot = vscode21.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceRoot) {
          const open = vscode21.l10n.t("Open Folder");
          const result = await vscode21.window.showWarningMessage(
            vscode21.l10n.t("Please open a folder first to initialize Workflow."),
            open
          );
          if (result === open) {
            await vscode21.commands.executeCommand("vscode.openFolder");
          }
          return;
        }
        try {
          await execAsync("workflow init", { cwd: workspaceRoot });
        } catch (err) {
          if (err.code === "ENOENT") {
            await execAsync("workflow-ai init", { cwd: workspaceRoot });
          } else {
            throw err;
          }
        }
        progress.report({ increment: 100 });
        await updateContextKeys();
        vscode21.window.showInformationMessage(vscode21.l10n.t("Workflow initialized successfully!"));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        vscode21.window.showErrorMessage(vscode21.l10n.t("Failed to initialize workflow: {0}", message));
      }
    }
  );
}
async function activate(context) {
  const startTime = Date.now();
  console.log("Workflow AI extension is activating...");
  const registerCommandSafe = (command, callback) => {
    try {
      return vscode21.commands.registerCommand(command, callback);
    } catch (err) {
      console.warn(`Command ${command} already registered, skipping`);
      return { dispose: () => {
      } };
    }
  };
  await updateContextKeys();
  const store = new WorkflowStore();
  context.subscriptions.push({
    dispose: () => store.clear()
  });
  const workspaceRoot = vscode21.workspace.workspaceFolders?.[0]?.uri.fsPath;
  let workflowRoot = null;
  if (workspaceRoot && checkWorkflowDir()) {
    workflowRoot = path14.join(workspaceRoot, ".workflow");
    await store.refresh(workflowRoot).catch((err) => {
      console.error("Failed to refresh workflow store:", err);
    });
  }
  const ticketsProvider = new TicketsTreeProvider(store);
  const plansProvider = new PlansTreeProvider(store);
  const reportsProvider = new ReportsTreeProvider(store);
  const pipelineService = new PipelineService();
  pipelineService.on("stateChange", async () => {
    await updateContextKeys(pipelineService);
  });
  await updateContextKeys(pipelineService);
  const pipelineProvider = new PipelineTreeProvider(store, pipelineService);
  const skillsProvider = new SkillsTreeProvider(store);
  const logsProvider = new LogsTreeProvider(store);
  const kanbanProviders = createKanbanProviders(store);
  const statusBar = new StatusBar(pipelineService, store);
  const notificationsManager = new NotificationsManager(store, pipelineService);
  if (workflowRoot) {
    notificationsManager.setWorkflowRoot(workflowRoot);
  }
  notificationsManager.initialize();
  if (workflowRoot) {
    pipelineService.setWorkflowRoot(workflowRoot);
    ticketsProvider.setWorkflowRoot(workflowRoot);
    plansProvider.setWorkflowRoot(workflowRoot);
    reportsProvider.setWorkflowRoot(workflowRoot);
    pipelineProvider.setWorkflowRoot(workflowRoot);
    skillsProvider.setWorkflowRoot(workflowRoot);
    logsProvider.setWorkflowRoot(workflowRoot);
    kanbanProviders.backlog.setWorkflowRoot(workflowRoot);
    kanbanProviders.ready.setWorkflowRoot(workflowRoot);
    kanbanProviders.inProgress.setWorkflowRoot(workflowRoot);
    kanbanProviders.blocked.setWorkflowRoot(workflowRoot);
    kanbanProviders.review.setWorkflowRoot(workflowRoot);
    kanbanProviders.done.setWorkflowRoot(workflowRoot);
  }
  context.subscriptions.push(
    vscode21.window.registerTreeDataProvider("workflow-sidebar.tickets", ticketsProvider),
    vscode21.window.registerTreeDataProvider("workflow-sidebar.plans", plansProvider),
    vscode21.window.registerTreeDataProvider("workflow-sidebar.reports", reportsProvider),
    vscode21.window.registerTreeDataProvider("workflow-sidebar.skills", skillsProvider),
    vscode21.window.registerTreeDataProvider("workflow-sidebar.logs", logsProvider),
    vscode21.window.registerTreeDataProvider("workflow-sidebar.pipeline", pipelineProvider),
    statusBar,
    skillsProvider,
    logsProvider
  );
  const backlogTreeView = vscode21.window.createTreeView("wf-kanban-backlog", { treeDataProvider: kanbanProviders.backlog });
  const readyTreeView = vscode21.window.createTreeView("wf-kanban-ready", { treeDataProvider: kanbanProviders.ready });
  const inProgressTreeView = vscode21.window.createTreeView("wf-kanban-in-progress", { treeDataProvider: kanbanProviders.inProgress });
  const blockedTreeView = vscode21.window.createTreeView("wf-kanban-blocked", { treeDataProvider: kanbanProviders.blocked });
  const reviewTreeView = vscode21.window.createTreeView("wf-kanban-review", { treeDataProvider: kanbanProviders.review });
  const doneTreeView = vscode21.window.createTreeView("wf-kanban-done", { treeDataProvider: kanbanProviders.done });
  context.subscriptions.push(
    backlogTreeView,
    readyTreeView,
    inProgressTreeView,
    blockedTreeView,
    reviewTreeView,
    doneTreeView
  );
  const updateKanbanTitles = () => {
    backlogTreeView.title = `BACKLOG (${kanbanProviders.backlog.getCount()})`;
    readyTreeView.title = `READY (${kanbanProviders.ready.getCount()})`;
    inProgressTreeView.title = `IN PROGRESS (${kanbanProviders.inProgress.getCount()})`;
    blockedTreeView.title = `BLOCKED (${kanbanProviders.blocked.getCount()})`;
    reviewTreeView.title = `REVIEW (${kanbanProviders.review.getCount()})`;
    doneTreeView.title = `DONE (${kanbanProviders.done.getCount()})`;
  };
  const updateKanbanBadges = () => {
    backlogTreeView.badge = kanbanProviders.backlog.getBadge();
    readyTreeView.badge = kanbanProviders.ready.getBadge();
    inProgressTreeView.badge = kanbanProviders.inProgress.getBadge();
    blockedTreeView.badge = kanbanProviders.blocked.getBadge();
    reviewTreeView.badge = kanbanProviders.review.getBadge();
    doneTreeView.badge = kanbanProviders.done.getBadge();
  };
  updateKanbanTitles();
  updateKanbanBadges();
  store.onDidChange(() => {
    updateKanbanTitles();
    updateKanbanBadges();
    ticketsProvider.refresh();
    plansProvider.refresh();
    reportsProvider.refresh();
    skillsProvider.refresh();
    logsProvider.refresh();
    pipelineProvider.refresh();
    kanbanProviders.backlog.refresh();
    kanbanProviders.ready.refresh();
    kanbanProviders.inProgress.refresh();
    kanbanProviders.blocked.refresh();
    kanbanProviders.review.refresh();
    kanbanProviders.done.refresh();
  });
  if (workflowRoot) {
    const fileWatcher = new FileWatcherService(store, workflowRoot);
    context.subscriptions.push(fileWatcher);
  }
  const diagnosticProvider = new DiagnosticProvider(store);
  context.subscriptions.push(diagnosticProvider);
  const documentLinkProvider = new WorkflowDocumentLinkProvider(store);
  if (workflowRoot) {
    documentLinkProvider.setWorkflowRoot(workflowRoot);
  }
  const documentLinkDisposable = vscode21.languages.registerDocumentLinkProvider(
    [
      { scheme: "file", pattern: "**/.workflow/tickets/**/*.md" },
      { scheme: "file", pattern: "**/.workflow/config/pipeline.yaml" }
    ],
    documentLinkProvider
  );
  context.subscriptions.push(documentLinkDisposable);
  if (workflowRoot) {
    const ticketService2 = new TicketService(store, workflowRoot);
    const dependencyService2 = new DependencyService(store);
    const codeLensProvider = new WorkflowCodeLensProvider(
      store,
      ticketService2,
      dependencyService2
    );
    codeLensProvider.setWorkflowRoot(workflowRoot);
    const codeLensDisposable = vscode21.languages.registerCodeLensProvider(
      [
        { scheme: "file", pattern: "**/.workflow/tickets/**/*.md" },
        { scheme: "file", pattern: "**/.workflow/config/pipeline.yaml" },
        { scheme: "file", pattern: "**/.workflow/config/config.yaml" }
      ],
      codeLensProvider
    );
    context.subscriptions.push(codeLensDisposable);
  }
  if (workflowRoot) {
    const completionProvider = new WorkflowCompletionProvider(store);
    completionProvider.setWorkflowRoot(workflowRoot);
    const completionDisposable = vscode21.languages.registerCompletionItemProvider(
      [
        { scheme: "file", pattern: "**/.workflow/tickets/**/*.md" },
        { scheme: "file", pattern: "**/.workflow/config/pipeline.yaml" }
      ],
      completionProvider,
      "-",
      // Trigger character for list items
      " ",
      // Trigger character for general completion
      ":"
      // Trigger character for YAML fields
    );
    context.subscriptions.push(completionDisposable);
  }
  if (workflowRoot) {
    const hoverProvider = new WorkflowHoverProvider(store);
    hoverProvider.setWorkflowRoot(workflowRoot);
    const hoverDisposable = vscode21.languages.registerHoverProvider(
      [
        { scheme: "file", pattern: "**/.workflow/tickets/**/*.md" },
        { scheme: "file", pattern: "**/.workflow/config/pipeline.yaml" },
        { scheme: "file", pattern: "**/.workflow/plans/**/*.md" },
        { scheme: "file", pattern: "**/.workflow/reports/**/*.md" }
      ],
      hoverProvider
    );
    context.subscriptions.push(hoverDisposable);
  }
  let ticketService;
  let dependencyService;
  if (workflowRoot) {
    ticketService = new TicketService(store, workflowRoot);
    dependencyService = new DependencyService(store);
  }
  const installCliCmd = registerCommandSafe("workflow.installCli", installCli);
  const initCmd = registerCommandSafe("workflow.init", initWorkflow);
  registerCommandSafe(
    "workflow.focusPipelineStage",
    async (stageId) => {
      if (!workflowRoot) {
        vscode21.window.showErrorMessage(vscode21.l10n.t("Workflow root not available"));
        return;
      }
      const pipelinePath = path14.join(workflowRoot, "config", "pipeline.yaml");
      try {
        const doc = await vscode21.workspace.openTextDocument(pipelinePath);
        const editor = await vscode21.window.showTextDocument(doc);
        const content = doc.getText();
        const escapedStageId = stageId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const stageRegex = new RegExp(`^\\s{4}${escapedStageId}:\\s*$`, "m");
        const match = stageRegex.exec(content);
        if (match) {
          const textBeforeMatch = content.substring(0, match.index);
          const lineNumber = (textBeforeMatch.match(/\n/g) || []).length;
          const position = new vscode21.Position(lineNumber, 0);
          editor.revealRange(
            new vscode21.Range(position, position),
            vscode21.TextEditorRevealType.InCenter
          );
          editor.selection = new vscode21.Selection(position, position);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        vscode21.window.showErrorMessage(vscode21.l10n.t("Failed to focus on stage: {0}", message));
      }
    }
  );
  const openTicketCmd = registerCommandSafe(
    "workflow.openTicket",
    async (arg) => {
      let ticketId = resolveTicketId(arg);
      if (!ticketId) {
        const editor = vscode21.window.activeTextEditor;
        if (editor) {
          ticketId = path14.basename(editor.document.fileName, ".md");
        }
      }
      if (!ticketId || !workflowRoot) {
        vscode21.window.showErrorMessage(vscode21.l10n.t("No ticket ID provided or workflow not available"));
        return;
      }
      const ticket = store.getTicketById(ticketId);
      if (!ticket) {
        vscode21.window.showErrorMessage(vscode21.l10n.t("Ticket {0} not found", ticketId));
        return;
      }
      const ticketPath = path14.join(
        workflowRoot,
        "tickets",
        ticket.status,
        `${ticketId}.md`
      );
      try {
        await vscode21.commands.executeCommand("vscode.open", vscode21.Uri.file(ticketPath));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        vscode21.window.showErrorMessage(vscode21.l10n.t("Failed to open ticket: {0}", message));
      }
    }
  );
  const moveTicketCmd = registerCommandSafe(
    "workflow.moveTicket",
    async (arg) => {
      const ticketId = resolveTicketId(arg);
      if (!ticketService || !ticketId) {
        vscode21.window.showErrorMessage(vscode21.l10n.t("Ticket service not available or no ticket ID provided"));
        return;
      }
      const ticket = ticketService.getById(ticketId);
      if (!ticket) {
        vscode21.window.showErrorMessage(vscode21.l10n.t("Ticket {0} not found", ticketId));
        return;
      }
      const validTransitions = ticketService.getValidTransitions(ticket.status);
      if (validTransitions.length === 0) {
        vscode21.window.showInformationMessage(vscode21.l10n.t("No valid transitions from {0}", ticket.status));
        return;
      }
      const targetStatus = await vscode21.window.showQuickPick(
        validTransitions.map((status) => ({
          label: status,
          description: vscode21.l10n.t("Move to {0}", status)
        })),
        {
          placeHolder: vscode21.l10n.t("Select target status for {0}", ticketId),
          title: vscode21.l10n.t("Move {0}", ticketId)
        }
      );
      if (!targetStatus) {
        return;
      }
      try {
        await ticketService.move(ticketId, targetStatus.label);
        vscode21.window.showInformationMessage(vscode21.l10n.t("Moved {0} to {1}", ticketId, targetStatus.label));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        vscode21.window.showErrorMessage(vscode21.l10n.t("Failed to move ticket: {0}", message));
      }
    }
  );
  const moveTicketFromMenuCmd = registerCommandSafe(
    "workflow.moveTicketFromMenu",
    async (arg) => {
      const ticketId = resolveTicketId(arg);
      await vscode21.commands.executeCommand("workflow.moveTicket", ticketId);
    }
  );
  const moveTicketNextCmd = registerCommandSafe(
    "workflow.moveTicketNext",
    async (arg) => {
      const ticketId = resolveTicketId(arg);
      if (!ticketService || !ticketId) {
        vscode21.window.showErrorMessage(vscode21.l10n.t("Ticket service not available or no ticket ID provided"));
        return;
      }
      const ticket = ticketService.getById(ticketId);
      if (!ticket) {
        vscode21.window.showErrorMessage(vscode21.l10n.t("Ticket {0} not found", ticketId));
        return;
      }
      const validTransitions = ticketService.getValidTransitions(ticket.status);
      if (validTransitions.length === 0) {
        vscode21.window.showInformationMessage(vscode21.l10n.t("No valid transitions from {0}", ticket.status));
        return;
      }
      const nextStatus = validTransitions[0];
      try {
        await ticketService.move(ticketId, nextStatus);
        vscode21.window.showInformationMessage(vscode21.l10n.t("Moved {0} to {1}", ticketId, nextStatus));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        vscode21.window.showErrorMessage(vscode21.l10n.t("Failed to move ticket: {0}", message));
      }
    }
  );
  const editTicketCmd = registerCommandSafe(
    "workflow.editTicket",
    async (arg) => {
      let ticketId = resolveTicketId(arg);
      if (!ticketId) {
        const editor = vscode21.window.activeTextEditor;
        if (editor) {
          ticketId = path14.basename(editor.document.fileName, ".md");
        }
      }
      if (!ticketId || !workflowRoot) {
        vscode21.window.showErrorMessage(vscode21.l10n.t("No ticket ID provided or workflow not available"));
        return;
      }
      const ticket = store.getTicketById(ticketId);
      if (!ticket) {
        vscode21.window.showErrorMessage(vscode21.l10n.t("Ticket {0} not found", ticketId));
        return;
      }
      const ticketPath = path14.join(
        workflowRoot,
        "tickets",
        ticket.status,
        `${ticketId}.md`
      );
      try {
        await vscode21.commands.executeCommand("vscode.open", vscode21.Uri.file(ticketPath));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        vscode21.window.showErrorMessage(vscode21.l10n.t("Failed to open ticket: {0}", message));
      }
    }
  );
  const showDependenciesCmd = registerCommandSafe(
    "workflow.showDependencies",
    async (arg) => {
      const ticketId = resolveTicketId(arg);
      if (!dependencyService || !ticketId) {
        vscode21.window.showErrorMessage(vscode21.l10n.t("Dependency service not available or no ticket ID provided"));
        return;
      }
      const ticket = store.getTicketById(ticketId);
      if (!ticket) {
        vscode21.window.showErrorMessage(vscode21.l10n.t("Ticket {0} not found", ticketId));
        return;
      }
      const dependencies = dependencyService.getDependencies(ticketId);
      const dependents = dependencyService.getDependents(ticketId);
      const depList = dependencies.length > 0 ? dependencies.map((d) => `- ${d.id}: ${d.title} (${d.status})`).join("\n") : vscode21.l10n.t("No dependencies");
      const blocksList = dependents.length > 0 ? dependents.map((d) => `- ${d.id}: ${d.title} (${d.status})`).join("\n") : vscode21.l10n.t("No tickets blocked by this one");
      const info = `**${ticketId}: ${ticket.title}**

**Dependencies (Deps):**
${depList}

**Blocks:**
${blocksList}`;
      await vscode21.window.showInformationMessage(info, { modal: false });
    }
  );
  const showTicketDependenciesCmd = registerCommandSafe(
    "workflow.showTicketDependencies",
    async (arg) => {
      const ticketId = resolveTicketId(arg);
      await vscode21.commands.executeCommand("workflow.showDependencies", ticketId);
    }
  );
  const refreshTicketsCmd = registerCommandSafe(
    "workflow.refreshTickets",
    async () => {
      ticketsProvider.refresh();
      if (workflowRoot) {
        await store.refresh(workflowRoot);
      }
    }
  );
  const setAllKanbanSortMode = (mode) => {
    kanbanProviders.backlog.setSortMode(mode);
    kanbanProviders.ready.setSortMode(mode);
    kanbanProviders.inProgress.setSortMode(mode);
    kanbanProviders.blocked.setSortMode(mode);
    kanbanProviders.review.setSortMode(mode);
    kanbanProviders.done.setSortMode(mode);
  };
  const sortKanbanByPriorityCmd = registerCommandSafe(
    "workflow.sortKanbanByPriority",
    async () => {
      setAllKanbanSortMode("priority");
      vscode21.window.showInformationMessage(vscode21.l10n.t("Kanban boards sorted by priority"));
    }
  );
  const sortKanbanByIdCmd = registerCommandSafe(
    "workflow.sortKanbanById",
    async () => {
      setAllKanbanSortMode("id");
      vscode21.window.showInformationMessage(vscode21.l10n.t("Kanban boards sorted by ID"));
    }
  );
  const sortKanbanByTitleCmd = registerCommandSafe(
    "workflow.sortKanbanByTitle",
    async () => {
      setAllKanbanSortMode("title");
      vscode21.window.showInformationMessage(vscode21.l10n.t("Kanban boards sorted by title"));
    }
  );
  const gotoReviewSectionCmd = registerCommandSafe(
    "workflow.gotoReviewSection",
    async () => {
      const editor = vscode21.window.activeTextEditor;
      if (!editor) {
        vscode21.window.showErrorMessage(vscode21.l10n.t("No active editor"));
        return;
      }
      const document = editor.document;
      const content = document.getText();
      const reviewMatch = content.match(/^## Review/m);
      if (!reviewMatch || reviewMatch.index === void 0) {
        vscode21.window.showInformationMessage(vscode21.l10n.t("No Review section found in this document"));
        return;
      }
      const position = document.positionAt(reviewMatch.index);
      await editor.revealRange(new vscode21.Range(position, position), vscode21.TextEditorRevealType.InCenter);
      editor.selection = new vscode21.Selection(position, position);
    }
  );
  const startPipelineCmd = registerCommandSafe(
    "workflow.runPipeline",
    async () => {
      await pipelineProvider.startPipeline();
    }
  );
  const stopPipelineCmd = registerCommandSafe(
    "workflow.stopPipeline",
    async () => {
      pipelineProvider.stopPipeline();
    }
  );
  const showPipelineOutputCmd = registerCommandSafe(
    "workflow.showPipelineOutput",
    async () => {
      pipelineProvider.showOutput();
    }
  );
  const clearPipelineHistoryCmd = registerCommandSafe(
    "workflow.clearPipelineHistory",
    async () => {
      pipelineProvider.clearHistory();
    }
  );
  const statusBarClickCmd = registerCommandSafe(
    "workflow.statusBarClick",
    async () => {
      await vscode21.commands.executeCommand("workbench.action.quickOpen", ">WF:");
    }
  );
  const newTicketCmd = registerCommandSafe(
    "workflow.newTicket",
    async () => {
      if (!ticketService) {
        vscode21.window.showErrorMessage(vscode21.l10n.t("Ticket service not available"));
        return;
      }
      await executeNewTicket(ticketService);
    }
  );
  const newPlanCmd = registerCommandSafe(
    "workflow.newPlan",
    async () => {
      vscode21.window.showInformationMessage(vscode21.l10n.t("workflow.newPlan: Plan creation coming soon"));
    }
  );
  const showDependenciesCmdNew = registerCommandSafe(
    "workflow.showDependencies",
    async (arg) => {
      const ticketId = resolveTicketId(arg);
      if (!dependencyService) {
        vscode21.window.showErrorMessage(vscode21.l10n.t("Dependency service not available"));
        return;
      }
      await executeShowDependencies(store, dependencyService, ticketId);
    }
  );
  const showStatisticsCmd = registerCommandSafe(
    "workflow.showStatistics",
    async () => {
      await executeShowStatistics(store);
    }
  );
  const openPipelineConfigCmd = registerCommandSafe(
    "workflow.openPipelineConfig",
    async () => {
      await executeOpenPipelineConfig(workflowRoot);
    }
  );
  const openConfigCmd = registerCommandSafe(
    "workflow.openConfig",
    async () => {
      await executeOpenConfig(workflowRoot);
    }
  );
  const focusTicketsViewCmd = registerCommandSafe(
    "workflow.focusTicketsView",
    async () => {
      await executeFocusTicketsView();
    }
  );
  const focusKanbanCmd = registerCommandSafe(
    "workflow.focusKanban",
    async () => {
      await executeFocusKanban();
    }
  );
  const refreshAllCmd = registerCommandSafe(
    "workflow.refreshAll",
    async () => {
      const refreshCallbacks = [
        () => ticketsProvider.refresh(),
        () => plansProvider.refresh(),
        () => reportsProvider.refresh(),
        () => pipelineProvider.refresh(),
        () => kanbanProviders.backlog.refresh(),
        () => kanbanProviders.ready.refresh(),
        () => kanbanProviders.inProgress.refresh(),
        () => kanbanProviders.blocked.refresh(),
        () => kanbanProviders.review.refresh(),
        () => kanbanProviders.done.refresh()
      ];
      await executeRefreshAll(workflowRoot, store, refreshCallbacks);
    }
  );
  const copyTicketIdCmd = registerCommandSafe(
    "workflow.copyTicketId",
    async (arg) => {
      const ticketId = resolveTicketId(arg);
      await executeCopyTicketId(ticketId);
    }
  );
  registerCommandSafe(
    "workflow.filterTicketsByPlan",
    async () => {
      if (!workflowRoot) {
        vscode21.window.showErrorMessage(vscode21.l10n.t("Workflow root not available"));
        return;
      }
      await executeFilterTicketsByPlan(store, ticketsProvider);
    }
  );
  context.subscriptions.push(
    installCliCmd,
    initCmd,
    openTicketCmd,
    moveTicketCmd,
    moveTicketFromMenuCmd,
    moveTicketNextCmd,
    editTicketCmd,
    showDependenciesCmd,
    showTicketDependenciesCmd,
    refreshTicketsCmd,
    sortKanbanByPriorityCmd,
    sortKanbanByIdCmd,
    sortKanbanByTitleCmd,
    gotoReviewSectionCmd,
    startPipelineCmd,
    stopPipelineCmd,
    showPipelineOutputCmd,
    clearPipelineHistoryCmd,
    statusBarClickCmd,
    newTicketCmd,
    newPlanCmd,
    showDependenciesCmdNew,
    showStatisticsCmd,
    openPipelineConfigCmd,
    openConfigCmd,
    focusTicketsViewCmd,
    focusKanbanCmd,
    refreshAllCmd,
    copyTicketIdCmd,
    notificationsManager
  );
  const activationTime = Date.now() - startTime;
  console.log(`Workflow AI extension activated in ${activationTime}ms`);
}
function deactivate() {
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  activate,
  checkCliInstalled,
  checkWorkflowDir,
  deactivate,
  updateContextKeys
});
/*! Bundled license information:

js-yaml/dist/js-yaml.mjs:
  (*! js-yaml 4.1.1 https://github.com/nodeca/js-yaml @license MIT *)
*/
//# sourceMappingURL=extension.js.map
