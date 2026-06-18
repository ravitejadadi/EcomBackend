import express from 'express';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import nodemailer from 'nodemailer';
import twilio from 'twilio';
import User from '../models/User.js';
import { verifyToken } from '../middleware/auth.js';
import { fallbackDB } from '../utils/dbFallback.js';

const router = express.Router();

// ─── Twilio Verify client (singleton) ────────────────────────────────────────
const twilioClient = (() => {
    const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN } = process.env;
    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) return null;
    return twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
})();

// ─── Gmail SMTP transporter (singleton) ─────────────────────────────────────
const smtpTransporter = (() => {
    const { SMTP_EMAIL, SMTP_APP_PASSWORD } = process.env;
    if (!SMTP_EMAIL || !SMTP_APP_PASSWORD) return null;
    return nodemailer.createTransport({
        service: 'gmail',
        auth: { user: SMTP_EMAIL, pass: SMTP_APP_PASSWORD },
    });
})();

const buildResetEmail = (toName, toEmail, resetLink) => ({
    from: `"THE ELEGANT" <${process.env.SMTP_EMAIL}>`,
    to: toEmail,
    subject: 'Password Reset Request — THE ELEGANT',
    html: `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>Reset your password — THE ELEGANT</title>
</head>
<body style="margin:0;padding:0;background-color:#f2f1ef;font-family:Georgia,'Times New Roman',serif">

  <!-- Outer wrapper -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f2f1ef;padding:48px 16px">
    <tr><td align="center">

      <!-- Card -->
      <table role="presentation" width="600" cellpadding="0" cellspacing="0"
             style="max-width:600px;width:100%;background:#ffffff;border:1px solid #e0dbd5">

        <!-- ── Gold top bar ── -->
        <tr>
          <td style="background:#c8a96e;height:4px;font-size:1px;line-height:1px">&nbsp;</td>
        </tr>

        <!-- ── Header ── -->
        <tr>
          <td style="background:#0a0a0a;padding:36px 48px 32px;text-align:center">
            <p style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:11px;
                       letter-spacing:0.35em;text-transform:uppercase;color:#c8a96e">
              ✦ &nbsp; The Elegant &nbsp; ✦
            </p>
            <p style="margin:12px 0 0;font-family:Georgia,'Times New Roman',serif;font-size:26px;
                       font-weight:normal;letter-spacing:0.12em;text-transform:uppercase;color:#ffffff">
              Password Reset
            </p>
          </td>
        </tr>

        <!-- ── Thin gold divider ── -->
        <tr>
          <td style="padding:0 48px">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr><td style="border-top:1px solid #c8a96e;font-size:1px;line-height:1px">&nbsp;</td></tr>
            </table>
          </td>
        </tr>

        <!-- ── Body ── -->
        <tr>
          <td style="padding:44px 48px 36px">

            <p style="margin:0 0 6px;font-family:Georgia,'Times New Roman',serif;
                       font-size:13px;letter-spacing:0.2em;text-transform:uppercase;color:#c8a96e">
              Dear ${toName},
            </p>

            <p style="margin:20px 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;
                       font-size:15px;line-height:1.75;color:#3a3a3a">
              We received a request to reset the password associated with your
              <strong>THE ELEGANT</strong> account. If you made this request, please use
              the button below to set a new password.
            </p>

            <p style="margin:8px 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;
                       font-size:15px;line-height:1.75;color:#3a3a3a">
              If you did not make this request, you may safely disregard this email —
              your account has not been changed.
            </p>

            <!-- ── CTA button ── -->
            <table role="presentation" cellpadding="0" cellspacing="0" style="margin:36px 0">
              <tr>
                <td style="background:#0a0a0a;border:1px solid #c8a96e">
                  <a href="${resetLink}"
                     style="display:inline-block;padding:16px 40px;
                            font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;
                            font-size:12px;font-weight:600;letter-spacing:0.2em;text-transform:uppercase;
                            color:#c8a96e;text-decoration:none">
                    Reset My Password
                  </a>
                </td>
              </tr>
            </table>

            <!-- ── Notice box ── -->
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="background:#faf9f7;border-left:3px solid #c8a96e;padding:16px 20px">
                  <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;
                             font-size:13px;line-height:1.6;color:#666666">
                    <strong style="color:#3a3a3a">This link expires in 10 minutes.</strong><br>
                    For your security, password reset links are single-use and time-limited.
                    If your link has expired, please submit a new reset request.
                  </p>
                </td>
              </tr>
            </table>

            <!-- ── Fallback URL ── -->
            <p style="margin:28px 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;
                       font-size:12px;color:#999999;line-height:1.6">
              Button not working? Copy and paste this link into your browser:
            </p>
            <p style="margin:6px 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;
                       font-size:12px;word-break:break-all">
              <a href="${resetLink}" style="color:#c8a96e;text-decoration:underline">${resetLink}</a>
            </p>

          </td>
        </tr>

        <!-- ── Divider ── -->
        <tr>
          <td style="padding:0 48px">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr><td style="border-top:1px solid #e8e4de;font-size:1px;line-height:1px">&nbsp;</td></tr>
            </table>
          </td>
        </tr>

        <!-- ── Footer ── -->
        <tr>
          <td style="padding:28px 48px 32px;text-align:center">
            <p style="margin:0;font-family:Georgia,'Times New Roman',serif;
                       font-size:10px;letter-spacing:0.3em;text-transform:uppercase;color:#c8a96e">
              The Elegant
            </p>
            <p style="margin:10px 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;
                       font-size:12px;color:#aaaaaa;line-height:1.6">
              © ${new Date().getFullYear()} THE ELEGANT. All rights reserved.<br>
              You received this email because a password reset was requested for this account.
            </p>
          </td>
        </tr>

        <!-- ── Gold bottom bar ── -->
        <tr>
          <td style="background:#c8a96e;height:4px;font-size:1px;line-height:1px">&nbsp;</td>
        </tr>

      </table>
      <!-- /Card -->

    </td></tr>
  </table>

</body>
</html>`,
    text: `Dear ${toName},\n\nWe received a request to reset the password for your THE ELEGANT account.\n\nReset your password here (link expires in 10 minutes):\n${resetLink}\n\nIf you did not request this, please ignore this email — your account remains secure.\n\n© ${new Date().getFullYear()} THE ELEGANT. All rights reserved.`,
});

// Generate Token helper
const generateToken = (id) => {
    return jwt.sign(
        { id },
        process.env.JWT_SECRET || 'super_secret_jwt_key_change_me_in_production',
        { expiresIn: '30d' }
    );
};

// @desc    Register a new user
// @route   POST /api/auth/register
// @access  Public
router.post('/register', async (req, res) => {
    try {
        const { name, email, password } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({ message: 'All fields are required' });
        }

        const isOnline = mongoose.connection.readyState === 1;
        let userExists;

        if (isOnline) {
            userExists = await User.findOne({ email });
        } else {
            userExists = await fallbackDB.findUserByEmail(email);
        }

        if (userExists) {
            return res.status(400).json({ message: 'User already exists' });
        }

        let user;
        if (isOnline) {
            user = await User.create({
                name,
                email,
                password,
                role: 'customer',
            });
        } else {
            user = await fallbackDB.createUser({
                name,
                email,
                password,
                role: 'customer',
            });
        }

        res.status(201).json({
            token: generateToken(user._id),
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
            },
        });
    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// @desc    Authenticate user & get token
// @route   POST /api/auth/login
// @access  Public
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ message: 'All fields are required' });
        }

        const isOnline = mongoose.connection.readyState === 1;
        let user;

        if (isOnline) {
            user = await User.findOne({ email });
            if (!user || !(await user.comparePassword(password))) {
                return res.status(401).json({ message: 'Invalid email or password' });
            }
        } else {
            user = await fallbackDB.findUserByEmail(email);
            if (!user || !bcrypt.compareSync(password, user.password)) {
                return res.status(401).json({ message: 'Invalid email or password' });
            }
        }

        res.json({
            token: generateToken(user._id),
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
            },
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// @desc    Get user profile
// @route   GET /api/auth/me
// @access  Private
router.get('/me', verifyToken, async (req, res) => {
    res.json({
        user: {
            id: req.user._id,
            name: req.user.name,
            email: req.user.email,
            role: req.user.role,
        },
    });
});

// @desc    Send OTP to phone via Twilio Verify
// @route   POST /api/auth/send-otp
// @access  Public
// Normalize any Indian phone format to E.164 (+91XXXXXXXXXX)
function toE164India(raw) {
    const digits = String(raw).replace(/\D/g, '');
    if (digits.startsWith('91') && digits.length === 12) return `+${digits}`;
    if (digits.length === 10) return `+91${digits}`;
    return `+${digits}`; // already has country code, just missing +
}

router.post('/send-otp', async (req, res) => {
    try {
        const { phone } = req.body;
        if (!phone) {
            return res.status(400).json({ message: 'Phone number is required' });
        }

        if (!twilioClient) {
            return res.status(503).json({ message: 'SMS service is not configured. Please contact support.' });
        }

        const e164 = toE164India(phone);
        await twilioClient.verify.v2
            .services(process.env.TWILIO_VERIFY_SERVICE_SID)
            .verifications.create({ to: e164, channel: 'sms' });

        res.json({ message: 'OTP sent successfully' });
    } catch (error) {
        console.error('Send OTP error:', error);
        res.status(500).json({ message: 'Failed to send OTP. Please check the phone number and try again.' });
    }
});

// @desc    Verify OTP and login/register
// @route   POST /api/auth/verify-otp
// @access  Public
router.post('/verify-otp', async (req, res) => {
    try {
        const { phone, otp } = req.body;
        if (!phone || !otp) {
            return res.status(400).json({ message: 'Phone and OTP are required' });
        }

        if (!twilioClient) {
            return res.status(503).json({ message: 'SMS service is not configured. Please contact support.' });
        }

        const e164 = toE164India(phone);
        const check = await twilioClient.verify.v2
            .services(process.env.TWILIO_VERIFY_SERVICE_SID)
            .verificationChecks.create({ to: e164, code: otp });

        if (check.status !== 'approved') {
            return res.status(400).json({ message: 'Invalid or expired OTP code' });
        }

        const isOnline = mongoose.connection.readyState === 1;
        let user;

        if (isOnline) {
            user = await User.findOne({ phone });
            if (!user) {
                user = await User.create({
                    name: `Customer ${phone.slice(-4)}`,
                    email: `${phone.replace(/\D/g, '')}@phone.luxe.com`,
                    password: bcrypt.hashSync(crypto.randomBytes(20).toString('hex'), 10),
                    phone,
                    role: 'customer',
                });
            }
        } else {
            user = await fallbackDB.findOrCreateUserByPhone(phone);
        }

        res.json({
            token: generateToken(user._id),
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                phone: user.phone,
                role: user.role,
            },
        });
    } catch (error) {
        console.error('Verify OTP error:', error);
        res.status(500).json({ message: 'Server error verifying OTP' });
    }
});

// @desc    Request a password reset — generates token and emails reset link via Gmail SMTP
// @route   POST /api/auth/forgot-password
// @access  Public
router.post('/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ message: 'Email is required.' });

        const isOnline = mongoose.connection.readyState === 1;
        if (!isOnline) {
            return res.status(503).json({ message: 'Password reset requires a live database connection. Please try again in a moment.' });
        }

        const user = await User.findOne({ email: email.toLowerCase().trim() });

        if (user) {
            // Generate and persist the reset token
            const resetToken = crypto.randomBytes(32).toString('hex');
            user.resetPasswordToken = resetToken;
            user.resetPasswordExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
            await user.save();

            const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
            const resetLink = `${frontendUrl}/reset-password?token=${resetToken}`;

            if (smtpTransporter) {
                try {
                    await smtpTransporter.sendMail(buildResetEmail(user.name, user.email, resetLink));
                } catch (mailErr) {
                    // SMTP send failed — log the link so it's not lost
                    console.error('SMTP send error:', mailErr.message);
                    console.log('\n========== PASSWORD RESET (email delivery failed) ==========');
                    console.log(`Email : ${user.email}`);
                    console.log(`Link  : ${resetLink}`);
                    console.log('=============================================================\n');
                }
            } else {
                // SMTP not configured — log token to console for development use
                console.log('\n========== PASSWORD RESET (SMTP not configured) ==========');
                console.log(`Email : ${user.email}`);
                console.log(`Link  : ${resetLink}`);
                console.log('==========================================================\n');
            }
        }

        // Always return the same message to prevent email enumeration
        res.json({ message: 'If that email is registered you will receive a reset link shortly. Please check your spam folder too.' });
    } catch (error) {
        console.error('Forgot password error:', error);
        res.status(500).json({ message: 'Something went wrong. Please try again.' });
    }
});

// @desc    Reset password using token
// @route   POST /api/auth/reset-password
// @access  Public
router.post('/reset-password', async (req, res) => {
    try {
        const { token, password } = req.body;
        if (!token || !password) {
            return res.status(400).json({ message: 'Token and new password are required' });
        }

        const isOnline = mongoose.connection.readyState === 1;
        if (!isOnline) {
            return res.status(503).json({ message: 'Password reset requires a live database connection. Please try again shortly.' });
        }

        const user = await User.findOne({
            resetPasswordToken: token,
            resetPasswordExpires: { $gt: new Date() },
        });

        if (!user) {
            return res.status(400).json({ message: 'This reset link is invalid or has expired. Please request a new one.' });
        }

        user.password = password;
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;
        await user.save();

        res.json({ message: 'Password reset successfully. You can now sign in with your new password.' });
    } catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

export default router;
