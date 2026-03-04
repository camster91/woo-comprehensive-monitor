// Test script to verify email configuration
require("dotenv").config();
const nodemailer = require("nodemailer");

async function testEmail() {
    console.log("Testing email configuration...");
    
    // Check if SMTP is configured
    if (!process.env.SMTP_HOST || process.env.SMTP_HOST === "smtp.gmail.com" || !process.env.SMTP_USER) {
        console.warn("⚠️  SMTP not configured or using default settings");
        console.log("Current SMTP settings:");
        console.log(`  SMTP_HOST: ${process.env.SMTP_HOST || 'not set'}`);
        console.log(`  SMTP_PORT: ${process.env.SMTP_PORT || 'not set'}`);
        console.log(`  SMTP_USER: ${process.env.SMTP_USER || 'not set'}`);
        console.log(`  ALERT_EMAIL: ${process.env.ALERT_EMAIL || 'not set'}`);
        console.log("\nTo configure email, edit the .env file with your ashbi.ca SMTP settings.");
        return;
    }
    
    console.log(`SMTP Host: ${process.env.SMTP_HOST}:${process.env.SMTP_PORT}`);
    console.log(`From: ${process.env.SMTP_USER}`);
    console.log(`To: ${process.env.ALERT_EMAIL}`);
    
    try {
        // Create transporter
        const transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: process.env.SMTP_PORT,
            secure: parseInt(process.env.SMTP_PORT) === 465, // true for 465, false for other ports
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS,
            },
        });
        
        // Verify connection
        console.log("Verifying SMTP connection...");
        await transporter.verify();
        console.log("✅ SMTP connection successful");
        
        // Send test email
        const mailOptions = {
            from: `"WooMonitor Test" <${process.env.SMTP_USER}>`,
            to: process.env.ALERT_EMAIL,
            subject: `✅ WooMonitor Test Email from ${process.env.SMTP_HOST}`,
            text: `This is a test email from the WooMonitor system.

If you're receiving this, your email configuration is working correctly.

Server: ${process.env.SMTP_HOST}:${process.env.SMTP_PORT}
From: ${process.env.SMTP_USER}
Time: ${new Date().toISOString()}

The WooMonitor system will now be able to send you alerts when WooCommerce errors are detected.`,
            html: `<h1>✅ WooMonitor Test Email</h1>
<p>This is a test email from the WooMonitor system.</p>
<p>If you're receiving this, your email configuration is working correctly.</p>
<ul>
<li><strong>Server:</strong> ${process.env.SMTP_HOST}:${process.env.SMTP_PORT}</li>
<li><strong>From:</strong> ${process.env.SMTP_USER}</li>
<li><strong>Time:</strong> ${new Date().toISOString()}</li>
</ul>
<p>The WooMonitor system will now be able to send you alerts when WooCommerce errors are detected.</p>`
        };
        
        console.log("Sending test email...");
        const info = await transporter.sendMail(mailOptions);
        console.log(`✅ Test email sent successfully!`);
        console.log(`Message ID: ${info.messageId}`);
        console.log(`Preview URL: ${nodemailer.getTestMessageUrl(info) || 'Not available'}`);
        
    } catch (error) {
        console.error("❌ Email test failed:");
        console.error(`Error: ${error.message}`);
        
        if (error.code) {
            console.error(`Error Code: ${error.code}`);
        }
        
        // Common troubleshooting tips
        console.log("\n🔧 Troubleshooting tips:");
        console.log("1. Check your SMTP credentials in .env file");
        console.log("2. Verify ashbi.ca SMTP server allows connections");
        console.log("3. Try different port (465 for SSL, 587 for STARTTLS, 25 for plain)");
        console.log("4. Check if you need to enable 'Less Secure Apps' or app passwords");
        console.log("5. Test SMTP settings with a regular email client first");
        console.log("6. Contact your hosting provider for correct SMTP settings");
        
        // Common ashbi.ca SMTP issues
        console.log("\n📧 For ashbi.ca email (cPanel hosting):");
        console.log("- Host: mail.ashbi.ca");
        console.log("- Port: 587 (STARTTLS) or 465 (SSL)");
        console.log("- Username: Full email address (alerts@ashbi.ca)");
        console.log("- Password: Email account password");
        console.log("- Authentication: Required");
    }
}

// Run the test
testEmail().catch(console.error);