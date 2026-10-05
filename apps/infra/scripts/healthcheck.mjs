import https from 'node:https';

const request = https.request({
  hostname: '127.0.0.1',
  port: process.env.APP_PORT ?? 3000,
  path: '/health',
  method: 'GET',
  rejectUnauthorized: false,
  timeout: 3000,
}, (response) => {
  response.resume();
  if (response.statusCode !== 200) process.exitCode = 1;
});
request.on('error', () => { process.exitCode = 1; });
request.on('timeout', () => { request.destroy(); process.exitCode = 1; });
request.end();
