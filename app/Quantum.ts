import * as path from 'path';
import * as fs from 'fs';
import log from 'electron-log/main';
import * as HPKE from 'hpke'
import { KEM_ML_KEM_512, KDF_SHAKE256, AEAD_ChaCha20Poly1305 } from '@panva/hpke-noble'
// import { KEM_DHKEM_P256_HKDF_SHA256, KDF_HKDF_SHA256, AEAD_AES_128_GCM } from '@panva/hpke-noble'

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export interface ISenderSetup {
  encapsulatedSecret: Uint8Array;
  ctx: HPKE.SenderContext 
}

export default class Quantum {
  encryptionAvailable: boolean = false;
  suite: HPKE.CipherSuite; 
  ikmKeyPath: string;
  encapDirPath: string;
  keyPair: HPKE.KeyPair | undefined;
  useEncryption: boolean = false;
  aad: Uint8Array = encoder.encode('metadata');
  
  constructor(configPath: string) {
    this.suite = new HPKE.CipherSuite(
      KEM_ML_KEM_512, KDF_SHAKE256, AEAD_ChaCha20Poly1305
      // KEM_DHKEM_P256_HKDF_SHA256, KDF_HKDF_SHA256, AEAD_AES_128_GCM
    );

    this.ikmKeyPath = path.join(configPath, 'lrag.ikm');    
    this.encapDirPath = path.join(configPath, 'encap');
    if (!fs.existsSync(this.encapDirPath)) {
      fs.mkdirSync(this.encapDirPath, { recursive: true });
    }
  }

  init = async () => {
    if (!fs.existsSync(this.ikmKeyPath)) {
      log.info("NEW KEY:", this.encryptionAvailable);  
      this.keyPair = await this.generateAndSaveKemKeyPair();      
    } else {      
      this.keyPair = await this.loadKemKeyPair();      
    }

    log.info("ENCRYPTION:", this.encryptionAvailable);
  }

  generateAndSaveKemKeyPair = (): Promise<HPKE.KeyPair> => {
    const ikm: Uint8Array = crypto.getRandomValues(new Uint8Array(this.suite.KEM.Nsk));
    fs.writeFileSync(this.ikmKeyPath, Buffer.from(ikm).toString('base64'), 'utf-8');    
    return this.suite.DeriveKeyPair(ikm, true);
  }

  loadKemKeyPair = async (): Promise<HPKE.KeyPair> => {    
    const ikm: Uint8Array = Buffer.from(fs.readFileSync(this.ikmKeyPath, 'utf-8'), 'base64');
    log.info("KEM key pair loaded from KEY files.");
    return this.suite.DeriveKeyPair(ikm, true);
  }

  runTest = async (ins: string): Promise<void> => {
    if (this.keyPair) {

      const ciphertext = await this.encrypt(ins);
      log.info('Sealed!');
      if (ciphertext) {
        const decrypted: string | undefined = await this.decrypt(ciphertext);
        if (decrypted) {
          log.info('ins:', ins);
          log.info('outs:', decrypted);
        }
      }
    }
  }

  hashUint8Array = (data: Uint8Array): Promise<string> => {
    // Node.js Buffers extend Uint8Array, so no conversion is needed.
    const buffer: Buffer = Buffer.from(data); 

    return crypto.subtle.digest('SHA-512', buffer as BufferSource).then((value: ArrayBuffer) => {
      return Buffer.from(value).toString('hex');
    }) 
  }

  encrypt = (text: string): Promise<string | undefined> => {
    if (this.keyPair) {
      return this.suite.SetupSender(this.keyPair.publicKey).then((senderSetup: ISenderSetup) => {
        return senderSetup.ctx.Seal(encoder.encode(text), this.aad)
          .then((value: Uint8Array) => {
            return this.hashUint8Array(value).then((hash: string) => {
              const b64encapsec: string = Buffer.from(senderSetup.encapsulatedSecret).toString('base64');
              fs.writeFileSync(path.join(this.encapDirPath, hash + '.bin'), b64encapsec, 'utf-8');
              // log.info('encrypt:encapsec:', b64encapsec);
              return Buffer.from(value).toString('base64');              
            });          
          });
      });
    } else {
      return Promise.resolve(undefined)
    }
  }

  decrypt = (bin: string): Promise<string | undefined> => {
    const inArray: Uint8Array = Buffer.from(bin, 'base64');
    return this.hashUint8Array(inArray).then((hash: string) => {
      const encapsec: string = fs.readFileSync(path.join(this.encapDirPath, hash + '.bin'), 'utf-8');
      // log.info('decrypt:encapsec:', encapsec);
      if (this.keyPair) {
        return this.suite.SetupRecipient(this.keyPair, Buffer.from(encapsec, 'base64')).then((recipientContext: HPKE.RecipientContext) => {
          return recipientContext.Open(inArray, this.aad).then((value: Uint8Array) => {
            return decoder.decode(value);
          });
        })          
      }    
    })                     
  }

  remove = (bin: string): Promise<void> => {
    const inArray: Uint8Array = Buffer.from(bin, 'base64');
    return this.hashUint8Array(inArray).then((hash: string) => {
      return fs.unlinkSync(path.join(this.encapDirPath, hash + '.bin'));
    });
  }

  removeBin = (bin: Uint8Array): Promise<void> => {
    return this.hashUint8Array(bin).then((hash: string) => {
      return fs.unlinkSync(path.join(this.encapDirPath, hash + '.bin'));
    });
  }
}