const crypto = require("crypto");


function verifyTelegramInitData(initData, botToken) {

  const params =
    new URLSearchParams(initData);

  const hash =
    params.get("hash");

  if (!hash) {
    return null;
  }

  params.delete("hash");

  const dataCheckString =
    Array.from(params.entries())
      .sort(([a], [b]) =>
        a.localeCompare(b)
      )
      .map(
        ([key, value]) =>
          `${key}=${value}`
      )
      .join("\n");


  const secretKey =
    crypto
      .createHmac(
        "sha256",
        "WebAppData"
      )
      .update(botToken)
      .digest();


  const calculatedHash =
    crypto
      .createHmac(
        "sha256",
        secretKey
      )
      .update(dataCheckString)
      .digest("hex");


  if (calculatedHash !== hash) {
    return null;
  }


  const userRaw =
    params.get("user");


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
      cohortId
    } = req.body || {};


    if (!initData) {

      return res.status(400).json({
        ok: false,
        error: "initData is required"
      });

    }


    if (!cohortId) {

      return res.status(400).json({
        ok: false,
        error: "cohortId is required"
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
    // ПРОВЕРЯЕМ, ЧТО ПОТОК СУЩЕСТВУЕТ
    // ----------------------------------------------

    const cohortResponse =
      await fetch(
        supabaseUrl +
        "/rest/v1/cohorts" +
        "?select=id,name" +
        "&id=eq." +
        encodeURIComponent(cohortId) +
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


    if (!cohortResponse.ok) {

      const errorText =
        await cohortResponse.text();

      return res.status(500).json({
        ok: false,
        error:
          "Не удалось проверить поток",
        details:
          errorText
      });

    }


    const cohorts =
      await cohortResponse.json();


    if (!cohorts.length) {

      return res.status(404).json({
        ok: false,
        error: "Поток не найден"
      });

    }


    // ----------------------------------------------
    // ПРОВЕРЯЕМ УЧЕНИКОВ В ПОТОКЕ
    // ----------------------------------------------

    const enrollmentResponse =
      await fetch(
        supabaseUrl +
        "/rest/v1/enrollments" +
        "?select=id" +
        "&cohort_id=eq." +
        encodeURIComponent(cohortId) +
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


    if (!enrollmentResponse.ok) {

      const errorText =
        await enrollmentResponse.text();

      return res.status(500).json({
        ok: false,
        error:
          "Не удалось проверить учеников потока",
        details:
          errorText
      });

    }


    const enrollments =
      await enrollmentResponse.json();


    if (enrollments.length) {

      return res.status(409).json({
        ok: false,
        error:
          "Нельзя удалить поток, в котором уже есть ученики"
      });

    }


    // ----------------------------------------------
    // УДАЛЕНИЕ
    // ----------------------------------------------

    const deleteResponse =
      await fetch(
        supabaseUrl +
        "/rest/v1/cohorts" +
        "?id=eq." +
        encodeURIComponent(cohortId),
        {
          method: "DELETE",

          headers: {
            "apikey":
              serviceRoleKey,

            "Authorization":
              "Bearer " +
              serviceRoleKey
          }
        }
      );


    if (!deleteResponse.ok) {

      const errorText =
        await deleteResponse.text();

      console.error(
        "COHORT DELETE ERROR:",
        errorText
      );

      return res.status(500).json({
        ok: false,
        error:
          "Не удалось удалить поток",
        details:
          errorText
      });

    }


    return res.status(200).json({
      ok: true,
      message:
        "Поток успешно удалён"
    });


  } catch (error) {

    console.error(
      "ADMIN COHORT DELETE ERROR:",
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
