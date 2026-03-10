const axios = require("axios");

async function sendEmail({ to, subject, text }) {
  if (!process.env.MAILGUN_API_KEY || !process.env.MAILGUN_DOMAIN) {
    console.log(`[Email Mock] To: ${to} | Subject: ${subject}`);
    return { mocked: true };
  }

  const mailFrom = process.env.MAIL_FROM || `WooMonitor <alerts@${process.env.MAILGUN_DOMAIN}>`;
  const res = await axios.post(
    `https://api.mailgun.net/v3/${process.env.MAILGUN_DOMAIN}/messages`,
    new URLSearchParams({ from: mailFrom, to, subject, text }),
    { auth: { username: "api", password: process.env.MAILGUN_API_KEY } }
  );
  return res.data;
}

module.exports = { sendEmail };
