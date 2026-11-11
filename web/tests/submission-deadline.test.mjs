import assert from 'node:assert/strict';
import {test} from 'node:test';
import {lisbonDeadline,defaultSubmissionDeadline} from '../lib/submission-deadline.mjs';
const epoch=s=>Date.parse(s)/1000;
test('Lisbon Friday cutoff handles winter, summer and DST transitions',()=>{
 for(const [opens,expected] of [['2026-11-08T12:00:00Z','2026-11-13T20:00:00Z'],['2026-07-05T12:00:00Z','2026-07-10T19:00:00Z'],['2026-03-27T21:00:00Z','2026-04-03T19:00:00Z'],['2026-10-23T21:00:00Z','2026-10-30T20:00:00Z']])assert.equal(defaultSubmissionDeadline(epoch(opens),epoch(opens)+10*86400,'weekly'),epoch(expected));
 const t=epoch('2026-11-08T12:00:00Z');for(const kind of ['weekly','test'])assert.equal(defaultSubmissionDeadline(t,t+60,kind),t+60);
});
test('Manual deadlines validate the date and use Lisbon time',()=>{
 assert.equal(lisbonDeadline('2026-07-10T20:00'),epoch('2026-07-10T19:00:00Z'));
 assert.equal(lisbonDeadline('2026-11-13T20:00'),epoch('2026-11-13T20:00:00Z'));
 for(const value of ['2026-02-31T20:00','2026-01-01T25:00','2026-01-01','garbage'])assert.equal(lisbonDeadline(value),null);
});
