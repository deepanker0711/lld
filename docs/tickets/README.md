# Tickets

All six topics are implemented for reference (read the code + handbook). To practise, rebuild one from its ticket in a fresh module without looking, against the clock.
Aim for **≤ 60 min per topic** including the demo. Time yourself.

Each ticket file has: requirements · entities · API contract · patterns · edge cases · tickets (T1…) · hints · acceptance checks.
"Done" for every topic means:
- [ ] Every endpoint in the contract works from `requests/<topic>.http`
- [ ] Every edge case returns the listed status + error code
- [ ] Core algorithm lives in a plain class under `domain/` (no Nest imports)
- [ ] At least one unit test for that class (use `FakeClock` if time matters)
- [ ] You can explain each pattern choice in one sentence

When you're stuck, ask for a hint on a specific ticket (e.g. "hint for 02-T4").
