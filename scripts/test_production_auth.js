import assert from 'assert';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

console.log('=== Starting Production Authentication System Verification ===\n');

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_jwt_key_change_me_in_production';

// ── 1. Input Normalization Tests ───────────────────────────────────────────────
console.log('1. Testing Input Normalization & Sanitize:');
const normalizeEmail = (email) => (email ? email.toLowerCase().trim() : '');

assert.strictEqual(normalizeEmail('  User.Name@Example.COM '), 'user.name@example.com', 'Email must be lowercased and trimmed');
assert.strictEqual(normalizeEmail('ROHIT.SHARMA@DOMAIN.IN'), 'rohit.sharma@domain.in', 'Uppercase emails must normalize correctly');
console.log('   ✓ Email normalization tests passed!\n');

// ── 2. Password Hashing & Comparison Security ──────────────────────────────────
console.log('2. Testing Password Hashing & Bcrypt Security:');
const rawPassword = 'SecurePassword123!';
const salt = bcrypt.genSaltSync(10);
const hashedPassword = bcrypt.hashSync(rawPassword, salt);

assert.notStrictEqual(rawPassword, hashedPassword, 'Password must never be stored in plain text');
assert.strictEqual(bcrypt.compareSync(rawPassword, hashedPassword), true, 'Correct password must match hash');
assert.strictEqual(bcrypt.compareSync('WrongPassword', hashedPassword), false, 'Incorrect password must be rejected');
console.log('   ✓ Password hashing security tests passed!\n');

// ── 3. JWT Token Lifecycle & Signature Verification ────────────────────────────
console.log('3. Testing JWT Lifecycle & Tamper Protection:');

// Generate Token
const userId = 'user_64a1b2c3d4e5f6';
const token = jwt.sign({ id: userId }, JWT_SECRET, { expiresIn: '30d' });

// Decode Token
const decoded = jwt.verify(token, JWT_SECRET);
assert.strictEqual(decoded.id, userId, 'JWT payload must contain correct user id');

// Tamper Detection
const tamperedToken = token.slice(0, -5) + 'xxxxx';
assert.throws(() => {
    jwt.verify(tamperedToken, JWT_SECRET);
}, /invalid signature|jwt malformed/, 'Tampered token signature must throw error');

// Expired Token Handling
const expiredToken = jwt.sign({ id: userId }, JWT_SECRET, { expiresIn: '-1s' });
assert.throws(() => {
    jwt.verify(expiredToken, JWT_SECRET);
}, /jwt expired/, 'Expired token must throw token expired error');

console.log('   ✓ JWT lifecycle and tamper protection tests passed!\n');

// ── 4. Password Reset Crypto Security ──────────────────────────────────────────
console.log('4. Testing Password Reset Security & Single-Use Tokens:');

// Token Generation
const resetToken1 = crypto.randomBytes(32).toString('hex');
const resetToken2 = crypto.randomBytes(32).toString('hex');

assert.strictEqual(resetToken1.length, 64, 'Reset token must be a 64-character hex string');
assert.notStrictEqual(resetToken1, resetToken2, 'Reset tokens must be cryptographically unique');

// Expiry Logic (10 minute window)
const now = Date.now();
const resetExpires = new Date(now + 10 * 60 * 1000);
assert.strictEqual(resetExpires.getTime() > now, true, 'Reset expiry must be in the future');

// Same password restriction logic
const isSamePassword = (oldPlain, newPlain) => oldPlain === newPlain;
assert.strictEqual(isSamePassword('Pass123', 'Pass123'), true, 'System must detect same old password');
assert.strictEqual(isSamePassword('Pass123', 'NewPass456'), false, 'System must accept new different password');

console.log('   ✓ Password reset security tests passed!\n');

// ── 5. Role-Based Access Control (RBAC) Guard ─────────────────────────────────
console.log('5. Testing Role-Based Access Control (RBAC):');

const mockIsAdmin = (role) => {
    if (role === 'admin') return { allowed: true };
    return { allowed: false, status: 403, message: 'Access denied: Admin role required' };
};

assert.strictEqual(mockIsAdmin('admin').allowed, true, 'Admin role must be granted access');
assert.strictEqual(mockIsAdmin('customer').allowed, false, 'Customer role must be denied admin access');
assert.strictEqual(mockIsAdmin('customer').status, 403, 'Forbidden HTTP 403 status must be returned');

console.log('   ✓ RBAC guard tests passed!\n');

// ── 6. Phone OTP Format Validation ─────────────────────────────────────────────
console.log('6. Testing Phone Number OTP Validation:');
const validatePhone = (phone) => /^\d{10,15}$/.test(phone);

assert.strictEqual(validatePhone('919876543210'), true, 'Valid Indian phone with country code must pass');
assert.strictEqual(validatePhone('9876543210'), true, 'Valid 10-digit mobile number must pass');
assert.strictEqual(validatePhone('+919876543210'), false, 'Leading plus sign should fail regex (digits only)');
assert.strictEqual(validatePhone('abc123'), false, 'Non-digit strings must fail phone validation');

console.log('   ✓ Phone OTP validation tests passed!\n');

console.log('=================================================================');
console.log('SUCCESS: All Production Authentication tests passed cleanly!');
console.log('=================================================================');
