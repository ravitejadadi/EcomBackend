import nodemailer from 'nodemailer';

/**
 * Sends a professional order/booking confirmation email to the customer.
 * Supports environment variables: SMTP_HOST, SMTP_PORT, SMTP_USER/SMTP_EMAIL, SMTP_PASS/SMTP_APP_PASSWORD.
 * 
 * @param {Object} order - The order document from MongoDB / fallbackDB
 */
export const sendOrderConfirmationEmail = async (order) => {
    try {
        const host = process.env.SMTP_HOST || 'smtp.gmail.com';
        const port = parseInt(process.env.SMTP_PORT || '587', 10);
        const user = process.env.SMTP_USER || process.env.SMTP_EMAIL;
        const pass = process.env.SMTP_PASS || process.env.SMTP_APP_PASSWORD;

        if (!user || !pass) {
            console.warn('[SMTP] Order confirmation email not sent: SMTP credentials not fully configured.');
            return;
        }

        const transporter = nodemailer.createTransport({
            host,
            port,
            secure: port === 465,
            requireTLS: port !== 465,
            auth: { user, pass },
        });

        const { shippingAddress, orderItems, paymentMethod, totalAmount, shippingCost, gstAmount, createdAt, _id } = order;
        const recipientEmail = shippingAddress.email;
        const recipientName = `${shippingAddress.firstName} ${shippingAddress.lastName}`;

        // Calculate items subtotal
        const subtotal = orderItems.reduce((sum, item) => sum + item.price * item.quantity, 0);

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
            const imageUrl = item.image?.url || 'https://via.placeholder.com/150';
            const itemTotal = item.price * item.quantity;
            return `
            <tr>
                <td style="padding: 15px 0; border-bottom: 1px solid #eeeeee; vertical-align: top; width: 60px;">
                    <img src="${imageUrl}" alt="${item.name}" width="50" height="50" style="display: block; border-radius: 4px; object-fit: cover; border: 1px solid #e0e0e0;" />
                </td>
                <td style="padding: 15px 10px; border-bottom: 1px solid #eeeeee; vertical-align: top; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;">
                    <div style="font-weight: 600; color: #1a1a1a; font-size: 14px; margin-bottom: 4px;">${item.name}</div>
                    <div style="font-size: 12px; color: #777777;">
                        Size: <span style="font-weight: 500; color: #333333;">${item.variant.size}</span> &nbsp;|&nbsp; 
                        Color: <span style="font-weight: 500; color: #333333;">${item.variant.color}</span>
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

        const formattedOrderId = _id ? _id.toString().toUpperCase() : 'N/A';

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
                                                <td align="right" style="padding-top: 10px; font-weight: bold; color: #c5a880; font-family: Georgia, 'Times New Roman', serif;">₹${totalAmount.toLocaleString('en-IN')}</td>
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

        const mailOptions = {
            from: `"THE ELEGANT" <${user}>`,
            to: recipientEmail,
            subject: `Order Confirmation #${formattedOrderId} — THE ELEGANT`,
            html: emailHtml,
        };

        const info = await transporter.sendMail(mailOptions);
        console.log(`[SMTP] Booking confirmation email sent successfully to ${recipientEmail}. Message ID: ${info.messageId}`);
    } catch (error) {
        console.error('[SMTP] Failed to send booking confirmation email:', error);
    }
};
