# 8-bit Computer in Digital

An 8-bit SAP-1 style (Simple-As-Possible) computer, built entirely out of logic gates in the **[Digital](https://github.com/hneemann/Digital)** simulator by hneemann.

The main circuit, **`CounterProgram.dig`**, implements a hardware counter: a value stored in RAM is read, incremented by `+1` through the ALU, and written back to memory, repeating this cycle on every clock pulse. It's the minimal demonstration of a full working datapath: **memory → ALU → memory**, driven by a sequencer.

## How to open it

1. Download and install [Digital](https://github.com/hneemann/Digital/releases) (just the `.jar`, requires Java).
2. Open `circuits/CounterProgram.dig`.
3. Hit "run" on the simulation and watch the register/RAM increment on every clock cycle.

> ⚠️ **Important:** all `.dig` files must stay in the **same folder** (`circuits/`). Digital resolves custom subcircuits by filename, so moving any `.dig` into another folder breaks the reference.

## Repository structure

```
8bit-computer/
├── README.md
└── circuits/
    ├── CounterProgram.dig              ⭐ main circuit (looping incrementer)
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

## Architecture

The project follows the classic teaching-computer layout (SAP-1 / Ben Eater style):

```
        clk.dig ──▶ Stepper count.dig ──▶ (control signals: CE, MI, RO, RI, ALU, ...)
                                              │
   ┌──────────────────────────────────────────┘
   ▼
 MAR.dig ──address──▶ RAM (RAMDualPort) ──data──▶ Register.dig ──▶ ALU.dig ──▶ back to RAM/register
                                              ▲
                                     Busone.dig / Enable.dig
                                     (shared 8-bit bus)
```

- **Memory (`Register.dig`, `Byte.dig`, `Mlock.dig`, `MAR.dig`)** — 1-bit storage cells (`Mlock`) composed into bytes (`Byte`) and then into full registers with an enable-able output (`Register`). The `MAR` holds the address to be read from/written to RAM.
- **ALU (`ALU.dig` and the modules it uses)** — adds, subtracts (via `Full adder.dig`), does bitwise AND/OR/XOR, shifts bits, and flags `Zero`, `Carry`, and comparison (`a larger`, `equal`).
- **Control (`clk.dig`, `Stepper count.dig`, `Decoder.dig`, `Enable.dig`/`Enable8.dig`, `Busone.dig`)** — the clock advances the sequencer, which generates the microsteps (T1, T2, T3...) and enables/disables each register's read/write on the single shared 8-bit bus, avoiding conflicts between them.
- **`CounterProgram.dig`** — everything wired together: on each full cycle, the RAM value is put on the bus, loaded into a register, incremented by `1` through the ALU, and the result is written back to RAM/register — repeating indefinitely with the clock.
- **`COMPUTADORWITHOUTSTEPPER.dig`** — same idea, but without the automatic sequencer, meant for triggering control signals manually to understand what each step does.

## Fixes applied while organizing

While reviewing the internal references inside the `.dig` files, some subcircuit names had `_` instead of a space (likely a side effect of upload/download). This breaks the simulation in Digital, since it looks up subcircuits by the exact name used in the XML. The following files were renamed to match their internal references:

| Uploaded name          | Fixed name (used internally) |
|------------------------|--------------------------------------|
| `Full_adder.dig`       | `Full adder.dig`                    |
| `Shift_Lefter.dig`     | `Shift Lefter.dig`                  |
| `Shift_Right.dig`      | `Shift Right.dig`                   |
| `Stepper_count.dig`    | `Stepper count.dig`                 |

> `COMPUTADORWITHOUTSTEPPER.dig` references a `Ram.dig` that wasn't among the uploaded files. Since `CounterProgram.dig` (the main circuit) uses Digital's native `RAMDualPort` component instead of a custom `.dig`, it **is not affected** — but opening the no-stepper variant will require adding that file.

## Requirements

- [Digital](https://github.com/hneemann/Digital) (logic circuit simulator in Java, by hneemann)
- Java (JRE 8+) to run Digital

## Credits

Computer architecture study project (digital logic level), inspired by the SAP-1 architecture.
