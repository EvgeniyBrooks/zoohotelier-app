const crypto = require("crypto");

function verifyTelegramInitData(initData, botToken) {
  const params = new URLSearchParams(initData);

  const hash = params.get("hash");

  if (!hash) {
    return null;
  }

  params.delete("hash");

  const dataCheckString =
    Array.from(params.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join("\n");

  const secretKey =
    crypto
      .createHmac("sha256", "WebAppData")
      .update(botToken)
      .digest();

  const calculatedHash =
    crypto
      .createHmac("sha256", secretKey)
      .update(dataCheckString)
      .digest("hex");

  if (calculatedHash !== hash) {
    return null;
  }

  const userRaw = params.get("user");

  if (!userRaw) {
    return null;
  }

  try {
    return JSON.parse(userRaw);
  } catch {
    return null;
  }
}


module.exports = async (req, res) => {

  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      error: "Method not allowed"
    });
  }

  try {

    const { initData } = req.body || {};

    if (!initData) {
      return res.status(400).json({
        ok: false,
        error: "initData is required"
      });
    }


    // ----------------------------------------------
    // TELEGRAM
    // ----------------------------------------------

    const telegramUser =
      verifyTelegramInitData(
        initData,
        process.env.TELEGRAM_BOT_TOKEN
      );

    if (!telegramUser) {
      return res.status(401).json({
        ok: false,
        error: "Invalid Telegram data"
      });
    }


    // ----------------------------------------------
    // SUPABASE
    // ----------------------------------------------

    const supabaseUrl =
      process.env.NEXT_PUBLIC_SUPABASE_URL;

    const serviceRoleKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY;


    // ----------------------------------------------
    // ПРОВЕРЯЕМ АДМИНА
    // ----------------------------------------------

    const adminResponse =
      await fetch(
        supabaseUrl +
        "/rest/v1/admins" +
        "?select=id" +
        "&telegram_id=eq." +
        encodeURIComponent(telegramUser.id) +
        "&limit=1",
        {
          headers: {
            "apikey": serviceRoleKey,
            "Authorization":
              "Bearer " + serviceRoleKey
          }
        }
      );


    if (!adminResponse.ok) {
      return res.status(500).json({
        ok: false,
        error: "Failed to verify admin"
      });
    }


    const admins =
      await adminResponse.json();


    if (!admins.length) {
      return res.status(403).json({
        ok: false,
        error: "Admin access required"
      });
    }


    // ----------------------------------------------
    // ПОЛУЧАЕМ ПОТОКИ
    // ----------------------------------------------

    const cohortsResponse =
      await fetch(
        supabaseUrl +
        "/rest/v1/cohorts" +
        "?select=id,name,start_date,end_date,access_end_date" +
        "&order=start_date.desc",
        {
          headers: {
            "apikey": serviceRoleKey,
            "Authorization":
              "Bearer " + serviceRoleKey
          }
        }
      );


    if (!cohortsResponse.ok) {

      const errorText =
        await cohortsResponse.text();

      console.error(
        "COHORTS LOAD ERROR:",
        errorText
      );

      return res.status(500).json({
        ok: false,
        error: "Не удалось загрузить потоки",
        details: errorText
      });
    }


    const cohorts =
      await cohortsResponse.json();


    return res.status(200).json({
      ok: true,
      cohorts
    });


  } catch (error) {

    console.error(
      "ADMIN COHORTS ERROR:",
      error
    );

    return res.status(500).json({
      ok: false,
      error:
        error.message ||
        "Internal server error"
    });

  }
};
