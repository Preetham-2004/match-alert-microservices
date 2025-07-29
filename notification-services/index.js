require('dotenv').config();
const amqp = require('amqplib');
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
    console.log('📧 Email sent:', response);
  } catch (error) {
    console.error('❌ Failed to send email:', error);
  }
}

async function start() {
  let connection, channel;

  try {
    connection = await amqp.connect('amqp://rabbitmq');
    channel = await connection.createChannel();

    await channel.assertQueue('tournament_created', { durable: true });
    await channel.assertQueue('match_created', { durable: true });

    console.log('📬 Notification service listening for messages...');

    // Tournament notifications
    channel.consume('tournament_created', async (msg) => {
      const data = JSON.parse(msg.content.toString());

      console.log(`📢 Notification: New Tournament Created`);
      console.log(`🏆 Tournament ID: ${data.tournamentId}`);
      console.log(`👤 Created by: ${data.userId}`);

      const subject = `🎮 New Tournament Created!`;
      const htmlContent = `
        <h2>🏆 A new tournament has been created!</h2>
        <p><strong>📌 Tournament ID:</strong> ${data.tournamentId}</p>
        <p><strong>👤 Created by:</strong> ${data.userId}</p>
        <p>Visit your dashboard to manage or view the tournament.</p>
        <hr>
        <p>🔔 This is an automated notification.</p>
      `;

      await sendEmail(subject, htmlContent);
      channel.ack(msg);
    });

    // Match notifications
    channel.consume('match_created', async (msg) => {
      const match = JSON.parse(msg.content.toString());

      console.log(`📢 Notification: New Match Scheduled`);
      console.log(`🆚 ${match.teamA} vs ${match.teamB}`);
      console.log(`📅 Scheduled Time: ${match.scheduledTime}`);
      console.log(`🏆 Tournament ID: ${match.tournamentId}`);

      const subject = `⚔️ Match Scheduled: ${match.teamA} vs ${match.teamB}`;
      const htmlContent = `
        <h2>🎮 A new match has been scheduled!</h2>
        <p><strong>🆚 Match:</strong> ${match.teamA} vs ${match.teamB}</p>
        <p><strong>📅 Scheduled Time:</strong> ${match.scheduledTime}</p>
        <p><strong>🏆 Tournament ID:</strong> ${match.tournamentId}</p>
        <hr>
        <p>Stay tuned for updates and results!</p>
        <p>🔔 This is an automated notification.</p>
      `;

      await sendEmail(subject, htmlContent);
      channel.ack(msg);
    });

  } catch (error) {
    console.error(`❌ Could not connect to RabbitMQ:`, error);
  }
}

start();
