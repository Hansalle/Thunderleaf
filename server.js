import { Hono } from 'hono';
import { cors } from 'hono/cors';
import puppeteer from '@cloudflare/puppeteer';

const app = new Hono();

app.use('*', cors());

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36";

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

    if (url.includes(".m3u8") && !url.includes("playlist")) {
      finalStream = url;
    }

    req.continue();
  });

  try {
    try {
      await page.goto(pageUrl, {
        waitUntil: "domcontentloaded",
        timeout: 10000
      });
    } catch (e) {
      if (!e.message.includes("frame was detached")) throw e;
    }

    await page.waitForSelector("iframe", { timeout: 10000 }).catch(() => {});

    let attempts = 0;

    while (!finalStream && attempts < 15) {
      await new Promise(r => setTimeout(r, 1000));
      attempts++;
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
    return c.json({ stream, type: "hls" });
  } catch (err) {
    return c.json({ error: "scrape failed", message: err.message }, 500);
  }
});

app.get("/tv/:tmdb/:season/:episode", async (c) => {
  const { tmdb, season, episode } = c.req.param();
  try {
    const stream = await scrapeStream(c, "tv", tmdb, season, episode);
    return c.json({ stream, type: "hls" });
  } catch (err) {
    return c.json({ error: "scrape failed", message: err.message }, 500);
  }
});

app.get("/", (c) => {
  return c.json({ 
    status: "Thunderleaf Running",
    info: {
      node_version: typeof process !== 'undefined' ? process.version : "workerd",
      timestamp: new Date().toISOString()
    }
  });
});
export default app
