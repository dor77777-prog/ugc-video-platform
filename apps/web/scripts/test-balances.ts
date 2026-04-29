import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
import { fetchAllProviderBalances } from '../lib/providers/balance';

async function main() {
  const r = await fetchAllProviderBalances();
  for (const [name, val] of Object.entries(r)) {
    if (val.ok) {
      const summary = JSON.stringify(val).slice(0, 250);
      console.log(`✓ ${name}: ${summary}`);
    } else {
      console.log(`✗ ${name}: ${val.error}`);
    }
  }
}
main();
