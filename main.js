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

    await page.goto(linkECRV, { waitUntil: 'networkidle2' })

    const frameBody = page.frames().find(frame => frame.name() === 'body');

    if (frameBody) {

        await frameBody.waitForSelector('.modal-footer .btn-primary', { visible: true });
        await frameBody.waitForSelector('#notificacoes > div > div > div.modal-footer > div > div.col-sm-4 > button')
        await frameBody.evaluate(() => {
            document.querySelector('.modal-footer .btn-primary').click();
        });

    } else {
        console.log("Frame 'body' não encontrado.");
    }

    // await browser.close()

}

runAutomation()