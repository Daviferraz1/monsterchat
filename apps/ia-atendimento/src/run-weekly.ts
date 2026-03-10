import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

const rootEnv = path.resolve(process.cwd(), '../../.env');
if (fs.existsSync(rootEnv)) dotenv.config({ path: rootEnv });
dotenv.config();
if (!process.env.SUPABASE_SERVICE_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY) {
  process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
}

import { weeklyImprovement } from './realtime-handler';

weeklyImprovement().catch((err) => {
  console.error('Erro fatal:', err);
  process.exit(1);
});
