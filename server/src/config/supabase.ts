import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load server/.env
dotenv.config();

const supabaseUrl = process.env['SUPABASE_URL'];
const supabaseKey = process.env['SUPABASE_ANON_KEY'];  // ← use ANON key

console.log('SUPABASE_URL=', supabaseUrl);
console.log('SUPABASE_KEY=', supabaseKey?.slice(0, 10), '...');

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseKey);
