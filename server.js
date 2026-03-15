const { express } = require("express");
const { puppeteer } = require("puppeteer");
const cors = require("cors");

const app = express();

app.use(cors());

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36";

async function scrapeStream(type, tmdb, season, episode) {
  const pageUrl =
    type === "movie"
      ? `https://vidlink.pro/movie/${tmdb}`
      : `https://vidlink.pro/tv/${tmdb}/${season}/${episode}`;

  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();
  await page.setUserAgent(UA);

  let stream = null;

  page.on("request", (req) => {
    const url = req.url();

    if (url.includes(".m3u8") && !url.includes("playlist")) {
      stream = url;
    }
  });

  page.on("response", (res) => {
    const url = res.url();

    if (url.includes(".m3u8") && !url.includes("playlist")) {
      stream = url;
    }
  });

  await page.goto(pageUrl, {
    waitUntil: "networkidle2",
    timeout: 60000,
  });

  await new Promise((r) => setTimeout(r, 8000));

  await browser.close();

  return stream;
}

app.get("/movie/:tmdb", async (req, res) => {
  try {
    const stream = await scrapeStream("movie", req.params.tmdb);

    res.json({
      stream,
      type: "hls",
    });
  } catch (e) {
    res.status(500).json({ error: "scrape failed" });
  }
});

app.get("/tv/:tmdb/:season/:episode", async (req, res) => {
  try {
    const { tmdb, season, episode } = req.params;

    const stream = await scrapeStream("tv", tmdb, season, episode);

    res.json({
      stream,
      type: "hls",
    });
  } catch (e) {
    res.status(500).json({ error: "scrape failed" });
  }
});

app.listen(3000, () => {
  console.log("scraper running on port 3000");
});
