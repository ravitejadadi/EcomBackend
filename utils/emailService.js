import nodemailer from 'nodemailer';

/**
 * Sends a professional order/booking confirmation email to the customer.
 * Supports Brevo (using BREVO_API_KEY, BREVO_FROM_EMAIL, BREVO_FROM_NAME) and fallback to Nodemailer Gmail SMTP.
 * Guaranteed to never fail or block order placement even if email sending fails.
 * 
 * @param {Object} order - The order document from MongoDB / fallbackDB
 */
export const sendOrderConfirmationEmail = async (order) => {
    try {
        if (!order || !order.shippingAddress || !order.shippingAddress.email) {
            console.warn('[Email Service] Skipping order confirmation email: Invalid order or recipient email missing.');
            return;
        }

        const { shippingAddress, orderItems = [], paymentMethod, totalAmount, shippingCost = 0, gstAmount = 0, createdAt, _id } = order;
        const recipientEmail = shippingAddress.email;
        const recipientName = `${shippingAddress.firstName || ''} ${shippingAddress.lastName || ''}`.trim() || 'Valued Customer';
        const formattedOrderId = _id ? _id.toString().toUpperCase() : 'N/A';
        const subject = `Order Confirmation #${formattedOrderId} — THE ELEGANT`;

        // Calculate items subtotal
        const subtotal = orderItems.reduce((sum, item) => sum + (item.price || 0) * (item.quantity || 1), 0);

        // Format dates
        const orderDate = createdAt ? new Date(createdAt).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
        }) : new Date().toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
        });

        // Build list of items for the email
        const itemsHtml = orderItems.map(item => {
            let rawUrl = (typeof item.image === 'string' ? item.image : item.image?.url) ||
                         (Array.isArray(item.images) ? (typeof item.images[0] === 'string' ? item.images[0] : item.images[0]?.url) : null) ||
                         'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=300&q=80';

            // Ensure absolute URL for email clients
            if (rawUrl && !rawUrl.startsWith('http://') && !rawUrl.startsWith('https://')) {
                const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
                rawUrl = `${baseUrl.replace(/\/$/, '')}/${rawUrl.replace(/^\//, '')}`;
            }

            const itemTotal = (item.price || 0) * (item.quantity || 1);
            return `
            <tr>
                <td style="padding: 15px 0; border-bottom: 1px solid #eeeeee; vertical-align: top; width: 60px;">
                    <img src="${rawUrl}" alt="${item.name}" width="60" height="60" style="display: block; border-radius: 6px; object-fit: cover; border: 1px solid #e0e0e0; max-width: 60px; height: auto;" />
                </td>
                <td style="padding: 15px 10px; border-bottom: 1px solid #eeeeee; vertical-align: top; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;">
                    <div style="font-weight: 600; color: #1a1a1a; font-size: 14px; margin-bottom: 4px;">${item.name}</div>
                    <div style="font-size: 12px; color: #777777;">
                        Size: <span style="font-weight: 500; color: #333333;">${item.variant?.size || 'N/A'}</span> &nbsp;|&nbsp; 
                        Color: <span style="font-weight: 500; color: #333333;">${item.variant?.color || 'N/A'}</span>
                    </div>
                </td>
                <td style="padding: 15px 10px; border-bottom: 1px solid #eeeeee; vertical-align: top; text-align: center; font-size: 14px; color: #555555; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;">
                    ${item.quantity}
                </td>
                <td style="padding: 15px 0; border-bottom: 1px solid #eeeeee; vertical-align: top; text-align: right; font-weight: 600; font-size: 14px; color: #1a1a1a; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;">
                    ₹${itemTotal.toLocaleString('en-IN')}
                </td>
            </tr>
            `;
        }).join('');

        const emailHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Booking Confirmation - THE ELEGANT</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f6f5f3; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f6f5f3; padding: 40px 10px;">
        <tr>
            <td align="center">
                <!-- Main Container -->
                <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width: 600px; width: 100%; background-color: #ffffff; border-top: 4px solid #c5a880; box-shadow: 0 4px 12px rgba(0,0,0,0.05); border-radius: 4px; overflow: hidden;">
                    
                    <!-- Header / Logo -->
                    <tr>
                        <td align="center" style="padding: 35px 20px 20px 20px; border-bottom: 1px solid #f0edf0;">
                            <div style="font-family: Georgia, 'Times New Roman', serif; font-size: 26px; letter-spacing: 4px; color: #1a1a1a; text-transform: uppercase; font-weight: bold; margin-bottom: 4px;">THE ELEGANT</div>
                            <div style="font-size: 10px; letter-spacing: 3px; color: #c5a880; text-transform: uppercase; font-weight: 600;">Luxury Fashion & Lifestyle</div>
                        </td>
                    </tr>

                    <!-- Body Content -->
                    <tr>
                        <td style="padding: 40px 35px 20px 35px;">
                            <h2 style="font-family: Georgia, 'Times New Roman', serif; font-size: 20px; font-weight: normal; color: #1a1a1a; margin-top: 0; margin-bottom: 15px; text-transform: capitalize;">Dear ${recipientName},</h2>
                            <p style="font-size: 14px; line-height: 1.6; color: #444444; margin-bottom: 25px;">
                                Thank you for choosing <strong>THE ELEGANT</strong>. We are pleased to inform you that your booking has been successfully processed. Here is the confirmation of your order details.
                            </p>

                            <!-- Order Meta Info -->
                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #fcfbfa; border: 1px solid #eceae6; border-radius: 4px; padding: 20px; margin-bottom: 30px;">
                                <tr>
                                    <td style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 13px; color: #666666; width: 50%;">
                                        <div style="margin-bottom: 6px;">Order ID: <strong style="color: #1a1a1a;">#${formattedOrderId}</strong></div>
                                        <div>Date: <strong style="color: #1a1a1a;">${orderDate}</strong></div>
                                    </td>
                                    <td style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 13px; color: #666666; width: 50%; text-align: right;">
                                        <div style="margin-bottom: 6px;">Payment Method: <strong style="color: #1a1a1a;">${paymentMethod}</strong></div>
                                        <div>Status: <strong style="color: #43a047;">Confirmed</strong></div>
                                    </td>
                                </tr>
                            </table>

                            <!-- Items Table -->
                            <h3 style="font-family: Georgia, 'Times New Roman', serif; font-size: 16px; font-weight: normal; border-bottom: 1px solid #1a1a1a; padding-bottom: 8px; margin-top: 0; margin-bottom: 10px; color: #1a1a1a;">YOUR ORDER</h3>
                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse: collapse; margin-bottom: 20px;">
                                <thead>
                                    <tr>
                                        <th colspan="2" align="left" style="font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #777777; padding-bottom: 8px; border-bottom: 1px solid #eeeeee;">Item Details</th>
                                        <th align="center" style="font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #777777; padding-bottom: 8px; border-bottom: 1px solid #eeeeee; width: 60px;">Qty</th>
                                        <th align="right" style="font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #777777; padding-bottom: 8px; border-bottom: 1px solid #eeeeee; width: 90px;">Subtotal</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${itemsHtml}
                                </tbody>
                            </table>

                            <!-- Price Calculation -->
                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom: 30px;">
                                <tr>
                                    <td style="width: 60%;"></td>
                                    <td style="width: 40%;">
                                        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="font-size: 13px; color: #555555; line-height: 2;">
                                            <tr>
                                                <td align="left">Subtotal:</td>
                                                <td align="right" style="font-weight: 500; color: #1a1a1a;">₹${subtotal.toLocaleString('en-IN')}</td>
                                            </tr>
                                            <tr>
                                                <td align="left">GST (18%):</td>
                                                <td align="right" style="font-weight: 500; color: #1a1a1a;">₹${gstAmount.toLocaleString('en-IN')}</td>
                                            </tr>
                                            <tr>
                                                <td align="left">Shipping:</td>
                                                <td align="right" style="font-weight: 500; color: #1a1a1a;">${shippingCost === 0 ? 'Free' : `₹${shippingCost}`}</td>
                                            </tr>
                                            <tr style="font-size: 16px; border-top: 1px solid #eeeeee;">
                                                <td align="left" style="padding-top: 10px; font-weight: bold; color: #1a1a1a; font-family: Georgia, 'Times New Roman', serif;">Total:</td>
                                                <td align="right" style="padding-top: 10px; font-weight: bold; color: #c5a880; font-family: Georgia, 'Times New Roman', serif;">₹${totalAmount ? totalAmount.toLocaleString('en-IN') : '0'}</td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                            </table>

                            <!-- Delivery Address -->
                            <h3 style="font-family: Georgia, 'Times New Roman', serif; font-size: 16px; font-weight: normal; border-bottom: 1px solid #1a1a1a; padding-bottom: 8px; margin-top: 0; margin-bottom: 15px; color: #1a1a1a;">SHIPPING DETAILS</h3>
                            <div style="font-size: 13px; line-height: 1.6; color: #555555; margin-bottom: 30px; background-color: #fafafa; border: 1px solid #eeeeee; border-radius: 4px; padding: 15px;">
                                <div style="font-weight: 600; color: #1a1a1a; margin-bottom: 4px;">${recipientName}</div>
                                <div>${shippingAddress.address}</div>
                                <div>${shippingAddress.city}, ${shippingAddress.state} - ${shippingAddress.pincode}</div>
                                <div style="margin-top: 8px;">Phone: ${shippingAddress.phone}</div>
                                <div>Email: ${shippingAddress.email}</div>
                            </div>
                        </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                        <td align="center" style="background-color: #1a1a1a; padding: 30px 20px; color: #ffffff; text-align: center;">
                            <div style="font-family: Georgia, 'Times New Roman', serif; font-size: 14px; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 10px; color: #c5a880;">THE ELEGANT</div>
                            <p style="font-size: 11px; line-height: 1.6; color: #888888; max-width: 450px; margin: 0 auto 20px auto;">
                                You are receiving this email because you placed an order on theelegant.com. If you have any questions or require assistance, please contact our concierge at support@theelegant.com.
                            </p>
                            <div style="font-size: 10px; color: #555555;">
                                &copy; 2026 THE ELEGANT. All rights reserved.
                            </div>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
        `;

        const brevoApiKey = process.env.BREVO_API_KEY;
        const senderEmail = process.env.BREVO_FROM_EMAIL || process.env.BREVO_SENDER_EMAIL || process.env.SMTP_USER || process.env.SMTP_EMAIL || 'theelegant2327@gmail.com';
        const senderName = process.env.BREVO_FROM_NAME || process.env.BREVO_SENDER_NAME || 'The ELEGANT';

        // ─── Attempt 1: Brevo SMTP Relay (for xsmtpsib- keys) ────────────────
        if (brevoApiKey && brevoApiKey.startsWith('xsmtpsib-')) {
            try {
                const brevoTransporter = nodemailer.createTransport({
                    host: 'smtp-relay.brevo.com',
                    port: 587,
                    secure: false,
                    auth: {
                        user: senderEmail,
                        pass: brevoApiKey.trim(),
                    },
                });

                const mailOptions = {
                    from: `"${senderName}" <${senderEmail}>`,
                    to: recipientEmail,
                    subject: subject,
                    html: emailHtml,
                };

                const info = await brevoTransporter.sendMail(mailOptions);
                console.log(`[Brevo SMTP] Order confirmation email sent successfully to ${recipientEmail}. Message ID: ${info.messageId}`);
                return;
            } catch (brevoSmtpErr) {
                console.error('[Brevo SMTP] Failed via Brevo SMTP relay:', brevoSmtpErr.message);
            }
        }

        // ─── Attempt 2: Brevo REST API v3 (for xkeysib- keys) ────────────────
        if (brevoApiKey && !brevoApiKey.startsWith('placeholder')) {
            try {
                const response = await fetch('https://api.brevo.com/v3/smtp/email', {
                    method: 'POST',
                    headers: {
                        'accept': 'application/json',
                        'api-key': brevoApiKey.trim(),
                        'content-type': 'application/json',
                    },
                    body: JSON.stringify({
                        sender: { name: senderName, email: senderEmail },
                        to: [{ email: recipientEmail, name: recipientName }],
                        subject: subject,
                        htmlContent: emailHtml,
                    }),
                });

                if (response.ok) {
                    const data = await response.json();
                    console.log(`[Brevo API] Order confirmation email sent successfully to ${recipientEmail}. Message ID: ${data.messageId || 'N/A'}`);
                    return;
                } else {
                    const errData = await response.text();
                    console.error(`[Brevo API] Returned error status ${response.status}: ${errData}`);
                }
            } catch (brevoErr) {
                console.error('[Brevo API] Error calling Brevo API:', brevoErr.message);
            }
        }

        // ─── Attempt 3: Nodemailer Gmail SMTP Fallback ─────────────────────────
        const host = process.env.SMTP_HOST || 'smtp.gmail.com';
        const port = parseInt(process.env.SMTP_PORT || '587', 10);
        const user = process.env.SMTP_USER || process.env.SMTP_EMAIL;
        const pass = process.env.SMTP_PASS || process.env.SMTP_APP_PASSWORD;

        if (user && pass) {
            try {
                const transporter = nodemailer.createTransport({
                    host,
                    port,
                    secure: port === 465,
                    requireTLS: port !== 465,
                    auth: { user, pass },
                });

                const mailOptions = {
                    from: `"${senderName}" <${user}>`,
                    to: recipientEmail,
                    subject: subject,
                    html: emailHtml,
                };

                const info = await transporter.sendMail(mailOptions);
                console.log(`[SMTP Fallback] Order confirmation email sent successfully to ${recipientEmail}. Message ID: ${info.messageId}`);
                return;
            } catch (smtpErr) {
                console.error('[SMTP Fallback] Failed via Nodemailer SMTP:', smtpErr.message);
            }
        }

        console.warn('[Email Service] Order confirmation email not sent: Neither Brevo API key nor SMTP credentials are operational.');

    } catch (error) {
        // Guaranteed safety: error is caught & logged, never crashing or failing the caller order flow
        console.error('[Email Service] Failed to send order confirmation email (order non-blocking):', error.message || error);
    }
};
