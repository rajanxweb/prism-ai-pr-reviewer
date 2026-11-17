import crypto from 'node:crypto';

export const verifyWebhookSignature = (
  rawBody: Buffer | string,
  signatureHeader: string | undefined,
  secret: string,
): boolean => {
  if (!signatureHeader || !secret) {
    return false;
  }

  if (!signatureHeader.startsWith('sha256=')) {
    return false;
  }

  const expectedHex = signatureHeader.slice(7);
  // A valid sha256 hex string is exactly 64 characters (32 bytes)
  if (expectedHex.length !== 64) {
    return false;
  }

  try {
    const expectedBuffer = Buffer.from(expectedHex, 'hex');
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(rawBody);
    const calculatedHex = hmac.digest('hex');
    const calculatedBuffer = Buffer.from(calculatedHex, 'hex');

    if (expectedBuffer.length !== calculatedBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(expectedBuffer, calculatedBuffer);
  } catch {
    return false;
  }
};
