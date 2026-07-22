import crypto from 'crypto';

/**
 * Verifies Twilio's X-Twilio-Signature per their documented algorithm:
 * HMAC-SHA1(authToken, url + sorted "key"+"value" pairs from the POST body), base64-encoded.
 * https://www.twilio.com/docs/usage/webhooks/webhooks-security
 */
export const isValidTwilioSignature = ({ authToken, url, params, signature }) => {
  if (!signature) return false;
  const data = Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + params[key], url);
  const expected = crypto.createHmac('sha1', authToken).update(Buffer.from(data, 'utf-8')).digest('base64');
  const expectedBuf = Buffer.from(expected);
  const givenBuf = Buffer.from(signature);
  if (expectedBuf.length !== givenBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, givenBuf);
};
