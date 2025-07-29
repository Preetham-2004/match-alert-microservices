require('dotenv').config();
const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

async function sendEmail(subject, htmlContent) {
    try {
        const response = await resend.emails.send({
            from: process.env.EMAIL_FROM,
            to: [process.env.EMAIL_TO],
            subject,
            html: htmlContent,
        });

        console.log('📧 Email sent successfully:', response);
    } catch (error) {
        console.error('❌ Error sending email:', error.message);
    }
}

module.exports = { sendEmail };
