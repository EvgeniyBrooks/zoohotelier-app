const crypto = require("crypto");

function verifyTelegramInitData(initData, botToken) {
  const params = new URLSearchParams(initData);

  const hash = params.get("hash");

  if (!hash) {
    return null;
  }

  params.delete("hash");

  const dataCheckString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secretKey = crypto
    .createHmac("sha256", "WebAppData")
    .update(botToken)
    .digest();

  const calculatedHash = crypto
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

    const {
      initData,
      studentId,
      certificateName
    } = req.body || {};


    if (!initData) {

      return res.status(400).json({
        ok: false,
        error: "initData is required"
      });

    }


    if (!studentId) {

      return res.status(400).json({
        ok: false,
        error: "studentId is required"
      });

    }


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


    const supabaseUrl =
      process.env.NEXT_PUBLIC_SUPABASE_URL;

    const serviceRoleKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY;


    // ----------------------------------------------
    // ПРОВЕРЯЕМ, ЧТО ПОЛЬЗОВАТЕЛЬ — АДМИН
    // ----------------------------------------------

    const adminResponse =
      await fetch(
        supabaseUrl +
        "/rest/v1/admins" +
        "?select=id" +
        "&telegram_id=eq." +
        encodeURIComponent(
          telegramUser.id
        ) +
        "&limit=1",
        {
          headers: {
            "apikey":
              serviceRoleKey,

            "Authorization":
              "Bearer " +
              serviceRoleKey
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
    // ПРОВЕРЯЕМ STUDENT ID
    // ----------------------------------------------

    const cleanCertificateName =
      String(
        certificateName || ""
      ).trim();


    if (
      cleanCertificateName.length > 100
    ) {

      return res.status(400).json({
        ok: false,
        error:
          "Certificate name is too long"
      });

    }


    // ----------------------------------------------
    // ОБНОВЛЯЕМ УЧЕНИКА
    // ----------------------------------------------

    const updateResponse =
      await fetch(
        supabaseUrl +
        "/rest/v1/students" +
        "?id=eq." +
        encodeURIComponent(
          studentId
        ),
        {
          method: "PATCH",

          headers: {

            "apikey":
              serviceRoleKey,

            "Authorization":
              "Bearer " +
              serviceRoleKey,

            "Content-Type":
              "application/json",

            "Prefer":
              "return=representation"

          },

          body: JSON.stringify({

            certificate_name:
              cleanCertificateName || null

          })

        }
      );


    if (!updateResponse.ok) {

      const errorText =
        await updateResponse.text();


      console.error(
        "STUDENT UPDATE ERROR:",
        errorText
      );


      return res.status(500).json({
        ok: false,
        error:
          "Failed to update student"
      });

    }


    const updated =
      await updateResponse.json();


    return res.status(200).json({

      ok: true,

      student:
        updated[0] || null

    });


  } catch (error) {

    console.error(
      "ADMIN STUDENT UPDATE ERROR:",
      error
    );


    return res.status(500).json({

      ok: false,

      error:
        "Internal server error"

    });

  }

};
