import Mailgen from "mailgen";
import { isProduction } from "../config/env.js";
import nodemailer from "nodemailer";

const sendEmail = async (options) => {
  const actionLink = options.mailgenContent.body.action.button.link;

  const mailGenerator = new Mailgen({
    theme: "default",
    product: {
      name: "BaseCampy",
      link: process.env.FRONTEND_URL || "http://localhost:5173",
    },
  });

  const emailTextual = mailGenerator.generatePlaintext(options.mailgenContent);
  const emailHtml = mailGenerator.generate(options.mailgenContent);

  if (!isProduction) {
    console.log(`[mail] ${options.subject} -> ${options.email}\n[mail] link: ${actionLink}`);
  }

  if (!process.env.MAILTRAP_SMTP_HOST) {
    console.warn("[mail] SMTP is not configured, email not sent");
    return false;
  }

  const transporter = nodemailer.createTransport({
    host: process.env.MAILTRAP_SMTP_HOST,
    port: Number(process.env.MAILTRAP_SMTP_PORT),
    auth: {
      user: process.env.MAILTRAP_SMTP_USER,
      pass: process.env.MAILTRAP_SMTP_PASS,
    },
  });

  const mail = {
    from: process.env.MAIL_FROM || "BaseCampy <no-reply@example.com>",
    to: options.email,
    subject: options.subject,
    text: emailTextual,
    html: emailHtml,
  };

  try {
    await transporter.sendMail(mail);
    return true;
  } catch (error) {
    console.error("Email service failed, might be a credential issue!", error.message);
    return false;
  }
};

const emailVerificationMailgenContent = (username, verificationUrl) => {
  return {
    body: {
      name: username,
      intro: "Welcome to BaseCampy! We're excited to have you on board.",
      action: {
        instructions: "To verify your email please click the button below",
        button: {
          color: "#6366f1",
          text: "Verify Email",
          link: verificationUrl,
        },
      },
      outro: "Need help? Just reply to this email.",
    },
  };
};

const forgotPasswordMailgenContent = (username, passwordResetUrl) => {
  return {
    body: {
      name: username,
      intro: "We got a request to reset the password of your account.",
      action: {
        instructions: "To reset your password, click on the button below",
        button: {
          color: "#6366f1",
          text: "Reset Password",
          link: passwordResetUrl,
        },
      },
      outro: "If you didn't ask for this, you can ignore this email.",
    },
  };
};

const invitationMailgenContent = (inviterName, projectName, roleLabel, inviteUrl) => {
  return {
    body: {
      name: "there",
      intro: `${inviterName} invited you to join the project "${projectName}" on BaseCampy as ${roleLabel}.`,
      action: {
        instructions: "Click the button below to review and accept the invitation. The link works for 7 days.",
        button: {
          color: "#6366f1",
          text: "View invitation",
          link: inviteUrl,
        },
      },
      outro: "If you weren't expecting this, you can safely ignore this email.",
    },
  };
};

export { emailVerificationMailgenContent, forgotPasswordMailgenContent, invitationMailgenContent, sendEmail };
