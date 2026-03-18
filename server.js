import { Hono } from 'hono';
import { cors } from 'hono/cors';
import puppeteer from '@cloudflare/puppeteer';

const app = new Hono();
app.use('*', cors());

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36";
const MAX_ATTEMPTS = 15;
const WAIT_INTERVAL = 3000;
const PAGE_TIMEOUT = 10000;

async function scrapeStream(c, type, tmdb, season, episode) {
  const pageUrl = type === "movie"
    ? `https://vidlink.pro/movie/${tmdb}`
    : `https://vidlink.pro/tv/${tmdb}/${season}/${episode}`;

  const browser = await puppeteer.launch(c.env.MYBROWSER);
  const page = await browser.newPage();
  await page.setUserAgent(UA);
  let finalStream = null;

  await page.setRequestInterception(true);

  page.on("request", (req) => {
    const url = req.url();
    const resourceType = req.resourceType();

    if (["image", "stylesheet", "font", "media"].includes(resourceType) || url.includes("analytics")) {
      return req.abort();
    }

    if (/\.m3u8/i.test(url) && !url.includes("playlist")) {
      finalStream = url;
    }

    req.continue();
  });

  try {
    try {
      await page.goto(pageUrl, { waitUntil: "domcontentloaded", timeout: PAGE_TIMEOUT });
    } catch (e) {
      if (!e.message.includes("frame was detached")) throw e;
    }

    await page.waitForSelector("iframe", { timeout: PAGE_TIMEOUT }).catch(() => {});

    for (let attempt = 0; attempt < MAX_ATTEMPTS && !finalStream; attempt++) {
      await new Promise(r => setTimeout(r, WAIT_INTERVAL));
    }

  } finally {
    await browser.close();
  }

  if (!finalStream) throw new Error("Stream not found");

  return finalStream;
}

app.get("/movie/:tmdb", async (c) => {
  const tmdb = c.req.param('tmdb');
  try {
    const stream = await scrapeStream(c, "movie", tmdb);
    return c.json({ success: true, stream, type: "hls" });
  } catch (err) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

app.get("/tv/:tmdb/:season/:episode", async (c) => {
  const { tmdb, season, episode } = c.req.param();
  try {
    const stream = await scrapeStream(c, "tv", tmdb, season, episode);
    return c.json({ success: true, stream, type: "hls" });
  } catch (err) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

app.get("/", (c) => {
  return c.json({
    status: "Thunderleaf Operational",
    engine: "Cloudflare Puppeteer (Optimized v2)",
    info: {
      node_version: typeof process !== 'undefined' ? process.version : "workerd",
      timestamp: new Date().toISOString()
    }
  });
});

export default app;