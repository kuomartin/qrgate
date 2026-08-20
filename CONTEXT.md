# qrgate

Ticket issuance and gate-scanning for events: generate verifiable ticket serial codes, scan them at entry, and surface check-in stats to organizers.

## Language

**Event（活動）**:
A single occurrence being ticketed. Each Event owns exactly one Google Sheet as its data backend (tickets, check-in log, stats) — ticket namespaces do not cross Events.

**Ticket（票券）**:
One admission right for exactly one entrant (1:1 — no group/family tickets). Identified by a unique Serial Code.
_Avoid_: Pass, entry code (when referring to the whole admission record, not just the code string).

**Serial Code（序號）**:
The unique code printed or QR-encoded on a Ticket. Must resist forgery/guessing and must let the system detect reuse. Format and generation algorithm not yet decided.
_Avoid_: Ticket number (conflates the code string with the Ticket record itself).

**Channel（通路）**:
The path by which a Ticket was issued. Launches with two parallel values — 實體索票 (physical pickup) and 線上登記 (online registration) — but is designed as an open, extensible enum (e.g. a future 貴賓/VIP value can be added without changing how Channel works). Only affects the Serial Code's prefix; no other behavioral difference between channels.

**Check-in（入場）**:
The act of scanning and validating a Ticket at the gate. Single-use: once a Ticket has successfully checked in, a second scan must be rejected. Always performed online (no offline/local-cache mode). Multiple gates/devices may check in against the same Event concurrently; each Check-in records which gate/device performed it — this identifier may be anonymous (a device label, not a staff identity).
_Avoid_: Scan (the scan is the mechanism; check-in is the domain event it produces).

**Ticket state**:
A Ticket has exactly two states: `issued` (produced and valid, not yet used) and `checked-in` (used, terminal). There is no intermediate "claimed/distributed" state — physically handing a printed Ticket to a person before the event is not a tracked state transition; only the gate scan changes state.
