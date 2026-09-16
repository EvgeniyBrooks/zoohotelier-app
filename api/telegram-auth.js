import crypto from "crypto";

export default async function handler(req, res) {
  try {
    const { initData } = req.body || {};

    if (!initData) {
      return res.status(400).json({
        error: "initData is required"
      });
    }

    const params = new URLSearchParams(initData);
    const hash = params.get("hash");

    if (!hash) {
      return res.status(401).json({
        error: "Invalid Telegram data"
      });
    }

    params.delete("hash");

    const dataCheckString = [...params.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join("\n");

    const secretKey = crypto
      .createHmac("sha256", "WebAppData")
      .update(process.env.TELEGRAM_BOT_TOKEN)
      .digest();

    const calculatedHash = crypto
      .createHmac("sha256", secretKey)
      .update(dataCheckString)
      .digest("hex");

    if (calculatedHash !== hash) {
      return res.status(401).json({
        error: "Telegram verification failed"
      });
    }

    const user = JSON.parse(params.get("user") || "{}");

    return res.status(200).json({
      ok: true,
      user: {
        id: user.id,
        first_name: user.first_name,
        username: user.username
      }
    });

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error: "Server error"
    });
  }
}
