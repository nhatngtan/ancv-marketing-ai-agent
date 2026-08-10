import { createApp } from './app.js';
import { config } from './config.js';

createApp().listen(config.port, '0.0.0.0', () => {
  console.log(JSON.stringify({ event: 'server_started', port: config.port }));
});

