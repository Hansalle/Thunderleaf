const express = require("express");
const puppeteer = require("puppeteer");
const cors = require("cors");

const app = express();

app.use(cors());

const PORT = 3000;

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36";

/* GLOBAL ERROR LOGGING */

process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT EXCEPTION:", err);
});

process.on("unhandledRejection", (err) => {
  console.error("UNHANDLED REJECTION:", err);
});

/* SCRAPER */

async function scrapeStream(type, tmdb, season, episode) {
  const pageUrl =
    type === "movie"
      ? `https://vidlink.pro/movie/${tmdb}`
      : `https://vidlink.pro/tv/${tmdb}/${season}/${episode}`;

  console.log("Opening:", pageUrl);

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();

  await page.setUserAgent(UA);

  let resolveStream;
  const streamPromise = new Promise((resolve) => {
    resolveStream = resolve;
  });

  /* PAGE DEBUG */

  page.on("console", (msg) => {
    console.log("PAGE LOG:", msg.text());
  });

  page.on("pageerror", (err) => {
    console.error("PAGE ERROR:", err);
  });

  page.on("requestfailed", (req) => {
    console.error("REQUEST FAILED:", req.url(), req.failure()?.errorText);
  });

  /* NETWORK INTERCEPT */

  page.on("request", (req) => {
    const url = req.url();

    if (url.includes("videostr")) {
      console.log("VIDEOSTR REQUEST:", url);
    }

    if (url.includes(".m3u8")) {
      console.log("M3U8 REQUEST:", url);

      if (!url.includes("playlist")) {
        console.log("FINAL STREAM FOUND:", url);
        resolveStream(url);
      }
    }
  });

  page.on("response", (res) => {
    const url = res.url();

    if (url.includes(".m3u8") && !url.includes("playlist")) {
      console.log("M3U8 RESPONSE:", url);
      resolveStream(url);
    }
  });

  await page.goto(pageUrl, {
    waitUntil: "networkidle2",
    timeout: 60000,
  });

  /* wait max 15 seconds */

  let stream;

  try {
    stream = await Promise.race([
      streamPromise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Stream timeout")), 15000)
      ),
    ]);
  } catch (err) {
    console.error("STREAM ERROR:", err);
  }

  await browser.close();

  if (!stream) {
    throw new Error("Stream not found");
  }

  console.log("STREAM CAPTURED:", stream);

  return stream;
}

/* ROUTES */

app.get("/movie/:tmdb", async (req, res) => {
  try {
    console.log("MOVIE REQUEST:", req.params.tmdb);

    const stream = await scrapeStream("movie", req.params.tmdb);

    res.json({
      stream,
      type: "hls",
    });
  } catch (err) {
    console.error("MOVIE ROUTE ERROR:", err);

    res.status(500).json({
      error: "scrape failed",
      message: err.message,
    });
  }
});

app.get("/tv/:tmdb/:season/:episode", async (req, res) => {
  try {
    const { tmdb, season, episode } = req.params;

    console.log("TV REQUEST:", tmdb, season, episode);

    const stream = await scrapeStream("tv", tmdb, season, episode);

    res.json({
      stream,
      type: "hls",
    });
  } catch (err) {
    console.error("TV ROUTE ERROR:", err);

    res.status(500).json({
      error: "scrape failed",
      message: err.message,
    });
  }
});

/* HEALTH */

app.get("/", (req, res) => {
  res.json({
    status: "Thunderleaf scraper running",
    node: process.version,
  });
});

/* UNKNOWN ROUTE */

app.use((req, res) => {
  console.warn("UNKNOWN ROUTE:", req.method, req.url);

  res.status(404).json({
    error: "Unknown endpoint",
  });
});

/* START */

app.listen(PORT, () => {
  console.log(`Thunderleaf scraper running on port ${PORT}`);
});