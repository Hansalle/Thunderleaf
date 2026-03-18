import { Hono } from 'hono';
import { cors } from 'hono/cors';

const app = new Hono();

app.use('*', cors());

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

async function scrapeStream(c, type, tmdb, season, episode) {
  const pageUrl = type === "movie"
    ? `https://vidlink.pro/movie/${tmdb}`
    : `https://vidlink.pro/tv/${tmdb}/${season}/${episode}`;

  const browser = await c.env.MYBROWSER;
  const page = await browser.newPage();

  await page.setUserAgent(UA);

  let finalStream = null;

  await page.setRequestInterception(true);

  page.on("request", (req) => {
    const url = req.url();
    const type = req.resourceType();

    if (["image", "stylesheet", "font", "js"].includes(type)) {
      return req.abort();
    }

    if (url.includes(".m3u8") && !url.includes("playlist")) {
      finalStream = url;
    }

    req.continue();
  });

  try {
    await page.goto(pageUrl, {
      waitUntil: "domcontentloaded",
      timeout: 15000
    });

    let attempts = 0;
    while (!finalStream && attempts < 10) {
      if (finalStream) break;
      await new Promise(r => setTimeout(r, 800));
      attempts++;
    }

  } catch (err) {
    console.error("Scrape Error:", err.message);
  } finally {
    await browser.close();
  }

  if (!finalStream) throw new Error("Stream extraction timed out or failed");

  return finalStream;
}

app.get("/movie/:tmdb", async (c) => {
  const start = Date.now();
  const tmdb = c.req.param('tmdb');
  try {
    const stream = await scrapeStream(c, "movie", tmdb);
    return c.json({ 
      success: true,
      stream, 
      type: "hls", 
      latency: `${Date.now() - start}ms` 
    });
  } catch (err) {
    return c.json({ success: false, error: err.message, latency: `${Date.now() - start}ms` }, 500);
  }
});

app.get("/tv/:tmdb/:season/:episode", async (c) => {
  const start = Date.now();
  const { tmdb, season, episode } = c.req.param();
  try {
    const stream = await scrapeStream(c, "tv", tmdb, season, episode);
    return c.json({ 
      success: true,
      stream, 
      type: "hls", 
      latency: `${Date.now() - start}ms` 
    });
  } catch (err) {
    return c.json({ success: false, error: err.message, latency: `${Date.now() - start}ms` }, 500);
  }
});

app.get("/", (c) => {
  return c.json({ 
    status: "Thunderleaf Operational",
    engine: "Cloudflare Puppeteer (Optimized)",
    info: {
      timestamp: new Date().toISOString()
    }
  });
});

export default app;
