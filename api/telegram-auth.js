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

    const user = JSON.parse(
      params.get("user") || "{}"
    );

    if (!user.id) {
      return res.status(400).json({
        error: "Telegram user not found"
      });
    }

    // Создаём или обновляем студента в Supabase

    const supabaseResponse = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/students?on_conflict=telegram_id`,
      {
        method: "POST",

        headers: {
          "apikey": process.env.SUPABASE_SERVICE_ROLE_KEY,
          "Authorization":
            `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
          "Prefer": "resolution=merge-duplicates,return=representation"
        },

        body: JSON.stringify({
          telegram_id: user.id,
          first_name: user.first_name || null,
          last_name: user.last_name || null,
          username: user.username || null
        })
      }
    );

    const supabaseData = await supabaseResponse.json();
    console.log("SUPABASE STUDENT RESPONSE:", {
  status: supabaseResponse.status,
  ok: supabaseResponse.ok,
  data: supabaseData
});

 if (!supabaseResponse.ok) {
  console.error(
    "Supabase student error:",
    supabaseData
  );

  return res.status(500).json({
    error: "Failed to save student",
    details: supabaseData
  });
}

    cconst student = Array.isArray(supabaseData)
  ? supabaseData[0]
  : supabaseData;

if (!student || !student.id) {
  return res.status(500).json({
    error: "Student was not created"
  });
}


// Проверяем, есть ли у студента активное обучение

const enrollmentResponse = await fetch(
  `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/enrollments` +
  `?select=id,status,course_id,cohort_id,access_start_date,access_end_date` +
  `&student_id=eq.${encodeURIComponent(student.id)}` +
  `&status=eq.active` +
  `&limit=10`,
  {
    headers: {
      "apikey": process.env.SUPABASE_SERVICE_ROLE_KEY,
      "Authorization":
        `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
    }
  }
);

const enrollmentData = await enrollmentResponse.json();

if (!enrollmentResponse.ok) {
  console.error(
    "Supabase enrollment error:",
    enrollmentData
  );

  return res.status(500).json({
    error: "Failed to check enrollment",
    details: enrollmentData
  });
}

  return res.status(500).json({
    error: "Failed to check enrollment",
    details: enrollmentData
  });
}


// Проверяем даты доступа

const now = new Date();

const activeEnrollment = enrollmentData.find((enrollment) => {

  const start = enrollment.access_start_date
    ? new Date(enrollment.access_start_date)
    : null;

  const end = enrollment.access_end_date
    ? new Date(enrollment.access_end_date)
    : null;

  const startOk = !start || start <= now;
  const endOk = !end || end >= now;

  return startOk && endOk;
});


return res.status(200).json({

  ok: true,

  user: {
    id: user.id,
    first_name: user.first_name,
    last_name: user.last_name,
    username: user.username
  },

  student: {
    id: student.id
  },

  access: {
    hasAccess: Boolean(activeEnrollment),

    enrollment: activeEnrollment || null
  }

});
