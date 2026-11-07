import { createApp } from './app.js';
import { loadConfig } from './config/env.js';

const config = loadConfig();
const app = createApp(config);

app.listen(config.port, () => {
  console.log(`API Argos disponível na porta ${config.port}`);
});
