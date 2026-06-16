import { Resend } from 'resend';

// Initialize Resend with your API key
// Get your API key from: https://resend.com/api-keys
const resend = new Resend(process.env.RESEND_API_KEY);

async function sendTestEmail() {
    try {
        console.log('Sending test email...');

        const data = await resend.emails.send({
            from: 'onboarding@resend.dev', // Use verified domain or resend.dev for testing
            to: ['your-email@example.com'], // Replace with your email
            subject: 'Resend Test Email',
            html: `
        <h1>Test Email from Resend</h1>
        <p>This is a test email sent using the Resend API.</p>
        <p>Timestamp: ${new Date().toISOString()}</p>
        <p>If you're seeing this, your Resend integration is working! ✅</p>
      `,
        });

        console.log('✅ Email sent successfully!');
        console.log('Email ID:', data.id);
        return data;

    } catch (error) {
        console.error('❌ Error sending email:', error);
        throw error;
    }
}

// Run the test
sendTestEmail()
    .then(() => {
        console.log('\n✨ Test completed successfully');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n💥 Test failed');
        process.exit(1);
    });