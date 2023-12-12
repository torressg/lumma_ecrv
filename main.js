const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const XLSX = require('xlsx');
require('dotenv').config({ path: './constants/.env' });

const Tab = require('./modules/Pup_modules/tab');
const Delay = require('./modules/Pup_modules/delay');
const DeathCaptcha = require('./modules/DeathByCaptcha/death');
const path = require('path');

function lerPrimeiraColunaDoExcel(caminhoArquivo) {
    const workbook = XLSX.readFile(caminhoArquivo);
    const sheetName = workbook.SheetNames[0]; // Assume que os dados estão na primeira aba
    const sheet = workbook.Sheets[sheetName];

    const dados = XLSX.utils.sheet_to_json(sheet, { header: 1 }); // Converte a aba em um array de arrays
    return dados.map(row => row[0]); // Retorna apenas a primeira coluna de cada linha
}

async function runAutomation() {

    const CPF = process.env.CPF
    const SENHA = process.env.SENHA
    const linkECRV = 'https://www.e-crvsp.sp.gov.br/'

    const dadosDaPrimeiraColuna = lerPrimeiraColunaDoExcel('./ECRV.xlsx');

    const browser = await puppeteer.launch({
        headless: false,
        protocolTimeout: 90000
    });

    const page = await browser.newPage();

    const cookiesString = await fs.readFile("./cookies.json");
    const cookies = JSON.parse(cookiesString);
    await page.setCookie(...cookies);

    await page.goto(linkECRV, { waitUntil: 'networkidle2' })

    // Seleciona o Frame da página
    const frameBody = page.frames().find(frame => frame.name() === 'body');

    // Caso o Frame esteja disponível
    if (frameBody) {

        // // Confima o aviso de Informação
        // await frameBody.waitForSelector('.modal-footer .btn-primary', { visible: true });
        // await frameBody.waitForSelector('#notificacoes > div > div > div.modal-footer > div > div.col-sm-4 > button')
        // await frameBody.evaluate(() => {
        //     document.querySelector('.modal-footer .btn-primary').click();
        // });
        // await Delay(4000)

        // // Digita acessos
        // await frameBody.waitForSelector('#cpf')
        // await frameBody.type('#cpf', CPF)
        // await frameBody.waitForSelector('#senha')
        // await frameBody.type('#senha', SENHA)
        // // Inicia um ouvinte de 'alert' para negar
        // page.on('dialog', async dialog => {
        //     await dialog.dismiss();
        // });
        // // Clica para acessar
        // await frameBody.evaluate(() => {
        //     document.querySelector('#conteudo > div.container.container-home > div > div.col-sm-3 > div > div.panel-body > button').click();
        // });
        // await Delay(2000)

        // // Confima o aviso de Informação
        // await frameBody.waitForSelector('#notificacoes > div > div > div.modal-footer > div > div.col-sm-4 > button')
        // await frameBody.evaluate(() => {
        //     document.querySelector('.modal-footer .btn-primary').click();
        // });

        // try {
        //     // Aguarde a aparição da div GB_window por um tempo máximo de 5000ms (5 segundos)
        //     await frameBody.waitForSelector('#GB_window', { timeout: 5000 });
        //     console.log('Já existe uma sessão aberta.');
        // } catch (error) {
        //     // Se a div GB_window não aparecer dentro do tempo limite, prossegue com o fluxo
        //     console.log('Não existe sessão aberta, pode prosseguir.');
        // }

        // // Clica ao botão "Autenticar"
        // await Tab(page, 13)
        // await page.keyboard.press('Enter')
        // await Delay(150000)

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

        let mensagemDialogo

        page.on('dialog', async dialog => {
            mensagemDialogo = dialog.message();
            await dialog.accept();
        });

        for (i = 1; i <= dadosDaPrimeiraColuna.length; i++) {
            let placa = dadosDaPrimeiraColuna[i]
            let captchaCorreto = false;

            await frameBody.waitForSelector('.campos_upper')

            while (!captchaCorreto) {
                // Insere a placa e tira um screenshot do captcha
                await frameBody.type('.campos_upper', placa);
                await page.screenshot({ path: './imageCaptcha/captcha.png', clip: { x: 230, y: 361, width: 225, height: 73 } });

                // Resolve o captcha e insere a resposta
                let captcha = await DeathCaptcha('./imageCaptcha/captcha.png');
                await frameBody.type('#captchaResponse', captcha);

                // Clica no botão de pesquisa
                await frameBody.evaluate(() => {
                    document.querySelector('.bt_pesquisar').click();
                });

                try {
                    // Espera pelo texto indicativo de sucesso, ajuste o tempo de espera conforme necessário
                    await frameBody.waitForFunction(
                        text => document.body.innerText.includes(text),
                        { timeout: 5000 }, // Tempo de espera antes de considerar falha no captcha
                        'DADOS DA FICHA CADASTRAL'
                    );
                    captchaCorreto = true; // Se o texto for encontrado, captcha está correto
                } catch (error) {
                    // Se o texto não for encontrado, o loop tentará novamente
                    if (mensagemDialogo.includes('PLACA')) {
                        console.log(`A placa ${placa} é inválida.`)
                        i++
                    } else if (mensagemDialogo.includes('IMAGE')) {
                        console.log("Captcha incorreto, tentando novamente...");

                    }
                    captchaCorreto = false;
                }
            }


            await frameBody.waitForSelector('.texto_menor')

            const dadosTabela = await frameBody.evaluate(() => {
                const dados = {};
                const fieldsets = document.querySelectorAll('fieldset');

                fieldsets.forEach(fieldset => {
                    const linhas = fieldset.querySelectorAll('table tr');

                    linhas.forEach(linha => {
                        const colunas = linha.querySelectorAll('td');
                        colunas.forEach((coluna, index) => {
                            // Verifica se a coluna atual contém uma chave
                            const chave = coluna.querySelector('.texto_black2')?.innerText.trim();
                            if (chave) {
                                // O valor corresponde à próxima célula
                                const valor = colunas[index + 1]?.querySelector('.texto_menor')?.innerText.trim();
                                if (valor) {
                                    dados[chave] = valor;
                                }
                            }
                        });
                    });
                });

                return dados;
            });

            console.log(dadosTabela);

            await frameBody.evaluate(() => {
                document.querySelector('#tabBotoes > tbody > tr > td > a.bt_voltar').click();
            });
        }


    } else {
        console.log("Frame 'body' não encontrado.");
    }

    // await browser.close()

}


runAutomation()