
"use strict";

const Drawing = (() => {
  const ns = "http://www.w3.org/2000/svg";

  function el(name, attrs = {}, text = "") {
    const node = document.createElementNS(ns, name);
    Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, v));
    if (text) node.textContent = text;
    return node;
  }

  function clear(svg) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
  }

  function extent(values) {
    return [Math.min(...values), Math.max(...values)];
  }

  function scale(value, min, max, outMin, outMax) {
    if (max === min) return (outMin + outMax) / 2;
    return outMin + (value - min) * (outMax - outMin) / (max - min);
  }

  function drawPlan(svg, points, manholes) {
    clear(svg);
    if (points.length < 2) {
      svg.appendChild(el("text", { x: 500, y: 280, "text-anchor": "middle", fill: "#64748b" },
        "Shtoni së paku dy pika dhe gjeneroni projektin."));
      return;
    }

    const xs = points.map(p => p.x), ys = points.map(p => p.y);
    const [xmin, xmax] = extent(xs), [ymin, ymax] = extent(ys);
    const X = v => scale(v, xmin, xmax, 70, 930);
    const Y = v => scale(v, ymin, ymax, 500, 55);

    svg.appendChild(el("rect", { x: 0, y: 0, width: 1000, height: 560, fill: "#fbfdfe" }));

    for (let i = 0; i <= 10; i++) {
      const x = 70 + i * 86;
      svg.appendChild(el("line", { x1: x, y1: 55, x2: x, y2: 500, stroke: "#e6edf2" }));
    }
    for (let i = 0; i <= 8; i++) {
      const y = 55 + i * 55.6;
      svg.appendChild(el("line", { x1: 70, y1: y, x2: 930, y2: y, stroke: "#e6edf2" }));
    }

    const path = points.map((p, i) => `${i ? "L" : "M"} ${X(p.x)} ${Y(p.y)}`).join(" ");
    svg.appendChild(el("path", {
      d: path, fill: "none", stroke: "#0b6780", "stroke-width": 5,
      "stroke-linecap": "round", "stroke-linejoin": "round"
    }));

    points.forEach((p, i) => {
      svg.appendChild(el("circle", { cx: X(p.x), cy: Y(p.y), r: 5, fill: "#334155" }));
      svg.appendChild(el("text", { x: X(p.x)+7, y: Y(p.y)-7, fill: "#334155", "font-size": 12 }, p.id || `${i+1}`));
    });

    manholes.forEach(m => {
      svg.appendChild(el("circle", { cx: X(m.x), cy: Y(m.y), r: 9, fill: "#fff", stroke: "#b42318", "stroke-width": 3 }));
      svg.appendChild(el("text", { x: X(m.x)+11, y: Y(m.y)+4, fill: "#b42318", "font-size": 12, "font-weight": 700 }, m.id));
    });

    svg.appendChild(el("text", { x: 70, y: 530, fill: "#64748b", "font-size": 12 },
      `X: ${xmin.toFixed(2)} – ${xmax.toFixed(2)} m`));
  }

  function drawProfile(svg, survey, manholes) {
    clear(svg);
    if (survey.length < 2 || manholes.length < 2) {
      svg.appendChild(el("text", { x: 550, y: 280, "text-anchor": "middle", fill: "#64748b" },
        "Gjeneroni projektin për të shfaqur profilin."));
      return;
    }

    const width = 1100, height = 560;
    const left = 80, right = 35, top = 35, bottom = 80;
    const allZ = [...survey.map(p => p.z), ...manholes.map(m => m.invert)];
    let [zmin, zmax] = extent(allZ);
    const pad = Math.max(0.5, (zmax - zmin) * 0.12);
    zmin -= pad; zmax += pad;
    const maxCh = survey[survey.length - 1].chainage;

    const X = ch => scale(ch, 0, maxCh, left, width-right);
    const Y = z => scale(z, zmin, zmax, height-bottom, top);

    svg.appendChild(el("rect", { x: 0, y: 0, width, height, fill: "#fbfdfe" }));

    for (let i = 0; i <= 10; i++) {
      const ch = maxCh * i / 10;
      const x = X(ch);
      svg.appendChild(el("line", { x1: x, y1: top, x2: x, y2: height-bottom, stroke: "#e4ebf0" }));
      svg.appendChild(el("text", { x, y: height-bottom+24, "text-anchor": "middle", fill: "#64748b", "font-size": 11 }, ch.toFixed(1)));
    }

    for (let i = 0; i <= 8; i++) {
      const z = zmin + (zmax-zmin)*i/8;
      const y = Y(z);
      svg.appendChild(el("line", { x1: left, y1: y, x2: width-right, y2: y, stroke: "#e4ebf0" }));
      svg.appendChild(el("text", { x: left-10, y: y+4, "text-anchor": "end", fill: "#64748b", "font-size": 11 }, z.toFixed(2)));
    }

    const terrain = survey.map((p, i) => `${i ? "L" : "M"} ${X(p.chainage)} ${Y(p.z)}`).join(" ");
    svg.appendChild(el("path", { d: terrain, fill: "none", stroke: "#5c6f3e", "stroke-width": 3 }));

    const invert = manholes.map((m, i) => `${i ? "L" : "M"} ${X(m.chainage)} ${Y(m.invert)}`).join(" ");
    svg.appendChild(el("path", { d: invert, fill: "none", stroke: "#0b6780", "stroke-width": 4 }));

    manholes.forEach(m => {
      const x = X(m.chainage);
      svg.appendChild(el("line", { x1: x, y1: Y(m.z), x2: x, y2: Y(m.invert), stroke: "#b42318", "stroke-width": 2 }));
      svg.appendChild(el("circle", { cx: x, cy: Y(m.invert), r: 4, fill: "#0b6780" }));
      svg.appendChild(el("text", { x, y: height-bottom+43, "text-anchor": "middle", fill: "#334155", "font-size": 10 }, m.id));
    });

    svg.appendChild(el("text", { x: width/2, y: height-15, "text-anchor": "middle", fill: "#334155", "font-size": 13, "font-weight": 700 }, "Stacionazha [m]"));
    svg.appendChild(el("text", { x: 18, y: height/2, transform: `rotate(-90 18 ${height/2})`, "text-anchor": "middle", fill: "#334155", "font-size": 13, "font-weight": 700 }, "Kuota [m]"));

    svg.appendChild(el("line", { x1: 820, y1: 22, x2: 860, y2: 22, stroke: "#5c6f3e", "stroke-width": 3 }));
    svg.appendChild(el("text", { x: 868, y: 26, fill: "#334155", "font-size": 12 }, "Terreni"));
    svg.appendChild(el("line", { x1: 930, y1: 22, x2: 970, y2: 22, stroke: "#0b6780", "stroke-width": 4 }));
    svg.appendChild(el("text", { x: 978, y: 26, fill: "#334155", "font-size": 12 }, "Fundi i gypit"));
  }

  function downloadSvg(svg, filename) {
    const clone = svg.cloneNode(true);
    clone.setAttribute("xmlns", ns);
    const blob = new Blob([new XMLSerializer().serializeToString(clone)], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  return { drawPlan, drawProfile, downloadSvg };
})();
