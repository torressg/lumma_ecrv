const puppeteer = require('puppeteer');
const fs = require('fs');

require('dotenv').config({ path: './constants/.env' });

const Tab = require('./modules/Pup_modules/tab');
const Delay = require('./modules/Pup_modules/delay');
const DeathCaptcha = require('./modules/DeathByCaptcha/death');

async function runAutomation() {

    const CPF = process.env.CPF
    const SENHA = process.env.SENHA
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
        await Delay(4000)
        await frameBody.waitForSelector('#cpf')
        await frameBody.type('#cpf', CPF)
        await frameBody.waitForSelector('#senha')
        await frameBody.type('#senha', SENHA)

        page.on('dialog', async dialog => {
            await dialog.dismiss();
        });
        await frameBody.evaluate(() => {
            document.querySelector('#conteudo > div.container.container-home > div > div.col-sm-3 > div > div.panel-body > button').click();
        });
        await Delay(2000)
        await frameBody.waitForSelector('#notificacoes > div > div > div.modal-footer > div > div.col-sm-4 > button')
        await frameBody.evaluate(() => {
            document.querySelector('.modal-footer .btn-primary').click();
        });

        await Tab(page, 13)
        await page.keyboard.press('Enter')
        await Delay(5000)
        await frameBody.evaluate(() => {
            Array.from(document.querySelectorAll('.list-group-item a.dropdown-toggle')).find(el => el.textContent.includes('Processos')).click();
        });
        await Delay(1000)
        await frameBody.waitForFunction(
            text => document.body.innerText.includes(text),
            {},
            'Consultar Ficha Cadastral'
        );

        await frameBody.evaluate(() => {
            Array.from(document.querySelectorAll('.list-group-item-sub.dropdown a')).find(el => el.textContent.includes('Consultar Ficha Cadastral')).click();
        });
        await frameBody.waitForFunction(
            text => document.body.innerText.includes(text),
            {},
            'Placa'
        );

        await frameBody.type('.campos_upper', 'LMP0H66')


    } else {
        console.log("Frame 'body' não encontrado.");
    }

    // await browser.close()

}

runAutomation()