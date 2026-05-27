const moment = require('moment-timezone');

const testTimes = [
    '2026-05-27T13:45:00.000Z',
    '2026-05-27T08:15:00.000Z',
];

testTimes.forEach(t => {
    const nowUtc = moment.utc(t);
    const localTime = nowUtc.clone().tz('Asia/Kolkata');
    const hhmm = localTime.format('HH:mm');
    const targetTime = localTime.clone().add(15, 'minutes').format('HH:mm');
    console.log(`UTC: ${nowUtc.format()} -> IST: ${hhmm} -> Target: ${targetTime}`);
});
