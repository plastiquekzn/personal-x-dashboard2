import serverlessChromium from "@sparticuz/chromium";
import { chromium } from "playwright-core";

type CapturedTweet = {
  screenshotBuffer: Buffer;
  width: number;
  height: number;
};

export async function captureTweetFromUrl(tweetUrl: string): Promise<CapturedTweet> {
  const browser = await chromium.launch({
    args: serverlessChromium.args,
    executablePath: await serverlessChromium.executablePath(),
    headless: true
  });

  const page = await browser.newPage({
    viewport: { width: 1440, height: 2200 },
    colorScheme: "dark"
  });

  try {
    await page.goto(tweetUrl, {
      waitUntil: "domcontentloaded",
      timeout: 45000
    });

    await page.waitForTimeout(2500);

    const article = page.locator('article[data-testid="tweet"]').first();
    await article.waitFor({ state: "visible", timeout: 20000 });

    const showMore = article.getByText("Show more");
    if (await showMore.count()) {
      try {
        await showMore.first().click({ timeout: 2000 });
        await page.waitForTimeout(600);
      } catch {
        // Ignore if the text is already expanded or not clickable.
      }
    }

    const box = await article.boundingBox();

    if (!box) {
      throw new Error("Could not measure the tweet block on the page.");
    }

    const screenshotBuffer = await article.screenshot({
      type: "png",
      animations: "disabled"
    });

    return {
      screenshotBuffer,
      width: Math.round(box.width),
      height: Math.round(box.height)
    };
  } finally {
    await page.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
  }
}
