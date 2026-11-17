import {
  addDays,
  daysBetween,
  overlaps,
  todayIn,
  workingDaysBetween,
} from './leave-dates';

describe('leave dates', () => {
  it('counts Mon–Fri inclusive and skips weekends', () => {
    expect(workingDaysBetween('2026-11-02', '2026-11-06')).toBe(5); // Mon–Fri
    expect(workingDaysBetween('2026-11-06', '2026-11-09')).toBe(2); // Fri + Mon
    expect(workingDaysBetween('2026-11-03', '2026-11-03')).toBe(1); // same day
    expect(workingDaysBetween('2026-11-07', '2026-11-08')).toBe(0); // Sat–Sun only
  });

  it('skips holidays and crosses month and leap-year boundaries', () => {
    expect(
      workingDaysBetween('2026-11-09', '2026-11-10', new Set(['2026-11-09'])),
    ).toBe(1);
    expect(workingDaysBetween('2026-11-30', '2026-12-01')).toBe(2);
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(daysBetween('2026-11-02', '2026-11-09')).toBe(7);
    expect(daysBetween('2026-11-09', '2026-11-02')).toBe(-7);
  });

  it('treats ranges as inclusive when checking overlap', () => {
    const a = { from: '2026-11-03', to: '2026-11-04' };
    expect(overlaps(a, { from: '2026-11-04', to: '2026-11-06' })).toBe(true); // touching day
    expect(overlaps(a, { from: '2026-11-01', to: '2026-11-10' })).toBe(true); // contains
    expect(overlaps(a, { from: '2026-11-05', to: '2026-11-06' })).toBe(false);
    expect(overlaps(a, { from: '2026-11-01', to: '2026-11-02' })).toBe(false);
  });

  it('computes "today" in the company time zone, not UTC', () => {
    const lateEveningUtc = new Date('2026-11-02T20:00:00Z'); // 01:30 on the 3rd in India
    expect(todayIn('Asia/Kolkata', lateEveningUtc)).toBe('2026-11-03');
    expect(todayIn('UTC', lateEveningUtc)).toBe('2026-11-02');
  });
});
