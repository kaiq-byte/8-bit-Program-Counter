// Browser re-implementation of the parts of hneemann's Digital needed to open,
// draw and simulate the .dig circuits of this repository.
// Shapes, pin positions, colors and the simulation model follow Digital's source
// (de.neemann.digital.draw.shapes.* and de.neemann.digital.core.*).
(function () {
  "use strict";

  const SIZE = 20, SIZE2 = 10, OUT_SIZE = 15, MAXLINETHICK = 4;

  // ---------------------------------------------------------------- parsing
  function parseValue(node) {
    switch (node.tagName) {
      case "int": case "long": return parseInt(node.textContent, 10);
      case "boolean": return node.textContent.trim() === "true";
      case "rotation": return parseInt(node.getAttribute("rotation"), 10) || 0;
      case "awtColor": {
        const g = t => parseInt((node.getElementsByTagName(t)[0] || {}).textContent || "255", 10);
        return { r: g("red"), g: g("green"), b: g("blue"), a: g("alpha") };
      }
      default: return node.textContent;
    }
  }
  function parseAttrs(parent) {
    const a = {};
    if (!parent) return a;
    for (const entry of parent.children) {
      if (entry.tagName !== "entry") continue;
      const [k, v] = entry.children;
      if (k && v) a[k.textContent] = parseValue(v);
    }
    return a;
  }
  function parseDig(xmlText) {
    const doc = new DOMParser().parseFromString(xmlText, "application/xml");
    const root = doc.documentElement;
    const direct = name => [...root.children].find(c => c.tagName === name);
    const elements = [...(direct("visualElements") || { children: [] }).children].map(ve => {
      const get = t => [...ve.children].find(c => c.tagName === t);
      const pos = get("pos");
      return {
        name: get("elementName").textContent,
        attrs: parseAttrs(get("elementAttributes")),
        x: parseInt(pos.getAttribute("x"), 10), y: parseInt(pos.getAttribute("y"), 10),
      };
    });
    const wires = [...(direct("wires") || { children: [] }).children].map(w => {
      const p1 = w.getElementsByTagName("p1")[0], p2 = w.getElementsByTagName("p2")[0];
      return { x1: +p1.getAttribute("x"), y1: +p1.getAttribute("y"), x2: +p2.getAttribute("x"), y2: +p2.getAttribute("y") };
    });
    return { attrs: parseAttrs(direct("attributes")), elements, wires };
  }

  // ---------------------------------------------------------------- library
  const library = {};
  function loadLibrary(files) {
    for (const [name, text] of Object.entries(files)) library[name] = parseDig(text);
  }
  const shortName = file => {
    const c = library[file];
    if (c && c.attrs.Label) return c.attrs.Label;
    return file.replace(/\.dig$/, "");
  };

  const bitsOf = a => a.Bits || 1;
  function splitterPorts(spec) {
    const ports = []; let pos = 0;
    for (const part of String(spec).split(",")) {
      const t = part.trim(); if (!t) continue;
      let bits = t, count = 1;
      if (t.includes("*")) { const [b, c] = t.split("*"); bits = b; count = parseInt(c, 10); }
      for (let i = 0; i < count; i++) {
        const b = parseInt(bits, 10);
        const name = b === 1 ? "" + pos : b === 2 ? pos + "," + (pos + 1) : pos + "-" + (pos + b - 1);
        ports.push({ name, bits: b, pos }); pos += b;
      }
    }
    return ports;
  }

  // Pin descriptions of every element type: {inputs:[{name,bits}], outputs:[...]}
  function describe(name, a) {
    const b = bitsOf(a);
    switch (name) {
      case "And": case "Or": case "NAnd": case "NOr": case "XOr": case "XNOr": {
        const n = a.Inputs || 2;
        return { inputs: Array.from({ length: n }, (_, i) => ({ name: "In_" + (i + 1), bits: b })), outputs: [{ name: "out", bits: b }] };
      }
      case "Not": return { inputs: [{ name: "in", bits: b }], outputs: [{ name: "out", bits: b }] };
      case "In": case "Const": return { inputs: [], outputs: [{ name: "out", bits: b }] };
      case "Clock": return { inputs: [], outputs: [{ name: "C", bits: 1 }] };
      case "Reset": return { inputs: [], outputs: [{ name: "Reset", bits: 1 }] };
      case "Out": return { inputs: [{ name: "in", bits: b }], outputs: [] };
      case "Driver": return { inputs: [{ name: "in", bits: b }, { name: "sel", bits: 1 }], outputs: [{ name: "out", bits: b }] };
      case "Splitter": {
        const ins = splitterPorts(a["Input Splitting"] || "4,4"), outs = splitterPorts(a["Output Splitting"] || "8");
        return { inputs: ins, outputs: outs };
      }
      case "D_FF": return { inputs: [{ name: "D", bits: b }, { name: "C", bits: 1, clock: true }], outputs: [{ name: "Q", bits: b }, { name: "~Q", bits: b }] };
      case "Decoder": {
        const s = a["Selector Bits"] || 1;
        return { inputs: [{ name: "sel", bits: s }], outputs: Array.from({ length: 1 << s }, (_, i) => ({ name: "out_" + i, bits: 1 })) };
      }
      case "Comparator": return { inputs: [{ name: "a", bits: b }, { name: "b", bits: b }], outputs: [{ name: "=", bits: 1 }, { name: ">", bits: 1 }, { name: "<", bits: 1 }] };
      case "Add": return { inputs: [{ name: "a", bits: b }, { name: "b", bits: b }, { name: "c_i", bits: 1 }], outputs: [{ name: "s", bits: b }, { name: "c_o", bits: 1 }] };
      case "RAMDualPort": {
        const ab = a.AddrBits || 8;
        return { inputs: [{ name: "A", bits: ab }, { name: "Din", bits: b }, { name: "str", bits: 1 }, { name: "C", bits: 1, clock: true }, { name: "ld", bits: 1 }], outputs: [{ name: "D", bits: b }] };
      }
    }
    const c = library[name];
    if (c) {
      const inputs = [], outputs = [];
      for (const e of c.elements) {
        if (e.name === "In" || e.name === "Clock") inputs.push({ name: e.attrs.Label || "", bits: e.name === "Clock" ? 1 : bitsOf(e.attrs), clock: e.name === "Clock" });
        if (e.name === "Out") outputs.push({ name: e.attrs.Label || "", bits: bitsOf(e.attrs) });
      }
      return { inputs, outputs, custom: true };
    }
    return null; // missing
  }

  // ---------------------------------------------------------------- shapes
  // Each shape returns {pins:[{name,dir,bits,x,y}], draw(g, state)} in local coordinates.
  // g collects primitives: line, poly, circle, text (see Gfx below).
  const COLORS = {
    MAIN: "#000", PINS: "#808080", WIRE: "#0000b2", WIRE_LOW: "#008e00", WIRE_HIGH: "#66ff66",
    WIRE_Z: "#808080", WIRE_VALUE: "#32a232", ERROR: "#ff0000", CUSTOM_BG: "rgba(255,255,180,0.78)", BG: "#fff",
  };
  const ST = {
    NORMAL: { w: 4, c: COLORS.MAIN, fs: 24 },
    THIN: { w: 2, c: COLORS.MAIN, fs: 24 },
    INOUT: { w: 4, c: COLORS.MAIN, fs: 24, italic: true },
    FILLED: { w: 4, c: COLORS.MAIN, fill: true, fs: 24 },
    SHAPE_PIN: { w: 2, c: COLORS.PINS, fs: 18 },
    SHAPE_SPLITTER: { w: 2, c: COLORS.PINS, fs: 12 },
    WIRE_VALUE: { w: 2, c: COLORS.WIRE_VALUE, fs: 12 },
  };
  const wireStyle = v => {
    if (!v || v.bits > 1) return { w: 4, c: COLORS.WIRE, fill: true };
    if (v.z) return { w: 4, c: COLORS.WIRE_Z, fill: true };
    return { w: 4, c: v.v ? COLORS.WIRE_HIGH : COLORS.WIRE_LOW, fill: true };
  };
  const fillStyle = color => ({ w: 0, c: color, fill: true });

  function genericPins(ins, outs, width, symmetric, invert) {
    const pins = [];
    const offs = symmetric ? Math.floor(ins.length / 2) * SIZE : 0;
    ins.forEach((p, i) => {
      const correct = symmetric && (ins.length % 2 === 0) && i >= ins.length / 2 ? SIZE : 0;
      pins.push({ ...p, dir: "in", x: 0, y: i * SIZE + correct });
    });
    outs.forEach((p, i) => pins.push({ ...p, dir: "out", x: SIZE * (invert ? width + 1 : width), y: i * SIZE + offs }));
    return pins;
  }
  function genericShape(o) {
    // o: {name, ins, outs, label, showPinLabels, width, invert, color, topBottomBorder}
    const width = o.width, symmetric = o.outs.length === 1, tb = o.topBottomBorder ?? SIZE2;
    const pins = genericPins(o.ins, o.outs, width, symmetric, o.invert);
    return {
      pins,
      draw(g) {
        const max = Math.max(o.ins.length, o.outs.length);
        let yBottom = (max - 1) * SIZE + tb;
        if (symmetric && o.ins.length > 0 && o.ins.length % 2 === 0) yBottom += SIZE;
        const poly = [[1, -tb], [SIZE * width - 1, -tb], [SIZE * width - 1, yBottom], [1, yBottom]];
        if (o.color) g.poly(poly, true, fillStyle(o.color));
        else g.poly(poly, true, fillStyle(COLORS.BG));
        g.poly(poly, true, ST.NORMAL);
        if (o.invert) {
          const offs = symmetric ? Math.floor(o.ins.length / 2) * SIZE : 0;
          o.outs.forEach((_, i) => g.circle([SIZE * width + 1, i * SIZE - SIZE2 + 1 + offs], [SIZE * (width + 1) - 1, i * SIZE + SIZE2 - 1 + offs], ST.NORMAL));
        }
        if (o.label) g.text([SIZE2 * width, -tb - 8], o.label, "CENTERBOTTOM", ST.NORMAL);
        if (o.showPinLabels) {
          for (const p of pins) {
            let dx = 4;
            if (p.dir === "in") {
              if (p.clock) {
                const tri = SIZE2 / 2 + 2;
                g.poly([[p.x + dx - 3, p.y + tri], [p.x + dx + tri - 3, p.y], [p.x + dx - 3, p.y - tri]], false, ST.THIN);
                dx += tri;
              }
              g.text([p.x + dx, p.y], p.name, "LEFTCENTER", ST.SHAPE_PIN);
            } else g.text([p.x - 4, p.y], p.name, "RIGHTCENTER", ST.SHAPE_PIN);
          }
        }
        if (o.name.length > 0) {
          if (o.name.length <= 3 && !o.showPinLabels) g.text([SIZE2 * width, -tb + 4], o.name, "CENTERTOP", ST.NORMAL);
          else g.text([SIZE2 * width, yBottom + 4], o.name, "CENTERTOP", ST.SHAPE_PIN);
        }
      },
    };
  }

  function layoutShape(file, label) {
    const c = library[file];
    const name = label || shortName(file);
    const lists = { left: [], right: [], top: [], bottom: [] };
    for (const ve of c.elements) {
      const r = ve.attrs.rotation || 0;
      if (ve.name === "In" || ve.name === "Clock") lists[["left", "bottom", "right", "top"][r]].push(ve);
      if (ve.name === "Out") lists[["right", "top", "left", "bottom"][r]].push(ve);
    }
    const max = (l, m) => Math.max(m, l.length + 1);
    const height = max(lists.left, max(lists.right, c.attrs.Height || 3));
    const width = max(lists.top, max(lists.bottom, c.attrs.Width || 3));
    const map = {};
    const place = (list, horizontal, start, length) => {
      const sorted = list.map(ve => ({ order: horizontal ? ve.x : ve.y, label: ve.attrs.Label || "" }))
        .sort((a, b) => a.order - b.order);
      const delta = Math.floor((length + 2) / (sorted.length + 1));
      const pinsOnly = delta * (sorted.length - 1);
      let pos = horizontal ? [start[0] + SIZE * Math.trunc((length - pinsOnly) / 2), start[1]] : [start[0], start[1] + SIZE * Math.trunc((length - pinsOnly) / 2)];
      for (const pp of sorted) {
        pp.pos = pos; map[pp.label] = pp;
        pos = horizontal ? [pos[0] + SIZE * delta, pos[1]] : [pos[0], pos[1] + SIZE * delta];
      }
      return sorted;
    };
    const top = place(lists.top, true, [0, 0], width), bottom = place(lists.bottom, true, [0, SIZE * height], width);
    const left = place(lists.left, false, [0, 0], height), right = place(lists.right, false, [SIZE * width, 0], height);
    const d = describe(file, {});
    const pins = [];
    d.inputs.forEach(p => { const pp = map[p.name]; if (pp) pins.push({ ...p, dir: "in", x: pp.pos[0], y: pp.pos[1] }); });
    d.outputs.forEach(p => { const pp = map[p.name]; if (pp) pins.push({ ...p, dir: "out", x: pp.pos[0], y: pp.pos[1] }); });
    return {
      pins,
      draw(g) {
        const poly = [[0, 0], [width * SIZE, 0], [width * SIZE, height * SIZE], [0, height * SIZE]];
        g.poly(poly, true, fillStyle(COLORS.CUSTOM_BG));
        g.poly(poly, true, ST.NORMAL);
        if (bottom.length === 0) g.text([width * SIZE / 2, height * SIZE + 4], name, "CENTERTOP", ST.SHAPE_PIN);
        else if (top.length === 0) g.text([width * SIZE / 2, -4], name, "CENTERBOTTOM", ST.SHAPE_PIN);
        else g.text([width * SIZE / 2, height * SIZE / 2], name, "CENTERCENTER", ST.SHAPE_PIN);
        for (const p of left) g.text([p.pos[0] + 4, p.pos[1]], p.label, "LEFTCENTER", ST.SHAPE_PIN);
        for (const p of right) g.text([p.pos[0] - 4, p.pos[1]], p.label, "RIGHTCENTER", ST.SHAPE_PIN);
        for (const p of top) g.text3([p.pos[0], p.pos[1] + 4], [p.pos[0], p.pos[1] + 3], p.label, "RIGHTCENTER", ST.SHAPE_PIN);
        for (const p of bottom) g.text3([p.pos[0], p.pos[1] - 4], [p.pos[0], p.pos[1] - 3], p.label, "RIGHTCENTER", ST.SHAPE_PIN);
      },
    };
  }

  function formatValue(v, fmt) {
    if (!v) return "";
    if (v.z === (2 ** v.bits) - 1) return "Z";
    if (fmt === "bin") return "0b" + v.v.toString(2).padStart(v.bits, "0");
    if (fmt === "dec") return String(v.v);
    if (fmt === "hex") return "0x" + v.v.toString(16).toUpperCase().padStart(Math.ceil(v.bits / 4), "0");
    return v.v < 10 ? String(v.v) : "0x" + v.v.toString(16).toUpperCase();
  }

  function shapeFor(el) {
    const a = el.attrs, n = el.name, d = describe(n, a);
    if (!d) return missingShape(n);
    switch (n) {
      case "And": case "NAnd": return genericShape({ name: "&", ins: d.inputs, outs: d.outputs, width: a.wideShape ? 4 : 3, invert: n === "NAnd" });
      case "Or": case "NOr": return genericShape({ name: "≥1", ins: d.inputs, outs: d.outputs, width: a.wideShape ? 4 : 3, invert: n === "NOr" });
      case "XOr": case "XNOr": return genericShape({ name: "=1", ins: d.inputs, outs: d.outputs, width: a.wideShape ? 4 : 3, invert: n === "XNOr" });
      case "Not": {
        const ws = !!a.wideShape;
        return genericShape({ name: ws ? "1" : "", ins: d.inputs, outs: d.outputs, width: ws ? 2 : 1, invert: true, topBottomBorder: ws ? SIZE : SIZE2 });
      }
      case "In": return ioShape(a, true);
      case "Out": return ioShape(a, false);
      case "Clock": return clockShape(a);
      case "Const": return {
        pins: [{ ...d.outputs[0], dir: "out", x: 0, y: 0 }],
        draw(g) { g.text([-3, 0], formatValue({ v: a.Value ?? 1, bits: bitsOf(a), z: 0 }, a.intFormat), "RIGHTCENTER", ST.NORMAL); },
      };
      case "Reset": return {
        pins: [{ ...d.outputs[0], dir: "out", x: 0, y: 0 }],
        draw(g) {
          let x = 0;
          if (a.invertOutput ?? true) { x -= SIZE - 1; g.circle([-SIZE + 1, -SIZE2 + 1], [-1, SIZE2 - 1], ST.NORMAL); }
          g.poly([[x - OUT_SIZE * 2 - 2, -OUT_SIZE], [x - 2, -OUT_SIZE], [x - 2, OUT_SIZE], [x - OUT_SIZE * 2 - 2, OUT_SIZE]], true, fillStyle(COLORS.BG));
          g.poly([[x - OUT_SIZE * 2 - 2, -OUT_SIZE], [x - 2, -OUT_SIZE], [x - 2, OUT_SIZE], [x - OUT_SIZE * 2 - 2, OUT_SIZE]], true, ST.NORMAL);
          g.text([x - OUT_SIZE * 2 + 2, -OUT_SIZE + 2], "R", "LEFTTOP", ST.SHAPE_PIN);
          if (a.Label) g.text([x - OUT_SIZE * 3, 0], a.Label, "RIGHTCENTER", ST.NORMAL);
        },
      };
      case "Driver": {
        const bottom = !!a.flipSelPos;
        return {
          pins: [{ ...d.inputs[0], dir: "in", x: -SIZE, y: 0 }, { ...d.inputs[1], dir: "in", x: 0, y: bottom ? SIZE : -SIZE }, { ...d.outputs[0], dir: "out", x: SIZE, y: 0 }],
          draw(g) {
            g.poly([[-SIZE + 1, -SIZE2 - 2], [SIZE - 1, 0], [-SIZE + 1, SIZE2 + 2]], true, ST.NORMAL);
            if (bottom) g.line([0, SIZE], [0, 7], ST.NORMAL); else g.line([0, -SIZE], [0, -7], ST.NORMAL);
          },
        };
      }
      case "Splitter": {
        const spreading = a.splitterSpreading || 1;
        const length = (Math.max(d.inputs.length, d.outputs.length) - 1) * spreading * SIZE + 2;
        const pins = [];
        d.inputs.forEach((p, i) => pins.push({ ...p, dir: "in", x: 0, y: i * spreading * SIZE }));
        d.outputs.forEach((p, i) => pins.push({ ...p, dir: "out", x: SIZE, y: i * spreading * SIZE }));
        return {
          pins,
          draw(g) {
            d.inputs.forEach((p, i) => {
              g.text([-2, i * spreading * SIZE - 3], p.name, "RIGHTBOTTOM", ST.SHAPE_SPLITTER);
              g.line([0, i * spreading * SIZE], [SIZE2, i * spreading * SIZE], ST.NORMAL);
            });
            d.outputs.forEach((p, i) => {
              g.text([SIZE + 2, i * spreading * SIZE - 3], p.name, "LEFTBOTTOM", ST.SHAPE_SPLITTER);
              g.line([SIZE, i * spreading * SIZE], [SIZE2, i * spreading * SIZE], ST.NORMAL);
            });
            g.poly([[SIZE2 - 2, -2], [SIZE2 + 2, -2], [SIZE2 + 2, length], [SIZE2 - 2, length]], true, ST.FILLED);
          },
        };
      }
      case "Decoder": {
        const outputCount = d.outputs.length, flip = !!a.flipSelPos;
        const height = outputCount <= 2 ? outputCount * SIZE : (outputCount - 1) * SIZE;
        const pins = [{ ...d.inputs[0], dir: "in", x: SIZE, y: flip ? 0 : height }];
        if (outputCount === 2) { pins.push({ ...d.outputs[0], dir: "out", x: 2 * SIZE, y: 0 }); pins.push({ ...d.outputs[1], dir: "out", x: 2 * SIZE, y: 2 * SIZE }); }
        else d.outputs.forEach((p, i) => pins.push({ ...p, dir: "out", x: 2 * SIZE, y: i * SIZE }));
        return {
          pins,
          draw(g) {
            g.poly([[1, 5], [SIZE * 2 - 1, -4], [SIZE * 2 - 1, height + 4], [1, height - 5]], true, fillStyle(COLORS.BG));
            g.poly([[1, 5], [SIZE * 2 - 1, -4], [SIZE * 2 - 1, height + 4], [1, height - 5]], true, ST.NORMAL);
            g.text([SIZE * 2 - 3, 2], "0", "RIGHTTOP", ST.SHAPE_PIN);
          },
        };
      }
      case "D_FF": return genericShape({ name: "D", ins: d.inputs, outs: d.outputs, label: a.Label, showPinLabels: true, width: a.Width || 3 });
      case "Comparator": return genericShape({ name: "", ins: d.inputs, outs: d.outputs, label: a.Label, showPinLabels: true, width: a.Width || 3 });
      case "Add": return genericShape({ name: "Add", ins: d.inputs, outs: d.outputs, label: a.Label, showPinLabels: true, width: a.Width || 3 });
      case "RAMDualPort": return genericShape({ name: "RAM", ins: d.inputs, outs: d.outputs, label: a.Label, showPinLabels: true, width: 3 });
    }
    // custom circuit
    const c = library[n];
    const type = a.shapeType && a.shapeType !== "DEFAULT" ? a.shapeType : (c.attrs.shapeType || "DEFAULT");
    if (type === "LAYOUT") return layoutShape(n, a.Label);
    return genericShape({ name: shortName(n), ins: d.inputs, outs: d.outputs, label: a.Label, showPinLabels: true, width: c.attrs.Width || 3, topBottomBorder: SIZE2 + MAXLINETHICK, color: COLORS.CUSTOM_BG });
  }
  function missingShape(n) {
    return {
      pins: [], missing: true,
      draw(g) {
        g.poly([[0, 0], [160, 0], [160, 60], [0, 60]], true, fillStyle("#ffe0e0"));
        g.poly([[0, 0], [160, 0], [160, 60], [0, 60]], true, { w: 4, c: COLORS.ERROR });
        g.text([80, 22], n, "CENTERCENTER", { ...ST.SHAPE_PIN, c: COLORS.ERROR });
        g.text([80, 44], "arquivo ausente", "CENTERCENTER", { ...ST.SHAPE_SPLITTER, c: COLORS.ERROR });
      },
    };
  }
  function ioShape(a, isIn) {
    const small = !!a.small, outSize = small ? SIZE2 : OUT_SIZE, base = small ? ST.THIN : ST.NORMAL;
    const rad = outSize - 6, label = a.Label || "";
    return {
      pins: [{ name: isIn ? "out" : "in", bits: bitsOf(a), dir: isIn ? "out" : "in", x: 0, y: 0 }],
      dynamic: true,
      draw(g, v) {
        let style = base;
        if (isIn) {
          const box = [[-outSize * 2 - 1, -outSize], [-1, -outSize], [-1, outSize], [-outSize * 2 - 1, outSize]];
          g.poly(box, true, fillStyle(COLORS.BG));
          if (v) {
            style = wireStyle(v);
            if (v.bits > 1) g.text([-1 - outSize, -4 - outSize], formatValue(v, a.intFormat), "CENTERBOTTOM", ST.NORMAL);
          }
          g.poly(box, true, ST.NORMAL);
          g.circle([-1 - outSize - rad, -rad], [-1 - outSize + rad, rad], style);
          g.text([-outSize * 3, 0], label, "RIGHTCENTER", ST.INOUT);
        } else {
          if (v) {
            style = wireStyle(v);
            if (v.bits > 1) g.text([1 + outSize, -4 - outSize], formatValue(v, a.intFormat), "CENTERBOTTOM", ST.NORMAL);
          }
          g.circle([1 + outSize - outSize, -outSize], [1 + outSize + outSize, outSize], fillStyle(COLORS.BG));
          g.circle([1 + outSize - rad, -rad], [1 + outSize + rad, rad], style);
          g.circle([1 + outSize - outSize, -outSize], [1 + outSize + outSize, outSize], ST.NORMAL);
          g.text([outSize * 3, 0], label, "LEFTCENTER", ST.INOUT);
        }
      },
    };
  }
  function clockShape(a) {
    const small = !!a.small, outSize = small ? SIZE2 : OUT_SIZE, ws = Math.trunc(outSize / 3), label = a.Label || "";
    return {
      pins: [{ name: "C", bits: 1, dir: "out", x: 0, y: 0 }],
      dynamic: true,
      draw(g, v) {
        const box = [[-outSize * 2 - 1, -outSize], [-1, -outSize], [-1, outSize], [-outSize * 2 - 1, outSize]];
        g.poly(box, true, fillStyle(v ? wireStyle(v).c : COLORS.BG));
        g.poly(box, true, ST.NORMAL);
        g.text([-outSize * 3, 0], label, "RIGHTCENTER", ST.INOUT);
        const p = [-outSize - ws * 2, ws];
        g.poly([[p[0], p[1]], [p[0] + ws, p[1]], [p[0] + ws, p[1] - 2 * ws], [p[0] + 2 * ws, p[1] - 2 * ws], [p[0] + 2 * ws, p[1]], [p[0] + 3 * ws, p[1]], [p[0] + 3 * ws, p[1] - 2 * ws], [p[0] + 4 * ws, p[1] - 2 * ws]], false, ST.THIN);
      },
    };
  }

  // ---------------------------------------------------------------- SVG graphics with Digital's transform/text rules
  const ORI = ["LEFTBOTTOM", "CENTERBOTTOM", "RIGHTBOTTOM", "RIGHTCENTER", "RIGHTTOP", "CENTERTOP", "LEFTTOP", "LEFTCENTER", "CENTERCENTER"];
  const ORI_XY = { LEFTBOTTOM: [0, 0], CENTERBOTTOM: [1, 0], RIGHTBOTTOM: [2, 0], RIGHTCENTER: [2, 1], RIGHTTOP: [2, 2], CENTERTOP: [1, 2], LEFTTOP: [0, 2], LEFTCENTER: [0, 1], CENTERCENTER: [1, 1] };
  const rotOri = (o, n) => { if (o === "CENTERCENTER") return o; let p = ORI.indexOf(o) + n * 2; p = ((p % 8) + 8) % 8; return ORI[p]; };
  const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  class Gfx {
    constructor(x, y, rot) {
      this.out = [];
      const t = [[1, 0], [0, 1], [0, -1], [-1, 0]][rot || 0]; // [sin, cos]
      const sin = [0, 1, 0, -1][rot || 0], cos = [1, 0, -1, 0][rot || 0];
      this.tf = p => [p[0] * cos + p[1] * sin + x, -p[0] * sin + p[1] * cos + y];
      void t;
    }
    attrs(s, fill) {
      const stroke = s.w > 0 ? `stroke="${s.c}" stroke-width="${s.w}"` : `stroke="none"`;
      return `${stroke} fill="${fill ? s.c : "none"}"`;
    }
    line(p1, p2, s) {
      const a = this.tf(p1), b = this.tf(p2);
      this.out.push(`<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="${s.c}" stroke-width="${s.w}" stroke-linecap="square"/>`);
    }
    poly(pts, closed, s) {
      const d = pts.map(p => this.tf(p).join(",")).join(" ");
      const tag = closed ? "polygon" : "polyline";
      this.out.push(`<${tag} points="${d}" ${this.attrs(s, s.fill && closed)} stroke-linejoin="miter"/>`);
    }
    circle(p1, p2, s) {
      const a = this.tf(p1), b = this.tf(p2);
      const cx = (a[0] + b[0]) / 2, cy = (a[1] + b[1]) / 2, rx = Math.abs(a[0] - b[0]) / 2, ry = Math.abs(a[1] - b[1]) / 2;
      if (s.fill) this.out.push(`<ellipse cx="${cx}" cy="${cy}" rx="${rx + 1}" ry="${ry + 1}" fill="${s.c}" stroke="none"/>`);
      else this.out.push(`<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="none" stroke="${s.c}" stroke-width="${s.w}"/>`);
    }
    text(p, text, ori, s) { this.text3(p, [p[0] + 1, p[1]], text, ori, s, true); }
    text3(p, p2, text, ori, s, fromSimple) {
      if (text === undefined || text === null || text === "") return;
      // Graphic.drawText(p1, p2, ...) computes p3 = p1 + orthogonal(p2 - p1)
      const d = [p2[0] - p[0], p2[1] - p[1]];
      const p3 = [p[0] + d[1], p[1] - d[0]];
      void fromSimple;
      const P1 = this.tf(p), P2 = this.tf(p2), P3 = this.tf(p3);
      let o = ori, rotate = false;
      if (P1[1] === P2[1]) { if (P1[0] > P2[0]) o = rotOri(o, 2); }
      else { if (P1[1] < P2[1]) o = rotOri(o, 2); rotate = true; }
      let [ox, oy] = ORI_XY[o];
      // getMirrorYOrientation
      const D0 = [P2[1] - P1[1], -(P2[0] - P1[0])];
      const D1 = [P3[0] - P1[0], P3[1] - P1[1]];
      if (D0[0] * D1[0] + D0[1] * D1[1] < 0) oy = 2 - oy;
      const anchor = ["start", "middle", "end"][ox];
      const h = s.fs * 1.16;
      const yoff = h * oy / 3;
      const style = `font-size:${s.fs}px;${s.italic ? "font-style:italic;" : ""}`;
      const tr = rotate ? ` transform="rotate(-90 ${P1[0]} ${P1[1]})"` : "";
      this.out.push(`<text x="${P1[0]}" y="${P1[1] + yoff}" text-anchor="${anchor}" fill="${s.c}" style="${style}"${tr}>${esc(text)}</text>`);
    }
  }

  // ---------------------------------------------------------------- per-circuit geometry (cached)
  const geomCache = {};
  function geometry(file) {
    if (geomCache[file]) return geomCache[file];
    const c = library[file];
    const els = c.elements.map(el => {
      const shape = shapeFor(el);
      const rot = el.attrs.rotation || 0;
      const g = new Gfx(el.x, el.y, rot);
      const pins = shape.pins.map(p => { const w = g.tf([p.x, p.y]); return { ...p, wx: w[0], wy: w[1] }; });
      return { el, shape, rot, pins };
    });
    // points -> local net via union-find on wire endpoints
    const key = (x, y) => x + "," + y;
    const parent = {};
    const find = k => { while (parent[k] !== k) { parent[k] = parent[parent[k]]; k = parent[k]; } return k; };
    const add = k => { if (!(k in parent)) parent[k] = k; };
    const union = (a, b) => { add(a); add(b); const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb; };
    c.wires.forEach(w => union(key(w.x1, w.y1), key(w.x2, w.y2)));
    els.forEach(e => e.pins.forEach(p => add(key(p.wx, p.wy))));
    // dots: points where more than two wire ends meet
    const ends = {};
    c.wires.forEach(w => { [key(w.x1, w.y1), key(w.x2, w.y2)].forEach(k => ends[k] = (ends[k] || 0) + 1); });
    const dots = Object.entries(ends).filter(([, n]) => n > 2).map(([k]) => k.split(",").map(Number));
    // bounding box
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const grow = (x, y) => { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); };
    c.wires.forEach(w => { grow(w.x1, w.y1); grow(w.x2, w.y2); });
    els.forEach(e => { grow(e.el.x, e.el.y); e.pins.forEach(p => grow(p.wx, p.wy)); });
    const geo = { file, els, wires: c.wires, find, key, parent, dots, bbox: { minX, minY, maxX, maxY } };
    geomCache[file] = geo;
    return geo;
  }

  // ---------------------------------------------------------------- simulation model
  class Sim {
    constructor(topFile) {
      this.nets = [];          // {v, z, bits, drivers:[comp output refs], listeners:Set<comp>, conflict}
      this.comps = [];
      this.clocks = [];
      this.inputs = [];
      this.resets = [];
      this.uf = [];            // global union-find over "nodes"
      this.top = this.instantiate(topFile, "", null);
      this.compressNets();
      this.init();
    }
    newNode() { this.uf.push(this.uf.length); return this.uf.length - 1; }
    find(n) { while (this.uf[n] !== n) { this.uf[n] = this.uf[this.uf[n]]; n = this.uf[n]; } return n; }
    union(a, b) { const ra = this.find(a), rb = this.find(b); if (ra !== rb) this.uf[ra] = rb; }

    instantiate(file, path, label) {
      const geo = geometry(file);
      const isTop = path === "";
      const inst = { file, path, label, geo, localNode: {}, children: {}, exports: {}, elNodes: [] };
      const nodeFor = k => { const r = geo.find(k); if (!(r in inst.localNode)) inst.localNode[r] = this.newNode(); return inst.localNode[r]; };
      inst.nodeAt = (x, y) => nodeFor(geo.key(x, y));
      geo.els.forEach((e, idx) => {
        const pinNodes = {};
        e.pins.forEach(p => { pinNodes[p.name] = { node: nodeFor(geo.key(p.wx, p.wy)), bits: p.bits, dir: p.dir }; });
        inst.elNodes[idx] = pinNodes;
        const n = e.el.name, a = e.el.attrs;
        if (!isTop && (n === "In" || n === "Clock" || n === "Out")) {
          inst.exports[a.Label || ""] = pinNodes[n === "Out" ? "in" : (n === "Clock" ? "C" : "out")].node;
          return;
        }
        if (e.shape.missing) return;
        if (library[n]) {
          const child = this.instantiate(n, path + "/" + idx, a.Label || shortName(n));
          inst.children[idx] = child;
          for (const [pname, pn] of Object.entries(pinNodes)) {
            if (pname in child.exports) this.union(pn.node, child.exports[pname]);
          }
          return;
        }
        const comp = makeComp(n, a, pinNodes, this, inst, idx);
        if (comp) this.comps.push(comp);
      });
      return inst;
    }

    compressNets() {
      const map = new Map();
      for (let i = 0; i < this.uf.length; i++) {
        const r = this.find(i);
        if (!map.has(r)) { map.set(r, this.nets.length); this.nets.push({ v: 0, z: 1, bits: 1, drivers: [], listeners: [], conflict: false }); }
      }
      this.nodeNet = i => map.get(this.find(i));
      for (const c of this.comps) {
        for (const p of c.ins) { p.net = this.nets[this.nodeNet(p.node)]; p.net.listeners.push(c); p.net.bits = Math.max(p.net.bits, p.bits); }
        for (const p of c.outs) { p.net = this.nets[this.nodeNet(p.node)]; p.net.drivers.push(p); p.net.bits = Math.max(p.net.bits, p.bits); p.v = 0; p.z = (1 << p.bits) - 1; }
      }
      // nets that only connect to In/Out of subcircuits still need a width for drawing
      const setBits = inst => {
        inst.geo.els.forEach((e, idx) => {
          const pins = inst.elNodes[idx]; if (!pins) return;
          for (const p of Object.values(pins)) { const net = this.nets[this.nodeNet(p.node)]; net.bits = Math.max(net.bits, p.bits); }
        });
        Object.values(inst.children).forEach(setBits);
      };
      setBits(this.top);
      for (const n of this.nets) n.z = (2 ** n.bits) - 1;
    }

    resolve(net) {
      let v = 0, z = (2 ** net.bits) - 1, active = 0, conflict = false;
      for (const d of net.drivers) {
        const dz = d.z | (~((2 ** d.bits) - 1) & ((2 ** net.bits) - 1));
        const driven = ~dz & ((2 ** net.bits) - 1);
        if (driven === 0) continue;
        if (active & driven) { if (((v ^ d.v) & active & driven) !== 0) conflict = true; }
        v |= d.v & driven; active |= driven; z &= ~driven;
      }
      const changed = v !== net.v || z !== net.z || conflict !== net.conflict;
      net.v = v; net.z = z; net.conflict = conflict;
      return changed;
    }

    init() {
      this.steps = 0; this.oscillating = false;
      for (const n of this.nets) this.resolve(n);
      this.resets.forEach(r => r.active());
      this.queue = new Set(this.comps);
      // Like Digital's Model.init(): the first step runs with "noise" (random order,
      // each node writes immediately) so symmetric latches settle into a real state.
      this.settle(4000, true);
      this.resets.forEach(r => { r.release(); this.queue.add(r); });
      this.settle();
    }

    // Net changed: wake delayed listeners for the next micro step, run zero-delay ones now.
    propagate(net) {
      if (!this.resolve(net)) return;
      for (const l of net.listeners) {
        if (l.zeroDelay) { l.read(); l.write(); this.flush(l); }
        else this.queue.add(l);
      }
    }
    flush(c) { for (const o of c.outs) if (o.changed) { o.changed = false; this.propagate(o.net); } }

    settle(maxSteps = 4000, noise = false) {
      let steps = 0;
      while (this.queue.size) {
        if (++steps > maxSteps) { this.oscillating = true; this.queue.clear(); break; }
        const batch = [...this.queue]; this.queue.clear();
        if (noise) {
          for (let i = batch.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [batch[i], batch[j]] = [batch[j], batch[i]]; }
          for (const c of batch) { c.read(); c.write(); this.flush(c); }
          continue;
        }
        for (const c of batch) c.read();
        for (const c of batch) { c.write(); this.flush(c); }
      }
      this.steps += steps;
      return steps;
    }
    poke(comp) { this.queue.add(comp); this.settle(); }
    // In Digital every real-time Clock runs on its own timer, so the clocks never
    // change in the same step: each one toggles and the circuit settles before the
    // next. This circuit relies on that to get a delayed copy of the clock ("clk d").
    clockTick() {
      for (const c of this.clocks) { c.value ^= 1; this.queue.add(c); this.settle(); }
    }
    netOf(inst, x, y) { return this.nets[this.nodeNet(inst.nodeAt(x, y))]; }
  }

  // read helpers
  const rd = p => (p.net ? p.net.v & ((2 ** p.bits) - 1) : 0);
  const rz = p => (p.net ? (p.net.z & ((2 ** p.bits) - 1)) === ((2 ** p.bits) - 1) : true);
  const setOut = (o, v, z) => {
    const m = (2 ** o.bits) - 1;
    v = (v & m) >>> 0; z = z === true ? m : z === false ? 0 : (z & m) >>> 0;
    if (o.v !== v || o.z !== z) { o.v = v; o.z = z; o.changed = true; }
  };

  function makeComp(n, a, pinNodes, sim, inst, idx) {
    const d = describe(n, a);
    const ins = d.inputs.map(p => ({ name: p.name, bits: p.bits, node: pinNodes[p.name].node }));
    const outs = d.outputs.map(p => ({ name: p.name, bits: p.bits, node: pinNodes[p.name].node }));
    const c = { type: n, ins, outs, inst, idx, read() {}, write() {} };
    const bits = bitsOf(a), mask = (2 ** bits) - 1;
    switch (n) {
      case "And": case "NAnd": case "Or": case "NOr": case "XOr": case "XNOr": {
        let vals = [];
        c.read = () => { vals = ins.map(rd); };
        c.write = () => {
          let r;
          if (n === "And" || n === "NAnd") r = vals.reduce((x, y) => x & y, mask);
          else if (n === "Or" || n === "NOr") r = vals.reduce((x, y) => x | y, 0);
          else r = vals.reduce((x, y) => x ^ y, 0);
          if (n[0] === "N" || n === "XNOr") r = ~r;
          setOut(outs[0], r, false);
        };
        break;
      }
      case "Not": { let v = 0; c.read = () => { v = rd(ins[0]); }; c.write = () => setOut(outs[0], ~v, false); break; }
      case "Const": c.write = () => setOut(outs[0], a.Value ?? 1, false); break;
      case "In": {
        c.value = a.Default || 0; c.attrs = a;
        c.write = () => setOut(outs[0], c.value, false);
        sim.inputs.push(c); break;
      }
      case "Clock": c.value = 0; c.write = () => setOut(outs[0], c.value, false); sim.clocks.push(c); break;
      case "Reset": {
        // Digital: output = !invertOutput during start-up, invertOutput afterwards (invertOutput defaults to true)
        const inv = a.invertOutput ?? true;
        c.active = () => { c.value = inv ? 0 : 1; };
        c.release = () => { c.value = inv ? 1 : 0; };
        c.active();
        c.write = () => setOut(outs[0], c.value, false); sim.resets.push(c); break;
      }
      case "Out": return null;
      case "Driver": {
        let v = 0, sel = 0;
        c.read = () => { v = rd(ins[0]); sel = rd(ins[1]); };
        c.write = () => setOut(outs[0], v, !sel);
        break;
      }
      case "Splitter": {
        // Digital implements the splitter with NodeWithoutDelay: it copies bits
        // (including per-bit high-Z) the moment an input changes.
        c.zeroDelay = true;
        let total = 0, zmask = 0;
        c.read = () => {
          total = 0; zmask = 0;
          d.inputs.forEach((p, i) => {
            const net = ins[i].net, m = (2 ** p.bits) - 1;
            total += ((net ? net.v : 0) & m) * 2 ** p.pos;
            zmask += ((net ? net.z : m) & m) * 2 ** p.pos;
          });
        };
        c.write = () => d.outputs.forEach((p, i) => {
          const m = 2 ** p.bits;
          setOut(outs[i], Math.floor(total / 2 ** p.pos) % m, Math.floor(zmask / 2 ** p.pos) % m);
        });
        break;
      }
      case "D_FF": {
        let last = 0, q = 0, dIn = 0, clk = 0;
        c.read = () => { dIn = rd(ins[0]); clk = rd(ins[1]); if (clk && !last) q = dIn; last = clk; };
        c.write = () => { setOut(outs[0], q, false); setOut(outs[1], ~q, false); };
        break;
      }
      case "Decoder": { let s = 0; c.read = () => { s = rd(ins[0]); }; c.write = () => outs.forEach((o, i) => setOut(o, s === i ? 1 : 0, false)); break; }
      case "Comparator": {
        let x = 0, y = 0;
        c.read = () => { x = rd(ins[0]); y = rd(ins[1]); };
        c.write = () => { setOut(outs[0], x === y ? 1 : 0, false); setOut(outs[1], x > y ? 1 : 0, false); setOut(outs[2], x < y ? 1 : 0, false); };
        break;
      }
      case "Add": {
        let s = 0;
        c.read = () => { s = rd(ins[0]) + rd(ins[1]) + rd(ins[2]); };
        c.write = () => { setOut(outs[0], s, false); setOut(outs[1], s > mask ? 1 : 0, false); };
        break;
      }
      case "RAMDualPort": {
        const mem = new Uint32Array(2 ** (a.AddrBits || 8));
        let last = 0, ld = 0, addr = 0;
        c.mem = mem;
        c.read = () => {
          const clk = rd(ins[3]); let str = 0, data = 0;
          if (!last && clk) { str = rd(ins[2]); if (str) data = rd(ins[1]); }
          ld = rd(ins[4]);
          if (ld || str) addr = rd(ins[0]);
          if (str) mem[addr] = data;
          last = clk;
        };
        c.write = () => setOut(outs[0], ld ? mem[addr] : 0, !ld);
        c.addr = () => addr;
        break;
      }
      default: return null;
    }
    return c;
  }

  // ---------------------------------------------------------------- view
  class View {
    constructor(svg, sim, onNavigate) {
      this.svg = svg; this.sim = sim; this.onNavigate = onNavigate;
      this.vb = { x: 0, y: 0, w: 1000, h: 800 };
      this.bindPanZoom();
    }
    show(inst) {
      this.inst = inst;
      const geo = inst.geo;
      const parts = [];
      // wires
      parts.push(`<g class="wires">`);
      geo.wires.forEach((w, i) => parts.push(`<line data-w="${i}" x1="${w.x1}" y1="${w.y1}" x2="${w.x2}" y2="${w.y2}" stroke-width="4" stroke-linecap="round"/>`));
      parts.push(`</g><g class="wirelabels"></g><g class="dots"></g>`);
      // elements
      parts.push(`<g class="els">`);
      geo.els.forEach((e, idx) => {
        const clickable = library[e.el.name] ? " sub" : (e.el.name === "In" && inst.path === "") || (e.el.name === "Clock" && inst.path === "") || e.el.name === "RAMDualPort" ? " io" : "";
        const g = new Gfx(e.el.x, e.el.y, e.rot);
        e.shape.draw(g, null);
        const title = library[e.el.name] ? `<title>Abrir ${esc(shortName(e.el.name))}</title>` : "";
        parts.push(`<g data-el="${idx}" class="el${clickable}">${title}${g.out.join("")}</g>`);
      });
      parts.push(`</g>`);
      this.svg.innerHTML = parts.join("");
      this.wireEls = [...this.svg.querySelectorAll(".wires line")];
      this.wireNets = geo.wires.map(w => this.sim.netOf(inst, w.x1, w.y1));
      this.dotG = this.svg.querySelector(".dots");
      this.labelG = this.svg.querySelector(".wirelabels");
      this.dotNets = geo.dots.map(([x, y]) => ({ x, y, net: this.sim.netOf(inst, x, y) }));
      this.dynEls = [];
      geo.els.forEach((e, idx) => {
        if (!e.shape.dynamic) return;
        const p = e.pins[0];
        this.dynEls.push({ e, idx, node: this.svg.querySelector(`[data-el="${idx}"]`), net: this.sim.netOf(inst, p.wx, p.wy), last: "" });
      });
      this.fit();
      this.update();
    }
    update() {
      const nv = n => ({ v: n.v, bits: n.bits, z: n.z });
      this.wireEls.forEach((l, i) => {
        const n = this.wireNets[i];
        const s = n.conflict ? { c: COLORS.ERROR } : wireStyle(n.bits > 1 ? { bits: n.bits } : { v: n.v, bits: 1, z: n.z });
        if (l._c !== s.c) { l.setAttribute("stroke", s.c); l._c = s.c; }
      });
      let dots = "";
      for (const d of this.dotNets) {
        const s = d.net.conflict ? { c: COLORS.ERROR } : wireStyle(d.net.bits > 1 ? { bits: d.net.bits } : { v: d.net.v, bits: 1, z: d.net.z });
        dots += `<circle cx="${d.x}" cy="${d.y}" r="5" fill="${s.c}"/>`;
      }
      if (this.dotG._h !== dots) { this.dotG.innerHTML = dots; this.dotG._h = dots; }
      // values on long horizontal bus wires
      let labels = "";
      this.inst.geo.wires.forEach((w, i) => {
        const n = this.wireNets[i];
        if (n.bits > 1 && w.y1 === w.y2 && Math.abs(w.x1 - w.x2) > SIZE * 4) {
          const mx = Math.floor(((w.x1 + w.x2) / 2 + SIZE2) / SIZE) * SIZE - SIZE2;
          labels += `<text x="${mx}" y="${w.y1 - 3}" text-anchor="middle" fill="${COLORS.WIRE_VALUE}" style="font-size:12px">${esc(formatValue(nv(n)))}</text>`;
        }
      });
      if (this.labelG._h !== labels) { this.labelG.innerHTML = labels; this.labelG._h = labels; }
      for (const d of this.dynEls) {
        const v = { v: d.net.v, z: d.net.z, bits: d.net.bits };
        const k = v.v + "/" + v.z;
        if (k === d.last) continue;
        d.last = k;
        const g = new Gfx(d.e.el.x, d.e.el.y, d.e.rot);
        d.e.shape.draw(g, v);
        const title = d.node.querySelector("title");
        d.node.innerHTML = (title ? title.outerHTML : "") + g.out.join("");
      }
    }
    fit() {
      const b = this.inst.geo.bbox, pad = 80;
      this.vb = { x: b.minX - pad - 60, y: b.minY - pad, w: (b.maxX - b.minX) + 2 * pad + 120, h: (b.maxY - b.minY) + 2 * pad };
      const r = this.svg.getBoundingClientRect();
      if (r.width && r.height) {
        const ar = r.width / r.height;
        if (this.vb.w / this.vb.h < ar) { const nw = this.vb.h * ar; this.vb.x -= (nw - this.vb.w) / 2; this.vb.w = nw; }
        else { const nh = this.vb.w / ar; this.vb.y -= (nh - this.vb.h) / 2; this.vb.h = nh; }
      }
      this.applyVB();
    }
    applyVB() { this.svg.setAttribute("viewBox", `${this.vb.x} ${this.vb.y} ${this.vb.w} ${this.vb.h}`); }
    zoom(f, cx, cy) {
      const r = this.svg.getBoundingClientRect();
      const px = this.vb.x + (cx - r.left) / r.width * this.vb.w, py = this.vb.y + (cy - r.top) / r.height * this.vb.h;
      this.vb.w *= f; this.vb.h *= f;
      this.vb.x = px - (cx - r.left) / r.width * this.vb.w; this.vb.y = py - (cy - r.top) / r.height * this.vb.h;
      this.applyVB();
    }
    bindPanZoom() {
      const svg = this.svg;
      svg.addEventListener("wheel", e => { e.preventDefault(); this.zoom(Math.exp(e.deltaY * 0.0015), e.clientX, e.clientY); }, { passive: false });
      const pts = new Map(); let moved = 0, lastDist = 0;
      svg.addEventListener("pointerdown", e => { pts.set(e.pointerId, [e.clientX, e.clientY]); moved = 0; svg.setPointerCapture(e.pointerId); });
      svg.addEventListener("pointermove", e => {
        if (!pts.has(e.pointerId)) return;
        const prev = pts.get(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]);
        const r = svg.getBoundingClientRect();
        if (pts.size === 1) {
          const dx = e.clientX - prev[0], dy = e.clientY - prev[1];
          moved += Math.abs(dx) + Math.abs(dy);
          this.vb.x -= dx / r.width * this.vb.w; this.vb.y -= dy / r.height * this.vb.h; this.applyVB();
        } else if (pts.size === 2) {
          const [a, b] = [...pts.values()];
          const dist = Math.hypot(a[0] - b[0], a[1] - b[1]);
          if (lastDist) this.zoom(lastDist / dist, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
          lastDist = dist; moved += 10;
        }
      });
      const up = e => {
        const wasClick = pts.size === 1 && moved < 6;
        pts.delete(e.pointerId); if (pts.size < 2) lastDist = 0;
        if (wasClick && e.type === "pointerup") this.click(e);
      };
      svg.addEventListener("pointerup", up);
      svg.addEventListener("pointercancel", up);
    }
    click(e) {
      const target = document.elementFromPoint(e.clientX, e.clientY);
      const g = target && target.closest && target.closest("[data-el]");
      if (!g) return;
      const idx = +g.dataset.el, el = this.inst.geo.els[idx].el;
      this.onNavigate({ type: "element", inst: this.inst, idx, el, clientX: e.clientX, clientY: e.clientY });
    }
  }

  // names of referenced .dig files that are not in the library (recursively)
  function missingIn(file, seen = new Set()) {
    if (seen.has(file)) return []; seen.add(file);
    const out = [];
    for (const el of library[file].elements) {
      if (el.name.endsWith(".dig")) { if (!library[el.name]) out.push(el.name); else out.push(...missingIn(el.name, seen)); }
    }
    return out;
  }

  window.DigitalWeb = { missingIn, loadLibrary, library, Sim, View, shortName, formatValue, geometry };
})();
