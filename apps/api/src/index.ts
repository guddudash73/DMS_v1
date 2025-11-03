import 'dotenv/config';
import { createApp } from './server';
import { parseEnv } from '@dms/config/env';

const env = parseEnv(process.env);
const app = createApp();

const port = Number(env.PORT ?? '4000');
app.listen(port, () => {
  console.log(JSON.stringify({ msg: 'api:listening', port, env: env.NODE_ENV }));
});
