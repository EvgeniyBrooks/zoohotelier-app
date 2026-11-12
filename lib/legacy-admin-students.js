const crypto = require("crypto");

module.exports = async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({
        error: "Method not allowed"
      });
    }

    const { initData } = req.body || {};

    if (!initData) {
      return res.status(400).json({
        error: "initData is required"
      });
    }

    // Проверяем Telegram initData
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

    const user = JSON.parse(
      params.get("user") || "{}"
    );

    if (!user.id) {
      return res.status(400).json({
        error: "Telegram user not found"
      });
    }

    // Проверяем администратора
    const adminResponse = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/admins` +
      `?select=id,telegram_id` +
      `&telegram_id=eq.${encodeURIComponent(user.id)}` +
      `&limit=1`,
      {
        headers: {
          "apikey":
            process.env.SUPABASE_SERVICE_ROLE_KEY,

          "Authorization":
            `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
        }
      }
    );

    const adminData =
      await adminResponse.json();

    if (!adminResponse.ok) {
      return res.status(500).json({
        error: "Failed to check admin"
      });
    }

    if (
      !Array.isArray(adminData) ||
      adminData.length === 0
    ) {
      return res.status(403).json({
        error: "Admin access required"
      });
    }

    // Получаем учеников через service role
    const studentsResponse = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/students` +
      `?select=id,telegram_id,first_name,last_name,username,certificate_name,created_at` +
      `&order=created_at.desc`,
      {
        headers: {
          "apikey":
            process.env.SUPABASE_SERVICE_ROLE_KEY,

          "Authorization":
            `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
        }
      }
    );

    const students =
      await studentsResponse.json();

    if (!studentsResponse.ok) {
      return res.status(500).json({
        error: "Failed to load students",
        details: students
      });
    }

    return res.status(200).json({
      ok: true,
      students
    });

  } catch (error) {

    console.error(error);

    return res.status(500).json({
      error: "Server error",
      details: error.message
    });
  }
};
