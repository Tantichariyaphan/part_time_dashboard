// Vercel entry: passes every request to the existing server. DEMO ONLY - mock data, not production (Q-01).
import { createServer } from '../server/index.js';
import { loadAuthConfig } from '../server/auth/config.js';
import { createGoogleAuth } from '../server/auth/index.js';
import { createDevMockAdapter } from '../src/adapters/mock/devMockAdapter.js';
import { createDemoAdapter } from '../src/adapters/demo/demoAdapter.js';

const config = loadAuthConfig();
if (config.mode !== 'google') throw new Error('Set NIKUSHO_AUTH=google on Vercel');
const server = createServer({ live: createDevMockAdapter(), demo: createDemoAdapter(), auth: createGoogleAuth(config) });

export default function handler(req, res) { server.emit('request', req, res); }
