# 8-bit Computer in Digital

An 8-bit SAP-1 style (Simple-As-Possible) computer, built entirely out of logic gates in the **[Digital](https://github.com/hneemann/Digital)** simulator by hneemann.

The main circuit, **`CounterProgram.dig`**, implements a hardware counter: a value stored in RAM is read, incremented by `+1` through the ALU, and written back to memory, repeating this cycle on every clock pulse. It's the minimal demonstration of a full working datapath: **memory → ALU → memory**, driven by a sequencer.

## Try it in the browser (no download)

Open **[`index.html`](index.html)**: it loads the real `.dig` files from this repository and draws and simulates them the way Digital does, gate by gate, in any browser.

- **Live link:** `https://kaiq-byte.github.io/8-bit-Program-Counter/` (after enabling GitHub Pages, see below)
- **Local:** double-click `index.html`.
- **Direct link to a circuit:** add `#` and the file name, e.g. `index.html#ALU` or `index.html#Stepper%20count`.

How to use it:
- The clock starts running. **Pausar/Rodar** stops or starts it, **Pulso de clock** toggles it by hand, and the slider sets the speed.
- **Click a block** (Register, ALU, Stepper count, MAR, ...) to open the circuit inside it with live values, the same way Digital opens a sub-circuit. The path at the top takes you back.
- **Click an input** to toggle it (for multi-bit inputs, type a value). **Click the RAM** to see and edit its contents.
- Wire colors follow Digital: light green = 1, dark green = 0, gray = high-Z, blue = multi-bit bus, red = short circuit.
- Drag to pan, scroll or pinch to zoom.

How it works: `web/digital.js` re-implements the parts of Digital this project uses, taken from Digital's source code: the component shapes and pin positions, wiring rules, unit-delay simulation, zero-delay splitters, the start-up "noise" step that settles latches, the `Reset` element, and real-time clocks that each tick on their own timer (this circuit depends on that to make `clk d`). In `CounterProgram`, RAM[0] goes up by 1 on every 6-step stepper cycle.

`web/circuits.js` holds a copy of the `.dig` files. After you change a circuit in Digital, regenerate it:

```
python3 tools/build_circuits.py
```

Known gap: `COMPUTADORWITHOUTSTEPPER.dig` uses `Ram.dig`, which is not in the repository, so that block shows up in red (Digital can't open it either).

### Publishing with GitHub Pages

The workflow `.github/workflows/pages.yml` publishes the site on every push to `main`. One-time setup: **Settings → Pages → Build and deployment → Source: GitHub Actions**.

## How to open it in Digital

1. Download and install [Digital](https://github.com/hneemann/Digital/releases) (just the `.jar`, requires Java).
2. Open `circuits/CounterProgram.dig`.
3. Hit "run" on the simulation and watch the register/RAM increment on every clock cycle.


## Repository structure

```
8bit-computer/
├── README.md
└── circuits/
    ├── CounterProgram.dig              main circuit (looping incrementer)
    ├── COMPUTADORWITHOUTSTEPPER.dig    teaching variant, no automatic sequencer
    │
    ├── ALU.dig                         full Arithmetic Logic Unit
    ├── Full adder.dig                  8-bit adder (used by the ALU)
    ├── Andder.dig                      8-bit bitwise AND
    ├── ORer.dig                        8-bit bitwise OR
    ├── XORer.dig                       8-bit bitwise XOR
    ├── Shift Lefter.dig                left shifter
    ├── Shift Right.dig                 right shifter
    ├── Z.dig                           zero-result detector (Z flag)
    │
    ├── Register.dig                    8-bit register with output enable
    ├── Byte.dig                        bank of 8 flip-flops (1 byte)
    ├── Mlock.dig                       1-bit latch (flip-flop)
    ├── MAR.dig                         Memory Address Register
    │
    ├── clk.dig                         clock generator/control
    ├── Stepper count.dig               sequencer (generates the cycle's T1, T2, T3... pulses)
    ├── Decoder.dig                     binary-to-single-line decoder
    ├── Enable.dig / Enable8.dig        enable gates (tri-state logic) for the bus
    └── Busone.dig                      "put value on the bus" logic
```

```

- **Memory (`Register.dig`, `Byte.dig`, `Mlock.dig`, `MAR.dig`)** — 1-bit storage cells (`Mlock`) composed into bytes (`Byte`) and then into full registers with an enable-able output (`Register`). The `MAR` holds the address to be read from/written to RAM.
- **ALU (`ALU.dig` and the modules it uses)** — adds, subtracts (via `Full adder.dig`), does bitwise AND/OR/XOR, shifts bits, and flags `Zero`, `Carry`, and comparison (`a larger`, `equal`).
- **Control (`clk.dig`, `Stepper count.dig`, `Decoder.dig`, `Enable.dig`/`Enable8.dig`, `Busone.dig`)** — the clock advances the sequencer, which generates the microsteps (T1, T2, T3...) and enables/disables each register's read/write on the single shared 8-bit bus, avoiding conflicts between them.
- **`CounterProgram.dig`** — everything wired together: on each full cycle, the RAM value is put on the bus, loaded into a register, incremented by `1` through the ALU, and the result is written back to RAM/register — repeating indefinitely with the clock.
- **`COMPUTADORWITHOUTSTEPPER.dig`** — same idea, but without the automatic sequencer, meant for triggering control signals manually to understand what each step does.

|

- [Digital](https://github.com/hneemann/Digital) (logic circuit simulator in Java, by hneemann)
- Java (JRE 8+) to run Digital
