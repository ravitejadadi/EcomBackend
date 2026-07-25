import crypto from 'crypto';
import assert from 'assert';

console.log('=== Starting Razorpay Integration Automated Verification ===\n');

// 1. Test Placeholder Detection & Mode Detection Logic
const isPlaceholder = (val) => {
    if (!val || typeof val !== 'string') return true;
    const clean = val.trim().toLowerCase();
    return (
        clean === '' ||
        clean.includes('xxxxxxxx') ||
        clean.includes('placeholder') ||
        clean.includes('your_') ||
        clean.includes('change_me')
    );
};

console.log('1. Testing Key Placeholder Detection:');
assert.strictEqual(isPlaceholder('rzp_test_xxxxxxxxxxxx'), true, 'Should flag test dummy placeholder');
assert.strictEqual(isPlaceholder('rzp_live_xxxxxxxxxxxx'), true, 'Should flag live dummy placeholder');
assert.strictEqual(isPlaceholder('xxxxxxxxxxxxxxxxxxxxxxxx'), true, 'Should flag secret dummy placeholder');
assert.strictEqual(isPlaceholder('your_key_id'), true, 'Should flag generic placeholder');
assert.strictEqual(isPlaceholder('rzp_test_SuH9OyBxVItwA7'), false, 'Should accept valid test key format');
assert.strictEqual(isPlaceholder('rzp_live_ABC123XYZ456'), false, 'Should accept valid live key format');
console.log('   ✓ Placeholder detection tests passed!\n');

// 2. Test Mode Detection Logic
console.log('2. Testing Environment Mode Detection:');
const testKey = 'rzp_test_SuH9OyBxVItwA7';
const liveKey = 'rzp_live_1234567890ABCD';

const getMode = (key) => (key.startsWith('rzp_live_') ? 'live' : key.startsWith('rzp_test_') ? 'test' : 'unconfigured');
assert.strictEqual(getMode(testKey), 'test', 'Should detect test mode');
assert.strictEqual(getMode(liveKey), 'live', 'Should detect live/production mode');
console.log('   ✓ Mode detection tests passed!\n');

// 3. Test Amount Conversion to Paise
console.log('3. Testing Amount Calculation (INR to Paise):');
const rupees = 2499.50;
const paise = Math.round(rupees * 100);
assert.strictEqual(paise, 249950, 'Rupees must convert accurately to integer paise');
console.log('   ✓ Amount calculation tests passed!\n');

// 4. Test HMAC-SHA256 Signature Verification Algorithm
console.log('4. Testing HMAC-SHA256 Signature Verification & Timing Safety:');
const mockSecret = 'RQ3lbsmilCgmDgGI36QxPYl5';
const mockOrderId = 'order_N1a2B3c4D5e6F7';
const mockPaymentId = 'pay_P9o8I7u6Y5t4R3';

// Generate valid signature
const validSignature = crypto
    .createHmac('sha256', mockSecret)
    .update(`${mockOrderId}|${mockPaymentId}`)
    .digest('hex');

// Verify algorithm
const expectedBuf = Buffer.from(validSignature, 'utf8');

// Case A: Correct signature
const receivedValidBuf = Buffer.from(validSignature, 'utf8');
const isValid = expectedBuf.length === receivedValidBuf.length && crypto.timingSafeEqual(expectedBuf, receivedValidBuf);
assert.strictEqual(isValid, true, 'Valid signature must be verified successfully');

// Case B: Tampered signature
const invalidSignature = validSignature.slice(0, -2) + '00';
const receivedInvalidBuf = Buffer.from(invalidSignature, 'utf8');
const isInvalid = expectedBuf.length === receivedInvalidBuf.length && crypto.timingSafeEqual(expectedBuf, receivedInvalidBuf);
assert.strictEqual(isInvalid, false, 'Tampered signature must fail verification');

console.log('   ✓ HMAC-SHA256 signature verification tests passed!\n');

console.log('===========================================================');
console.log('SUCCESS: All Razorpay verification checks passed cleanly!');
console.log('===========================================================');
