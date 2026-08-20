const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();

  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log('CONSOLE ERROR:', msg.text());
    }
  });
  
  page.on('pageerror', err => {
    console.log('PAGE ERROR:', err.toString());
  });

  try {
    const response = await page.goto('http://localhost:5173/', { waitUntil: 'networkidle0', timeout: 5000 });
    console.log('STATUS:', response.status());
    
    // Check if the root element is empty
    const rootHtml = await page.$eval('#root', el => el.innerHTML);
    if (!rootHtml || rootHtml.trim() === '') {
      console.log('WARNING: #root element is empty! React failed to mount.');
    } else {
      console.log('SUCCESS: #root element has content.');
    }
  } catch (error) {
    console.error('NAVIGATION ERROR:', error.message);
  } finally {
    await browser.close();
  }
})();
