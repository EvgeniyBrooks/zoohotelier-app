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


  if (
    calculatedHash !== hash
  ) {
    return null;
  }


  const userRaw =
    params.get("user");

  if (!userRaw) {
    return null;
  }


  try {

    return JSON.parse(
      userRaw
    );

  } catch {

    return null;

  }

}


module.exports = async (
  req,
  res
) => {

  if (
    req.method !== "POST"
  ) {

    return res.status(405).json({

      ok: false,

      error:
        "Method not allowed"

    });

  }


  try {

    const {
      initData,
      name,
      startDate,
      endDate,
      accessEndDate
    } =
      req.body || {};


    // ----------------------------------------------
    // ПРОВЕРКА ОБЯЗАТЕЛЬНЫХ ДАННЫХ
    // ----------------------------------------------

    if (!initData) {

      return res.status(400).json({

        ok: false,

        error:
          "initData is required"

      });

    }


    if (!name) {

      return res.status(400).json({

        ok: false,

        error:
          "Название потока обязательно"

      });

    }


    if (!startDate) {

      return res.status(400).json({

        ok: false,

        error:
          "Дата начала обязательна"

      });

    }


    if (!endDate) {

      return res.status(400).json({

        ok: false,

        error:
          "Дата окончания обязательна"

      });

    }


    if (!accessEndDate) {

      return res.status(400).json({

        ok: false,

        error:
          "Дата окончания доступа обязательна"

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

        error:
          "Invalid Telegram data"

      });

    }


    // ----------------------------------------------
    // SUPABASE
    // ----------------------------------------------

    const supabaseUrl =
      process.env
        .NEXT_PUBLIC_SUPABASE_URL;


    const serviceRoleKey =
      process.env
        .SUPABASE_SERVICE_ROLE_KEY;


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


    if (
      !adminResponse.ok
    ) {

      return res.status(500).json({

        ok: false,

        error:
          "Failed to verify admin"

      });

    }


    const admins =
      await adminResponse.json();


    if (!admins.length) {

      return res.status(403).json({

        ok: false,

        error:
          "Admin access required"

      });

    }


    // ----------------------------------------------
    // ПРОВЕРЯЕМ ДАТЫ
    // ----------------------------------------------

    const start =
      new Date(
        startDate +
        "T00:00:00Z"
      );


    const end =
      new Date(
        endDate +
        "T23:59:59Z"
      );


    const accessEnd =
      new Date(
        accessEndDate +
        "T23:59:59Z"
      );


    if (
      Number.isNaN(
        start.getTime()
      ) ||
      Number.isNaN(
        end.getTime()
      ) ||
      Number.isNaN(
        accessEnd.getTime()
      )
    ) {

      return res.status(400).json({

        ok: false,

        error:
          "Некорректная дата"

      });

    }


    if (
      end < start
    ) {

      return res.status(400).json({

        ok: false,

        error:
          "Дата окончания не может быть раньше даты начала"

      });

    }


    if (
      accessEnd < end
    ) {

      return res.status(400).json({

        ok: false,

        error:
          "Дата окончания доступа не может быть раньше даты окончания потока"

      });

    }


    // ----------------------------------------------
    // СОЗДАЁМ ПОТОК
    // ----------------------------------------------

    const cohortResponse =
      await fetch(

        supabaseUrl +
        "/rest/v1/cohorts",

        {

          method:
            "POST",

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

          body:
            JSON.stringify({

              name:
                String(name).trim(),

              start_date:
                startDate,

              end_date:
                endDate,

              access_end_date:
                accessEndDate

            })

        }

      );


    if (
      !cohortResponse.ok
    ) {

      const errorText =
        await cohortResponse.text();


      console.error(
        "COHORT CREATE ERROR:",
        errorText
      );


     return res.status(500).json({
  error: error.message || "Не удалось создать поток",
  details: error
});

    }


    const cohorts =
      await cohortResponse.json();


    return res.status(200).json({

      ok: true,

      cohort:
        cohorts[0] || null

    });


  } catch (error) {

    console.error(
      "ADMIN COHORT CREATE ERROR:",
      error
    );


    return res.status(500).json({

      ok: false,

      error:
        "Internal server error"

    });

  }

};
