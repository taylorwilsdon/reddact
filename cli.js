#!/usr/bin/env node

const { program } = require('commander');
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

program
  .name('reddit-delete')
  .description('CLI to delete Reddit content with PII detection')
  .version('1.4.11')
  .requiredOption('-u, --username <username>', 'Reddit username')
  .option('-p, --profile <path>', 'Chrome user profile path')
  .option('--headless', 'Run in headless mode', false)
  .option('--endpoint <url>', 'LLM endpoint URL', 'http://localhost:11434/api/generate')
  .option('--model <name>', 'LLM model name', 'mistral')
  .option('--api-key <key>', 'API key for OpenAI-compatible endpoints');

program.parse();
const options = program.opts();

async function main() {
  const userDataDir = options.profile || path.join(process.env.HOME, '.config', 'reddit-delete');
  
  if (!fs.existsSync(userDataDir)) {
    fs.mkdirSync(userDataDir, { recursive: true });
  }

  const browser = await puppeteer.launch({
    headless: options.headless ? 'new' : false,
    userDataDir,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu'
    ],
    ignoreHTTPSErrors: true
  }).catch(error => {
    console.error('Failed to launch browser:', error.message);
    process.exit(1);
  });

  let page;
  try {
    page = await browser.newPage();
    await page.setDefaultNavigationTimeout(60000); // 60 second timeout
    
    // First ensure we're logged in
    await page.goto('https://old.reddit.com/login', {
      waitUntil: 'networkidle0'
    });
  
  // Wait for either login form or already logged in state
  await page.waitForSelector('#login-form, .user');
  
  const isLoggedIn = await page.$('.user') !== null;
  
  if (!isLoggedIn) {
    console.log('Please log in to Reddit in the opened browser window');
    await page.waitForSelector('.user', { timeout: 300000 }); // 5 min timeout for login
  }

  // Navigate to user overview
  await page.goto(`https://old.reddit.com/user/${options.username}/overview`);

  // Inject our scripts
  await page.addScriptTag({ path: path.join(__dirname, 'llm-service.js') });
  await page.addScriptTag({ path: path.join(__dirname, 'powerdeletesuite.js') });

  // Configure LLM settings based on CLI options
  await page.evaluate(({ endpoint, model, apiKey }) => {
    window.pd.llmService = new LLMService({
      endpoint,
      model,
      apiKey,
      isOllama: !apiKey
    });
  }, {
    endpoint: options.endpoint,
    model: options.model,
    apiKey: options.apiKey
  });

  // Keep browser open unless in headless mode
  if (!options.headless) {
    console.log('Browser window opened. Close it manually when done.');
    await new Promise(() => {}); // Keep process alive
  } else {
    await browser.close();
  }
}

main().catch(async error => {
  console.error('Fatal error:', error);
  try {
    if (global.browser) await global.browser.close();
  } catch (e) {
    console.error('Error while closing browser:', e);
  }
  process.exit(1);
});

// Handle process termination
process.on('SIGINT', async () => {
  console.log('\nGracefully shutting down...');
  try {
    if (global.browser) await global.browser.close();
  } catch (e) {
    console.error('Error while closing browser:', e);
  }
  process.exit(0);
});
