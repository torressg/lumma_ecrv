const puppeteer = require('puppeteer');
require('dotenv').config({ path: './constants/.env' });

const Tab = require('./modules/Pup_modules/tab');
const Delay = require('./modules/Pup_modules/delay');

async function runAutomation() {

    const linkECRV = 'https://www.e-crvsp.sp.gov.br/'

    const browser = await puppeteer.launch({
        headless: false,
        protocolTimeout: 90000
    });

    const page = await browser.newPage();

    await page.goto(linkECRV)



    // await browser.close()

}

runAutomation()