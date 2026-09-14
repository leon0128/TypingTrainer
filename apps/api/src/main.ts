import { createApp } from './app';
import { parseEnv } from './config/env';

const env = parseEnv(process.env);
const app = await createApp(env);
await app.listen({ host: env.HOST, port: env.PORT });
