
import Quantum from '../Quantum.js';
import * as fs from 'fs';

let quantum = new Quantum('scripts');
  
const run = async () => {
  await quantum.init();
  // await quantum.runTest('this is my message in');

  const data: string = "{ value: true }";
  const encrypted: string | undefined = await quantum.encrypt(data);
  if (encrypted) {
    fs.writeFileSync('scripts/data.json', encrypted, 'utf-8');
  }

  const data1: string = "{ value: false }";
  const encrypted1: string | undefined = await quantum.encrypt(data1);
  if (encrypted) {
    fs.writeFileSync('scripts/data1.json', encrypted, 'utf-8');
  }  
}

run();
