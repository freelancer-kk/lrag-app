
import Quantum from '../Quantum.js';

let quantum = new Quantum('scripts');
  
const run = async () => {
  await quantum.init();
  await quantum.runTest('this is my message in');
}

run();


/*
const en: string = fs.readFileSync('C:\\Users\\kabir\\Downloads\\docstore.json', 'utf-8');
      log.info('EN:', en.substring(0, 50));
      const de: string | undefined = await quantum.decrypt(en);
      log.info('DE:', de?.substring(0, 50));      
*/    