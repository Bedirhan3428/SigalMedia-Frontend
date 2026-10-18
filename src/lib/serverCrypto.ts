// [START] CREATED BY Umut
import crypto from "crypto";
import type { EncryptedMessageEnvelope, PlainMessagePayload } from "./crypto";

interface ServerKeyPair {
  publicKeySpkiBase64: string;
  privateKeyPem: string;
}

declare global {
  // eslint-disable-next-line no-var
  var __sigalMessagingKeyPair: ServerKeyPair | undefined;
}

function getOrCreateServerKeyPair(): ServerKeyPair {
  if (globalThis.__sigalMessagingKeyPair) {
    return globalThis.__sigalMessagingKeyPair;
  }

  const envPrivateKey = process.env.MESSAGING_PRIVATE_KEY;
  if (envPrivateKey) {
    try {
      const normalizedPrivatePem = envPrivateKey.replace(/\\n/g, "\n");
      const privateKeyObj = crypto.createPrivateKey(normalizedPrivatePem);
      const publicKeyObj = crypto.createPublicKey(privateKeyObj);
      const spkiDer = publicKeyObj.export({
        type: "spki",
        format: "der",
      }) as Buffer;

      globalThis.__sigalMessagingKeyPair = {
        publicKeySpkiBase64: spkiDer.toString("base64"),
        privateKeyPem: normalizedPrivatePem,
      };
      return globalThis.__sigalMessagingKeyPair;
    } catch (err) {
      console.error("MESSAGING_PRIVATE_KEY parse error, using generated keypair:", err);
    }
  }

  const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: {
      type: "spki",
      format: "der",
    },
    privateKeyEncoding: {
      type: "pkcs8",
      format: "pem",
    },
  });

  globalThis.__sigalMessagingKeyPair = {
    publicKeySpkiBase64: (publicKey as Buffer).toString("base64"),
    privateKeyPem: privateKey as string,
  };

  return globalThis.__sigalMessagingKeyPair;
}

export function getServerPublicKeySpkiBase64(): string {
  return getOrCreateServerKeyPair().publicKeySpkiBase64;
}

export function decryptMessagePayload(
  envelope: EncryptedMessageEnvelope
): PlainMessagePayload {
  if (
    !envelope ||
    typeof envelope.encryptedKey !== "string" ||
    typeof envelope.iv !== "string" ||
    typeof envelope.ciphertext !== "string"
  ) {
    throw new Error("Geçersiz şifreli veri formatı");
  }

  const { privateKeyPem } = getOrCreateServerKeyPair();

  const encryptedKeyBuf = Buffer.from(envelope.encryptedKey, "base64");
  const ivBuf = Buffer.from(envelope.iv, "base64");
  const combinedCipherBuf = Buffer.from(envelope.ciphertext, "base64");

  if (ivBuf.length !== 12 || combinedCipherBuf.length <= 16) {
    throw new Error("Geçersiz IV veya şifreli blok boyutu");
  }

  const aesKeyBuf = crypto.privateDecrypt(
    {
      key: privateKeyPem,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: "sha256",
    },
    encryptedKeyBuf
  );

  if (aesKeyBuf.length !== 32) {
    throw new Error("Geçersiz AES-256 anahtar uzunluğu");
  }

  const authTag = combinedCipherBuf.subarray(combinedCipherBuf.length - 16);
  const encryptedBytes = combinedCipherBuf.subarray(0, combinedCipherBuf.length - 16);

  const decipher = crypto.createDecipheriv("aes-256-gcm", aesKeyBuf, ivBuf);
  decipher.setAuthTag(authTag);

  const decryptedBuf = Buffer.concat([
    decipher.update(encryptedBytes),
    decipher.final(),
  ]);

  const parsed = JSON.parse(decryptedBuf.toString("utf8")) as PlainMessagePayload;

  if (
    !parsed ||
    typeof parsed.recipientUid !== "string" ||
    typeof parsed.text !== "string"
  ) {
    throw new Error("Çözülen mesaj içeriği geçersiz");
  }

  return parsed;
}
// [END] CREATED BY Umut
