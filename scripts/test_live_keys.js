import 'dotenv/config';
import Razorpay from 'razorpay';

async function validateEnvKeys() {
    const keyId = (process.env.RAZORPAY_KEY_ID || '').trim();
    const keySecret = (process.env.RAZORPAY_KEY_SECRET || '').trim();

    console.log('=== Razorpay Credentials Validation ===\n');
    console.log(`Key ID:     ${keyId || '(NOT SET)'}`);
    console.log(`Key Secret: ${keySecret ? keySecret.slice(0, 4) + '...' + keySecret.slice(-4) : '(NOT SET)'}`);
    console.log(`Mode:       ${keyId.startsWith('rzp_live_') ? 'LIVE / PRODUCTION' : keyId.startsWith('rzp_test_') ? 'TEST MODE' : 'UNKNOWN'}\n`);

    if (!keyId || !keySecret) {
        console.error('❌ FAIL: Missing RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET in backend/.env');
        process.exit(1);
    }

    try {
        const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });
        const res = await razorpay.orders.create({
            amount: 100, // ₹1 test order creation
            currency: 'INR',
            receipt: `test_${Date.now()}`,
        });

        console.log('✅ SUCCESS! Razorpay credentials are 100% valid and authorized.');
        console.log(`Created test Razorpay Order ID: ${res.id}\n`);
    } catch (err) {
        console.error('❌ FAIL: Razorpay rejected credentials!');
        console.error('Error Status:', err.statusCode || err.status || 401);
        console.error('Error Code:  ', err.error?.code || 'AUTH_ERROR');
        console.error('Description: ', err.error?.description || err.message || err);
        console.error('\nSteps to fix:');
        console.error('1. Log into https://dashboard.razorpay.com');
        console.error('2. Switch toggle to Live (or Test)');
        console.error('3. Go to Settings -> API Keys -> Regenerate Key');
        console.error('4. Paste BOTH Key ID & Secret into backend/.env without extra spaces.');
        process.exit(1);
    }
}

validateEnvKeys();
