
import Quantum from '../Quantum.js';
import * as fs from 'fs';

let quantum = new Quantum('scripts');
  
const run = async () => {
  await quantum.init();
  // await quantum.runTest('this is my message in');
  
  const en: string = fs.readFileSync('scripts/data.json', 'utf-8');
  const decrypted: string | undefined = await quantum.decrypt(en);
  if (decrypted) {
    console.log('decrypted:', decrypted);
  }

  const en1: string = fs.readFileSync('scripts/data1.json', 'utf-8');
  const decrypted1: string | undefined = await quantum.decrypt(en);
  if (decrypted1) {
    console.log('decrypted:', decrypted1);
  }
}

run();
