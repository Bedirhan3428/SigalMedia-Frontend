// [START] CREATED BY Umut
export interface PlainMessagePayload {
  recipientUid: string;
  text: string;
  replyTo?: string | null;
}

export interface EncryptedMessageEnvelope {
  encryptedKey: string;
  iv: string;
  ciphertext: string;
}

let cachedServerPublicKey: CryptoKey | null = null;

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

export async function generateEphemeralKey(): Promise<CryptoKey> {
  return window.crypto.subtle.generateKey(
    {
      name: "AES-GCM",
      length: 256,
    },
    true,
    ["encrypt", "decrypt"]
  );
}

async function getServerPublicKey(): Promise<CryptoKey> {
  if (cachedServerPublicKey) {
    return cachedServerPublicKey;
  }

  const res = await fetch("/api/messages/public-key", {
    method: "GET",
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error("Sunucu genel anahtarı alınamadı");
  }

  const data = (await res.json()) as { publicKey: string };
  const spkiBuffer = base64ToArrayBuffer(data.publicKey);

  cachedServerPublicKey = await window.crypto.subtle.importKey(
    "spki",
    spkiBuffer,
    {
      name: "RSA-OAEP",
      hash: "SHA-256",
    },
    false,
    ["encrypt"]
  );

  return cachedServerPublicKey;
}

export function clearCachedServerPublicKey(): void {
  cachedServerPublicKey = null;
}

export async function preloadServerPublicKey(): Promise<void> {
  try {
    await getServerPublicKey();
  } catch {
    // Sessizce geç, gönderim anında tekrar dener
  }
}

export async function encryptMessagePayload(
  payload: PlainMessagePayload
): Promise<EncryptedMessageEnvelope> {
  const [serverPublicKey, aesKey] = await Promise.all([
    getServerPublicKey(),
    generateEphemeralKey(),
  ]);

  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encodedPayload = new TextEncoder().encode(JSON.stringify(payload));

  const ciphertextBuffer = await window.crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
      tagLength: 128,
    },
    aesKey,
    encodedPayload
  );

  const rawAesKey = await window.crypto.subtle.exportKey("raw", aesKey);
  const encryptedKeyBuffer = await window.crypto.subtle.encrypt(
    {
      name: "RSA-OAEP",
    },
    serverPublicKey,
    rawAesKey
  );

  return {
    encryptedKey: arrayBufferToBase64(encryptedKeyBuffer),
    iv: arrayBufferToBase64(iv.buffer),
    ciphertext: arrayBufferToBase64(ciphertextBuffer),
  };
}
// [END] CREATED BY Umut
