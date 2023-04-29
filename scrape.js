import puppeteer from "puppeteer";
import { promises as fs } from "fs";

const mode = {
  moneycontrol: {
    url: "https://www.moneycontrol.com/mf/etf/",
    waitSelector: ".FL",
    hrefFilterPrefix: "https://www.moneycontrol.com/mutual-funds/nav/",
    outputFile: "moneycontrol.json",
  },
};

const env = mode.moneycontrol;

const initPup = async () => {
  return await puppeteer.launch({ headless: "new" });
};

const shutdownPup = async (browser) => {
  await browser?.close();
};

const createListOfAnchors = async (browser) => {
  const page = await browser.newPage();

  // Goto url
  await page.goto(env.url);

  // Wait for the table to populate
  await page.waitForSelector(env.waitSelector);

  // Fetch all anchor<a href="..."> Link </a> tags
  let anchors = await page.$$eval("a", (as) => {
    return as.map((a) => ({ title: a.textContent, href: a.href }));
  });

  // Weed out anchors that do not have prefix
  anchors = anchors.filter(
    (a) => a.title !== "" && a.href.startsWith(env.hrefFilterPrefix)
  );

  // Write to console and .json file
  console.table(anchors);
  fs.writeFile(env.outputFile, JSON.stringify(anchors, null, 4), (err) =>
    console.log(err ? err : "JSON saved to " + env.outputFile)
  );

  return anchors;
};

const sequentialScrapeEtf = async (browser, anchors) => {
  const failed = [];
  for (let anchor of anchors) {
    try {
      const page = await browser.newPage();
      await page.goto(anchor.href);

      const navDetailsSelector = ".navdetails";
      await page.waitForSelector(navDetailsSelector);

      const sel =
        "#mc_content > div > section.clearfix.section_one > div > div.common_left > div:nth-child(3) > div.right_section > div.top_section > table > tbody > tr:nth-child(1) > td:nth-child(2) > span.amt";
      const el = await page.waitForSelector(sel);
      const text = await el.evaluate((el) => el.textContent.trim());
      anchor["expenseRatio"] = parseFloat(text.replace("%", ""));
      console.log(`Resolved ${anchor["href"]}: ${anchor["expenseRatio"]}`);
      await page.close();
    } catch (err) {
      console.log(`Failed for ${anchor["title"]}`, err);
      failed.push(anchor["title"]);
    }
  }
  console.log("Failed for", failed.length, "items");
};

(async () => {
  const browser = await initPup();

  let anchors = await createListOfAnchors(browser);

  try {
    await sequentialScrapeEtf(browser, anchors);
    anchors = anchors.filter((anchor) => "expenseRatio" in anchor);
    anchors.sort((a, b) => a.expenseRatio - b.expenseRatio);
    fs.writeFile(
      "expense_ratio_" + env.outputFile,
      JSON.stringify(anchors, null, 4),
      (err) => console.log(err ? err : "JSON saved to " + env.outputFile)
    );
  } catch (err) {
    console.error(err);
  } finally {
    await shutdownPup(browser);
  }
})();
