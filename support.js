/*
 * Vieser pitch-demot: pieni ajonaikainen kirjasto, joka ajaa canvaksen
 * .dc.html-artboardit sellaisenaan selaimessa (GitHub Pages).
 * Tukee: <x-dc>, <helmet>, {{ polku.piste }} -reiät, <sc-for list as>,
 * <sc-if value>, <dc-import name>, DCLogic + setState, componentDidMount,
 * ref="{{ fn }}", onClick/onInput/onChange/onSubmit.
 */
(function () {
  'use strict';

  var hide = document.createElement('style');
  hide.textContent = 'x-dc,helmet{display:none!important}';
  document.head.appendChild(hide);

  var robots = document.createElement('meta');
  robots.name = 'robots';
  robots.content = 'noindex, nofollow';
  document.head.appendChild(robots);

  if (!document.querySelector('meta[name="viewport"]')) {
    var vp = document.createElement('meta');
    vp.name = 'viewport';
    vp.content = 'width=device-width, initial-scale=1';
    document.head.appendChild(vp);
  }

  var queued = false;
  function schedule() {
    if (queued) return;
    queued = true;
    Promise.resolve().then(function () { queued = false; render(); });
  }

  function DCLogic(props) { this.props = props || {}; this.state = {}; }
  DCLogic.prototype.setState = function (patch) {
    var next = typeof patch === 'function' ? patch(this.state, this.props) : patch;
    this.state = Object.assign({}, this.state, next);
    schedule();
  };
  DCLogic.prototype.renderVals = function () { return {}; };
  window.DCLogic = DCLogic;


  // ---------- definitions ----------
  var defs = {};

  function scopeCss(css, name) {
    var pre = '[data-c="' + name + '"]';
    return css.replace(/([^{}]+)\{([^{}]*)\}/g, function (_, sel, body) {
      var parts = sel.split(',').map(function (p) {
        p = p.trim();
        if (!p || /^(html|body)\b/.test(p)) return '';
        return pre + ' ' + p + ', ' + pre + p.replace(/^[a-z]+/i, function (t) { return ':is(' + t + ')'; });
      }).filter(Boolean);
      return parts.length ? parts.join(', ') + '{' + body + '}' : '';
    });
  }

  function readDef(doc, scopeName) {
    var xdc = doc.querySelector('x-dc');
    var tpl = document.createDocumentFragment();
    if (xdc) {
      var helmet = xdc.querySelector('helmet');
      if (helmet) {
        Array.prototype.slice.call(helmet.childNodes).forEach(function (n) {
          if (n.nodeType !== 1) return;
          var c = document.importNode(n, true);
          if (scopeName && c.localName === 'style') c.textContent = scopeCss(c.textContent, scopeName);
          document.head.appendChild(c);
        });
        helmet.parentNode.removeChild(helmet);
      }
      Array.prototype.slice.call(xdc.childNodes).forEach(function (n) {
        tpl.appendChild(document.importNode(n, true));
      });
    }
    var script = doc.querySelector('script[type="text/x-dc"]');
    var Comp;
    if (script) {
      Comp = new Function('DCLogic', script.textContent + '\n;return typeof Component !== "undefined" ? Component : null;')(DCLogic);
    }
    return { tpl: tpl, Comp: Comp || DCLogic };
  }

  function collectImports(frag, out) {
    Array.prototype.forEach.call(frag.querySelectorAll ? frag.querySelectorAll('dc-import') : [], function (el) {
      var n = el.getAttribute('name');
      if (n && out.indexOf(n) < 0) out.push(n);
    });
    return out;
  }

  function loadDef(name) {
    if (defs[name]) return Promise.resolve(defs[name]);
    return fetch(name + '.dc.html', { cache: 'no-cache' }).then(function (r) { return r.text(); }).then(function (txt) {
      var doc = new DOMParser().parseFromString(txt, 'text/html');
      var def = readDef(doc, name);
      defs[name] = def;
      return Promise.all(collectImports(def.tpl, []).map(loadDef)).then(function () { return def; });
    });
  }

  // ---------- evaluation ----------
  var HOLE = /\{\{\s*([^}]+?)\s*\}\}/g;
  var ONLY_HOLE = /^\s*\{\{\s*([^}]+?)\s*\}\}\s*$/;

  function lookup(expr, scope) {
    expr = expr.trim();
    if (expr === 'true') return true;
    if (expr === 'false') return false;
    if (expr === 'null') return null;
    if (/^-?\d+(\.\d+)?$/.test(expr)) return Number(expr);
    if (/^'.*'$|^".*"$/.test(expr)) return expr.slice(1, -1);
    var parts = expr.split('.');
    var cur;
    for (var i = scope.length - 1; i >= 0; i--) {
      if (scope[i] && Object.prototype.hasOwnProperty.call(scope[i], parts[0])) { cur = scope[i][parts[0]]; break; }
    }
    for (var j = 1; j < parts.length && cur != null; j++) cur = cur[parts[j]];
    return cur;
  }

  function attrVal(el, name, scope) {
    var raw = el.getAttribute(name) || '';
    var m = raw.match(ONLY_HOLE);
    return lookup(m ? m[1] : raw, scope);
  }

  function interp(str, scope) {
    return str.replace(HOLE, function (_, e) {
      var v = lookup(e, scope);
      return v == null || v === false ? '' : String(v);
    });
  }

  function camel(name) { return name.replace(/-([a-z])/g, function (_, c) { return c.toUpperCase(); }); }

  // ---------- render ----------
  var handlers = [];
  var refs = [];
  var instances = {};
  var rootDef = null;
  var mount = null;
  var BOOL = { checked: 1, disabled: 1, selected: 1, open: 1, hidden: 1, required: 1, readonly: 1, multiple: 1 };

  function build(nodes, scope, key, out) {
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (n.nodeType === 3) { out.push(document.createTextNode(interp(n.nodeValue, scope))); continue; }
      if (n.nodeType !== 1) continue;
      var tag = n.localName;
      var k = key + '.' + i;
      if (tag === 'sc-for') {
        var list = attrVal(n, 'list', scope) || [];
        var as = n.getAttribute('as') || 'item';
        for (var j = 0; j < list.length; j++) {
          var s = {}; s[as] = list[j];
          build(n.childNodes, scope.concat([s]), k + '[' + j + ']', out);
        }
        continue;
      }
      if (tag === 'sc-if') {
        if (attrVal(n, 'value', scope)) build(n.childNodes, scope, k, out);
        continue;
      }
      if (tag === 'helmet') continue;
      if (tag === 'dc-import') {
        var name = n.getAttribute('name');
        var def = defs[name];
        if (!def) continue;
        var props = {};
        Array.prototype.forEach.call(n.attributes, function (a) {
          if (a.name === 'name' || a.name.indexOf('hint-') === 0) return;
          var m = a.value.match(ONLY_HOLE);
          props[camel(a.name)] = m ? lookup(m[1], scope) : interp(a.value, scope);
        });
        var inst = instances[k];
        if (!inst || inst.__def !== def) { inst = new def.Comp(props); inst.__def = def; instances[k] = inst; }
        else inst.props = props;
        var part = build(def.tpl.childNodes, [inst.renderVals() || {}], k, []);
        part.forEach(function (c) { if (c.nodeType === 1) c.setAttribute('data-c', name); out.push(c); });
        continue;
      }
      out.push(buildEl(n, scope, k));
    }
    return out;
  }

  function buildEl(n, scope, k) {
    var el = n.namespaceURI && n.namespaceURI !== 'http://www.w3.org/1999/xhtml'
      ? document.createElementNS(n.namespaceURI, n.localName)
      : document.createElement(n.localName);
    var selectValue;
    var evs = null;
    Array.prototype.forEach.call(n.attributes, function (a) {
      var nm = a.name;
      if (nm.indexOf('hint-') === 0) return;
      var m = a.value.match(ONLY_HOLE);
      if (m) {
        var v = lookup(m[1], scope);
        if (nm === 'ref') {
          if (typeof v === 'function') { refs.push(v); el.setAttribute('data-ref', String(refs.length - 1)); }
          return;
        }
        if (/^on[a-z]+$/.test(nm)) {
          if (typeof v === 'function') { evs = evs || {}; evs[nm.slice(2)] = v; }
          return;
        }
        if (nm === 'value' && n.localName === 'select') { selectValue = v; return; }
        if (BOOL[nm]) { if (v) el.setAttribute(nm, ''); return; }
        if (v == null || v === false) return;
        el.setAttribute(nm, String(v));
      } else {
        el.setAttribute(nm, a.value.indexOf('{{') >= 0 ? interp(a.value, scope) : a.value);
      }
    });
    if (evs) { handlers.push(evs); el.setAttribute('data-h', String(handlers.length - 1)); }
    var kids = build(n.localName === 'template' ? n.content.childNodes : n.childNodes, scope, k, []);
    kids.forEach(function (c) { el.appendChild(c); });
    if (selectValue !== undefined) {
      Array.prototype.forEach.call(el.querySelectorAll('option'), function (o) {
        var ov = o.hasAttribute('value') ? o.getAttribute('value') : o.textContent;
        if (String(ov) === String(selectValue)) o.setAttribute('selected', ''); else o.removeAttribute('selected');
      });
    }
    if (n.localName === 'a') {
      var href = el.getAttribute('href');
      if (href === '#') el.setAttribute('data-noop', '');
    }
    return el;
  }

  // ---------- patch ----------
  function syncAttrs(from, to) {
    var i, a;
    for (i = from.attributes.length - 1; i >= 0; i--) {
      a = from.attributes[i];
      if (!to.hasAttribute(a.name)) {
        if (a.name === 'open' && from.localName === 'details') continue;
        from.removeAttribute(a.name);
      }
    }
    for (i = 0; i < to.attributes.length; i++) {
      a = to.attributes[i];
      if (a.name === 'open' && from.localName === 'details') continue;
      if (from.getAttribute(a.name) !== a.value) from.setAttribute(a.name, a.value);
    }
    var tag = from.localName;
    if (tag === 'input') {
      var type = (to.getAttribute('type') || 'text').toLowerCase();
      if (type === 'checkbox' || type === 'radio') from.checked = to.hasAttribute('checked');
      else { var tv = to.getAttribute('value') || ''; if (from.value !== tv) from.value = tv; }
    } else if (tag === 'textarea') {
      if (from.value !== to.textContent) from.value = to.textContent;
    } else if (tag === 'option') {
      from.selected = to.hasAttribute('selected');
    }
  }

  function patch(from, to) {
    var fc = from.childNodes, tc = to.childNodes;
    var i;
    for (i = 0; i < tc.length; i++) {
      var t = tc[i], f = fc[i];
      if (!f) { from.appendChild(t.cloneNode(true)); continue; }
      if (f.nodeType !== t.nodeType || (f.nodeType === 1 && (f.localName !== t.localName || f.namespaceURI !== t.namespaceURI))) {
        from.replaceChild(t.cloneNode(true), f);
        continue;
      }
      if (f.nodeType === 3) { if (f.nodeValue !== t.nodeValue) f.nodeValue = t.nodeValue; continue; }
      if (f.nodeType === 1) { syncAttrs(f, t); patch(f, t); }
    }
    while (fc.length > tc.length) from.removeChild(from.lastChild);
    if (from.localName === 'select') {
      var sel = to.querySelector('option[selected]');
      if (sel) {
        var idx = Array.prototype.indexOf.call(to.querySelectorAll('option'), sel);
        if (from.selectedIndex !== idx) from.selectedIndex = idx;
      }
    }
  }

  function render() {
    if (!rootDef) return;
    handlers = [];
    refs = [];
    if (!instances.root) instances.root = new rootDef.Comp({});
    var vals = instances.root.renderVals() || {};
    var fresh = document.createElement('div');
    build(rootDef.tpl.childNodes, [vals], 'root', []).forEach(function (c) { fresh.appendChild(c); });
    if (!mount.firstChild) {
      while (fresh.firstChild) mount.appendChild(fresh.firstChild);
    } else {
      patch(mount, fresh);
    }
    Array.prototype.forEach.call(mount.querySelectorAll('[data-ref]'), function (el) {
      var fn = refs[el.getAttribute('data-ref')];
      if (fn) fn(el);
    });
  }

  function didMount() {
    Object.keys(instances).forEach(function (k) {
      var i = instances[k];
      if (i && typeof i.componentDidMount === 'function') i.componentDidMount();
    });
  }

  // ---------- events ----------
  function findHandler(target, type) {
    var el = target && target.nodeType === 1 ? target : target && target.parentElement;
    while (el && el !== document.body) {
      var id = el.getAttribute && el.getAttribute('data-h');
      if (id != null && handlers[id] && handlers[id][type]) return handlers[id][type];
      el = el.parentElement;
    }
    return null;
  }

  function wire() {
    ['click', 'input', 'change'].forEach(function (type) {
      mount.addEventListener(type, function (e) {
        var h = findHandler(e.target, type);
        if (h) h(e);
        if (type === 'click') {
          var a = e.target.closest && e.target.closest('a[data-noop]');
          if (a) e.preventDefault();
        }
      });
    });
    mount.addEventListener('submit', function (e) {
      var h = findHandler(e.target, 'submit');
      e.preventDefault();
      if (h) h(e);
    });
  }

  function start() {
    var def = readDef(document);
    var xdc = document.querySelector('x-dc');
    mount = document.createElement('div');
    mount.id = 'vs-proto';
    if (xdc) xdc.parentNode.replaceChild(mount, xdc); else document.body.appendChild(mount);
    var names = collectImports(def.tpl, []);
    Promise.all(names.map(loadDef)).then(function () {
      rootDef = def;
      wire();
      render();
      didMount();
      if (location.hash) {
        var t = document.getElementById(location.hash.slice(1));
        if (t) t.scrollIntoView();
      }
    }).catch(function (err) {
      mount.textContent = 'Demon lataus epäonnistui: ' + err;
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
