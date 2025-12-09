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
  b64encapSec: string | undefined;
  senderKeyPair: HPKE.KeyPair | undefined;
  recipientKeyPair: HPKE.KeyPair | undefined;
  senderContext: ISenderSetup | undefined;
  recipientContext: HPKE.RecipientContext | undefined;
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
      fs.mkdirSync(this.encapDirPath);
    }
  }

  init = async () => {
    if (!fs.existsSync(this.ikmKeyPath)) {
      log.info("NEW KEY:", this.encryptionAvailable);  
      this.senderKeyPair = await this.generateAndSaveKemKeyPair();
      this.recipientKeyPair = await this.loadKemKeyPair();
    } else {      
      this.senderKeyPair = await this.loadKemKeyPair();
      this.recipientKeyPair = await this.loadKemKeyPair();
    }

    const pk1 = await this.suite.SerializePublicKey(this.senderKeyPair.publicKey);
    const pk2 = await this.suite.SerializePublicKey(this.recipientKeyPair.publicKey);

    log.info(
      'Public keys match:',
      pk1.every((byte, i) => byte === pk2[i]),
    ) 

    const pv1 = await this.suite.SerializePrivateKey(this.senderKeyPair.privateKey);
    const pv2 = await this.suite.SerializePrivateKey(this.recipientKeyPair.privateKey);

    log.info(
      'Private keys match:',
      pv1.every((byte, i) => byte === pv2[i]),
    ) 

    await this.setupContexts();
    
    log.info("ENCRYPTION:", this.encryptionAvailable);
  }

  setupContexts = async (): Promise<void> => {
    if (this.senderKeyPair && this.recipientKeyPair) {
      this.senderContext = await this.suite.SetupSender(this.recipientKeyPair.publicKey);
      this.b64encapSec = Buffer.from(this.senderContext.encapsulatedSecret).toString('base64');
      this.recipientContext = await this.suite.SetupRecipient(this.recipientKeyPair, this.senderContext.encapsulatedSecret);
    }
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
    if (this.senderKeyPair && this.recipientKeyPair) {

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

  encryptBin = (bin: Uint8Array): Promise<Uint8Array | undefined> => {
    if (this.senderContext) {
      return this.senderContext.ctx.Seal(bin, this.aad)
        .then((value: Uint8Array) => {
          return this.hashUint8Array(value).then((hash: string) => {
            if (this.b64encapSec) {
              fs.writeFileSync(path.join(this.encapDirPath, hash + '.bin'), this.b64encapSec, 'utf-8');
              // log.info('encrypt:hash:', hash, 'sec:', this.b64encapSec);
              return value;
            }
          });          
        });
    } else {
      return Promise.resolve(undefined)
    }
  }

  decryptBin = (bin: Uint8Array): Promise<Uint8Array | undefined> => {
    return this.hashUint8Array(bin).then((hash: string) => {
      if (this.recipientContext) {
        const encapsec: string = fs.readFileSync(path.join(this.encapDirPath, hash + '.bin'), 'utf-8');
        // log.info('decrypt:hash:', hash, 'sec:', encapsec);
        if (this.recipientKeyPair) {
          return this.suite.SetupRecipient(this.recipientKeyPair, Buffer.from(encapsec, 'base64')).then((recipientContext: HPKE.RecipientContext) => {
            return recipientContext.Open(bin, this.aad).then((value: Uint8Array) => {
              return value;
            });
          })          
        }
      } else {
        return Promise.resolve(undefined)
      }                
    })
  }

  hashUint8Array = (data: Uint8Array): Promise<string> => {
    // Node.js Buffers extend Uint8Array, so no conversion is needed.
    const buffer: Buffer = Buffer.from(data); 

    return crypto.subtle.digest('SHA-512', buffer as BufferSource).then((value: ArrayBuffer) => {
      return Buffer.from(value).toString('hex');
    }) 
  }

  encrypt = (text: string): Promise<string | undefined> => {
    if (this.senderContext) {
      return this.senderContext.ctx.Seal(encoder.encode(text), this.aad)
        .then((value: Uint8Array) => {
          return this.hashUint8Array(value).then((hash: string) => {
            if (this.b64encapSec) {
              fs.writeFileSync(path.join(this.encapDirPath, hash + '.bin'), this.b64encapSec, 'utf-8');
              // log.info('encrypt:hash:', hash, 'sec:', this.b64encapSec);
              return Buffer.from(value).toString('base64');
            }
          });          
        });
    } else {
      return Promise.resolve(undefined)
    }
  }

  decrypt = (bin: string): Promise<string | undefined> => {
    const inArray: Uint8Array = Buffer.from(bin, 'base64');
    return this.hashUint8Array(inArray).then((hash: string) => {
      if (this.recipientContext) {
        const encapsec: string = fs.readFileSync(path.join(this.encapDirPath, hash + '.bin'), 'utf-8');
        // log.info('decrypt:hash:', hash, 'sec:', encapsec);
        if (this.recipientKeyPair) {
          return this.suite.SetupRecipient(this.recipientKeyPair, Buffer.from(encapsec, 'base64')).then((recipientContext: HPKE.RecipientContext) => {
            return recipientContext.Open(inArray, this.aad).then((value: Uint8Array) => {
              return decoder.decode(value);
            });
          })          
        }
      } else {
        return Promise.resolve(undefined)
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