const nodemailer = require('nodemailer');

const emailUser = process.env.EMAIL_USER;
const emailPass = process.env.EMAIL_PASS;
const emailClientId = process.env.EMAIL_CLIENT_ID || process.env.CLIENT_ID;
const emailClientSecret = process.env.EMAIL_CLIENT_SECRET || process.env.CLIENT_SECRET;
const emailRefreshToken = process.env.EMAIL_REFRESH_TOKEN || process.env.REFRESH_TOKEN;

function isPlaceholder(value) {
    if (!value) {
        return true
    }

    return (
        value.includes("your-") ||
        value.includes("your_") ||
        value.includes("youremail") ||
        value.includes("your-email") ||
        value.includes("your-google") ||
        value.includes("replace-with")
    )
}

const isEmailConfigured = Boolean(
    emailUser &&
    (!isPlaceholder(emailUser)) &&
    (
        (emailPass && !isPlaceholder(emailPass)) ||
        (emailClientId && emailClientSecret && emailRefreshToken && !isPlaceholder(emailClientId))
    )
);

const transporter = isEmailConfigured
    ? (emailPass && !isPlaceholder(emailPass)
        ? nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: emailUser,
                pass: emailPass,
            },
          })
        : nodemailer.createTransport({
            service: 'gmail',
            auth: {
                type: 'OAuth2',
                user: emailUser,
                clientId: emailClientId,
                clientSecret: emailClientSecret,
                refreshToken: emailRefreshToken,
            },
          })
      )
    : null;

if (transporter) {
    transporter.verify((error) => {
        if (error) {
            console.error('Email server validation failed:', error.message);
        } else {
            console.log('Email server is ready to send messages');
        }
    });
} else {
    console.warn('Email service is disabled. Missing valid Gmail credentials (EMAIL_PASS or OAuth).');
}



// Function to send email
const sendEmail = async (to, subject, text, html) => {
    if (!transporter) {
        console.warn(`Skipping email to ${to} because the email service is not configured.`);
        return;
    }

    try {
        const info = await transporter.sendMail({
            from: `"Backend Ledger" <${emailUser}>`, // sender address
            to, // list of receivers
            subject, // Subject line
            text, // plain text body
            html, // html body
        });

        console.log('Message sent: %s', info.messageId);
        console.log('Preview URL: %s', nodemailer.getTestMessageUrl(info));

        console.log('Message sent: %s', info.messageId);
        console.log('Preview URL: %s', nodemailer.getTestMessageUrl(info));
    } catch (error) {
        console.error('Error sending email:', error.message);
    }
};


async function sendRegistrationEmail(userEmail, name) {
    const subject = 'Welcome to Backend Ledger!';
    const text = `Hello ${name},\n\nThank you for registering at Backend Ledger. We're excited to have you on board!\n\nBest regards,\nThe Backend Ledger Team`;
    const html = `<p>Hello ${name},</p><p>Thank you for registering at Backend Ledger. We're excited to have you on board!</p><p>Best regards,<br>The Backend Ledger Team</p>`;

    await sendEmail(userEmail, subject, text, html);
}

async function sendTransactionEmail(userEmail, name, amount, toAccount) {
    const subject = 'Transaction Successful!';
    const text = `Hello ${name},\n\nYour transaction of $${amount} to account ${toAccount} was successful.\n\nBest regards,\nThe Backend Ledger Team`;
    const html = `<p>Hello ${name},</p><p>Your transaction of $${amount} to account ${toAccount} was successful.</p><p>Best regards,<br>The Backend Ledger Team</p>`;

    await sendEmail(userEmail, subject, text, html);
}

async function sendTransactionFailureEmail(userEmail, name, amount, toAccount) {
    const subject = 'Transaction Failed';
    const text = `Hello ${name},\n\nWe regret to inform you that your transaction of $${amount} to account ${toAccount} has failed. Please try again later.\n\nBest regards,\nThe Backend Ledger Team`;
    const html = `<p>Hello ${name},</p><p>We regret to inform you that your transaction of $${amount} to account ${toAccount} has failed. Please try again later.</p><p>Best regards,<br>The Backend Ledger Team</p>`;

    await sendEmail(userEmail, subject, text, html);
}

async function sendResetPasswordEmail(userEmail, name, token) {
    const resetUrl = `http://localhost:5173/?resetToken=${token}`;
    const subject = 'Reset Your Ledger Bank Password';
    const text = `Hello ${name},\n\nYou requested a password reset. Please click the following link to reset your password:\n\n${resetUrl}\n\nThis link will expire in 1 hour.\n\nBest regards,\nThe Ledger Bank Team`;
    const html = `<p>Hello ${name},</p><p>You requested a password reset. Please click the link below to reset your password:</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>This link will expire in 1 hour.</p><p>Best regards,<br>The Ledger Bank Team</p>`;

    await sendEmail(userEmail, subject, text, html);
}

async function sendOtpEmail(userEmail, name, code, amount, toAccount) {
    const subject = 'Confirm Your Ledger Bank Transfer';
    const text = `Hello ${name},\n\nA transfer of INR ${amount} to account ${toAccount} has been initiated. Please use the following 6-digit One-Time Password (OTP) to verify this transaction:\n\n${code}\n\nThis code will expire in 5 minutes.\n\nBest regards,\nThe Ledger Bank Team`;
    const html = `<p>Hello ${name},</p><p>A transfer of <strong>INR ${amount}</strong> to account <strong>${toAccount}</strong> has been initiated.</p><p>Please use the following 6-digit One-Time Password (OTP) to verify this transaction:</p><h2 style="letter-spacing: 0.1em; color: #8b5cf6;">${code}</h2><p>This code will expire in 5 minutes.</p><p>Best regards,<br>The Ledger Bank Team</p>`;

    await sendEmail(userEmail, subject, text, html);
}

module.exports = {
    sendRegistrationEmail,
    sendTransactionEmail,
    sendTransactionFailureEmail,
    sendResetPasswordEmail,
    sendOtpEmail
};
