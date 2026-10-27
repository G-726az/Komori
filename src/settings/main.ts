// Settings window: sections on the left, cards of "label + hint → control" on
// the right. Every change is saved at once and the island follows live.

import "./settings.css";
import logoUrl from "../assets/logo.png";
import { Bridge, IN_APP, on } from "../shared/bridge";
import { open as pickPath } from "@tauri-apps/plugin-dialog";
import { clear, h, icon } from "../shared/dom";
import { I } from "../shared/icons";
import { ACCENTS, THEMES, applyTheme, themeById } from "../shared/theme";
import {
  DEFAULTS, applyPerf, loadSettings, onSettings, settings, updateSettings,
  type MeterId, type ModuleId, type PetId, type Settings,
} from "../shared/settings";
import { MODULES } from "../island/modules";
import { PET_COLORS, PET_STYLES, PET_SWATCHES, createPet, hasPet, wantPet3D, type Pet } from "../island/pet";
import { ITEMS, type Slot } from "../island/wardrobe";
import { searchPlaces } from "../shared/weather";
import { homeSection } from "./layout";
import { appFace, isWeb } from "../island/apps";
import { BRANCH } from "../island/github";
import { PROVIDER_NAMES, type Provider } from "../shared/settings";
import type { AppItem } from "../shared/settings";
import { TIMELINES, timeline, type TimelineStyle } from "../island/timeline";
import { CHANGELOG, VERSION } from "../shared/changelog";
import { petSound, type PetSound } from "../island/sfx";
import { detectGpu, wantGpu, type GpuMode } from "../shared/gpu";
import type { Release } from "../shared/bridge";

type SectionId = "home" | "look" | "pet" | "wardrobe" | "island" | "motion" | "calendar" | "apps" | "notes" | "ai" | "github" | "system" | "about";

/** A speedometer, for the motion and performance section. */
const GAUGE = "M12 4a10 10 0 0 0-8.66 15h17.32A10 10 0 0 0 12 4zm0 2a8 8 0 0 1 7.4 11H4.6A8 8 0 0 1 12 6zm4.2 2.4-5 5.1a1.6 1.6 0 1 0 2.3 2.2l3.6-6.3-.9-1zM6.5 13h2v-1.6h-2V13zm9 0h2v-1.6h-2V13zM11.2 8.5h1.6v-2h-1.6v2z";

const SECTIONS: { id: SectionId; label: string; hint: string; icon: string }[] = [
  { id: "home", label: "Inicio", hint: "Qué tarjetas ves al abrir la isla y dónde.", icon: I.home },
  { id: "look", label: "Apariencia", hint: "Tema y color de acento.", icon: I.palette },
  { id: "pet", label: "Mascota", hint: "Quién vive en tu isla.", icon: I.paw },
  { id: "wardrobe", label: "Guardarropa", hint: "Accesorios para cada mascota.", icon: I.shirt },
  { id: "island", label: "Isla", hint: "Cómo se abre, qué muestra y cuándo descansa la mascota.", icon: I.island },
  { id: "motion", label: "Animaciones y 3D", hint: "Qué se mueve y qué es 3D. Apaga lo que no necesites y la laptop trabaja menos.", icon: GAUGE },
  { id: "calendar", label: "Calendario y clima", hint: "Dónde mirar el clima y cómo se ve el calendario.", icon: I.cloud },
  { id: "apps", label: "Apps", hint: "Tus accesos rápidos.", icon: I.grid },
  { id: "notes", label: "Notas", hint: "Notas rápidas guardadas como .txt.", icon: I.note },
  { id: "ai", label: "IA", hint: "El chat: Claude, otras IA o un modelo local.", icon: I.sparkle },
  { id: "github", label: "GitHub", hint: "Tus notificaciones y pull requests en la isla.", icon: BRANCH },
  { id: "system", label: "Sistema", hint: "Medidores y arranque con Windows.", icon: I.monitor },
  { id: "about", label: "Acerca de", hint: "Versión, licencia y dónde guarda sus archivos.", icon: I.info },
];

let section: SectionId = "look";
try {
  const back = sessionStorage.getItem("komori-section");
  if (back) {
    section = back as SectionId;
    sessionStorage.removeItem("komori-section");
  }
} catch { /* start on the first section */ }
const root = document.getElementById("root")!;
const nav = h("nav", { class: "nav" });
const main = h("section", { class: "main" });
root.append(nav, main);

// ── Building blocks ───────────────────────────────────────────────────────────

function card(title: string, hint: string | null, ...children: Node[]): HTMLElement {
  return h("div", { class: "card" },
    h("h4", { text: title }),
    hint ? h("p", { class: "card-hint", text: hint }) : null,
    ...children,
  );
}

function row(label: string, hint: string | null, ...controls: Node[]): HTMLElement {
  return h("div", { class: "row" },
    h("div", { class: "row-label" }, h("b", { text: label }), hint ? h("span", { text: hint }) : null),
    h("div", { class: "row-ctl" }, ...controls),
  );
}

function toggle(on: boolean, change: (v: boolean) => void): HTMLElement {
  const b = h("button", { class: on ? "switch on" : "switch", role: "switch", "aria-checked": String(on) });
  b.addEventListener("click", () => {
    const next = !b.classList.contains("on");
    b.classList.toggle("on", next);
    b.setAttribute("aria-checked", String(next));
    change(next);
  });
  return b;
}

function set<K extends keyof Settings>(key: K, value: Settings[K]) {
  void updateSettings({ [key]: value } as Partial<Settings>);
}

// ── Sections ──────────────────────────────────────────────────────────────────

function lookSection(): Node[] {
  const themes = h("div", { class: "themes" });
  for (const t of THEMES) {
    const b = h("button", { class: settings().theme === t.id ? "theme on" : "theme" },
      h("span", { class: "theme-swatch", style: { background: t.bg, boxShadow: t.light ? `inset 0 0 0 2px ${t.ink}` : "none" } },
        h("i", { style: { background: t.accent } }),
        h("i", { style: { background: t.panel } }),
      ),
      h("span", { text: t.name }),
    );
    b.addEventListener("click", () => {
      void updateSettings({ theme: t.id, accent: t.accent }).then(render);
    });
    themes.append(b);
  }
  const accents = h("div", { class: "accents" });
  for (const color of ACCENTS) {
    const b = h("button", {
      class: settings().accent.toLowerCase() === color ? "accent on" : "accent",
      style: { background: color },
      title: color,
    });
    b.addEventListener("click", () => void updateSettings({ accent: color }).then(render));
    accents.append(b);
  }
  const custom = h("input", { type: "color", value: settings().accent, title: "Color propio" }) as HTMLInputElement;
  custom.addEventListener("change", () => void updateSettings({ accent: custom.value }).then(render));
  accents.append(custom);
  return [
    card("Tema", "El fondo, las tarjetas y el texto de la isla. Los temas claros llevan un borde oscuro para resaltar.", themes),
    card("Color de acento", "Pestaña activa, interruptores y detalles.", accents),
    borderCard(),
  ];
}

/** A coloured edge around the island: on/off, colour and thickness, with a preview. */
function borderCard(): HTMLElement {
  const s = settings();
  const b = s.islandBorder ?? DEFAULTS.islandBorder;
  const setB = (patch: Partial<typeof b>) => void updateSettings({ islandBorder: { ...(settings().islandBorder ?? DEFAULTS.islandBorder), ...patch } }).then(render);
  const t = themeById(s.theme);
  const color = /^#[0-9a-f]{6}$/i.test(b.color) ? b.color : s.accent;
  const preview = h("div", { class: "border-preview" },
    h("div", {
      class: "border-pill",
      style: {
        background: t.bg,
        color: t.ink,
        border: b.on ? `${b.width}px solid ${color}` : t.light ? `1.5px solid ${t.ink}` : "1.5px solid transparent",
      },
    }, h("span", { class: "border-dot", style: { background: s.accent } }), h("b", { text: "12:00" }), h("span", { text: "Komori" })),
  );
  const swatches = h("div", { class: "accents" });
  const useAccent = h("button", { class: !b.color ? "chip on" : "chip", text: "Igual al acento", onclick: () => setB({ color: "" }) });
  swatches.append(useAccent);
  for (const c of [...ACCENTS, "#ffffff", "#1d1b17"]) {
    const btn = h("button", { class: b.color.toLowerCase() === c ? "accent on" : "accent", style: { background: c }, title: c });
    btn.addEventListener("click", () => setB({ color: c }));
    swatches.append(btn);
  }
  const custom = h("input", { type: "color", value: color, title: "Color propio" }) as HTMLInputElement;
  custom.addEventListener("change", () => setB({ color: custom.value }));
  swatches.append(custom);
  const rows: Node[] = [
    preview,
    row("Borde de la isla", "Un contorno de color alrededor de la isla, cerrada y abierta.", toggle(b.on, (v) => setB({ on: v }))),
  ];
  if (b.on) {
    rows.push(
      row("Grosor", null, seg([{ value: 1, label: "Fino" }, { value: 2, label: "Medio" }, { value: 3, label: "Grueso" }], b.width, (v) => setB({ width: v }))),
      h("div", { class: "row-label tl-head" }, h("b", { text: "Color" })),
      swatches,
    );
  }
  return card("Borde", null, ...rows);
}

const ALL_PETS: { id: PetId; name: string; about: string }[] = [
  { id: "bou", name: "Bou", about: "Una gotita tranquila con un brote en la cabeza." },
  { id: "ghost", name: "Fantasmita", about: "Flota despacito y es un poco tímido." },
  { id: "cat", name: "Gato", about: "Curioso, dormilón y con bigotes." },
  { id: "bat", name: "Murciélago", about: "Nocturno, alegre y con colmillitos." },
  { id: "neko", name: "Neko", about: "Orejitas de gato, pelo largo y mucho mimo." },
  { id: "chick", name: "Pollito", about: "Redondito, inquieto y siempre con frío." },
  { id: "bunny", name: "Pelu", about: "Un conejito de peluche con un corazón cosido." },
];

/** Only the pets this build has (the neko may be left out). */
const PETS = ALL_PETS.filter((p) => hasPet(p.id));

function petColor(id: PetId): string {
  return settings().petColors?.[id] ?? PET_COLORS[id];
}

function petStyle(id: PetId): string | undefined {
  return settings().petStyles?.[id];
}

function petSection(): Node[] {
  const grid = h("div", { class: "pets" });
  for (const p of PETS) {
    const pet = createPet(84);
    pet.setKind(p.id, petColor(p.id), petStyle(p.id));
    const b = h("button", { class: settings().pet === p.id ? "pet on" : "pet" },
      h("span", { class: "pet-stage" }, pet.el),
      h("b", { text: p.name }),
      h("span", { text: p.about }),
    );
    b.addEventListener("click", () => void updateSettings({ pet: p.id }).then(render));
    grid.append(b);
  }
  // Colour of the chosen pet.
  const chosen = settings().pet;
  const setColor = (color: string | null) => {
    const next = { ...(settings().petColors ?? {}) };
    if (color) next[chosen] = color;
    else delete next[chosen];
    void updateSettings({ petColors: next }).then(render);
  };
  const swatches = h("div", { class: "accents" });
  for (const color of PET_SWATCHES) {
    const b = h("button", {
      class: petColor(chosen).toLowerCase() === color ? "accent on" : "accent",
      style: { background: color },
      title: color,
    });
    b.addEventListener("click", () => setColor(color));
    swatches.append(b);
  }
  const custom = h("input", { type: "color", value: petColor(chosen), title: "Color propio" }) as HTMLInputElement;
  custom.addEventListener("change", () => setColor(custom.value));
  const reset = h("button", { class: "link", text: "Color original", onclick: () => setColor(null) });
  swatches.append(custom, reset);
  const name = PETS.find((x) => x.id === chosen)?.name ?? "";

  const cards = [
    card("Elige tu mascota", "Vive en la isla, reacciona a lo que pasa y descansa cuando no usas el mouse.", grid),
    card(`Color de ${name}`, "El color de su cuerpo. Los ojos y detalles se ajustan solos.", swatches),
  ];

  // Hairstyles, for the pets that have them.
  const styles = PET_STYLES[chosen];
  if (styles) {
    const current = petStyle(chosen) ?? styles[0].id;
    const list = h("div", { class: "items" });
    for (const st of styles) {
      const mini = createPet(58);
      mini.setKind(chosen, petColor(chosen), st.id);
      const b = h("button", { class: st.id === current ? "item on" : "item" },
        h("span", { class: "item-stage" }, mini.el),
        h("span", { text: st.name }),
      );
      b.addEventListener("click", () => {
        const next = { ...(settings().petStyles ?? {}), [chosen]: st.id };
        void updateSettings({ petStyles: next }).then(render);
      });
      list.append(b);
    }
    cards.push(card(`Peinado de ${name}`, "Cambia su peinado; el color del pelo es el de arriba.", list));
  }

  // How it behaves: its sounds and whether it follows the mouse.
  const sound = settings().sound ?? DEFAULTS.sound;
  const volume = h("input", { type: "range", min: "0", max: "1", step: "0.05", value: String(sound.volume), class: "volume" }) as HTMLInputElement;
  volume.addEventListener("change", () => set("sound", { ...(settings().sound ?? DEFAULTS.sound), volume: Number(volume.value) }));
  const hear = (kind: PetSound, label: string) => h("button", { class: "chip", text: label, onclick: () => petSound(kind, true) });
  cards.push(card("Sonidos", null,
    row("Sonidos", "Un «boop» al tocarla, un pío al alegrarse, su «hmph», el mareo, el sorbo de café y el estirón al despertar.",
      toggle(sound.pet, (v) => set("sound", { ...(settings().sound ?? DEFAULTS.sound), pet: v }))),
    row("Volumen", null, volume),
    row("Escuchar", null, h("div", { class: "row-ctl" }, hear("poke", "Toque"), hear("happy", "Alegría"), hear("pout", "Puchero"), hear("dizzy", "Mareo"), hear("coffee", "Café"))),
  ));
  return cards;
}

// ── Wardrobe ──────────────────────────────────────────────────────────────────

let wardrobePet: PetId | null = null;

function wardrobeSection(): Node[] {
  const who = wardrobePet ?? settings().pet;
  const outfit = settings().outfits?.[who] ?? {};
  const dress = (pet: Pet, extra?: Partial<Record<Slot, string | undefined>>) => {
    pet.setKind(who, petColor(who), petStyle(who));
    pet.setOutfit({ ...outfit, ...extra });
    return pet;
  };

  // Which pet to dress.
  const pick = h("div", { class: "seg" });
  for (const p of PETS) {
    const b = h("button", { class: p.id === who ? "on" : "", text: p.name });
    b.addEventListener("click", () => {
      wardrobePet = p.id;
      void render();
    });
    pick.append(b);
  }

  // Big preview, with buttons to try the moods.
  const big = dress(createPet(150));
  const stage = h("div", { class: "wardrobe-stage" }, big.el);
  let resting = false;
  const moods = h("div", { class: "moods" },
    h("button", { class: "chip", text: "Feliz", onclick: () => { resting = false; big.setSleeping(false); big.happy(); } }),
    h("button", { class: "chip", text: "Mimo", onclick: () => { resting = false; big.poke(); } }),
    h("button", { class: "chip", text: "Puchero", onclick: () => { resting = false; big.setSleeping(false); big.react("pout"); } }),
    h("button", { class: "chip", text: "Aturdido", onclick: () => { resting = false; big.setSleeping(false); big.react("dizzy"); } }),
    h("button", { class: "chip", text: "Cafecito", onclick: () => { resting = false; big.setSleeping(false); big.react("coffee"); } }),
    h("button", { class: "chip", text: "Descansar", onclick: () => { resting = !resting; big.setSleeping(resting); } }),
  );

  const save = (slot: Slot, id: string | undefined) => {
    const all = { ...(settings().outfits ?? {}) };
    const next = { ...(all[who] ?? {}) };
    if (id) next[slot] = id;
    else delete next[slot];
    all[who] = next;
    void updateSettings({ outfits: all }).then(render);
  };

  const slotCard = (slot: Slot, title: string) => {
    const grid = h("div", { class: "items" });
    const options: { id: string | undefined; name: string }[] = [
      { id: undefined, name: "Nada" },
      ...ITEMS.filter((x) => x.slot === slot).map((x) => ({ id: x.id, name: x.name })),
    ];
    for (const o of options) {
      const mini = dress(createPet(58), { [slot]: o.id });
      const on = (outfit[slot] ?? undefined) === o.id;
      const b = h("button", { class: on ? "item on" : "item" }, h("span", { class: "item-stage" }, mini.el), h("span", { text: o.name }));
      b.addEventListener("click", () => save(slot, o.id));
      grid.append(b);
    }
    return card(title, null, grid);
  };

  return [
    card("Vestir a…", "Cada mascota guarda su propio conjunto: algo en la cabeza y algo en la cara o el cuello.",
      pick,
      h("div", { class: "wardrobe-top" }, stage, h("div", { class: "wardrobe-side" },
        h("b", { text: PETS.find((x) => x.id === who)?.name ?? "" }),
        h("span", { text: "Prueba sus estados de ánimo:" }),
        moods,
      )),
    ),
    slotCard("head", "Cabeza"),
    slotCard("face", "Cara y cuello"),
  ];
}

function islandSection(): Node[] {
  const s = settings();
  const minutes = h("input", { type: "number", min: "1", max: "60", value: String(s.idleMinutes) }) as HTMLInputElement;
  minutes.addEventListener("change", () => {
    const v = Math.max(1, Math.min(60, Number(minutes.value) || 5));
    minutes.value = String(v);
    set("idleMinutes", v);
  });

  const mods = h("div", { class: "mods" });
  for (const [id, m] of Object.entries(MODULES) as [ModuleId, (typeof MODULES)[ModuleId]][]) {
    const on = s.modules.includes(id);
    mods.append(row(m.label, null, toggle(on, (v) => {
      const order = Object.keys(MODULES) as ModuleId[];
      const next = v ? [...settings().modules, id] : settings().modules.filter((x) => x !== id);
      // Keep the panel's order stable and never leave it empty.
      const sorted = order.filter((x) => next.includes(x));
      set("modules", sorted.length ? sorted : ["home"]);
    })));
  }

  return [
    card("Abrir y cerrar", null,
      row("Abrir al acercar el mouse", "Se despliega solo al dejar el puntero sobre la isla, sin clic. Al salir se recoge.",
        toggle(s.hoverOpen, (v) => set("hoverOpen", v))),
      row("Formato de 12 horas", null, toggle(s.hour12, (v) => set("hour12", v))),
      row("Forma de la isla", "Flotante, o pegada al borde de arriba con dos curvas que la unen a la pantalla.",
        seg([{ value: "float", label: "Flotante" }, { value: "notch", label: "Pegada arriba" }], s.islandShape, (v) => set("islandShape", v))),
    ),
    card("Descanso de la mascota", "Si el mouse se queda quieto, la mascota hace su animación de descanso en la isla.",
      row("Animación de descanso", null, toggle(s.idleAnimation, (v) => set("idleAnimation", v))),
      row("Minutos sin mover el mouse", null, minutes),
    ),
    card("Música", "Lo que suena en Spotify, el navegador o cualquier reproductor de Windows.",
      row("Mostrar la canción en la isla cerrada", "Un ecualizador y el nombre mientras suena algo.",
        toggle(s.musicInPill, (v) => set("musicInPill", v))),
      row("Carátula", "La portada sola, la portada con su vinilo que sale al sonar, o el vinilo girando con la portada al centro.",
        seg([{ value: "cover", label: "Portada" }, { value: "sleeve", label: "Portada y vinilo" }, { value: "vinyl", label: "Vinilo" }],
          music().art, (v) => set("music", { ...music(), art: v }))),
      h("div", { class: "row-label tl-head" }, h("b", { text: "Línea de tiempo" }), h("span", { text: "Cómo se dibuja el avance de la canción." })),
      timelinePicker(),
    ),
    card("Módulos del panel", "Qué pestañas aparecen al abrir la isla.", mods),
  ];
}

function music(): Settings["music"] {
  return settings().music ?? DEFAULTS.music;
}

/** The six progress lines, each drawn as it will look, half played. */
function timelinePicker(): HTMLElement {
  const box = h("div", { class: "tl-pick", role: "radiogroup" });
  for (const t of TIMELINES) {
    const line = timeline(t.id);
    line.set(0.42);
    const on = music().timeline === t.id;
    const b = h("button", { class: on ? "tl-opt on" : "tl-opt", role: "radio", "aria-checked": String(on) },
      h("span", { class: "tl-opt-name", text: t.name }), line.el);
    b.addEventListener("click", () => {
      for (const x of box.children) {
        x.classList.toggle("on", x === b);
        x.setAttribute("aria-checked", String(x === b));
      }
      set("music", { ...music(), timeline: t.id as TimelineStyle });
    });
    box.append(b);
  }
  return box;
}

function perf(): Settings["perf"] {
  return { ...DEFAULTS.perf, ...(settings().perf ?? {}) };
}

function setPerf(patch: Partial<Settings["perf"]>) {
  set("perf", { ...perf(), ...patch });
  // The presets above light up when the mix matches one.
  void render();
}

function motionSection(): Node[] {
  const p = perf();
  const lean = { pet3d: false, petFps: 10, orbit: false, vinyl: false, eq: false, flourishes: false, gpu: "eco" } as const;
  const full = DEFAULTS.perf;
  const same = (a: Settings["perf"], b: Settings["perf"]) => (Object.keys(a) as (keyof Settings["perf"])[]).every((k) => a[k] === b[k]);
  const preset = (label: string, hint: string, value: Settings["perf"]) => {
    const b = h("button", { class: same(p, value) ? "preset on" : "preset" }, h("b", { text: label }), h("span", { text: hint }));
    b.addEventListener("click", () => {
      set("perf", { ...value });
      void render();
    });
    return b;
  };
  return [
    card("Rápido", "Un toque para todo de una vez; abajo puedes afinar cada cosa.",
      h("div", { class: "presets" },
        preset("Completo", "3D y todas las animaciones", full),
        preset("Ahorro de energía", "Mascota 2D, nada se mueve de más", { ...lean }),
      ),
    ),
    gpuCard(p.gpu),
    card("Mascota", "La mascota es lo que más trabaja: se dibuja muchas veces por segundo.",
      row("Mascota en 3D", "Modelos con volumen y luz. Apagado: la mascota dibujada en 2D, mucho más ligera.",
        toggle(p.pet3d, (v) => setPerf({ pet3d: v }))),
      row("Fluidez en reposo", "Cuadros por segundo mientras solo respira. Al reaccionar siempre va fluida.",
        seg([{ value: 10, label: "Baja" }, { value: 20, label: "Media" }, { value: 30, label: "Alta" }], p.petFps, (v) => setPerf({ petFps: v }))),
    ),
    card("Movimiento", "Detalles que se mueven solos. Solo trabajan mientras los ves.",
      row("La mascota sigue al mouse", "Mira hacia donde está el puntero (y el anillo del clima se inclina hacia él). Apagado: mira al frente y Komori deja de preguntar dónde está el mouse.",
        toggle(settings().followMouse ?? true, (v) => set("followMouse", v))),
      row("Clima en órbita", "El anillo del pronóstico se inclina y sigue al mouse. Apagado: queda quieto.",
        toggle(p.orbit, (v) => setPerf({ orbit: v }))),
      row("Vinilo girando", "El disco da vueltas mientras suena la música.",
        toggle(p.vinyl, (v) => setPerf({ vinyl: v }))),
      row("Ecualizador en la isla cerrada", "Las barritas que bailan junto a la canción.",
        toggle(p.eq, (v) => setPerf({ eq: v }))),
      row("Detalles animados", "El temblor de la línea glitch, las horas que flotan y otros adornos.",
        toggle(p.flourishes, (v) => setPerf({ flourishes: v }))),
    ),
  ];
}

const GPU_LABELS: Record<Exclude<GpuMode, "auto">, string> = { quality: "Calidad máxima", balanced: "Equilibrado", eco: "Ahorro" };

/** How hard to lean on the graphics card, with what "auto" picked for this one. */
function gpuCard(mode: GpuMode): HTMLElement {
  const gpu = detectGpu();
  return card("Tarjeta gráfica", "Calidad: sombras reales en 3D. Equilibrado: sombra pintada y animaciones a pasos cortos, casi igual y mucho más liviano. Ahorro: además sin desenfoques ni sombras.",
    row("Uso de la tarjeta gráfica", `Detectada: ${gpu.name} → «${GPU_LABELS[gpu.tier]}» en automático.`,
      seg<GpuMode>([
        { value: "auto", label: "Automático" },
        { value: "quality", label: "Calidad" },
        { value: "balanced", label: "Equilibrado" },
        { value: "eco", label: "Ahorro" },
      ], mode, (v) => setPerf({ gpu: v }))),
  );
}

/** A row of choices; the current one is lit. */
function seg<T extends string | number>(options: { value: T; label: string }[], current: T, pick: (v: T) => void): HTMLElement {
  const box = h("div", { class: "seg" });
  for (const o of options) {
    const b = h("button", { class: o.value === current ? "on" : "", text: o.label });
    b.addEventListener("click", () => {
      for (const x of box.children) x.classList.remove("on");
      b.classList.add("on");
      pick(o.value);
    });
    box.append(b);
  }
  return box;
}

function calendarSection(): Node[] {
  const s = settings();
  const w = s.weather;
  const here = h("div", { class: "place-now" },
    icon(I.cloud, 18),
    h("div", {}, h("b", { text: w.place.name }), w.place.detail ? h("span", { text: w.place.detail }) : null),
  );
  const query = h("input", { type: "search", class: "place-input", placeholder: "Busca tu ciudad…", maxlength: "60" }) as HTMLInputElement;
  const results = h("div", { class: "place-results" });
  let seq = 0;
  const search = async () => {
    const name = query.value.trim();
    clear(results);
    if (name.length < 2) return;
    const mine = ++seq;
    results.append(h("span", { class: "place-note", text: "Buscando…" }));
    try {
      const found = await searchPlaces(name);
      if (mine !== seq) return;
      clear(results);
      if (!found.length) results.append(h("span", { class: "place-note", text: "No encontré ese lugar." }));
      for (const place of found) {
        const b = h("button", { class: "place" }, h("b", { text: place.name }), h("span", { text: place.detail ?? "" }));
        b.addEventListener("click", () => {
          void updateSettings({ weather: { ...settings().weather, place } }).then(render);
        });
        results.append(b);
      }
    } catch {
      if (mine !== seq) return;
      clear(results);
      results.append(h("span", { class: "place-note", text: "Sin conexión. Prueba de nuevo en un rato." }));
    }
  };
  let wait: number | undefined;
  query.addEventListener("input", () => {
    window.clearTimeout(wait);
    wait = window.setTimeout(() => void search(), 350);
  });

  return [
    card("Ubicación del clima", "El clima viene de Open-Meteo: gratis y sin cuentas ni claves.", here, query, results),
    card("Cómo se ve", null,
      row("Unidad", null, seg([{ value: "c", label: "°C" }, { value: "f", label: "°F" }], w.unit,
        (v) => void updateSettings({ weather: { ...settings().weather, unit: v } }))),
      row("Temperatura en la isla cerrada", "Junto a la hora, con un dibujito del cielo.",
        toggle(w.inPill, (v) => void updateSettings({ weather: { ...settings().weather, inPill: v } }))),
      row("La semana empieza el", null, seg<0 | 1>([{ value: 1, label: "Lunes" }, { value: 0, label: "Domingo" }], s.weekStart,
        (v) => set("weekStart", v))),
    ),
    card("Tus eventos", "Se agregan desde la pestaña Calendario de la isla y se guardan en tu PC.",
      row("Guardados", null, h("span", { class: "badge", text: String(s.events.length) })),
    ),
  ];
}

const METERS: { id: MeterId; label: string; hint: string }[] = [
  { id: "cpu", label: "Procesador (CPU)", hint: "Uso total, por núcleo y su historial." },
  { id: "ram", label: "Memoria (RAM)", hint: "Cuánta está en uso y cuánta queda libre." },
  { id: "disk", label: "Discos", hint: "Espacio libre de cada unidad." },
  { id: "net", label: "Red", hint: "Velocidad de bajada y subida." },
  { id: "battery", label: "Energía", hint: "Batería y cuánto lleva encendido el PC." },
];

function metersCard(): HTMLElement {
  const meters = settings().meters;
  return card("Medidores", "Qué muestra la pestaña Sistema de la isla. Solo mide mientras la miras.",
    ...METERS.map((m) => row(m.label, m.hint, toggle(meters[m.id], (v) =>
      set("meters", { ...settings().meters, [m.id]: v })))),
  );
}

// ── Apps ──────────────────────────────────────────────────────────────────────

const ARROW_UP = "M12 5l7 7-1.4 1.4-4.6-4.6V19h-2V8.8l-4.6 4.6L5 12l7-7z";
const ARROW_DOWN = "M12 19l-7-7 1.4-1.4 4.6 4.6V5h2v10.2l4.6-4.6L19 12l-7 7z";

let installed: { name: string; target: string }[] | null = null;
const iconCache = new Map<string, string | null>();

function saveApps(apps: AppItem[]) {
  void updateSettings({ apps }).then(render);
}

function addApp(name: string, target: string, icon?: string | null) {
  const app: AppItem = { id: crypto.randomUUID(), name: name.trim() || "App", target };
  if (icon) app.icon = icon;
  saveApps([...settings().apps, app]);
}

/** "C:\Juegos\algo.exe" → "algo". */
const baseName = (path: string) => path.replace(/[\\/]+$/, "").split(/[\\/]/).pop()?.replace(/\.(exe|lnk|url|bat|cmd)$/i, "") || path;

async function iconsFor(targets: string[]): Promise<void> {
  const need = targets.filter((t) => !iconCache.has(t) && !isWeb(t));
  if (!need.length || !IN_APP) return;
  const got = (await Bridge.appIcons(need)) ?? [];
  need.forEach((t, i) => iconCache.set(t, got[i] ?? null));
}

function appsSection(): Node[] {
  const apps = settings().apps;

  // Your shortcuts, in order.
  const mine = h("div", { class: "app-rows" });
  apps.forEach((app, i) => {
    const name = h("input", { class: "app-rename", value: app.name, maxlength: "40", "aria-label": "Nombre" }) as HTMLInputElement;
    name.addEventListener("change", () => {
      const next = [...settings().apps];
      next[i] = { ...next[i], name: name.value.trim() || app.name };
      saveApps(next);
    });
    const move = (d: number) => () => {
      const next = [...settings().apps];
      const j = i + d;
      if (j < 0 || j >= next.length) return;
      [next[i], next[j]] = [next[j], next[i]];
      saveApps(next);
    };
    const up = h("button", { class: "icon-btn", title: "Subir", onclick: move(-1) }, icon(ARROW_UP, 15));
    const down = h("button", { class: "icon-btn", title: "Bajar", onclick: move(1) }, icon(ARROW_DOWN, 15));
    up.disabled = i === 0;
    down.disabled = i === apps.length - 1;
    mine.append(h("div", { class: "app-row" },
      h("span", { class: "app-row-face" }, appFace(app, 30)),
      h("div", { class: "app-row-text" }, name, h("span", { class: "app-target", text: app.target, title: app.target })),
      up, down,
      h("button", { class: "icon-btn danger", title: "Quitar", onclick: () => saveApps(settings().apps.filter((x) => x.id !== app.id)) }, icon(I.close, 14)),
    ));
  });
  if (!apps.length) mine.append(h("p", { class: "place-note", text: "Todavía no hay accesos. Agrégalos abajo." }));

  // Installed apps, searchable.
  const query = h("input", { type: "search", class: "place-input", placeholder: "Busca entre tus apps instaladas…" }) as HTMLInputElement;
  const results = h("div", { class: "found-apps" });
  const drawResults = async () => {
    results.replaceChildren();
    if (!IN_APP) {
      results.append(h("p", { class: "place-note", text: "La lista de apps instaladas solo está en la app." }));
      return;
    }
    if (!installed) {
      results.append(h("p", { class: "place-note", text: "Leyendo el menú Inicio…" }));
      installed = (await Bridge.listStartApps()) ?? [];
      results.replaceChildren();
    }
    const q = query.value.trim().toLowerCase();
    const have = new Set(settings().apps.map((a) => a.target.toLowerCase()));
    const list = installed.filter((a) => !q || a.name.toLowerCase().includes(q)).slice(0, 40);
    await iconsFor(list.map((a) => a.target));
    results.replaceChildren();
    for (const a of list) {
      const added = have.has(a.target.toLowerCase());
      const face = appFace({ id: "", name: a.name, target: a.target, icon: iconCache.get(a.target) ?? undefined }, 26);
      const b = h("button", { class: added ? "found added" : "found", disabled: added },
        h("span", { class: "found-face" }, face),
        h("span", { class: "found-name", text: a.name }),
        h("span", { class: "found-act", text: added ? "Ya está" : "Agregar" }),
      );
      b.addEventListener("click", () => addApp(a.name, a.target, iconCache.get(a.target)));
      results.append(b);
    }
    if (!list.length) results.append(h("p", { class: "place-note", text: "Nada con ese nombre." }));
  };
  let wait: number | undefined;
  query.addEventListener("input", () => {
    window.clearTimeout(wait);
    wait = window.setTimeout(() => void drawResults(), 200);
  });
  void drawResults();

  // A program, file or folder from disk.
  const pick = async (folder: boolean) => {
    if (!IN_APP) return;
    const path = await pickPath({ directory: folder, multiple: false, title: folder ? "Elige una carpeta" : "Elige un programa o archivo" });
    if (typeof path !== "string") return;
    await iconsFor([path]);
    addApp(baseName(path), path, iconCache.get(path));
  };

  // A web page.
  const webName = h("input", { class: "place-input", placeholder: "Nombre (p. ej. GitHub)", maxlength: "40" }) as HTMLInputElement;
  const webUrl = h("input", { class: "place-input", placeholder: "https://…", maxlength: "500" }) as HTMLInputElement;
  const addWeb = () => {
    let url = webUrl.value.trim();
    if (!url) return webUrl.focus();
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    let name = webName.value.trim();
    if (!name) {
      try {
        name = new URL(url).hostname.replace(/^www\./, "");
      } catch {
        return webUrl.focus();
      }
    }
    addApp(name, url);
  };
  webUrl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") addWeb();
  });

  return [
    card("Tus accesos", "Así aparecen en la pestaña Apps de la isla. Cambia el nombre, el orden o quítalos.", mine),
    card("Agregar una app instalada", "Programas y apps de la Store del menú Inicio.", query, results),
    card("Agregar otra cosa", null,
      row("Programa o archivo", "Un .exe, un acceso directo o cualquier archivo.",
        h("button", { class: "chip", text: "Elegir…", onclick: () => void pick(false) })),
      row("Carpeta", "Se abre en el Explorador.",
        h("button", { class: "chip", text: "Elegir…", onclick: () => void pick(true) })),
      h("div", { class: "web-add" },
        h("b", { text: "Página web" }),
        h("div", { class: "web-fields" }, webName, webUrl, h("button", { class: "chip", text: "Agregar", onclick: addWeb })),
      ),
    ),
  ];
}

// ── AI and Claude Code ────────────────────────────────────────────────────────

/** A password box that saves to the Credential Manager; the key is never shown again. */
function keyBox(name: "anthropic" | "openai" | "github", has: boolean, placeholder: string, saved: () => void): HTMLElement {
  const input = h("input", { type: "password", class: "place-input key-input", placeholder: has ? "•••••••• (guardada)" : placeholder, autocomplete: "off", spellcheck: "false" }) as HTMLInputElement;
  const msg = h("span", { class: "key-msg" });
  const save = h("button", { class: "chip", text: "Guardar", onclick: async () => {
    if (!input.value.trim()) return input.focus();
    const ok = await Bridge.secretSet(name, input.value);
    input.value = "";
    if (ok === null && IN_APP) {
      msg.textContent = "No se pudo guardar.";
      return;
    }
    saved();
  } });
  const remove = h("button", { class: "chip", text: "Quitar", onclick: async () => {
    await Bridge.secretDelete(name);
    saved();
  } });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") save.click();
  });
  const box = h("div", { class: "key-row" }, input, save, has ? remove : null, msg);
  // A key already saved by Coucou can be copied over without anyone seeing it.
  if (!has && name !== "openai" && IN_APP) {
    void Bridge.secretCoucouHas(name).then((there) => {
      if (!there) return;
      box.insertBefore(h("button", { class: "chip", text: "Usar la de Coucou", onclick: async () => {
        try {
          await Bridge.secretFromCoucou(name);
          saved();
        } catch (err) {
          msg.textContent = (err as Error).message;
        }
      } }), msg);
    });
  }
  return box;
}

/** A model box: type a name or pick one the service offers. */
function modelBox(provider: Provider, value: string, base: string | undefined, change: (v: string) => void): HTMLElement {
  const listId = `models-${provider}`;
  const input = h("input", { class: "place-input", value, list: listId, placeholder: "Nombre del modelo", spellcheck: "false" }) as HTMLInputElement;
  const options = h("datalist", { id: listId });
  const status = h("span", { class: "key-msg" });
  input.addEventListener("change", () => change(input.value.trim()));
  const load = async () => {
    if (!IN_APP) return;
    status.textContent = "Consultando…";
    try {
      const ids = await Bridge.aiModels(provider, base);
      options.replaceChildren(...ids.map((id) => h("option", { value: id })));
      status.textContent = ids.length ? `${ids.length} modelos disponibles` : "No hay modelos";
      if (!input.value && ids[0]) {
        input.value = ids[0];
        change(ids[0]);
      }
    } catch (err) {
      status.textContent = (err as Error).message;
    }
  };
  return h("div", { class: "key-row" }, input, options, h("button", { class: "chip", text: "Ver modelos", onclick: () => void load() }), status);
}

async function chatCard(): Promise<HTMLElement> {
  const a = settings().ai;
  const setAi = (patch: Partial<typeof a>) => void updateSettings({ ai: { ...settings().ai, ...patch } }).then(render);
  const quiet = (patch: Partial<typeof a>) => void updateSettings({ ai: { ...settings().ai, ...patch } });
  const which = seg<Provider>((Object.keys(PROVIDER_NAMES) as Provider[]).map((v) => ({ value: v, label: PROVIDER_NAMES[v] })), a.provider, (v) => setAi({ provider: v }));
  const body = h("div", { class: "ai-provider" });
  if (a.provider === "anthropic") {
    const has = !!(await Bridge.secretHas("anthropic"));
    body.append(
      row("Clave de API de Claude", has ? "Guardada en el Administrador de credenciales de Windows." : "Créala en console.anthropic.com → API Keys. Se guarda en el Administrador de credenciales, nunca en un archivo.", h("span")),
      keyBox("anthropic", has, "sk-ant-…", () => void render()),
      row("Modelo", "Claude Opus 5 por defecto. Los modelos más pequeños responden más rápido y cuestan menos.", h("span")),
      modelBox("anthropic", a.anthropicModel, undefined, (v) => quiet({ anthropicModel: v || "claude-opus-5" })),
    );
  } else if (a.provider === "openai") {
    const has = !!(await Bridge.secretHas("openai"));
    const base = h("input", { class: "place-input", value: a.openaiBase, placeholder: "https://api.openai.com/v1", spellcheck: "false" }) as HTMLInputElement;
    base.addEventListener("change", () => setAi({ openaiBase: base.value.trim() || "https://api.openai.com/v1" }));
    body.append(
      row("Dirección del servidor", "OpenAI, OpenRouter, LM Studio, Groq… cualquiera que hable el formato de OpenAI.", h("span")),
      base,
      row("Clave", has ? "Guardada en el Administrador de credenciales." : "Si tu servidor local no usa clave, déjala vacía.", h("span")),
      keyBox("openai", has, "sk-…", () => void render()),
      row("Modelo", null, h("span")),
      modelBox("openai", a.openaiModel, a.openaiBase, (v) => quiet({ openaiModel: v })),
    );
  } else {
    const base = h("input", { class: "place-input", value: a.ollamaBase, placeholder: "http://localhost:11434", spellcheck: "false" }) as HTMLInputElement;
    base.addEventListener("change", () => setAi({ ollamaBase: base.value.trim() || "http://localhost:11434" }));
    body.append(
      row("Ollama en este PC", "Gratis y sin clave: instala Ollama (ollama.com), descarga un modelo (por ejemplo «ollama pull llama3.2») y elígelo aquí.", h("span")),
      base,
      row("Modelo", null, h("span")),
      modelBox("ollama", a.ollamaModel, a.ollamaBase, (v) => quiet({ ollamaModel: v })),
    );
  }
  const system = h("textarea", { class: "place-input system-input", rows: "3", maxlength: "2000" }) as HTMLTextAreaElement;
  system.value = a.system;
  system.addEventListener("change", () => quiet({ system: system.value.trim() }));
  return card("Chat de la isla", "Con quién habla la pestaña Chat. Las conversaciones no se guardan: al cerrar Komori se olvidan.",
    row("Servicio", null, which),
    body,
    h("div", { class: "web-add" }, h("b", { text: "Instrucciones para el asistente" }), system),
  );
}

async function aiSection(): Promise<Node[]> {
  const chat = await chatCard();
  const c = settings().claude;
  const linked = IN_APP ? !!(await Bridge.claudeHooksStatus()) : false;
  const note = h("p", { class: "place-note" });
  const link = toggle(linked, async (on) => {
    note.textContent = "Guardando…";
    const now = await Bridge.claudeHooksSet(on);
    if (now === null) {
      note.textContent = "No se pudo cambiar el archivo de Claude Code.";
      return;
    }
    note.textContent = now
      ? "Conectado. Se aplica a las sesiones de Claude que empieces desde ahora."
      : "Desconectado. Komori ya no recibe avisos de Claude Code.";
  });
  const pref = (key: keyof typeof c) => (v: boolean) =>
    void updateSettings({ claude: { ...settings().claude, [key]: v } });
  const test = (kind: string, label: string) =>
    h("button", { class: "chip", text: label, onclick: () => void Bridge.claudeTest(kind) });

  return [
    chat,
    card("Avisos de Claude Code", "La isla te avisa cuando Claude termina una tarea, te hace preguntas o necesita permiso, con un botón para ir directo a su ventana. Komori no responde por ti: las respuestas se dan en Claude.",
      row("Conectar con Claude Code", "Agrega a Komori en los hooks de tu archivo .claude\\settings.json (antes guarda una copia).", link),
      note,
      row("Cuando termina una tarea", "Con el proyecto y el inicio de su respuesta.", toggle(c.done, pref("done"))),
      row("Cuando te hace preguntas", "Muestra las preguntas y sus opciones.", toggle(c.question, pref("question"))),
      row("Cuando necesita permiso o espera tu respuesta", null, toggle(c.permission, pref("permission"))),
      row("Indicador mientras trabaja", "El punto de la isla gira mientras Claude está en una tarea.", toggle(c.working, pref("working"))),
      row("Sonido", "Un tintineo suave con cada aviso.", toggle(c.sound, pref("sound"))),
      row("Probar", null, h("div", { class: "row-ctl" }, test("done", "Terminó"), test("question", "Pregunta"), test("permission", "Permiso"))),
    ),
  ];
}

// ── GitHub ────────────────────────────────────────────────────────────────────

async function githubSection(): Promise<Node[]> {
  const g = settings().github;
  const has = IN_APP ? !!(await Bridge.secretHas("github")) : false;
  const who = h("span", { class: "key-msg" });
  if (has) {
    who.textContent = "Comprobando…";
    Bridge.githubUser().then((login) => (who.textContent = `Conectado como @${login}`)).catch((err) => (who.textContent = (err as Error).message));
  }
  const pref = (key: keyof typeof g) => (v: boolean) => void updateSettings({ github: { ...settings().github, [key]: v } });
  return [
    card("Token de GitHub", "Crea un token clásico en GitHub → Settings → Developer settings → Personal access tokens (classic), con los permisos «notifications» y «repo» (o «public_repo» si solo usas repos públicos). Se guarda en el Administrador de credenciales de Windows.",
      keyBox("github", has, "ghp_…", () => void render()),
      who,
    ),
    card("Qué mostrar", null,
      row("Notificaciones sin leer", "Puedes marcarlas como leídas desde la isla.", toggle(g.notifications, pref("notifications"))),
      row("Pull requests que esperan tu revisión", null, toggle(g.reviews, pref("reviews"))),
      row("Tus pull requests abiertos", null, toggle(g.mine, pref("mine"))),
      row("Contador en la isla cerrada", "Cuántas notificaciones tienes sin leer.", toggle(g.inPill, pref("inPill"))),
    ),
  ];
}

// ── Notes ─────────────────────────────────────────────────────────────────────

async function notesSection(): Promise<Node[]> {
  const folder = `${(await Bridge.dataFolder()) ?? "%APPDATA%\\Komori"}\\notas`;
  const count = (await Bridge.notesList())?.length ?? 0;
  return [
    card("Tus notas", "Cada nota es un archivo .txt: puedes abrirlas con cualquier editor o copiarlas como respaldo. Al borrar una desde la isla va a la Papelera.",
      row("Carpeta", folder, h("button", { class: "chip", text: "Abrir", onclick: () => void Bridge.openNotesFolder() })),
      row("Notas guardadas", null, h("span", { class: "badge", text: String(count) })),
    ),
  ];
}

function systemSection(): Node[] {
  return [
    card("Windows", null,
      row("Abrir al iniciar Windows", "Komori arranca solo cuando inicias sesión.",
        toggle(settings().autostart, (v) => set("autostart", v))),
    ),
    metersCard(),
  ];
}

async function aboutSection(): Promise<Node[]> {
  const folder = (await Bridge.dataFolder()) ?? "%APPDATA%\\Komori";
  const now = CHANGELOG[0];
  const hero = h("div", { class: "about-hero" },
    h("img", { class: "about-logo", src: logoUrl, alt: "" }),
    h("div", { class: "about-title" },
      h("h1", { text: "Komori" }),
      h("div", { class: "about-ver" },
        h("span", { class: "badge", text: `v${VERSION}` }),
        h("span", { class: "about-name", text: `«${now.name}»` }),
        h("span", { class: "about-date", text: now.date })),
      h("p", { text: "Una islita en lo alto de tu pantalla: música, calendario y clima, notas, herramientas, chat y una mascota que te acompaña." }),
    ),
  );

  const updates = settings().updates ?? DEFAULTS.updates;
  const look = h("button", { class: "btn primary" }, "Buscar actualizaciones");
  const page = h("button", { class: "btn" }, "Página del proyecto");
  const result = h("div", { class: "upd", "aria-live": "polite" });
  look.addEventListener("click", () => void checkUpdate(look as HTMLButtonElement, result));
  page.addEventListener("click", () => void Bridge.openProject());

  const history = h("ol", { class: "cl" });
  CHANGELOG.forEach((c, i) => {
    history.append(h("li", { class: i === 0 ? "cl-item now" : "cl-item" },
      h("span", { class: "cl-dot" }),
      h("div", { class: "cl-body" },
        h("div", { class: "cl-head" },
          h("b", { text: `v${c.v}` }),
          h("span", { class: "cl-name", text: `«${c.name}»` }),
          i === 0 ? h("em", { text: "actual" }) : null),
        h("ul", {}, ...c.items.map((x) => h("li", { text: x }))),
      ),
    ));
  });

  return [
    hero,
    card("Actualizaciones", "Las versiones nuevas se publican en GitHub. Nada se instala sin que lo confirmes.",
      h("div", { class: "upd-actions" }, look, page),
      result,
      row("Avisar cuando haya una versión nueva", "Al iniciar, Komori revisa GitHub y te lo cuenta en la isla.",
        toggle(updates.check, (v) => set("updates", { ...(settings().updates ?? DEFAULTS.updates), check: v }))),
    ),
    card("Apoyar el proyecto", null,
      h("div", { class: "kofi" },
        h("p", { text: "Komori es gratis, sin anuncios y sin cuentas. Si te gusta y quieres apoyar su desarrollo, puedes invitarme un café en Ko-fi. También ayuda mucho dejar una estrella en GitHub o contar los errores que encuentres." }),
        h("button", { class: "btn kofi-btn", onclick: () => void Bridge.openKofi() }, h("span", { class: "cup", text: "☕" }), "Invitar un café en Ko-fi"),
      ),
    ),
    card("Historial de versiones", null, history),
    card("Tus datos", "Las preferencias y notas viven en tu PC. Las claves de IA y GitHub van al Administrador de credenciales de Windows, nunca a un archivo.",
      row("Carpeta", folder, h("span")),
      row("Licencia", "Código abierto bajo licencia MIT.", h("span", { class: "badge", text: "MIT" })),
    ),
    card("Créditos", null,
      h("p", { class: "credits" }, h("b", { text: "Tauri" }), " — la base de la app (MIT/Apache-2.0) · ",
        h("b", { text: "three.js" }), " — las mascotas en 3D (MIT) · ",
        h("b", { text: "Open-Meteo" }), " — el clima (CC BY 4.0)"),
    ),
  ];
}

/** Ask GitHub for the newest version and offer it, with download progress. */
async function checkUpdate(button: HTMLButtonElement, out: HTMLElement) {
  button.disabled = true;
  button.textContent = "Buscando…";
  let r: Release;
  try {
    r = await Bridge.updateCheck();
  } catch (e) {
    out.replaceChildren(h("p", { class: "upd-msg", text: IN_APP ? String((e as Error).message) : "Solo dentro de la app." }));
    return done();
  }
  if (!r.available) {
    out.replaceChildren(h("p", { class: "upd-msg ok", text: `Tienes la última versión (${r.current}).` }));
    return done();
  }
  const bar = h("div", { class: "upd-bar", hidden: true }, h("i", {}));
  const actions = h("div", { class: "upd-actions" });
  const skip = h("button", { class: "btn" }, "Omitir esta versión");
  skip.addEventListener("click", () => {
    set("updates", { ...(settings().updates ?? DEFAULTS.updates), skip: r.latest });
    out.replaceChildren(h("p", { class: "upd-msg", text: `No volveremos a avisarte de la ${r.latest}.` }));
  });
  const web = h("button", { class: "btn" }, "Ver en GitHub");
  web.addEventListener("click", () => void Bridge.githubOpen(r.url));
  actions.append(skip, web);
  if (r.asset) {
    const asset = r.asset;
    const go = h("button", { class: "btn primary" }, `Descargar e instalar (${(asset.size / 1048576).toFixed(1)} MB)`) as HTMLButtonElement;
    go.addEventListener("click", async () => {
      go.disabled = true;
      go.textContent = "Descargando…";
      bar.hidden = false;
      const fill = bar.firstElementChild as HTMLElement;
      const off = await on<{ got: number; total: number }>("update-progress", (p) => {
        if (p.total) fill.style.transform = `scaleX(${(p.got / p.total).toFixed(3)})`;
      });
      try {
        const file = await Bridge.updateDownload(asset.url, asset.name);
        go.textContent = "Instalando…";
        await Bridge.updateInstall(file);
      } catch (e) {
        go.disabled = false;
        go.textContent = "Reintentar";
        out.append(h("p", { class: "upd-msg", text: String((e as Error).message) }));
      } finally {
        off();
      }
    });
    actions.append(go);
  }
  out.replaceChildren(
    h("div", { class: "upd-new" },
      h("b", { text: `Komori ${r.latest}` }),
      h("span", { text: `Tienes la ${r.current}. Novedades:` }),
      h("pre", { class: "upd-notes", text: r.notes || "Sin notas." }),
    ),
    bar,
    actions,
  );
  done();

  function done() {
    button.disabled = false;
    button.textContent = "Buscar actualizaciones";
  }
}

// ── Shell ─────────────────────────────────────────────────────────────────────

function drawNav() {
  clear(nav);
  nav.append(h("div", { class: "brand" }, h("img", { class: "brand-mark", src: logoUrl, alt: "" }), h("div", {},
    h("b", { text: "Komori" }), h("span", { text: `v${VERSION}` }))));
  for (const s of SECTIONS) {
    const b = h("button", { class: s.id === section ? "nav-item on" : "nav-item" }, icon(s.icon, 17), h("span", { text: s.label }));
    b.addEventListener("click", () => {
      section = s.id;
      void render();
    });
    nav.append(b);
  }
}

async function render() {
  drawNav();
  const s = SECTIONS.find((x) => x.id === section)!;
  let body: Node[];
  switch (section) {
    case "home": body = homeSection(card); break;
    case "look": body = lookSection(); break;
    case "pet": body = petSection(); break;
    case "wardrobe": body = wardrobeSection(); break;
    case "island": body = islandSection(); break;
    case "motion": body = motionSection(); break;
    case "calendar": body = calendarSection(); break;
    case "apps": body = appsSection(); break;
    case "notes": body = await notesSection(); break;
    case "ai": body = await aiSection(); break;
    case "github": body = await githubSection(); break;
    case "system": body = systemSection(); break;
    case "about": body = await aboutSection(); break;
  }
  const scroll = main.querySelector(".content")?.scrollTop ?? 0;
  clear(main);
  const content = h("div", { class: "content" }, ...body);
  main.append(h("header", { class: "main-head" }, h("h2", { text: s.label }), h("p", { text: s.hint })), content);
  content.scrollTop = scroll;
}

async function boot() {
  const s = await loadSettings();
  // Built before Settings loaded: if the 3D pets or the card tier changed, start over.
  const pets = wantPet3D(s.perf?.pet3d ?? true);
  const tier = wantGpu(s.perf?.gpu ?? "auto");
  if (pets || tier) return location.reload();
  applyTheme(s.theme, s.accent);
  applyPerf(s);
  // The island can ask for a section ("Agregar" on the Apps tab).
  void on<string>("settings-goto", (id) => {
    if (SECTIONS.some((x) => x.id === id)) {
      section = id as SectionId;
      void render();
    }
  });
  onSettings((next) => {
    // Pets switched between 3D and 2D: build the page again, on the same section.
    const pets = wantPet3D(next.perf?.pet3d ?? true);
    const tier = wantGpu(next.perf?.gpu ?? "auto");
    if (pets || tier) {
      try {
        sessionStorage.setItem("komori-section", section);
      } catch { /* the first section is fine */ }
      return location.reload();
    }
    applyTheme(next.theme, next.accent);
    applyPerf(next);
  });
  // Only in a plain browser (screenshots): `?set={json}` and `?section=<id>`.
  if (!IN_APP) {
    const q = new URLSearchParams(location.search);
    try {
      const patch = q.get("set");
      if (patch) await updateSettings(JSON.parse(patch));
    } catch {
      // Not valid JSON: ignore it.
    }
    const want = q.get("section");
    if (want && SECTIONS.some((x) => x.id === want)) section = want as SectionId;
  }
  await render();
}

void boot();
