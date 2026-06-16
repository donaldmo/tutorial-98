

import sendgrid from '@sendgrid/mail'
import dotenv from 'dotenv'
dotenv.config()

sendgrid.setApiKey(process.env.SENDGRID_API_KEY)
// sendgrid.setDataResidency('eu'); 
// uncomment the above line if you are sending mail using a regional EU subuser

const msg = {
    to: 'motswiridonald@gmail.com', // Change to your recipient
    from: 'domotswiri@gmail.com', // Change to your verified sender
    subject: 'Sending with SendGrid is Fun',
    text: 'and easy to do anywhere, even with Node.js',
    html: '<strong>and easy to do anywhere, even with Node.js</strong>',
}
sendgrid
    .send(msg)
    .then(() => {
        console.log('Email sent')
    })
    .catch((error) => {
        console.error(error)
    })