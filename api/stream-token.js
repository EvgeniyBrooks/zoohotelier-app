export default async function handler(req, res) {
  try {
    const videoId = req.query.videoId;

    if (!videoId) {
      return res.status(400).json({ error: "videoId is required" });
    }

    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/stream/${videoId}/token`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,
          "Content-Type": "application/json"
        }
      }
    );

    const data = await response.json();

    if (!response.ok || !data.success) {
      return res.status(500).json({
        error: "Cloudflare token error",
        details: data
      });
    }

    return res.status(200).json({
      token: data.result.token
    });

  } catch (error) {
    return res.status(500).json({
      error: "Server error"
    });
  }
}
