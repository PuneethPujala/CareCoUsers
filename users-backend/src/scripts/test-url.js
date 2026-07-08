const https = require('https');

const url =
  'https://uwyglhjsdxlkstoxaoqw.supabase.co/storage/v1/object/public/avatars/6346de53-1386-4eea-8b01-9fddbd3d9cba/8jktvk4ymr8ny82j.jpg';

https
  .get(url, (res) => {
    console.log('Status Code:', res.statusCode);
    console.log('Headers:', res.headers);
  })
  .on('error', (e) => {
    console.error('Error fetching URL:', e);
  });
