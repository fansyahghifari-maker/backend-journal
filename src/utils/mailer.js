/**
 * MAILER UTILITY — pakai Resend.com
 * Install dulu: npm install resend
 */

const { Resend } = require('resend')

const resend = new Resend(process.env.RESEND_API_KEY)

// Ganti dengan domain kamu setelah verifikasi domain di Resend
// Kalau belum punya domain, pakai onboarding@resend.dev (hanya bisa kirim ke email sendiri)
const FROM_EMAIL = process.env.FROM_EMAIL || 'onboarding@resend.dev'
const APP_NAME   = 'Corex Journal'
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000'

// ─── KIRIM EMAIL VERIFIKASI ───────────────────────────────────────────────────
const sendVerificationEmail = async ({ to, username, token }) => {
  const verifyUrl = `${FRONTEND_URL}/verify-email?token=${token}`

  const { data, error } = await resend.emails.send({
    from:    FROM_EMAIL,
    to:      [to],
    subject: `Verifikasi Email Kamu — ${APP_NAME}`,
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:560px;margin:40px auto;background:#111111;border-radius:12px;overflow:hidden;border:1px solid #222;">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#1a1a1a,#111);padding:32px 40px;border-bottom:1px solid #222;">
      <h1 style="margin:0;font-size:24px;font-weight:700;color:#F5A623;">
        Corex <span style="color:#fff;">Journal</span>
      </h1>
      <p style="margin:4px 0 0;font-size:12px;color:#666;letter-spacing:2px;text-transform:uppercase;">
        Trading Intelligence Platform
      </p>
    </div>

    <!-- Content -->
    <div style="padding:40px;">
      <h2 style="margin:0 0 8px;font-size:22px;color:#fff;font-weight:600;">
        Hei, ${username}! 👋
      </h2>
      <p style="margin:0 0 24px;font-size:15px;color:#999;line-height:1.6;">
        Terima kasih sudah daftar di <strong style="color:#fff;">Corex Journal</strong>. 
        Klik tombol di bawah untuk verifikasi email kamu dan mulai trading journey-mu!
      </p>

      <!-- Button -->
      <div style="text-align:center;margin:32px 0;">
        <a href="${verifyUrl}" 
           style="display:inline-block;background:linear-gradient(135deg,#F5A623,#e8941a);
                  color:#000;text-decoration:none;padding:14px 32px;border-radius:8px;
                  font-weight:700;font-size:15px;letter-spacing:0.3px;">
          ✓ Verifikasi Email Sekarang
        </a>
      </div>

      <!-- Link fallback -->
      <p style="margin:24px 0 0;font-size:13px;color:#555;text-align:center;">
        Atau copy link ini ke browser kamu:
      </p>
      <p style="margin:8px 0 0;font-size:12px;color:#F5A623;text-align:center;word-break:break-all;">
        ${verifyUrl}
      </p>

      <!-- Warning -->
      <div style="margin:32px 0 0;padding:16px;background:#1a1a1a;border-radius:8px;border-left:3px solid #F5A623;">
        <p style="margin:0;font-size:13px;color:#888;">
          ⚠️ Link ini akan <strong style="color:#fff;">kadaluarsa dalam 24 jam</strong>. 
          Kalau kamu tidak mendaftar, abaikan email ini.
        </p>
      </div>
    </div>

    <!-- Footer -->
    <div style="padding:24px 40px;border-top:1px solid #222;background:#0d0d0d;">
      <p style="margin:0;font-size:12px;color:#444;text-align:center;">
        © 2026 Corex Journal. All rights reserved.<br>
        Email ini dikirim otomatis, mohon jangan reply.
      </p>
    </div>

  </div>
</body>
</html>
    `,
  })

  if (error) {
    console.error('[MAILER] sendVerificationEmail error:', error)
    throw new Error('Gagal mengirim email verifikasi.')
  }

  console.log('[MAILER] Verification email sent:', data?.id)
  return data
}

// ─── KIRIM EMAIL RESET PASSWORD ───────────────────────────────────────────────
const sendResetPasswordEmail = async ({ to, username, token }) => {
  const resetUrl = `${FRONTEND_URL}/reset-password?token=${token}`

  const { data, error } = await resend.emails.send({
    from:    FROM_EMAIL,
    to:      [to],
    subject: `Reset Password — ${APP_NAME}`,
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:560px;margin:40px auto;background:#111111;border-radius:12px;overflow:hidden;border:1px solid #222;">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#1a1a1a,#111);padding:32px 40px;border-bottom:1px solid #222;">
      <h1 style="margin:0;font-size:24px;font-weight:700;color:#F5A623;">
        Corex <span style="color:#fff;">Journal</span>
      </h1>
    </div>

    <!-- Content -->
    <div style="padding:40px;">
      <h2 style="margin:0 0 8px;font-size:22px;color:#fff;font-weight:600;">
        Reset Password 🔐
      </h2>
      <p style="margin:0 0 24px;font-size:15px;color:#999;line-height:1.6;">
        Hei <strong style="color:#fff;">${username}</strong>, kami menerima permintaan reset password untuk akun kamu. 
        Klik tombol di bawah untuk membuat password baru.
      </p>

      <!-- Button -->
      <div style="text-align:center;margin:32px 0;">
        <a href="${resetUrl}"
           style="display:inline-block;background:linear-gradient(135deg,#F5A623,#e8941a);
                  color:#000;text-decoration:none;padding:14px 32px;border-radius:8px;
                  font-weight:700;font-size:15px;">
          🔑 Reset Password Sekarang
        </a>
      </div>

      <p style="margin:24px 0 0;font-size:13px;color:#555;text-align:center;">
        Atau copy link ini ke browser:
      </p>
      <p style="margin:8px 0 0;font-size:12px;color:#F5A623;text-align:center;word-break:break-all;">
        ${resetUrl}
      </p>

      <div style="margin:32px 0 0;padding:16px;background:#1a1a1a;border-radius:8px;border-left:3px solid #ef4444;">
        <p style="margin:0;font-size:13px;color:#888;">
          ⚠️ Link ini kadaluarsa dalam <strong style="color:#fff;">1 jam</strong>. 
          Kalau kamu tidak meminta reset password, abaikan email ini dan pastikan akun kamu aman.
        </p>
      </div>
    </div>

    <!-- Footer -->
    <div style="padding:24px 40px;border-top:1px solid #222;background:#0d0d0d;">
      <p style="margin:0;font-size:12px;color:#444;text-align:center;">
        © 2026 Corex Journal. All rights reserved.
      </p>
    </div>

  </div>
</body>
</html>
    `,
  })

  if (error) {
    console.error('[MAILER] sendResetPasswordEmail error:', error)
    throw new Error('Gagal mengirim email reset password.')
  }

  console.log('[MAILER] Reset password email sent:', data?.id)
  return data
}

module.exports = { sendVerificationEmail, sendResetPasswordEmail }