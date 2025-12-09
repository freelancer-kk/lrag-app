
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

  const data1: string = fs.readFileSync('scripts/docstore.json', 'utf-8');
  // const data1: string = "{ value: false }";
  const encrypted1: string | undefined = await quantum.encrypt(data1);
  if (encrypted1) {
    fs.writeFileSync('scripts/data1.json', encrypted1, 'utf-8');
  }  
}

run();
