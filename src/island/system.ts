// The "Sistema" tab: CPU, memory, disks, network and battery. Asked from Rust
// once a second while the tab is open; nothing is measured otherwise.

import { Bridge, IN_APP, type Stats } from "../shared/bridge";
import { h } from "../shared/dom";
import { settings, type MeterId } from "../shared/settings";

const KEEP = 60;
// Recent history survives switching tabs.
const hist = { cpu: [] as number[], ram: [] as number[], down: [] as number[], up: [] as number[] };

function push(list: number[], v: number) {
  list.push(v);
  if (list.length > KEEP) list.shift();
}

export function bytes(n: number, digits = 1): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(i < 2 ? 0 : digits)} ${units[i]}`;
}

const rate = (n: number) => `${bytes(n)}/s`;

// Several cards may ask at once: one reading a second for all of them (the CPU
// load is measured between two readings, so asking too often spoils it).
let latest: { at: number; p: Promise<Stats | null> } | null = null;
export function statsNow(): Promise<Stats | null> {
  if (!IN_APP) return Promise.resolve(fake());
  const now = Date.now();
  if (!latest || now - latest.at > 800) latest = { at: now, p: Bridge.systemStats() };
  return latest.p;
}

function uptime(secs: number): string {
  const d = Math.floor(secs / 86400);
  const hrs = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return d ? `${d} d ${hrs} h` : hrs ? `${hrs} h ${m} min` : `${m} min`;
}

const NS = "http://www.w3.org/2000/svg";
function svg(tag: string, attrs: Record<string, string | number>): SVGElement {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

/** A ring that fills with a percentage. */
function ring(size: number) {
  const r = size / 2 - 6;
  const len = 2 * Math.PI * r;
  const root = svg("svg", { viewBox: `0 0 ${size} ${size}`, width: size, height: size, class: "ring" }) as SVGSVGElement;
  root.append(svg("circle", { cx: size / 2, cy: size / 2, r, class: "ring-track" }));
  const arc = svg("circle", {
    cx: size / 2, cy: size / 2, r, class: "ring-fill",
    "stroke-dasharray": `${len} ${len}`, "stroke-dashoffset": len,
    transform: `rotate(-90 ${size / 2} ${size / 2})`,
  });
  root.append(arc);
  return {
    el: root,
    set(pct: number) {
      const p = Math.max(0, Math.min(100, pct));
      arc.setAttribute("stroke-dashoffset", String(len * (1 - p / 100)));
      arc.classList.toggle("hot", p >= 85);
    },
  };
}

/** A small area chart of recent values. */
function spark(lines = 1) {
  const W = 200;
  const H = 46;
  const root = svg("svg", { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: "none", class: "spark" }) as SVGSVGElement;
  const paths = Array.from({ length: lines }, (_, i) => {
    const area = svg("path", { class: `spark-area s${i}` });
    const line = svg("path", { class: `spark-line s${i}` });
    root.append(area, line);
    return { area, line };
  });
  return {
    el: root,
    set(series: number[][], max: number) {
      series.forEach((values, i) => {
        if (!paths[i] || values.length < 2) return;
        // The chart fills from the left over the first minute, then scrolls.
        const step = W / (KEEP - 1);
        const x0 = 0;
        const pts = values.map((v, j) => `${(x0 + j * step).toFixed(1)},${(H - 2 - (Math.min(v, max) / (max || 1)) * (H - 6)).toFixed(1)}`);
        paths[i].line.setAttribute("d", `M${pts.join("L")}`);
        const xEnd = (x0 + (values.length - 1) * step).toFixed(1);
        paths[i].area.setAttribute("d", `M${x0},${H}L${pts.join("L")}L${xEnd},${H}Z`);
      });
    },
  };
}

function meterCard(cls: string, title: string, ...body: Node[]) {
  return h("div", { class: `meter ${cls}` }, h("span", { class: "meter-title", text: title }), ...body);
}

/** The whole monitor, or just one meter (for a card on the Home page). */
export function systemModule(only?: MeterId) {
  const on: Record<MeterId, boolean> = only
    ? { cpu: false, ram: false, disk: false, net: false, battery: false, [only]: true }
    : settings().meters;
  const el = h("section", { class: only ? "module system single" : "module system" });
  const parts: ((s: Stats) => void)[] = [];

  if (on.cpu) {
    const r = ring(78);
    const pct = h("b", { class: "ring-num" });
    const name = h("span", { class: "meter-sub" });
    const sp = spark();
    const cores = h("div", { class: "cores" });
    el.append(meterCard("cpu", "CPU", h("div", { class: "meter-top" }, h("div", { class: "ring-box" }, r.el, pct), h("div", { class: "meter-side" }, name, cores)), sp.el));
    parts.push((s) => {
      push(hist.cpu, s.cpu);
      r.set(s.cpu);
      pct.textContent = `${Math.round(s.cpu)}%`;
      name.textContent = s.cpuName.replace(/\s+/g, " ").replace(/\(R\)|\(TM\)|CPU|Processor|\d+-Core|\d+(st|nd|rd|th) Gen/gi, "").replace(/@.*$/, "").trim();
      if (cores.childElementCount !== s.cores.length) {
        cores.replaceChildren(...s.cores.map(() => h("i", {})));
      }
      s.cores.forEach((c, i) => ((cores.children[i] as HTMLElement).style.height = `${Math.max(6, c)}%`));
      sp.set([hist.cpu], 100);
    });
  }

  if (on.ram) {
    const r = ring(78);
    const pct = h("b", { class: "ring-num" });
    const used = h("span", { class: "meter-big" });
    const total = h("span", { class: "meter-sub" });
    const sp = spark();
    el.append(meterCard("ram", "Memoria", h("div", { class: "meter-top" }, h("div", { class: "ring-box" }, r.el, pct), h("div", { class: "meter-side" }, used, total)), sp.el));
    parts.push((s) => {
      const p = s.memTotal ? (s.memUsed / s.memTotal) * 100 : 0;
      push(hist.ram, p);
      r.set(p);
      pct.textContent = `${Math.round(p)}%`;
      used.textContent = `${bytes(s.memUsed)} en uso`;
      total.textContent = `de ${bytes(s.memTotal)} · libres ${bytes(s.memTotal - s.memUsed)}`;
      sp.set([hist.ram], 100);
    });
  }

  if (on.net) {
    const down = h("b", {});
    const up = h("b", {});
    const sp = spark(2);
    el.append(meterCard("net", "Red",
      h("div", { class: "net-rates" },
        h("div", { class: "net-rate" }, h("span", { class: "net-arrow down", text: "↓" }), h("div", {}, down, h("span", { text: "Bajada" }))),
        h("div", { class: "net-rate" }, h("span", { class: "net-arrow up", text: "↑" }), h("div", {}, up, h("span", { text: "Subida" }))),
      ),
      sp.el,
    ));
    parts.push((s) => {
      push(hist.down, s.down);
      push(hist.up, s.up);
      down.textContent = rate(s.down);
      up.textContent = rate(s.up);
      // Scale to the busiest recent moment, at least 64 KB/s so silence looks flat.
      sp.set([hist.down, hist.up], Math.max(65536, ...hist.down, ...hist.up));
    });
  }

  if (on.disk) {
    const list = h("div", { class: "disks" });
    el.append(meterCard("disk", "Discos", list));
    let shown = "";
    parts.push((s) => {
      const key = s.disks.map((d) => d.mount).join("|");
      if (key !== shown) {
        shown = key;
        list.replaceChildren(...s.disks.map((d) =>
          h("div", { class: "disk", "data-mount": d.mount },
            h("div", { class: "disk-head" }, h("b", { text: d.mount }), h("span", { class: "disk-label" }), h("span", { class: "disk-free" })),
            h("div", { class: "disk-bar" }, h("i", {})),
          )));
        if (!s.disks.length) list.append(h("span", { class: "meter-sub", text: "Sin discos a la vista." }));
      }
      s.disks.forEach((d, i) => {
        const row = list.children[i] as HTMLElement | undefined;
        if (!row) return;
        const p = d.total ? (d.used / d.total) * 100 : 0;
        (row.querySelector(".disk-label") as HTMLElement).textContent = d.label && d.label !== d.mount ? d.label : d.removable ? "Extraíble" : "";
        (row.querySelector(".disk-free") as HTMLElement).textContent = `${bytes(d.total - d.used)} libres de ${bytes(d.total, 0)}`;
        const bar = row.querySelector(".disk-bar i") as HTMLElement;
        bar.style.width = `${p.toFixed(1)}%`;
        bar.classList.toggle("hot", p >= 90);
      });
    });
  }

  if (on.battery) {
    const pct = h("b", { class: "batt-num" });
    const what = h("span", { class: "meter-sub" });
    const level = h("i", {});
    const up = h("span", { class: "meter-sub" });
    el.append(meterCard("battery", "Energía", h("div", { class: "batt" }, h("div", { class: "batt-body" }, level), h("div", {}, pct, what)), up));
    parts.push((s) => {
      const b = s.battery;
      if (b) {
        pct.textContent = `${b.percent}%`;
        what.textContent = b.charging ? "Cargando" : b.plugged ? "Conectado" : "Con batería";
        level.style.width = `${b.percent}%`;
        level.classList.toggle("low", b.percent <= 20 && !b.plugged);
      } else {
        pct.textContent = "Enchufado";
        what.textContent = "Sin batería: un PC de escritorio";
        level.style.width = "100%";
      }
      up.textContent = `Encendido hace ${uptime(s.uptime)}`;
    });
  }

  if (!parts.length) {
    el.append(h("div", { class: "music-empty" }, h("h3", { text: "Sin medidores" }), h("p", { text: "Actívalos en Ajustes → Sistema." })));
  }
  el.classList.add(`n${parts.length}`);

  let asking = false;
  const ask = async () => {
    if (asking || !parts.length) return;
    asking = true;
    const s = await statsNow();
    asking = false;
    if (s && el.isConnected) for (const p of parts) p(s);
  };
  void ask();
  return { el, tick: () => void ask() };
}

// A pretend machine, for working on the looks in a plain browser.
let t = 0;
function fake(): Stats {
  t++;
  const wave = (k: number) => 30 + 25 * Math.sin(t / k) + Math.random() * 15;
  return {
    cpu: wave(5), cores: Array.from({ length: 8 }, (_, i) => wave(3 + i)), cpuName: "Intel(R) Core(TM) i7-1165G7 @ 2.80GHz",
    memTotal: 16 * 2 ** 30, memUsed: (9 + Math.sin(t / 9)) * 2 ** 30,
    disks: [{ mount: "C:", label: "Windows", total: 476 * 2 ** 30, used: 301 * 2 ** 30, removable: false }, { mount: "E:", label: "Datos", total: 931 * 2 ** 30, used: 870 * 2 ** 30, removable: false }],
    down: Math.abs(wave(4)) * 40000, up: Math.abs(wave(6)) * 5000,
    battery: { percent: 76, charging: true, plugged: true }, uptime: 3 * 3600 + 1240,
  };
}
