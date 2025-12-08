
import Quantum from '../Quantum.js';
import * as fs from 'fs';

let quantum = new Quantum('scripts');
  
const run = async () => {
  await quantum.init();
  
  const en: string = fs.readFileSync('scripts/data.json', 'utf-8');
  console.log('read:', en);
  const decrypted: string | undefined = await quantum.decrypt(en);
  if (decrypted) {
    console.log('decrypted:', decrypted);
  }
}

run();
