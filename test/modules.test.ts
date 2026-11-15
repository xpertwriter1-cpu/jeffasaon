import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nairobiDay, isDay, addDays, atTime, weekdayOf } from '../src/lib/day';
import { hashId, idMatches, normalizeId } from '../src/lib/pickup';
import { canEdit, canView, modules } from '../src/lib/permissions';
import { reportAreasFor, reportRatingsFor, isCbcLevel, cbcLevels } from '../src/lib/cbc';
import { toCsv } from '../src/lib/reports';
test('school days use Nairobi time, not the server clock', () => {
  assert.equal(nairobiDay(new Date('2026-11-15T21:30:00Z')), '2026-11-16');
  assert.equal(nairobiDay(new Date('2026-11-15T20:59:00Z')), '2026-11-15');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.ok(isDay('2026-11-16'));
  assert.ok(!isDay('16/11/2026'));
  assert.ok(!isDay('2026-13-01'));
});
test('weekday and time-of-day helpers', () => {
  assert.equal(weekdayOf('2026-11-16'), 1);
  assert.equal(weekdayOf('2026-11-20'), 5);
  assert.equal(weekdayOf('2026-11-22'), 7);
  assert.equal(atTime('2026-11-16', '07:45')?.toISOString(), '2026-11-16T04:45:00.000Z');
  assert.equal(atTime('2026-11-16', '25:00'), null);
});
test('collector ID numbers are matched by hash, ignoring spaces and case', () => {
  const stored = hashId('12 345 678');
  assert.ok(idMatches('12345678', stored));
  assert.ok(!idMatches('12345679', stored));
  assert.equal(normalizeId('ab-12 34'), 'AB1234');
  assert.ok(!stored.includes('12345678'));
});
test('permissions give each role the right modules', () => {
  assert.ok(canEdit('caregiver', 'daycare'));
  assert.ok(!canView('caregiver', 'fees'));
  assert.ok(canView('bursar', 'payments'));
  assert.ok(!canView('bursar', 'health'));
  assert.ok(canEdit('headteacher', 'classes'));
  assert.ok(!canEdit('teacher', 'classes'));
  assert.ok(canEdit('teacher', 'assessment'));
  assert.ok(!canView('teacher', 'settings'));
  assert.ok(!canView('parent', 'dashboard'));
  for (const name of Object.keys(modules) as (keyof typeof modules)[])
    assert.ok(canView('admin', name), name);
});
test('PP1 and PP2 report cards use CBC areas and rubric; early years keep developmental areas', () => {
  assert.ok(isCbcLevel('PP2'));
  assert.ok(!isCbcLevel('Playgroup'));
  assert.ok(reportAreasFor('PP1').includes('Mathematical Activities'));
  assert.deepEqual(
    reportRatingsFor('PP1'),
    cbcLevels.map((level) => level.label),
  );
  assert.ok(reportAreasFor('Daycare').includes('Numeracy'));
  assert.ok(reportRatingsFor('Daycare').includes('Developing'));
});
test('CSV exports open in Excel and neutralise formulas', () => {
  const csv = toCsv({
    title: 't',
    head: ['Name', 'Amount'],
    rows: [
      ['=HYPERLINK("x")', -50],
      ['Wanjirũ, "Njeri"', 1200],
    ],
  });
  assert.ok(csv.startsWith('﻿'));
  const lines = csv.slice(1).split('\r\n');
  assert.equal(lines[1], '"\'=HYPERLINK(""x"")",-50');
  assert.equal(lines[2], '"Wanjirũ, ""Njeri""",1200');
});
