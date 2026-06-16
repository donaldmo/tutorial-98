import dotenv from "dotenv";
import nodemailer from "nodemailer";

import { systemEmailTransporter } from "../src/utils/emailTransporter.js";

async function main() {
    try {;

        const info = await systemEmailTransporter.sendMail({
            from: '"Brendmo" <donald@codegarden.co.za>', // your email as admin
            to: 'domotswiri@gmail.com',
            subject: `Test Email from Brendmo`,
            html: `<b>Hello world?</b>`,
        });

        console.log("Message sent: %s", info.messageId);
        // Preview URL is only available when using an Ethereal test account
        console.log("Preview URL: %s", nodemailer.getTestMessageUrl(info));
    } catch (err) {
        console.error("Error while sending mail:", err);
    }
}

main().catch(console.error);