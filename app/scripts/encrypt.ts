
import Quantum from '../Quantum.js';
import * as fs from 'fs';

let quantum = new Quantum('scripts');
  
const run = async () => {
  await quantum.init();
  
  const data: string = "{ value: true }";
  const encrypted: string | undefined = await quantum.encrypt(data);
  if (encrypted) {
    fs.writeFileSync('scripts/data.json', encrypted, 'utf-8');
  }
}

run();
